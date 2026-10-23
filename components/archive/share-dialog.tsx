'use client';

import { useLocale } from '@/components/appearance';
import { api } from '../api';
import Modal from '../modal';
import { FeedbackButton } from '../feedback';
import { type ArchiveController } from './use-archive';

export default function ShareDialog({
  archive,
}: {
  archive: ArchiveController;
}) {
  const { t } = useLocale();
  const { setSelected, setData, setModal, busy, action, loadTrips } = archive;
  const trip = archive.trip!;
  return (
    <>
      <Modal title={t('trip.leaveThisTrip')} onClose={() => setModal('')}>
        <div className="stack">
          <p>{t('trip.publishedPhotosWillRemainInTheTrip')}</p>
          <FeedbackButton
            className="primary"
            disabled={busy}
            onClick={() =>
              void action(async () => {
                await api('trips/' + trip.id + '/leave', 'POST', {});
                setModal('');
                setSelected(null);
                setData(null);
                await loadTrips();
                window.history.replaceState(null, '', '/');
              })
            }
          >
            {t('trip.leaveTrip')}
          </FeedbackButton>
        </div>
      </Modal>
    </>
  );
}
