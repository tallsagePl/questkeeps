'use client';

import { registrationPasswordPattern } from '../../lib/password-policy';
import { useLocale } from '@/components/appearance';
import { api } from '../api';
import { FeedbackForm, FeedbackButton, Field } from '../feedback';
import { type ArchiveController } from './use-archive';
import { Icon } from './shared';

export default function AuthForm({ archive }: { archive: ArchiveController }) {
  const { t } = useLocale();
  const {
    verificationEmail,
    busy,
    yandex,
    register,
    setRegister,
    setNotice,
    action,
    auth,
    invite,
  } = archive;

  return (
    <>
      <FeedbackForm
        key={register ? 'register' : 'login'}
        onSubmit={auth}
        className="stack"
      >
        {verificationEmail && (
          <div className="verification-pending" role="status">
            <p>{t('trip.verifyYourEmailUsingTheLinkIn')}</p>
            <FeedbackButton
              type="button"
              className="text-button"
              disabled={busy}
              onClick={() =>
                void action(async () => {
                  const result = await api('auth/resend-verification', 'POST', {
                    email: verificationEmail,
                  });
                  setNotice(result.message);
                })
              }
            >
              {t('trip.resendVerificationEmail')}
            </FeedbackButton>
          </div>
        )}
        {register && (
          <Field
            label={t('trip.yourName')}
            name="name"
            required
            maxLength={80}
            autoComplete="name"
          />
        )}
        <Field
          label={t(register ? 'auth.email' : 'auth.identifier')}
          name="email"
          type={register ? 'email' : 'text'}
          autoComplete={register ? 'email' : 'username'}
          maxLength={254}
          autoCapitalize="none"
          spellCheck={false}
          required
        />
        <Field
          label={t('auth.password')}
          name="password"
          type="password"
          minLength={register ? 6 : undefined}
          maxLength={register ? 72 : 128}
          pattern={register ? registrationPasswordPattern : undefined}
          hint={
            register
              ? t('trip.672CharactersUppercaseAndLowercaseLatin')
              : undefined
          }
          autoComplete={register ? 'new-password' : 'current-password'}
          required
        />
        {register && (
          <Field
            label={t('trip.repeatPassword')}
            name="passwordConfirmation"
            type="password"
            autoComplete="new-password"
            maxLength={72}
            required
          />
        )}
        <FeedbackButton className="primary" disabled={busy}>
          {busy
            ? t('common.pleaseWait')
            : register
              ? t('trip.createAccount')
              : t('auth.signIn')}
          <Icon name="arrow" />
        </FeedbackButton>
        <FeedbackButton
          className="text-button"
          type="button"
          onClick={() => setRegister(!register)}
        >
          {register
            ? t('trip.alreadyHaveAnAccountSignIn')
            : t('trip.newHereCreateAnAccount')}
        </FeedbackButton>
        {yandex && (
          <a
            className="secondary centered"
            href={
              '/api/auth/yandex?returnTo=' +
              encodeURIComponent(invite ? '/join/' + invite : '/')
            }
          >
            {t('trip.signInWithYandexId')}
          </a>
        )}
      </FeedbackForm>
    </>
  );
}
