# RemoteOps — Multi-Org Permission Console

**Candidate Submission**  
- **Candidate:** Kumar Harsh ([kumarharsh7631@gmail.com](mailto:kumarharsh7631@gmail.com))
- **Repository:** [https://github.com/kumarharsh24/Kumar-Harsh-kumarharsh7631-gmail.com](https://github.com/kumarharsh24/Kumar-Harsh-kumarharsh7631-gmail.com)
- **Primary Deliverables:** Complete permission & session engine, REST backend, presence-driven React console, [BUILD-LOG.md](BUILD-LOG.md), and [DECISIONS.md](DECISIONS.md).

---

## Quick Start (Clean Checkout)

The application runs as a unified single-process architecture on port 8080: `node:http` mounts the `/v1/*` REST API and hosts Vite in middleware mode for the React SPA. No external database or reverse proxy is required.

```bash
# 1. Install dependencies
npm install

# 2. Reset database (loads SQLite schema, reference data, and demo fixture)
npm run db:reset

# 3. Start development server (supports live server reload and Vite HMR)
npm run dev
```

Open [http://localhost:8080](http://localhost:8080) in your browser.

### Production Mode

```bash
npm run build     # compiles Vite bundle to dist/
npm start         # runs production server on http://localhost:8080
```

> **Note on Directory Execution:** You can run these commands from the repository root or from the `starter/` directory:
> ```bash
> cd starter && npm install && npm run db:reset && npm run dev
> ```

---

## Test Suites & Verification

All 187 assertions across the 5 test suites pass:

```bash
# Run all checks sequentially
npm run check:all
```

Or run individual verification suites:

| Suite | Command | Assertions | Focus Area |
| :--- | :--- | :---: | :--- |
| **JWT Verification** | `npm run check:jwt` | 43 / 43 | HS256 algorithm pinning, constant-time `timingSafeEqual`, defensive JSON/base64url header parsing, half-open expiry |
| **Permissions Engine** | `npm run check:permissions` | 35 / 35 | Dynamic SQLite catalogue loading, unconditional deny precedence, device & org resolution, session compound checks |
| **API Endpoints** | `npm run check:api` | 66 / 66 | Authentication, rotating refresh tokens, re-invites, leases, session concurrency & exclusivity, audit log |
| **Personalisation Suite** | `npm run personalisation` | 18 / 18 | Nonce-generated candidate fixture resolution (`reviewer` / `device:reboot` in `Ironside Labs`) |
| **Playwright UI Suite** | `npm test` | 25 / 25 | DOM presence semantics (`data-state="unlocked"` / absent), zero token persistence, cross-tab org isolation |

---

## System Architecture

```
rhinoassignment/
├── db/
│   ├── schema.sql           # SQLite STRICT schema with partial unique indexes and triggers
│   └── reference.sql        # Roles, permissions, and role baseline allowances
├── server/
│   ├── auth.js              # Token issuance & verifyAccessToken with algorithm pinning & defensive header parsing
│   ├── context.js           # Caller context extraction & structural multi-tenancy isolation (404 foreign orgs)
│   ├── permissions.js       # Dynamic runtime resolution engine (catalogue loader, deny precedence, device batches)
│   ├── lifecycle.js         # Role rank comparisons (roles.rank), assertNotLastOwner, session snapshot & termination
│   ├── audit.js             # Append-only audit logger & mutation denial recorder
│   ├── router.js            # Minimal regex-based HTTP routing pipeline
│   ├── http.js              # Request/response helpers, JSON body parser, and error hierarchy
│   ├── db.js                # SQLite connection with PRAGMA foreign_keys = ON & WAL mode
│   └── routes/              # Auth, Orgs, Invites, Devices, Grants, Sessions, and Audit endpoints
├── web/
│   ├── index.html           # SPA entry point with SEO metadata
│   ├── src/
│   │   ├── App.jsx          # Shell with active org switcher, session monitor, and card view
│   │   ├── api.js           # In-memory token management, 401 refresh interception, and authenticated fetch
│   │   ├── styles.css       # Unified design system tokens, responsive grid, and presence styles
│   │   └── components/      # Action (presence-only), Login, Devices, Grants, People, Sessions, Audit, Admin
└── tests/
    └── ui.spec.js           # 25-case Playwright suite validating DOM presence and state isolation
```

---

## Core Security & Domain Invariants

1. **Dynamic Database Catalogue (No Hardcoding):**
   - The permissions engine loads roles and permissions dynamically from `roles`, `permissions`, and `role_permissions` at runtime.
   - Any undocumented role or permission injected by personalisation nonces (e.g., `reviewer` / `device:reboot`) resolves without code modification.
2. **Unconditional Deny Precedence:**
   - Any explicit `deny` grant—whether org-wide or device-scoped—vetoes all baselines and allow grants. A device-scoped allow cannot carve out an org-wide deny.
3. **Strict Structural Multi-Tenancy:**
   - Requesting an org the caller does not belong to returns `404 Not Found` (never `403`), preventing org enumeration or foreign data leakage.
4. **Suspension Freshness Exemption:**
   - Suspended memberships immediately return `403 Forbidden` (`suspended`) without failing token freshness checks, honoring instant suspension semantics.
5. **Atomic Session Exclusivity:**
   - Exclusive sessions on devices are enforced atomically via SQLite partial unique index (`one_exclusive_session_per_device`), preventing race conditions.
6. **Presence-Only UI Semantics:**
   - Disallowed controls are completely omitted from the DOM, never rendered as disabled or hidden elements (`[disabled]`, `display: none`, `visibility: hidden`). Allowed controls are marked with `data-state="unlocked"`.
7. **Ephemeral In-Memory Tokens:**
   - Access tokens are stored exclusively in module memory—never in `localStorage`, `sessionStorage`, or IndexedDB. Sessions survive page reload via HTTP-only rotating refresh cookies.

---

## Evaluation & Walkthrough Reference

For the live technical interview and code defense, please consult:
- **[BUILD-LOG.md](BUILD-LOG.md)**: Phase-by-phase development narrative recorded concurrently with commits. Details unexpected test failures, corrected mental models, and step-by-step verification.
- **[DECISIONS.md](DECISIONS.md)**: Architectural decisions across authentication, permissions resolution, concurrency, and UI presence semantics. Each decision documents the chosen approach, rationale, rejected alternatives with failure modes, and falsification conditions.
