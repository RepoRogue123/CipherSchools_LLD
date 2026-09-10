import type { ProviderConfig } from './openai-compatible-client';

interface ProviderPreset {
  baseUrl: string;
  keyEnv: string;
  modelEnv: string;
  defaultModel: string;
  outputMode: ProviderConfig['outputMode'];
  extraBody?: Record<string, unknown>;
}

/**
 * Free-tier friendly presets. All three expose OpenAI-compatible endpoints, so a
 * single client adapter covers them. Model ids change often and can be
 * overridden per provider through the *_MODEL variables.
 */
const PRESETS: Record<string, ProviderPreset> = {
  gemini: {
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    keyEnv: 'GEMINI_API_KEY',
    modelEnv: 'GEMINI_MODEL',
    defaultModel: 'gemini-2.5-flash',
    outputMode: 'json_schema',
    extraBody: { reasoning_effort: 'low' },
  },
  groq: {
    baseUrl: 'https://api.groq.com/openai/v1',
    keyEnv: 'GROQ_API_KEY',
    modelEnv: 'GROQ_MODEL',
    defaultModel: 'openai/gpt-oss-120b',
    outputMode: 'json_schema',
  },
  openrouter: {
    baseUrl: 'https://openrouter.ai/api/v1',
    keyEnv: 'OPENROUTER_API_KEY',
    modelEnv: 'OPENROUTER_MODEL',
    defaultModel: 'nvidia/nemotron-3-super-120b-a12b:free',
    outputMode: 'json_object',
  },
};

export const KNOWN_PROVIDERS = [...Object.keys(PRESETS), 'custom'];
const DEFAULT_ORDER = 'gemini,groq,openrouter';

type Env = Record<string, string | undefined>;

/** Builds the ordered provider list from environment variables; providers without credentials are skipped. */
export function providerConfigsFromEnv(env: Env, timeoutMs: number): ProviderConfig[] {
  const order = (env.LLM_PROVIDERS ?? DEFAULT_ORDER)
    .split(',')
    .map((name) => name.trim().toLowerCase())
    .filter(Boolean);
  const unknown = order.filter((name) => !KNOWN_PROVIDERS.includes(name));
  if (unknown.length > 0) {
    throw new Error(`Unknown LLM provider(s) in LLM_PROVIDERS: ${unknown.join(', ')}. Known: ${KNOWN_PROVIDERS.join(', ')}.`);
  }

  const configs: ProviderConfig[] = [];
  for (const name of order) {
    if (name === 'custom') {
      const baseUrl = env.CUSTOM_LLM_BASE_URL?.trim();
      const model = env.CUSTOM_LLM_MODEL?.trim();
      if (!baseUrl || !model) continue;
      configs.push({
        name,
        baseUrl: baseUrl.replace(/\/+$/, ''),
        apiKey: env.CUSTOM_LLM_API_KEY?.trim() ?? '',
        model,
        outputMode: env.CUSTOM_LLM_OUTPUT_MODE === 'json_schema' ? 'json_schema' : 'json_object',
        timeoutMs,
      });
      continue;
    }
    const preset = PRESETS[name]!;
    const apiKey = env[preset.keyEnv]?.trim();
    if (!apiKey) continue;
    configs.push({
      name,
      baseUrl: preset.baseUrl,
      apiKey,
      model: env[preset.modelEnv]?.trim() || preset.defaultModel,
      outputMode: preset.outputMode,
      timeoutMs,
      ...(preset.extraBody ? { extraBody: preset.extraBody } : {}),
    });
  }
  return configs;
}
