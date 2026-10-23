'use client';

import { useEffect, useRef, useState } from 'react';
import { SocialShell, useViewer } from './social-shell';
import { useLocale } from './appearance';
import { api } from './api';
import { announceSessionChange } from '../lib/browser-session';

export default function VerifyEmail() {
  const { t, m } = useLocale();
  const viewer = useViewer();
  const [token, setToken] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const initialized = useRef(false);
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    const token =
      new URLSearchParams(location.hash.slice(1)).get('token') || '';
    setToken(token);
    history.replaceState(history.state, '', location.pathname);
    if (!/^[A-Za-z0-9_-]{43}$/.test(token))
      setStatus('messages.theVerificationLinkIsInvalidOrHas');
  }, []);
  return (
    <SocialShell user={viewer.user}>
      <main id="main-content" className="social-page" tabIndex={-1}>
        <h1>{t('messages.emailVerification')}</h1>
        <p>{t('messages.confirmYourAddressToFinishSigningUp')}</p>
        {!done && (
          <button
            className="primary"
            disabled={busy || !token}
            onClick={async () => {
              setBusy(true);
              try {
                const result = await api('auth/verify-email', 'POST', {
                  token,
                });
                setToken('');
                setDone(true);
                if (result.user) {
                  setStatus('auth.emailVerifiedSigningIn');
                  announceSessionChange();
                  window.location.replace('/');
                } else setStatus('auth.emailVerifiedDifferentAccount');
              } catch (error) {
                setStatus(
                  error instanceof Error
                    ? error.message
                    : 'errors.requestFailed',
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            {t('auth.verifyEmailAndSignIn')}
          </button>
        )}
        {status && <p role={done ? 'status' : 'alert'}>{m(status)}</p>}
        {done && (
          <a className="secondary" href="/">
            {t('auth.signIn')}
          </a>
        )}
      </main>
    </SocialShell>
  );
}
