'use client';

import { useEffect, useState } from 'react';
import { PersonAvatar, type Person } from '../friends';
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
  const { t, m } = useLocale();
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
  const [mode, setMode] = useState<'link' | 'person'>('link');
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState<Person[]>([]);
  const [recipient, setRecipient] = useState<Person | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [searched, setSearched] = useState(false);
  const [start, setStart] = useState(
    members.find((m) => 'member:' + m.id === modal)?.start || trip.start,
  );
  useEffect(() => {
    if (mode !== 'person' || query.trim().length < 3) {
      setUsers([]);
      setSearched(false);
      setSearching(false);
      return;
    }
    const controller = new AbortController();
    setUsers([]);
    setSearching(true);
    setSearchError('');
    setSearched(false);
    const timer = window.setTimeout(() => {
      void api(
        'trips/' + trip.id + '/invitees?q=' + encodeURIComponent(query.trim()),
        'GET',
        undefined,
        controller.signal,
      )
        .then((r) => {
          if (!controller.signal.aborted) {
            setUsers(r.users);
            setSearched(true);
          }
        })
        .catch((e) => {
          if (!controller.signal.aborted) setSearchError(e.message);
        })
        .finally(() => {
          if (!controller.signal.aborted) setSearching(false);
        });
    }, 300);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [mode, query, trip.id]);
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
              const fields = values(e);
              const input = {
                start: fields.start,
                end: fields.end,
                allPhotos: fields.allPhotos === 'on',
              };
              void action(async () => {
                if (modal === 'invite') {
                  const r = await api('trips/' + trip.id + '/invite', 'POST', {
                    ...input,
                    ...(mode === 'person'
                      ? { recipientId: recipient!.id }
                      : {}),
                  });
                  if (r.sent) {
                    archive.setNotice(t('invitations.sent'));
                    setModal('');
                  } else setGenerated(r.url);
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
            {modal === 'invite' && (
              <fieldset className="invite-method">
                <legend>{t('invitations.method')}</legend>
                <label>
                  <input
                    type="radio"
                    name="method"
                    checked={mode === 'link'}
                    onChange={() => setMode('link')}
                  />
                  {t('invitations.byLink')}
                </label>
                <label>
                  <input
                    type="radio"
                    name="method"
                    checked={mode === 'person'}
                    onChange={() => setMode('person')}
                  />
                  {t('invitations.inApp')}
                </label>
              </fieldset>
            )}
            {modal === 'invite' && mode === 'person' && (
              <div className="stack invite-search">
                <Field
                  label={t('invitations.searchLabel')}
                  type="search"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setRecipient(null);
                  }}
                  maxLength={254}
                />
                <p className="fine">{t('invitations.searchHint')}</p>
                {searching && <p role="status">{t('invitations.searching')}</p>}
                {searchError && <p role="alert">{m(searchError)}</p>}
                {searched && !users.length && (
                  <p role="status">{t('invitations.noUsers')}</p>
                )}
                <div
                  className="invite-search-results"
                  role="group"
                  aria-label={t('invitations.searchResults')}
                >
                  {users.map((person) => (
                    <button
                      key={person.id}
                      type="button"
                      className="invite-person secondary"
                      aria-pressed={recipient?.id === person.id}
                      onClick={() => setRecipient(person)}
                    >
                      <PersonAvatar key={person.id} person={person} />
                      <span>
                        <strong>{person.name}</strong>
                        <small>@{person.username}</small>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            <p className="muted">{t('invitations.datesHint')}</p>
            <Field
              label={t('trip.from')}
              name="start"
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
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
              min={start || trip.start}
              max={trip.end}
              required
            />
            <label className="invite-all-photos">
              <input
                type="checkbox"
                name="allPhotos"
                defaultChecked={
                  !!members.find((m) => 'member:' + m.id === modal)?.all_photos
                }
              />{' '}
              <span>{t('invitations.allPhotos')}</span>
            </label>
            <p className="fine">{t('invitations.visibilityHint')}</p>
            <FeedbackButton
              className="primary"
              disabled={
                busy || (modal === 'invite' && mode === 'person' && !recipient)
              }
            >
              {modal === 'invite'
                ? t(
                    mode === 'person'
                      ? 'invitations.send'
                      : 'trip.createInvitation',
                  )
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
