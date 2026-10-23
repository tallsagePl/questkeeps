'use client';

import { useLocale } from '@/components/appearance';
import { api } from '../api';
import { FolderSearchButton } from '../folder-search';
import Modal from '../modal';
import { FeedbackButton } from '../feedback';
import { type ArchiveController } from './use-archive';
import { Icon } from './shared';

export default function FolderDialog({
  archive,
}: {
  archive: ArchiveController;
}) {
  const { t, m } = useLocale();
  const {
    selected,
    setModal,
    busy,
    yandex,
    accounts,
    account,
    folder,
    folders,
    folderStatus,
    folderOffset,
    isOwner,
    setNotice,
    action,
    reloadSettings,
    browse,
  } = archive;
  const trip = archive.trip!;
  return (
    <>
      <Modal title={t('trip.connectFolder')} onClose={() => setModal('')}>
        <div className="stack">
          <p className="muted">{t('trip.chooseYourAccountAndAFolderFor')}</p>
          <label className="field">
            <span>{t('common.yandexAccount')}</span>
            <select
              value={account}
              onChange={(e) =>
                void action(() => browse(e.target.value, 'disk:/'))
              }
            >
              <option value="">{t('trip.chooseAnAccount')}</option>
              {accounts.map((a) => (
                <option value={a.id} key={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
          </label>
          {yandex && !accounts.length ? (
            <a
              href={
                '/api/auth/yandex?intent=link&returnTo=' +
                encodeURIComponent(selected ? '/?trip=' + selected : '/')
              }
              className="text-button"
            >
              {t('trip.connectAnotherAccount')}
            </a>
          ) : !accounts.length ? (
            <p className="fine">
              {t('common.yandexDiskIsNotConfiguredYetContact')}
            </p>
          ) : null}
          {account && (
            <>
              <div className="folder-path">
                <FeedbackButton
                  className="text-button"
                  disabled={busy || folder === 'disk:/'}
                  onClick={() =>
                    void action(() =>
                      browse(
                        account,
                        folder.lastIndexOf('/') <= 5
                          ? 'disk:/'
                          : folder.slice(0, folder.lastIndexOf('/')),
                      ),
                    )
                  }
                >
                  ↑
                </FeedbackButton>
                <code>{folder}</code>
              </div>
              <div className="folder-list">
                {folders.map((f) => (
                  <FeedbackButton
                    className="folder"
                    key={f.path}
                    onClick={() => void action(() => browse(account, f.path))}
                  >
                    <Icon name="cloud" />
                    {f.name}
                    <Icon name="arrow" size={15} />
                  </FeedbackButton>
                ))}
                {!folders.length && !folderStatus && (
                  <p className="folder-empty">
                    {t(
                      folderOffset !== null
                        ? 'common.noSubfoldersOnThisPageKeepSearching'
                        : 'trip.noSubfolders',
                    )}
                  </p>
                )}
                <FolderSearchButton
                  busy={busy}
                  onClick={() =>
                    void action(() =>
                      browse(account, folder, folderOffset ?? 0, true),
                    )
                  }
                />
              </div>
              <div
                className="folder-feedback"
                role="status"
                aria-live="polite"
                aria-atomic="true"
              >
                {m(folderStatus)}
              </div>
              <FeedbackButton
                className="primary"
                disabled={busy || folder === 'disk:/'}
                onClick={() =>
                  void action(async () => {
                    await api('trips/' + trip.id + '/sources', 'POST', {
                      accountId: account,
                      path: folder,
                    });
                    await reloadSettings();
                    setModal('');
                    setNotice(
                      isOwner
                        ? t(
                            'trip.folderConnectedStartSynchronizationToImportPhotos',
                          )
                        : t('trip.folderSentToTheOwnerForApproval'),
                    );
                  })
                }
              >
                {t('common.selectThisFolder')}
                <Icon name="arrow" />
              </FeedbackButton>
            </>
          )}
        </div>
      </Modal>
    </>
  );
}
