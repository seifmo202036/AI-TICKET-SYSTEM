# AI Ticket System

A full-stack customer support desk built as a portfolio project. It gives customers a clear place to ask for help, agents a focused workspace to resolve requests, and administrators control over agent access. Optional AI triage classifies new tickets in the background so the queue is easier to work through.

## What it demonstrates

- React and TypeScript frontend with role-based customer, agent, and admin views
- Express API with secure cookie-based authentication and PostgreSQL persistence
- Ticket conversations, image attachments through S3-compatible storage, and ticket history
- Redis and BullMQ-backed asynchronous AI triage
- Groq's OpenAI-compatible Responses API with structured, validated triage results
- Automated backend, frontend, end-to-end, and Docker build checks in GitHub Actions

## Stack

React, Vite, TypeScript, Express, PostgreSQL, Redis, BullMQ, Groq, Docker, and GitHub Actions.

## Architecture and data handling

```text
Browser → React/Vite or nginx → Express API → PostgreSQL
                                      └──→ Redis/BullMQ → AI worker → Groq-compatible API (optional)
```

The API owns authentication, authorization, ticket state transitions, and the audit history. The worker is responsible only for optional triage. When enabled, the worker sends the ticket's selected issue type and initial description to the configured third-party AI provider to receive a category and priority score. It does not send image attachments or later conversation messages. Enable AI only when that data flow is appropriate for the deployment.

AI is deliberately optional: with no AI configuration, new tickets are created as `open` with an `AI disabled` state. If queueing fails, they fail open as `open`/`failed` so an agent can still help. A live AI deployment requires both Redis and a healthy worker process; monitor worker availability and the age of queued tickets as an operational concern.

## Portfolio walkthrough

[Watch the 1080p portfolio walkthrough](recordings/ai-ticket-system-portfolio-demo.mp4) or download the [original Playwright WebM recording](recordings/ai-ticket-system-portfolio-demo.webm).

The recording uses the real browser interface and follows one complete support workflow:

1. A prospective agent creates an account and is held for administrator approval.
2. An administrator approves the agent and confirms the account is active.
3. A customer opens a payment-support ticket.
4. The approved agent claims the ticket, replies, and marks it resolved.
5. The customer reviews the reply and closes the ticket.

This recorded workflow uses the no-AI fallback so it is deterministic and does not send demo content to a third-party provider. Tickets are immediately available to agents with an `open` status and an `AI disabled` state.

### Re-record the walkthrough

The recording is generated with Playwright and does not rely on OBS or direct API calls for the application workflow. It starts a temporary, isolated local frontend and API by default, creates its own temporary portfolio agent, and cleans up only the processes it started. It needs PostgreSQL configured through `.env`; Redis is needed only when recording the live AI path.

After installing project dependencies, install Playwright's Chromium browser once on a clean machine:

```bash
npx playwright install chromium
```

On a new Linux machine, use `npx playwright install --with-deps chromium` when the required browser libraries are not already installed.

```bash
npm run record:demo
```

It writes a 1920×1080 WebM and, when FFmpeg is available, an MP4 to `recordings/`. The bundled FFmpeg dependency supports the usual Windows, macOS, and Linux architectures; set `FFMPEG_PATH` to use another binary. The command refuses to overwrite an existing recording. When replacement is allowed, it keeps the previous final files until the new recording and MP4 export both succeed. To deliberately replace the recording, use one of these commands:

```powershell
$env:DEMO_OVERWRITE = 'true'; npm run record:demo
```

```bash
DEMO_OVERWRITE=true npm run record:demo
```

Set `DEMO_DISABLE_AI=true` to record the no-AI fallback shown above, or configure the AI variables below to include live triage results. The full list of recording options is documented at the top of [`scripts/record-portfolio-demo.mjs`](scripts/record-portfolio-demo.mjs).

## Run with Docker

Docker Desktop is the only prerequisite for the complete local stack.

1. Create your local environment file.

   ```powershell
   Copy-Item .env.example .env
   ```

   On macOS or Linux, use `cp .env.example .env`.

2. Open `.env` and replace `JWT_SECRET` with a unique value of at least 32 characters. Image uploads are disabled until S3-compatible storage is configured; the rest of the product runs without them.

3. Start the application.

   ```bash
   docker compose -f docker-compose.yml -f docker-compose.local.yml up --build
   ```

4. Visit [http://localhost:8080](http://localhost:8080). Database migrations and local demo-account seeding run before the API starts.

The stack starts the React frontend, API, PostgreSQL, Redis, and the AI worker. The worker exits cleanly when AI credentials are not configured. The API is reached through the frontend proxy, so the browser uses one origin and authentication cookies work locally.

### Local demo accounts

The explicitly selected local Compose file and `npm run dev` both create or restore these usable demo accounts. The passwords are intentionally public and local-only, so never use `docker-compose.local.yml` in a deployed environment.

| Role | Email | Password |
| --- | --- | --- |
| Administrator | `admin@demo.local` | `DemoPassword123!` |
| Agent | `agent@demo.local` | `DemoPassword123!` |
| Customer | `customer@demo.local` | `DemoPassword123!` |

The agent account is active so it can sign in immediately. Re-running local startup keeps one account per demo email and restores their known role, active status, and password.

### Enable AI triage

Add your Groq settings to `.env`:

```env
AI_PROVIDER=openai
AI_API_KEY=your_groq_api_key
AI_BASE_URL=https://api.groq.com/openai/v1
AI_MODEL=openai/gpt-oss-20b
```

Restart the stack after saving the file:

```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml up --build
```

The BullMQ worker then processes new tickets. They move from triaging to the agent queue after the worker has stored the category, score, and urgency.

Keep both Redis and the `worker` service running for this path. In production, alert on worker restarts and the oldest queued ticket so a failed worker cannot silently delay agent visibility.

### Stop or reset local data

```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml down
```

To also delete the local PostgreSQL and Redis volumes, run `docker compose -f docker-compose.yml -f docker-compose.local.yml down -v`. That permanently removes local Docker data for this project.

## Run without Docker

Install Node.js 22+, PostgreSQL, and Redis, then configure `.env` with their local connection strings.

```bash
npm ci
npm --prefix web ci
npm run dev
npm --prefix web run dev
```

`npm run dev` first runs migrations and the guarded local demo seed. To apply the same setup without starting the API watcher, run `npm run setup:local`.

With AI triage enabled, start the worker in another terminal:

```bash
npm run dev:worker
```

## Verification

```bash
npm test
npm run typecheck
npm run lint
npm run test:e2e
npm --prefix web run lint
npm --prefix web run build
```

GitHub Actions runs these backend, frontend, and end-to-end checks, then builds both Docker images and validates the Compose configuration on every pull request and push to `main`.
