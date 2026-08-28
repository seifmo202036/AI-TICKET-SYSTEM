import { describe, expect, it } from 'vitest';

import {
  createMessageSchema,
  getMessagesQuerySchema,
} from './ticket-messages.validation.js';

describe('createMessageSchema', () => {
  it('trims a valid message body', () => {
    const message = createMessageSchema.parse({
      body: '  The issue is still happening.  ',
    });

    expect(message.body).toBe('The issue is still happening.');
  });

  it('allows an omitted body so an image-only message can be created', () => {
    expect(createMessageSchema.parse({})).toEqual({});
  });

  it.each([
    ['empty body', { body: '' }],
    ['whitespace-only body', { body: '   ' }],
    ['non-string body', { body: 123 }],
    ['unexpected property', { body: 'Hello', image: 'image.png' }],
  ])('rejects a %s', (_name, input) => {
    expect(createMessageSchema.safeParse(input).success).toBe(false);
  });

  it('rejects a body longer than 2,000 characters', () => {
    expect(
      createMessageSchema.safeParse({ body: 'a'.repeat(2001) }).success,
    ).toBe(false);
  });
});

describe('getMessagesQuerySchema', () => {
  it('uses a default limit of 50', () => {
    const query = getMessagesQuerySchema.parse({});

    expect(query).toEqual({ limit: 50 });
  });

  it('accepts a numeric limit and a positive message cursor', () => {
    const query = getMessagesQuerySchema.parse({
      limit: '25',
      beforeId: '180',
    });

    expect(query).toEqual({ limit: 25, beforeId: '180' });
  });

  it.each([
    ['zero limit', { limit: '0' }],
    ['limit above the maximum', { limit: '51' }],
    ['decimal limit', { limit: '1.5' }],
    ['non-numeric limit', { limit: 'many' }],
    ['zero cursor', { beforeId: '0' }],
    ['non-numeric cursor', { beforeId: 'message-180' }],
    ['unexpected query parameter', { page: '2' }],
  ])('rejects a %s', (_name, query) => {
    expect(getMessagesQuerySchema.safeParse(query).success).toBe(false);
  });
});
