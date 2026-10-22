# Code review — 23 October 2026

Scope: source readability, localization boundaries, API message handling, TypeScript diagnostics and existing regression coverage. This is a focused engineering review, not a claim that every possible defect has been eliminated.

## Fixed

- UI translation relied on whole phrases, reverse English lookup and pattern matching. Two JSON dictionaries now use typed stable keys and explicit interpolation parameters.
- Matching user text could be mistaken for interface copy. User-authored content is rendered directly; regression coverage includes the name `Start`.
- Validation and OAuth copy used different mechanisms, and several controls lacked English labels. They now use the same dictionaries; stored field validation changes language without resubmission.
- Malformed JSON responses produced a raw parsing exception. The client now reports a localized request error while preserving cancellation.
- Interleaved imports, long multi-variable declarations and inconsistent spacing made scanning files difficult. The source formatter normalizes these and has a check mode.
- Unused imports, bindings and callback parameters have been cleaned up. TypeScript now enforces unused-code diagnostics.

## Remaining work

- `components/archive.tsx` combines authentication, trip state, tabs, sharing and media interaction. Split it by domain, keeping state ownership and cancellation behavior explicit.
- `lib/api.ts` remains a large endpoint dispatcher. Extract handlers by domain and introduce response types before replacing broad `Row` / `any` usage.
- Legacy API errors are still readable Russian strings with translation metadata added at the boundary. Migrate producers gradually to explicit message codes; do not translate arbitrary third-party or user text by dictionary matching.
- Some assembled hints and short-lived parameterized notices are resolved when created. A later cleanup can store descriptors throughout state for immediate language switching in every transient status.
- There is no hosted CI workflow yet. Run formatting, type checking, unit tests and isolated browser checks before merging; automate these when the deployment pipeline is established.

The database already uses SQLite with migrations, foreign keys, WAL mode and parameterized queries through the database helpers. Application data is not being moved to JSON; the new JSON files contain interface translations only.

## Validation

- Production build completed successfully.
- TypeScript passed with unused-local and unused-parameter checks enabled.
- Formatting checks passed.
- 114 unit/API tests passed, followed by 3 focused client API regression tests.
- All 53 browser scenarios passed against an isolated database (desktop, mobile, localization and accessibility coverage).
