import { describe, expect, test } from 'vitest';
import { z } from 'zod';
import { LlmError, type LlmRequest } from '../../src/evaluation/llm/llm-client';
import {
  OpenAiCompatibleClient,
  type ProviderConfig,
} from '../../src/infrastructure/llm/openai-compatible-client';

const schema = z.object({ answer: z.string(), score: z.number().int().min(1).max(4) });

const request: LlmRequest = {
  system: 'You are a reviewer.',
  user: 'Review this.',
  schemaName: 'review',
  jsonSchema: { type: 'object', properties: { answer: { type: 'string' } } },
  temperature: 0.2,
};

const config: ProviderConfig = {
  name: 'gemini',
  baseUrl: 'https://llm.example/v1',
  apiKey: 'secret-key',
  model: 'model-x',
  outputMode: 'json_schema',
  timeoutMs: 1_000,
};

interface Call {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

function fakeFetch(...replies: Array<Response | Error>) {
  const calls: Call[] = [];
  const fetchFn = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({
      url: String(url),
      headers: init?.headers as Record<string, string>,
      body: JSON.parse(String(init?.body)),
    });
    const next = replies.shift();
    if (!next) throw new Error('unexpected extra request');
    if (next instanceof Error) throw next;
    return next;
  }) as typeof fetch;
  return { fetchFn, calls };
}

function completion(content: string): Response {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function httpError(status: number, body = '{}', headers: Record<string, string> = {}): Response {
  return new Response(body, { status, headers });
}

async function capture(promise: Promise<unknown>): Promise<LlmError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof LlmError) return error;
    throw error;
  }
  throw new Error('expected an LlmError');
}

describe('OpenAiCompatibleClient request', () => {
  test('posts a chat completion with the model, messages and a JSON-schema response format', async () => {
    const { fetchFn, calls } = fakeFetch(completion('{"answer":"ok","score":3}'));

    await new OpenAiCompatibleClient(config, fetchFn).completeJson(request, schema);

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe('https://llm.example/v1/chat/completions');
    expect(calls[0]!.headers.authorization).toBe('Bearer secret-key');
    expect(calls[0]!.body).toMatchObject({
      model: 'model-x',
      temperature: 0.2,
      messages: [
        { role: 'system', content: 'You are a reviewer.' },
        { role: 'user', content: 'Review this.' },
      ],
      response_format: { type: 'json_schema', json_schema: { name: 'review', schema: request.jsonSchema } },
    });
  });

  test('uses plain JSON mode for providers without schema support, plus provider-specific options', async () => {
    const { fetchFn, calls } = fakeFetch(completion('{"answer":"ok","score":3}'));
    const client = new OpenAiCompatibleClient(
      { ...config, outputMode: 'json_object', extraBody: { reasoning_effort: 'low' } },
      fetchFn,
    );

    await client.completeJson(request, schema);

    expect(calls[0]!.body.response_format).toEqual({ type: 'json_object' });
    expect(calls[0]!.body.reasoning_effort).toBe('low');
  });
});

describe('OpenAiCompatibleClient output handling', () => {
  test('returns validated data, tolerating a fenced code block', async () => {
    const { fetchFn } = fakeFetch(completion('```json\n{"answer":"ok","score":4}\n```'));

    const result = await new OpenAiCompatibleClient(config, fetchFn).completeJson(request, schema);

    expect(result.data).toEqual({ answer: 'ok', score: 4 });
    expect(result).toMatchObject({ provider: 'gemini', model: 'model-x' });
  });

  test('asks once for a corrected reply when the output breaks the schema', async () => {
    const { fetchFn, calls } = fakeFetch(
      completion('{"answer":"ok","score":9}'),
      completion('{"answer":"ok","score":4}'),
    );

    const result = await new OpenAiCompatibleClient(config, fetchFn).completeJson(request, schema);

    expect(result.data.score).toBe(4);
    const repairMessages = calls[1]!.body.messages as { role: string; content: string }[];
    expect(repairMessages.map((m) => m.role)).toEqual(['system', 'user', 'assistant', 'user']);
    expect(repairMessages[3]!.content).toContain('score');
  });

  test('gives up with a retryable invalid-output error after one failed repair', async () => {
    const { fetchFn } = fakeFetch(completion('not json at all'), completion('{"answer": 1}'));

    const error = await capture(new OpenAiCompatibleClient(config, fetchFn).completeJson(request, schema));

    expect(error.kind).toBe('invalid_output');
    expect(error.retryable).toBe(true);
  });
});

describe('OpenAiCompatibleClient error classification', () => {
  test.each([
    [429, 'rate_limited', true],
    [401, 'auth', false],
    [403, 'auth', false],
    [404, 'bad_request', false],
    [400, 'bad_request', false],
    [503, 'server', true],
  ] as const)('HTTP %i is classified as %s (retryable: %s)', async (status, kind, retryable) => {
    const { fetchFn } = fakeFetch(httpError(status));

    const error = await capture(new OpenAiCompatibleClient(config, fetchFn).completeJson(request, schema));

    expect(error.kind).toBe(kind);
    expect(error.retryable).toBe(retryable);
  });

  test('reads the retry delay from a Retry-After header', async () => {
    const { fetchFn } = fakeFetch(httpError(429, '{}', { 'retry-after': '12' }));

    const error = await capture(new OpenAiCompatibleClient(config, fetchFn).completeJson(request, schema));

    expect(error.retryAfterMs).toBe(12_000);
  });

  test('reads the retry delay from a Gemini-style error body', async () => {
    const body = JSON.stringify({ error: { code: 429, details: [{ retryDelay: '23s' }] } });
    const { fetchFn } = fakeFetch(httpError(429, body));

    const error = await capture(new OpenAiCompatibleClient(config, fetchFn).completeJson(request, schema));

    expect(error.retryAfterMs).toBe(23_000);
  });

  test('a timed-out request is a retryable timeout', async () => {
    const { fetchFn } = fakeFetch(new DOMException('The operation timed out.', 'TimeoutError'));

    const error = await capture(new OpenAiCompatibleClient(config, fetchFn).completeJson(request, schema));

    expect(error.kind).toBe('timeout');
    expect(error.retryable).toBe(true);
  });

  test('a network failure is a retryable network error', async () => {
    const { fetchFn } = fakeFetch(new TypeError('fetch failed'));

    const error = await capture(new OpenAiCompatibleClient(config, fetchFn).completeJson(request, schema));

    expect(error.kind).toBe('network');
  });

  test('never leaks the API key into error messages', async () => {
    const { fetchFn } = fakeFetch(httpError(401, '{"error":"bad key secret-key"}'));

    const error = await capture(new OpenAiCompatibleClient(config, fetchFn).completeJson(request, schema));

    expect(error.message).not.toContain('secret-key');
  });
});
