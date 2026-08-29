import { expect, test } from '@playwright/test';

import {
  cleanupE2eData,
  getTicketStatusHistory,
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
  test('creates an immediately open ticket when AI is disabled', async ({
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
      ticket: {
        id: string;
        status: string;
        ai_status: string;
        customer_id: string;
      };
    };

    expect(body.message).toBe('Ticket created successfully');

    expect(body.ticket.status).toBe('open');
    expect(body.ticket.ai_status).toBe('disabled');
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

  test('queue shows a newly created ticket immediately when AI is disabled', async ({
    request,
  }) => {
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
    const response = await request.post(
      `${API_PREFIX}/tickets/${ticketId}/claim`,
      {
        headers: { cookie: customerACookies.accessCookie },
      },
    );

    await expectApiError(response, 403, 'FORBIDDEN');
  });

  test('assigns the ticket to the first claiming agent', async ({
    request,
  }) => {
    const response = await request.post(
      `${API_PREFIX}/tickets/${ticketId}/claim`,
      {
        headers: { cookie: agentACookies.accessCookie },
      },
    );

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
    const response = await request.post(
      `${API_PREFIX}/tickets/${ticketId}/claim`,
      {
        headers: { cookie: agentBCookies.accessCookie },
      },
    );

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

    expect(
      ownerBody.tickets.find((ticket) => ticket.id === ticketId),
    ).toBeTruthy();

    const otherResponse = await request.get(`${API_PREFIX}/tickets/assigned`, {
      headers: { cookie: agentBCookies.accessCookie },
    });

    const otherBody = (await otherResponse.json()) as {
      tickets: Array<{ id: string }>;
    };

    expect(
      otherBody.tickets.find((ticket) => ticket.id === ticketId),
    ).toBeUndefined();
  });

  test('hides resolved tickets from other agents but keeps them for the owner', async ({
    request,
  }) => {
    // The owner can always see his ticket
    const ownerViewResponse = await request.get(
      `${API_PREFIX}/tickets/${ticketId}`,
      {
        headers: { cookie: agentACookies.accessCookie },
      },
    );

    expect(ownerViewResponse.status()).toBe(200);

    // Another agent cannot open a foreign assigned ticket directly
    const otherViewResponse = await request.get(
      `${API_PREFIX}/tickets/${ticketId}`,
      {
        headers: { cookie: agentBCookies.accessCookie },
      },
    );

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

    await request.post(`${API_PREFIX}/tickets/${ticketId}/claim`, {
      headers: { cookie: agentACookies.accessCookie },
    });
  });

  test('forbids an agent who is not assigned to the ticket', async ({
    request,
  }) => {
    const response = await request.post(
      `${API_PREFIX}/tickets/${ticketId}/resolve`,
      {
        headers: { cookie: agentBCookies.accessCookie },
      },
    );

    await expectApiError(response, 403, 'FORBIDDEN');
  });

  test('resolves the ticket by the assigned agent', async ({ request }) => {
    const response = await request.post(
      `${API_PREFIX}/tickets/${ticketId}/resolve`,
      {
        headers: { cookie: agentACookies.accessCookie },
      },
    );

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
    const response = await request.post(
      `${API_PREFIX}/tickets/${ticketId}/resolve`,
      {
        headers: { cookie: agentACookies.accessCookie },
      },
    );

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
    const response = await request.post(
      `${API_PREFIX}/tickets/${ticketId}/close`,
      {
        headers: { cookie: customerBCookies.accessCookie },
      },
    );

    await expectApiError(response, 403, 'FORBIDDEN');
  });

  test('closes the resolved ticket after customer confirmation', async ({
    request,
  }) => {
    const response = await request.post(
      `${API_PREFIX}/tickets/${ticketId}/close`,
      {
        headers: { cookie: customerACookies.accessCookie },
      },
    );

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
    const response = await request.post(
      `${API_PREFIX}/tickets/${ticketId}/close`,
      {
        headers: { cookie: customerACookies.accessCookie },
      },
    );

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

test.describe('ticket messages', () => {
  let ticketId: string;
  let customerMessageId: string;
  let agentMessageId: string;
  let followUpMessageId: string;

  test.beforeAll(async ({ request }) => {
    const response = await request.post(`${API_PREFIX}/tickets/create`, {
      headers: { cookie: customerACookies.accessCookie },
      data: {
        customerIssueType: 'technical',
        description: 'Ticket messaging e2e ticket.',
      },
    });

    expect(response.status()).toBe(201);

    const body = (await response.json()) as { ticket: { id: string } };
    ticketId = body.ticket.id;
    createdTicketIds.push(ticketId);
  });

  test('allows the customer to send a text message immediately after ticket creation', async ({
    request,
  }) => {
    const response = await request.post(
      `${API_PREFIX}/tickets/${ticketId}/messages`,
      {
        headers: { cookie: customerACookies.accessCookie },
        data: { body: 'I can provide more details if needed.' },
      },
    );

    expect(response.status()).toBe(201);

    const body = (await response.json()) as {
      message: {
        id: string;
        ticketId: string;
        sender: { id: string; userName: string; role: string };
        body: string;
        attachments: unknown[];
        createdAt: string;
      };
    };

    customerMessageId = body.message.id;

    expect(body.message.ticketId).toBe(ticketId);
    expect(body.message.sender).toEqual({
      id: customerA.id,
      userName: customerA.userName,
      role: 'customer',
    });
    expect(body.message.body).toBe('I can provide more details if needed.');
    expect(body.message.attachments).toEqual([]);
    expect(Boolean(body.message.createdAt)).toBe(true);
  });

  test('forbids another customer from sending a message', async ({
    request,
  }) => {
    const response = await request.post(
      `${API_PREFIX}/tickets/${ticketId}/messages`,
      {
        headers: { cookie: customerBCookies.accessCookie },
        data: { body: 'I should not be able to send this.' },
      },
    );

    await expectApiError(response, 403, 'FORBIDDEN');
  });

  test('forbids an unassigned agent from reading or sending messages', async ({
    request,
  }) => {
    const getResponse = await request.get(
      `${API_PREFIX}/tickets/${ticketId}/messages`,
      { headers: { cookie: agentACookies.accessCookie } },
    );

    await expectApiError(getResponse, 403, 'FORBIDDEN');

    const postResponse = await request.post(
      `${API_PREFIX}/tickets/${ticketId}/messages`,
      {
        headers: { cookie: agentACookies.accessCookie },
        data: { body: 'I should not be able to send this yet.' },
      },
    );

    await expectApiError(postResponse, 403, 'FORBIDDEN');
  });

  test('allows the agent to claim the ticket and send a message', async ({
    request,
  }) => {
    const claimResponse = await request.post(
      `${API_PREFIX}/tickets/${ticketId}/claim`,
      { headers: { cookie: agentACookies.accessCookie } },
    );

    expect(claimResponse.status()).toBe(200);

    const response = await request.post(
      `${API_PREFIX}/tickets/${ticketId}/messages`,
      {
        headers: { cookie: agentACookies.accessCookie },
        data: { body: 'I am reviewing the issue now.' },
      },
    );

    expect(response.status()).toBe(201);

    const body = (await response.json()) as {
      message: {
        id: string;
        sender: { id: string; role: string };
        body: string;
      };
    };

    agentMessageId = body.message.id;

    expect(body.message.sender).toMatchObject({
      id: agentA.id,
      role: 'agent',
    });
    expect(body.message.body).toBe('I am reviewing the issue now.');
  });

  test('validates the message body and rejects unknown tickets', async ({
    request,
  }) => {
    const invalidBodyResponse = await request.post(
      `${API_PREFIX}/tickets/${ticketId}/messages`,
      {
        headers: { cookie: customerACookies.accessCookie },
        data: { body: '   ' },
      },
    );

    await expectApiError(invalidBodyResponse, 400, 'VALIDATION_ERROR');

    const missingTicketResponse = await request.post(
      `${API_PREFIX}/tickets/9223372036854775807/messages`,
      {
        headers: { cookie: customerACookies.accessCookie },
        data: { body: 'This ticket does not exist.' },
      },
    );

    await expectApiError(missingTicketResponse, 404, 'TICKET_NOT_FOUND');
  });

  test('rejects empty messages and invalid image uploads before storage access', async ({
    request,
  }) => {
    const emptyMessageResponse = await request.post(
      `${API_PREFIX}/tickets/${ticketId}/messages`,
      {
        headers: { cookie: customerACookies.accessCookie },
        data: {},
      },
    );

    await expectApiError(emptyMessageResponse, 400, 'EMPTY_MESSAGE');

    const invalidImageResponse = await request.post(
      `${API_PREFIX}/tickets/${ticketId}/messages`,
      {
        headers: { cookie: customerACookies.accessCookie },
        multipart: {
          image: {
            name: 'not-supported.gif',
            mimeType: 'image/gif',
            buffer: Buffer.from('gif data'),
          },
        },
      },
    );

    await expectApiError(invalidImageResponse, 400, 'INVALID_IMAGE_TYPE');

    const oversizedImageResponse = await request.post(
      `${API_PREFIX}/tickets/${ticketId}/messages`,
      {
        headers: { cookie: customerACookies.accessCookie },
        multipart: {
          image: {
            name: 'too-large.png',
            mimeType: 'image/png',
            buffer: Buffer.alloc(5 * 1024 * 1024 + 1),
          },
        },
      },
    );

    await expectApiError(oversizedImageResponse, 400, 'IMAGE_TOO_LARGE');
  });

  test('returns the customer conversation in chronological order with a cursor', async ({
    request,
  }) => {
    const followUpResponse = await request.post(
      `${API_PREFIX}/tickets/${ticketId}/messages`,
      {
        headers: { cookie: customerACookies.accessCookie },
        data: { body: 'The problem happens when I select the payment button.' },
      },
    );

    expect(followUpResponse.status()).toBe(201);

    const followUpBody = (await followUpResponse.json()) as {
      message: { id: string };
    };
    followUpMessageId = followUpBody.message.id;

    const response = await request.get(
      `${API_PREFIX}/tickets/${ticketId}/messages?limit=2`,
      { headers: { cookie: customerACookies.accessCookie } },
    );

    expect(response.status()).toBe(200);

    const body = (await response.json()) as {
      messages: Array<{ id: string; body: string }>;
      pagination: { limit: number; nextBeforeId: string | null };
    };

    expect(body.messages.map((message) => message.id)).toEqual([
      agentMessageId,
      followUpMessageId,
    ]);
    expect(body.pagination).toEqual({
      limit: 2,
      nextBeforeId: agentMessageId,
    });
  });

  test('returns the next older page for the cursor and lets the assigned agent read it', async ({
    request,
  }) => {
    const customerPageResponse = await request.get(
      `${API_PREFIX}/tickets/${ticketId}/messages?limit=2&beforeId=${agentMessageId}`,
      { headers: { cookie: customerACookies.accessCookie } },
    );

    expect(customerPageResponse.status()).toBe(200);

    const customerPage = (await customerPageResponse.json()) as {
      messages: Array<{ id: string }>;
      pagination: { limit: number; nextBeforeId: string | null };
    };

    expect(customerPage.messages.map((message) => message.id)).toEqual([
      customerMessageId,
    ]);
    expect(customerPage.pagination).toEqual({
      limit: 2,
      nextBeforeId: null,
    });

    const agentResponse = await request.get(
      `${API_PREFIX}/tickets/${ticketId}/messages`,
      { headers: { cookie: agentACookies.accessCookie } },
    );

    expect(agentResponse.status()).toBe(200);

    const agentBody = (await agentResponse.json()) as {
      messages: Array<{ id: string }>;
    };

    expect(agentBody.messages.map((message) => message.id)).toEqual([
      customerMessageId,
      agentMessageId,
      followUpMessageId,
    ]);
  });

  test('forbids another agent from reading or sending messages', async ({
    request,
  }) => {
    const getResponse = await request.get(
      `${API_PREFIX}/tickets/${ticketId}/messages`,
      { headers: { cookie: agentBCookies.accessCookie } },
    );

    await expectApiError(getResponse, 403, 'FORBIDDEN');

    const postResponse = await request.post(
      `${API_PREFIX}/tickets/${ticketId}/messages`,
      {
        headers: { cookie: agentBCookies.accessCookie },
        data: { body: 'I should not be able to send this.' },
      },
    );

    await expectApiError(postResponse, 403, 'FORBIDDEN');
  });

  test('rejects invalid query parameters and unknown tickets', async ({
    request,
  }) => {
    const invalidQueryResponse = await request.get(
      `${API_PREFIX}/tickets/${ticketId}/messages?limit=51`,
      { headers: { cookie: customerACookies.accessCookie } },
    );

    await expectApiError(invalidQueryResponse, 400, 'VALIDATION_ERROR');

    const missingTicketResponse = await request.get(
      `${API_PREFIX}/tickets/9223372036854775807/messages`,
      { headers: { cookie: customerACookies.accessCookie } },
    );

    await expectApiError(missingTicketResponse, 404, 'TICKET_NOT_FOUND');
  });

  test('allows messages while resolved and makes closed tickets read-only', async ({
    request,
  }) => {
    const resolveResponse = await request.post(
      `${API_PREFIX}/tickets/${ticketId}/resolve`,
      { headers: { cookie: agentACookies.accessCookie } },
    );

    expect(resolveResponse.status()).toBe(200);

    const resolvedMessageResponse = await request.post(
      `${API_PREFIX}/tickets/${ticketId}/messages`,
      {
        headers: { cookie: customerACookies.accessCookie },
        data: { body: 'Thank you. I have one final question.' },
      },
    );

    expect(resolvedMessageResponse.status()).toBe(201);

    const closeResponse = await request.post(
      `${API_PREFIX}/tickets/${ticketId}/close`,
      { headers: { cookie: customerACookies.accessCookie } },
    );

    expect(closeResponse.status()).toBe(200);

    const closedMessageResponse = await request.post(
      `${API_PREFIX}/tickets/${ticketId}/messages`,
      {
        headers: { cookie: customerACookies.accessCookie },
        data: { body: 'This message should be rejected.' },
      },
    );

    await expectApiError(closedMessageResponse, 409, 'TICKET_CLOSED');

    const closedConversationResponse = await request.get(
      `${API_PREFIX}/tickets/${ticketId}/messages`,
      { headers: { cookie: customerACookies.accessCookie } },
    );

    expect(closedConversationResponse.status()).toBe(200);
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

    const messagesResponse = await request.get('/api/v1/tickets/1/messages');

    await expectApiError(messagesResponse, 401, 'AUTHENTICATION_REQUIRED');
  });
});
