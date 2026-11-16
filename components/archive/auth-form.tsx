'use client';

import {
  registrationPasswordErrors,
  registrationPasswordMaxLength,
  registrationPasswordMinLength,
  registrationPasswordPattern,
} from '../../lib/password-policy';
import {
  createTripEntry,
  createTripResetEntry,
  createTripSignInEntry,
} from '../../lib/trip-entry';
import { useLocale } from '@/components/appearance';
import { api } from '../api';
import { FeedbackForm, FeedbackButton, Field } from '../feedback';
import { type ArchiveController } from './use-archive';
import { Icon } from './shared';

export default function AuthForm({ archive }: { archive: ArchiveController }) {
  const { t } = useLocale();
  const {
    verificationEmail,
    setVerificationEmail,
    busy,
    yandex,
    register,
    setRegister,
    setNotice,
    action,
    auth,
    invite,
    createTripIntent,
    startRegistration,
  } = archive;
  const oauthReturn = invite
    ? '/join/' + invite
    : createTripIntent
      ? register
        ? createTripEntry
        : createTripSignInEntry
      : '/';

  if (verificationEmail)
    return (
      <div className="stack">
        <div className="verification-pending" role="status">
          <h3>{t('auth.checkYourEmail')}</h3>
          <p>
            <strong>{verificationEmail}</strong>
          </p>
          <p>
            {t(
              createTripIntent
                ? 'auth.verifyEmailToCreateTrip'
                : 'trip.verifyYourEmailUsingTheLinkIn',
            )}
          </p>
        </div>
        <p className="fine">{t('auth.verificationResendHint')}</p>
        <FeedbackButton
          type="button"
          className="secondary"
          disabled={busy}
          onClick={() =>
            void action(async () => {
              const result = await api('auth/resend-verification', 'POST', {
                email: verificationEmail,
                ...(createTripIntent && { createTrip: true }),
              });
              setNotice(result.message);
            })
          }
        >
          {t('trip.resendVerificationEmail')}
        </FeedbackButton>
        <FeedbackButton
          type="button"
          className="text-button"
          onClick={() => {
            setVerificationEmail('');
            setRegister(false);
          }}
        >
          {t('auth.backToSignIn')}
        </FeedbackButton>
      </div>
    );

  return (
    <>
      <FeedbackForm
        key={register ? 'register' : 'login'}
        onSubmit={auth}
        className="stack"
        validateField={(input) => {
          if (!register || input.name !== 'password') return undefined;
          if (!input.value) return '';
          return registrationPasswordErrors(input.value)
            .map(({ key, params }) => t(key, params) + '.')
            .join(' ');
        }}
      >
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
          minLength={register ? registrationPasswordMinLength : undefined}
          maxLength={register ? registrationPasswordMaxLength : 128}
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
            maxLength={registrationPasswordMaxLength}
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
        {!register && (
          <a
            className="text-button centered"
            href={createTripIntent ? createTripResetEntry : '/reset-password'}
          >
            {t('reset.forgot')}
          </a>
        )}
        {yandex && (
          <a
            className="secondary centered"
            href={
              '/api/auth/yandex?returnTo=' + encodeURIComponent(oauthReturn)
            }
            onClick={register ? startRegistration : undefined}
          >
            {t('trip.signInWithYandexId')}
          </a>
        )}
      </FeedbackForm>
    </>
  );
}
