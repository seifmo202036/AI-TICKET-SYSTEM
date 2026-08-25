import { expect, test } from '@playwright/test';

import {
  cleanupE2eData,
  seedUser,
  type SeededUser,
} from './helpers/db.helper.js';
import {
  expectApiError,
  API_PREFIX,
  login,
  type SessionCookies,
} from './helpers/api.helper.js';

const seededUserIds: Array<string | number> = [];

let admin: SeededUser;
let pendingAgent: SeededUser;
let plainCustomer: SeededUser;
let suspendTarget: SeededUser;

let adminCookies: SessionCookies;
let customerCookies: SessionCookies;

test.beforeAll(async ({ request }) => {
  admin = await seedUser('e2e_users_admin', 'admin', 'active');
  pendingAgent = await seedUser('e2e_users_agent', 'agent', 'pending');
  plainCustomer = await seedUser('e2e_users_customer', 'customer', 'active');
  suspendTarget = await seedUser('e2e_users_target', 'customer', 'active');

  seededUserIds.push(admin.id, pendingAgent.id, plainCustomer.id, suspendTarget.id);

  adminCookies = (await login(request, admin.email)).cookies;
  customerCookies = (await login(request, plainCustomer.email)).cookies;
});

test.afterAll(async () => {
  await cleanupE2eData(seededUserIds, []);
});

test.describe('pending agent approval flow', () => {
  test('forbids non-admin users from listing pending agents', async ({
    request,
  }) => {
    const response = await request.get(`${API_PREFIX}/users/agents/pending`, {
      headers: { cookie: customerCookies.accessCookie },
    });

    await expectApiError(response, 403, 'FORBIDDEN');
  });

  test('lists the pending agents for the admin', async ({ request }) => {
    const response = await request.get(`${API_PREFIX}/users/agents/pending`, {
      headers: { cookie: adminCookies.accessCookie },
    });

    expect(response.status()).toBe(200);

    const body = (await response.json()) as {
      data: { agents: Array<{ id: string; accountStatus: string }> };
    };

    const seededPendingAgent = body.data.agents.find(
      (agent) => agent.id === pendingAgent.id,
    );

    expect(seededPendingAgent).toBeTruthy();
    expect(seededPendingAgent?.accountStatus).toBe('pending');
  });

  test('rejects an invalid user id param with 400', async ({ request }) => {
    const response = await request.post(`${API_PREFIX}/users/abc/approve`, {
      headers: { cookie: adminCookies.accessCookie },
    });

    await expectApiError(response, 400, 'INVALID_USER_ID');
  });

  test('returns 404 when approving an unknown user id', async ({ request }) => {
    const response = await request.post(`${API_PREFIX}/users/987654321/approve`, {
      headers: { cookie: adminCookies.accessCookie },
    });

    await expectApiError(response, 404, 'USER_NOT_FOUND');
  });

  test('refuses to approve a customer account with 409', async ({ request }) => {
    const response = await request.post(
      `${API_PREFIX}/users/${plainCustomer.id}/approve`,
      { headers: { cookie: adminCookies.accessCookie } },
    );

    await expectApiError(response, 409, 'NOT_AN_AGENT');
  });

  test('activates the pending agent so he can log in', async ({ request }) => {
    const approveResponse = await request.post(
      `${API_PREFIX}/users/${pendingAgent.id}/approve`,
      { headers: { cookie: adminCookies.accessCookie } },
    );

    expect(approveResponse.status()).toBe(200);

    const body = (await approveResponse.json()) as {
      data: { user: { accountStatus: string } };
    };

    expect(body.data.user.accountStatus).toBe('active');

    // The approved agent can now sign in
    const loginResponse = await login(request, pendingAgent.email);

    expect(loginResponse.response.status()).toBe(200);
  });

  test('refuses to approve an already active agent with 409', async ({
    request,
  }) => {
    const response = await request.post(`${API_PREFIX}/users/${pendingAgent.id}/approve`, {
      headers: { cookie: adminCookies.accessCookie },
    });

    await expectApiError(response, 409, 'AGENT_NOT_PENDING');
  });
});

test.describe('suspend and reinstate flow', () => {
  let targetCookies: SessionCookies;

  test.beforeAll(async ({ request }) => {
    targetCookies = (await login(request, suspendTarget.email)).cookies;
  });

  test('forbids agents and customers from suspending users', async ({
    request,
  }) => {
    const response = await request.post(`${API_PREFIX}/users/${suspendTarget.id}/suspend`, {
      headers: { cookie: customerCookies.accessCookie },
    });

    await expectApiError(response, 403, 'FORBIDDEN');
  });

  test('suspends the user and blocks login immediately', async ({ request }) => {
    const suspendResponse = await request.post(
      `${API_PREFIX}/users/${suspendTarget.id}/suspend`,
      { headers: { cookie: adminCookies.accessCookie } },
    );

    expect(suspendResponse.status()).toBe(200);

    const body = (await suspendResponse.json()) as {
      data: { user: { accountStatus: string } };
    };

    expect(body.data.user.accountStatus).toBe('suspended');

    const meResponse = await request.get(`${API_PREFIX}/auth/me`, {
      headers: { cookie: targetCookies.accessCookie },
    });

    await expectApiError(meResponse, 403, 'ACCOUNT_SUSPENDED');

    const loginResponse = await request.post(`${API_PREFIX}/auth/login`, {
      data: { email: suspendTarget.email, password: 'TestPassword123!' },
    });

    await expectApiError(loginResponse, 403, 'ACCOUNT_SUSPENDED');
  });

  test('reinstates the user and restores login', async ({ request }) => {
    const reinstateResponse = await request.post(
      `${API_PREFIX}/users/${suspendTarget.id}/reinstate`,
      { headers: { cookie: adminCookies.accessCookie } },
    );

    expect(reinstateResponse.status()).toBe(200);

    const body = (await reinstateResponse.json()) as {
      data: { user: { accountStatus: string } };
    };

    expect(body.data.user.accountStatus).toBe('active');

    const loginResponse = await request.post(`${API_PREFIX}/auth/login`, {
      data: { email: suspendTarget.email, password: 'TestPassword123!' },
    });

    expect(loginResponse.status()).toBe(200);
  });
});
