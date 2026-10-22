'use client';

import { HeaderBrand } from './brand';
import { useLocale, AppearanceControls } from './appearance';
import { oauthErrors, type OAuthErrorReason } from '@/lib/oauth-errors';

export default function OAuthError({
  reason,
  intent,
  returnPath,
}: {
  reason: OAuthErrorReason;
  intent: 'link' | 'login';
  returnPath: string;
}) {
  const { t } = useLocale();
  const retry =
    '/api/auth/yandex?' + new URLSearchParams({ intent, returnTo: returnPath });

  return (
    <>
      <header className="topbar">
        <HeaderBrand />
        <AppearanceControls />
      </header>
      <main
        className="invite-page"
        style={{ maxWidth: 680, margin: '60px auto', padding: '0 24px' }}
      >
        <section className="panel stack" aria-labelledby="oauth-error-title">
          <span className="eyebrow">{t('oauth.connectionLabel')}</span>
          <h1 id="oauth-error-title">{t('oauth.connectionIncomplete')}</h1>
          <p role="alert" className="inline-error">
            {t(oauthErrors[reason])}
          </p>
          <p className="fine">
            {t('oauth.reason')}: {reason}
          </p>
          <a
            href={reason === 'account_link_required' ? '/' : retry}
            className="primary"
          >
            {t(
              reason === 'account_link_required'
                ? 'auth.signIn'
                : 'oauth.retryConnection',
            )}
          </a>
          <a href={returnPath} className="text-button">
            {t('oauth.backToApp')}
          </a>
        </section>
      </main>
    </>
  );
}
