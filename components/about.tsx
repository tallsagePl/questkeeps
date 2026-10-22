'use client';

import { useLocale } from './appearance';
import { SocialShell, useViewer } from './social-shell';
import AboutShowcase from './about-showcase';

export default function About() {
  const { t } = useLocale();
  const viewer = useViewer();
  return (
    <SocialShell user={viewer.user} current="about">
      <main id="main-content" tabIndex={-1} className="social-page about-page">
        <section className="about-intro">
          <h1>
            {t('about.heading')}
            <span className="brand-dot">.</span>
          </h1>
          <p className="about-lead">
            {t('about.thatSunsetTheStreetYouFoundBy')}
          </p>
          <a className="primary" href="/">
            {t(viewer.user ? 'about.goToMyTrips' : 'about.startYourStory')}
          </a>
        </section>
        <AboutShowcase />
        <div className="about-content">
          <section>
            <h2>{t('about.everythingWorthRemembering')}</h2>
            <div className="about-feature-lines">
              <article>
                <h3>{t('about.moreThanAFolderOfPhotos')}</h3>
                <p>{t('about.yourFavouritePhotosAndLittleVideosBelong')}</p>
              </article>
              <article>
                <h3>{t('about.thereIsMoreBeyondTheFrame')}</h3>
                <p>{t('about.aPhotoCanHoldAWholeCity')}</p>
              </article>
              <article>
                <h3>{t('about.someMemoriesNeverMakeItIntoA')}</h3>
                <p>{t('about.morningCoffeeAJokeOnTheRoad')}</p>
              </article>
            </div>
          </section>
          <section>
            <h2>{t('about.everyoneSeesADifferentStory')}</h2>
            <div>
              <p>{t('about.youPhotographedTheSeaSomeoneElseCaught')}</p>
              <p>{t('about.keepCloseToThePeopleYouAlready')}</p>
            </div>
          </section>
          <section className="about-privacy">
            <h2>{t('about.yourPeopleYourStories')}</h2>
            <div>
              <p>{t('about.someMemoriesAreForAllYourPeople')}</p>
              <p>{t('about.yourPublicProfileShowsYourNameUsername')}</p>
              <details className="about-privacy-detail">
                <summary>{t('about.aboutGuestLinksAndPlaceDiscovery')}</summary>
                <p>{t('about.anyoneWithAGuestLinkCanView')}</p>
                <p>{t('about.openstreetmapDataAndWikipediaStoriesHelpYou')}</p>
              </details>
            </div>
          </section>
          <section className="about-ending">
            <h2>{t('about.thePlacesAndThePeople')}</h2>
            <div>
              <p>{t('about.aLongJourneyOrAWeekendClose')}</p>
              <a className="secondary" href="/">
                {t('about.openTrips')}
              </a>
            </div>
          </section>
        </div>
      </main>
    </SocialShell>
  );
}
