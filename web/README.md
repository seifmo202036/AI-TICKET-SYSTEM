# Frontend

The React/Vite client for the AI Ticket System. It provides separate customer,
agent, and administrator workspaces while keeping browser requests same-origin
through Vite in development and nginx in Docker.

## Local development

From the repository root, start the API with `npm run dev`. In this directory,
run:

```bash
npm ci
npm run dev
```

The Vite development proxy targets `http://localhost:3000` by default. Set
`VITE_API_PROXY_TARGET` only when the API deliberately runs elsewhere, such as
the isolated Playwright portfolio recorder.

## Quality checks

```bash
npm run lint
npm run build
```

The root README documents the full stack, environment configuration, and the
recorded end-to-end portfolio workflow.
