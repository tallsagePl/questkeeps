'use client';

import NoteThread from '../note-thread';
import { useLocale } from '@/components/appearance';
import { api } from '../api';
import { FeedbackForm, FeedbackButton, Field } from '../feedback';
import { type ArchiveController } from './use-archive';
import { values, Icon } from './shared';

export default function JournalTab({
  archive,
}: {
  archive: ArchiveController;
}) {
  const { t } = useLocale();
  const { user, busy, guest, setNotice, action, refresh } = archive;
  const data = archive.data!;
  const trip = archive.trip!;
  return (
    <>
      <div className="notes-layout">
        <section>
          {data?.notes.length ? (
            data.notes.map((n) => (
              <NoteThread
                key={n.id}
                note={n}
                replies={(data.noteReplies || []).filter(
                  (reply) => reply.note_id === n.id,
                )}
                tripId={trip.id}
                userId={user?.id}
                guest={!!guest}
                onChange={refresh}
              />
            ))
          ) : (
            <div className="empty">
              <Icon name="book" size={42} />
              <h2>{t('trip.whatTheCameraMissed')}</h2>
              <p>{t('trip.saveYourImpressionsChanceEncountersAndFavorite')}</p>
            </div>
          )}
        </section>
        {!guest && (
          <FeedbackForm
            className="panel stack note-form"
            onSubmit={(e) => {
              const input = values(e);
              void action(async () => {
                await api('trips/' + trip.id + '/notes', 'POST', input);
                await refresh();
                setNotice('trip.entrySaved');
              });
            }}
          >
            <h2>{t('trip.newStory')}</h2>
            <Field
              label={t('common.tripDay')}
              name="day"
              type="date"
              min={trip.participationStart || trip.from}
              max={trip.participationEnd || trip.to}
              defaultValue={trip.participationStart || trip.from}
              required
            />
            <label className="field">
              <span>{t('trip.whatWillYouRemember')}</span>
              <textarea
                name="text"
                rows={7}
                required
                maxLength={5000}
                placeholder={t('trip.thisDayWasSpecialBecause')}
              />
            </label>
            <FeedbackButton disabled={busy} className="primary">
              {t('trip.saveEntry')}
            </FeedbackButton>
          </FeedbackForm>
        )}
      </div>
    </>
  );
}
