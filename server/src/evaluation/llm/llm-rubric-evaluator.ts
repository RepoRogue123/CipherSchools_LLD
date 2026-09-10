import type { Confidence, Score } from '@designloop/shared';
import {
  EvaluatorError,
  type CriterionAssessment,
  type EvaluationContext,
  type Evaluator,
  type EvaluatorOutcome,
} from '../../domain/evaluator';
import { verifyEvidence } from './evidence-verifier';
import { LlmError, type LlmClient, type LlmResult } from './llm-client';
import { buildReviewPrompt, PROMPT_VERSION } from './prompt-builder';
import { reviewJsonSchema, reviewResponseSchema, type ReviewResponse } from './review-schema';

const MAX_EVIDENCE = 3;
const MAX_STRENGTHS = 3;
const MAX_TEXT = 600;

export interface LlmRubricOptions {
  temperature: number;
  structuralEvaluatorId: string;
}

const DEFAULT_OPTIONS: LlmRubricOptions = { temperature: 0.2, structuralEvaluatorId: 'structural' };

function clip(text: string, max = MAX_TEXT): string {
  const trimmed = text.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed;
}

/**
 * Judgement-heavy criteria, scored by an LLM against a fixed rubric with
 * structured output. Deterministic post-processing then verifies every quote
 * against the submission and distrusts high scores that have no real evidence.
 */
export class LlmRubricEvaluator implements Evaluator {
  readonly id = 'llm-rubric';
  readonly kind = 'ai' as const;

  constructor(
    private readonly client: LlmClient | null,
    private readonly options: LlmRubricOptions = DEFAULT_OPTIONS,
  ) {}

  async evaluate(context: EvaluationContext): Promise<EvaluatorOutcome> {
    if (!this.client) {
      return { status: 'skipped', reason: 'AI review is not configured (no provider API key is set).' };
    }
    const prompt = buildReviewPrompt(context, context.priorOutputs.get(this.options.structuralEvaluatorId));
    const criterionIds = context.rubric.criterionIds;

    let result: LlmResult<ReviewResponse>;
    try {
      result = await this.client.completeJson(
        {
          ...prompt,
          schemaName: 'lld_design_review',
          jsonSchema: reviewJsonSchema(criterionIds),
          temperature: this.options.temperature,
        },
        reviewResponseSchema(criterionIds),
      );
    } catch (error) {
      if (error instanceof LlmError) throw new EvaluatorError(error.message, error.retryable);
      throw error;
    }

    return {
      status: 'completed',
      output: {
        findings: [],
        metrics: null,
        caps: [],
        assessments: this.toAssessments(result.data, context),
        strengths: result.data.strengths.map((s) => clip(s)).filter(Boolean).slice(0, MAX_STRENGTHS),
        summary: clip(result.data.summary) || null,
        meta: {
          provider: result.provider,
          model: result.model,
          latencyMs: result.latencyMs,
          promptVersion: PROMPT_VERSION,
        },
      },
    };
  }

  private toAssessments(reply: ReviewResponse, context: EvaluationContext): CriterionAssessment[] {
    return context.rubric.criteria.flatMap((criterion) => {
      const item = reply.assessments.find((a) => a.criterionId === criterion.id);
      if (!item) return [];
      const evidence = verifyEvidence(item.evidence.slice(0, MAX_EVIDENCE), context.review);
      const hasVerifiedEvidence = evidence.some((e) => e.verified);
      const confidence: Confidence = item.score >= 3 && !hasVerifiedEvidence ? 'low' : item.confidence;
      return [
        {
          criterionId: criterion.id,
          score: item.score as Score,
          evidence,
          reasoning: clip(item.reasoning),
          concern: clip(item.concern),
          suggestion: clip(item.suggestion),
          confidence,
          source: 'ai' as const,
        },
      ];
    });
  }
}
