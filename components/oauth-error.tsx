'use client';
import Brand from './brand';
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
  const { language } = useLocale();
  const en = language === 'en';
  const retry =
    '/api/auth/yandex?' + new URLSearchParams({ intent, returnTo: returnPath });
  return (
    <>
      <header className="topbar">
        <Brand />
        <AppearanceControls />
      </header>
      <main
        className="invite-page"
        style={{ maxWidth: 680, margin: '60px auto', padding: '0 24px' }}
      >
        <section className="panel stack" aria-labelledby="oauth-error-title">
          <span className="eyebrow">
            {en ? 'YANDEX CONNECTION' : 'ПОДКЛЮЧЕНИЕ ЯНДЕКСА'}
          </span>
          <h1 id="oauth-error-title">
            {en
              ? 'Connection not completed'
              : 'Не удалось завершить подключение'}
          </h1>
          <p role="alert" className="inline-error">
            {oauthErrors[reason][language]}
          </p>
          <p className="fine">
            {en ? 'Reason' : 'Причина'}: {reason}
          </p>
          <a href={retry} className="primary">
            {en ? 'Try connecting again' : 'Повторить подключение'}
          </a>
          <a href={returnPath} className="text-button">
            {en ? 'Back to QuestKeeps' : 'Вернуться в QuestKeeps'}
          </a>
        </section>
      </main>
    </>
  );
}
