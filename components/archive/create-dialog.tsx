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
  const { user, setModal, busy, yandex, action, loadTrips, openTrip } = archive;
  if (!user) return null;

  const draftKey = 'questkeeps:create-trip-draft:v1:' + user.id;
  const close = () => {
    try {
      sessionStorage.removeItem(draftKey);
    } catch {
      // Closing remains available when storage is disabled.
    }
    setModal('');
  };

  return (
    <>
      <Modal title={t('trip.newJourney')} onClose={close} doubleBackdropClick>
        <CreateTrip
          busy={busy}
          yandexEnabled={yandex}
          draftKey={draftKey}
          onCreate={(input) =>
            action(async () => {
              const r = await api('trips', 'POST', input);
              close();
              await loadTrips();
              openTrip(r.id);
            })
          }
        />
      </Modal>
    </>
  );
}
