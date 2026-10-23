'use client';

import { useLocale } from '@/components/appearance';

import {
  createContext,
  useContext,
  useState,
  useRef,
  useId,
  useEffect,
  Children,
  isValidElement,
  cloneElement,
  ReactNode,
  ReactElement,
  FormHTMLAttributes,
  ButtonHTMLAttributes,
  InputHTMLAttributes,
} from 'react';
import { localizeMessage, type LocalizedMessage } from '@/lib/i18n/translate';

type Fields = Record<string, string | LocalizedMessage>;

type Failure = {
  scope: string;
  message: string | LocalizedMessage;
  fields: Fields;
};

export class ApiError extends Error {
  constructor(
    public applicationMessage: string | LocalizedMessage,
    public fields: Fields = {},
    public status?: number,
  ) {
    super(
      typeof applicationMessage === 'string'
        ? applicationMessage
        : applicationMessage.params
          ? localizeMessage(applicationMessage, 'ru')
          : applicationMessage.key,
    );
  }
}

type Feedback = {
  active: React.RefObject<string>;
  failure: Failure | null;
  clear: () => void;
  report: (error: unknown, scope: string) => void;
  setError: (message: string | LocalizedMessage) => void;
  setNotice: (message: string | LocalizedMessage) => void;
  notice: {
    scope: string;
    message: string | LocalizedMessage;
  } | null;
  setFailure: React.Dispatch<React.SetStateAction<Failure | null>>;
};

const FeedbackContext = createContext<Feedback | null>(null);

const FormContext = createContext<{
  fields: Fields;
  scope: string;
}>({
  fields: {},
  scope: '',
});

export function useFeedback() {
  const value = useContext(FeedbackContext);
  if (!value) throw new Error('Missing FeedbackProvider');
  return value;
}

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const active = useRef('page');
  const [failure, setFailure] = useState<Failure | null>(null);
  const [notice, setNoticeState] = useState<{
    scope: string;
    message: string | LocalizedMessage;
  } | null>(null);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNoticeState(null), 5000);
    return () => clearTimeout(timer);
  }, [notice]);
  const clear = () => setFailure(null);
  const report = (error: unknown, scope: string) => {
    const fields = error instanceof ApiError ? error.fields : {};
    setFailure({
      scope,
      message:
        error instanceof ApiError
          ? error.applicationMessage
          : error instanceof Error
            ? error.message
            : 'validation.theActionCouldNotBeCompleted',
      fields,
    });
    if (Object.keys(fields).length)
      requestAnimationFrame(() => {
        const form = document.getElementById(scope);
        form
          ?.querySelector<HTMLElement>(
            '[name="' + CSS.escape(Object.keys(fields)[0]) + '"]',
          )
          ?.focus();
      });
  };
  return (
    <FeedbackContext.Provider
      value={{
        active,
        failure,
        clear,
        report,
        setFailure,
        setError: (message) =>
          message ? report(new ApiError(message), active.current) : clear(),
        setNotice: (message) =>
          setNoticeState({
            scope: active.current,
            message,
          }),
        notice,
      }}
    >
      {children}
    </FeedbackContext.Provider>
  );
}

export function PageFeedback() {
  const { m } = useLocale();
  const { failure } = useFeedback();
  return failure?.scope === 'page' ? (
    <p role="alert" className="action-feedback">
      {m(failure.message)}
    </p>
  ) : null;
}

