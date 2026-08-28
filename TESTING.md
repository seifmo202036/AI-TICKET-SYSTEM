# Testing Guide

This document explains **everything** about how testing works in this project:
the three test layers, what a smoke test is, how test data is seeded, and a
file-by-file walkthrough of the e2e suite.

---

## 1. The three test layers

| Layer | Tool | Location | Runs against | Speed |
|---|---|---|---|---|
| **Unit tests** | vitest | `src/**/*.test.ts` | Pure functions with mocked repositories/DB | milliseconds |
| **Smoke test** | Node script (`node:assert` + `fetch`) | `scripts/auth-smoke-test.mjs` | Real server + real Postgres | seconds |
| **E2E tests** | Playwright (API-only) | `e2e/` | Real server + real Postgres | seconds |

All three hit the same rule: **unit tests prove the logic, smoke/e2e prove the
wiring** (HTTP routes, middleware, cookies, SQL, transactions).

### How to run them

```bash
npm test              # unit tests (vitest)
npm run test:auth     # auth smoke test
npm run test:e2e      # Playwright e2e suite
npm run typecheck:e2e # typecheck the e2e folder only
```

CI (`.github/workflows/ci.yml`) runs them in that order after lint/typecheck/build,
against a throwaway Postgres 16 service container, with migrations applied first.

---

## 2. What is a smoke test?

A *smoke test* answers one question: **"does the app basically work when all the
pieces are connected?"** It is not exhaustive — it walks the critical paths once
and fails loudly if any of them break.

`scripts/auth-smoke-test.mjs` does this without any test framework:

1. **Boots the real server** as a child process (`tsx src/server.ts`) on a random
   free port with `NODE_ENV=test` (rate limiters and logging disabled).
2. **Seeds users straight into Postgres** with SQL (see section 4).
3. **Calls the live API with plain `fetch`**, manually attaching cookie headers.
4. **Asserts** with `node:assert/strict`: status codes, error codes
   (`INVALID_CREDENTIALS`, `REFRESH_TOKEN_REVOKED`, …), cookie flags
   (`HttpOnly`, `SameSite=Lax`, correct `Path`), and even inspects the database
   afterwards (session revoked? refresh token rotated? replaced-by id correct?).
5. **Cleans up** every user it created in a `finally` block.

Scenarios covered: valid login, wrong password, pending/suspended rejection,
concurrent-signup uniqueness race, `/me` authentication, expired/tampered tokens,
refresh rotation + reuse detection, concurrent refresh protection, admin
suspend/reinstate revoking live sessions, idempotent logout.

The e2e suite (next section) is the same idea modernised: Playwright gives us
better reporting, fixtures, config, and a managed server lifecycle.

---

## 3. What are seeding and seeded data?

**Seeding** = inserting known records into the database *before* a test runs so
the test has a controlled starting point.

We do **not** create these records through the API on purpose:

- There is **no admin signup endpoint** (by design — admins are created out of
  band). So an admin can only exist if we insert one directly.
- Direct SQL is faster and lets us set states the API would refuse, like
  `account_status = 'suspended'` or a ticket stuck in `status = 'open'`.

### What gets seeded

Rows in the `users` table — always with a **unique suffix per run**
(`Date.now()` + random chars, e.g. `agent_mt95zmu4ui`) so parallel or repeated
runs never collide with each other or with real dev data:

| Label example | role | account_status | Why |
|---|---|---|---|
| `customer_…` | customer | active | owns tickets |
| `agent_…` | agent | active | claims/resolves tickets |
| `pending_…` | agent | **pending** | tests the approval flow |
| `admin_…` | admin | active | exists *only* because of direct SQL |
| `suspended…` | customer | suspended | tests blocked login |

Passwords are a shared constant (`TestPassword123!`) hashed with bcrypt exactly
like production code does, so logins through the API work normally.

### Cleanup order matters (foreign keys)

