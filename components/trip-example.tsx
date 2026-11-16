'use client';

import { useLocale } from './appearance';
import CreateTripLink from './create-trip-link';
import styles from './trip-example.module.css';

const views = [
  ['gallery', 'trip.gallery'],
  ['map', 'trip.map'],
  ['journal', 'trip.journal'],
] as const;

export default function TripExample() {
  const { t, language, resolvedTheme } = useLocale();
  const screenshot = (view: 'map' | 'journal') =>
    '/about/screenshots/' +
    language +
    '-' +
    resolvedTheme +
    '-' +
    view +
    '.webp';

  return (
    <section
      id="trip-example"
      className={styles.example}
      aria-labelledby="trip-example-title"
    >
      <h2 id="trip-example-title">{t('onboarding.exampleTitle')}</h2>
      <fieldset className={styles.views}>
        <legend className={styles.visuallyHidden}>
          {t('onboarding.exampleViews')}
        </legend>
        <div className={styles.controls}>
          {views.map(([view, label]) => (
            <label key={view}>
              <input
                name="trip-example-view"
                type="radio"
                value={view}
                defaultChecked={view === 'gallery'}
              />
              <span>{t(label)}</span>
            </label>
          ))}
        </div>
        <div className={styles.gallery}>
          <figure>
            <img
              src="/about/galata-view.webp"
              width={760}
              height={570}
              alt={t('onboarding.galataViewAlt')}
              fetchPriority="high"
            />
            <figcaption>{t('onboarding.exampleDayOne')}</figcaption>
          </figure>
          <figure>
            <img
              src="/about/galata-tower.webp"
              width={760}
              height={504}
              alt={t('onboarding.galataTowerAlt')}
            />
            <figcaption>{t('onboarding.exampleDayTwo')}</figcaption>
          </figure>
        </div>
        <figure className={styles.map}>
          <a href={screenshot('map')}>
            <img
              src={screenshot('map')}
              width={1280}
              height={800}
              alt={t('about.aDemoTripMapInQuestkeeps')}
              loading="lazy"
            />
          </a>
          <figcaption>{t('onboarding.exampleMap')}</figcaption>
        </figure>
        <figure className={styles.journal}>
          <a href={screenshot('journal')}>
            <img
              src={screenshot('journal')}
              width={1280}
              height={800}
              alt={t('about.aDemoTripJournalInQuestkeeps')}
              loading="lazy"
            />
          </a>
          <figcaption>{t('onboarding.exampleJournal')}</figcaption>
        </figure>
      </fieldset>
      <CreateTripLink source="example" className={styles.create}>
        {t('onboarding.createOwnTrip')}
      </CreateTripLink>
    </section>
  );
}
