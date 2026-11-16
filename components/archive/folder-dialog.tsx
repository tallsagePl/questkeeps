'use client';

import { useEffect, useState } from 'react';
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
  const [accounts, setAccounts] = useState<
    { id: string; label: string }[] | null
  >(null);
  const [accountError, setAccountError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const {
    selected,
    tab,
    setModal,
    busy,
    yandex,
    account,
    folder,
    folders,
    folderStatus,
    folderOffset,
    isOwner,
    setNotice,
    action,
    reloadSettings,
    refresh,
    browse,
  } = archive;
  const trip = archive.trip!;
  useEffect(() => {
    const controller = new AbortController();
    setAccountError('');
    void api<{ accounts: { id: string; label: string }[] }>(
      'accounts',
      'GET',
      undefined,
      controller.signal,
    )
      .then((result) => {
        if (!controller.signal.aborted) setAccounts(result.accounts);
      })
      .catch((error) => {
        if (!controller.signal.aborted) setAccountError(error.message);
      });
    return () => controller.abort();
  }, [attempt]);

  return (
    <>
      <Modal title={t('trip.connectFolder')} onClose={() => setModal('')}>
        <div className="stack">
          <p className="muted">{t('trip.chooseYourAccountAndAFolderFor')}</p>
          <label className="field">
            <span>{t('common.yandexAccount')}</span>
            <select
              value={account}
              disabled={!accounts?.length}
              onChange={(e) =>
                void action(() => browse(e.target.value, 'disk:/'))
              }
            >
              <option value="">{t('trip.chooseAnAccount')}</option>
              {accounts?.map((a) => (
                <option value={a.id} key={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
          </label>
          {accountError ? (
            <p role="alert" className="field-error">
              {m(accountError)}{' '}
              <FeedbackButton
                className="text-button"
                onClick={() => setAttempt((value) => value + 1)}
              >
                {t('common.retry')}
              </FeedbackButton>
            </p>
          ) : !accounts ? (
            <p className="fine" role="status">
              {t('createTrip.checkingAccounts')}
            </p>
          ) : yandex && !accounts.length ? (
            <a
              href={
                '/api/auth/yandex?intent=link&returnTo=' +
                encodeURIComponent(
                  selected ? '/?trip=' + selected + '&source=1' : '/',
                )
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
                    setModal('');
                    if (tab === 'settings') await reloadSettings();
                    await refresh();
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
