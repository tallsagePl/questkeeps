# Architecture

## Requests and access control

`app/api/[...path]/route.ts` delegates to `lib/api.ts`. The dispatcher keeps the shared origin check, authenticated boundary and error normalization. Domain handlers live in `lib/api/`:

- `auth.ts`, `oauth.ts`: email authentication and Yandex OAuth.
- `public.ts`: public profile, session, invitation and guest-link reads.
- `media.ts`: media delivery, metadata and places associated with a frame. These handlers enforce their own owner/member/guest checks through the access helpers.
- `friends.ts`, `profile.ts`, `accounts.ts`: authenticated social, profile and Disk operations.
- `trips.ts`: creation, trip changes, import and map operations.
- `collaboration.ts`: members, invitations, guest access, journal and sources.
- `http.ts`: bounded JSON parsing, response normalization and date validation.
- `context.ts`: request and authenticated-handler context types.

The order is deliberate: cron authentication remains separate, then origin validation, public handlers, and finally `requireUser` before authenticated handlers. A domain handler returns `undefined` only when it does not handle the route. Exceptions are normalized centrally.

`lib/contracts.ts` defines the main user, trip, media, place, journal, source and invitation shapes. SQLite query helpers accept an explicit result type. Request bodies are `unknown` until validated by their Zod schemas. Older query consumers retain the existing database row default; new domain code should supply a concrete type rather than extending that compatibility surface.

## Archive interface

`components/archive.tsx` composes the archive shell. `components/archive/use-archive.ts` owns session, navigation, requests and shared trip state. It preserves the session/navigation generation checks that prevent late responses from restoring an obsolete view.

The `components/archive/` directory contains focused header, dashboard, authentication form, gallery, places, journal, settings and dialog components. Views receive the typed controller; private lifecycle refs stay inside the hook. Local UI state belongs to the nearest component when it does not affect navigation or other tabs.

Media and place associations use concrete types. `hasCoordinates` rejects null and non-finite coordinates before map and distance operations. Opening a missing frame is a no-op, avoiding stale-selection failures.

## Messages and storage

Application messages carry a translation key and optional parameters. The server preserves readable API fields for compatibility and supplies explicit descriptors beside them. The client keeps descriptors through feedback and inference state, rendering them in the active language. There is no reverse lookup of Russian or English prose.

Migration 004 upgrades recognized errors already stored in `sources.error`; its mapping is frozen and limited to that service field. Parameterized sync errors use a tagged serialized descriptor in the SQLite text field, decoded only for source messages. Malformed or unknown provider messages remain unchanged. This does not introduce a JSON-file database or rewrite user content.

## Verification

`npm run format:check`, `npm run typecheck`, `npm test`, `npm run build` and `npm run test:e2e` cover the local checks. `.github/workflows/checks.yml` runs the same sequence on pushes to main and pull requests, with an isolated test database and no production credentials.

The workflow follows the official [Playwright CI setup](https://playwright.dev/docs/ci-intro), using a matching installed Edge channel. The application is not deployed by this workflow.
