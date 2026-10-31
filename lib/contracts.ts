import type { Mention } from './mentions';
import type { LocalizedMessage } from './i18n/translate';

export type ApplicationMessage = string | LocalizedMessage;

export type UserProfile = {
  id: string;
  email: string | null;
  name: string;
  username: string;
  avatarVersion: string | null;
  yandexAccountId: string | null;
  linkedEmails: string[];
};

export type CoverPosition = { x: number; y: number };

export type TripCoverSettings = {
  positions?: Record<string, CoverPosition>;
  mode: 'all' | 'selected';
  photoIds: string[];
};

export type TripCover = {
  position?: CoverPosition;
  id: string;
  src: string;
  rotation?: number;
};

export type TripSummary = {
  covers?: TripCover[];
  id: string;
  title: string;
  destination: string;
  description: string;
  start: string;
  end: string;
  media_count: number;
};

export type FollowedTrip = Omit<TripSummary, 'description'> & { url: string };

export type TripView = Omit<TripSummary, 'media_count'> & {
  role: 'owner' | 'member' | 'guest';
  from: string;
  to: string;
  sharing: boolean;
  participationStart?: string;
  participationEnd?: string;
  allPhotos?: boolean;
  descriptionMentions: Mention[];
};

export type MediaItem = {
  rotation?: number;
  id: string;
  user_id: string;
  name: string;
  kind: string;
  mime: string;
  taken: string;
  capture_time?: string;
  revision: string;
  title?: string | null;
  author: string;
  favorite: number | boolean;
  hidden: number | boolean;
  hidden_from_guests?: number | boolean;
  missing?: number | boolean;
  lat: number | null;
  lon: number | null;
};

export type ConfirmedPlace = {
  id: string;
  media_id: string;
  title: string;
  url: string;
  summary: string;
  day: string;
  lat?: number;
  lon?: number;
  photo_lat?: number;
  photo_lon?: number;
};

export type PlaceSuggestion = {
  pageid: number;
  title: string;
  lat?: number;
  lon?: number;
  dist: number;
  distance?: number;
  summary?: string;
  sourceUrl?: string;
};

export type JournalNote = {
  id: string;
  user_id: string;
  author: string;
  text: string;
  day: string;
  deleted?: number | boolean;
};

export type JournalReply = Omit<JournalNote, 'day'> & {
  note_id: string;
  parent_id: string | null;
  created: number;
};

export type TripData = {
  trip: TripView;
  media: MediaItem[];
  places: ConfirmedPlace[];
  notes: JournalNote[];
  noteReplies: JournalReply[];
  importStatus?: {
    sourceCount: number;
    metadataPending?: number;
    metadataWaiting?: number;
    metadataErrors?: number;
    scanned?: number;
    waiting: boolean;
    syncing: boolean;
    failed: boolean;
    pendingApproval: boolean;
    disconnected: boolean;
    lastSync: number;
  };
};

export type TripMember = {
  id: string;
  name: string;
  username: string;
  hasAvatar: boolean;
  start: string;
  end: string;
  active: number;
  all_photos: number;
};

export type DriveSource = {
  id: string;
  user_id: string;
  path: string;
  label: string;
  author: string;
  approved: number;
  last_sync: number | null;
  error: ApplicationMessage | null;
  lock_until: number | null;
};

export type DriveAccount = { id: string; label: string };

export type DriveFolder = { name: string; path: string };

export type TripInvitation = Pick<
  TripSummary,
  'title' | 'destination' | 'start' | 'end'
> & { allPhotos?: boolean };

export type TripRecord = Omit<TripSummary, 'media_count'> & {
  owner_id: string;
  created: number;
  share_hash: string | null;
};

export type TripAccess = TripRecord & {
  participationStart?: string;
  participationEnd?: string;
  allPhotos?: boolean;
  role: 'owner' | 'member' | 'guest';
  from: string;
  to: string;
};

export type DirectTripInvitation = {
  id: string;
  trip_id: string;
  title: string;
  destination: string;
  sender: string;
  start: string;
  end: string;
  all_photos: number;
  expires: number;
};

export type SourceSyncStatus = {
  active: boolean;
  jobs: {
    sourceId: string;
    jobId: string | null;
    state: string;
    scanned: number;
    count: number;
    finished: number | null;
    nextAttempt: number | null;
    paused: boolean;
  }[];
  metadata: {
    total: number;
    active: number;
    errors: number;
    waiting: number;
    completed: number;
    updated: number;
  };
};
