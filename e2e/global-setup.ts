import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import type { FullConfig } from '@playwright/test';

const STARTUP_TIMEOUT_MS = 30_000;
const SHUTDOWN_TIMEOUT_MS = 5_000;
const POLL_INTERVAL_MS = 100;
const REQUEST_TIMEOUT_MS = 1_000;
const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

function waitForExit(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    child.once('exit', () => resolve());
  });
}

async function isServerAvailable(url: string): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, { signal: controller.signal });
    await response.body?.cancel();
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function stopServer(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  const exitPromise = waitForExit(child);
  child.kill('SIGTERM');

  let shutdownTimer: ReturnType<typeof setTimeout> | undefined;
  const shutdownTimeout = new Promise<false>((resolve) => {
    shutdownTimer = setTimeout(() => resolve(false), SHUTDOWN_TIMEOUT_MS);
  });
  const exitedGracefully = await Promise.race([
    exitPromise.then(() => true),
    shutdownTimeout,
  ]);
  clearTimeout(shutdownTimer);

  if (!exitedGracefully) {
    child.kill('SIGKILL');
    await exitPromise;
  }
}

async function waitForServer(child: ChildProcess, url: string): Promise<void> {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;

  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(
        `E2E API server exited before it became ready (exitCode=${child.exitCode}, signal=${child.signalCode})`,
      );
    }

    if (await isServerAvailable(url)) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  throw new Error(`Timed out waiting for the E2E API server at ${url}`);
}

export default async function globalSetup(
  config: FullConfig,
): Promise<() => Promise<void>> {
  const baseURL = config.projects[0]?.use.baseURL;
  if (typeof baseURL !== 'string') {
    throw new Error('The E2E Playwright baseURL must be configured');
  }

  if (await isServerAvailable(baseURL)) {
    throw new Error(
      `${baseURL} is already in use; stop the existing API before running deterministic E2E tests.`,
    );
  }

  const port = new URL(baseURL).port;
  const child = spawn(process.execPath, ['--import', 'tsx', 'src/server.ts'], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      PORT: port,
      // API e2e assertions cover the deterministic no-AI path. Explicitly
      // override a developer's .env so credentials cannot leak into this run.
      AI_PROVIDER: '',
      AI_API_KEY: '',
      AI_MODEL: '',
    },
    stdio: ['ignore', 'inherit', 'inherit'],
  });

  try {
    await waitForServer(child, baseURL);
  } catch (error) {
    await stopServer(child);
    throw error;
  }

  return () => stopServer(child);
}
