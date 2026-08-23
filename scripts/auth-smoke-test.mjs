import 'dotenv/config';

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';

import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import pg from 'pg';

const { Pool } = pg;

const TEST_PASSWORD = 'TestPassword123!';
const TOKEN_ISSUER = 'ai-ticket-system-api';
const TOKEN_AUDIENCE = 'ai-ticket-system-web';

const databasePool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const createdUserIds = [];
const testSuffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

let applicationProcess;
let applicationOutput = '';
let apiBaseUrl;
let usersApiBaseUrl;

function delay(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function getAvailablePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();

    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();

      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('Unable to determine the test server port.'));
        return;
      }

      const { port } = address;

      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(port);
      });
    });
  });
}

function startApplication(port) {
  applicationProcess = spawn(
    process.execPath,
    ['--import', 'tsx', 'src/server.ts'],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        NODE_ENV: 'test',
        PORT: String(port),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );

  applicationProcess.stdout.on('data', (chunk) => {
    applicationOutput += chunk.toString();
  });

  applicationProcess.stderr.on('data', (chunk) => {
    applicationOutput += chunk.toString();
  });
}

async function waitForApplication() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (applicationProcess.exitCode !== null) {
      throw new Error(
        `The test server stopped before startup.\n${applicationOutput}`,
      );
    }

    try {
      const response = await fetch(`${apiBaseUrl}/me`);

      if (response.status === 401) {
        return;
      }
    } catch {
      // The server may still be starting.
    }

    await delay(100);
  }

  throw new Error(
    `The test server did not start in time.\n${applicationOutput}`,
  );
}

function stopApplication() {
  if (applicationProcess && applicationProcess.exitCode === null) {
    applicationProcess.kill();
  }
}

function getSetCookieHeaders(response) {
  if (typeof response.headers.getSetCookie === 'function') {
    return response.headers.getSetCookie();
  }

  const combinedHeader = response.headers.get('set-cookie');

  if (!combinedHeader) {
    return [];
  }

  return combinedHeader.split(/,(?=\s*[A-Za-z0-9_-]+=)/);
}

function findCookieHeader(headers, cookieName) {
  const cookieHeader = headers.find((header) =>
    header.startsWith(`${cookieName}=`),
  );

  assert.equal(
    Boolean(cookieHeader),
    true,
    `Expected the ${cookieName} Set-Cookie header.`,
  );

  return cookieHeader;
}

function getCookiePair(cookieHeader) {
  return cookieHeader.split(';', 1)[0];
}

function getCookieValue(cookiePair) {
  return cookiePair.slice(cookiePair.indexOf('=') + 1);
}

function hashRefreshToken(refreshToken) {
  return createHash('sha256').update(refreshToken).digest('hex');
}

function assertCookieOptions(cookieHeader, expectedPath) {
  assert.equal(
    /;\s*HttpOnly/i.test(cookieHeader),
    true,
    'Expected an HttpOnly cookie.',
  );
  assert.equal(
    /;\s*SameSite=Lax/i.test(cookieHeader),
    true,
    'Expected SameSite=Lax.',
  );
  assert.equal(
    cookieHeader.includes(`Path=${expectedPath}`),
    true,
    `Expected cookie path ${expectedPath}.`,
  );
  assert.equal(
    /;\s*Secure/i.test(cookieHeader),
    false,
    'Secure cookies should be disabled in the test environment.',
  );
}

async function apiRequest(path, options = {}) {
  return fetch(`${apiBaseUrl}${path}`, {
    redirect: 'manual',
    ...options,
  });
}

async function userApiRequest(path, options = {}) {
  return fetch(`${usersApiBaseUrl}${path}`, {
    redirect: 'manual',
    ...options,
  });
}

async function createTestUser(label, role, accountStatus, passwordHash) {
  const userName = `${label}_${testSuffix}`;
  const email = `${userName}@example.com`;

  const result = await databasePool.query(
    `
      INSERT INTO users (
        user_name,
        email,
        password_hash,
        role,
        account_status
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING
        id,
        user_name,
        email,
        role,
        account_status,
        created_at
    `,
    [userName, email, passwordHash, role, accountStatus],
  );

  const user = result.rows[0];

  assert.equal(Boolean(user), true, 'Expected a seeded user.');
  createdUserIds.push(user.id);

  return user;
}

