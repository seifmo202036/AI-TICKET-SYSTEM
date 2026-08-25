import { expect, test } from '@playwright/test';

import {
  cleanupE2eData,
  getTicketStatusHistory,
  seedUser,
  setTicketStatus,
  type SeededUser,
} from './helpers/db.helper.js';
import {
  expectApiError,
  API_PREFIX,
  login,
  type SessionCookies,
} from './helpers/api.helper.js';

const seededUserIds: Array<string | number> = [];
const createdTicketIds: Array<string | number> = [];

let customerA: SeededUser;
let customerB: SeededUser;
let agentA: SeededUser;
let agentB: SeededUser;

let customerACookies: SessionCookies;
let customerBCookies: SessionCookies;
let agentACookies: SessionCookies;
let agentBCookies: SessionCookies;

test.beforeAll(async ({ request }) => {
  customerA = await seedUser('e2e_tkt_customer_a', 'customer', 'active');
  customerB = await seedUser('e2e_tkt_customer_b', 'customer', 'active');
  agentA = await seedUser('e2e_tkt_agent_a', 'agent', 'active');
  agentB = await seedUser('e2e_tkt_agent_b', 'agent', 'active');

  seededUserIds.push(customerA.id, customerB.id, agentA.id, agentB.id);

  customerACookies = (await login(request, customerA.email)).cookies;
  customerBCookies = (await login(request, customerB.email)).cookies;
  agentACookies = (await login(request, agentA.email)).cookies;
  agentBCookies = (await login(request, agentB.email)).cookies;
});

test.afterAll(async () => {
  await cleanupE2eData(seededUserIds, createdTicketIds);
});

test.describe('ticket creation', () => {
  test('creates a ticket for the customer in triaging status', async ({
    request,
  }) => {
    const response = await request.post(`${API_PREFIX}/tickets/create`, {
      headers: { cookie: customerACookies.accessCookie },
      data: {
        customerIssueType: 'payment',
        description: 'I was charged twice for the same subscription.',
      },
    });

    expect(response.status()).toBe(201);

    const body = (await response.json()) as {
      message: string;
      ticket: { id: string; status: string; customer_id: string };
    };

    expect(body.message).toBe('Ticket created successfully');

    // New tickets wait for the AI worker to move them to open
    expect(body.ticket.status).toBe('triaging');
    expect(String(body.ticket.customer_id)).toBe(customerA.id);

    createdTicketIds.push(body.ticket.id);
  });

  test('rejects an invalid payload with 400 VALIDATION_ERROR', async ({
    request,
  }) => {
    const response = await request.post(`${API_PREFIX}/tickets/create`, {
      headers: { cookie: customerACookies.accessCookie },
      data: {
        customerIssueType: 'hacking',
        description: '',
      },
    });

    await expectApiError(response, 400, 'VALIDATION_ERROR');
  });

  test("lists the customer's own tickets", async ({ request }) => {
    const response = await request.get(`${API_PREFIX}/tickets`, {
      headers: { cookie: customerACookies.accessCookie },
    });

    expect(response.status()).toBe(200);

    const body = (await response.json()) as {
      tickets: Array<{ id: string; customer_id: string }>;
    };

    const ownTicket = body.tickets.find(
      (ticket) => String(ticket.customer_id) === customerA.id,
    );

    expect(ownTicket).toBeTruthy();
  });
});

