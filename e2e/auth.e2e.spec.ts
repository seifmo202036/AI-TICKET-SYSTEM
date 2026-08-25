import { expect, test } from '@playwright/test';

import {
  cleanupE2eData,
  seedUser,
  TEST_PASSWORD,
  uniqueEmail,
  uniqueName,
} from './helpers/db.helper.js';
import {
  expectApiError,
  API_PREFIX,
  login,
  signup,
  type SessionCookies,
} from './helpers/api.helper.js';
import type { SeededUser } from './helpers/db.helper.js';

const seededUserIds: Array<string | number> = [];

let customer: SeededUser;
let pendingAgent: SeededUser;

test.beforeAll(async () => {
  customer = await seedUser('e2e_auth_customer', 'customer', 'active');
  pendingAgent = await seedUser('e2e_auth_pending', 'agent', 'pending');
  seededUserIds.push(customer.id, pendingAgent.id);
});

test.afterAll(async () => {
  await cleanupE2eData(seededUserIds, []);
});

test.describe('signup', () => {
  test('creates an active customer account directly', async ({ request }) => {
    const response = await signup(request, {
      userName: uniqueName('e2e_signup_customer'),
      email: uniqueEmail('e2e_signup_customer'),
      password: TEST_PASSWORD,
      role: 'customer',
    });

    expect(response.status()).toBe(201);

    const body = (await response.json()) as {
      data: { user: { role: string; accountStatus: string; id: string } };
    };

    // Customers are activated immediately, agents need admin approval
    expect(body.data.user.role).toBe('customer');
    expect(body.data.user.accountStatus).toBe('active');

    seededUserIds.push(body.data.user.id);
  });

  test('creates a pending agent account', async ({ request }) => {
    const response = await signup(request, {
      userName: uniqueName('e2e_signup_agent'),
      email: uniqueEmail('e2e_signup_agent'),
      password: TEST_PASSWORD,
      role: 'agent',
    });

    expect(response.status()).toBe(201);

    const body = (await response.json()) as {
      data: { user: { role: string; accountStatus: string; id: string } };
    };

    expect(body.data.user.role).toBe('agent');
    expect(body.data.user.accountStatus).toBe('pending');

    seededUserIds.push(body.data.user.id);
  });

  test('rejects a duplicate email with 409', async ({ request }) => {
    const response = await signup(request, {
      userName: uniqueName('e2e_dup_user'),
      email: customer.email,
      password: TEST_PASSWORD,
      role: 'customer',
    });

    await expectApiError(response, 409, 'EMAIL_ALREADY_REGISTERED');
  });

  test('rejects an invalid payload with 400', async ({ request }) => {
    const response = await request.post(`${API_PREFIX}/auth/signup`, {
      data: {
        userName: 'ab',
        email: 'not-an-email',
        password: 'short',
        role: 'admin',
      },
    });

    await expectApiError(response, 400, 'VALIDATION_ERROR');
  });
});

test.describe('login', () => {
  test('blocks a pending agent until approval', async ({ request }) => {
    // A pending agent gets no session cookies at all
    const response = await request.post(`${API_PREFIX}/auth/login`, {
      data: { email: pendingAgent.email, password: TEST_PASSWORD },
    });

    await expectApiError(response, 403, 'ACCOUNT_PENDING');
  });

  test('rejects wrong credentials without leaking which part failed', async ({
    request,
  }) => {
    const response = await request.post(`${API_PREFIX}/auth/login`, {
      data: { email: customer.email, password: 'WrongPassword123!' },
    });

    await expectApiError(response, 401, 'INVALID_CREDENTIALS');
  });

  test('sets HttpOnly session cookies and exposes the safe user', async ({
    request,
  }) => {
    const { response, rawSetCookieHeaders } = await login(
      request,
      customer.email,
    );

    expect(response.status()).toBe(200);

    for (const cookieName of ['accessToken', 'refreshToken']) {
      const cookieHeader = rawSetCookieHeaders.find((header) =>
        header.startsWith(`${cookieName}=`),
      ) as string;

      expect(cookieHeader).toContain('HttpOnly');
      expect(cookieHeader).toContain('SameSite=Lax');
      expect(cookieHeader).not.toContain('Secure');
    }

    const body = (await response.json()) as {
      user: Record<string, unknown>;
    };

    expect(body.user).toMatchObject({
      id: customer.id,
      role: 'customer',
    });
    expect('password_hash' in body.user).toBe(false);
    expect('accessToken' in body).toBe(false);
    expect('refreshToken' in body).toBe(false);
  });
});

