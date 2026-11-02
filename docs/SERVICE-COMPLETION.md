# Service completion: release 1.36

## Implemented changes

Geographic discovery now runs in a separate worker. The HTTP read authorizes the current user, queues a versioned job and returns its last partial result. A worker processes one photo cell per lease; a changed scope invalidates the result. Results are capped at 2 MiB per job and 32 MiB in total. Wikipedia and OSM queues have bounded capacity, cancellation, priorities and deadlines covering queue wait and response bodies. Public articles use an 8 MiB cache. Old unreferenced public contours are pruned in batches; confirmed places and current trip candidates protect their geometry.

Photo derivatives are limited to 640 px for cards and 1600 px for the viewer, without upscaling, in the existing shared 256 MiB server cache. Both variants reuse the same upstream file. A validated 16 MiB / 32-entry browser memory cache avoids repeated decode checks. Initial speculative warmup is limited to 6 photos on phones or 12 elsewhere, with a 15-second and 6-MiB budget, and is disabled for Save-Data or slow connections. Gallery DOM retention is limited to three rendered windows, with a minimum of 24 entries. The original starts after the viewer preview; Save-Data/2g users keep the preview and may explicitly download the original.

Trip responses authorize before conditional validation. The opaque ETag changes on content, identity, access, labels, favorites, source and metadata changes. A browser keeps at most two private trip snapshots and clears them on session ending. EXIF cache lookups are batched. Default action timeout is 20 seconds; mutations are not blindly retried.

OAuth refresh is shared within a process and protected by a 45-second account lease across web and worker processes. Refresh has a 20-second request/body deadline; callers waiting on another process stop after 25 seconds. Client cancellation does not discard a rotated credential. Compare-and-set persistence and a final enabled-account check prevent reconnect races from restoring disconnected credentials.

Worker health files record release identity, loop starts/successes/failures and event-loop delay. General worker, video and geography have separate Docker health checks. Loop failures back off. Telegram permanently rejected, malformed or exhausted deliveries terminate and can be explicitly retried. Email honors bounded Retry-After, stops permanent failures and keeps provider idempotency keys. Private payloads are not logged.

Anniversary memories use current member dates and visibility and never infer access from a guest subscription. Follow updates include only currently public media and journal entries; revoked/replaced links remove access and notifications. Visible tabs coordinate polling when browser APIs permit; restrictive browsers fall back safely. These features send no automatic email or Telegram campaigns.

Video preparation also extracts ISO6709 GPS from files it already processes, without starting a bulk download. Manual photo location overrides remain protected. Existing compatible copies stay at 720p and the shared video cache stays at 1 GiB.

## Release and recovery

GitHub Actions verifies source, browser behavior and the actual production image before publishing a short-lived image artifact and its SHA-256 manifest. The VPS imports the exact image without rebuilding npm dependencies. The loader verifies archive length/digest and image revision/ID before execution. A failed candidate keeps the prior image and traffic target. All four replacement containers must pass before retirement. Delete the CI image artifacts after a successful deployment; retain only the current production image. Only the canonical database is backed up, on the server and PC.

Schema 14 adds independent queues, caches and invalidation triggers. Schema 15 adds the independent password recovery table. The reviewed compatibility tool can restore the schema-13 marker without restoring an old snapshot or dropping user data. Re-upgrade is idempotent. Deployment scripts and schema helper must be updated together.

## Acceptance and limits

Unit/API tests cover access revocation before 304, partial geographic jobs, provider cancellation/body limits, shared image downloads, private memories, follower visibility, terminal deliveries and OAuth cancellation/disconnection. Browser tests cover restricted login, long scrolling, media reload, notifications, short pages and phone/tablet/laptop layouts. POSIX release tests simulate failed assets, failed workers and successful retirement.

This release does not claim that an emulated browser proves all Russian mobile/VPN routes or iPhone Safari behavior. Real-device connection checks and playback remain required acceptance on the affected device. Provider outages degrade with explicit retries; they are not evidence that every route is reachable. Full gallery cursor pagination, adaptive streaming, external storage and multi-node databases remain scaling options, not prerequisites established by the current 779-file archive. No external analytics or background marketing consent is inferred.

## Password recovery

`/reset-password` requests a one-time email link for an explicitly verified primary address. Requests return the same response for unknown and unverified accounts. Address and requester budgets restrict repeated requests. The token lasts 30 minutes, is hashed in the database and travels in a URL fragment that the page immediately removes. Opening the link does not change credentials; the user must submit and confirm a new password. Requesting another link invalidates the preceding one.

The token is bound to the current password and email. The final transaction rechecks it after bcrypt, changes the password, consumes all reset links, cancels outstanding reset emails and revokes every session for that user. Concurrent attempts cannot both succeed. Login rechecks credentials inside session creation so a previously started old-password login cannot race the reset. No automatic sign-in occurs. Verification and recovery reuse the branded RU/EN mail template and bounded delivery queue; these are transactional emails, not marketing campaigns.
