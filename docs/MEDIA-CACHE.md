# Private photo preview cache

Version 1.31.0 adds a server-wide cache for Yandex XL preview images only. It
never caches original files or video streams. It is separate from database
backups: the canonical SQLite backup helper copies only `travel.sqlite`.

## Budget and lifetime

The combined budget is 256 MiB for the whole server, not per user. Preview payloads
use at most 252 MiB of 4 KiB-aligned allocation; the remaining 4 MiB is reserved
for the bounded metadata database and its rollback journal. The metadata DB is
limited to 256 pages of 4096 bytes. At most 2048 images are retained, with a 24-hour
TTL and least-recently-used eviction during writes. A single cached preview is
limited to 8 MiB. Larger previews continue through the original streaming path.
The cache does not preallocate its full budget.

The default location is `data/preview-cache-v1` beside the application database,
inside the shared private data mount. It survives a web restart and is shared by
blue/green slots. `PREVIEW_CACHE_DIRECTORY` may override that location; unit tests
always use an isolated fixture directory. Do not place it under a public/static
asset directory. Files use opaque SHA-256 keys and private filesystem permissions.
No provider URLs, guest capabilities or OAuth credentials are persisted there.

A separate SQLite metadata index coordinates writers across processes with
`BEGIN IMMEDIATE` and zero busy timeout. Contention or storage failure skips the
cache write instead of failing a photo. Atomic file publication and reconciliation
remove orphaned temporary files after interrupted writes. Cleanup touches only
recognized preview/temporary filenames within this cache directory.

## Access and invalidation

Every API preview request checks normal trip/guest or private-author access
before reading cached bytes. Source account connection state is also checked.
After an asynchronous load, access and connection state are checked again before
returning bytes. Cache hits never substitute for authorization. Responses remain
`private, no-store`; Nginx/CDN must not cache this private endpoint publicly.
Already downloaded browser images remain governed by the existing per-session
browser cache behavior; server caching cannot revoke bytes already downloaded.

Keys include provider account, resource ID, path, revision and variant version.
A changed revision/path creates a new entry. Rotation and titles remain client
presentation data. The existing reload button's `reload` parameter bypasses the
cached bytes and refreshes the short-lived provider preview link.

Valid images are decoded at a tiny output size before retention, with an 8-million
pixel input limit. A corrupt/unsupported upstream image is not retained. Original
bytes remain unchanged; this validation does not create a new export or modify
photo metadata. Every hit checks the stored byte length and SHA-256 digest.

## Request sharing and resource limits

Concurrent viewers of the same account/resource/revision share one upstream load.
Canceling one viewer does not cancel others; the last departing viewer aborts the
shared request. At most four upstream preview jobs run, with at most 32 distinct
in-flight/queued resources and an 18-second job budget. Provider metadata URLs
have a bounded, memory-only 60-second cache; 401/403/404 from an expired preview
link trigger one link refresh. Original downloads keep their existing path.

A decoded browser image is returned without waiting for `CacheStorage.put`.
A generation check removes late writes after logout or account changes.

## Verification and operations

`X-QuestKeeps-Preview-Cache` is `hit`, `miss` or `shared` on the optimized path.
It contains no resource IDs, URLs or credentials. For authenticated diagnostics,
compare repeated permitted preview requests and their hashes. Do not distribute
private guest links to third-party speed-test services.

The internal `previewCacheStats()` function in `lib/server-preview.ts` reports
entry count, aligned payload allocation and the fixed limits. A full cache is
normal: old entries are evicted automatically. A full/unavailable disk must not
turn a successful provider response into a failed photo.

Tests cover cross-process-style quota sharing, concurrent writers, expiry,
corruption, storage failure, shared loads, cancellation, manual refresh, revision
changes, revoked links, participation dates, hidden media, account disconnection,
permission changes during transfer, and logout during browser-cache writes.
