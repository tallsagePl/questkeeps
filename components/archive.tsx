'use client';

import { FriendLinkArrival } from './friend-link';
import { registrationPasswordPattern } from '../lib/password-policy';
import WelcomeSlideshow from './welcome-slideshow';
import { isAreaPlace } from '../lib/place-kind';
import {
  announceSessionChange,
  observeSessionChanges,
} from '../lib/browser-session';
import { Collapse } from './smooth-details';
import NoteThread from './note-thread';
import { useLocale } from '@/components/appearance';
import { translateCurrent } from '@/lib/i18n/translate';
import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  FormEvent,
  ReactNode,
} from 'react';
import dynamic from 'next/dynamic';
import { AppearanceControls } from './appearance';
import { api } from './api';
import {
  readFolderPages,
  mergeFolders,
  FolderSearchButton,
} from './folder-search';
import UserAvatar from './user-avatar';
import Friends from './friends';
import { migratePrivateStorage } from '../lib/browser-storage';
import { signOut } from './social-shell';
import VirtualGallery from './virtual-gallery';
import MediaPreview from './media-preview';
import PhotoViewer from './photo-viewer';
import Modal from './modal';
import {
  initializeNavigation,
  navigationTab,
  pushNavigation,
} from '../lib/navigation';
import PlaceDelete from './place-delete';
import PhotoLocation from './photo-location';
import TripDayCalendar from './trip-day-calendar';
import { includesDate } from '../lib/date-selection';
import { groupPlacePhotos } from '../lib/place-photo-groups';
import DiscoveredPlaces from './discovered-places';
import ConfirmedPlaceDetails from './confirmed-place-details';
import LocalizedArticle from './localized-article';
import TripDescription from './trip-description';
import LocationForm from './location-form';
import PlaceRecommendations from './place-recommendations';
import TripPreloader, { tripMapScope } from './trip-preloader';
import { distanceMeters } from '../lib/geo';
import { BackToTop, FavoriteButton, MediaTitle } from './media-controls';
import CreateTrip from './create-trip';
import Brand, { LogoMark, HeaderBrand } from './brand';
import {
  ApiError,
  FeedbackProvider,
  useFeedback,
  FeedbackForm,
  FeedbackButton,
  PageFeedback,
  Field,
} from './feedback';

const t = translateCurrent;

type Row = Record<string, any>;

const TravelMap = dynamic(() => import('./map'), {
  ssr: false,
  loading: () => <div className="empty">{t('trip.loadingTheMap')}</div>,
});

const date = (value: string) =>
  new Date(value.slice(0, 10) + 'T12:00:00').toLocaleDateString(
    typeof document !== 'undefined' && document.documentElement.lang === 'en'
      ? 'en-GB'
      : 'ru-RU',
    {
      day: 'numeric',
      month: 'short',
    },
  );

const period = (trip: Row) =>
  date(trip.start) + ' — ' + date(trip.end) + ', ' + trip.start.slice(0, 4);

function values(event: FormEvent<HTMLFormElement>) {
  event.preventDefault();
  return Object.fromEntries(new FormData(event.currentTarget));
}

function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const paths: Record<string, ReactNode> = {
    compass: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="m16 8-3 5-5 3 3-5Z" />
      </>
    ),
    plus: <path d="M12 5v14M5 12h14" />,
    arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
    pin: (
      <>
        <path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 0 1 14 0Z" />
        <circle cx="12" cy="10" r="2" />
      </>
    ),
    photo: (
      <>
        <rect x="3" y="4" width="18" height="16" rx="3" />
        <circle cx="8" cy="9" r="1" />
        <path d="m3 17 5-5 4 4 3-3 6 5" />
      </>
    ),
    users: (
      <>
        <circle cx="9" cy="8" r="3" />
        <path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 5" />
      </>
    ),
    book: (
      <>
        <path d="M4 4h7a3 3 0 0 1 3 3v14a4 4 0 0 0-4-2H4Zm16 0h-3a3 3 0 0 0-3 3v14a4 4 0 0 1 4-2h2Z" />
      </>
    ),
    settings: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2" />
      </>
    ),
    refresh: (
      <>
        <path d="M20 7v5h-5M4 17v-5h5" />
        <path d="M5 8a8 8 0 0 1 13-3l2 3M4 16l2 3a8 8 0 0 0 13-3" />
      </>
    ),
    cloud: (
      <>
        <path d="M7 18h11a4 4 0 0 0 0-8 6 6 0 0 0-12-1 4.5 4.5 0 0 0 1 9Z" />
      </>
    ),
    'chevron-left': <path d="m15 6-6 6 6 6" />,
    'chevron-right': <path d="m9 6 6 6-6 6" />,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    link: (
      <>
        <path d="m10 7 3-3a5 5 0 0 1 7 7l-3 3M7 10l-3 3a5 5 0 0 0 7 7l3-3m-6-1 8-8" />
      </>
    ),
    logout: <path d="M9 4H4v16h5m5-12 4 4-4 4M9 12h10" />,
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] || paths.compass}
    </svg>
  );
}

export default function Archive(props: { share?: string; invite?: string }) {
  return (
    <FeedbackProvider>
      <ArchiveContent {...props} />
    </FeedbackProvider>
  );
}

