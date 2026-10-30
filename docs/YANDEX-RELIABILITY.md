# Yandex Disk connection recovery

## Observed failure

During production diagnosis on 30 October 2026, Undici diagnostics reported `ECONNRESET` while connecting to `downloader.disk.yandex.ru`, before a response arrived. One two-byte video request failed after 8.8 seconds; the next succeeded after 2.3 seconds. Another successful opening took 17.2 seconds. These measurements are samples from the VPS, not user-device performance guarantees.

Both IPv4 and IPv6 addresses resolved. There is no evidence here that changing DNS, disabling TLS checks, or forcing one address family would solve the reset. The exact network hop responsible remains unconfirmed. Previously an exhausted fetch surfaced as a generic application HTTP 500.

## Recovery policy

`lib/yandex-request.ts` centralizes safe GET/HEAD recovery. A request is attempted at most twice. Each attempt has a 10-second limit, with a 250-millisecond pause before retrying. Retryable connection errors include ECONNRESET, transient DNS and socket/connect timeouts. Retryable statuses are 408, 429, 500, 502, 503 and 504. Short Retry-After values are honored; values above two seconds fail without sleeping or retrying past the interactive budget. Unknown errors, certificate failures and terminal authorization/not-found/range responses are not replayed.

A separate 25-second opening deadline spans token acquisition, metadata, URL refresh and redirects for each media request. Metadata JSON parsing is inside the retry attempt and deadline. OAuth POST/token refresh is not automatically replayed. The existing preview job's shorter 18-second deadline remains in force.

When a media response is handed to the caller, opening timers are cleared. A video can continue streaming beyond 25 seconds, and an already handed-off stream is never replayed. Closing the viewer/request still aborts the underlying transfer. These are opening bounds, not a guarantee against a later provider stream interruption.

All redirect hosts are validated and OAuth credentials are removed before crossing origins, including retries. Successful video download URLs retain their existing private, bounded 60-second in-memory cache; original bytes are not stored.

## Failure handling

Exhausted upstream connection failures return localized HTTP 502 instead of an unhandled 500. Deadline expiration returns 504. Caller cancellation returns 499. The video viewer offers a visible Try again button that remounts the file and refreshes its URL. Russian and English error messages share the existing locale system.

Diagnostics log only stage, error code or HTTP status. They do not log credentials, account IDs, file paths, guest tokens or signed download URLs.

## Checks

Tests cover connection-reset recovery, a strict two-attempt limit, HTTP backoff, Retry-After, caller cancellation, a single total deadline, metadata body failures, a long video surviving opening deadlines, HTTP 502/504 mapping, Range preservation and redirect credential stripping. The browser scenario covers a failed video recovering through its visible retry button while keeping the trip open and retaining preload before Play.

A live smoke test uses only already guest-visible media and tiny Range requests. No new account session or sharing permission is created for diagnosis.

References: [Undici diagnostics](https://undici.nodejs.org/api/DiagnosticsChannel), [Undici retry handler](https://github.com/nodejs/undici/blob/main/docs/docs/api/RetryHandler.md).
