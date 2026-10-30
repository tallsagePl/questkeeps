# On-demand compatible video (1.34.0)

Open a video and choose Prepare compatible video. The original remains available while one background job downloads and prepares a copy. The UI polls only the active preparation, stops on unmount, and selects the completed copy. A ready copy is reused on subsequent views. Watch original remains an explicit choice.

## Format and resource bounds

- H.264/yuv420p video and AAC audio in MP4, plus a JPEG poster. No upscaling; landscape fits 1280x720 and portrait fits 720x1280.
- Suitable H.264/AAC files without rotation or HDR can be remuxed with faststart. Other supported inputs are encoded with one thread. HDR is mapped to SDR; display rotation is baked into encoded frames. Extra metadata, including location metadata, is not copied.
- Inputs are limited to 256 MiB and five minutes; outputs to 128 MiB and posters to 2 MiB. Opening/downloading has a two-minute budget, encoding ten minutes. Originals above these limits remain accessible through the original viewer/download.
- One video container has 0.5 CPU, 384 MiB RAM, 768 MiB combined RAM/swap and 80 PIDs. Email and Telegram remain in their separate light worker.
- FFmpeg reads local files only, with an input demuxer allowlist and file/pipe protocol allowlist. Signed URLs and OAuth tokens are not passed to FFmpeg or written to cache metadata.

## Cache and queue

`data/video-cache-v1` is a disposable derived cache separate from travel.sqlite. VIDEO_CACHE_DIRECTORY can override it. The entire directory is budgeted at 1 GiB across all users, including posters, temporary inputs/outputs and SQLite metadata. It does not allocate that space in advance.

A job reserves 544 MiB of scratch headroom before downloading; unviewed least-recently-used copies are evicted as needed. This accounts for input, output and faststart rewrite overhead. There is also a filesystem free-space check. The cached original input and partial outputs are deleted after success, failure or cancellation. Abandoned partial files are reconciled after a crash. Ready entries have a seven-day lazy TTL, checked when space is reserved.

The metadata database is bounded, with at most 256 jobs, 16 queued/processing entries and 512 reader leases. Only one converter across processes can hold the separate SQLite writer lock. HTTP readers acquire renewable leases before opening files; active copies are not evicted during normal delivery. Repeated decoder crashes stop after two attempts; graceful shutdown requeues its current job. Manual retries are rate limited and failures have a cooldown.

## Access and HTTP

Every status, queue, poster and playback request uses current media/author access and checks the source account connection. Revoking a share, changing participation dates, hiding media or disconnecting the account denies cached bytes too. Revisions are included in opaque cache keys and checked again before file delivery and after conversion.

POST /api/media/:id/playback (or /api/my-media/:id/playback) starts a permitted job. GET playback-status returns state/stage; GET/HEAD playback returns the completed video; GET/HEAD poster returns the poster. Playback preserves correct 200/206/416 semantics including suffix ranges. Responses are private/no-store. The original download endpoint is unchanged.

Queue state and derived files are excluded from the canonical database backup. They may be regenerated after a loss; account and trip records stay in travel.sqlite.

## Local and production operation

Install FFmpeg/ffprobe on PATH (or set FFMPEG_PATH/FFPROBE_PATH). npm run dev/start supervises the video worker when FFmpeg is present. npm run video:worker is available when running it separately. The worker heartbeat prevents accepting jobs when preparation is unavailable. Do not run an extra video worker alongside the supervisor without need; the lock still serializes them.

The Docker runtime includes FFmpeg. Deploy updated docker-release.sh and docker-retire.sh together. They start qk-video-blue/green, stop the preceding converter before replacement, restore it on a failed release, and retire the old application image only after all three new containers pass checks. No main database migration is required.

## Verification

Unit/API tests cover queue deduplication, cross-process exclusion, scratch reservations, active reader eviction, revision changes, guest/member/author ACL, disconnection, Range and HEAD. Linux integration tests use generated HEVC, HDR, H.264 and rotated samples and exercise the complete job. The browser fixture covers preparation, switching to a ready video and returning to the original. Actual device codec/network tests remain distinct from emulation.