function ArchiveContent({
  share,
  invite,
}: {
  share?: string;
  invite?: string;
}) {
  const { t, m } = useLocale();
  const [user, setUser] = useState<Row | null>(null);
  const [ready, setReady] = useState(false);
  const [bootFailed, setBootFailed] = useState(false);
  const [verificationEmail, setVerificationEmail] = useState('');
  const [trips, setTrips] = useState<Row[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [data, setData] = useState<Row | null>(null);
  const [tab, setTab] = useState('gallery');
  const [filter, setFilter] = useState('all');
  const [galleryTarget, setGalleryTarget] = useState<string | null>(null);
  const [day, setDay] = useState('');
  const [modal, setModal] = useState('');
  const [busy, setBusy] = useState(false);
  const [yandex, setYandex] = useState(false);
  const [register, setRegister] = useState(false);
  const [members, setMembers] = useState<Row[]>([]);
  const [tripOwner, setTripOwner] = useState<Row | null>(null);
  const [sources, setSources] = useState<Row[]>([]);
  const [accounts, setAccounts] = useState<Row[]>([]);
  const [account, setAccount] = useState('');
  const [folder, setFolder] = useState('disk:/');
  const [folders, setFolders] = useState<Row[]>([]);
  const [folderStatus, setFolderStatus] = useState('');
  const [folderOffset, setFolderOffset] = useState<number | null>(null);
  const [generated, setGenerated] = useState('');
  const [activeMedia, setActiveMedia] = useState<Row | null>(null);
  const [mediaPlaceUrl, setMediaPlaceUrl] = useState<string | null>(null);
  const [mediaFocusPlaceUrl, setMediaFocusPlaceUrl] = useState<string | null>(
    null,
  );
  const [suggestions, setSuggestions] = useState<Row[]>([]);
  const [placesOpen, setPlacesOpen] = useState(false);
  const [invitation, setInvitation] = useState<Row | null>(null);
  const trip = data?.trip;
  const isOwner = trip?.role === 'owner';
  const guest = !!share;
  const { active, clear, report, setError, setNotice } = useFeedback();
  const feedbackRef = useRef({
    clear,
    report,
  });
  feedbackRef.current = {
    clear,
    report,
  };
  const mounted = useRef(true);
  const identityGeneration = useRef(0);
  const navigationGeneration = useRef(0);
  const action = useCallback(
    async (task: () => Promise<void>) => {
      setBusy(true);
      const scope = active.current;
      feedbackRef.current.clear();
      try {
        await task();
      } catch (e) {
        feedbackRef.current.report(e, scope);
      } finally {
        if (mounted.current) setBusy(false);
      }
    },
    [active],
  );
  useEffect(() => {
    void migratePrivateStorage().catch(() => {});
    const stop = observeSessionChanges();
    const ending = () => {
      identityGeneration.current++;
      setUser(null);
      setTrips([]);
      setSelected(null);
      setData(null);
      setAccounts([]);
      setMembers([]);
      setSources([]);
      setTripOwner(null);
      setAccount('');
      setFolder('disk:/');
      setFolders([]);
      setGenerated('');
      setActiveMedia(null);
      setSuggestions([]);
      setInvitation(null);
      setModal('');
    };
    window.addEventListener('questkeeps:session-ending', ending);
    return () => {
      stop();
      window.removeEventListener('questkeeps:session-ending', ending);
    };
  }, []);
  const loadTrips = useCallback(async () => {
    const generation = identityGeneration.current;
    const r = await api('trips');
    if (generation !== identityGeneration.current) return;
    setTrips(r.trips);
  }, []);
  const loadTrip = useCallback(async (tid: string) => {
    const generation = identityGeneration.current;
    const navigation = navigationGeneration.current;
    let r;
    try {
      r = await api('trips/' + tid);
    } catch (error) {
      if (
        generation !== identityGeneration.current ||
        navigation !== navigationGeneration.current
      )
        return;
      throw error;
    }
    if (
      generation !== identityGeneration.current ||
      navigation !== navigationGeneration.current
    )
      return;
    setData(r);
    setSelected(tid);
  }, []);
  const importing = !!(
    data?.importStatus?.waiting || data?.importStatus?.syncing
  );
  useEffect(() => {
    if (!selected || guest || !importing) return;
    const controller = new AbortController();
    let pending = false;
    const timer = setInterval(async () => {
      if (pending) return;
      pending = true;
      try {
        const result = await api(
          'trips/' + selected,
          'GET',
          undefined,
          controller.signal,
        );
        if (!controller.signal.aborted) setData(result);
      } catch {
        /* Keep the current view during transient failures; the next poll retries. */
      } finally {
        pending = false;
      }
    }, 3000);
    return () => {
      clearInterval(timer);
      controller.abort();
    };
  }, [selected, guest, importing]);
  const refresh = useCallback(async () => {
    if (share) {
      setData(await api('share/' + share));
    } else if (selected) {
      await loadTrip(selected);
    } else if (user) {
      await loadTrips();
    }
  }, [share, selected, user, loadTrip, loadTrips]);
  useEffect(() => {
    mounted.current = true;
    void action(async () => {
      let me;
      try {
        me = await api('me');
      } catch (error) {
        setBootFailed(true);
        throw error;
      }
      setUser(me.user);
      setYandex(me.yandexEnabled);
      if (share) setData(await api('share/' + share));
      else if (invite) setInvitation(await api('invites/' + invite));
      else if (me.user) {
        await loadTrips();
        const tid = new URLSearchParams(window.location.search).get('trip');
        if (tid) await loadTrip(tid);
        if (new URLSearchParams(window.location.search).get('create') === '1') {
          setModal('create');
          window.history.replaceState(null, '', '/');
        }
      }
      setReady(true);
    }).finally(() => setReady(true));
    return () => {
      mounted.current = false;
    };
  }, [share, invite, action, loadTrips, loadTrip]);
  useEffect(() => {
    if (!selected || guest || tab !== 'settings') return;
    void action(async () => {
      const [m, s, a] = await Promise.all([
        api('trips/' + selected + '/members'),
        api('trips/' + selected + '/sources'),
        api('accounts'),
      ]);
      setMembers(m.members);
      setTripOwner(m.owner);
      setSources(s.sources);
      setAccounts(a.accounts);
    });
  }, [selected, guest, tab, action]);
  const openTrip = (tid: string) => {
    setDay('');
    setTab('gallery');
    setError('');
    navigationGeneration.current++;
    pushNavigation('/?trip=' + encodeURIComponent(tid), 'gallery');
    void action(() => loadTrip(tid));
  };
  const openTab = (next: string) => {
    const view = guest && next === 'settings' ? 'gallery' : next;
    pushNavigation(window.location.href, view);
    setTab(view);
    setError('');
  };
  useEffect(() => {
    initializeNavigation();
    const view = navigationTab();
    setTab(guest && view === 'settings' ? 'gallery' : view);
  }, [guest]);
  useEffect(() => {
    const restore = () => {
      navigationGeneration.current++;
      setModal('');
      setActiveMedia(null);
      setDay('');
      setError('');
      const view = navigationTab();
      setTab(guest && view === 'settings' ? 'gallery' : view);
      if (share || invite) return;
      const tid = new URLSearchParams(window.location.search).get('trip');
      if (tid) {
        if (tid !== selected) void action(() => loadTrip(tid));
      } else {
        setSelected(null);
        setData(null);
        if (user) void action(loadTrips);
      }
    };
    window.addEventListener('popstate', restore);
    return () => window.removeEventListener('popstate', restore);
  }, [selected, user?.id, share, invite, guest, action, loadTrip, loadTrips]);
  const reloadSettings = async () => {
    if (!selected) return;
    setSources((await api('trips/' + selected + '/sources')).sources);
    setMembers((await api('trips/' + selected + '/members')).members);
  };
  const auth = (event: FormEvent<HTMLFormElement>) => {
    const input = values(event);
    void action(async () => {
      if (register && input.password !== input.passwordConfirmation)
        throw new ApiError(t('trip.passwordsDoNotMatch'), {
          passwordConfirmation: t('trip.passwordsDoNotMatch'),
        });
      const r = await api(
        'auth/' + (register ? 'register' : 'login'),
        'POST',
        input,
      );
      if (r.verificationRequired) {
        setVerificationEmail(r.verificationEmail);
        setNotice(m(r.message));
        return;
      }
      announceSessionChange();
      setUser(r.user);
      setModal('');
      await loadTrips();
      if (!invite) window.history.replaceState(null, '', '/');
    });
  };
  const folderGeneration = useRef(0);
  const browse = async (a: string, p: string, offset = 0, search = false) => {
    const generation = ++folderGeneration.current;
    setFolderStatus('');
    if (!a) {
      setAccount('');
      setFolders([]);
      return;
    }
    const r = await readFolderPages(
      a,
      p,
      offset,
      search,
      () => generation === folderGeneration.current,
    );
    if (generation !== folderGeneration.current) return;
    setAccount(a);
    setFolder(p);
    const merged = search
      ? mergeFolders(folders as { name: string; path: string }[], r.folders)
      : r.folders;
    setFolders(merged);
    setFolderOffset(r.nextOffset);
    if (search)
      setFolderStatus(
        r.nextOffset !== null && !r.folders.length
          ? 'common.noSubfoldersFoundYetYouCanKeep'
          : merged.length === 0
            ? 'common.noSubfoldersFoundYouCanSelectThe'
            : merged.length === folders.length
              ? 'common.noNewSubfoldersFound'
              : 'common.subfoldersFoundSelectOneFromTheList',
      );
  };
  const visible = useMemo(
    () =>
      (data?.media || []).filter(
        (m: Row) =>
          (filter === 'all' ||
            (filter === 'favorites' ? !!m.favorite : m.kind === filter)) &&
          includesDate(m.taken, day),
      ),
    [data, filter, day],
  );
  const discoveredPlaces = useMemo(() => {
    const seen = new Set<string>();
    return [...(data?.places || [])]
      .filter((place: Row) => includesDate(place.day, day))
      .sort((a: Row, b: Row) =>
        (a.day || '9999-12-31').localeCompare(b.day || '9999-12-31'),
      )
      .filter((place: Row) => {
        if (seen.has(place.url)) return false;
        seen.add(place.url);
        return true;
      });
  }, [data?.places, day]);
  const placePhotoGroups = useMemo(
    () =>
      groupPlacePhotos((data?.media || []) as any[], data?.places || [], day),
    [data?.media, data?.places, day],
  );
  const placePrevious = useRef<HTMLButtonElement>(null);
  const placeNext = useRef<HTMLButtonElement>(null);
  const viewerPlacePhotos = mediaPlaceUrl
    ? placePhotoGroups.get(mediaPlaceUrl) || []
    : [];
  const viewerPlaceIndex = viewerPlacePhotos.findIndex(
    (photo) => photo.id === activeMedia?.id,
  );
  const hasPlaceNavigation =
    viewerPlaceIndex >= 0 && viewerPlacePhotos.length > 1;
  const points = useMemo(
    () =>
      visible.filter((m: Row) => m.lat !== null && m.lon !== null && !m.hidden),
    [visible],
  );
  const mediaPath = (m: Row, kind: string) =>
    '/api/media/' + m.id + '/' + kind + (share ? '?share=' + share : '');
  const resourceScope = share ? 'guest:' + share : 'user:' + user?.id;
  const mapResourceScope = useMemo(
    () => (data ? tripMapScope(data, resourceScope) : resourceScope),
    [data, resourceScope],
  );
  const [placeTarget, setPlaceTarget] = useState<string | null>(null);
  const applyAddedPlace = (place: Row, title = place.title.slice(0, 160)) => {
    setData((old: Row | null) =>
      old
        ? {
            ...old,
            media: old.media.map((photo: Row) =>
              photo.id === place.media_id ? { ...photo, title } : photo,
            ),
            places: [
              ...old.places.filter((item: Row) => item.id !== place.id),
              place,
            ],
          }
        : old,
    );
    setActiveMedia((old: Row | null) =>
      old?.id === place.media_id ? { ...old, title } : old,
    );
  };
  const openMedia = (
    m: Row,
    placeUrl: string | null = null,
    focusPlace = false,
  ) => {
    setMediaPlaceUrl(placeUrl);
    setMediaFocusPlaceUrl(focusPlace ? placeUrl : null);
    setPlacesOpen(false);
    const latestPlace = data?.places
      .filter((place: Row) => place.media_id === m.id)
      .at(-1);
    setActiveMedia({
      ...m,
      title: m.title || latestPlace?.title.slice(0, 160),
    });
    setSuggestions([]);
    setError('');
  };
  useEffect(() => {
    if (!activeMedia || !mediaFocusPlaceUrl) return;
    const frame = requestAnimationFrame(() => {
      const target = [
        ...document.querySelectorAll<HTMLElement>(
          'dialog.modal .confirmed-photo-place',
        ),
      ].find((article) => article.dataset.placeUrl === mediaFocusPlaceUrl);
      target?.scrollIntoView({ block: 'start', behavior: 'instant' });
      target?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [activeMedia?.id, mediaFocusPlaceUrl]);
  const navigatePlacePhoto = (step: number) => {
    const photo = viewerPlacePhotos[viewerPlaceIndex + step];
    if (!photo || !hasPlaceNavigation) return;
    openMedia(photo, mediaPlaceUrl, !!mediaFocusPlaceUrl);
    requestAnimationFrame(() => {
      const arrow =
        step > 0
          ? placeNext.current || placePrevious.current
          : placePrevious.current || placeNext.current;
      if (!mediaFocusPlaceUrl)
        arrow
          ?.closest('dialog')
          ?.querySelector('.modal-body')
          ?.scrollTo({ top: 0, behavior: 'instant' });
      arrow?.focus({ preventScroll: true });
    });
  };
  useEffect(() => {
    if (
      guest ||
      !activeMedia ||
      activeMedia.hidden ||
      activeMedia.lat === null ||
      activeMedia.lon === null
    )
      return;
    let cancelled = false;
    void api('media/' + activeMedia.id + '/places')
      .then((r) => {
        if (!cancelled) setSuggestions(r.suggestions);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [
    guest,
    activeMedia?.id,
    activeMedia?.lat,
    activeMedia?.lon,
    activeMedia?.hidden,
  ]);
  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setNotice('common.linkCopied');
    } catch {
      setNotice('trip.selectAndCopyTheLinkFromThe');
    }
  };
  const authForm = (
    <FeedbackForm
      key={register ? 'register' : 'login'}
      onSubmit={auth}
      className="stack"
    >
      {verificationEmail && (
        <div className="verification-pending" role="status">
          <p>{t('trip.verifyYourEmailUsingTheLinkIn')}</p>
          <FeedbackButton
            type="button"
            className="text-button"
            disabled={busy}
            onClick={() =>
              void action(async () => {
                const result = await api('auth/resend-verification', 'POST', {
                  email: verificationEmail,
                });
                setNotice(m(result.message));
              })
            }
          >
            {t('trip.resendVerificationEmail')}
          </FeedbackButton>
        </div>
      )}
      {register && (
        <Field
          label={t('trip.yourName')}
          name="name"
          required
          maxLength={80}
          autoComplete="name"
        />
      )}
      <Field
        label={t(register ? 'auth.email' : 'auth.identifier')}
        name="email"
        type={register ? 'email' : 'text'}
        autoComplete={register ? 'email' : 'username'}
        maxLength={254}
        autoCapitalize="none"
        spellCheck={false}
        required
      />
      <Field
        label={t('auth.password')}
        name="password"
        type="password"
        minLength={register ? 6 : undefined}
        maxLength={register ? 72 : 128}
        pattern={register ? registrationPasswordPattern : undefined}
        hint={
          register
            ? t('trip.672CharactersUppercaseAndLowercaseLatin')
            : undefined
        }
        autoComplete={register ? 'new-password' : 'current-password'}
        required
      />
      {register && (
        <Field
          label={t('trip.repeatPassword')}
          name="passwordConfirmation"
          type="password"
          autoComplete="new-password"
          maxLength={72}
          required
        />
      )}
      <FeedbackButton className="primary" disabled={busy}>
        {busy
          ? t('common.pleaseWait')
          : register
            ? t('trip.createAccount')
            : t('auth.signIn')}
        <Icon name="arrow" />
      </FeedbackButton>
      <FeedbackButton
        className="text-button"
        type="button"
        onClick={() => setRegister(!register)}
      >
        {register
          ? t('trip.alreadyHaveAnAccountSignIn')
          : t('trip.newHereCreateAnAccount')}
      </FeedbackButton>
      {yandex && (
        <a
          className="secondary centered"
          href={
            '/api/auth/yandex?returnTo=' +
            encodeURIComponent(invite ? '/join/' + invite : '/')
          }
        >
          {t('trip.signInWithYandexId')}
        </a>
      )}
    </FeedbackForm>
  );
  return (
    <>
      <a className="skip-link" href="#main-content">
        {t('common.skipToContent')}
      </a>
      <BackToTop />
      <header className="topbar" tabIndex={-1}>
        <HeaderBrand back={!!(selected || share || invite)} />
        <span className="top-caption">{t('trip.yourTravelCollection')}</span>
        <div className="top-actions">
          {!guest && user && (
            <a
              className="text-button trips-nav-link"
              href="/"
              aria-current={!invite ? 'page' : undefined}
              onClick={(event) => {
                if (!selected && !invite) event.preventDefault();
              }}
            >
              {t('navigation.trips')}
            </a>
          )}
          <a className="text-button about-nav-link" href="/about">
            {t('navigation.about')}
          </a>
          {!guest && user && (
            <a
              className="text-button user-button"
              href="/profile"
              aria-label={t('profile.title')}
            >
              <UserAvatar user={user as { id: string; name: string }} />
              <span>{user.name}</span>
            </a>
          )}
          <AppearanceControls />
          {guest ? (
            <span className="pill">
              <Icon name="link" size={14} />
              {t('trip.guestView')}
            </span>
          ) : user ? (
            <>
              <FeedbackButton
                className="icon-button header-logout"
                title={t('auth.signOut')}
                aria-label={t('auth.signOut')}
                onClick={() =>
                  void action(async () => {
                    await signOut();
                  })
                }
              >
                <span>{t('auth.signOut')}</span>
                <Icon name="logout" />
              </FeedbackButton>
            </>
          ) : (
            <span className="muted">{t('trip.personalArchive')}</span>
          )}
        </div>
      </header>
      <FriendLinkArrival userId={user?.id} />
      {!ready ? (
        <main id="main-content" tabIndex={-1} className="loading">
          <PageFeedback />
          <span className="spinner" />
          {t('trip.openingTheArchive')}
        </main>
      ) : bootFailed ? (
        <main id="main-content" tabIndex={-1} className="loading">
          <h1>{t('trip.couldNotOpenTheArchive')}</h1>
          <p>{t('trip.couldNotReachTheServerYourSign')}</p>
          <PageFeedback />
          <button
            className="secondary"
            onClick={() => window.location.reload()}
          >
            {t('common.retry')}
          </button>
        </main>
      ) : invite ? (
        <main id="main-content" tabIndex={-1} className="invite-page">
          <PageFeedback />
          <span className="eyebrow">{t('trip.goodJourneysAreShared')}</span>
          <h1>{invitation?.title || t('trip.tripInvitation')}</h1>
          {invitation && (
            <>
              <p>
                {invitation.destination} · {period(invitation)}
              </p>
              <div className="panel">
                <h2>{t('trip.youAreInvitedOnATrip')}</h2>
                <p>{t('trip.photosAndEntriesWillBeAvailableTo')}</p>
                {user ? (
                  <FeedbackButton
                    className="primary"
                    disabled={busy}
                    onClick={() =>
                      void action(async () => {
                        const r = await api('invites/' + invite, 'POST', {});
                        window.location.href = '/?trip=' + r.tripId;
                      })
                    }
                  >
                    {t('trip.joinTrip')}
                    <Icon name="arrow" />
                  </FeedbackButton>
                ) : (
                  <>{authForm}</>
                )}
              </div>
            </>
          )}
        </main>
      ) : !user && !guest ? (
        <main id="main-content" tabIndex={-1} className="welcome">
          <PageFeedback />
          <section className="welcome-story">
            <span className="eyebrow">{t('trip.yourTripsYourStories')}</span>
            <h1>
              {t('trip.everyPlace')}
              <br />
              {t('trip.hasItsOwn')} <em>{t('trip.story')}</em>
            </h1>
            <p>{t('trip.bringPhotosRoutesAndLittleDiscoveriesInto')}</p>
            <WelcomeSlideshow />
            <div className="welcome-details">
              <span>
                <Icon name="cloud" />
                {t('trip.originalsStayOnYourDrive')}
              </span>
              <span>
                <Icon name="users" />
                {t('trip.travelTogether')}
              </span>
            </div>
          </section>
          <section className="auth panel">
            <LogoMark className="auth-logo" />
            <span className="eyebrow">{t('trip.startYourCollection')}</span>
            <h2>{register ? t('trip.welcome') : t('trip.goodToSeeYou')}</h2>
            <p className="muted">
              {register
                ? t('trip.soManyPlacesStillToDiscover')
                : t('trip.signInToReturnToYourStories')}
            </p>
            {authForm}
          </section>
        </main>
      ) : guest && !trip ? (
        <main id="main-content" tabIndex={-1} className="invite-page">
          <PageFeedback />
          <h1>{t('trip.thisLinkIsUnavailable')}</h1>
          <p>{t('trip.theOwnerMayHaveRevokedGuestAccess')}</p>
          <a href="/">{t('trip.goHome')}</a>
        </main>
      ) : !trip ? (
        <main id="main-content" tabIndex={-1} className="dashboard">
          <PageFeedback />
          <div className="page-intro">
            <div>
              <span className="eyebrow">{t('trip.personalCollection')}</span>
              <h1>
                {t('trip.yourTravels')}
                <span className="brand-dot">.</span>
              </h1>
              <p>{t('trip.longJourneysAndLittleDiscoveriesAllIn')}</p>
            </div>
            <FeedbackButton
              className="primary"
              onClick={() => setModal('create')}
            >
              <Icon name="plus" />
              {t('trip.newTrip')}
            </FeedbackButton>
          </div>
          {user && <Friends key={user.id} viewerId={user.id} compact />}
          <div className="section-line">
            <span>{t('trip.allTrips')}</span>
            <span>{String(trips.length).padStart(2, '0')}</span>
          </div>
          {trips.length ? (
            <div className="trip-grid">
              {trips.map((trip, index) => (
                <FeedbackButton
                  key={trip.id}
                  className="trip-card"
                  onClick={() => openTrip(trip.id)}
                >
                  <div className={'trip-art art-' + (index % 4)}>
                    <span className="trip-number">
                      {String(index + 1).padStart(2, '0')} / ARCHIVE
                    </span>
                    <Icon name="compass" size={80} />
                    <span className="destination-art">{trip.destination}</span>
                  </div>
                  <div className="trip-card-body">
                    <span className="eyebrow">{period(trip)}</span>
                    <h2>{trip.title}</h2>
                    <div className="trip-meta">
                      <span>
                        <Icon name="pin" size={16} />
                        {trip.destination}
                      </span>
                      <span>
                        {trip.media_count} {t('trip.moments')}{' '}
                        <Icon name="arrow" size={18} />
                      </span>
                    </div>
                  </div>
                </FeedbackButton>
              ))}
            </div>
          ) : (
            <section className="empty-collection">
              <div className="empty-art">
                <LogoMark className="empty-logo" />
                <span className="orbit orbit-one" />
                <span className="orbit orbit-two" />
              </div>
              <span className="eyebrow">
                {t('trip.theFirstPageOfYourArchive')}
              </span>
              <h2>{t('trip.whereShallWeGo')}</h2>
              <p>
                {t('trip.createATripChooseAYandexDisk')}
                <br />
                {t('trip.andInviteThePeopleYouWantTo')}
              </p>
              <FeedbackButton
                className="secondary"
                onClick={() => setModal('create')}
              >
                {t('trip.createYourFirstTrip')}
                <Icon name="arrow" />
              </FeedbackButton>
            </section>
          )}
          <aside className="archive-note">
            <Icon name="cloud" />
            <div>
              <strong>{t('trip.memoriesHereOriginalsWithYou')}</strong>
              <p>{t('trip.connectYandexDiskFoldersTheArchiveBrings')}</p>
            </div>
            <span className="note-label">
              {t('trip.yourMemoriesTakenCareOf')}
            </span>
          </aside>
        </main>
      ) : (
        <main id="main-content" tabIndex={-1} className="trip-page">
          <PageFeedback />
          <div className="trip-heading">
            <div>
              <span className="eyebrow">
                <Icon name="pin" size={14} />
                {trip.destination.toUpperCase()}
                <span> / </span>
                {period(trip)}
              </span>
              <h1>
                {trip.title}
                <span className="brand-dot">.</span>
              </h1>
              <TripDescription
                key={trip.id}
                tripId={trip.id}
                value={trip.description || ''}
                mentions={trip.descriptionMentions || []}
                user={user as any}
                editable={isOwner && !guest}
                onSave={(description, descriptionMentions) =>
                  setData((old: Row | null) =>
                    old
                      ? {
                          ...old,
                          trip: {
                            ...old.trip,
                            description,
                            descriptionMentions,
                          },
                        }
                      : old,
                  )
                }
              />
              {trip.role === 'member' && (
                <span className="pill">
                  {t('trip.yourDates')} {date(trip.from)} — {date(trip.to)}
                </span>
              )}
            </div>
            <div className="trip-summary">
              <strong>
                {data?.media.filter((m: Row) => !m.hidden).length || 0}
              </strong>
              <span>{t('trip.photosVideos')}</span>
              <Icon name="compass" size={42} />
            </div>
          </div>
          <div className="tabbar">
            <nav aria-label={t('trip.tripSections')}>
              {[
                ['gallery', 'photo', t('trip.gallery')],
                ['places', 'compass', t('common.discoveredPlaces')],
                ['map', 'pin', t('trip.map')],
                ['notes', 'book', t('trip.journal')],
                ...(!guest
                  ? [['settings', 'settings', t('trip.membersDrives')]]
                  : []),
              ].map(([key, icon, title]) => (
                <FeedbackButton
                  key={key}
                  className={tab === key ? 'active' : ''}
                  aria-current={tab === key ? 'page' : undefined}
                  onClick={() => {
                    openTab(key);
                  }}
                >
                  <Icon name={icon} size={18} />
                  {title}
                </FeedbackButton>
              ))}
            </nav>
            {!guest && (
              <div className="archive-refresh">
                <FeedbackButton
                  className="text-button"
                  disabled={busy}
                  onClick={() =>
                    void action(async () => {
                      const result = await api(
                        'trips/' + trip.id + '/sync',
                        'POST',
                      );
                      await refresh();
                      setNotice(
                        t(
                          result.failed
                            ? 'trip.somePhotosCouldNotBeLoadedPlease'
                            : 'trip.archiveRefreshed',
                        ),
                      );
                    })
                  }
                >
                  <Icon name="refresh" size={16} />
                  {t('trip.loadNewPhotos')}
                </FeedbackButton>
              </div>
            )}
          </div>
          {data && (
            <TripPreloader
              data={data}
              scope={resourceScope}
              mapScope={mapResourceScope}
              userId={user?.id}
              guest={guest}
              share={share}
            />
          )}
          {(tab === 'gallery' || tab === 'map') && (
            <>
              <div className="gallery-toolbar">
                <div className="segmented">
                  {[
                    ['all', t('trip.allMoments')],
                    ['photo', t('trip.photos')],
                    ['video', t('trip.videos')],
                    ...(!guest ? [['favorites', t('trip.favorites')]] : []),
                  ].map(([key, label]) => (
                    <FeedbackButton
                      key={key}
                      className={filter === key ? 'selected' : ''}
                      aria-pressed={filter === key}
                      onClick={() => setFilter(key)}
                    >
                      {label}
                    </FeedbackButton>
                  ))}
                </div>
                <TripDayCalendar
                  start={trip.start}
                  end={trip.end}
                  value={day}
                  onChange={setDay}
                />
              </div>
              {tab === 'map' ? (
                <>
                  <TravelMap
                    resourceScope={mapResourceScope}
                    suggestionPath={
                      !guest
                        ? '/api/trips/' + trip.id + '/area-suggestions'
                        : undefined
                    }
                    onAddArea={
                      !guest
                        ? async (areaId) => {
                            await api(
                              'trips/' + trip.id + '/area-suggestions',
                              'POST',
                              { areaId },
                            );
                            await loadTrip(trip.id);
                          }
                        : undefined
                    }
                    points={points}
                    geometryPaths={discoveredPlaces
                      .filter((place: Row) =>
                        isAreaPlace(place.title, place.summary),
                      )
                      .map((place: Row) =>
                        mediaPath(
                          { id: place.media_id },
                          'places/' + place.id + '/geometry',
                        ),
                      )}
                    onGeometrySelect={(endpoint) => {
                      const place = discoveredPlaces.find(
                        (item: Row) =>
                          mediaPath(
                            { id: item.media_id },
                            'places/' + item.id + '/geometry',
                          ) === endpoint,
                      );
                      const photo =
                        place && placePhotoGroups.get(place.url)?.[0];
                      if (photo) openMedia(photo, place.url, true);
                    }}
                    previewPath={(point) =>
                      mediaPath(point, 'preview') +
                      (share ? '&' : '?') +
                      'revision=' +
                      encodeURIComponent(point.revision || '1')
                    }
                    previewScope={share ? 'guest:' + share : 'user:' + user?.id}
                    onSelect={(mid) =>
                      openMedia(data!.media.find((m: Row) => m.id === mid))
                    }
                  />
                  <p className="muted map-caption">
                    {points.length}{' '}
                    {t('trip.photosWithCoordinatesSelectAPointTo')}
                    {!points.length &&
                      t('trip.coordinatesComeFromExifMetadataTheAuthor')}
                  </p>
                </>
              ) : visible.length ? (
                <VirtualGallery
                  key={selected + ':' + filter + ':' + day}
                  items={visible}
                  initialItemKey={filter === 'all' ? galleryTarget : undefined}
                  onTargetReached={() => setGalleryTarget(null)}
                  resetKey={selected + ':' + filter + ':' + day}
                  itemKey={(m: Row) => m.id}
                  renderItem={(m: Row) => (
                    <div
                      className={
                        'photo-card-shell' +
                        (filter === 'favorites' ? ' has-gallery-jump' : '')
                      }
                    >
                      <FeedbackButton
                        key={m.id}
                        className={
                          'photo-card ' + (m.hidden ? 'is-hidden' : '')
                        }
                        aria-label={
                          t(
                            m.kind === 'video'
                              ? 'common.openVideo'
                              : 'common.openPhoto',
                          ) +
                          ': ' +
                          (m.title || m.name.replace(/\.[^.]+$/, '')) +
                          ', ' +
                          date(m.taken) +
                          ', ' +
                          m.author
                        }
                        onClick={() => openMedia(m)}
                      >
                        {m.hidden ? (
                          <div className="photo-fallback">
                            {t('trip.hiddenPhoto')}
                          </div>
                        ) : (
                          <MediaPreview
                            src={
                              mediaPath(m, 'preview') +
                              (share ? '&' : '?') +
                              'revision=' +
                              encodeURIComponent(m.revision || '1')
                            }
                            scope={
                              share ? 'guest:' + share : 'user:' + user?.id
                            }
                            kind={m.kind}
                          />
                        )}
                        {m.kind === 'video' && (
                          <span className="video-badge">
                            ▶ {t('trip.videos')}
                          </span>
                        )}
                        <span className="photo-overlay">
                          <strong className="photo-filename">
                            {m.title || m.name.replace(/\.[^.]+$/, '')}
                          </strong>
                          <span className="photo-caption">
                            {date(m.taken)}
                            {m.capture_time ? ', ' + m.capture_time : ''} ·{' '}
                            {m.author}
                          </span>
                        </span>
                      </FeedbackButton>
                      {filter === 'favorites' && (
                        <button
                          type="button"
                          className="gallery-jump-button"
                          title={t('trip.goToThisFrameInTheGallery')}
                          aria-label={t('trip.goToThisFrameInTheGallery')}
                          onClick={() => {
                            setGalleryTarget(m.id);
                            setFilter('all');
                            setDay('');
                            openTab('gallery');
                          }}
                        >
                          <svg
                            width="22"
                            height="22"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                          >
                            <path d="M19 12H5m6-6-6 6 6 6" />
                          </svg>
                        </button>
                      )}
                      {!guest && !m.hidden && (
                        <FavoriteButton
                          id={m.id}
                          favorite={!!m.favorite}
                          onChange={(favorite) =>
                            setData((old: Row | null) =>
                              old
                                ? {
                                    ...old,
                                    media: old.media.map((item: Row) =>
                                      item.id === m.id
                                        ? { ...item, favorite }
                                        : item,
                                    ),
                                  }
                                : old,
                            )
                          }
                        />
                      )}
                    </div>
                  )}
                />
              ) : (
                <div className="empty panel">
                  <Icon name="photo" size={46} />
                  <h2>
                    {filter === 'favorites'
                      ? t('trip.noFavoritesYet')
                      : data?.media.length
                        ? t('trip.noPhotosMatchTheseFiltersYet')
                        : !guest && data?.importStatus?.sourceCount
                          ? t(
                              importing
                                ? 'trip.gatheringYourTripPhotos'
                                : data.importStatus.disconnected
                                  ? 'common.yandexAccountDisconnected'
                                  : data.importStatus.failed
                                    ? 'trip.couldNotSynchronizeTheFolder'
                                    : data.importStatus.pendingApproval
                                      ? 'trip.waitingForOwnerApproval'
                                      : 'trip.folderConnected',
                            )
                          : t('trip.everyStoryStartsWithAFirstPhoto')}
                  </h2>
                  <p>
                    {filter === 'favorites'
                      ? t('trip.starFramesToCollectThemHereAlso')
                      : data?.media.length
                        ? t('trip.changeTheFilterOrChooseAnotherDay')
                        : guest
                          ? t('trip.thisTripHasNoPublishedPhotosYet')
                          : data?.importStatus?.sourceCount
                            ? t(
                                importing
                                  ? 'trip.yourFolderIsConnectedPhotosAndVideos'
                                  : data.importStatus.disconnected
                                    ? 'trip.reconnectYandexInYourProfileToAccess'
                                    : data.importStatus.failed
                                      ? 'trip.theFolderIsConnectedButSynchronizationFailed'
                                      : data.importStatus.pendingApproval
                                        ? 'trip.theFolderHasBeenAddedPhotosWill'
                                        : 'trip.noPhotosWereFoundInTheFolder',
                              )
                            : t('trip.connectAYandexDiskFolderPhotosAnd')}
                  </p>
                  {!guest &&
                    !data?.media.length &&
                    (importing ? (
                      <p className="analysis-status" role="status">
                        <span className="spinner" />
                        {t('trip.synchronizing')}
                      </p>
                    ) : (
                      <FeedbackButton
                        className="secondary"
                        onClick={() => openTab('settings')}
                      >
                        <Icon name="cloud" />
                        {t(
                          data?.importStatus?.sourceCount
                            ? 'trip.checkSynchronization'
                            : 'trip.connectFolder',
                        )}
                      </FeedbackButton>
                    ))}
                </div>
              )}
            </>
          )}
          {tab === 'places' && (
            <>
              {guest && (
                <div className="places-calendar-row">
                  <TripDayCalendar
                    start={trip.start}
                    end={trip.end}
                    value={day}
                    onChange={setDay}
                  />
                </div>
              )}
              {!guest && (
                <PlaceRecommendations
                  dayRange={day}
                  headerContent={
                    <TripDayCalendar
                      start={trip.start}
                      end={trip.end}
                      value={day}
                      onChange={setDay}
                    />
                  }
                  tripId={trip.id}
                  media={data!.media}
                  places={data!.places}
                  userId={user!.id}
                  isOwner={isOwner}
                  scope={'user:' + user?.id}
                  previewPath={(photo) =>
                    mediaPath(photo, 'preview') +
                    '?revision=' +
                    encodeURIComponent(photo.revision || '1')
                  }
                  onSelect={(mid) =>
                    openMedia(
                      data!.media.find((photo: Row) => photo.id === mid),
                    )
                  }
                  onAdded={applyAddedPlace}
                />
              )}
              <DiscoveredPlaces
                targetUrl={!activeMedia ? placeTarget : null}
                onTargetReached={() => setPlaceTarget(null)}
                photoCount={(place) =>
                  placePhotoGroups.get(place.url)?.length || 0
                }
                photoPath={(place) => {
                  const photo = placePhotoGroups.get(place.url)?.[0];
                  return photo
                    ? mediaPath(photo, 'preview') +
                        (share ? '&' : '?') +
                        'revision=' +
                        encodeURIComponent(photo.revision || '1')
                    : undefined;
                }}
                onPhotoSelect={(_id, placeUrl) => {
                  const photo = placePhotoGroups.get(placeUrl)?.[0];
                  if (photo) openMedia(photo, placeUrl);
                }}
                scope={share ? 'guest:' + share : 'user:' + user?.id}
                places={discoveredPlaces}
                tripId={trip.id}
                canDelete={isOwner && !guest}
                onDeleted={(place) =>
                  setData((old: Row | null) =>
                    old
                      ? {
                          ...old,
                          places: old.places.filter(
                            (item: Row) => item.url !== place.url,
                          ),
                        }
                      : old,
                  )
                }
                geometryPath={(place) =>
                  mediaPath(
                    { id: place.media_id },
                    'places/' + place.id + '/geometry',
                  )
                }
                imagePath={(place) =>
                  mediaPath(
                    { id: place.media_id },
                    'places/' + place.id + '/image',
                  )
                }
              />
            </>
          )}
          {tab === 'notes' && (
            <div className="notes-layout">
              <section>
                {data?.notes.length ? (
                  data.notes.map((n: Row) => (
                    <NoteThread
                      key={n.id}
                      note={n as any}
                      replies={(data.noteReplies || []).filter(
                        (reply: Row) => reply.note_id === n.id,
                      )}
                      tripId={trip.id}
                      userId={user?.id}
                      guest={!!guest}
                      onChange={refresh}
                    />
                  ))
                ) : (
                  <div className="empty">
                    <Icon name="book" size={42} />
                    <h2>{t('trip.whatTheCameraMissed')}</h2>
                    <p>
                      {t('trip.saveYourImpressionsChanceEncountersAndFavorite')}
                    </p>
                  </div>
                )}
              </section>
              {!guest && (
                <FeedbackForm
                  className="panel stack note-form"
                  onSubmit={(e) => {
                    const input = values(e);
                    void action(async () => {
                      await api('trips/' + trip.id + '/notes', 'POST', input);
                      await refresh();
                      setNotice('trip.entrySaved');
                    });
                  }}
                >
                  <h2>{t('trip.newStory')}</h2>
                  <Field
                    label={t('common.tripDay')}
                    name="day"
                    type="date"
                    min={trip.from}
                    max={trip.to}
                    defaultValue={trip.from}
                    required
                  />
                  <label className="field">
                    <span>{t('trip.whatWillYouRemember')}</span>
                    <textarea
                      name="text"
                      rows={7}
                      required
                      maxLength={5000}
                      placeholder={t('trip.thisDayWasSpecialBecause')}
                    />
                  </label>
                  <FeedbackButton disabled={busy} className="primary">
                    {t('trip.saveEntry')}
                  </FeedbackButton>
                </FeedbackForm>
              )}
            </div>
          )}
          {tab === 'settings' && !guest && (
            <div className="settings-grid">
              <div className="settings-sources">
                <section className="panel">
                  <div className="panel-title">
                    <div>
                      <span className="eyebrow">
                        {t('trip.sourcesOfMemories')}
                      </span>
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
                              className={
                                'status ' + (s.approved ? 'approved' : '')
                              }
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
                                        ? t(
                                            'trip.synchronizationIsAlreadyRunning',
                                          )
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
                      <span className="eyebrow">
                        {t('trip.shareYourMemories')}
                      </span>
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
                              'POST',
                              {
                                enabled: true,
                              },
                            );
                            setGenerated(r.url);
                            setModal('share');
                            await refresh();
                          })
                        }
                      >
                        <Icon name="link" />
                        {trip.sharing
                          ? t('common.replaceLink')
                          : t('trip.createLink')}
                      </FeedbackButton>
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
                  <span className="avatar">
                    {tripOwner?.name?.[0] || t('trip.o')}
                  </span>
                  <div>
                    <strong>{tripOwner?.name || t('trip.owner')}</strong>
                    <p>
                      {t('trip.ownerPrefix')} {period(trip)}
                    </p>
                  </div>
                </div>
                {members.map((m) => (
                  <div className="member" key={m.id}>
                    <span className="avatar">{m.name[0]}</span>
                    <div>
                      <strong>{m.name}</strong>
                      <p>
                        {date(m.start)} — {date(m.end)} ·{' '}
                        {m.active ? t('trip.member') : t('trip.leftTheTrip')}
                      </p>
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
        </main>
      )}
      <footer>
        <Brand footer />
        <p>{t('common.moreThanWhereYouWentHowIt')}</p>
        <a href="/about">{t('navigation.about')}</a>
      </footer>
      {modal === 'create' && (
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
      )}
      {modal === 'source' && (
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
      )}
      {(modal === 'invite' || modal.startsWith('member:')) && (
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
                const input = values(e);
                void action(async () => {
                  if (modal === 'invite') {
                    const r = await api(
                      'trips/' + trip.id + '/invite',
                      'POST',
                      input,
                    );
                    setGenerated(r.url);
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
              <p className="muted">{t('trip.theMemberCanOnlySeePhotosAnd')}</p>
              <Field
                label={t('trip.from')}
                name="start"
                type="date"
                defaultValue={
                  members.find((m) => 'member:' + m.id === modal)?.start ||
                  trip.start
                }
                min={trip.start}
                max={trip.end}
                required
              />
              <Field
                label={t('trip.through')}
                name="end"
                type="date"
                defaultValue={
                  members.find((m) => 'member:' + m.id === modal)?.end ||
                  trip.end
                }
                min={trip.start}
                max={trip.end}
                required
              />
              <FeedbackButton className="primary" disabled={busy}>
                {modal === 'invite'
                  ? t('trip.createInvitation')
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
      )}
      {modal === 'share' && (
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
          </div>
        </Modal>
      )}
      {modal === 'leave' && (
        <Modal title={t('trip.leaveThisTrip')} onClose={() => setModal('')}>
          <div className="stack">
            <p>{t('trip.publishedPhotosWillRemainInTheTrip')}</p>
            <FeedbackButton
              className="primary"
              disabled={busy}
              onClick={() =>
                void action(async () => {
                  await api('trips/' + trip.id + '/leave', 'POST', {});
                  setModal('');
                  setSelected(null);
                  setData(null);
                  await loadTrips();
                  window.history.replaceState(null, '', '/');
                })
              }
            >
              {t('trip.leaveTrip')}
            </FeedbackButton>
          </div>
        </Modal>
      )}
      {activeMedia && (
        <Modal
          title={
            <MediaTitle
              key={activeMedia.id}
              id={activeMedia.id}
              title={
                activeMedia.title || activeMedia.name.replace(/\.[^.]+$/, '')
              }
              editable={!guest && activeMedia.user_id === user?.id}
              onSave={(title) => {
                setActiveMedia((old: Row | null) =>
                  old ? { ...old, title } : old,
                );
                setData((old: Row | null) =>
                  old
                    ? {
                        ...old,
                        media: old.media.map((item: Row) =>
                          item.id === activeMedia.id
                            ? { ...item, title }
                            : item,
                        ),
                      }
                    : old,
                );
              }}
            />
          }
          wide
          onKeyDown={(event) => {
            if (
              !hasPlaceNavigation ||
              event.defaultPrevented ||
              event.altKey ||
              event.ctrlKey ||
              event.metaKey
            )
              return;
            const target = event.target as HTMLElement;
            if (
              target.closest('dialog') !== event.currentTarget ||
              target.closest(
                'input,textarea,select,[contenteditable="true"],[role="slider"]',
              )
            )
              return;
            const step =
              event.key === 'ArrowRight'
                ? 1
                : event.key === 'ArrowLeft'
                  ? -1
                  : 0;
            if (step && viewerPlacePhotos[viewerPlaceIndex + step]) {
              event.preventDefault();
              navigatePlacePhoto(step);
            }
          }}
          onClose={() => {
            setActiveMedia(null);
            setMediaPlaceUrl(null);
            setMediaFocusPlaceUrl(null);
          }}
        >
          <div
            className={
              hasPlaceNavigation ? 'place-photo-navigation' : undefined
            }
          >
            {hasPlaceNavigation && viewerPlaceIndex > 0 && (
              <button
                ref={placePrevious}
                type="button"
                className="icon-button place-photo-previous"
                aria-label={t('trip.previousPhotoOfThisPlace')}
                onClick={() => navigatePlacePhoto(-1)}
              >
                <Icon name="chevron-left" />
              </button>
            )}
            <div className="media-viewer">
              {activeMedia.hidden ? (
                <div className="empty">
                  <p>{t('trip.thisFileIsHiddenFromTheTrip')}</p>
                </div>
              ) : activeMedia.kind === 'video' ? (
                ['video/mp4', 'video/webm', 'video/ogg'].includes(
                  activeMedia.mime,
                ) ? (
                  <video
                    controls
                    playsInline
                    preload="metadata"
                    src={mediaPath(activeMedia, 'original')}
                  />
                ) : (
                  <div className="empty">
                    <Icon name="photo" size={48} />
                    <p>{t('trip.youCanDownloadThisFormatAndOpen')}</p>
                  </div>
                )
              ) : (
                <PhotoViewer
                  key={activeMedia.id}
                  title={activeMedia.title || activeMedia.name}
                  preview={
                    mediaPath(activeMedia, 'preview') +
                    (share ? '&' : '?') +
                    'revision=' +
                    encodeURIComponent(activeMedia.revision || '1')
                  }
                  scope={share ? 'guest:' + share : 'user:' + user?.id}
                  original={
                    [
                      'image/jpeg',
                      'image/png',
                      'image/gif',
                      'image/webp',
                      'image/avif',
                      'image/bmp',
                    ].includes(activeMedia.mime)
                      ? mediaPath(activeMedia, 'original')
                      : undefined
                  }
                />
              )}
            </div>
            {hasPlaceNavigation &&
              viewerPlaceIndex < viewerPlacePhotos.length - 1 && (
                <button
                  ref={placeNext}
                  type="button"
                  className="icon-button place-photo-next"
                  aria-label={t('trip.nextPhotoOfThisPlace')}
                  onClick={() => navigatePlacePhoto(1)}
                >
                  <Icon name="chevron-right" />
                </button>
              )}
            {hasPlaceNavigation && (
              <span
                className="place-photo-counter fine"
                role="status"
                aria-live="polite"
              >
                {t('trip.photos')} {viewerPlaceIndex + 1} /{' '}
                {viewerPlacePhotos.length}
              </span>
            )}
          </div>
          <div className="viewer-meta">
            <div>
              <div className="viewer-meta-line">
                <span>
                  {new Date(
                    activeMedia.taken.slice(0, 10) + 'T12:00:00',
                  ).toLocaleDateString(
                    document.documentElement.lang === 'en' ? 'en-GB' : 'ru-RU',
                    { day: 'numeric', month: 'long' },
                  )}
                  {activeMedia.capture_time
                    ? ', ' + activeMedia.capture_time
                    : ''}
                </span>
                <span aria-hidden="true">·</span>
                <span>{activeMedia.author}</span>
                {Number.isFinite(activeMedia.lat) &&
                  Number.isFinite(activeMedia.lon) && (
                    <>
                      <span aria-hidden="true">·</span>
                      <PhotoLocation
                        id={activeMedia.id}
                        lat={activeMedia.lat}
                        lon={activeMedia.lon}
                        title={activeMedia.title || activeMedia.name}
                        taken={activeMedia.taken}
                        captureTime={activeMedia.capture_time}
                      />
                    </>
                  )}
              </div>
            </div>
            {!activeMedia.hidden && (
              <a
                className="secondary"
                href={mediaPath(activeMedia, 'download')}
              >
                {t('common.downloadOriginal')}
              </a>
            )}
            {activeMedia.user_id === user?.id && !guest && (
              <FeedbackButton
                className="text-button"
                disabled={busy}
                onClick={() =>
                  void action(async () => {
                    await api('media/' + activeMedia.id, 'PATCH', {
                      hidden: !activeMedia.hidden,
                    });
                    setActiveMedia({
                      ...activeMedia,
                      hidden: !activeMedia.hidden,
                    });
                    await refresh();
                  })
                }
              >
                {activeMedia.hidden
                  ? t('trip.showInTrip')
                  : t('common.hideMyPhoto')}
              </FeedbackButton>
            )}
          </div>
          {!activeMedia.hidden &&
            !!data?.places.filter(
              (place: Row) => place.media_id === activeMedia.id,
            ).length && (
              <section
                className="confirmed-photo-places"
                aria-label={t('trip.placesInThisPhoto')}
              >
                <h3>{t('trip.placesInThisPhoto')}</h3>
                {data.places
                  .filter((place: Row) => place.media_id === activeMedia.id)
                  .map((place: Row) => (
                    <LocalizedArticle
                      key={place.id}
                      place={place}
                      endpoint={mediaPath(
                        { id: place.media_id },
                        'places/' + place.id + '/text',
                      )}
                      scope={share ? 'guest:' + share : 'user:' + user?.id}
                    >
                      {(place) => (
                        <article
                          className="confirmed-photo-place"
                          key={place.id}
                          data-place-url={place.url}
                          data-map-selected={
                            mediaFocusPlaceUrl === place.url ? true : undefined
                          }
                          aria-label={place.title}
                          tabIndex={-1}
                        >
                          <div className="confirmed-place-heading">
                            <strong>{place.title}</strong>
                            {!guest &&
                              (isOwner || activeMedia.user_id === user?.id) && (
                                <PlaceDelete
                                  mediaId={activeMedia.id}
                                  placeId={place.id}
                                  title={place.title}
                                  onDelete={() => {
                                    setData((old: Row | null) =>
                                      old
                                        ? {
                                            ...old,
                                            places: old.places.filter(
                                              (item: Row) =>
                                                item.id !== place.id,
                                            ),
                                          }
                                        : old,
                                    );
                                    const pageId = Number(
                                      new URL(place.url).searchParams.get(
                                        'curid',
                                      ),
                                    );
                                    if (pageId)
                                      setSuggestions((old) =>
                                        old.some(
                                          (item) =>
                                            Number(item.pageid) === pageId,
                                        )
                                          ? old
                                          : [
                                              ...old,
                                              {
                                                pageid: pageId,
                                                title: place.title,
                                                dist:
                                                  place.distance ??
                                                  distanceMeters(
                                                    activeMedia.lat,
                                                    activeMedia.lon,
                                                    place.lat,
                                                    place.lon,
                                                  ),
                                              },
                                            ],
                                      );
                                    requestAnimationFrame(() =>
                                      document
                                        .querySelector<HTMLElement>(
                                          '.place-tools-toggle',
                                        )
                                        ?.focus(),
                                    );
                                  }}
                                />
                              )}
                          </div>
                          {activeMedia.lat !== null &&
                            activeMedia.lon !== null && (
                              <span className="fine">
                                {Math.round(
                                  place.distance ??
                                    distanceMeters(
                                      activeMedia.lat,
                                      activeMedia.lon,
                                      place.lat,
                                      place.lon,
                                    ),
                                )}{' '}
                                {t('common.mFromThePhoto')}
                              </span>
                            )}
                          <button
                            type="button"
                            className="text-button place-card-link"
                            onClick={() => {
                              if (!includesDate(place.day, day)) setDay('');
                              setPlaceTarget(place.url);
                              setActiveMedia(null);
                              openTab('places');
                            }}
                          >
                            {t('trip.goToThePlaceCard')} →
                          </button>
                          <ConfirmedPlaceDetails
                            highlighted={mediaFocusPlaceUrl === place.url}
                            title={place.title}
                            summary={place.summary}
                            url={place.url}
                            sourceUrl={place.sourceUrl}
                            scope={
                              share ? 'guest:' + share : 'user:' + user?.id
                            }
                            endpoint={(() => {
                              const canonical =
                                discoveredPlaces.find(
                                  (item: Row) => item.url === place.url,
                                ) || place;
                              return mediaPath(
                                { id: canonical.media_id },
                                'places/' + canonical.id + '/image',
                              );
                            })()}
                          />
                        </article>
                      )}
                    </LocalizedArticle>
                  ))}
              </section>
            )}
          {!guest && !activeMedia.hidden && (
            <div className="place-tools">
              {activeMedia.lat !== null && activeMedia.lon !== null ? (
                <>
                  <div className="place-tools-heading">
                    <FeedbackButton
                      className="secondary place-tools-toggle"
                      disabled={busy}
                      aria-expanded={placesOpen}
                      aria-controls="photo-place-suggestions"
                      onClick={() => {
                        setPlacesOpen(!placesOpen);
                        if (!placesOpen && !suggestions.length)
                          void action(async () => {
                            const result = await api(
                              'media/' + activeMedia.id + '/places',
                            );
                            setSuggestions(result.suggestions);
                            setNotice('trip.nearbyPlacesLoaded');
                          });
                      }}
                    >
                      <Icon name="pin" />
                      {t(
                        placesOpen
                          ? 'trip.hidePlaces'
                          : data?.places.some(
                                (place: Row) =>
                                  place.media_id === activeMedia.id,
                              )
                            ? 'trip.addAnotherPlace'
                            : 'trip.whatSNearby',
                      )}
                    </FeedbackButton>
                    <button
                      type="button"
                      className="icon-button place-tools-chevron"
                      aria-label={t(
                        placesOpen ? 'trip.hidePlaces' : 'trip.showPlaces',
                      )}
                      aria-expanded={placesOpen}
                      aria-controls="photo-place-suggestions"
                      disabled={busy}
                      onClick={() =>
                        document
                          .querySelector<HTMLButtonElement>(
                            '.place-tools-toggle',
                          )
                          ?.click()
                      }
                    >
                      <svg
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.7"
                        aria-hidden="true"
                      >
                        <path
                          d={placesOpen ? 'm6 15 6-6 6 6' : 'm6 9 6 6 6-6'}
                        />
                      </svg>
                    </button>
                  </div>
                  <Collapse id="photo-place-suggestions" open={placesOpen}>
                    {suggestions
                      .filter(
                        (s) =>
                          !data?.places.some(
                            (place: Row) =>
                              place.media_id === activeMedia.id &&
                              place.url ===
                                'https://ru.wikipedia.org/?curid=' + s.pageid,
                          ),
                      )
                      .map((s) => (
                        <LocalizedArticle
                          key={s.pageid}
                          place={{
                            ...s,
                            summary: '',
                            url: 'https://ru.wikipedia.org/?curid=' + s.pageid,
                          }}
                          endpoint={
                            '/api/media/' +
                            activeMedia.id +
                            '/places/description?pageId=' +
                            s.pageid
                          }
                          scope={'user:' + user?.id}
                        >
                          {(s) => (
                            <div className="suggestion">
                              <span>
                                {s.title}
                                <small>
                                  {Math.round(s.dist)}{' '}
                                  {t('common.mFromThePhoto')}
                                </small>
                              </span>
                              {(isOwner ||
                                activeMedia.user_id === user?.id) && (
                                <FeedbackButton
                                  className="text-button"
                                  disabled={busy}
                                  onClick={() =>
                                    void action(async () => {
                                      const result = await api(
                                        'media/' + activeMedia.id + '/places',
                                        'POST',
                                        {
                                          pageId: s.pageid,
                                        },
                                      );
                                      applyAddedPlace(
                                        result.place,
                                        result.title,
                                      );
                                      setSuggestions((old) =>
                                        old.filter(
                                          (item) => item.pageid !== s.pageid,
                                        ),
                                      );
                                      setNotice(
                                        t(
                                          'trip.placeAndItsShortDescriptionAdded',
                                        ),
                                      );
                                    })
                                  }
                                >
                                  {t('trip.confirm')}
                                </FeedbackButton>
                              )}
                            </div>
                          )}
                        </LocalizedArticle>
                      ))}
                  </Collapse>
                </>
              ) : (
                activeMedia.user_id === user?.id && (
                  <LocationForm
                    key={activeMedia.id}
                    busy={busy}
                    initial={(() => {
                      const candidates = (data?.media || []).filter(
                        (photo: Row) =>
                          !photo.hidden &&
                          !photo.missing &&
                          Number.isFinite(photo.lat) &&
                          Number.isFinite(photo.lon),
                      );
                      const target = Date.parse(activeMedia.taken);
                      const nearest = [...candidates].sort(
                        (a: Row, b: Row) =>
                          Math.abs(Date.parse(a.taken) - target) -
                          Math.abs(Date.parse(b.taken) - target),
                      )[0];
                      return nearest
                        ? { lat: nearest.lat, lon: nearest.lon }
                        : null;
                    })()}
                    onSave={(point) => {
                      void action(async () => {
                        await api('media/' + activeMedia.id, 'PATCH', point);
                        setActiveMedia({ ...activeMedia, ...point });
                        await refresh();
                      });
                    }}
                  />
                )
              )}
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
