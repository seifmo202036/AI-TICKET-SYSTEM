import { describe, expect, it } from 'vitest';

import { getUrgencyFromPriorityScore } from './ai.service.js';
import { aiTriageResultSchema } from './ai.validation.js';

describe('AI triage validation', () => {
  it('accepts the expected category and priority score', () => {
    expect(
      aiTriageResultSchema.parse({
        category: 'security',
        priorityScore: 96,
      }),
    ).toEqual({ category: 'security', priorityScore: 96 });
  });

  it('rejects malformed provider output', () => {
    expect(() =>
      aiTriageResultSchema.parse({
        category: 'unknown',
        priorityScore: 101,
      }),
    ).toThrow();
  });
});

describe('getUrgencyFromPriorityScore', () => {
  it.each([
    [0, 'low'],
    [39, 'low'],
    [40, 'medium'],
    [69, 'medium'],
    [70, 'high'],
    [89, 'high'],
    [90, 'critical'],
    [100, 'critical'],
  ] as const)('maps priority score %i to %s urgency', (score, urgency) => {
    expect(getUrgencyFromPriorityScore(score)).toBe(urgency);
  });

  it('rejects an invalid priority score', () => {
    expect(() => getUrgencyFromPriorityScore(100.5)).toThrow(RangeError);
  });
});
