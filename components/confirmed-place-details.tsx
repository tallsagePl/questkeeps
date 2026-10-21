'use client';
import SmoothDetails from './smooth-details';
import { useLocale } from './appearance';
import { PlaceImage } from './discovered-places';
export default function ConfirmedPlaceDetails({
  title,
  summary,
  url,
  endpoint,
  scope,
  sourceUrl,
  highlighted = false,
}: {
  highlighted?: boolean;
  title: string;
  summary: string;
  url: string;
  endpoint: string;
  scope: string;
  sourceUrl?: string | null;
}) {
  const { t } = useLocale();
  return (
    <>
      <SmoothDetails
        key={highlighted ? 'selected' : 'ordinary'}
        open={highlighted || undefined}
      >
        <summary>{t('Кратко о месте')}</summary>
        <div className="confirmed-place-description confirmed-place-text">
          <p>{summary}</p>
          {sourceUrl !== null && (
            <a href={sourceUrl || url} target="_blank" rel="noreferrer">
              {t(
                url.includes('openstreetmap.org')
                  ? 'Источник: OpenStreetMap'
                  : 'Источник: Википедия',
              )}
            </a>
          )}
        </div>
      </SmoothDetails>
      <div className="confirmed-place-picture">
        <PlaceImage endpoint={endpoint} title={title} scope={scope} />
      </div>
    </>
  );
}