async function loginSuccessfully(user) {
  const response = await apiRequest('/login', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      email: user.email,
      password: TEST_PASSWORD,
    }),
  });

  assert.equal(response.status, 200);

  const body = await response.json();

  assert.equal(body.user.id, user.id);
  assert.deepEqual(Object.keys(body.user).sort(), [
    'accountStatus',
    'createdAt',
    'email',
    'id',
    'role',
    'userName',
  ]);
  assert.equal('password_hash' in body.user, false);
  assert.equal('accessToken' in body, false);
  assert.equal('refreshToken' in body, false);

  const setCookieHeaders = getSetCookieHeaders(response);
  const accessCookieHeader = findCookieHeader(setCookieHeaders, 'accessToken');
  const refreshCookieHeader = findCookieHeader(
    setCookieHeaders,
    'refreshToken',
  );

  assertCookieOptions(accessCookieHeader, '/api');
  assertCookieOptions(refreshCookieHeader, '/api/v1/auth');
  assert.equal(
    /;\s*Max-Age=/i.test(accessCookieHeader),
    true,
    'Expected access-token cookie max age.',
  );
  assert.equal(
    /;\s*Max-Age=/i.test(refreshCookieHeader),
    true,
    'Expected refresh-token cookie max age.',
  );

  return {
    accessCookie: getCookiePair(accessCookieHeader),
    refreshCookie: getCookiePair(refreshCookieHeader),
  };
}

async function expectApiError(response, expectedStatus, expectedCode) {
  assert.equal(response.status, expectedStatus);

  const body = await response.json();

  assert.equal(body.code, expectedCode);
  assert.equal(typeof body.message, 'string');
}

async function runScenario(name, scenario) {
  await scenario();
  console.log(`PASS: ${name}`);
}

