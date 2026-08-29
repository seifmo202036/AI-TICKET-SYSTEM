import { defineConfig } from '@playwright/test';

const E2E_PORT = process.env.E2E_PORT ?? '3100';
const E2E_BASE_URL = `http://127.0.0.1:${E2E_PORT}`;

export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.ts',
  globalSetup: './global-setup.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30_000,
  reporter: 'list',

  use: {
    // Paths in the specs carry the API_PREFIX themselves
    baseURL: E2E_BASE_URL,
  },
});
