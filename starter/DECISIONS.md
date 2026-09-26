# DECISIONS

One section per decision that a reviewer might reasonably have made differently. Every section has
the same four parts, and the third and fourth are the ones we weigh most.

Rules, from `DISCOVERY-BRIEF.md`:
- cite something real in `Why` — a commit, a test, an error string, a file and line
- do not restate what a document says; describe what you did when the documents ran out
- six to twelve decisions is the expected range

---

### PRAGMA foreign_keys enforced at connection creation
**What I chose:** Set `PRAGMA foreign_keys = ON`, `journal_mode = WAL`, `busy_timeout = 5000`, `synchronous = NORMAL` unconditionally in `openDatabase()` (`server/db.js`).
**Why:** SQLite leaves foreign keys disabled by default on every new connection. Tested inserting an invalid permission into `grant_permissions` without `foreign_keys = ON`; the database inserted the invalid row with zero errors. With `foreign_keys = ON`, SQLite throws `FOREIGN KEY constraint failed`, offloading pattern validation directly to the database engine.
**What I rejected:** Relying on application-level checks before every SQL INSERT. Check-then-act introduces race conditions and code duplication across route handlers.
**What would change my mind:** If SQLite enforced foreign keys globally by default without per-connection configuration.

---

### Algorithm pinning and defensive header decoding in token verification
**What I chose:** Decode and validate header `alg === 'HS256'` and `typ === 'JWT'` inside a try/catch before signature computation, and explicitly check buffer lengths prior to `timingSafeEqual`.
**Why:** In `check-jwt.js`, test cases test `alg: none` confusion, asymmetric algorithm substitution (`RS256`), and malformed JSON payloads. Attempting `timingSafeEqual` with unequal lengths throws an unhandled `RangeError` (caught in `check-jwt.js:77` during development). Defensively decoding the header ensures invalid base64url or non-JSON payloads map cleanly to `401 UNAUTHENTICATED` without crashing the HTTP server.
**What I rejected:** Blindly verifying signature before inspecting header algorithm, or trusting the algorithm declared in untrusted headers without pinning to `HS256`.
**What would change my mind:** If the system adopted public-key cryptographic tokens (e.g., Ed25519) with a multi-key rotational keystore.

---

### Unconditional deny precedence over allow without specificity carve-outs
**What I chose:** Evaluated all active `deny` grants into a dedicated map prior to evaluating role baseline and `allow` grants; once denied, a permission cannot be granted regardless of device scope or role baseline.
**Why:** Tested with `check-permissions.js:67` ("device-scoped ALLOW does NOT carve out org-wide DENY"). An intuitive specificity rule (device grant overrules org grant) fails this test immediately. The contract dictates that refusal outranks permission unconditionally (D1).
**What I rejected:** Hierarchical scope-based resolution (e.g. device allow overrides org deny). This creates security loopholes where an operator explicitly denied access org-wide could regain access through a forgotten device-scoped grant.
**What would change my mind:** If the specification introduced explicit exception/carve-out semantics with audit justifications.

---

### Suspension bypasses freshness check to preserve 403 'suspended'
**What I chose:** In `server/context.js`, execute `assertFresh(claims, membership)` only when `membership.status !== 'suspended'`.
**Why:** `AUTH-DATA-MODEL.md §1` dictates that suspending a membership increments `perm_version`. `AUTH-DATA-MODEL.md §10` dictates that an active access token belonging to a suspended membership must return 403 with `reason: 'suspended'`. If `assertFresh` is executed blindly, it throws 401 `TOKEN_STALE` before reaching `resolve()`, transforming an authorization refusal into an authentication refresh cycle.
**What I rejected:** Not incrementing `perm_version` on suspension. That would leave the old token considered valid upon future unsuspension without re-minting.
**What would change my mind:** If client SDKs handled `TOKEN_STALE` by refreshing and the refresh endpoint returned `403 suspended` instead.

---

### Re-inviting removed member updates existing membership row
**What I chose:** In `server/routes/invites.js`, when issuing an invite for an existing user, check if a membership row for `(org_id, user_id)` exists. If present, update `status = 'invited', role = ?, invited_by = ?`; otherwise insert a new row.
**Why:** The schema enforces `UNIQUE(org_id, user_id)`. Removed members are soft-marked with `status = 'removed'` rather than hard-deleted. Calling `INSERT` unconditionally throws `SQLITE_CONSTRAINT: UNIQUE constraint failed: memberships.org_id, memberships.user_id`. Updating the existing record preserves historical row IDs while resetting the membership lifecycle.
**What I rejected:** Deleting the removed member record before inserting. That destroys historical references in audit logs and session history.
**What would change my mind:** If the schema used a partial unique index `WHERE status != 'removed'`, permitting multiple historical rows.

---

### Privilege laundering check bound to target grant scope (A3 / D9)
**What I chose:** In `assertMayGrant(db, ctx, wanted, deviceId)`, resolve the caller's own permissions using the exact `deviceId` specified by the grant (`null` for org-wide grants, or the target device ID for device-scoped grants).
**Why:** D9 states you cannot grant authority you do not hold at that scope. If `deviceId` were ignored (or defaulted to `null` for device-scoped grants), an administrator holding a device-scoped allow could grant an org-wide permission, or vice versa.
**What I rejected:** Resolving only at the org level (`deviceId = null`) for all grants. That would allow cross-scope authority elevation.
**What would change my mind:** If the security model allowed delegation above the granter's current effective scope with external approval workflows.

---

### Exclusivity concurrency enforced by database partial unique index (B5)
**What I chose:** Rely directly on SQLite index `one_exclusive_session_per_device` to enforce that only one active `control` or `terminal` session can exist per device. Catch `SQLITE_CONSTRAINT` and throw 409 `DEVICE_BUSY`.
**Why:** Application-level `SELECT ... WHERE state='active'` followed by `INSERT` has an inherent check-then-act race window under parallel concurrent requests. A unique index guarantees atomic enforcement at the storage engine level.
**What I rejected:** In-memory mutexes or locks in Node.js. They fail across multi-process clusters or restarts.
**What would change my mind:** If SQLite did not support partial unique indexes.

---

### Auditing denials only for state mutations, not queries
**What I chose:** In `server/audit.js`, `auditDenials()` catches `FORBIDDEN` errors on mutating endpoints (`POST`, `PATCH`, `DELETE`). Denied `GET` requests are not recorded.
**Why:** Invariant 10 requires recording denied attempts to alter state or access protected controls. Logging every denied read floods the audit table with noise when UI components probe access permissions, obscuring genuine security-relevant incidents.
**What I rejected:** Auditing every 403 response indiscriminately across all HTTP verbs.
**What would change my mind:** If compliance standards (e.g. FedRAMP High) explicitly mandated logging every unauthorized query read attempt.

---

## Where this repo argues with itself

_(To be populated across implementation phases as contradictions are encountered and defended.)_

## Deliberately not built

_(To be populated with documented scope decisions.)_
