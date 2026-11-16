'use client';

import { useEffect, useRef, useState } from 'react';
import { SocialShell, signOut, useViewer } from './social-shell';
import { useLocale } from './appearance';
import { api } from './api';
import { announceSessionChange } from '../lib/browser-session';
import { trackGoal } from '../lib/analytics';
import {
  createTripEntry,
  createTripRequested,
  createTripSignInEntry,
} from '../lib/trip-entry';

export default function VerifyEmail() {
  const { t, m } = useLocale();
  const viewer = useViewer();
  const [token, setToken] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [createTrip, setCreateTrip] = useState(false);
  const [signOutError, setSignOutError] = useState('');
  const initialized = useRef(false);
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    const fragment = new URLSearchParams(location.hash.slice(1));
    const token = fragment.get('token') || '';
    setCreateTrip(createTripRequested(fragment));
    history.replaceState(history.state, '', location.pathname);
    if (/^[A-Za-z0-9_-]{43}$/.test(token)) setToken(token);
    else setStatus('messages.theVerificationLinkIsInvalidOrHas');
  }, []);
  const signInEntry = createTrip ? createTripSignInEntry : '/';
  return (
    <SocialShell user={viewer.user}>
      <main id="main-content" className="social-page" tabIndex={-1}>
        <h1>{t('messages.emailVerification')}</h1>
        <p>{t('messages.confirmYourAddressToFinishSigningUp')}</p>
        {createTrip && <p>{t('auth.afterVerificationCreateTrip')}</p>}
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
                trackGoal('onboarding_registration_confirmed');
                setToken('');
                setDone(true);
                if (result.user) {
                  setStatus(
                    createTrip
                      ? 'auth.emailVerifiedOpeningTrip'
                      : 'auth.emailVerifiedSigningIn',
                  );
                  announceSessionChange();
                  window.location.replace(createTrip ? createTripEntry : '/');
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
        {!done && status && (
          <a className="secondary" href={signInEntry}>
            {t('auth.backToSignIn')}
          </a>
        )}
        {done && status === 'auth.emailVerifiedDifferentAccount' && (
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setSignOutError('');
              try {
                await signOut(signInEntry);
              } catch (error) {
                setSignOutError(
                  error instanceof Error
                    ? error.message
                    : 'errors.requestFailed',
                );
                setBusy(false);
              }
            }}
          >
            {t('auth.signOutToContinue')}
          </button>
        )}
        {signOutError && <p role="alert">{m(signOutError)}</p>}
      </main>
    </SocialShell>
  );
}
