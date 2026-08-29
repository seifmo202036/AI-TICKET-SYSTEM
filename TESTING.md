# Testing Guide

This project uses three complementary test layers. Unit tests prove isolated
logic; the smoke and e2e suites exercise the real Express API and PostgreSQL.

| Layer | Command | Scope |
| --- | --- | --- |
| Unit | `npm test` | Vitest tests for services, validation, middleware, and workers |
| Auth smoke | `npm run test:auth` | Real API, PostgreSQL, authentication cookies, and session rotation |
| API e2e | `npm run test:e2e` | Real API and PostgreSQL through Playwright's HTTP request fixture |
| Frontend checks | `npm --prefix web run lint` / `npm --prefix web run build` | React type-aware build and linting |

GitHub Actions runs each command against a throwaway PostgreSQL 16 service,
after applying migrations. The Docker job additionally builds both images and
validates the Compose configuration.

## Prerequisites for API tests

- Node.js 22+ and root dependencies installed with `npm ci`.
- A PostgreSQL database configured in `.env`; migrations must be applied with
  `npm run migrate`.
- A JWT secret of at least 32 characters in `.env`.
- Port `3100` available, unless `E2E_PORT` is set.

The e2e runner starts its own API with `NODE_ENV=test` and fails if that port is
already occupied, so it cannot silently test an arbitrary developer server.
`NODE_ENV=test` disables request rate limits, request logging, and the
auto-close cron job so the suite stays deterministic.

## Test data and cleanup

Most e2e specs insert uniquely named users directly into PostgreSQL. This is
intentional: there is no admin signup endpoint, and direct SQL makes it
possible to set states that a public API should reject. Each spec records the
ids it created and deletes only those rows in a foreign-key-safe order.

The three local demo accounts in the root README are the deliberate exception:
`e2e/demo-seed.e2e.spec.ts` runs the guarded local seed twice, reconciles those
reserved accounts to their documented state and password, and leaves them in
place for local use. All other e2e test data is unique and cleaned up.

## Ticket lifecycle coverage

CI deliberately runs with AI disabled. The API e2e suite therefore verifies
that a customer-created ticket is immediately `open` with `ai_status: disabled`
and appears in the agent queue. It then covers claim ownership and races,
resolve permissions, customer confirmation/close rules, ticket messages and
attachments validation, and the persisted history:

```text
open → assigned → resolved → closed
```

Dedicated unit tests cover the AI worker’s successful, retry, and final-failure
paths. The live provider is not called by CI.

## Browser workflow

The recruiter-facing browser workflow is recorded through the real UI with
Playwright rather than mocked API calls. See `npm run record:demo` and the
portfolio walkthrough in the root README. On a clean machine, install the
browser once with:

```bash
npx playwright install chromium
```

The recording command is a release/demo check, not the fast API e2e suite. It
uses its own isolated frontend/API ports, a temporary agent identity, and
refuses to overwrite a prior video unless explicitly instructed.
