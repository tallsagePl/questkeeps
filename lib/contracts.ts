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

export type TripSummary = {
  id: string;
  title: string;
  destination: string;
  description: string;
  start: string;
  end: string;
  media_count: number;
};

export type TripView = Omit<TripSummary, 'media_count'> & {
  role: 'owner' | 'member' | 'guest';
  from: string;
  to: string;
  sharing: boolean;
  descriptionMentions: Mention[];
};

export type MediaItem = {
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
  start: string;
  end: string;
  active: number;
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
>;

export type TripRecord = Omit<TripSummary, 'media_count'> & {
  owner_id: string;
  created: number;
  share_hash: string | null;
};

export type TripAccess = TripRecord & {
  role: 'owner' | 'member' | 'guest';
  from: string;
  to: string;
};
