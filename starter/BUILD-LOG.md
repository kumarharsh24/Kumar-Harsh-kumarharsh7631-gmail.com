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

---

## 2026-09-26 · Phase 2 — caller context and resolution engine

- **Implementation**:
  - `server/context.js`: Bearer token extraction, org isolation, soft-deleted org hiding, and membership validation.
  - `server/permissions.js`: Dynamic catalogue loading from `permissions` table, baseline from `role_permissions`, wildcard expansion (`*`, `device:*`), and batched `resolveDevices()`.
- **Wrong prediction on grant precedence (B1)**:
  - *Initial model*: Expected narrower scope to beat broader scope (e.g. a specific device allow overriding an org-wide deny).
  - *Observation*: `check-permissions.js` asserts that a device-scoped allow does NOT carve out an org-wide deny.
  - *Resolution*: Implemented two-pass resolution in `buildPermissions()`: pass 1 expands all active `deny` grants into a `denied` map. Pass 2 fills allows from role baseline, then from active `allow` grants. Denies are immutable once recorded.
- **Discovery A2 (Org-level union for navigation presence)**:
  - When `deviceId === null`, `collectGrants()` retrieves all grants for `(userId, orgId)`. If an operator holds a device-scoped grant on only one workstation, the element is allowed in the org-level union, ensuring UI nav headers (`data-testid="nav-devices"`) render unlocked.
- **Contradiction A4 solved (Suspension vs Token Freshness)**:
  - `AUTH-DATA-MODEL.md §1` states suspension increments `perm_version`. But `AUTH-DATA-MODEL.md §10` demands that a suspended token yields a 403 `suspended` response with an empty permission set.
  - *Problem*: Calling `assertFresh()` first would throw 401 `TOKEN_STALE`, masking the suspension.
  - *Fix*: In `server/context.js`, `assertFresh` is skipped specifically when `membership.status === 'suspended'`, allowing the context to form and `resolve()` to produce `deny` with reason `suspended`.
- **Batched list resolution without N+1 or cache cross-contamination (B6)**:
  - In `resolveDevices()`, avoided per-row SQL queries by loading catalogue, membership, and baseline once, and querying all grants in a single pass. Rows are filtered in memory. Rejected an in-memory cache keyed by `userId` because it would leak permissions across org boundaries.
- **Verification**:
  - `node scripts/check-permissions.js` -> 35 passed, 0 failed.
  - `npm run personalisation` -> 18 passed, 0 failed (handled overlay `reviewer` / `device:reboot` in `Ironside Labs`).

---

## 2026-09-27 · Phase 3 — orgs, members, invites, devices, grants

- **Implementation**:
  - `server/lifecycle.js`: `roleRanks()`, `assertCanModify()`, `assertNotLastOwner()`, `endActiveSessions()`, `snapshotAuthority()`.
  - `server/routes/orgs.js`: Org CRUD, member list, self-leave, role assignment, suspend/reinstate, member removal.
  - `server/routes/invites.js`: Hashed invite token generation, single-use acceptance, membership invitation state.
  - `server/routes/devices.js`: Device CRUD with row exclusion on `device:view`, device transfer across orgs, and grant management.
- **Discovery A1 (Re-inviting removed member)**:
  - *Observation*: `schema.sql` defines `UNIQUE(org_id, user_id)` on `memberships`. When a user is removed, their row is set to `status = 'removed'`, preserving audit integrity.
  - *Problem*: Re-inviting an email of an existing user triggered `INSERT INTO memberships (..., 'invited')`, failing with `UNIQUE constraint failed: memberships.org_id, memberships.user_id`.
  - *Fix*: In `invites.js`, checked for an existing membership row. If present, updated `status = 'invited', role = ?, invited_by = ?`; otherwise inserted a new row.
- **Separation of modification rank from permissions (D8)**:
  - `roles.rank` dictates who may modify whom. Verified that `auditor` and `operator` are unordered by permissions, so `roles.rank` is never consulted by `can()` or `resolve()`.
- **Privilege laundering prevention across scopes (A3 / D9)**:
  - `assertMayGrant(db, ctx, wanted, deviceId)` resolves caller's permissions with `deviceId` matching the grant scope. An admin with an org-wide deny cannot confer that permission, and a device-scoped allow cannot be laundered into an org-wide grant.

---

## 2026-09-27 · Phase 4 — sessions, audit, and auth pipeline

- **Implementation**:
  - `server/routes/sessions.js`: Session creation with compound checks, lazy TTL sweep, deliberate termination.
  - `server/audit.js`: Append-only audit logging and `auditDenials()` wrapper.
  - `server/routes/auth.js`: Login, org-switch token issuance, rotating refresh tokens with reuse/family revocation.
  - `server/routes/index.js`: Route registration in specific-first order (`/members/me` before `/members/:userId`).
- **Compound check error specificity (B2)**:
  - Verified `assertCanStartSession()` enforces `session:start` first (reporting `missing_permission` on failure), followed by the mode-specific permission on that device (reporting `missing_device_permission`).
- **Database concurrency for exclusive sessions (B5)**:
  - Leveraged SQLite partial unique index `one_exclusive_session_per_device` for `control` and `terminal` modes. On collision, caught `SQLITE_CONSTRAINT` and returned HTTP 409 with code `DEVICE_BUSY`.
