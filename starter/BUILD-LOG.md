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

---

## 2026-09-26 · Phase 1 — token verification

- **Implementation**: Completed `verifyAccessToken(token, secret)` in `server/auth.js`.
- **Wrong prediction & A6 Discovery (Header parsing order)**:
  - Expected that verifying the cryptographic signature first would be the safest path before parsing claims or headers.
  - *Observation*: To verify an HMAC signature, one must know whether the token claims to use `HS256` or if an attacker sent an `alg: none` or asymmetric key confusion token (`RS256`). Thus, the header must be decoded first to inspect `alg` and `typ`.
  - *Pitfall caught*: If header base64url decoding or `JSON.parse()` fails, or if `header` is not a plain object, Node throws an unhandled `SyntaxError` unless wrapped in a try/catch. Wrapped both header and payload decoding to throw `unauthenticated('malformed token header')` and `unauthenticated('malformed token payload')`, preventing malformed header fuzzing from crashing the process (Tier A concept A6).
- **Buffer length trap with `timingSafeEqual`**:
  - `crypto.timingSafeEqual(a, b)` throws a fatal `RangeError: Input buffers must have the same length` if `a.length !== b.length`. Truncated or empty signatures would crash the worker.
  - Added explicit guard `actual.length !== expected.length || !timingSafeEqual(actual, expected)` returning 401 `unauthenticated('bad signature')`.
- **Half-open expiry boundary (B7)**:
  - Verified `claims.exp <= now` is rejected. A token evaluated at the exact second of expiration is considered expired (AUTH-DATA-MODEL.md §10 / D7).
- **Verification**: `node scripts/check-jwt.js` -> 43 passed, 0 failed.
