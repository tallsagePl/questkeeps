'use client';

import { useLocale } from '@/components/appearance';
import { api } from '../api';
import Modal from '../modal';
import CreateTrip from '../create-trip';
import AuthForm from './auth-form';
import { createTripDraftKey } from '@/lib/create-trip-draft';
import { type ArchiveController } from './use-archive';

export default function CreateDialog({
  archive,
}: {
  archive: ArchiveController;
}) {
  const { t } = useLocale();
  const {
    user,
    modal,
    busy,
    yandex,
    action,
    loadTrips,
    openTrip,
    createTripPickingDisk,
    requireCreateAccount,
    returnToCreate,
    closeCreate,
    startRegistration,
  } = archive;
  const draftKey = createTripDraftKey(user?.id);
  const close = () => {
    try {
      sessionStorage.removeItem(draftKey);
    } catch {
      // Closing remains available when storage is disabled.
    }
    closeCreate();
  };

  if (modal === 'create-auth')
    return (
      <Modal
        key="account"
        title={t('createTrip.saveDraftTitle')}
        onClose={returnToCreate}
      >
        <div className="stack">
          <p className="muted">{t('createTrip.saveDraftHint')}</p>
          <AuthForm archive={archive} />
          <button
            type="button"
            className="text-button centered"
            onClick={returnToCreate}
          >
            {t('createTrip.backToDraft')}
          </button>
        </div>
      </Modal>
    );

  return (
    <Modal
      key="draft"
      title={t('trip.newJourney')}
      onClose={close}
      doubleBackdropClick
    >
      <CreateTrip
        key={draftKey}
        busy={busy}
        yandexEnabled={yandex}
        signedIn={!!user}
        draftKey={draftKey}
        openDisk={createTripPickingDisk}
        onRequireAccount={requireCreateAccount}
        onStartDiskSignup={startRegistration}
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
  );
}