export function FeedbackButton({
  onClick,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  const { m } = useLocale();
  const id = useId();
  const feedback = useFeedback();
  return (
    <>
      <button
        {...props}
        onClick={(event) => {
          feedback.active.current = id;
          onClick?.(event);
        }}
      >
        {children}
      </button>
      {feedback.failure?.scope === id && (
        <p className="action-feedback" role="alert">
          {m(feedback.failure.message)}
        </p>
      )}
      {feedback.notice?.scope === id && (
        <span className="action-status" role="status">
          {m(feedback.notice.message)}
        </span>
      )}
    </>
  );
}

function fieldValidation(
  input: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
): string | LocalizedMessage {
  if (input.disabled || !input.name) return '';
  if (input.required && !input.value.trim())
    return 'validation.fillInThisField';
  if (input instanceof HTMLInputElement) {
    if (input.type === 'email' && input.validity.typeMismatch)
      return 'validation.enterAnEmailSuchAsNameExample';
    if (
      input.minLength > 0 &&
      input.value &&
      input.value.length < input.minLength
    )
      return {
        key: 'validation.minLength',
        params: { count: input.minLength },
      } as const;
    if (input.validity.rangeUnderflow)
      return input.type === 'date'
        ? ({ key: 'validation.minDate', params: { date: input.min } } as const)
        : ({
            key: 'validation.minValue',
            params: { value: input.min },
          } as const);
    if (input.validity.rangeOverflow)
      return input.type === 'date'
        ? ({ key: 'validation.maxDate', params: { date: input.max } } as const)
        : ({
            key: 'validation.maxValue',
            params: { value: input.max },
          } as const);
    if (input.validity.badInput) return 'validation.enterAValidValue';
  }
  return input.validity.valid ? '' : 'validation.checkThisValue';
}

export function FeedbackForm({
  children,
  onSubmit,
  onChange,
  ...props
}: FormHTMLAttributes<HTMLFormElement>) {
  const { m } = useLocale();
  const id = useId();
  const feedback = useFeedback();
  const fields = feedback.failure?.scope === id ? feedback.failure.fields : {};
  function decorate(nodes: ReactNode): ReactNode {
    return Children.map(nodes, (node) => {
      if (!isValidElement(node)) return node;
      const element = node as ReactElement<any>;
      const p = element.props;
      let content = decorate(p.children);
      if (
        element.type === 'label' &&
        p.className?.split(' ').includes('field')
      ) {
        const control = Children.toArray(p.children).find(
          (child) =>
            isValidElement(child) &&
            ['input', 'textarea', 'select'].includes(String(child.type)),
        ) as ReactElement<any> | undefined;
        const name = control?.props.name;
        const message = fields[name];
        if (control && message) {
          const errorId = id + '-' + name + '-error';
          content = Children.map(p.children, (child) =>
            isValidElement(child) &&
            child.type === control.type &&
            (child as ReactElement<any>).props.name === name
              ? cloneElement(control, {
                  'aria-invalid': true,
                  'aria-describedby': errorId,
                })
              : child,
          );
          return cloneElement(
            element,
            {
              className: p.className + ' field-invalid',
            },
            content,
            <span id={errorId} className="field-error" role="alert">
              {m(message)}
            </span>,
          );
        }
      }
      return p.children === undefined
        ? node
        : cloneElement(element, {}, content);
    });
  }
  return (
    <FormContext.Provider
      value={{
        fields,
        scope: id,
      }}
    >
      <form
        {...props}
        id={id}
        noValidate
        onChange={(event) => {
          const target = event.target as unknown;
          const name =
            target instanceof HTMLInputElement ||
            target instanceof HTMLTextAreaElement ||
            target instanceof HTMLSelectElement
              ? target.name
              : '';
          if (feedback.failure?.scope === id) {
            feedback.setFailure((previous) => {
              if (!previous || previous.scope !== id) return previous;
              const next = {
                ...previous.fields,
              };
              delete next[name];
              return Object.keys(next).length
                ? {
                    ...previous,
                    fields: next,
                  }
                : null;
            });
          }
          onChange?.(event);
        }}
        onSubmit={(event) => {
          feedback.active.current = id;
          feedback.clear();
          const form = event.currentTarget;
          const errors: Fields = {};
          for (const control of Array.from(form.elements)) {
            if (
              control instanceof HTMLInputElement ||
              control instanceof HTMLSelectElement ||
              control instanceof HTMLTextAreaElement
            ) {
              const message = fieldValidation(control);
              if (message) errors[control.name] = message;
            }
          }
          const start = form.elements.namedItem(
            'start',
          ) as HTMLInputElement | null;
          const end = form.elements.namedItem('end') as HTMLInputElement | null;
          if (start?.value && end?.value && start.value > end.value)
            errors.end = 'validation.endDateMustNotBeEarlierThan';
          if (Object.keys(errors).length) {
            event.preventDefault();
            feedback.report(new ApiError('validation.checkFields', errors), id);
            return;
          }
          onSubmit?.(event);
        }}
      >
        {decorate(children)}
        {feedback.failure?.scope === id && !Object.keys(fields).length && (
          <p className="form-error" role="alert">
            {m(feedback.failure.message)}
          </p>
        )}
      </form>
    </FormContext.Provider>
  );
}

export function Field({
  label,
  hint,
  ...props
}: {
  label: string;
  hint?: ReactNode;
} & InputHTMLAttributes<HTMLInputElement>) {
  const { t, m } = useLocale();
  const id = useId();
  const [shown, setShown] = useState(false);
  const password = props.type === 'password';
  const { fields } = useContext(FormContext);
  const message = fields[props.name || ''];
  const errorId = id + '-error';
  const hintId = id + '-hint';
  return (
    <label className={'field' + (message ? ' field-invalid' : '')} htmlFor={id}>
      <span id={id + '-label'}>{label}</span>
      {password ? (
        <span className="password-control">
          <input
            {...props}
            type={password && shown ? 'text' : props.type}
            id={id}
            aria-labelledby={id + '-label'}
            aria-invalid={message ? true : undefined}
            aria-describedby={
              message ? errorId : hint ? hintId : props['aria-describedby']
            }
          />
          <button
            type="button"
            className="password-toggle"
            aria-label={t(
              shown ? 'validation.hidePassword' : 'validation.showPassword',
            )}
            aria-pressed={shown}
            aria-controls={id}
            onClick={(event) => {
              event.preventDefault();
              setShown((value) => !value);
            }}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
              <circle cx="12" cy="12" r="3" />
              {shown && <path d="m3 3 18 18" />}
            </svg>
          </button>
        </span>
      ) : (
        <input
          {...props}
          type={password && shown ? 'text' : props.type}
          id={id}
          aria-labelledby={id + '-label'}
          aria-invalid={message ? true : undefined}
          aria-describedby={
            message ? errorId : hint ? hintId : props['aria-describedby']
          }
        />
      )}
      {hint && !message && (
        <small id={hintId} className="field-hint">
          {typeof hint === 'string' ? m(hint) : hint}
        </small>
      )}
      {message && (
        <span id={errorId} className="field-error" role="alert">
          {m(message)}
        </span>
      )}
    </label>
  );
}
