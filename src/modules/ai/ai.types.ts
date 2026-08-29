export const AI_TRIAGE_CATEGORIES = [
  'payment',
  'refund',
  'account',
  'subscription',
  'technical',
  'billing',
  'security',
  'general',
  'other',
] as const;

export type AiTriageCategory = (typeof AI_TRIAGE_CATEGORIES)[number];

export type AiTriageInput = {
  customerIssueType: string;
  description: string;
};

export type AiTriageResult = {
  category: AiTriageCategory;
  priorityScore: number;
};

export interface AiTriageProvider {
  classifyTicket(input: AiTriageInput): Promise<AiTriageResult>;
}
