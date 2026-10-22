'use client';

import { useEffect, useState } from 'react';
import { SocialShell, useViewer } from './social-shell';
import { useLocale } from './appearance';
import { api } from './api';

export default function VerifyEmail() {
  const { t, m } = useLocale();
  const viewer = useViewer();
  const [token, setToken] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  useEffect(() => {
    const token =
      new URLSearchParams(location.hash.slice(1)).get('token') || '';
    setToken(token);
    history.replaceState(history.state, '', location.pathname);
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
                await api('auth/verify-email', 'POST', { token });
                setToken('');
                setDone(true);
                setStatus('messages.emailVerifiedYouCanNowSignIn');
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
            {t('messages.verifyEmail')}
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