```
ticket_status_history  ← deleted first (or cascades from tickets)
tickets                ← deleted second (customer_id FK is ON DELETE RESTRICT,
                          so users with tickets could not be deleted otherwise)
auth_sessions          ← cascade automatically when their user is deleted
users                  ← deleted last
```

Every spec cleans up **its own rows only**, matched by the ids it recorded while
seeding — your development data is never touched.

---

## 4. E2E suite — how a run works, step by step

```
npm run test:e2e
      │
      ▼
playwright test -c e2e/playwright.config.ts
      │
      ├─ 1. reads config, spawns ONE worker (serial execution)
      ├─ 2. starts the real backend as a child process:
      │       node --import tsx src/server.ts
      │       cwd = repo root (so dotenv finds .env)
      │       env: NODE_ENV=test, PORT=3100
      ├─ 3. waits until TCP port 3100 accepts connections
      ├─ 4. runs spec files alphabetically: auth → tickets → users
      │       each spec: beforeAll seeds → tests call the API → afterAll cleans up
      └─ 5. shuts the server down and reports
```

Key detail: `NODE_ENV=test` makes the backend disable morgan logging, rate
limiters, and the auto-close cron job — tests stay deterministic.

These are **API-level e2e tests**: they use Playwright's `request` fixture
(HTTP client), not a browser. No browser download is needed, which keeps the
suite fast and CI light. The UI itself lives in the local-only `web/` folder and
is exercised manually (see `web/README` notes in that folder).

---

## 5. File-by-file reference (`e2e/`)

### `playwright.config.ts`

| Option | Value | Why |
|---|---|---|
| `testDir` / `testMatch` | `.` / `*.spec.ts` | specs live next to the config |
| `workers: 1`, `fullyParallel: false` | serial | specs share one database; unique suffixes make rows independent, ordering keeps logs readable |
| `timeout: 30_000` | per-test ceiling | generous for cold requests |
| `use.baseURL` | `http://127.0.0.1:3100` | specs then write short paths |
| `webServer.command` | `node --import tsx src/server.ts` | boots TypeScript directly, no build needed |
| `webServer.cwd` | repo root (computed from `import.meta.url`) | the command must run where `.env` and `src/` live |
| `webServer.port` | `3100` | waits for TCP readiness — avoids depending on any HTTP status code (the app has no health route yet) |
| `reuseExistingServer` | `!process.env.CI` | locally reuses a server you started; in CI (`CI=true`) always boots a fresh one |
| `webServer.env` | `{ NODE_ENV: 'test', PORT: '3100', …process.env }` | deterministic backend behaviour |

### `helpers/db.helper.ts` — the seeding engine

- **Connection**: creates a `pg.Pool` from `.env`'s `DATABASE_URL`. All spec
  files run inside one worker process, and the first spec's cleanup ends the
  pool — so `getDatabasePool()` recreates it lazily if it was ended.
- **`uniqueName` / `uniqueEmail`** — timestamp+random suffix per run.
- **`seedUser(label, role, accountStatus)`** — INSERT with bcrypt hash, returns
  `{ id, userName, email }`.
- **`createTicketRow(customerId, overrides)`** — inserts a ticket with any
  status/assignment directly, skipping validation on purpose.
- **`setTicketStatus(ticketId, status)`** — flips a ticket's status via SQL.
  This is the documented stand-in for the future AI worker that moves tickets
  from `triaging` to `open`.
- **`getTicketStatusHistory(ticketId)`** — reads the audit trail ordered by time,
  mapped to camelCase, so specs can assert exact transitions
  (`open→assigned→resolved→closed`) and who performed each change (`changed_by`).
- **`cleanupE2eData(userIds, ticketIds)`** — deletes in FK-safe order (history →
  tickets → users), then ends the pool.

### `helpers/api.helper.ts` — the HTTP side

- **`API_PREFIX = '/api/v1'`** — Playwright resolves request paths against the
  *origin* of `baseURL` (standard URL rules), so a `baseURL` containing a path
  silently disappears. Every route string therefore carries the prefix via this
  exported constant.
