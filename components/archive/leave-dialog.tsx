'use client';

import { useLocale } from '@/components/appearance';
import Modal from '../modal';
import { FeedbackButton } from '../feedback';
import { type ArchiveController } from './use-archive';

export default function LeaveDialog({
  archive,
}: {
  archive: ArchiveController;
}) {
  const { t } = useLocale();
  const { setModal, generated, copy } = archive;

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
          <FeedbackButton
            className="primary"
            onClick={() => void copy(generated)}
          >
            {t('common.copyLink')}
          </FeedbackButton>
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
