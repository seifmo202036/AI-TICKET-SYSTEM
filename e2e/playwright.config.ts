import { fileURLToPath } from 'node:url';

import { defineConfig } from '@playwright/test';

const E2E_PORT = process.env.E2E_PORT ?? '3100';
const E2E_BASE_URL = `http://127.0.0.1:${E2E_PORT}`;

// The webServer must run from the repository root so that
// src/server.ts resolves and dotenv finds the .env file
const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30_000,
  reporter: 'list',

  use: {
    // Paths in the specs carry the API_PREFIX themselves
    baseURL: E2E_BASE_URL,
  },

  webServer: {
    command: 'node --import tsx src/server.ts',
    cwd: REPO_ROOT,
    // Waiting for the port avoids depending on any HTTP status code
    port: Number(E2E_PORT),
    reuseExistingServer: !process.env.CI,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      PORT: E2E_PORT,
    },
  },
});
