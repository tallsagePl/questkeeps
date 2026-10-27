'use client';

import type {
  UserProfile,
  TripSummary,
  TripData,
  TripMember,
  DriveSource,
  DriveAccount,
  DriveFolder,
  MediaItem,
  ConfirmedPlace,
  PlaceSuggestion,
  TripInvitation,
} from '../../lib/contracts';
import {
  announceSessionChange,
  observeSessionChanges,
} from '../../lib/browser-session';
import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  FormEvent,
} from 'react';
import { api } from '../api';
import { readFolderPages, mergeFolders } from '../folder-search';
import { migratePrivateStorage } from '../../lib/browser-storage';
import {
  initializeNavigation,
  navigationTab,
  pushNavigation,
} from '../../lib/navigation';
import { includesDate } from '../../lib/date-selection';
import { groupPlacePhotos } from '../../lib/place-photo-groups';
import { tripMapScope } from '../trip-preloader';
import { ApiError, useFeedback } from '../feedback';
import { values } from './shared';
import { hasCoordinates } from '../../lib/geo';

export function useArchive({
  share,
  invite,
}: {
  share?: string;
  invite?: string;
}) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [ready, setReady] = useState(false);
  const [bootFailed, setBootFailed] = useState(false);
  const [verificationEmail, setVerificationEmail] = useState('');
  const [trips, setTrips] = useState<TripSummary[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [data, setData] = useState<TripData | null>(null);
  const [tab, setTab] = useState('gallery');
  const [filter, setFilter] = useState('all');
  const [galleryTarget, setGalleryTarget] = useState<string | null>(null);
  const [day, setDay] = useState('');
  const [modal, setModal] = useState('');
  const [busy, setBusy] = useState(false);
  const [yandex, setYandex] = useState(false);
  const [register, setRegister] = useState(false);
  const [members, setMembers] = useState<TripMember[]>([]);
  const [tripOwner, setTripOwner] = useState<Pick<
    TripMember,
    'id' | 'name' | 'username' | 'hasAvatar'
  > | null>(null);
  const [sources, setSources] = useState<DriveSource[]>([]);
  const [accounts, setAccounts] = useState<DriveAccount[]>([]);
  const [account, setAccount] = useState('');
  const [folder, setFolder] = useState('disk:/');
  const [folders, setFolders] = useState<DriveFolder[]>([]);
  const [folderStatus, setFolderStatus] = useState('');
  const [folderOffset, setFolderOffset] = useState<number | null>(null);
  const [generated, setGenerated] = useState('');
  const [activeMedia, setActiveMedia] = useState<MediaItem | null>(null);
  const [mediaPlaceUrl, setMediaPlaceUrl] = useState<string | null>(null);
  const [mediaFocusPlaceUrl, setMediaFocusPlaceUrl] = useState<string | null>(
    null,
  );
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [placesOpen, setPlacesOpen] = useState(false);
  const [invitation, setInvitation] = useState<TripInvitation | null>(null);
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
    const r = await api<{ trips: TripSummary[] }>(
      'trips',
      'GET',
      undefined,
      AbortSignal.timeout(20000),
    );
    if (generation !== identityGeneration.current) return;
    setTrips(r.trips);
  }, []);
  const loadTrip = useCallback(async (tid: string) => {
    const generation = identityGeneration.current;
    const navigation = navigationGeneration.current;
    let r;
    try {
      r = await api<TripData>(
        'trips/' + tid,
        'GET',
        undefined,
        AbortSignal.timeout(20000),
      );
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
        const result = await api<TripData>(
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
      setData(await api<TripData>('share/' + share));
    } else if (selected) {
      await loadTrip(selected);
    } else if (user) {
      await loadTrips();
    }
  }, [share, selected, user, loadTrip, loadTrips]);
  useEffect(() => {
    const updated = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail?.userId !== user?.id) return;
      if (selected === detail.tripId && !guest) void action(refresh);
      else if (!selected && !guest) void loadTrips();
    };
    window.addEventListener('questkeeps:archive-refresh', updated);
    return () =>
      window.removeEventListener('questkeeps:archive-refresh', updated);
  }, [user?.id, selected, guest, action, refresh, loadTrips]);
  useEffect(() => {
    mounted.current = true;
    void action(async () => {
      let me;
      try {
        me = await api<{ user: UserProfile | null; yandexEnabled: boolean }>(
          'me',
          'GET',
          undefined,
          AbortSignal.timeout(10000),
        );
        setUser(me.user);
        setYandex(me.yandexEnabled);
        if (share)
          setData(
            await api(
              'share/' + share,
              'GET',
              undefined,
              AbortSignal.timeout(20000),
            ),
          );
        else if (invite)
          setInvitation(
            await api<TripInvitation>(
              'invites/' + invite,
              'GET',
              undefined,
              AbortSignal.timeout(20000),
            ),
          );
        else if (me.user) {
          await loadTrips();
          const tid = new URLSearchParams(window.location.search).get('trip');
          if (tid) await loadTrip(tid);
          if (
            new URLSearchParams(window.location.search).get('create') === '1'
          ) {
            setModal('create');
            window.history.replaceState(null, '', '/');
          }
        }
        setReady(true);
      } catch (error) {
        // Expired/revoked public links have their own unavailable-link screen.
        const unavailableLink =
          (share || invite) &&
          error instanceof ApiError &&
          (error.status === 404 || error.status === 410);
        if (!unavailableLink) setBootFailed(true);
        throw error;
      }
    }).finally(() => setReady(true));
    return () => {
      mounted.current = false;
    };
  }, [share, invite, action, loadTrips, loadTrip]);
  useEffect(() => {
    if (!selected || guest || tab !== 'settings') return;
    void action(async () => {
      const [m, s, a] = await Promise.all([
        api<{
          members: TripMember[];
          owner: Pick<TripMember, 'id' | 'name' | 'username' | 'hasAvatar'>;
        }>('trips/' + selected + '/members'),
        api<{ sources: DriveSource[] }>('trips/' + selected + '/sources'),
        api<{ accounts: DriveAccount[] }>('accounts'),
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
        throw new ApiError('trip.passwordsDoNotMatch', {
          passwordConfirmation: 'trip.passwordsDoNotMatch',
        });
      const r = await api(
        'auth/' + (register ? 'register' : 'login'),
        'POST',
        input,
        AbortSignal.timeout(15000),
      );
      if (r.verificationRequired) {
        setVerificationEmail(r.verificationEmail);
        setNotice(r.message);
        return;
      }
      announceSessionChange();
      setUser(r.user);
      setModal('');
      try {
        await loadTrips();
      } catch (error) {
        // Keep the authenticated session when the following read fails.
        setBootFailed(true);
        feedbackRef.current.report(error, 'page');
        return;
      }
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
        (m) =>
          (filter === 'all' ||
            (filter === 'favorites' ? !!m.favorite : m.kind === filter)) &&
          includesDate(m.taken, day),
      ),
    [data, filter, day],
  );
  const discoveredPlaces = useMemo(() => {
    const seen = new Set<string>();
    return [...(data?.places || [])]
      .filter((place) => includesDate(place.day, day))
      .sort((a, b) =>
        (a.day || '9999-12-31').localeCompare(b.day || '9999-12-31'),
      )
      .filter((place) => {
        if (seen.has(place.url)) return false;
        seen.add(place.url);
        return true;
      });
  }, [data?.places, day]);
  const placePhotoGroups = useMemo(
    () => groupPlacePhotos(data?.media || [], data?.places || [], day),
    [data?.media, data?.places, day],
  );
  const placePrevious = useRef<HTMLButtonElement>(null);
  const placeNext = useRef<HTMLButtonElement>(null);
  const viewerPlacePhotos = mediaPlaceUrl
    ? placePhotoGroups.get(mediaPlaceUrl) || []
    : visible;
  const viewerPlaceIndex = viewerPlacePhotos.findIndex(
    (photo) => photo.id === activeMedia?.id,
  );
  const hasPlaceNavigation =
    viewerPlaceIndex >= 0 && viewerPlacePhotos.length > 1;
  const points = useMemo(
    () => visible.filter(hasCoordinates).filter((m) => !m.hidden),
    [visible],
  );
  const mediaPath = (m: Pick<MediaItem, 'id'>, kind: string) =>
    '/api/media/' + m.id + '/' + kind + (share ? '?share=' + share : '');
  const resourceScope = share ? 'guest:' + share : 'user:' + user?.id;
  const mapResourceScope = useMemo(
    () => (data ? tripMapScope(data, resourceScope) : resourceScope),
    [data, resourceScope],
  );
  const [placeTarget, setPlaceTarget] = useState<string | null>(null);
  const applyAddedPlace = (
    place: ConfirmedPlace,
    title = place.title.slice(0, 160),
  ) => {
    setData((old) =>
      old
        ? {
            ...old,
            media: old.media.map((photo) =>
              photo.id === place.media_id ? { ...photo, title } : photo,
            ),
            places: [
              ...old.places.filter((item) => item.id !== place.id),
              place,
            ],
          }
        : old,
    );
    setActiveMedia((old) =>
      old?.id === place.media_id ? { ...old, title } : old,
    );
  };
  const openMedia = (
    m: MediaItem | undefined,
    placeUrl: string | null = null,
    focusPlace = false,
  ) => {
    if (!m) return;
    setMediaPlaceUrl(placeUrl);
    setMediaFocusPlaceUrl(focusPlace ? placeUrl : null);
    setPlacesOpen(false);
    const latestPlace = data?.places
      .filter((place) => place.media_id === m.id)
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
    void api<{ suggestions: PlaceSuggestion[] }>(
      'media/' + activeMedia.id + '/places',
    )
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
  return {
    user,
    ready,
    bootFailed,
    verificationEmail,
    setVerificationEmail,
    trips,
    selected,
    setSelected,
    data,
    setData,
    tab,
    filter,
    setFilter,
    galleryTarget,
    setGalleryTarget,
    day,
    setDay,
    modal,
    setModal,
    busy,
    yandex,
    register,
    setRegister,
    members,
    tripOwner,
    sources,
    accounts,
    account,
    setAccount,
    folder,
    setFolder,
    folders,
    setFolders,
    folderStatus,
    folderOffset,
    generated,
    setGenerated,
    activeMedia,
    setActiveMedia,
    mediaPlaceUrl,
    setMediaPlaceUrl,
    mediaFocusPlaceUrl,
    setMediaFocusPlaceUrl,
    suggestions,
    setSuggestions,
    placesOpen,
    setPlacesOpen,
    invitation,
    trip,
    isOwner,
    guest,
    setNotice,
    action,
    loadTrips,
    loadTrip,
    importing,
    refresh,
    openTrip,
    openTab,
    reloadSettings,
    auth,
    browse,
    visible,
    discoveredPlaces,
    placePhotoGroups,
    placePrevious,
    placeNext,
    viewerPlacePhotos,
    viewerPlaceIndex,
    hasPlaceNavigation,
    points,
    mediaPath,
    resourceScope,
    mapResourceScope,
    placeTarget,
    setPlaceTarget,
    applyAddedPlace,
    openMedia,
    navigatePlacePhoto,
    copy,
    share,
    invite,
  };
}

export type ArchiveController = ReturnType<typeof useArchive>;
