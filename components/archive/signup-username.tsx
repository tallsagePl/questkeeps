'use client';

import {
  normalizeUsername,
  usernameMaxLength,
  usernamePattern,
} from '@/lib/username';
import type { UserProfile } from '@/lib/contracts';
import { api } from '../api';
import { useLocale } from '../appearance';
import { FeedbackButton, FeedbackForm, Field } from '../feedback';
import Modal from '../modal';
import { values } from './shared';
import type { ArchiveController } from './use-archive';

export function validateUsernameField(
  input: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
) {
  if (input.name !== 'username') return;
  if (!input.required && !input.value.trim()) return '';
  return usernamePattern.test(normalizeUsername(input.value))
    ? ''
    : 'auth.usernameFormat';
}

export function SignupUsernameField({
  defaultUsername,
}: {
  defaultUsername?: string;
}) {
  const { t } = useLocale();
  return (
    <Field
      name="username"
      label={t(
        defaultUsername === undefined
          ? 'auth.usernameOptional'
          : 'auth.username',
      )}
      hint={t(
        defaultUsername === undefined
          ? 'auth.usernameOptionalHint'
          : 'auth.usernameFormat',
      )}
      placeholder="@traveller"
      defaultValue={
        defaultUsername === undefined ? undefined : '@' + defaultUsername
      }
      required={defaultUsername !== undefined}
      maxLength={usernameMaxLength + 1}
      autoCapitalize="none"
      spellCheck={false}
      autoComplete="username"
    />
  );
}

export default function SignupUsernameDialog({
  archive,
}: {
  archive: ArchiveController;
}) {
  const { t } = useLocale();
  const { user, busy, action, finishSignupUsername } = archive;
  if (!user) return null;

  const skip = () => {
    if (!busy) finishSignupUsername();
  };
  return (
    <Modal title={t('auth.chooseUsername')} onClose={skip}>
      <FeedbackForm
        className="stack"
        validateField={validateUsernameField}
        onSubmit={(event) => {
          const input = values(event);
          void action(async () => {
            const { user: updated } = await api<{ user: UserProfile }>(
              'me',
              'PATCH',
              {
                username: input.username,
              },
            );
            finishSignupUsername(updated);
          });
        }}
      >
        <SignupUsernameField defaultUsername={user.username} />
        <FeedbackButton className="primary" disabled={busy}>
          {t('common.save')}
        </FeedbackButton>
        <FeedbackButton
          type="button"
          className="text-button"
          onClick={skip}
          disabled={busy}
        >
          {t('auth.skipUsername')}
        </FeedbackButton>
      </FeedbackForm>
    </Modal>
  );
}
