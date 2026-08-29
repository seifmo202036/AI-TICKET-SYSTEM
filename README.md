# AI Ticket System

A full-stack customer support desk built as a portfolio project. It gives customers a clear place to ask for help, agents a focused workspace to resolve requests, and administrators control over agent access. Optional AI triage classifies new tickets in the background so the queue is easier to work through.

## What it demonstrates

- React and TypeScript frontend with role-based customer, agent, and admin views
- Express API with secure cookie-based authentication and PostgreSQL persistence
- Ticket conversations, image attachments through S3-compatible storage, and ticket history
- Redis and BullMQ for reliable background AI triage
- Groq's OpenAI-compatible Responses API with structured, validated triage results
- Automated backend, frontend, end-to-end, and Docker build checks in GitHub Actions

## Stack

React, Vite, TypeScript, Express, PostgreSQL, Redis, BullMQ, Groq, Docker, and GitHub Actions.

## Run with Docker

Docker Desktop is the only prerequisite for the complete local stack.

1. Create your local environment file.

   ```powershell
   Copy-Item .env.example .env
   ```

   On macOS or Linux, use `cp .env.example .env`.

2. Open `.env` and replace `JWT_SECRET` with a unique value of at least 32 characters. Image uploads need S3-compatible credentials; the rest of the product runs without them.

3. Start the application.

   ```bash
   docker compose up --build
   ```

4. Visit [http://localhost:8080](http://localhost:8080). Database migrations run before the API starts.

The stack starts the React frontend, API, PostgreSQL, Redis, and the AI worker. The worker exits cleanly when AI credentials are not configured. The API is reached through the frontend proxy, so the browser uses one origin and authentication cookies work locally.

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
docker compose up --build
```

The BullMQ worker then processes new tickets. They move from triaging to the agent queue after the worker has stored the category, score, and urgency.

### Stop or reset local data

```bash
docker compose down
```

To also delete the local PostgreSQL and Redis volumes, run `docker compose down -v`. That permanently removes local Docker data for this project.

## Run without Docker

Install Node.js 22+, PostgreSQL, and Redis, then configure `.env` with their local connection strings.

```bash
npm ci
npm --prefix web ci
npm run migrate
npm run dev
npm --prefix web run dev
```

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
