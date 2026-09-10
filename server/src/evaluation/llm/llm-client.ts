import type { z } from 'zod';

export type LlmErrorKind =
  | 'rate_limited'
  | 'auth'
  | 'bad_request'
  | 'server'
  | 'timeout'
  | 'network'
  | 'invalid_output'
  | 'all_failed';

/** Transient failures are worth retrying later or on another provider; config errors are not. */
const RETRYABLE: Record<LlmErrorKind, boolean> = {
  rate_limited: true,
  server: true,
  timeout: true,
  network: true,
  invalid_output: true,
  auth: false,
  bad_request: false,
  all_failed: false,
};

export class LlmError extends Error {
  override name = 'LlmError';
  readonly retryAfterMs: number | null;
  private readonly retryableOverride: boolean | undefined;

  constructor(
    readonly kind: LlmErrorKind,
    message: string,
    options: { retryAfterMs?: number | null; retryable?: boolean } = {},
  ) {
    super(message);
    this.retryAfterMs = options.retryAfterMs ?? null;
    this.retryableOverride = options.retryable;
  }

  get retryable(): boolean {
    return this.retryableOverride ?? RETRYABLE[this.kind];
  }
}

export interface ProviderFailure {
  provider: string;
  kind: LlmErrorKind;
  message: string;
}

export class AllProvidersFailedError extends LlmError {
  override name = 'AllProvidersFailedError';

  constructor(
    readonly failures: readonly ProviderFailure[],
    retryAfterMs: number | null,
  ) {
    super(
      'all_failed',
      failures.length
        ? `AI review unavailable: ${failures.map((f) => `${f.provider} (${f.kind.replace('_', ' ')})`).join(', ')}.`
        : 'AI review unavailable: no providers configured.',
      { retryAfterMs, retryable: failures.some((f) => RETRYABLE[f.kind]) },
    );
  }
}

export interface LlmRequest {
  system: string;
  user: string;
  /** Name and JSON Schema of the expected reply, for providers with structured output. */
  schemaName: string;
  jsonSchema: Record<string, unknown>;
  temperature: number;
  maxOutputTokens?: number;
}

export interface LlmResult<T> {
  data: T;
  provider: string;
  model: string;
  latencyMs: number;
}

/**
 * Port for structured LLM completions. Implementations validate the reply
 * against `schema`, so callers only ever see well-formed, typed data.
 */
export interface LlmClient {
  completeJson<T>(request: LlmRequest, schema: z.ZodType<T>): Promise<LlmResult<T>>;
}