- **Grandfathering vs Cascade (B3)**:
  - Grandfathering verified: demoting Sam from operator to viewer does not terminate her live active session (verified `end_reason` remains null); only subsequent sessions are blocked.
  - Tenancy events cascade: suspending a user or transferring a device terminates active sessions immediately.
- **Closed vocabulary constraint on end_reason (A7)**:
  - Schema `CHECK` constraint strictly bounds `end_reason` to 7 values (`user_stopped`, `user_suspended`, `membership_removed`, `device_transferred`, `admin_terminated`, `session_expired`, `superseded`). Reused `device_transferred` on device decommission.
- **Auditing denials only (Invariant 10)**:
  - Denied mutations are captured via `auditDenials()`, recording `reason_code`. Denied reads (`GET`) are omitted to avoid log pollution.
- **Alphabetical default org selection (A8)**:
  - When logging in without `orgId`, `membershipsOf()` orders by `o.name ASC`, selecting the alphabetically first org.
- **Verification**: `node scripts/check-api.js` -> 66 passed, 0 failed.

---

## 2026-09-27 · Phase 5 — the console (React SPA)

- **Implementation**:
  - `web/App.jsx`: Main shell with `data-testid="app-shell"`, `data-org-id`, `data-org-theme`, navigation gating, org switcher.
  - `web/api.js`: In-memory token management, automatic session restoration from HTTP-only cookie on boot, error descriptor mapping.
  - `web/styles.css`: CSS custom properties driven by `data-org-theme` (cobalt, amber, moss, plum, rust, teal), giving distinct visual backgrounds per organization.
  - `web/components/Action.jsx`: Atomic action component rendering `data-permission` and `data-state="unlocked"` when allowed; completely unrendered (`return null`) when denied (presence semantics, never disabled buttons).
  - `web/components/Login.jsx`: Sign-in form with clear error presentation (`data-testid="login-error"`).
  - `web/components/Devices.jsx`, `Grants.jsx`, `People.jsx`, `Sessions.jsx`, `Audit.jsx`, `Admin.jsx`, `AcceptInvite.jsx`.
- **Architectural test verification**:
  - Verified that intercepting `/v1/orgs/*/devices` to inject an explicit deny makes the button disappear from the DOM immediately, proving zero client-side role hardcoding.
- **Two tabs / multi-tenant isolation**:
  - Verified across two independent browser contexts that org content and tokens never cross-bleed.
- **Performance & build verification**:
  - `npm run build` completed in 1.28s (dist: index.html 0.39 kB, css 4.33 kB, js 251.92 kB).
  - `npx playwright test` -> 25 passed, 0 failed in 15.8s.

---

## 2026-09-27 · Phase 6 — hardening and edge-case validation

- **Ungated routes analysis (Tier A concept A5)**:
  - Mapped public routes: `POST /v1/auth/login`, `POST /v1/auth/refresh`, `GET /v1/invites/:token`, `POST /v1/invites/:token/accept`.
  - Verified that because these routes bypass `authenticate()` and `resolve()`, a membership with `status = 'suspended'` or `status = 'removed'` does not block the user from redeeming an invite in a different org or refreshing a valid family token in another active membership.
- **Measured response timings**:
  - Suite execution benchmark:
    - `check-permissions`: 35 tests in ~45ms.
    - `check-jwt`: 43 tests in ~25ms.
    - `check-api`: 66 integration tests over HTTP in ~620ms.
    - `check-personalisation`: 18 tests against random nonce in ~30ms.
    - `ui.spec.js`: 25 end-to-end browser tests in 15.8s.

---

## 2026-09-27 · Phase 7 — documentation, clean-checkout ergonomics, and repository push

- **Ergonomics & Scripts**:
  - Added root & starter convenience check scripts (`npm run check:jwt`, `check:permissions`, `check:api`, `check:all`).
  - Verified clean checkout commands from both repository root and `starter/` directory: `npm install && npm run db:reset && npm run dev`.
- **Candidate Submission Readme**:
  - Replaced internal packaging notes with comprehensive candidate submission README covering architecture, invariants, quickstart commands, and test suites.
- **Full Suite Confirmation**:
  - Ran `npm run check:all` confirming all 187 checks pass (43 JWT + 35 Permissions + 66 API + 18 Personalisation + 25 Playwright).
- **Public Repository Sync**:
  - Pushed to GitHub repository (`git@github.com:kumarharsh24/Kumar-Harsh-kumarharsh7631-gmail.com.git`) over SSH with verified public reachability.

---

## Open threads

- **Logout endpoint (HTTP contract gap)**:
  - The API specification provides no `POST /v1/auth/logout` endpoint to invalidate the refresh token family on the server. The client currently clears its in-memory access token, but until cookie expiry, a browser reload could re-authenticate if not cleared by browser devtools. A future enhancement should add a revocation route for the current refresh token family.
- **Audit query indexing under high volume**:
  - `audit_events` currently has index `audit_events_by_org (org_id, at)`. For high-volume multi-tenant audit export, adding composite indexes on `(org_id, action, at)` and `(org_id, actor_id, at)` would optimize filtered queries.

