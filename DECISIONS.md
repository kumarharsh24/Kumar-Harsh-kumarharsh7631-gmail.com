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

## Where this repo argues with itself

_(To be populated across implementation phases as contradictions are encountered and defended.)_

## Deliberately not built

_(To be populated with documented scope decisions.)_
