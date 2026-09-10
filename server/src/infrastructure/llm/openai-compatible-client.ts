import type { z } from 'zod';
import { parseJsonOutput } from '../../evaluation/llm/json-output';
import { LlmError, type LlmClient, type LlmRequest, type LlmResult } from '../../evaluation/llm/llm-client';

export interface ProviderConfig {
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  /** json_schema: provider enforces the schema; json_object: valid JSON only, schema is in the prompt. */
  outputMode: 'json_schema' | 'json_object';
  timeoutMs: number;
  /** Provider-specific request fields, e.g. { reasoning_effort: 'low' }. */
  extraBody?: Record<string, unknown>;
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

const MAX_ERROR_DETAIL = 240;

/**
 * One adapter for every OpenAI-compatible chat endpoint (Gemini, Groq,
 * OpenRouter, local models). It classifies HTTP failures into LlmError kinds
 * that drive fallback and retry, and makes one repair attempt when the reply
 * does not match the schema.
 */
export class OpenAiCompatibleClient implements LlmClient {
  constructor(
    private readonly config: ProviderConfig,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  async completeJson<T>(request: LlmRequest, schema: z.ZodType<T>): Promise<LlmResult<T>> {
    const started = performance.now();
    const messages: ChatMessage[] = [
      { role: 'system', content: request.system },
      { role: 'user', content: request.user },
    ];

    const first = await this.chat(messages, request);
    let parsed = parseJsonOutput(first, schema);
    if (!parsed.ok) {
      const second = await this.chat(
        [
          ...messages,
          { role: 'assistant', content: first },
          {
            role: 'user',
            content: `Your previous reply could not be used: ${parsed.error}. Reply again with only the corrected JSON object, with no prose and no code fences.`,
          },
        ],
        request,
      );
      parsed = parseJsonOutput(second, schema);
      if (!parsed.ok) {
        throw new LlmError('invalid_output', `${this.config.name} returned unusable output: ${parsed.error}`);
      }
    }

    return {
      data: parsed.data,
      provider: this.config.name,
      model: this.config.model,
      latencyMs: Math.round(performance.now() - started),
    };
  }

  private async chat(messages: ChatMessage[], request: LlmRequest): Promise<string> {
    const body = {
      model: this.config.model,
      messages,
      temperature: request.temperature,
      ...(request.maxOutputTokens ? { max_tokens: request.maxOutputTokens } : {}),
      response_format:
        this.config.outputMode === 'json_schema'
          ? { type: 'json_schema', json_schema: { name: request.schemaName, schema: request.jsonSchema } }
          : { type: 'json_object' },
      ...this.config.extraBody,
    };

    let response: Response;
    try {
      response = await this.fetchFn(`${this.config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.config.timeoutMs),
      });
    } catch (error) {
      const name = (error as Error).name;
      if (name === 'TimeoutError' || name === 'AbortError') {
        throw new LlmError('timeout', `${this.config.name} did not respond within ${this.config.timeoutMs} ms`);
      }
      throw new LlmError('network', `${this.config.name} could not be reached: ${(error as Error).message}`);
    }

    if (!response.ok) throw await this.toError(response);

    const payload = (await response.json().catch(() => null)) as {
      choices?: { message?: { content?: unknown } }[];
    } | null;
    const content = payload?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || content.trim().length === 0) {
      throw new LlmError('invalid_output', `${this.config.name} returned an empty completion`);
    }
    return content;
  }

  private async toError(response: Response): Promise<LlmError> {
    const raw = await response.text().catch(() => '');
    const detail = this.redact(raw).slice(0, MAX_ERROR_DETAIL);
    const prefix = `${this.config.name} responded ${response.status}`;
    const status = response.status;
    if (status === 429) {
      return new LlmError('rate_limited', `${prefix}: rate limited`, {
        retryAfterMs: retryAfterMs(response.headers.get('retry-after'), raw),
      });
    }
    // Gemini rejects a bad key with 400 INVALID_ARGUMENT rather than 401.
    if (status === 401 || status === 403 || (status === 400 && /api[\s_-]?key/i.test(raw))) {
      return new LlmError('auth', `${prefix}: check the API key`);
    }
    if (status === 408) return new LlmError('timeout', `${prefix}: request timeout`);
    if (status >= 500) return new LlmError('server', `${prefix}: ${detail}`);
    return new LlmError('bad_request', `${prefix}: ${detail}`);
  }

  private redact(text: string): string {
    return this.config.apiKey ? text.split(this.config.apiKey).join('***') : text;
  }
}

/** Retry delay from a Retry-After header (seconds or HTTP date) or a Gemini-style `retryDelay: "23s"`. */
function retryAfterMs(header: string | null, body: string): number | null {
  if (header) {
    const seconds = Number(header);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
    const date = Date.parse(header);
    if (!Number.isNaN(date)) return Math.max(0, date - Date.now());
  }
  const match = /"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/.exec(body);
  return match ? Math.round(Number(match[1]) * 1000) : null;
}
