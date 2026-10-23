'use client';

import { useLocale } from '@/components/appearance';
import { PersonAvatar } from '../friends';
import { api } from '../api';
import { FeedbackButton } from '../feedback';
import { type ArchiveController } from './use-archive';
import { date, period, Icon } from './shared';

export default function SettingsTab({
  archive,
}: {
  archive: ArchiveController;
}) {
  const { t, m } = useLocale();
  const {
    tab,
    setModal,
    busy,
    members,
    tripOwner,
    sources,
    setAccount,
    setFolder,
    setFolders,
    setGenerated,
    isOwner,
    guest,
    setNotice,
    action,
    refresh,
    reloadSettings,
  } = archive;
  const trip = archive.trip!;
  return (
    <>
      {tab === 'settings' && !guest && (
        <div className="settings-grid">
          <div className="settings-sources">
            <section className="panel">
              <div className="panel-title">
                <div>
                  <span className="eyebrow">{t('trip.sourcesOfMemories')}</span>
                  <h2>{t('common.yandexDisk')}</h2>
                </div>
                <Icon name="cloud" size={28} />
              </div>
              <p className="muted">
                {t('trip.onlySelectedFoldersAndTripDatesAre')}
              </p>
              <div className="source-list">
                {sources.length ? (
                  sources.map((s) => (
                    <article className="source" key={s.id}>
                      <div>
                        <strong>{s.path.replace('disk:/', '')}</strong>
                        <p>
                          {s.author} · {s.label}
                        </p>
                        <span
                          className={'status ' + (s.approved ? 'approved' : '')}
                        >
                          {s.approved
                            ? t('trip.connected')
                            : t('trip.awaitingApproval')}
                        </span>
                        <small>
                          {s.last_sync
                            ? t('sync.updatedAt', {
                                date: new Date(s.last_sync).toLocaleString(
                                  document.documentElement.lang === 'en'
                                    ? 'en-GB'
                                    : 'ru-RU',
                                ),
                              })
                            : t('trip.notSyncedYet')}
                        </small>
                        {s.error && (
                          <p className="inline-error">{m(s.error)}</p>
                        )}
                      </div>
                      <div className="source-actions">
                        {isOwner && !s.approved && (
                          <FeedbackButton
                            className="secondary"
                            disabled={busy}
                            onClick={() =>
                              void action(async () => {
                                await api(
                                  'trips/' + trip.id + '/sources/' + s.id,
                                  'PATCH',
                                  {
                                    approved: true,
                                  },
                                );
                                await reloadSettings();
                              })
                            }
                          >
                            {t('trip.approve')}
                          </FeedbackButton>
                        )}
                        {!!s.approved && (
                          <FeedbackButton
                            className="icon-button"
                            title={t('trip.syncFolder')}
                            aria-label={t('trip.syncFolder')}
                            disabled={busy}
                            onClick={() =>
                              void action(async () => {
                                const r = await api(
                                  'trips/' +
                                    trip.id +
                                    '/sources/' +
                                    s.id +
                                    '/sync',
                                  'POST',
                                  {},
                                );
                                await reloadSettings();
                                await refresh();
                                setNotice(
                                  r.busy
                                    ? t('trip.synchronizationIsAlreadyRunning')
                                    : t('sync.complete', {
                                        count: r.count,
                                      }),
                                );
                              })
                            }
                          >
                            <Icon name="refresh" />
                          </FeedbackButton>
                        )}
                      </div>
                    </article>
                  ))
                ) : (
                  <p className="empty-small">
                    {t('trip.noFoldersConnectedYet')}
                  </p>
                )}
              </div>
              <FeedbackButton
                className="secondary"
                onClick={() => {
                  setModal('source');
                  setFolders([]);
                  setAccount('');
                  setFolder('disk:/');
                }}
              >
                <Icon name="plus" />
                {t('trip.connectFolder')}
              </FeedbackButton>
              <p className="fine">
                {t('trip.automaticUpdatesRunEvery15MinutesWhile')}
              </p>
            </section>
            {isOwner && (
              <section className="panel share-panel">
                <div>
                  <span className="eyebrow">{t('trip.shareYourMemories')}</span>
                  <h2>{t('trip.guestView')}</h2>
                  <p className="muted">
                    {t('trip.anyoneWithTheSecretLinkCanView')}
                  </p>
                  <span className="status">
                    {trip.sharing
                      ? t('trip.linkIsActive')
                      : t('trip.linkAccessIsOff')}
                  </span>
                </div>
                <div className="stack">
                  <FeedbackButton
                    className="secondary"
                    disabled={busy}
                    onClick={() =>
                      void action(async () => {
                        const r = await api(
                          'trips/' + trip.id + '/share',
                          trip.sharing ? 'GET' : 'POST',
                          trip.sharing ? undefined : { enabled: true },
                        );
                        setGenerated(r.url);
                        setModal('share');
                        await refresh();
                      })
                    }
                  >
                    <Icon name="link" />
                    {trip.sharing
                      ? t('trip.getGuestLink')
                      : t('trip.createLink')}
                  </FeedbackButton>
                  {trip.sharing && (
                    <FeedbackButton
                      className="text-button"
                      disabled={busy}
                      onClick={() => {
                        if (!window.confirm(t('trip.replaceGuestLinkConfirm')))
                          return;
                        void action(async () => {
                          const result = await api(
                            'trips/' + trip.id + '/share',
                            'POST',
                            { enabled: true },
                          );
                          setGenerated(result.url);
                          setModal('share');
                          await refresh();
                        });
                      }}
                    >
                      {t('common.replaceLink')}
                    </FeedbackButton>
                  )}
                  {trip.sharing && (
                    <FeedbackButton
                      className="text-button danger"
                      disabled={busy}
                      onClick={() =>
                        void action(async () => {
                          await api('trips/' + trip.id + '/share', 'POST', {
                            enabled: false,
                          });
                          await refresh();
                          setNotice('trip.guestLinkRevoked');
                        })
                      }
                    >
                      {t('trip.revokeAccess')}
                    </FeedbackButton>
                  )}
                </div>
              </section>
            )}
          </div>
          <section className="panel">
            <div className="panel-title">
              <div>
                <span className="eyebrow">
                  {t('trip.thePeopleInThisStory')}
                </span>
                <h2>{t('trip.members')}</h2>
              </div>
              <Icon name="users" size={28} />
            </div>
            <div className="member">
              {tripOwner && <PersonAvatar person={tripOwner} />}
              <div>
                <strong>{tripOwner?.name || t('trip.owner')}</strong>
                <p>
                  {t('trip.ownerPrefix')} {period(trip)}
                </p>
              </div>
            </div>
            {members.map((m) => (
              <div className="member" key={m.id}>
                <PersonAvatar person={m} />
                <div>
                  <strong>{m.name}</strong>
                  <p>
                    {date(m.start)} — {date(m.end)} ·{' '}
                    {m.active ? t('trip.member') : t('trip.leftTheTrip')}
                  </p>
                  {!!m.active && (
                    <small>
                      {t(
                        m.all_photos
                          ? 'invitations.viewAll'
                          : 'invitations.viewPeriod',
                      )}
                    </small>
                  )}
                </div>
                {isOwner && !!m.active && (
                  <FeedbackButton
                    className="text-button"
                    onClick={() => {
                      setGenerated('');
                      setModal('member:' + m.id);
                    }}
                  >
                    {t('trip.edit')}
                  </FeedbackButton>
                )}
              </div>
            ))}
            {isOwner ? (
              <FeedbackButton
                className="secondary"
                onClick={() => {
                  setGenerated('');
                  setModal('invite');
                }}
              >
                <Icon name="plus" />
                {t('trip.inviteAMember')}
              </FeedbackButton>
            ) : (
              <FeedbackButton
                className="text-button danger"
                onClick={() => setModal('leave')}
              >
                {t('trip.leaveTrip')}
              </FeedbackButton>
            )}
          </section>
        </div>
      )}
    </>
  );
}
