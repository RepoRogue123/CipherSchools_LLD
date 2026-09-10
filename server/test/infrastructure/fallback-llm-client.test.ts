import { describe, expect, test } from 'vitest';
import { z } from 'zod';
import {
  AllProvidersFailedError,
  LlmError,
  type LlmClient,
  type LlmRequest,
  type LlmResult,
} from '../../src/evaluation/llm/llm-client';
import { FallbackLlmClient } from '../../src/infrastructure/llm/fallback-llm-client';
import { FixedClock } from '../helpers/fakes';

const schema = z.object({ ok: z.boolean() });
const request: LlmRequest = { system: 's', user: 'u', schemaName: 'x', jsonSchema: {}, temperature: 0 };

/** A provider that replays a scripted sequence of results or errors, counting calls. */
class ScriptedProvider implements LlmClient {
  calls = 0;

  constructor(
    private readonly name: string,
    private readonly script: Array<'ok' | LlmError | Error>,
  ) {}

  async completeJson<T>(): Promise<LlmResult<T>> {
    this.calls += 1;
    const next = this.script.shift() ?? 'ok';
    if (next !== 'ok') throw next;
    return { data: { ok: true } as T, provider: this.name, model: `${this.name}-model`, latencyMs: 1 };
  }
}

function setup(first: ScriptedProvider, second: ScriptedProvider) {
  const clock = new FixedClock(new Date('2026-09-10T10:00:00Z'));
  const client = new FallbackLlmClient(
    [
      { name: 'gemini', client: first },
      { name: 'groq', client: second },
    ],
    clock,
    { rateLimitCooldownMs: 30_000, authCooldownMs: 600_000 },
  );
  return { client, clock };
}

describe('FallbackLlmClient', () => {
  test('uses the first provider when it succeeds', async () => {
    const first = new ScriptedProvider('gemini', ['ok']);
    const second = new ScriptedProvider('groq', ['ok']);
    const { client } = setup(first, second);

    const result = await client.completeJson(request, schema);

    expect(result.provider).toBe('gemini');
    expect(second.calls).toBe(0);
  });

  test('falls back on a rate limit and skips the cooled-down provider until it recovers', async () => {
    const first = new ScriptedProvider('gemini', [new LlmError('rate_limited', 'slow down', { retryAfterMs: 20_000 }), 'ok']);
    const second = new ScriptedProvider('groq', ['ok', 'ok']);
    const { client, clock } = setup(first, second);

    expect((await client.completeJson(request, schema)).provider).toBe('groq');
    expect((await client.completeJson(request, schema)).provider).toBe('groq');
    expect(first.calls).toBe(1);

    clock.advance(20_001);
    expect((await client.completeJson(request, schema)).provider).toBe('gemini');
  });

  test('falls back on invalid output and server errors without cooling down', async () => {
    const first = new ScriptedProvider('gemini', [new LlmError('invalid_output', 'bad json'), 'ok']);
    const second = new ScriptedProvider('groq', ['ok']);
    const { client } = setup(first, second);

    expect((await client.completeJson(request, schema)).provider).toBe('groq');
    expect((await client.completeJson(request, schema)).provider).toBe('gemini');
  });

  test('reports every provider failure and is retryable when any failure is transient', async () => {
    const first = new ScriptedProvider('gemini', [new LlmError('rate_limited', 'quota', { retryAfterMs: 5_000 })]);
    const second = new ScriptedProvider('groq', [new LlmError('auth', 'bad key')]);
    const { client } = setup(first, second);

    const error = await client.completeJson(request, schema).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AllProvidersFailedError);
    const failed = error as AllProvidersFailedError;
    expect(failed.failures.map((f) => [f.provider, f.kind])).toEqual([
      ['gemini', 'rate_limited'],
      ['groq', 'auth'],
    ]);
    expect(failed.retryable).toBe(true);
    expect(failed.retryAfterMs).toBe(5_000);
  });

  test('is not retryable when every provider is misconfigured', async () => {
    const first = new ScriptedProvider('gemini', [new LlmError('auth', 'bad key')]);
    const second = new ScriptedProvider('groq', [new LlmError('bad_request', 'unknown model')]);
    const { client } = setup(first, second);

    const error = (await client.completeJson(request, schema).catch((e: unknown) => e)) as AllProvidersFailedError;

    expect(error.retryable).toBe(false);
  });

  test('lets programming errors propagate instead of hiding them behind a fallback', async () => {
    const first = new ScriptedProvider('gemini', [new RangeError('bug')]);
    const second = new ScriptedProvider('groq', ['ok']);
    const { client } = setup(first, second);

    await expect(client.completeJson(request, schema)).rejects.toThrow(RangeError);
    expect(second.calls).toBe(0);
  });

  test('reports which providers are cooling down', async () => {
    const first = new ScriptedProvider('gemini', [new LlmError('rate_limited', 'quota', { retryAfterMs: 10_000 })]);
    const second = new ScriptedProvider('groq', ['ok']);
    const { client } = setup(first, second);

    await client.completeJson(request, schema);

    expect(client.status()).toEqual([
      { name: 'gemini', coolingDownUntil: new Date('2026-09-10T10:00:10Z') },
      { name: 'groq', coolingDownUntil: null },
    ]);
  });
});
