# Mobile networks and VPN: incident investigation, 24 October 2026

## Confirmed findings

- The supplied iPhone screenshot shows the password form waiting after submit. The login POST had no deadline. A stalled connection could leave the submit button disabled indefinitely. The following trips read also had no deadline.
- The current Nginx access log contained no password-login POST at the screenshot's approximate time (16:50 Moscow / 13:50 UTC). Access logs record completed requests, so this cannot distinguish an in-flight connection from a request that never arrived. The evidence does not establish an operator or VPN block.
- A look-up using the local resolver and Google's public DNS returned A `222.167.230.214`; Google returned no AAAA. HTTPS is served directly by the VPS, not Cloudflare's HTTP proxy. Cloudflare currently supplies authoritative DNS. RIPE RDAP identifies the /24 as DE; this is registration metadata, not a measured physical location.
- The certificate covers questkeeps.ru and is valid 22 October 2026–20 January 2027. Local anonymous /api/me completed around 0.17 s; a probe from the server completed around 0.22 s. TLS 1.2 also succeeded. These are two available vantage points, not Russian carrier measurements.
- No kernel OOM events were found for the preceding six hours. The active web container was healthy with no observed restart during these checks. Historical slow media/map requests exist, including a 109 s area-suggestions 502 at 09:02 UTC; they are not evidence that the 13:50 UTC login failed for the same reason.
- Nginx compressed HTML but had its additional gzip_types commented out. Public JavaScript chunks reached approximately 230 KB uncompressed. Text asset compression reduces transfer cost on constrained links.
- The session is identified by an HttpOnly, Secure, SameSite=Lax cookie, not the client's IP or country. A VPN exit-IP change does not invalidate that session. Nginx's login/register rate limit is shared by clients at one exit IP (5/min, burst 5); it can return 429, not an intentional infinite wait. Application account/identity limits remain separate.
- Password login uses local SQLite and bcrypt. It does not call Yandex, Resend, Telegram or map providers. Yandex OAuth is a separate cross-domain flow and can fail independently through a VPN. External media/map availability must not be mistaken for local authentication availability.

## Implemented mitigation

- Login/register requests abort after 15 s; the action's finally releases the busy button and retains entered fields. POST requests are not automatically replayed because a timed-out response does not prove the server failed to create a session/account.
- Trips, selected-trip and initial share/invitation reads have 20 s deadlines. Initial read errors show the archive recovery state. If login succeeds but the trips read fails, preserve the authenticated session and offer a read-only page retry.
- Gzip for public JavaScript, CSS and SVG, with Vary: Accept-Encoding. Personalized JSON is deliberately excluded from the added gzip types.
- `/connection-check.html` is independent of React and its bundles. A user-triggered run checks anonymous API access and a complete 67,332-byte public image with a 15 s deadline per request. It does not use account cookies, export personal data or transmit a diagnostic report. A small API passing while a larger object stalls is evidence of a size/transport-sensitive failure, not proof of a particular filtering mechanism.

## What remains unverified

We do not have the affected phone, SIM, VPN client or exit node. No test here establishes availability on every Russian carrier, NAT64 network, VPN route or temporary mobile whitelist. The VPN/operator/country and paired results from the affected phone are required to localize the reported failure.

Run the check on the same device with: mobile without VPN; mobile with VPN; Wi-Fi without VPN; Wi-Fi with VPN. Record UTC time, operator, VPN client and country, API/image status and timings. Do not share passwords, cookies or VPN configuration credentials. If the diagnostic page itself fails, compare DNS resolution, TLS and the route outside the web app; JavaScript changes cannot repair an unreachable origin.

Potential causes to test, not assume: VPN split-routing/DNS mismatch, tunnel reconnection, MTU/packet loss, carrier filtering of the host/IP, exit-IP rate limiting, and separate Yandex OAuth restrictions. Do not add an AAAA record without a working IPv6 listener and tested route; IPv4-only DNS is not itself proof of a mobile connectivity bug.

Cloudflare documents Russian ISP throttling of its proxied sites, including transfers stopping around 16 KB. This is relevant when choosing future infrastructure, but the present DNS-only/direct origin means that report does not prove the cause of this incident. Switching on the Cloudflare proxy is not an established fix.

Sources checked:

- https://developers.cloudflare.com/support/troubleshooting/general-troubleshooting/service-disruption/
- https://blog.cloudflare.com/russian-internet-users-are-unable-to-access-the-open-internet/
- https://rdap.db.ripe.net/ip/222.167.230.214
- https://dns.google/resolve?name=questkeeps.ru&type=A
- https://dns.google/resolve?name=questkeeps.ru&type=AAAA

## Independent public measurements

At approximately 14:09–14:13 UTC, Globalping performed 20 anonymous HTTPS GET requests:

- API and image from eight points each: four Russian data-center networks, two German points, two Dutch points. All reported HTTP 200 and an authorized TLS certificate. Russian API timings were 173–197 ms; image timings were 452–484 ms.
- Additional image requests in AS8359 (MTS, Novosibirsk), AS3216 (Vimpelcom, Moscow), AS12389 (Rostelecom, Nizhniy Novgorod), AS25513 (MGTS, Moscow): all HTTP 200, authorized TLS, 312–670 ms, response Content-Length 67,332. An ASN name does not establish a mobile/LTE access link or the user's route. Globalping truncates captured bodies; the on-device check independently verifies the exact downloaded byte count.
- Measurements: `2ccAJLgDDzGphVyxr00021NNB` (API), `2VloH5BKRz4Jtn8xg00021NNB` (image), `2NuCfRRZHze2x1yi700021NND` (Russian operator ASNs). Results are available at `https://api.globalping.io/v1/measurements/<id>` while retained by that service.
- After applying Nginx text compression, the same 229,820-byte public JavaScript chunk transferred in 72,591 bytes with gzip: approximately 68% less. Both requests returned 200. This improves transfer cost; it does not prove a VPN routing problem has been fixed.

These measurements weaken the hypothesis of a universal Russian-origin block at that moment. They do not rule out selective mobile filtering, regional outages or one VPN exit failing.

## Build capacity finding

The first 1.20.3 Docker build exhausted the 16 GB disk while copying runtime dependencies. The serving 1.20.1 container remained healthy with zero restarts at inspection. Unused build cache, an unserved intermediate image, and node_modules/.next build artifacts from two obsolete native releases were removed. Current shared data, backups, the active image, source files and the latest native release were preserved. Before future builds, check free disk space and obsolete build artifacts; blue/green containers alone do not solve disk capacity.
