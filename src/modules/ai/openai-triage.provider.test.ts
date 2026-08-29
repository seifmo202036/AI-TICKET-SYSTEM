import type OpenAI from 'openai';
import { describe, expect, it, vi } from 'vitest';

import type { AiConfiguration } from '../../config/env.js';
import { OpenAiTriageProvider } from './openai-triage.provider.js';

const configuration: AiConfiguration = {
  provider: 'openai',
  apiKey: 'test-api-key',
  baseUrl: 'https://api.groq.com/openai/v1',
  model: 'test-model',
  timeoutMs: 15000,
};

function createClient(response: unknown): Pick<OpenAI, 'responses'> {
  return {
    responses: {
      create: vi.fn().mockResolvedValue(response),
    },
  } as unknown as Pick<OpenAI, 'responses'>;
}

describe('OpenAiTriageProvider', () => {
  it('uses structured output and validates a successful result', async () => {
    const client = createClient({
      status: 'completed',
      output_text: '{"category":"security","priorityScore":96}',
    });
    const provider = new OpenAiTriageProvider(configuration, client);

    const result = await provider.classifyTicket({
      customerIssueType: 'general',
      description: 'Someone changed my email and password.',
    });

    expect(result).toEqual({ category: 'security', priorityScore: 96 });
    expect(client.responses.create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'test-model',
        max_output_tokens: 1024,
        text: expect.objectContaining({
          format: expect.objectContaining({
            type: 'json_schema',
            strict: true,
          }),
        }),
      }),
    );

    expect(client.responses.create).toHaveBeenCalledWith(
      expect.not.objectContaining({ store: expect.anything() }),
    );
  });

  it('rejects invalid provider output before it reaches the database', async () => {
    const provider = new OpenAiTriageProvider(
      configuration,
      createClient({
        status: 'completed',
        output_text: '{"category":"unknown","priorityScore":101}',
      }),
    );

    await expect(
      provider.classifyTicket({
        customerIssueType: 'general',
        description: 'Question',
      }),
    ).rejects.toThrow();
  });

  it('rejects incomplete provider responses', async () => {
    const provider = new OpenAiTriageProvider(
      configuration,
      createClient({ status: 'incomplete', output_text: '' }),
    );

    await expect(
      provider.classifyTicket({
        customerIssueType: 'general',
        description: 'Question',
      }),
    ).rejects.toThrow(/completed triage result/);
  });
});
