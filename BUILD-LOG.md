# BUILD-LOG

Append to this as you go. Commit it with the code it describes — the timestamps are part of the
evidence, and a log that arrives in one commit at the end reads as what it is.

---

## 2026-09-26 · Phase 0 — orientation

- **Initial state verification**: Reset the database via `npm run db:reset` in `starter/`. Verified the starting line by running the 4 shipped test suites:
  - `node scripts/check-jwt.js`: 0 passed, 43 failed. Every failure traced to the unimplemented `verifyAccessToken()` in `server/auth.js`.
  - `node scripts/check-permissions.js`: Aborted immediately with `Error: TODO: server/permissions.js — resolve() is yours to write (BRIEF.md §3)`.
  - `node scripts/check-personalisation.js`: Printed overlay `bb339819425c` with undocumented role `reviewer` and permission `device:reboot` in `Ironside Labs`, then failed on the `resolve()` stub.
  - `node scripts/check-api.js`: Aborted on `dana logs in` with HTTP 404 because `server/routes/` is unmounted.
- **Unexpected observation on SQLite pragmas**: Checked `server/db.js` where `db.pragma('foreign_keys = ON')` is explicitly set per connection. Verified that without this pragma, SQLite ignores foreign key constraints entirely; inserting an unknown permission like `device:teleport` into `grant_permissions` would silently succeed instead of raising `FOREIGN KEY constraint failed`.
- **System model**: One single Node process hosting `node:http` API handlers under `/v1/*` and Vite dev server for the React SPA. No external CORS or reverse proxy needed.