test.describe('current user', () => {
  let cookies: SessionCookies;

  test.beforeAll(async ({ request }) => {
    const result = await login(request, customer.email);
    cookies = result.cookies;
  });

  test('returns the authenticated user from the access cookie', async ({
    request,
  }) => {
    const response = await request.get(`${API_PREFIX}/auth/me`, {
      headers: { cookie: cookies.accessCookie },
    });

    expect(response.status()).toBe(200);

    const body = (await response.json()) as { user: { id: string } };

    expect(body.user.id).toBe(customer.id);
  });

  test('rejects requests without an access token', async ({ request }) => {
    const response = await request.get(`${API_PREFIX}/auth/me`);

    await expectApiError(response, 401, 'AUTHENTICATION_REQUIRED');
  });

  test('rejects a tampered access token', async ({ request }) => {
    const response = await request.get(`${API_PREFIX}/auth/me`, {
      headers: { cookie: 'accessToken=invalid-token' },
    });

    await expectApiError(response, 401, 'INVALID_ACCESS_TOKEN');
  });
});

test.describe('refresh rotation', () => {
  test('rotates the refresh token and rejects reuse of the old one', async ({
    request,
  }) => {
    const { cookies } = await login(request, customer.email);

    const refreshResponse = await request.post(`${API_PREFIX}/auth/refresh`, {
      headers: { cookie: cookies.refreshCookie },
    });

    expect(refreshResponse.status()).toBe(200);

    const setCookieHeaders = refreshResponse
      .headersArray()
      .filter((header) => header.name.toLowerCase() === 'set-cookie')
      .map((header) => header.value);

    const newRefreshCookie = setCookieHeaders.find((header) =>
      header.startsWith('refreshToken='),
    );

    expect(newRefreshCookie).toBeTruthy();
    expect(newRefreshCookie?.split(';', 1)[0]).not.toBe(cookies.refreshCookie);

    // The old refresh token is single-use
    const reuseResponse = await request.post(`${API_PREFIX}/auth/refresh`, {
      headers: { cookie: cookies.refreshCookie },
    });

    await expectApiError(reuseResponse, 401, 'REFRESH_TOKEN_REVOKED');
  });

  test('rejects refresh without a token', async ({ request }) => {
    const response = await request.post(`${API_PREFIX}/auth/refresh`);

    await expectApiError(response, 401, 'REFRESH_TOKEN_REQUIRED');
  });
});

test.describe('logout', () => {
  test('clears the cookies and revokes the session', async ({ request }) => {
    const { cookies } = await login(request, customer.email);

    const logoutResponse = await request.post(`${API_PREFIX}/auth/logout`, {
      headers: {
        cookie: `${cookies.accessCookie}; ${cookies.refreshCookie}`,
      },
    });

    expect(logoutResponse.status()).toBe(204);

    const clearedCookies = logoutResponse
      .headersArray()
      .filter((header) => header.name.toLowerCase() === 'set-cookie')
      .map((header) => header.value);

    expect(clearedCookies.length).toBeGreaterThanOrEqual(2);

    for (const cookie of clearedCookies) {
      expect(cookie.split(';')[0]?.endsWith('=')).toBe(true);
    }

    const refreshAfterLogout = await request.post(`${API_PREFIX}/auth/refresh`, {
      headers: { cookie: cookies.refreshCookie },
    });

    await expectApiError(refreshAfterLogout, 401, 'REFRESH_TOKEN_REVOKED');
  });
});
