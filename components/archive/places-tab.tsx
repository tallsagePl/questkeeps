'use client';

import { useLocale } from '@/components/appearance';
import TripDayCalendar from '../trip-day-calendar';
import DiscoveredPlaces from '../discovered-places';
import PlaceRecommendations from '../place-recommendations';
import { type ArchiveController } from './use-archive';

export default function PlacesTab({ archive }: { archive: ArchiveController }) {
  useLocale();
  const {
    user,
    setData,
    tab,
    day,
    setDay,
    isOwner,
    guest,
    discoveredPlaces,
    placePhotoGroups,
    mediaPath,
    placeTarget,
    setPlaceTarget,
    applyAddedPlace,
    openMedia,
    share,
  } = archive;
  const data = archive.data!;
  const activeMedia = archive.activeMedia!;
  const trip = archive.trip!;
  return (
    <>
      {tab === 'places' && (
        <>
          {guest && (
            <div className="places-calendar-row">
              <TripDayCalendar
                start={trip.start}
                end={trip.end}
                value={day}
                onChange={setDay}
              />
            </div>
          )}
          {!guest && (
            <PlaceRecommendations
              dayRange={day}
              headerContent={
                <TripDayCalendar
                  start={trip.start}
                  end={trip.end}
                  value={day}
                  onChange={setDay}
                />
              }
              tripId={trip.id}
              media={data!.media}
              places={data!.places}
              userId={user!.id}
              isOwner={isOwner}
              scope={'user:' + user?.id}
              previewPath={(photo) =>
                mediaPath(photo, 'preview') +
                '?revision=' +
                encodeURIComponent(photo.revision || '1')
              }
              onSelect={(mid) =>
                openMedia(data!.media.find((photo) => photo.id === mid))
              }
              onAdded={applyAddedPlace}
            />
          )}
          <DiscoveredPlaces
            targetUrl={!activeMedia ? placeTarget : null}
            onTargetReached={() => setPlaceTarget(null)}
            photoCount={(place) => placePhotoGroups.get(place.url)?.length || 0}
            photoPath={(place) => {
              const photo = placePhotoGroups.get(place.url)?.[0];
              return photo
                ? mediaPath(photo, 'preview') +
                    (share ? '&' : '?') +
                    'revision=' +
                    encodeURIComponent(photo.revision || '1')
                : undefined;
            }}
            onPhotoSelect={(_id, placeUrl) => {
              const photo = placePhotoGroups.get(placeUrl)?.[0];
              if (photo) openMedia(photo, placeUrl);
            }}
            scope={share ? 'guest:' + share : 'user:' + user?.id}
            places={discoveredPlaces}
            tripId={trip.id}
            canDelete={isOwner && !guest}
            onDeleted={(place) =>
              setData((old) =>
                old
                  ? {
                      ...old,
                      places: old.places.filter(
                        (item) => item.url !== place.url,
                      ),
                    }
                  : old,
              )
            }
            geometryPath={(place) =>
              mediaPath(
                { id: place.media_id },
                'places/' + place.id + '/geometry',
              )
            }
            imagePath={(place) =>
              mediaPath({ id: place.media_id }, 'places/' + place.id + '/image')
            }
          />
        </>
      )}
    </>
  );
}
