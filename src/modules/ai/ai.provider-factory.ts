import { getAiConfiguration } from '../../config/env.js';
import { OpenAiTriageProvider } from './openai-triage.provider.js';
import type { AiTriageProvider } from './ai.types.js';

export function createAiTriageProvider(): AiTriageProvider {
  const configuration = getAiConfiguration();

  switch (configuration.provider) {
    case 'openai':
      return new OpenAiTriageProvider(configuration);
  }
}
