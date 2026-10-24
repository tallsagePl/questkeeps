'use client';

import { useEffect, useRef, useState, useId } from 'react';
import VideoViewer from './video-viewer';
import { useMediaReload, MediaReloadButton } from './media-reload';
import MediaVisibilityControls from './media-visibility-controls';
import { api } from './api';
import { useLocale } from './appearance';
import { Collapse } from './smooth-details';
import MediaPreview from './media-preview';
import PhotoViewer from './photo-viewer';
import Modal from './modal';
import { PreviewPriority } from './preview-priority';

type Group = { id: string; title: string; count: number };

type File = {
  id: string;
  name: string;
  title?: string | null;
  kind: string;
  taken: string;
  hidden: number;
  hidden_from_guests?: number;
  missing: number;
  revision: string;
};

const fileTitle = (file: File) =>
  file.title || file.name.replace(/\.[^.]+$/, '');

export default function ProfileFiles({ userId }: { userId: string }) {
  const { t, m } = useLocale();
  const [groups, setGroups] = useState<Group[]>([]);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const c = new AbortController();
    setLoaded(false);
    api('my-media/groups', 'GET', undefined, c.signal)
      .then((r) => {
        if (!c.signal.aborted) {
          setGroups(r.groups);
          setError('');
          setLoaded(true);
        }
      })
      .catch((e) => {
        if (!c.signal.aborted) {
          setError(e.message);
          setLoaded(true);
        }
      });
    return () => c.abort();
  }, [userId, revision]);
  return (
    <section className="my-files-section" id="my-files">
      <h2>{t('profileFiles.myPublishedFiles')}</h2>
      <p className="muted">{t('profileFiles.youCanHideYourOwnPhotosEven')}</p>
      {!loaded && <p role="status">{t('common.loading')}</p>}
      {error && (
        <p role="alert">
          {m(error)}{' '}
          <button
            className="text-button"
            onClick={() => setRevision((n) => n + 1)}
          >
            {t('common.retry')}
          </button>
        </p>
      )}
      {loaded && !error && !groups.length && (
        <p className="fine">{t('profileFiles.noPhotosYet')}</p>
      )}
      {groups.map((g) => (
        <FileGroup key={g.id} group={g} userId={userId} />
      ))}
    </section>
  );
}

