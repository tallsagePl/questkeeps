'use client';

import { useLocale } from '@/components/appearance';
import { translateCurrent } from '@/lib/i18n/translate';
const t = translateCurrent;
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
type Fields = Record<string, string>;
type Failure = {
  scope: string;
  message: string;
  fields: Fields;
};
export class ApiError extends Error {
  constructor(
    message: string,
    public fields: Fields = {},
    public status?: number,
  ) {
    super(message);
  }
}
type Feedback = {
  active: React.RefObject<string>;
  failure: Failure | null;
  clear: () => void;
  report: (error: unknown, scope: string) => void;
  setError: (message: string) => void;
  setNotice: (message: string) => void;
  notice: {
    scope: string;
    message: string;
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
  const { t } = useLocale();
  const active = useRef('page');
  const [failure, setFailure] = useState<Failure | null>(null);
  const [notice, setNoticeState] = useState<{
    scope: string;
    message: string;
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
        error instanceof Error
          ? error.message
          : t('Не удалось выполнить действие'),
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
          message ? report(new Error(message), active.current) : clear(),
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
  const { t } = useLocale();
  const { failure } = useFeedback();
  return failure?.scope === 'page' ? (
    <p role="alert" className="action-feedback">
      {t(failure.message)}
    </p>
  ) : null;
}
export function FeedbackButton({
  onClick,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  const { t } = useLocale();
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
          {t(feedback.failure.message)}
        </p>
      )}
      {feedback.notice?.scope === id && (
        <span className="action-status" role="status">
          {t(feedback.notice.message)}
        </span>
      )}
    </>
  );
}
function fieldValidation(
  input: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
) {
  if (input.disabled || !input.name) return '';
  if (input.required && !input.value.trim()) return t('Заполните это поле');
  if (input instanceof HTMLInputElement) {
    if (input.type === 'email' && input.validity.typeMismatch)
      return t('Введите email в формате name@example.com');
    if (
      input.minLength > 0 &&
      input.value &&
      input.value.length < input.minLength
    )
      return t('Минимум ') + input.minLength + t(' символов');
    if (input.validity.rangeUnderflow)
      return input.type === 'date'
        ? t('Дата должна быть не раньше ') + input.min
        : t('Минимальное значение — ') + input.min;
    if (input.validity.rangeOverflow)
      return input.type === 'date'
        ? t('Дата должна быть не позже ') + input.max
        : t('Максимальное значение — ') + input.max;
    if (input.validity.badInput) return t('Введите корректное значение');
  }
  return input.validity.valid ? '' : t('Проверьте значение поля');
}
export function FeedbackForm({
  children,
  onSubmit,
  onChange,
  ...props
}: FormHTMLAttributes<HTMLFormElement>) {
  const { t } = useLocale();
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
              {t(message)}
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
            errors.end = t('Дата окончания должна быть не раньше начала');
          if (Object.keys(errors).length) {
            event.preventDefault();
            feedback.report(
              new ApiError(t('Проверьте поля формы'), errors),
              id,
            );
            return;
          }
          onSubmit?.(event);
        }}
      >
        {decorate(children)}
        {feedback.failure?.scope === id && !Object.keys(fields).length && (
          <p className="form-error" role="alert">
            {t(feedback.failure.message)}
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
  const { t } = useLocale();
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
            aria-label={t(shown ? 'Скрыть пароль' : 'Показать пароль')}
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
          {typeof hint === 'string' ? t(hint) : hint}
        </small>
      )}
      {message && (
        <span id={errorId} className="field-error" role="alert">
          {t(message)}
        </span>
      )}
    </label>
  );
}
