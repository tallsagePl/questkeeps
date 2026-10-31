# Drive synchronization and photo metadata

Version 1.35.0 separates the folder scan from EXIF reads and moves both out of
interactive HTTP requests. Original files remain on Yandex Disk. No original
image bytes are persisted by this feature.

## Request and worker contract

`POST /api/trips/:trip/sync` and the individual source sync endpoint return HTTP
202 with queue/job information. Creating a trip with a source queues its first
scan; Next `after()` does not run the scan. The authenticated cron endpoint also
only queues work. The existing worker checks for source jobs every 30 seconds,
takes at most two sources per pass, and handles one folder listing at a time.
`GET /api/trips/:trip/sync` returns a compact, private progress snapshot.

Requests are deduplicated while queued or running. Automatic source errors back
off from 30 seconds to one hour; manual refresh can explicitly retry. Successful
scans retain `last_sync` while waiting for the next run, rather than setting the
last success to NULL on every login. Session Drive checks remain once per session.

A scan traverses the selected folder with path, source approval, account and
participation checks. It has a 15-minute deadline, 2,000-page bound, and a 20,000
media/folder entry bound. Its lease is renewed by elapsed time (20 seconds), not
for every file. File-list publication and missing-file marking happen only after
a complete scan. Partial, cancelled, revoked or superseded scans preserve the
previous visible snapshot. Unchanged media do not receive unnecessary UPDATEs.

## Metadata queue

Supported JPEG/HEIC/HEIF/PNG entries are queued by source, resource and revision;
unsupported formats, including video EXIF in this stage, are marked unsupported.
At most two metadata jobs are handled sequentially per five-second worker cycle.
Each read has a 25-second total deadline and consumes at most the first 512 KiB
of the original response before cancellation. The first scan schedules existing
photos too, repairing earlier failures whose revision never changed. Existing
valid metadata cache entries avoid a download. The first pass can therefore read
up to roughly 300 MiB of headers for 603 photographs; it does not download or
store the complete archive. Original files with EXIF outside that prefix may
remain unreadable and reach the retry limit.

States are pending, processing, complete, no-metadata, unsupported,
retryable-error and exhausted. Missing EXIF is a completed result, not an endless
retry. Temporary failures back off from one to 32 minutes, with six attempts.
An interrupted process consumes an attempt; an expired lease recovers with a
pause. Graceful shutdown requeues without consuming an attempt. A manual refresh
resets retryable/exhausted jobs, but never rereads all successfully handled files.

Publication rechecks revision, lease, source approval, account connection,
participation dates and archive exclusions. A photo whose upload date is outside
the trip can still enter later when its real EXIF date is discovered. No pending
metadata job can reintroduce an excluded image. Provider URLs and tokens are
never stored in the queue.

## Coordinates and compatibility

Manual coordinate edits are stored transactionally in `media_location_overrides`.
The importer reads that override at publication time, including edits made during
an EXIF fetch. Existing non-null positions are conservatively protected during
migration, since the previous schema cannot distinguish manual GPS from EXIF.
Dates and new GPS remain recoverable for files with incomplete metadata.

Schema 13 adds three independent tables: source_jobs, metadata_jobs and
media_location_overrides. It does not remove or replace existing columns. The
reviewed 12/13 compatibility-marker rollback retains queue and coordinate data;
normal SQLite backups include these tables. Disposable media caches remain
outside the database backup. The old application must not be restarted against
a schema-13 marker without the reviewed downgrade helper.

## Interface and verification

The existing archive remains usable during updates. Progress uses the small
status endpoint every three seconds while active, or every fifteen seconds while
metadata awaits a retry. Hidden/offline tabs pause polling. Full archive data is
refreshed only as published results change (at most every ten seconds while
active), plus completion; permission and navigation changes guard late responses.

Tests cover queued HTTP requests without external access, duplicate requests,
same-revision recovery, files with no EXIF, bounded retries, expired/crashed
leases, shutdown, manual GPS during fetch, revision changes, revoked permissions,
exclusions, incomplete scans, private status and an additive rollback. A mobile
browser regression verifies progress and automatic photo appearance without a
page reload.
