import type { Metadata } from 'next';
import PrivacyShell from '@/components/privacy-shell';
import {
  translate,
  type TranslationKey,
  type Language,
} from '@/lib/i18n/translate';

export const metadata: Metadata = {
  title: 'Конфиденциальность / Privacy · QuestKeeps',
  description:
    'Политика конфиденциальности сайта и Telegram-бота QuestKeeps. Privacy policy in Russian and English.',
  alternates: { canonical: '/privacy' },
};

const sections: { title: TranslationKey; paragraphs: TranslationKey[] }[] = [
  { title: 'privacy.scope.title', paragraphs: ['privacy.scope.body'] },
  {
    title: 'privacy.account.title',
    paragraphs: ['privacy.account.body', 'privacy.account.trips'],
  },
  { title: 'privacy.use.title', paragraphs: ['privacy.use.body'] },
  { title: 'privacy.sharing.title', paragraphs: ['privacy.sharing.body'] },
  {
    title: 'privacy.providers.title',
    paragraphs: ['privacy.providers.body', 'privacy.providers.places'],
  },
  { title: 'privacy.browser.title', paragraphs: ['privacy.browser.body'] },
  {
    title: 'privacy.bot.title',
    paragraphs: ['privacy.bot.body', 'privacy.bot.registrations'],
  },
  {
    title: 'privacy.retention.title',
    paragraphs: ['privacy.retention.body', 'privacy.retention.bot'],
  },
  { title: 'privacy.requests.title', paragraphs: ['privacy.requests.body'] },
];

function Policy({ language }: { language: Language }) {
  return (
    <article
      lang={language}
      id={language}
      className="privacy-language"
      aria-labelledby={'privacy-' + language}
    >
      <h2 id={'privacy-' + language}>
        {language === 'ru' ? 'Русский' : 'English'}
      </h2>
      <p className="privacy-date">{translate('privacy.updated', language)}</p>
      {sections.map((section) => (
        <section key={section.title}>
          <h3>{translate(section.title, language)}</h3>
          {section.paragraphs.map((key) => (
            <p key={key}>{translate(key, language)}</p>
          ))}
        </section>
      ))}
      <p>
        <a href="https://t.me/questkeepsbot">
          {translate('privacy.requests.contact', language)}
        </a>
      </p>
      <p className="privacy-provider-links">
        <a href="https://yandex.ru/legal/confidential/">Yandex</a>
        <a href="https://resend.com/legal/privacy-policy">Resend</a>
        <a href="https://telegram.org/privacy">Telegram</a>
        <a href="https://www.esri.com/en-us/privacy/privacy-statements/privacy-statement">
          Esri
        </a>
        <a href="https://osmfoundation.org/wiki/Privacy_Policy">
          OpenStreetMap
        </a>
        <a href="https://foundation.wikimedia.org/wiki/Policy:Privacy_policy">
          Wikimedia
        </a>
      </p>
      <p className="privacy-date">{translate('privacy.changes', language)}</p>
    </article>
  );
}

export default function PrivacyPage() {
  return (
    <PrivacyShell>
      <main
        id="main-content"
        tabIndex={-1}
        className="social-page privacy-page"
      >
        <h1>
          <span lang="ru">Конфиденциальность</span>
          <br />
          <span lang="en">
            Privacy policy<span className="brand-dot">.</span>
          </span>
        </h1>
        <p lang="ru" className="privacy-intro">
          {translate('privacy.intro', 'ru')}
        </p>
        <p lang="en" className="privacy-intro">
          {translate('privacy.intro', 'en')}
        </p>
        <nav
          className="privacy-language-nav"
          aria-label="Язык документа / Document language"
        >
          <a href="#ru" lang="ru">
            Русский
          </a>
          <a href="#en" lang="en">
            English
          </a>
        </nav>
        <Policy language="ru" />
        <Policy language="en" />
      </main>
    </PrivacyShell>
  );
}
