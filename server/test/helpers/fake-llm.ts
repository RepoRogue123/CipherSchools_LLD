import type { z } from 'zod';
import { LlmError, type LlmClient, type LlmRequest, type LlmResult } from '../../src/evaluation/llm/llm-client';
import type { Rubric } from '../../src/domain/rubric';

/**
 * Replays scripted replies. Like a real client it validates each reply against
 * the caller's schema and reports schema violations as invalid output.
 */
export class FakeLlmClient implements LlmClient {
  readonly requests: LlmRequest[] = [];

  constructor(private readonly replies: Array<unknown>) {}

  async completeJson<T>(request: LlmRequest, schema: z.ZodType<T>): Promise<LlmResult<T>> {
    this.requests.push(request);
    if (this.replies.length === 0) throw new Error('FakeLlmClient: no scripted reply left');
    const next = this.replies.shift();
    if (next instanceof Error) throw next;
    const parsed = schema.safeParse(next);
    if (!parsed.success) throw new LlmError('invalid_output', parsed.error.message);
    return { data: parsed.data, provider: 'fake', model: 'fake-model', latencyMs: 7 };
  }
}

interface ReplyOverride {
  score?: number;
  evidence?: { quote: string; location: string }[];
  confidence?: 'low' | 'medium' | 'high';
  suggestion?: string;
}

/** A well-formed review reply covering every rubric criterion, quoting text from `aDesign()`. */
export function aReviewReply(rubric: Rubric, overrides: Record<string, ReplyOverride> = {}) {
  return {
    assessments: rubric.criterionIds.map((criterionId) => ({
      criterionId,
      evidence: overrides[criterionId]?.evidence ?? [
        { quote: 'Owns its spots and assigns them atomically.', location: 'entity:ParkingFloor' },
      ],
      reasoning: `Reasoning about ${criterionId}.`,
      score: overrides[criterionId]?.score ?? 3,
      concern: `Concern about ${criterionId}.`,
      suggestion: overrides[criterionId]?.suggestion ?? `Improve ${criterionId}.`,
      confidence: overrides[criterionId]?.confidence ?? 'medium',
    })),
    strengths: ['Pricing sits behind an interface.'],
    summary: 'A solid start with a clear pricing seam.',
  };
}
