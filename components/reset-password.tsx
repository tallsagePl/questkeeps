'use client';

import { useEffect, useRef, useState } from 'react';
import { SocialShell, useViewer } from './social-shell';
import { useLocale } from './appearance';
import { api } from './api';
import { Field } from './feedback';
import { registrationPasswordPattern } from '../lib/password-policy';
import { announceSessionChange } from '../lib/browser-session';
import { clearPreviewCache } from '../lib/preview-cache';

export default function ResetPassword() {
  const { t, m, language } = useLocale();
  const viewer = useViewer();
  const initialized = useRef(false);
  const [token, setToken] = useState('');
  const [ready, setReady] = useState(false);
  const [resetMode, setResetMode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    const readLink = () => {
      const raw = new URLSearchParams(location.hash.slice(1)).get('token');
      history.replaceState(history.state, '', location.pathname);
      setStatus('');
      setError('');
      setDone(false);
      setToken('');
      setResetMode(raw !== null);
      if (raw !== null) {
        if (/^[A-Za-z0-9_-]{43}$/.test(raw)) setToken(raw);
        else setError('reset.invalid');
      }
      setReady(true);
    };
    if (!initialized.current) {
      initialized.current = true;
      readLink();
    }
    window.addEventListener('hashchange', readLink);
    return () => window.removeEventListener('hashchange', readLink);
  }, []);
  return (
    <SocialShell user={viewer.user}>
      <main
        id="main-content"
        className="social-page reset-password-page"
        tabIndex={-1}
      >
        <h1>{t('reset.title')}</h1>
        <p>{t(resetMode ? 'reset.linkIntro' : 'reset.intro')}</p>
        {ready && !done && (
          <form
            className="stack"
            onChange={() => setError('')}
            onSubmit={async (event) => {
              event.preventDefault();
              if (busy) return;
              const form = new FormData(event.currentTarget);
              setError('');
              setStatus('');
              if (
                resetMode &&
                form.get('password') !== form.get('passwordConfirmation')
              ) {
                setError('trip.passwordsDoNotMatch');
                return;
              }
              setBusy(true);
              try {
                const result = await api(
                  resetMode ? 'auth/reset-password' : 'auth/forgot-password',
                  'POST',
                  resetMode
                    ? {
                        token,
                        password: form.get('password'),
                        passwordConfirmation: form.get('passwordConfirmation'),
                      }
                    : { email: form.get('email'), language },
                );
                setStatus(result.message);
                setDone(true);
                if (resetMode) {
                  setToken('');
                  if (result.sessionEnded)
                    window.dispatchEvent(
                      new Event('questkeeps:session-ending'),
                    );
                  void clearPreviewCache().catch(() => {});
                  announceSessionChange();
                }
              } catch (error) {
                setError(
                  error instanceof Error
                    ? error.message
                    : 'errors.requestFailed',
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            {resetMode ? (
              <>
                <Field
                  label={t('reset.newPassword')}
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  minLength={6}
                  maxLength={72}
                  pattern={registrationPasswordPattern}
                  hint={t('trip.672CharactersUppercaseAndLowercaseLatin')}
                  required
                />
                <Field
                  label={t('trip.repeatPassword')}
                  name="passwordConfirmation"
                  type="password"
                  autoComplete="new-password"
                  minLength={6}
                  maxLength={72}
                  required
                />
              </>
            ) : (
              <Field
                label={t('auth.email')}
                name="email"
                type="email"
                autoComplete="email"
                autoCapitalize="none"
                maxLength={254}
                required
              />
            )}
            <button
              className="primary"
              disabled={busy || (resetMode && !token)}
            >
              {t(
                busy
                  ? 'common.pleaseWait'
                  : resetMode
                    ? 'reset.save'
                    : 'reset.request',
              )}
            </button>
          </form>
        )}
        {status && <p role="status">{m(status)}</p>}
        {error && (
          <p className="form-error" role="alert">
            {m(error)}
          </p>
        )}
        {resetMode && error === 'reset.invalid' && (
          <a className="text-button" href="/reset-password">
            {t('reset.request')}
          </a>
        )}
        <p>
          <a href="/" className="text-button">
            {t('auth.backToSignIn')}
          </a>
        </p>
      </main>
    </SocialShell>
  );
}