test.describe('agent queue and claiming', () => {
  let ticketId: string;

  test.beforeAll(async ({ request }) => {
    const response = await request.post(`${API_PREFIX}/tickets/create`, {
      headers: { cookie: customerACookies.accessCookie },
      data: {
        customerIssueType: 'billing',
        description: 'Queue flow e2e ticket.',
      },
    });

    const body = (await response.json()) as { ticket: { id: string } };
    ticketId = body.ticket.id;
    createdTicketIds.push(ticketId);
  });

  test('queue is empty while the ticket is still triaging', async ({
    request,
  }) => {
    const response = await request.get(`${API_PREFIX}/tickets/queue`, {
      headers: { cookie: agentACookies.accessCookie },
    });

    expect(response.status()).toBe(200);

    const body = (await response.json()) as { tickets: Array<{ id: string }> };

    expect(body.tickets.find((ticket) => ticket.id === ticketId)).toBeUndefined();
  });

  test('queue shows the ticket once it is open', async ({ request }) => {
    // Stands in for the AI worker that opens triaged tickets
    await setTicketStatus(ticketId, 'open');

    const response = await request.get(`${API_PREFIX}/tickets/queue`, {
      headers: { cookie: agentACookies.accessCookie },
    });

    expect(response.status()).toBe(200);

    const body = (await response.json()) as { tickets: Array<{ id: string }> };

    expect(body.tickets.find((ticket) => ticket.id === ticketId)).toBeTruthy();
  });

  test('rejects claim with invalid ticket id param', async ({ request }) => {
    const response = await request.post(`${API_PREFIX}/tickets/abc/claim`, {
      headers: { cookie: agentACookies.accessCookie },
    });

    await expectApiError(response, 400, 'INVALID_TICKET_ID');
  });

  test('forbids customers from claiming tickets', async ({ request }) => {
    const response = await request.post(`${API_PREFIX}/tickets/${ticketId}/claim`, {
      headers: { cookie: customerACookies.accessCookie },
    });

    await expectApiError(response, 403, 'FORBIDDEN');
  });

  test('assigns the ticket to the first claiming agent', async ({ request }) => {
    const response = await request.post(`${API_PREFIX}/tickets/${ticketId}/claim`, {
      headers: { cookie: agentACookies.accessCookie },
    });

    expect(response.status()).toBe(200);

    const body = (await response.json()) as {
      message: string;
      ticket: { status: string; assigned_agent_id: string };
    };

    expect(body.message).toBe('Ticket claimed successfully');
    expect(body.ticket.status).toBe('assigned');
    expect(String(body.ticket.assigned_agent_id)).toBe(agentA.id);
  });

  test('a second agent cannot claim the same ticket', async ({ request }) => {
    const response = await request.post(`${API_PREFIX}/tickets/${ticketId}/claim`, {
      headers: { cookie: agentBCookies.accessCookie },
    });

    await expectApiError(response, 409, 'TICKET_NOT_CLAIMABLE');
  });

  test('shows the claimed ticket only in the owner assigned list', async ({
    request,
  }) => {
    const ownerResponse = await request.get(`${API_PREFIX}/tickets/assigned`, {
      headers: { cookie: agentACookies.accessCookie },
    });

    expect(ownerResponse.status()).toBe(200);

    const ownerBody = (await ownerResponse.json()) as {
      tickets: Array<{ id: string }>;
    };

    expect(ownerBody.tickets.find((ticket) => ticket.id === ticketId)).toBeTruthy();

    const otherResponse = await request.get(`${API_PREFIX}/tickets/assigned`, {
      headers: { cookie: agentBCookies.accessCookie },
    });

    const otherBody = (await otherResponse.json()) as {
      tickets: Array<{ id: string }>;
    };

    expect(otherBody.tickets.find((ticket) => ticket.id === ticketId)).toBeUndefined();
  });

  test('hides resolved tickets from other agents but keeps them for the owner', async ({
    request,
  }) => {
    // The owner can always see his ticket
    const ownerViewResponse = await request.get(`${API_PREFIX}/tickets/${ticketId}`, {
      headers: { cookie: agentACookies.accessCookie },
    });

    expect(ownerViewResponse.status()).toBe(200);

    // Another agent cannot open a foreign assigned ticket directly
    const otherViewResponse = await request.get(`${API_PREFIX}/tickets/${ticketId}`, {
      headers: { cookie: agentBCookies.accessCookie },
    });

    await expectApiError(otherViewResponse, 403, 'FORBIDDEN');
  });
});

test.describe('resolve flow', () => {
  let ticketId: string;

  test.beforeAll(async ({ request }) => {
    const response = await request.post(`${API_PREFIX}/tickets/create`, {
      headers: { cookie: customerACookies.accessCookie },
      data: {
        customerIssueType: 'technical',
        description: 'Resolve flow e2e ticket.',
      },
    });

    const body = (await response.json()) as { ticket: { id: string } };
    ticketId = body.ticket.id;
    createdTicketIds.push(ticketId);

    await setTicketStatus(ticketId, 'open');
    await request.post(`${API_PREFIX}/tickets/${ticketId}/claim`, {
      headers: { cookie: agentACookies.accessCookie },
    });
  });

  test('forbids an agent who is not assigned to the ticket', async ({
    request,
  }) => {
    const response = await request.post(`${API_PREFIX}/tickets/${ticketId}/resolve`, {
      headers: { cookie: agentBCookies.accessCookie },
    });

    await expectApiError(response, 403, 'FORBIDDEN');
  });

  test('resolves the ticket by the assigned agent', async ({ request }) => {
    const response = await request.post(`${API_PREFIX}/tickets/${ticketId}/resolve`, {
      headers: { cookie: agentACookies.accessCookie },
    });

    expect(response.status()).toBe(200);

    const body = (await response.json()) as {
      message: string;
      ticket: { status: string; resolved_at: string };
    };

    expect(body.message).toBe('Ticket resolved successfully');
    expect(body.ticket.status).toBe('resolved');
    expect(Boolean(body.ticket.resolved_at)).toBe(true);
  });

  test('refuses to resolve twice with 409', async ({ request }) => {
    const response = await request.post(`${API_PREFIX}/tickets/${ticketId}/resolve`, {
      headers: { cookie: agentACookies.accessCookie },
    });

    await expectApiError(response, 409, 'TICKET_NOT_RESOLVABLE');
  });
});

