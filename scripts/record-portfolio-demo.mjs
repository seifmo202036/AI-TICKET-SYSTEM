/**
 * Records the portfolio workflow through the real browser UI with Playwright.
 *
 * Required services: PostgreSQL and, when AI is enabled, Redis. If the
 * frontend/API are not supplied explicitly, the script starts an isolated
 * local pair and stops only those processes after the recording. No API calls
 * are made directly: every business action below is performed through the
 * application interface.
 *
 * Environment variables:
 *   DEMO_BASE_URL              Explicit URL of an already-running application.
 *   DEMO_OUTPUT_DIR            Directory for the MP4 and original WebM.
 *   DEMO_OVERWRITE=true        Allow replacing an existing output pair.
 *   DEMO_PAUSE_MS              Presentation pause between major moments.
 *   DEMO_START_LOCAL=false     Require DEMO_BASE_URL instead of starting locally.
 *   DEMO_FORCE_LOCAL=true      Ignore DEMO_BASE_URL and start a local pair.
 *   DEMO_LOCAL_PORT            Temporary frontend port (default: 5180).
 *   DEMO_API_PORT              Temporary API port (default: 5300).
 *   DEMO_DISABLE_AI=true       Start the temporary API without AI triage.
 *   DEMO_ACCOUNT_PASSWORD      Password for the local seeded admin/customer.
 *   DEMO_NEW_AGENT_PASSWORD    Password for the temporary portfolio agent.
 *   FFMPEG_PATH                Optional path to FFmpeg for MP4 export.
 */

import 'dotenv/config';

import { access, mkdir, readFile, rename, rm } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';
import { chromium } from '@playwright/test';

const ROOT = resolve(import.meta.dirname, '..');
const OUTPUT_DIR = resolve(ROOT, process.env.DEMO_OUTPUT_DIR ?? 'recordings');
const VIDEO_STEM = 'ai-ticket-system-portfolio-demo';
const RECORDING_RUN_ID = `${process.pid}-${Date.now()}-${Math.floor(Math.random() * 1_000)}`;
const WEBM_OUTPUT = join(OUTPUT_DIR, `${VIDEO_STEM}.webm`);
const MP4_OUTPUT = join(OUTPUT_DIR, `${VIDEO_STEM}.mp4`);
const STAGED_WEBM_OUTPUT = join(
  OUTPUT_DIR,
  `${VIDEO_STEM}.${RECORDING_RUN_ID}.staged.webm`,
);
const STAGED_MP4_OUTPUT = join(
  OUTPUT_DIR,
  `${VIDEO_STEM}.${RECORDING_RUN_ID}.staged.mp4`,
);
const PRESENTATION_PAUSE_MS = positiveInteger(
  process.env.DEMO_PAUSE_MS,
  10_000,
);
const ACTION_PAUSE_MS = 750;
const AI_READY_TIMEOUT_MS = 60_000;
const LOCAL_DEMO_PASSWORD =
  process.env.DEMO_ACCOUNT_PASSWORD ?? 'DemoPassword123!';
const NEW_AGENT_PASSWORD =
  process.env.DEMO_NEW_AGENT_PASSWORD ?? 'PortfolioAgent123!';

const ADMIN = {
  email: process.env.DEMO_ADMIN_EMAIL ?? 'admin@demo.local',
  password: LOCAL_DEMO_PASSWORD,
};
const CUSTOMER = {
  email: process.env.DEMO_CUSTOMER_EMAIL ?? 'customer@demo.local',
  password: LOCAL_DEMO_PASSWORD,
};

function positiveInteger(value, fallback) {
  if (!value) return fallback;

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error('DEMO_PAUSE_MS must be a positive integer.');
  }

  return parsed;
}

function escapeForRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function pathExists(path) {
  try {
    await access(path, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function assertOutputIsSafe() {
  await mkdir(OUTPUT_DIR, { recursive: true });

  // These run-specific staged files are never published. Cleanup from this
  // process cannot touch a simultaneous recording's artifacts or final video.
  await Promise.all([
    rm(STAGED_WEBM_OUTPUT, { force: true }),
    rm(STAGED_MP4_OUTPUT, { force: true }),
  ]);

  // Do not overwrite a prior recording without the caller opting in. When
  // replacement is allowed, the old files remain untouched until the new
  // recording and MP4 export have both succeeded.
  if (
    process.env.DEMO_OVERWRITE !== 'true' &&
    (await Promise.all([pathExists(WEBM_OUTPUT), pathExists(MP4_OUTPUT)])).some(
      Boolean,
    )
  ) {
    throw new Error(
      `A recording already exists in ${OUTPUT_DIR}. Set DEMO_OVERWRITE=true to replace it.`,
    );
  }
}

async function fetchWithTimeout(url, timeoutMs = 4_000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function isFrontendAvailable(url, timeoutMs = 4_000) {
  try {
    const response = await fetchWithTimeout(url, timeoutMs);
    const html = await response.text();
    return response.ok && html.includes('<div id="root"');
  } catch {
    return false;
  }
}

async function isApiAvailable(baseUrl, timeoutMs = 4_000) {
  try {
    const response = await fetchWithTimeout(
      `${baseUrl}/api/v1/auth/me`,
      timeoutMs,
    );
    return response.status === 200 || response.status === 401;
  } catch {
    return false;
  }
}

async function assertPortIsAvailable(port, label) {
  await new Promise((resolvePromise, reject) => {
    const server = createServer();
    server.once('error', () => {
      reject(
        new Error(
          `${label} port ${port} is already in use. Set its DEMO_*_PORT variable to an unused port.`,
        ),
      );
    });
    server.listen(port, '127.0.0.1', () => {
      server.close((error) => {
        if (error) reject(error);
        else resolvePromise();
      });
    });
  });
}

function startLocalProcess(
  name,
  args,
  environment = process.env,
  workingDirectory = ROOT,
) {
  const child = spawn(process.execPath, args, {
    cwd: workingDirectory,
    env: environment,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  let output = '';

  for (const stream of [child.stdout, child.stderr]) {
    stream?.on('data', (chunk) => {
      output = `${output}${chunk}`.slice(-4_000);
    });
  }

  return {
    name,
    child,
    output: () => output.trim(),
  };
}

async function runLocalSetup(environment) {
  const setup = startLocalProcess(
    'local setup',
    ['scripts/migrate.mjs'],
    environment,
  );

  const exitCode = await new Promise((resolvePromise, reject) => {
    setup.child.once('error', reject);
    setup.child.once('close', resolvePromise);
  });

  if (exitCode !== 0) {
    throw new Error(`Database migration failed. ${setup.output()}`);
  }

  const seed = startLocalProcess(
    'demo account seed',
    ['scripts/seed-demo.mjs', '--local'],
    environment,
  );
  const seedExitCode = await new Promise((resolvePromise, reject) => {
    seed.child.once('error', reject);
    seed.child.once('close', resolvePromise);
  });

  if (seedExitCode !== 0) {
    throw new Error(`Demo account seeding failed. ${seed.output()}`);
  }
}

async function isAiTriageConfigured(environment = process.env) {
  const requiredSettings = ['AI_PROVIDER', 'AI_API_KEY', 'AI_MODEL'];
  if (
    requiredSettings.some(
      (setting) => setting in environment && !environment[setting],
    )
  ) {
    return false;
  }

  if (requiredSettings.every((setting) => Boolean(environment[setting]))) {
    return true;
  }

  try {
    const environment = await readFile(join(ROOT, '.env'), 'utf8');

    return requiredSettings.every((setting) =>
      new RegExp(`^${setting}=\\S+`, 'm').test(environment),
    );
  } catch {
    return false;
  }
}

async function startLocalStack() {
  console.log('Starting a temporary local API and frontend for the recording.');
  const frontendPort = positiveInteger(process.env.DEMO_LOCAL_PORT, 5_180);
  const apiPort = positiveInteger(process.env.DEMO_API_PORT, 5_300);
  const localBaseUrl = `http://127.0.0.1:${frontendPort}`;
  const localApiUrl = `http://127.0.0.1:${apiPort}`;
  await Promise.all([
    assertPortIsAvailable(frontendPort, 'Temporary frontend'),
    assertPortIsAvailable(apiPort, 'Temporary API'),
  ]);

  const localEnvironment = {
    ...process.env,
    PORT: String(apiPort),
    CLIENT_ORIGIN: localBaseUrl,
    VITE_API_PROXY_TARGET: localApiUrl,
  };
  if (process.env.DEMO_DISABLE_AI === 'true') {
    localEnvironment.AI_PROVIDER = '';
    localEnvironment.AI_API_KEY = '';
    localEnvironment.AI_MODEL = '';
  }
  await runLocalSetup(localEnvironment);

  const services = [
    startLocalProcess(
      'API',
      ['--import', 'tsx', 'src/server.ts'],
      localEnvironment,
    ),
    startLocalProcess(
      'frontend',
      [
        'node_modules/vite/bin/vite.js',
        '--host',
        '127.0.0.1',
        '--port',
        String(frontendPort),
        '--strictPort',
      ],
      localEnvironment,
      join(ROOT, 'web'),
    ),
  ];

  if (await isAiTriageConfigured(localEnvironment)) {
    services.push(
      startLocalProcess(
        'AI worker',
        ['--import', 'tsx', 'src/worker.ts'],
        localEnvironment,
      ),
    );
  }

  const deadline = Date.now() + 60_000;
  let baseUrl = null;
  while (Date.now() < deadline) {
    const failedService = services.find(
      (service) => service.child.exitCode !== null,
    );
    if (failedService) {
      await stopLocalStack(services);
      throw new Error(
        `${failedService.name} stopped before the app was ready. ${failedService.output()}`,
      );
    }

    if (
      (await isFrontendAvailable(localBaseUrl, 500)) &&
      (await isApiAvailable(localApiUrl, 500)) &&
      (await isApiAvailable(localBaseUrl, 500))
    ) {
      baseUrl = localBaseUrl;
      break;
    }

    await new Promise((resolvePromise) => setTimeout(resolvePromise, 500));
  }

  if (!baseUrl) {
    await stopLocalStack(services);
    throw new Error('Timed out while starting the local frontend.');
  }

  return { baseUrl, services };
}

async function stopLocalStack(services) {
  for (const service of services) {
    if (service.child.exitCode === null && !service.child.killed) {
      service.child.kill('SIGTERM');
    }
  }

  for (const service of services) {
    const stopped = await waitForServiceToStop(service, 5_000);
    if (stopped) continue;

    service.child.kill('SIGKILL');
    if (!(await waitForServiceToStop(service, 5_000))) {
      console.error(`Unable to stop the temporary ${service.name} process.`);
    }
  }
}

async function waitForServiceToStop(service, timeoutMs) {
  if (service.child.exitCode !== null) return true;

  return await Promise.race([
    new Promise((resolvePromise) => {
      service.child.once('close', () => resolvePromise(true));
    }),
    new Promise((resolvePromise) => {
      setTimeout(() => resolvePromise(false), timeoutMs);
    }),
  ]);
}

async function resolveDemoStack() {
  if (process.env.DEMO_FORCE_LOCAL === 'true') {
    return startLocalStack();
  }

  const configuredUrl = process.env.DEMO_BASE_URL?.replace(/\/$/, '');
  if (configuredUrl) {
    if (
      !(await isFrontendAvailable(configuredUrl)) ||
      !(await isApiAvailable(configuredUrl))
    ) {
      throw new Error(
        `DEMO_BASE_URL is not a ready application: ${configuredUrl}.`,
      );
    }

    return { baseUrl: configuredUrl, services: [] };
  }

  if (process.env.DEMO_START_LOCAL === 'false') {
    throw new Error(
      'Set DEMO_BASE_URL to a ready application or allow the script to start its isolated local stack.',
    );
  }

  return startLocalStack();
}

async function pause(page, milliseconds = PRESENTATION_PAUSE_MS) {
  await page.waitForTimeout(milliseconds);
}

async function gentlyClick(page, locator) {
  await locator.scrollIntoViewIfNeeded();
  await locator.hover();
  await pause(page, ACTION_PAUSE_MS);
  await locator.click();
}

async function signIn(page, account) {
  const switchToSignIn = page.getByRole('button', { name: 'Sign in instead' });
  if (await switchToSignIn.isVisible().catch(() => false)) {
    await gentlyClick(page, switchToSignIn);
  }

  await page.getByLabel('Email').fill(account.email);
  await page.getByLabel('Password').fill(account.password);
  await gentlyClick(page, page.getByRole('button', { name: 'Sign in' }));
  await page.getByRole('button', { name: 'Log out' }).waitFor();
}

async function signOut(page) {
  await gentlyClick(page, page.getByRole('button', { name: 'Log out' }));
  await page.getByRole('button', { name: 'Sign in' }).waitFor();
  await pause(page, ACTION_PAUSE_MS);
}

async function createPendingAgent(page, agent) {
  await gentlyClick(page, page.getByRole('button', { name: 'Create one' }));
  await page.getByLabel('Username').fill(agent.userName);
  await page.getByLabel('Account type').selectOption('agent');
  await page.getByLabel('Email').fill(agent.email);
  // This is a password input, so the password is never visible in the video.
  await page.getByLabel('Password').fill(agent.password);
  await pause(page, ACTION_PAUSE_MS);
  await gentlyClick(page, page.getByRole('button', { name: 'Create account' }));
  await page
    .getByRole('alert')
    .filter({ hasText: 'awaiting administrator approval' })
    .waitFor();
  await pause(page);
}

async function approveAgent(page, agent) {
  await signIn(page, ADMIN);
  await page.getByRole('heading', { name: 'Pending agents' }).waitFor();

  const agentRow = page
    .getByRole('row')
    .filter({ hasText: new RegExp(escapeForRegExp(agent.email)) });
  await agentRow.waitFor();
  await gentlyClick(page, agentRow.getByRole('button', { name: 'Approve' }));
  await page
    .getByRole('status')
    .filter({ hasText: 'Agent approved. They can now sign in.' })
    .waitFor();
  await pause(page);

  // Show the approval's durable result (the pending queue no longer contains it,
  // while the normal user-management screen shows the active account).
  await gentlyClick(page, page.getByRole('button', { name: 'Users' }));
  await page.getByLabel('Find a user').fill(agent.email);
  const activeAgentRow = page.getByRole('row').filter({
    hasText: new RegExp(
      `${escapeForRegExp(agent.email)}.*active|active.*${escapeForRegExp(agent.email)}`,
    ),
  });
  await activeAgentRow.waitFor();
  await pause(page);
  await signOut(page);
}

async function createCustomerTicket(page) {
  await signIn(page, CUSTOMER);
  await page.getByRole('heading', { name: 'My tickets' }).waitFor();
  await page.getByLabel('Topic').selectOption('payment');
  await page
    .getByLabel('What do you need help with?')
    .fill(
      'I was charged for my order, but the payment page reported that the transaction failed. Please review the payment and confirm the next steps.',
    );
  await gentlyClick(page, page.getByRole('button', { name: 'Create ticket' }));

  const createdMessage = page
    .getByRole('status')
    .filter({ hasText: /Ticket #\d+ was created\./ });
  await createdMessage.waitFor();
  const createdText = await createdMessage.textContent();
  const ticketId = createdText?.match(/Ticket #(\d+) was created\./)?.[1];
  if (!ticketId) {
    throw new Error('The newly created ticket ID was not displayed.');
  }

  await pause(page);
  await signOut(page);
  return ticketId;
}

async function waitForQueueTicket(page, ticketId) {
  const ticketNumber = page.getByText(`#${ticketId}`, { exact: true });
  const deadline = Date.now() + AI_READY_TIMEOUT_MS;
  let queueSnapshot = 'not loaded';

  while (Date.now() < deadline) {
    if (await ticketNumber.count()) {
      return ticketNumber.locator('xpath=ancestor::tr');
    }

    const agentError = page.getByRole('alert');
    if (await agentError.count()) {
      throw new Error(
        `The agent workspace could not load its queue: ${await agentError.first().innerText()}`,
      );
    }

    await pause(page, 3_000);
    const queueResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'GET' &&
        response.url().includes('/api/v1/tickets/queue'),
    );
    await gentlyClick(
      page,
      page.getByRole('button', { name: 'Refresh workspace' }),
    );
    const response = await queueResponse;
    if (!response.ok()) {
      throw new Error(
        `The agent queue request failed with HTTP ${response.status()}.`,
      );
    }

    const body = await response.json();
    const tickets = Array.isArray(body?.tickets) ? body.tickets : [];
    queueSnapshot = tickets.length
      ? tickets
          .map((ticket) => `#${ticket.id} ${ticket.status}/${ticket.ai_status}`)
          .join(', ')
      : 'empty';
  }

  throw new Error(
    `Ticket #${ticketId} did not become available in the agent queue within ${AI_READY_TIMEOUT_MS / 1_000} seconds. The last queue response was: ${queueSnapshot}.`,
  );
}

async function claimReplyAndResolve(page, agent, ticketId) {
  await signIn(page, agent);
  await page.getByRole('heading', { name: 'Support queue' }).waitFor();

  const ticketRow = await waitForQueueTicket(page, ticketId);
  // This row naturally shows the AI triage state and, when enabled, its category,
  // priority score, and urgency. No AI result is written or modified by this script.
  await ticketRow.scrollIntoViewIfNeeded();
  await pause(page, PRESENTATION_PAUSE_MS + 3_000);

  await gentlyClick(page, ticketRow.getByRole('button', { name: 'Claim' }));
  await page
    .getByRole('status')
    .filter({ hasText: `Ticket #${ticketId} is now assigned to you.` })
    .waitFor();
  await pause(page);

  const reply =
    'Hi, I checked your payment issue. The transaction appears to have failed after the charge was created. I have reviewed the case and the payment issue should now be resolved.';
  await page.getByLabel('Reply').fill(reply);
  await gentlyClick(page, page.getByRole('button', { name: 'Send reply' }));
  await page.getByText(reply, { exact: true }).waitFor();
  await pause(page);

  await gentlyClick(page, page.getByRole('button', { name: 'Mark resolved' }));
  await page
    .getByRole('status')
    .filter({ hasText: `Ticket #${ticketId} was marked resolved.` })
    .waitFor();
  await page.getByText('resolved', { exact: true }).first().waitFor();
  await pause(page);
  await signOut(page);

  return reply;
}

async function reviewAndCloseTicket(page, ticketId, reply) {
  await signIn(page, CUSTOMER);
  await page.getByRole('heading', { name: 'My tickets' }).waitFor();

  const ticketRow = page
    .getByRole('row')
    .filter({ hasText: new RegExp(`#${escapeForRegExp(ticketId)}`) });
  await ticketRow.waitFor();
  await gentlyClick(
    page,
    ticketRow.getByRole('button', {
      name: new RegExp(`Open ticket #${escapeForRegExp(ticketId)}`),
    }),
  );
  await page.getByText(reply, { exact: true }).waitFor();
  await page.getByText('resolved', { exact: true }).first().waitFor();
  await pause(page);

  await gentlyClick(
    page,
    page.getByRole('button', { name: 'Confirm and close' }),
  );
  await page
    .getByRole('status')
    .filter({ hasText: 'Ticket closed. Thanks for confirming the resolution.' })
    .waitFor();
  await page.getByText('closed', { exact: true }).first().waitFor();
  await pause(page, PRESENTATION_PAUSE_MS + 3_000);
}

async function findFfmpeg() {
  if (process.env.FFMPEG_PATH) {
    return process.env.FFMPEG_PATH;
  }

  try {
    // The installer resolves the correct optional binary for Windows, macOS,
    // and Linux rather than assuming the machine running the recorder is Windows.
    const installedFfmpeg = await import('@ffmpeg-installer/ffmpeg');
    const installerPath = installedFfmpeg.default?.path;
    if (installerPath && (await pathExists(installerPath))) {
      return installerPath;
    }
  } catch {
    // The WebM remains useful when an FFmpeg binary is unavailable.
  }

  return null;
}

async function exportMp4(ffmpegPath, inputPath, outputPath) {
  await new Promise((resolvePromise, reject) => {
    const process = spawn(
      ffmpegPath,
      [
        '-n',
        '-i',
        inputPath,
        '-r',
        '30',
        '-c:v',
        'libx264',
        '-preset',
        'medium',
        '-crf',
        '20',
        '-pix_fmt',
        'yuv420p',
        '-movflags',
        '+faststart',
        outputPath,
      ],
      { stdio: 'inherit', windowsHide: true },
    );

    process.once('error', reject);
    process.once('close', (code) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`FFmpeg exited with code ${code}.`));
    });
  });
}

async function publishRecording(includeMp4) {
  const outputs = [
    { staged: STAGED_WEBM_OUTPUT, final: WEBM_OUTPUT },
    ...(includeMp4 ? [{ staged: STAGED_MP4_OUTPUT, final: MP4_OUTPUT }] : []),
  ];
  const backups = [];
  const published = [];

  try {
    for (const output of outputs) {
      if (!(await pathExists(output.final))) continue;

      const backup = `${output.final}.previous-${process.pid}-${Date.now()}`;
      await rename(output.final, backup);
      backups.push({ final: output.final, backup });
    }

    for (const output of outputs) {
      await rename(output.staged, output.final);
      published.push(output.final);
    }
  } catch (error) {
    await Promise.all(published.map((output) => rm(output, { force: true })));
    await Promise.all(
      backups.map(async ({ final, backup }) => {
        if (await pathExists(backup)) await rename(backup, final);
      }),
    );
    throw error;
  } finally {
    await Promise.all(outputs.map(({ staged }) => rm(staged, { force: true })));
  }

  // A cleanup failure must never roll back an already-published valid pair.
  await Promise.all(
    backups.map(async ({ backup }) => {
      try {
        await rm(backup, { force: true });
      } catch (error) {
        console.warn(
          `Unable to remove replaced recording backup ${backup}:`,
          error,
        );
      }
    }),
  );
}

async function main() {
  await assertOutputIsSafe();
  const demoStack = await resolveDemoStack();
  const { baseUrl } = demoStack;
  const runId = `${Date.now()}${Math.floor(Math.random() * 1_000)}`;
  const agent = {
    userName: `portfolio_agent_${runId}`,
    email: `portfolio.agent.${runId}@demo.local`,
    password: NEW_AGENT_PASSWORD,
  };

  console.log(`Recording the live UI at ${baseUrl}`);
  console.log(`The new portfolio agent is ${agent.email}`);

  let browser;
  let context;
  let video;
  let workflowCompleted = false;

  try {
    browser = await chromium.launch({ headless: true });
    context = await browser.newContext({
      viewport: { width: 1_920, height: 1_080 },
      deviceScaleFactor: 1,
      recordVideo: { dir: OUTPUT_DIR, size: { width: 1_920, height: 1_080 } },
    });
    const page = await context.newPage();
    video = page.video();
    page.setDefaultTimeout(30_000);

    await page.goto(baseUrl, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Sign in' }).waitFor();
    await pause(page, PRESENTATION_PAUSE_MS + 3_000);

    await createPendingAgent(page, agent);
    await approveAgent(page, agent);
    const ticketId = await createCustomerTicket(page);
    const reply = await claimReplyAndResolve(page, agent, ticketId);
    await reviewAndCloseTicket(page, ticketId, reply);
    workflowCompleted = true;
  } finally {
    await context?.close();
    await browser?.close();
    if (!workflowCompleted && video) {
      const partialRecordingPath = await video.path().catch(() => null);
      if (partialRecordingPath && (await pathExists(partialRecordingPath))) {
        await rm(partialRecordingPath, { force: true });
      }
    }
    await stopLocalStack(demoStack.services);
  }

  if (!video) {
    throw new Error('Playwright did not create a video recorder.');
  }
  const recordingPath = await video.path();
  if (!recordingPath || !(await pathExists(recordingPath))) {
    throw new Error('Playwright did not produce a video file.');
  }

  await rename(recordingPath, STAGED_WEBM_OUTPUT);
  const ffmpegPath = await findFfmpeg();
  if (!ffmpegPath) {
    if (await pathExists(MP4_OUTPUT)) {
      await rm(STAGED_WEBM_OUTPUT, { force: true });
      throw new Error(
        'FFmpeg is required to replace an existing MP4. Set FFMPEG_PATH or install the bundled FFmpeg dependency.',
      );
    }
    await publishRecording(false);
    console.log(`Saved the original Playwright recording: ${WEBM_OUTPUT}`);
    console.log(
      'MP4 export was skipped because FFmpeg was not found. Set FFMPEG_PATH and rerun the export.',
    );
    return;
  }

  try {
    await exportMp4(ffmpegPath, STAGED_WEBM_OUTPUT, STAGED_MP4_OUTPUT);
    await publishRecording(true);
  } catch (error) {
    await Promise.all([
      rm(STAGED_WEBM_OUTPUT, { force: true }),
      rm(STAGED_MP4_OUTPUT, { force: true }),
    ]);
    throw error;
  }
  console.log(`Saved the original WebM: ${WEBM_OUTPUT}`);
  console.log(`Saved the portfolio MP4: ${MP4_OUTPUT}`);
}

main().catch((error) => {
  console.error(`Portfolio recording failed: ${error.message}`);
  process.exitCode = 1;
});
