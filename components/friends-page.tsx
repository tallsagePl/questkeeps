'use client';

import { useLocale } from './appearance';
import Friends from './friends';
import { SocialShell, useViewer } from './social-shell';
import styles from './friends-page.module.css';

export default function FriendsPage() {
  const { t, m } = useLocale();
  const { user, ready, error } = useViewer();
  return (
    <SocialShell user={user} current="friends">
      <main id="main-content" className="social-page" tabIndex={-1}>
        {user ? (
          <Friends key={user.id} viewerId={user.id} />
        ) : (
          <>
            <h1 className={styles.title}>{t('friends.friends')}</h1>
            {!ready && <p role="status">{t('friends.loadingFriends')}</p>}
            {error && (
              <p role="alert">
                {m(error)}{' '}
                <button
                  className="text-button"
                  onClick={() => location.reload()}
                >
                  {t('common.retry')}
                </button>
              </p>
            )}
            {ready && !error && (
              <div className="profile-signin">
                <p>{t('friends.signInToSeeFriends')}</p>
                <a className="primary" href="/#welcome-auth">
                  {t('auth.signIn')}
                </a>
              </div>
            )}
          </>
        )}
      </main>
    </SocialShell>
  );
}
