'use client';

import { useLocale } from './appearance';

const screens = [
  {
    id: 'trips',
    titleKey: 'about.tripsWorthComingBackTo',
    altKey: 'about.theQuestkeepsHomeScreenShowingACollection',
  },
  {
    id: 'map',
    titleKey: 'about.aCityBecomesPartOfYourStory',
    altKey: 'about.aDemoTripMapInQuestkeeps',
  },
  {
    id: 'journal',
    titleKey: 'about.everythingBetweenThePhotos',
    altKey: 'about.aDemoTripJournalInQuestkeeps',
  },
] as const;

export default function AboutShowcase() {
  const { t, language, resolvedTheme } = useLocale();
  return (
    <section
      className="about-showcase"
      aria-label={t('about.takeALookAtYourNextStory')}
    >
      <div className="about-screens">
        {screens.map((screen) => (
          <a
            key={screen.id}
            className={'about-shot about-shot-' + screen.id}
            href={
              '/about/screenshots/' +
              language +
              '-' +
              (resolvedTheme === 'dark' ? 'dark' : 'light') +
              '-' +
              screen.id +
              '.webp'
            }
            target="_blank"
            rel="noopener"
            aria-label={t('about.viewScreenshot') + ': ' + t(screen.titleKey)}
          >
            <img
              src={
                '/about/screenshots/' +
                language +
                '-' +
                (resolvedTheme === 'dark' ? 'dark' : 'light') +
                '-' +
                screen.id +
                '.webp'
              }
              alt={t(screen.altKey)}
              width="1280"
              height="800"
              loading="lazy"
              decoding="async"
            />
            <span>
              {t(screen.titleKey)}
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                aria-hidden="true"
              >
                <path d="M7 17 17 7M7 7h10v10" />
              </svg>
            </span>
          </a>
        ))}
      </div>
      <p className="about-demo-caption">
        {t('about.oneTripMoreThanOneWayBack')}
      </p>
    </section>
  );
}
