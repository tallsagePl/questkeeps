# Code style

Run `npm run format` before committing and `npm run format:check` to check without writing files.

- Keep `'use client'` / `'use server'` directives first, then imports, then declarations and exports. Preserve the order of side-effect imports.
- Use two spaces, single quotes, semicolons and trailing commas (Prettier).
- Separate top-level declarations with a blank line. Declare each variable separately; avoid long comma-separated chains of React state hooks.
- Name functions and values for their purpose. Use explicit domain types at API boundaries; do not expand the existing `Row` / `any` pattern in new features.
- Store interface copy in the locale JSON files. Render user-authored text directly. See [I18N.md](I18N.md).
- `npm run typecheck` also checks unused locals and parameters. Prefix intentionally unused callback parameters with `_` when their position is required.
- Keep formatting-only work separate from behavior changes when possible. Break large components into focused modules as a separate refactor with behavior checks.

The formatter uses the TypeScript/JSX parser to split safe variable declarations and group imports before running Prettier. It does not split `for` initializers or declarations with comments between bindings. The compact geographic dataset is excluded from formatting.