function FileGroup({ group, userId }: { group: Group; userId: string }) {
  const { t, m, language } = useLocale();
  const [open, setOpen] = useState(false);
  const [visited, setVisited] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const reload = useMediaReload(selected?.id || '');
  const panel = useId();
  const scroll = useRef<HTMLDivElement>(null);
  const controller = useRef<AbortController | null>(null);
  const pending = useRef(false);
  const initialized = useRef(false);
  useEffect(() => () => controller.current?.abort(), []);
  async function load(cursor?: string) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError('');
    const c = new AbortController();
    controller.current = c;
    try {
      const r = await api(
        'my-media?trip=' +
          encodeURIComponent(group.id) +
          (cursor ? '&cursor=' + encodeURIComponent(cursor) : ''),
        'GET',
        undefined,
        c.signal,
      );
      if (c.signal.aborted) return;
      setFiles((old) =>
        cursor
          ? [
              ...old,
              ...r.media.filter((m: File) => !old.some((f) => f.id === m.id)),
            ]
          : r.media,
      );
      setNext(r.next);
      setLoaded(true);
    } catch (e) {
      if (!c.signal.aborted) setError((e as Error).message);
    } finally {
      pending.current = false;
      if (!c.signal.aborted) setBusy(false);
    }
  }
  function toggle() {
    const opening = !open;
    setOpen(opening);
    if (opening) {
      setVisited(true);
      if (!initialized.current) {
        initialized.current = true;
        void load();
      }
    }
  }
  const start = Math.max(0, Math.floor(offset / 88) - 4);
  const end = Math.min(files.length, start + 15);
  const scope = 'profile:' + userId;
  const url = (m: File, kind: string) =>
    '/api/my-media/' +
    encodeURIComponent(m.id) +
    '/' +
    kind +
    '?v=' +
    encodeURIComponent(m.revision || '');
  return (
    <div className="profile-file-group">
      <h3>
        <button
          className="profile-group-toggle"
          onClick={toggle}
          aria-expanded={open}
          aria-controls={panel}
        >
          <span>{group.title}</span>
          <span className="profile-file-count">{group.count}</span>
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            aria-hidden="true"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
      </h3>
      <Collapse open={open} id={panel}>
        {visited && (
          <div>
            <div
              className="profile-file-scroll"
              ref={scroll}
              tabIndex={0}
              role="region"
              aria-label={group.title}
              onScroll={(e) => {
                const el = e.currentTarget;
                setOffset(el.scrollTop);
                if (
                  open &&
                  next &&
                  !busy &&
                  !error &&
                  el.scrollHeight - el.scrollTop - el.clientHeight < 350
                )
                  void load(next);
              }}
            >
              <ul
                className="profile-file-rows"
                style={{
                  paddingTop: start * 88,
                  paddingBottom: Math.max(0, files.length - end) * 88,
                }}
              >
                {files.slice(start, end).map((m) => (
                  <li key={m.id}>
                    <button
                      className="profile-file-row"
                      onClick={() => {
                        setError('');
                        setSelected(m);
                      }}
                    >
                      <span>
                        <strong>{fileTitle(m)}</strong>
                        <small>
                          {new Date(
                            m.taken.slice(0, 10) + 'T12:00:00',
                          ).toLocaleDateString(
                            language === 'en' ? 'en-GB' : 'ru-RU',
                          )}
                          {m.hidden
                            ? ' · ' + t('profileFiles.hidden')
                            : m.hidden_from_guests
                              ? ' · ' + t('visibility.membersOnly')
                              : ''}
                          {m.missing
                            ? ' · ' + t('profileFiles.fileUnavailable')
                            : ''}
                        </small>
                      </span>
                      <span className="profile-file-thumb">
                        <PreviewPriority.Provider value={open ? 1 : null}>
                          {!m.missing && (
                            <MediaPreview
                              src={url(m, 'preview')}
                              scope={scope}
                              kind={m.kind}
                            />
                          )}
                        </PreviewPriority.Provider>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            {error && <p role="alert">{m(error)}</p>}
            {busy && (
              <p role="status" className="fine">
                {t('common.loading')}
              </p>
            )}
            {!busy && error && (
              <button
                className="text-button file-load-more"
                onClick={() => void load(next || undefined)}
              >
                {t('common.retry')}
              </button>
            )}
            {loaded && !files.length && (
              <p className="fine">{t('profileFiles.noPhotosYet')}</p>
            )}
          </div>
        )}
      </Collapse>
      {selected && (
        <Modal
          title={fileTitle(selected)}
          wide
          fullscreen
          headerActions={<MediaReloadButton onClick={reload.reload} />}
          doubleBackdropClick
          onClose={() => setSelected(null)}
        >
          <PreviewPriority.Provider value={0}>
            {selected.missing ? (
              <p>{t('profileFiles.fileUnavailable')}</p>
            ) : selected.kind === 'video' ? (
              <VideoViewer
                key={reload.key}
                src={reload.source(url(selected, 'original'))}
              />
            ) : (
              <PhotoViewer
                key={reload.key}
                preview={reload.source(url(selected, 'preview'))}
                original={reload.source(url(selected, 'original'))}
                scope={scope}
                title={fileTitle(selected)}
              />
            )}
          </PreviewPriority.Provider>
          <div className="profile-file-modal-actions">
            <a className="secondary" href={url(selected, 'download')}>
              {t('common.downloadOriginal')}
            </a>
            <MediaVisibilityControls
              hidden={selected.hidden}
              hiddenFromGuests={selected.hidden_from_guests}
              disabled={saving}
              onChange={async (change) => {
                setSaving(true);
                setError('');
                try {
                  await api('media/' + selected.id, 'PATCH', change);
                  const updated = {
                    ...selected,
                    ...(change.hidden !== undefined
                      ? { hidden: Number(change.hidden) }
                      : {}),
                    ...(change.hiddenFromGuests !== undefined
                      ? { hidden_from_guests: Number(change.hiddenFromGuests) }
                      : {}),
                  };
                  setFiles((old) =>
                    old.map((f) => (f.id === updated.id ? updated : f)),
                  );
                  setSelected((current) =>
                    current?.id === updated.id ? updated : current,
                  );
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setSaving(false);
                }
              }}
            />
          </div>
          {error && <p role="alert">{m(error)}</p>}
        </Modal>
      )}
    </div>
  );
}
