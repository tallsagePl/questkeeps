import { api } from '../api';
import type { ArchiveController } from './use-archive';

export function openSourcePicker(archive: ArchiveController) {
  archive.setFolders([]);
  archive.setAccount('');
  archive.setFolder('disk:/');
  archive.setModal('source');
}

export function retryTripImport(archive: ArchiveController) {
  const tripId = archive.trip?.id;
  if (!tripId) return;
  void archive.action(async () => {
    const result = await api<{ queued: number; failed: number }>(
      'trips/' + tripId + '/sync',
      'POST',
    );
    await archive.refresh();
    archive.setNotice(
      result.failed
        ? 'trip.somePhotosCouldNotBeLoadedPlease'
        : result.queued === 0
          ? 'sync.noFoldersToSync'
          : 'sync.queued',
    );
  });
}
