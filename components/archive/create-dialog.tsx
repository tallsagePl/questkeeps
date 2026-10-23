'use client';

import { useLocale } from '@/components/appearance';
import { api } from '../api';
import Modal from '../modal';
import CreateTrip from '../create-trip';
import { type ArchiveController } from './use-archive';

export default function CreateDialog({
  archive,
}: {
  archive: ArchiveController;
}) {
  const { t } = useLocale();
  const { setModal, busy, yandex, action, loadTrips, openTrip } = archive;

  return (
    <>
      <Modal
        title={t('trip.newJourney')}
        onClose={() => setModal('')}
        doubleBackdropClick
      >
        <CreateTrip
          busy={busy}
          yandexEnabled={yandex}
          onCreate={(input) =>
            action(async () => {
              const r = await api('trips', 'POST', input);
              setModal('');
              await loadTrips();
              openTrip(r.id);
            })
          }
        />
      </Modal>
    </>
  );
}