async function run() {
  assert.equal(
    typeof process.env.DATABASE_URL,
    'string',
    'DATABASE_URL is required.',
  );
  assert.equal(
    typeof process.env.JWT_SECRET,
    'string',
    'JWT_SECRET is required.',
  );

  await databasePool.query('SELECT 1');

  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10);

  const users = {
    customer: await createTestUser(
      'customer',
      'customer',
      'active',
      passwordHash,
    ),
    pending: await createTestUser('pending', 'agent', 'pending', passwordHash),
    suspendedLogin: await createTestUser(
      'suspended_login',
      'customer',
      'suspended',
      passwordHash,
    ),
    suspendedAccess: await createTestUser(
      'suspended_access',
      'customer',
      'active',
      passwordHash,
    ),
    deletedAccess: await createTestUser(
      'deleted_access',
      'customer',
      'active',
      passwordHash,
    ),
    agent: await createTestUser('agent', 'agent', 'active', passwordHash),
    admin: await createTestUser('admin', 'admin', 'active', passwordHash),
    rotation: await createTestUser(
      'rotation',
      'customer',
      'active',
      passwordHash,
    ),
    expiredRefresh: await createTestUser(
      'expired_refresh',
      'customer',
      'active',
      passwordHash,
    ),
    revokedRefresh: await createTestUser(
      'revoked_refresh',
      'customer',
      'active',
      passwordHash,
    ),
    suspendedRefresh: await createTestUser(
      'suspended_refresh',
      'customer',
      'active',
      passwordHash,
    ),
    concurrentRefresh: await createTestUser(
      'concurrent_refresh',
      'customer',
      'active',
      passwordHash,
    ),
    logout: await createTestUser('logout', 'customer', 'active', passwordHash),
    suspendTarget: await createTestUser(
      'suspend_target',
      'customer',
      'active',
      passwordHash,
    ),
    reinstateTarget: await createTestUser(
      'reinstate_target',
      'customer',
      'active',
      passwordHash,
    ),
  };

  const port = await getAvailablePort();
  const serverRootUrl = `http://127.0.0.1:${port}`;
  apiBaseUrl = `${serverRootUrl}/api/v1/auth`;
  usersApiBaseUrl = `${serverRootUrl}/api/v1/users`;
  startApplication(port);
  await waitForApplication();

  let customerCookies;

  await runScenario('valid login and session creation', async () => {
    customerCookies = await loginSuccessfully(users.customer);

    const refreshTokenHash = hashRefreshToken(
      getCookieValue(customerCookies.refreshCookie),
    );
    const sessionResult = await databasePool.query(
      `
        SELECT id
        FROM auth_sessions
        WHERE token_hash = $1
      `,
      [refreshTokenHash],
    );

    assert.equal(sessionResult.rowCount, 1);
  });

  await runScenario('login rejection cases', async () => {
    const wrongPasswordResponse = await apiRequest('/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: users.customer.email,
        password: 'WrongPassword123!',
      }),
    });
    await expectApiError(wrongPasswordResponse, 401, 'INVALID_CREDENTIALS');

    const unknownEmailResponse = await apiRequest('/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: `unknown_${testSuffix}@example.com`,
        password: TEST_PASSWORD,
      }),
    });
    await expectApiError(unknownEmailResponse, 401, 'INVALID_CREDENTIALS');

    const pendingResponse = await apiRequest('/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: users.pending.email,
        password: TEST_PASSWORD,
      }),
    });
    await expectApiError(pendingResponse, 403, 'ACCOUNT_PENDING');

    const suspendedResponse = await apiRequest('/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: users.suspendedLogin.email,
        password: TEST_PASSWORD,
      }),
    });
    await expectApiError(suspendedResponse, 403, 'ACCOUNT_SUSPENDED');
  });

  await runScenario('concurrent signup uniqueness', async () => {
    const userName = `race_${testSuffix}`;
    const email = `${userName}@example.com`;
    const signupPayload = {
      userName,
      email,
      password: TEST_PASSWORD,
      role: 'customer',
    };

    const signupRequest = () =>
      apiRequest('/signup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(signupPayload),
      });

    const responses = await Promise.all([signupRequest(), signupRequest()]);

    await databasePool.query(
      `
        DELETE FROM users
        WHERE email = $1
      `,
      [email],
    );

    const statuses = responses
      .map((response) => response.status)
      .sort((left, right) => left - right);

    assert.deepEqual(statuses, [201, 409]);

    const conflictResponse = responses.find(
      (response) => response.status === 409,
    );
    const conflictBody = await conflictResponse.json();
    assert.equal(
      ['EMAIL_ALREADY_REGISTERED', 'USERNAME_ALREADY_TAKEN'].includes(
        conflictBody.code,
      ),
      true,
      'Expected a uniqueness conflict error code.',
    );
  });

  await runScenario('current-user authentication', async () => {
    const currentUserResponse = await apiRequest('/me', {
      headers: {
        cookie: customerCookies.accessCookie,
      },
    });

    assert.equal(currentUserResponse.status, 200);
    const body = await currentUserResponse.json();
    assert.equal(body.user.id, users.customer.id);
    assert.equal('password_hash' in body.user, false);

    const missingCookieResponse = await apiRequest('/me');
    await expectApiError(missingCookieResponse, 401, 'AUTHENTICATION_REQUIRED');

    const invalidTokenResponse = await apiRequest('/me', {
      headers: {
        cookie: 'accessToken=invalid-token',
      },
    });
    await expectApiError(invalidTokenResponse, 401, 'INVALID_ACCESS_TOKEN');

    const expiredAccessToken = jwt.sign({}, process.env.JWT_SECRET, {
      subject: users.customer.id,
      algorithm: 'HS256',
      issuer: TOKEN_ISSUER,
      audience: TOKEN_AUDIENCE,
      expiresIn: -1,
    });
    const expiredTokenResponse = await apiRequest('/me', {
      headers: {
        cookie: `accessToken=${expiredAccessToken}`,
      },
    });
    await expectApiError(expiredTokenResponse, 401, 'ACCESS_TOKEN_EXPIRED');

    const suspendedCookies = await loginSuccessfully(users.suspendedAccess);
    await databasePool.query(
      `
        UPDATE users
        SET account_status = 'suspended'
        WHERE id = $1
      `,
      [users.suspendedAccess.id],
    );
    const suspendedAccessResponse = await apiRequest('/me', {
      headers: {
        cookie: suspendedCookies.accessCookie,
      },
    });
    await expectApiError(suspendedAccessResponse, 403, 'ACCOUNT_SUSPENDED');

    const deletedCookies = await loginSuccessfully(users.deletedAccess);
    await databasePool.query(
      `
        DELETE FROM users
        WHERE id = $1
      `,
      [users.deletedAccess.id],
    );
    const deletedUserResponse = await apiRequest('/me', {
      headers: {
        cookie: deletedCookies.accessCookie,
      },
    });
    await expectApiError(deletedUserResponse, 401, 'INVALID_AUTHENTICATION');
  });

  await runScenario('role authorization', async () => {
    const customerResponse = await apiRequest('/test/agent-only', {
      headers: {
        cookie: customerCookies.accessCookie,
      },
    });
    await expectApiError(customerResponse, 403, 'FORBIDDEN');

    const agentCookies = await loginSuccessfully(users.agent);
    const agentResponse = await apiRequest('/test/agent-only', {
      headers: {
        cookie: agentCookies.accessCookie,
      },
    });
    assert.equal(agentResponse.status, 204);

    const adminCookies = await loginSuccessfully(users.admin);
    const adminResponse = await apiRequest('/test/agent-only', {
      headers: {
        cookie: adminCookies.accessCookie,
      },
    });
    assert.equal(adminResponse.status, 204);
  });

  await runScenario('refresh-token rotation and reuse rejection', async () => {
    const oldCookies = await loginSuccessfully(users.rotation);
    const oldRefreshToken = getCookieValue(oldCookies.refreshCookie);
    const oldRefreshTokenHash = hashRefreshToken(oldRefreshToken);

    const refreshResponse = await apiRequest('/refresh', {
      method: 'POST',
      headers: {
        cookie: oldCookies.refreshCookie,
      },
    });
    assert.equal(refreshResponse.status, 200);

    const refreshBody = await refreshResponse.json();
    assert.equal('accessToken' in refreshBody, false);
    assert.equal('refreshToken' in refreshBody, false);

    const newSetCookieHeaders = getSetCookieHeaders(refreshResponse);
    const newAccessCookieHeader = findCookieHeader(
      newSetCookieHeaders,
      'accessToken',
    );
    const newRefreshCookieHeader = findCookieHeader(
      newSetCookieHeaders,
      'refreshToken',
    );
    const newRefreshToken = getCookieValue(
      getCookiePair(newRefreshCookieHeader),
    );

    assertCookieOptions(newAccessCookieHeader, '/api');
    assertCookieOptions(newRefreshCookieHeader, '/api/v1/auth');
    assert.equal(
      newRefreshToken !== oldRefreshToken,
      true,
      'Rotation must issue a new refresh token.',
    );

    const oldSessionResult = await databasePool.query(
      `
        SELECT
          revoked_at,
          replaced_by_session_id
        FROM auth_sessions
        WHERE token_hash = $1
      `,
      [oldRefreshTokenHash],
    );
    const oldSession = oldSessionResult.rows[0];

    assert.equal(Boolean(oldSession.revoked_at), true);
    assert.equal(Boolean(oldSession.replaced_by_session_id), true);

    const newSessionResult = await databasePool.query(
      `
        SELECT id
        FROM auth_sessions
        WHERE token_hash = $1
      `,
      [hashRefreshToken(newRefreshToken)],
    );
    assert.equal(newSessionResult.rowCount, 1);
    assert.equal(
      newSessionResult.rows[0].id,
      oldSession.replaced_by_session_id,
    );

    const reuseResponse = await apiRequest('/refresh', {
      method: 'POST',
      headers: {
        cookie: oldCookies.refreshCookie,
      },
    });
    await expectApiError(reuseResponse, 401, 'REFRESH_TOKEN_REVOKED');
  });

  await runScenario('expired and revoked refresh rejection', async () => {
    const missingRefreshResponse = await apiRequest('/refresh', {
      method: 'POST',
    });
    await expectApiError(missingRefreshResponse, 401, 'REFRESH_TOKEN_REQUIRED');

    const expiredCookies = await loginSuccessfully(users.expiredRefresh);
    const expiredHash = hashRefreshToken(
      getCookieValue(expiredCookies.refreshCookie),
    );
    await databasePool.query(
      `
        UPDATE auth_sessions
        SET expires_at = NOW() - INTERVAL '1 minute'
        WHERE token_hash = $1
      `,
      [expiredHash],
    );

    const expiredResponse = await apiRequest('/refresh', {
      method: 'POST',
      headers: {
        cookie: expiredCookies.refreshCookie,
      },
    });
    await expectApiError(expiredResponse, 401, 'REFRESH_TOKEN_EXPIRED');

    const revokedCookies = await loginSuccessfully(users.revokedRefresh);
    const revokedHash = hashRefreshToken(
      getCookieValue(revokedCookies.refreshCookie),
    );
    await databasePool.query(
      `
        UPDATE auth_sessions
        SET revoked_at = NOW()
        WHERE token_hash = $1
      `,
      [revokedHash],
    );

    const revokedResponse = await apiRequest('/refresh', {
      method: 'POST',
      headers: {
        cookie: revokedCookies.refreshCookie,
      },
    });
    await expectApiError(revokedResponse, 401, 'REFRESH_TOKEN_REVOKED');
  });

  await runScenario('suspended-user refresh rejection', async () => {
    const cookies = await loginSuccessfully(users.suspendedRefresh);
    await databasePool.query(
      `
        UPDATE users
        SET account_status = 'suspended'
        WHERE id = $1
      `,
      [users.suspendedRefresh.id],
    );

    const response = await apiRequest('/refresh', {
      method: 'POST',
      headers: {
        cookie: cookies.refreshCookie,
      },
    });
    await expectApiError(response, 403, 'ACCOUNT_SUSPENDED');
  });

  await runScenario('admin suspension revokes sessions', async () => {
    const targetCookies = await loginSuccessfully(users.suspendTarget);
    const adminCookies = await loginSuccessfully(users.admin);

    const forbiddenResponse = await userApiRequest(
      `/${users.agent.id}/suspend`,
      {
        method: 'POST',
        headers: {
          cookie: customerCookies.accessCookie,
        },
      },
    );
    await expectApiError(forbiddenResponse, 403, 'FORBIDDEN');

    const invalidIdResponse = await userApiRequest('/abc/suspend', {
      method: 'POST',
      headers: { cookie: adminCookies.accessCookie },
    });
    await expectApiError(invalidIdResponse, 400, 'INVALID_USER_ID');

    const unknownIdResponse = await userApiRequest('/987654321/suspend', {
      method: 'POST',
      headers: { cookie: adminCookies.accessCookie },
    });
    await expectApiError(unknownIdResponse, 404, 'USER_NOT_FOUND');

    const suspendResponse = await userApiRequest(
      `/${users.suspendTarget.id}/suspend`,
      {
        method: 'POST',
        headers: { cookie: adminCookies.accessCookie },
      },
    );
    assert.equal(suspendResponse.status, 200);

    const suspendBody = await suspendResponse.json();
    assert.equal(suspendBody.data.user.accountStatus, 'suspended');

    const meResponse = await apiRequest('/me', {
      headers: { cookie: targetCookies.accessCookie },
    });
    await expectApiError(meResponse, 403, 'ACCOUNT_SUSPENDED');

    const refreshResponse = await apiRequest('/refresh', {
      method: 'POST',
      headers: { cookie: targetCookies.refreshCookie },
    });
    await expectApiError(refreshResponse, 401, 'REFRESH_TOKEN_REVOKED');
  });

  await runScenario('admin reinstatement restores access', async () => {
    await databasePool.query(
      `
        UPDATE users
        SET account_status = 'suspended'
        WHERE id = $1
      `,
      [users.reinstateTarget.id],
    );

    const adminCookies = await loginSuccessfully(users.admin);

    const reinstateResponse = await userApiRequest(
      `/${users.reinstateTarget.id}/reinstate`,
      {
        method: 'POST',
        headers: { cookie: adminCookies.accessCookie },
      },
    );
    assert.equal(reinstateResponse.status, 200);

    const reinstateBody = await reinstateResponse.json();
    assert.equal(reinstateBody.data.user.accountStatus, 'active');

    await loginSuccessfully(users.reinstateTarget);
  });

  await runScenario('concurrent refresh protection', async () => {
    const cookies = await loginSuccessfully(users.concurrentRefresh);

    const responses = await Promise.all([
      apiRequest('/refresh', {
        method: 'POST',
        headers: { cookie: cookies.refreshCookie },
      }),
      apiRequest('/refresh', {
        method: 'POST',
        headers: { cookie: cookies.refreshCookie },
      }),
    ]);

    const statuses = responses
      .map((response) => response.status)
      .sort((left, right) => left - right);

    assert.deepEqual(statuses, [200, 401]);

    const sessionCountResult = await databasePool.query(
      `
        SELECT COUNT(*)::INTEGER AS session_count
        FROM auth_sessions
        WHERE user_id = $1
      `,
      [users.concurrentRefresh.id],
    );
    assert.equal(sessionCountResult.rows[0].session_count, 2);
  });

  await runScenario('idempotent logout and cookie clearing', async () => {
    const cookies = await loginSuccessfully(users.logout);
    const refreshTokenHash = hashRefreshToken(
      getCookieValue(cookies.refreshCookie),
    );
    const cookieHeader = `${cookies.accessCookie}; ${cookies.refreshCookie}`;

    const logoutResponse = await apiRequest('/logout', {
      method: 'POST',
      headers: { cookie: cookieHeader },
    });
    assert.equal(logoutResponse.status, 204);

    const clearedCookieHeaders = getSetCookieHeaders(logoutResponse);
    const clearedAccessCookie = findCookieHeader(
      clearedCookieHeaders,
      'accessToken',
    );
    const clearedRefreshCookie = findCookieHeader(
      clearedCookieHeaders,
      'refreshToken',
    );

    assertCookieOptions(clearedAccessCookie, '/api');
    assertCookieOptions(clearedRefreshCookie, '/api/v1/auth');
    assert.equal(getCookieValue(getCookiePair(clearedAccessCookie)), '');
    assert.equal(getCookieValue(getCookiePair(clearedRefreshCookie)), '');

    const sessionResult = await databasePool.query(
      `
        SELECT revoked_at
        FROM auth_sessions
        WHERE token_hash = $1
      `,
      [refreshTokenHash],
    );
    assert.equal(Boolean(sessionResult.rows[0].revoked_at), true);

    const refreshAfterLogoutResponse = await apiRequest('/refresh', {
      method: 'POST',
      headers: { cookie: cookies.refreshCookie },
    });
    await expectApiError(
      refreshAfterLogoutResponse,
      401,
      'REFRESH_TOKEN_REVOKED',
    );

    const secondLogoutResponse = await apiRequest('/logout', {
      method: 'POST',
      headers: { cookie: cookieHeader },
    });
    assert.equal(secondLogoutResponse.status, 204);

    const missingCookieLogoutResponse = await apiRequest('/logout', {
      method: 'POST',
    });
    assert.equal(missingCookieLogoutResponse.status, 204);

    const unknownTokenLogoutResponse = await apiRequest('/logout', {
      method: 'POST',
      headers: {
        cookie: `refreshToken=unknown-${testSuffix}`,
      },
    });
    assert.equal(unknownTokenLogoutResponse.status, 204);
  });

  console.log('All authentication smoke tests passed.');
}

try {
  await run();
} finally {
  stopApplication();

  if (createdUserIds.length > 0) {
    await databasePool.query(
      `
        DELETE FROM users
        WHERE id = ANY($1::BIGINT[])
      `,
      [createdUserIds],
    );
  }

  await databasePool.end();
}
