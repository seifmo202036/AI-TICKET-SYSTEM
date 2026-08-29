import { z } from 'zod';

import { AI_TRIAGE_CATEGORIES } from './ai.types.js';

export const aiTriageResultSchema = z
  .object({
    category: z.enum(AI_TRIAGE_CATEGORIES),
    priorityScore: z.number().int().min(0).max(100),
  })
  .strict();
