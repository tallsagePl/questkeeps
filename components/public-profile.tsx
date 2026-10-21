'use client';
import { useState } from 'react';
import { useLocale } from './appearance';
import Brand from './brand';
export default function PublicProfile({
  profile,
}: {
  profile: { name: string; username: string; hasAvatar: boolean };
}) {
  const { t } = useLocale();
  const [failed, setFailed] = useState(false),
    [copied, setCopied] = useState(false);
  return (
    <main className="public-profile-page">
      <Brand />
      <section className="public-profile-identity">
        <span className="public-profile-avatar" aria-hidden="true">
          {profile.name.slice(0, 1).toUpperCase()}
          {profile.hasAvatar && !failed && (
            <img
              src={'/api/profiles/' + profile.username + '/avatar'}
              alt=""
              onError={() => setFailed(true)}
            />
          )}
        </span>
        <h1>{profile.name}</h1>
        <p>@{profile.username}</p>
        <div className="public-profile-actions">
          <a className="secondary" href="/">
            {t('Все путешествия')}
          </a>
          <button
            className="secondary"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(
                  location.origin + '/@' + profile.username,
                );
                setCopied(true);
              } catch {
                setCopied(false);
              }
            }}
          >
            {t(copied ? 'Ссылка скопирована' : 'Скопировать ссылку')}
          </button>
        </div>
      </section>
    </main>
  );
}
