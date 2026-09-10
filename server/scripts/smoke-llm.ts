/**
 * Checks every configured LLM provider with one small structured-output call.
 *   npm run smoke:llm                 # test each provider's key, model and JSON mode
 *   npm run smoke:llm -- --list-models  # also list the model ids each key can use
 */
import { z } from 'zod';
import { OpenAiCompatibleClient } from '../src/infrastructure/llm/openai-compatible-client';
import { loadEnvironment } from './shared';

const { providers } = loadEnvironment();
if (providers.length === 0) {
  console.log('No LLM provider configured. Set GEMINI_API_KEY, GROQ_API_KEY or OPENROUTER_API_KEY in .env.');
  process.exit(1);
}

const schema = z.object({ verdict: z.enum(['ok']), reason: z.string() });
let failures = 0;

for (const provider of providers) {
  process.stdout.write(`${provider.name.padEnd(11)} ${provider.model.padEnd(42)} `);
  try {
    const result = await new OpenAiCompatibleClient(provider).completeJson(
      {
        system: 'Reply with a JSON object only.',
        user: 'Return {"verdict": "ok", "reason": "<five words on why interfaces help extensibility>"}.',
        schemaName: 'smoke_check',
        jsonSchema: {
          type: 'object',
          properties: { verdict: { type: 'string', enum: ['ok'] }, reason: { type: 'string' } },
          required: ['verdict', 'reason'],
        },
        temperature: 0,
      },
      schema,
    );
    console.log(`OK in ${result.latencyMs} ms: "${result.data.reason}"`);
  } catch (error) {
    failures += 1;
    console.log(`FAILED: ${(error as Error).message}`);
  }

  if (process.argv.includes('--list-models')) {
    try {
      const response = await fetch(`${provider.baseUrl}/models`, {
        headers: { authorization: `Bearer ${provider.apiKey}` },
      });
      const body = (await response.json()) as { data?: { id: string }[] };
      const ids = (body.data ?? []).map((m) => m.id.replace(/^models\//, ''));
      console.log(`  ${ids.length} models available: ${ids.slice(0, 40).join(', ')}${ids.length > 40 ? ', …' : ''}`);
    } catch (error) {
      console.log(`  could not list models: ${(error as Error).message}`);
    }
  }
}

process.exit(failures > 0 ? 1 : 0);
