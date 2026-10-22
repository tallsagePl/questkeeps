'use client';
import { useEffect, useRef, useState } from 'react';
import { api } from './api';
import { ApiError } from './feedback';
import { useLocale } from './appearance';
export default function FriendLink() {
  const { t } = useLocale();
  const [url, setUrl] = useState(''),
    [active, setActive] = useState(false),
    [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [copied, setCopied] = useState(false);
  useEffect(() => {
    const c = new AbortController();
    api('friends/link', 'GET', undefined, c.signal)
      .then((r) => {
        if (!c.signal.aborted) {
          setActive(!!r.expires);
          setReady(true);
        }
      })
      .catch((e) => {
        if (!c.signal.aborted) {
          setError(e.message);
          setReady(true);
        }
      });
    return () => c.abort();
  }, []);
  async function change(method: string) {
    setBusy(true);
    setError('');
    setCopied(false);
    try {
      const r = await api('friends/link', method, {});
      setUrl(r.url || '');
      setActive(method === 'POST');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="friend-link-block" aria-busy={busy}>
      <h3>{t('Пригласить по ссылке')}</h3>
      <p className="fine">
        {t(
          'Отправь ссылку другу — после входа вы сразу станете друзьями. Ссылка действует 30 дней.',
        )}
      </p>
      {url && (
        <label className="field">
          <span>{t('Ссылка для друзей')}</span>
          <input readOnly value={url} onFocus={(e) => e.target.select()} />
        </label>
      )}
      <div className="friend-link-actions">
        {url && (
          <button
            className="secondary"
            disabled={busy}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(url);
                setCopied(true);
                setError('');
              } catch {
                setError(
                  'Не удалось скопировать. Выдели ссылку и скопируй её вручную.',
                );
              }
            }}
          >
            {t(copied ? 'Скопировано' : 'Скопировать ссылку')}
          </button>
        )}
        <button
          className={url ? 'text-button' : 'secondary'}
          disabled={!ready || busy}
          onClick={() => void change('POST')}
        >
          {t(
            busy
              ? 'Подождите…'
              : active
                ? 'Заменить ссылку'
                : 'Сгенерировать ссылку',
          )}
        </button>
        {active && (
          <button
            className="text-button danger"
            disabled={busy}
            onClick={() => void change('DELETE')}
          >
            {t('Отключить ссылку')}
          </button>
        )}
      </div>
      {active && !url && (
        <p className="fine">
          {t(
            'Ссылка активна. Чтобы отправить её снова, создай новую — старая перестанет работать.',
          )}
        </p>
      )}
      {copied && (
        <span className="fine" role="status">
          {t('Ссылка скопирована')}
        </span>
      )}
      {error && <p role="alert">{t(error)}</p>}
    </div>
  );
}
export function FriendLinkArrival({ userId }: { userId?: string }) {
  const { t } = useLocale();
  const [pending, setPending] = useState(false),
    [name, setName] = useState(''),
    [error, setError] = useState(''),
    [attempt, setAttempt] = useState(0),
    [retryable, setRetryable] = useState(false);
  const request = useRef<{ key: string; promise: Promise<any> } | null>(null);
  useEffect(() => {
    const marker = new URLSearchParams(location.search).get('friend');
    setPending(marker === '1');
    if (marker === 'invalid') setError('Ссылка недействительна или истекла');
  }, []);
  useEffect(() => {
    if (!userId) {
      setName('');
      return;
    }
    if (new URLSearchParams(location.search).get('friend') === 'invalid')
      return;
    let mounted = true;
    const key = userId + ':' + attempt;
    if (request.current?.key !== key)
      request.current = {
        key,
        promise: api('friends/link/accept', 'POST', {}),
      };
    request.current.promise
      .then((r) => {
        if (!mounted) return;
        setPending(false);
        if (new URLSearchParams(location.search).get('friend') === '1') {
          const url = new URL(location.href);
          url.searchParams.delete('friend');
          history.replaceState(
            history.state,
            '',
            url.pathname + url.search + url.hash,
          );
        }
        if (r.accepted) {
          setName(r.name);
          setPending(false);
          window.dispatchEvent(
            new CustomEvent('questkeeps:friends-changed', { detail: userId }),
          );
        }
        setError('');
      })
      .catch((e) => {
        if (mounted) {
          setError(e.message);
          setRetryable(
            !(e instanceof ApiError) ||
              e.status === undefined ||
              e.status >= 500,
          );
        }
      });
    return () => {
      mounted = false;
    };
  }, [userId, attempt]);
  if (!pending && !name && !error) return null;
  return (
    <aside className="friend-arrival">
      {name ? (
        <p role="status">
          {t('Вы теперь друзья: ')}
          {name}. <a href="/profile#friends">{t('Все друзья')}</a>
        </p>
      ) : error ? (
        <p role="alert">
          {t(error)}{' '}
          {retryable && (
            <button
              className="text-button"
              onClick={() => setAttempt((n) => n + 1)}
            >
              {t('Повторить')}
            </button>
          )}
        </p>
      ) : (
        <p role="status">
          {t(
            userId
              ? 'Принимаем приглашение…'
              : 'Войди или зарегистрируйся, чтобы принять приглашение в друзья.',
          )}
        </p>
      )}
    </aside>
  );
}
