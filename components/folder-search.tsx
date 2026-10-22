'use client';

import { api } from './api';
import { FeedbackButton } from './feedback';
import { useLocale } from './appearance';

export type DiskFolder = { name: string; path: string };

export async function readFolderPages(
  account: string,
  path: string,
  offset: number,
  search = false,
  isCurrent = () => true,
) {
  let result: { folders: DiskFolder[]; nextOffset: number | null };
  let pages = 0;
  do {
    result = await api(
      'accounts/' +
        account +
        '/folders?path=' +
        encodeURIComponent(path) +
        '&offset=' +
        offset,
    );
    pages++;
    if (!isCurrent()) return result;
    if (
      !search ||
      result.folders.length ||
      result.nextOffset === null ||
      result.nextOffset <= offset
    )
      return result;
    offset = result.nextOffset;
  } while (pages < 10);
  return result;
}

export function mergeFolders(previous: DiskFolder[], incoming: DiskFolder[]) {
  return [
    ...new Map(
      [...previous, ...incoming].map((folder) => [folder.path, folder]),
    ).values(),
  ];
}

export function FolderSearchButton({
  busy,
  onClick,
}: {
  busy: boolean;
  onClick: () => void;
}) {
  const { t } = useLocale();
  return (
    <FeedbackButton
      type="button"
      className="folder-search"
      disabled={busy}
      aria-busy={busy}
      onClick={onClick}
    >
      <svg
        className={busy ? 'is-searching' : ''}
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M20 7v5h-5M4 17v-5h5" />
        <path d="M6.1 7a7 7 0 0 1 11.5-1.1L20 9M4 15l2.4 3.1A7 7 0 0 0 17.9 17" />
      </svg>
      {t('messages.searchAgain')}
    </FeedbackButton>
  );
}