- **`login(request, email, password?)`** — POSTs `/auth/login`, captures the
  `Set-Cookie` headers, extracts the raw `accessToken=…` / `refreshToken=…`
  pairs, and returns them **plus the untouched header lines** (needed to assert
  `HttpOnly` etc., which disappear once you reduce a cookie to name=value).
- **`signup(request, payload)`** — thin POST wrapper.
- **`expectApiError(response, status, code)`** — asserts the standard error
  envelope produced by `error.middleware.ts`
  (`{ message, code }`).

### `auth.e2e.spec.ts`

Signup semantics (customer → `active` immediately, agent → `pending`),
duplicate-email conflict, zod rejection (`400 VALIDATION_ERROR`), pending-agent
login block (`403 ACCOUNT_PENDING` — and notably **no cookies are issued**),
wrong-password generic `401`, HttpOnly/SameSite cookie flags, safe user object
(no `password_hash`, no tokens in body), `/me` happy + missing-token + tampered-
token cases, refresh rotation (new refresh token differs, old one single-use →
`REFRESH_TOKEN_REVOKED`), logout clearing cookies and revoking the session.

### `users.e2e.spec.ts`

Role guards (non-admin → `403 FORBIDDEN`), listing pending agents, approving a
pending agent (then he can actually sign in), approve conflicts
(`409 NOT_AN_AGENT`, `409 AGENT_NOT_PENDING`), invalid/unknown user id params
(`400 INVALID_USER_ID` / `404 USER_NOT_FOUND`), suspend blocking login *and*
live sessions immediately, reinstate restoring access.

### `tickets.e2e.spec.ts`

The full ticket lifecycle journey, in order:

1. Customer creates a ticket → `201`, status `triaging`.
2. Agent queue is **empty** while triaging (by design — AI worker opens it later).
3. SQL flip to `open` → queue now shows the ticket.
4. Claim: customer forbidden (`403`), invalid param (`400 INVALID_TICKET_ID`),
   first agent succeeds (`assigned`, `assigned_agent_id` set), second agent gets
   `409 TICKET_NOT_CLAIMABLE` (the transactional race guard).
5. `/tickets/assigned` lists it only for the owning agent.
6. Resolve: non-assigned agent `403`, assigned agent `200` (+`resolved_at`),
   double-resolve `409 TICKET_NOT_RESOLVABLE`.
7. Close: closing before resolution `409 TICKET_NOT_CLOSABLE`, non-owner
   customer `403`, owner closes after confirmation (`closed_at` set), double
   close `409`.
8. **Audit trail assertion** — the status history rows read back from SQL as
   exactly `[open→assigned, assigned→resolved, resolved→closed]` with the right
   `changed_by` ids.
9. Unauthenticated access rejected on every ticket route.

---

## 6. Environment requirements

- Postgres reachable at `DATABASE_URL` (from `.env`) with migrations applied
  (`npm run migrate`). The suite shares your development database but never
  modifies rows it did not create.
- `JWT_SECRET` set — the spawned server validates env on boot.
- No browsers required (API-only Playwright).
- Port 3100 free (override with `E2E_PORT`).

## 7. Gotchas worth remembering

- **Response shapes differ by module**: admin endpoints wrap payloads
  (`{ data: { agents } }` / `{ data: { user } }`), ticket endpoints return bare
  objects (`{ tickets }`, `{ message, ticket }`). Both the UI and these tests
  encode that difference — keep it in mind when adding endpoints.
- **Cookies, not headers**: auth is HttpOnly cookie-based, so every helper
  attaches captured `Cookie` headers instead of `Authorization`.
- **`NODE_ENV=test` changes behaviour** (rate limits off, cron off). If you debug
  against a dev-mode server, results can differ.
- **Cleanup is per-spec and idempotent** — if a run crashes mid-way you may need
  to delete leftover `*_suffix` rows manually (every seeded row carries the run
  suffix in its username/email, making them easy to spot).
