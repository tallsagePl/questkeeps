'use client';

import { useLocale } from '@/components/appearance';
import Modal from '../modal';
import CopyLinkButton from '../copy-link-button';
import { type ArchiveController } from './use-archive';

export default function LeaveDialog({
  archive,
}: {
  archive: ArchiveController;
}) {
  const { t } = useLocale();
  const { setModal, generated } = archive;

  return (
    <>
      <Modal title={t('trip.aLinkToYourStory')} onClose={() => setModal('')}>
        <div className="stack">
          <p>{t('trip.saveThisLinkLaterYouCanOnly')}</p>
          <input
            aria-label={t('trip.guestLink')}
            value={generated}
            readOnly
            onFocus={(e) => e.target.select()}
          />
          <CopyLinkButton value={generated} autoCopy />
          <a
            className="secondary centered"
            href={generated}
            target="_blank"
            rel="noopener noreferrer"
          >
            {t('trip.openGuestView')}
          </a>
        </div>
      </Modal>
    </>
  );
}
