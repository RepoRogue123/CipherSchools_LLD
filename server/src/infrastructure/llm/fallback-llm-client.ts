import type { z } from 'zod';
import type { Clock } from '../../domain/ports';
import {
  AllProvidersFailedError,
  LlmError,
  type LlmClient,
  type LlmRequest,
  type LlmResult,
  type ProviderFailure,
} from '../../evaluation/llm/llm-client';

export interface NamedLlmClient {
  name: string;
  client: LlmClient;
}

export interface FallbackOptions {
  /** Cooldown after a 429 when the provider gives no retry hint. */
  rateLimitCooldownMs: number;
  /** A rejected key will not fix itself mid-run, so skip that provider for a long time. */
  authCooldownMs: number;
}

export const DEFAULT_FALLBACK_OPTIONS: FallbackOptions = {
  rateLimitCooldownMs: 30_000,
  authCooldownMs: 10 * 60_000,
};

/**
 * Tries providers in order, so free-tier limits on one provider don't block
 * feedback. A rate-limited provider is cooled down and skipped until it recovers.
 */
export class FallbackLlmClient implements LlmClient {
  private readonly cooldownUntil = new Map<string, number>();

  constructor(
    private readonly providers: readonly NamedLlmClient[],
    private readonly clock: Clock,
    private readonly options: FallbackOptions = DEFAULT_FALLBACK_OPTIONS,
  ) {}

  get providerNames(): string[] {
    return this.providers.map((p) => p.name);
  }

  status(): { name: string; coolingDownUntil: Date | null }[] {
    const now = this.clock.now().getTime();
    return this.providers.map(({ name }) => {
      const until = this.cooldownUntil.get(name);
      return { name, coolingDownUntil: until !== undefined && until > now ? new Date(until) : null };
    });
  }

  async completeJson<T>(request: LlmRequest, schema: z.ZodType<T>): Promise<LlmResult<T>> {
    const failures: ProviderFailure[] = [];
    for (const { name, client } of this.providers) {
      const now = this.clock.now().getTime();
      const until = this.cooldownUntil.get(name);
      if (until !== undefined && until > now) {
        failures.push({ provider: name, kind: 'rate_limited', message: `${name} is cooling down` });
        continue;
      }
      try {
        return await client.completeJson(request, schema);
      } catch (error) {
        if (!(error instanceof LlmError)) throw error;
        failures.push({ provider: name, kind: error.kind, message: error.message });
        if (error.kind === 'rate_limited') {
          this.cooldownUntil.set(name, now + (error.retryAfterMs ?? this.options.rateLimitCooldownMs));
        } else if (error.kind === 'auth') {
          this.cooldownUntil.set(name, now + this.options.authCooldownMs);
        }
      }
    }
    const now = this.clock.now().getTime();
    const pending = [...this.cooldownUntil.values()].filter((until) => until > now);
    throw new AllProvidersFailedError(failures, pending.length ? Math.min(...pending) - now : null);
  }
}
