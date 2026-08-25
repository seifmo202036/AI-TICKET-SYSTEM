import { describe, expect, it } from 'vitest';

import {
  createTicketSchema,
  ticketIdParamsSchema,
} from './tickets.validation.js';

const validTicket = {
  customerIssueType: 'payment',
  description: 'I was charged twice for the same subscription.',
};

describe('createTicketSchema', () => {
  it.each([
    'payment',
    'refund',
    'account',
    'subscription',
    'technical',
    'billing',
    'security',
    'general',
    'other',
  ])('accepts a valid ticket with issue type: %s', (customerIssueType) => {
    const result = createTicketSchema.parse({
      ...validTicket,
      customerIssueType,
    });

    expect(result.customerIssueType).toBe(customerIssueType);
  });

  it('trims the description', () => {
    const result = createTicketSchema.parse({
      customerIssueType: 'payment',
      description: '   I was charged twice.   ',
    });

    expect(result.description).toBe('I was charged twice.');
  });

  it('rejects an empty description', () => {
    expect(
      createTicketSchema.safeParse({ ...validTicket, description: '' }).success,
    ).toBe(false);
  });

  it('rejects a whitespace-only description', () => {
    expect(
      createTicketSchema.safeParse({ ...validTicket, description: '   ' })
        .success,
    ).toBe(false);
  });

  it('rejects an unknown issue type', () => {
    expect(
      createTicketSchema.safeParse({
        ...validTicket,
        customerIssueType: 'hacking',
      }).success,
    ).toBe(false);
  });

  it('rejects a missing description', () => {
    const { description: _description, ...withoutDescription } = validTicket;

    expect(createTicketSchema.safeParse(withoutDescription).success).toBe(
      false,
    );
  });

  it('rejects unknown properties', () => {
    expect(
      createTicketSchema.safeParse({ ...validTicket, status: 'closed' })
        .success,
    ).toBe(false);
  });
});

describe('ticketIdParamsSchema', () => {
  it('accepts a numeric ticket id', () => {
    const result = ticketIdParamsSchema.parse({ ticketId: '42' });

    expect(result.ticketId).toBe('42');
  });

  it.each(['abc', '', '12ab', '-1', '1.5', 'ticket 1', '%20'])(
    'rejects a malformed ticket id: %s',
    (ticketId) => {
      expect(ticketIdParamsSchema.safeParse({ ticketId }).success).toBe(false);
    },
  );

  it('rejects unknown properties', () => {
    expect(
      ticketIdParamsSchema.safeParse({ ticketId: '42', extra: 1 }).success,
    ).toBe(false);
  });
});
