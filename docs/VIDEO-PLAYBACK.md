# Video playback

QuestKeeps uses the pinned Apache-2.0 Video.js 10 React player (`@videojs/react` 10.2.0). The player and its locale packs are served by our application, not a third-party player CDN. It is dynamically imported when a video viewer opens in a trip or the profile library.

The packaged skin provides seeking, volume, speed, fullscreen, picture-in-picture, keyboard shortcuts and Russian/English controls. `playsInline` preserves inline iPhone playback. Player arrow keys do not change the surrounding gallery selection. Metadata preload avoids fetching every original when the gallery opens. A source change/remount clears stale playback errors; an early native error is also checked after mount.

## Delivery

Original bytes stream from Yandex Disk through the existing authenticated media route. No whole-video file cache or conversion worker is added. Every seek retains its `Range` header; 206, Content-Range, Content-Length and Accept-Ranges are forwarded. Unsatisfiable ranges retain 416 and Content-Range rather than becoming a generic upstream error. Malformed empty ranges never reach the provider.

To avoid a metadata round trip for every seek, successful video download URLs are held only in process memory for 60 seconds, with a maximum of 128 entries. Keys include account, resource, path and revision. A reused URL returning 401/403/404 is refreshed once. Manual media reload bypasses it. URLs are never exposed to the browser or persisted. Existing redirect validation and removal of credentials on cross-origin redirects remain in effect.

Access checks still run for each request and again after upstream response headers arrive. Disconnecting an account, revoking a guest link or changing membership does not inherit cached authorization. Already delivered bytes cannot be revoked retroactively.

## Codec boundary

A JavaScript player does not supply unsupported native decoders. A bounded production sample found H.264 (`avc1`) in MP4 and HEVC (`hvc1`) with AAC (`mp4a`) in MOV. This is a sample, not a codec inventory of every file. HEVC support depends on the browser, operating system and hardware. Incompatible originals still need a separately designed compatible rendition, typically H.264/AAC MP4 or HLS. That processing and its storage budget are not enabled in this release.

## Verification

- Provider tests cover URL reuse, revision changes, manual reload, expiry, account disconnection, byte-range response headers and guest revocation during an upstream request.
- Browser fixtures cover actual generated video playback, recovery after failure, gallery keyboard isolation and a phone viewport. Media layout checks cover widths 393, 1024 and 1440.
- Emulation does not replace a physical iPhone/Safari playback test.

References: [Video.js installation](https://videojs.org/docs/guides/installation/react), [native video behavior](https://videojs.org/docs/reference/components/video), [Vidstack maintenance status](https://vidstack.io/docs/player/), [Plyr maintenance status](https://github.com/sampotts/plyr).
