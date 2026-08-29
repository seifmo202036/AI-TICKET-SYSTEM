import OpenAI from 'openai';

import type { AiConfiguration } from '../../config/env.js';
import { AI_TRIAGE_INSTRUCTIONS, buildAiTriageInput } from './ai.prompt.js';
import type {
  AiTriageInput,
  AiTriageProvider,
  AiTriageResult,
} from './ai.types.js';
import { aiTriageResultSchema } from './ai.validation.js';

const AI_TRIAGE_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    category: {
      type: 'string',
      enum: [
        'payment',
        'refund',
        'account',
        'subscription',
        'technical',
        'billing',
        'security',
        'general',
        'other',
      ],
    },
    priorityScore: {
      type: 'integer',
      minimum: 0,
      maximum: 100,
    },
  },
  required: ['category', 'priorityScore'],
} as const;

export class OpenAiTriageProvider implements AiTriageProvider {
  private readonly client: Pick<OpenAI, 'responses'>;

  constructor(
    private readonly configuration: AiConfiguration,
    client?: Pick<OpenAI, 'responses'>,
  ) {
    this.client =
      client ??
      new OpenAI({
        apiKey: configuration.apiKey,
        baseURL: configuration.baseUrl,
        timeout: configuration.timeoutMs,
        maxRetries: 0,
      });
  }

  async classifyTicket(input: AiTriageInput): Promise<AiTriageResult> {
    const response = await this.client.responses.create({
      model: this.configuration.model,
      instructions: AI_TRIAGE_INSTRUCTIONS,
      input: buildAiTriageInput(input),
      max_output_tokens: 1024,
      text: {
        format: {
          type: 'json_schema',
          name: 'ai_ticket_triage',
          strict: true,
          schema: AI_TRIAGE_JSON_SCHEMA,
        },
      },
    });

    if (response.status !== 'completed' || !response.output_text) {
      throw new Error('AI provider did not return a completed triage result');
    }

    let rawResult: unknown;

    try {
      rawResult = JSON.parse(response.output_text);
    } catch {
      throw new Error('AI provider returned invalid JSON');
    }

    return aiTriageResultSchema.parse(rawResult);
  }
}
