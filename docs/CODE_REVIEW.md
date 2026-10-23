# Code review — 23 October 2026

Scope: source readability, localization boundaries, API message handling, TypeScript diagnostics and regression coverage. The follow-up in version 1.12.0 addresses the five refactoring items identified in version 1.11.0.

## Completed follow-up

- Split the archive into a shared state/navigation hook, focused tabs, dialogs and shell components. The original session and navigation generation guards remain in the controller.
- Split the API dispatcher into domain handlers while retaining shared origin, authentication and error handling boundaries.
- Added user, trip, media, place, journal, source and invitation contracts; removed the generic `Row` / `any` model from the archive and its extracted views. JSON request bodies remain `unknown` until validated. Typed query helpers and generic response types support gradual adoption in older modules.
- Replaced message lookup by Russian text with explicit application keys/descriptors. Migration 004 upgrades existing sync errors without rewriting profile names, journal text, paths or other user content. Provider messages remain verbatim.
- Preserved parameters through feedback and inference state so a language change does not require resubmission or another API call.
- Added a GitHub Actions workflow for formatting, types, unit/API tests, production build and the isolated browser suite. It does not require production secrets.
- Added guards for missing media selections and missing/non-finite coordinates, plus regression tests for message boundaries and migration idempotence.

See [ARCHITECTURE.md](ARCHITECTURE.md) for module responsibilities and [I18N.md](I18N.md) for the message contract.

## Quality boundaries

The extracted archive and route contexts have concrete contracts. Older helper modules still contain legacy database row defaults and a compatibility API result type; those are isolated from the newly typed archive model. This review does not claim that every old helper now has a complete runtime response schema or that every possible defect has been eliminated.

SQLite remains the application database, with migrations, foreign keys, WAL mode and parameterized queries. JSON files contain translations, geographic reference data and fixtures; user accounts and trips are not stored in JSON files.

## Validation

- TypeScript checks include unused locals and parameters.
- The unit/API suite covers access control, migrations, locale parity, literal interpolation, preservation of user content, coordinate guards and typed message transport.
- Browser checks cover desktop/mobile authentication, trip navigation, media, map, journal, sharing, profile, both languages/themes and parameterized messages after a language change.
- External Yandex and email calls are stubbed in automated tests. Live production integration checks are separate from these regression results.
