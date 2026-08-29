export type TicketUrgency = 'low' | 'medium' | 'high' | 'critical';

export function getUrgencyFromPriorityScore(score: number): TicketUrgency {
  if (!Number.isInteger(score) || score < 0 || score > 100) {
    throw new RangeError('Priority score must be an integer from 0 to 100');
  }

  if (score <= 39) {
    return 'low';
  }

  if (score <= 69) {
    return 'medium';
  }

  if (score <= 89) {
    return 'high';
  }

  return 'critical';
}
