'use client';

import { useLocale } from '@/components/appearance';
import { api } from '../api';
import Modal from '../modal';
import { FeedbackForm, FeedbackButton, Field } from '../feedback';
import { type ArchiveController } from './use-archive';
import { values } from './shared';

export default function InviteDialog({
  archive,
}: {
  archive: ArchiveController;
}) {
  const { t } = useLocale();
  const {
    modal,
    setModal,
    busy,
    members,
    generated,
    setGenerated,
    action,
    reloadSettings,
    copy,
  } = archive;
  const trip = archive.trip!;
  return (
    <>
      <Modal
        title={
          modal === 'invite'
            ? t('trip.inviteToThisTrip')
            : t('trip.participationDates')
        }
        onClose={() => setModal('')}
      >
        {generated ? (
          <div className="stack">
            <p>{t('trip.theInvitationIsValidFor7Days')}</p>
            <input
              aria-label={t('trip.invitationLink')}
              value={generated}
              readOnly
              onFocus={(e) => e.target.select()}
            />
            <FeedbackButton
              className="primary"
              onClick={() => void copy(generated)}
            >
              {t('common.copyLink')}
            </FeedbackButton>
          </div>
        ) : (
          <FeedbackForm
            className="stack"
            onSubmit={(e) => {
              const input = values(e);
              void action(async () => {
                if (modal === 'invite') {
                  const r = await api(
                    'trips/' + trip.id + '/invite',
                    'POST',
                    input,
                  );
                  setGenerated(r.url);
                } else {
                  await api('trips/' + trip.id + '/members', 'PATCH', {
                    ...input,
                    userId: modal.split(':')[1],
                  });
                  await reloadSettings();
                  setModal('');
                }
              });
            }}
          >
            <p className="muted">{t('trip.theMemberCanOnlySeePhotosAnd')}</p>
            <Field
              label={t('trip.from')}
              name="start"
              type="date"
              defaultValue={
                members.find((m) => 'member:' + m.id === modal)?.start ||
                trip.start
              }
              min={trip.start}
              max={trip.end}
              required
            />
            <Field
              label={t('trip.through')}
              name="end"
              type="date"
              defaultValue={
                members.find((m) => 'member:' + m.id === modal)?.end || trip.end
              }
              min={trip.start}
              max={trip.end}
              required
            />
            <FeedbackButton className="primary" disabled={busy}>
              {modal === 'invite'
                ? t('trip.createInvitation')
                : t('common.save')}
            </FeedbackButton>
            {modal.startsWith('member:') && (
              <FeedbackButton
                type="button"
                className="text-button danger"
                disabled={busy}
                onClick={() =>
                  void action(async () => {
                    await api('trips/' + trip.id + '/members', 'PATCH', {
                      userId: modal.split(':')[1],
                      active: false,
                    });
                    await reloadSettings();
                    setModal('');
                  })
                }
              >
                {t('trip.endParticipation')}
              </FeedbackButton>
            )}
          </FeedbackForm>
        )}
      </Modal>
    </>
  );
}