test.describe('close flow', () => {
  let ticketId: string;

  test.beforeAll(async ({ request }) => {
    const response = await request.post(`${API_PREFIX}/tickets/create`, {
      headers: { cookie: customerACookies.accessCookie },
      data: {
        customerIssueType: 'refund',
        description: 'Close flow e2e ticket.',
      },
    });

    const body = (await response.json()) as { ticket: { id: string } };
    ticketId = body.ticket.id;
    createdTicketIds.push(ticketId);

    await setTicketStatus(ticketId, 'open');
    await request.post(`${API_PREFIX}/tickets/${ticketId}/claim`, {
      headers: { cookie: agentACookies.accessCookie },
    });
    await request.post(`${API_PREFIX}/tickets/${ticketId}/resolve`, {
      headers: { cookie: agentACookies.accessCookie },
    });
  });

  test('cannot be closed before resolution', async ({ request }) => {
    // Separate ticket that is only claimed, never resolved
    const createResponse = await request.post(`${API_PREFIX}/tickets/create`, {
      headers: { cookie: customerACookies.accessCookie },
      data: {
        customerIssueType: 'general',
        description: 'Not resolved yet e2e ticket.',
      },
    });

    const createBody = (await createResponse.json()) as {
      ticket: { id: string };
    };
    const unresolvedTicketId = createBody.ticket.id;
    createdTicketIds.push(unresolvedTicketId);

    await setTicketStatus(unresolvedTicketId, 'open');
    await request.post(`${API_PREFIX}/tickets/${unresolvedTicketId}/claim`, {
      headers: { cookie: agentACookies.accessCookie },
    });

    const closeResponse = await request.post(
      `${API_PREFIX}/tickets/${unresolvedTicketId}/close`,
      { headers: { cookie: customerACookies.accessCookie } },
    );

    await expectApiError(closeResponse, 409, 'TICKET_NOT_CLOSABLE');
  });

  test('forbids closing another customer ticket', async ({ request }) => {
    const response = await request.post(`${API_PREFIX}/tickets/${ticketId}/close`, {
      headers: { cookie: customerBCookies.accessCookie },
    });

    await expectApiError(response, 403, 'FORBIDDEN');
  });

  test('closes the resolved ticket after customer confirmation', async ({
    request,
  }) => {
    const response = await request.post(`${API_PREFIX}/tickets/${ticketId}/close`, {
      headers: { cookie: customerACookies.accessCookie },
    });

    expect(response.status()).toBe(200);

    const body = (await response.json()) as {
      message: string;
      ticket: { status: string; closed_at: string };
    };

    expect(body.message).toBe('Ticket closed successfully');
    expect(body.ticket.status).toBe('closed');
    expect(Boolean(body.ticket.closed_at)).toBe(true);
  });

  test('refuses to close twice with 409', async ({ request }) => {
    const response = await request.post(`${API_PREFIX}/tickets/${ticketId}/close`, {
      headers: { cookie: customerACookies.accessCookie },
    });

    await expectApiError(response, 409, 'TICKET_NOT_CLOSABLE');
  });

  test('records the full status history chain', async () => {
    const history = await getTicketStatusHistory(ticketId);

    expect(history.map((row) => [row.oldStatus, row.newStatus])).toEqual([
      ['open', 'assigned'],
      ['assigned', 'resolved'],
      ['resolved', 'closed'],
    ]);
    expect(history[0]?.changedBy).toBe(agentA.id);
    expect(history[1]?.changedBy).toBe(agentA.id);
    expect(history[2]?.changedBy).toBe(customerA.id);
  });
});

test.describe('unauthenticated access', () => {
  test('requires authentication on every ticket route', async ({ request }) => {
    const queueResponse = await request.get(`${API_PREFIX}/tickets/queue`);

    await expectApiError(queueResponse, 401, 'AUTHENTICATION_REQUIRED');

    const createResponse = await request.post(`${API_PREFIX}/tickets/create`, {
      data: { customerIssueType: 'other', description: 'no auth' },
    });

    await expectApiError(createResponse, 401, 'AUTHENTICATION_REQUIRED');
  });
});
