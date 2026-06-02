## Fix /plus route 500 error

Move server-function files out of `src/server/` (blocked from client bundles by TanStack Start's import protection) into `src/lib/server/`, then update import paths across the project.

### Steps

1. Create `src/lib/server/` and move every file from `src/server/` into it (all `*.functions.ts` plus `paypal.server.ts`).
2. Remove the now-empty `src/server/` directory.
3. Update every `@/server/...` import in `src/` and `app/` to `@/lib/server/...`. Relative imports between the moved files (e.g. `./paypal.server`) stay valid.
4. Verify no stale `@/server/` or `src/server/` references remain and confirm `/plus` loads.

### Technical notes

- Root cause: TanStack Start's Vite import-protection plugin blocks any client-reachable import from `src/server/`. `src/routes/plus.tsx` imports `@/server/bplus.functions`, so the route file fails to transform with a 500.
- No feature changes — purely a file-location/import-path refactor.
- Other routes (`admin`, `solo`, `index`, `profile`, etc.) also import from `@/server/` and will be fixed by the same path update, preventing the same crash on those pages.