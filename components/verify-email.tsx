'use client';
import { useEffect, useState } from 'react';
import { SocialShell, useViewer } from './social-shell';
import { useLocale } from './appearance';
import { api } from './api';
import BackButton from './back-button';
export default function VerifyEmail() {
  const { t } = useLocale(),
    viewer = useViewer();
  const [token, setToken] = useState(''),
    [status, setStatus] = useState(''),
    [busy, setBusy] = useState(false),
    [done, setDone] = useState(false);
  useEffect(() => {
    const token =
      new URLSearchParams(location.hash.slice(1)).get('token') || '';
    setToken(token);
    history.replaceState(history.state, '', location.pathname);
  }, []);
  return (
    <SocialShell user={viewer.user}>
      <main id="main-content" className="social-page" tabIndex={-1}>
        <BackButton />
        <h1>{t('Подтверждение почты')}</h1>
        <p>{t('Подтверди адрес, чтобы завершить регистрацию.')}</p>
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
                setStatus('Email подтверждён. Теперь можно войти.');
              } catch (error) {
                setStatus(
                  error instanceof Error
                    ? error.message
                    : 'Не удалось выполнить запрос',
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            {t('Подтвердить email')}
          </button>
        )}
        {status && <p role={done ? 'status' : 'alert'}>{t(status)}</p>}
        {done && (
          <a className="secondary" href="/">
            {t('Войти')}
          </a>
        )}
      </main>
    </SocialShell>
  );
}
