import { describe, expect, test } from 'vitest';
import { providerConfigsFromEnv } from '../../src/infrastructure/llm/providers';

describe('providerConfigsFromEnv', () => {
  test('keeps the configured order and skips providers without a key', () => {
    const configs = providerConfigsFromEnv(
      { LLM_PROVIDERS: 'groq,gemini,openrouter', GEMINI_API_KEY: 'g', OPENROUTER_API_KEY: 'o' },
      30_000,
    );

    expect(configs.map((c) => c.name)).toEqual(['gemini', 'openrouter']);
    expect(configs[0]).toMatchObject({
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
      apiKey: 'g',
      timeoutMs: 30_000,
    });
  });

  test('defaults to gemini, groq, openrouter and honours model overrides', () => {
    const configs = providerConfigsFromEnv({ GROQ_API_KEY: 'k', GROQ_MODEL: 'qwen/qwen3.8-27b' }, 1_000);

    expect(configs).toHaveLength(1);
    expect(configs[0]).toMatchObject({ name: 'groq', model: 'qwen/qwen3.8-27b' });
  });

  test('returns nothing when no keys are set, which disables AI review', () => {
    expect(providerConfigsFromEnv({}, 1_000)).toEqual([]);
  });

  test('supports a custom OpenAI-compatible endpoint such as a local model', () => {
    const configs = providerConfigsFromEnv(
      {
        LLM_PROVIDERS: 'custom',
        CUSTOM_LLM_BASE_URL: 'http://localhost:11434/v1/',
        CUSTOM_LLM_MODEL: 'llama3.3',
      },
      1_000,
    );

    expect(configs[0]).toMatchObject({
      name: 'custom',
      baseUrl: 'http://localhost:11434/v1',
      model: 'llama3.3',
      outputMode: 'json_object',
    });
  });

  test('rejects an unknown provider name instead of silently ignoring it', () => {
    expect(() => providerConfigsFromEnv({ LLM_PROVIDERS: 'gemini,chatgpt' }, 1_000)).toThrow(/chatgpt/);
  });
});
