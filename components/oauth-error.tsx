'use client';

import SiteFooter from './site-footer';

import { HeaderBrand } from './brand';
import { useLocale, AppearanceControls } from './appearance';
import {
  oauthErrors,
  type OAuthErrorReason,
  type OAuthIntent,
} from '@/lib/oauth-errors';
import { createTripEntry, createTripSignInEntry } from '@/lib/trip-entry';

export default function OAuthError({
  reason,
  intent,
  returnPath,
}: {
  reason: OAuthErrorReason;
  intent: OAuthIntent;
  returnPath: string;
}) {
  const { t } = useLocale();
  const signingIn = intent === 'login';
  const creatingWithDisk = intent === 'login_disk';
  const retry =
    '/api/auth/yandex?' + new URLSearchParams({ intent, returnTo: returnPath });
  const signIn = returnPath.startsWith(createTripEntry)
    ? createTripSignInEntry
    : returnPath;
  const needsSignIn =
    reason === 'account_link_required' ||
    reason === 'link_session_changed' ||
    (creatingWithDisk && reason === 'account_already_linked');
  const back = creatingWithDisk
    ? createTripEntry
    : signingIn
      ? signIn
      : returnPath;

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
          <span className="eyebrow">
            {t(signingIn ? 'oauth.signInLabel' : 'oauth.connectionLabel')}
          </span>
          <h1 id="oauth-error-title">
            {t(
              signingIn
                ? 'oauth.signInIncomplete'
                : 'oauth.connectionIncomplete',
            )}
          </h1>
          <p role="alert" className="inline-error">
            {t(oauthErrors[reason])}
          </p>
          <a href={needsSignIn ? signIn : retry} className="primary">
            {t(
              needsSignIn
                ? 'auth.signIn'
                : signingIn
                  ? 'oauth.retrySignIn'
                  : 'oauth.retryConnection',
            )}
          </a>
          {(!needsSignIn || back !== signIn) && (
            <a href={back} className="text-button">
              {t(signingIn ? 'oauth.backToEmailSignIn' : 'oauth.backToApp')}
            </a>
          )}
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
