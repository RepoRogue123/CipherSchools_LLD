import { CONFIDENCE_LEVELS } from '@designloop/shared';
import { z } from 'zod';

/**
 * The reply shape we require from the model. Evidence and reasoning come before
 * the score, so the model grounds its judgement before committing to a number.
 */
export function reviewResponseSchema(criterionIds: readonly string[]) {
  const assessment = z.object({
    criterionId: z.string(),
    evidence: z.array(z.object({ quote: z.string(), location: z.string() })),
    reasoning: z.string(),
    score: z.number().int().min(1).max(4),
    concern: z.string(),
    suggestion: z.string(),
    confidence: z.enum(CONFIDENCE_LEVELS),
  });
  return z
    .object({
      assessments: z.array(assessment),
      strengths: z.array(z.string()),
      summary: z.string(),
    })
    .superRefine((reply, ctx) => {
      const present = new Set(reply.assessments.map((a) => a.criterionId));
      const missing = criterionIds.filter((id) => !present.has(id));
      if (missing.length > 0) {
        ctx.addIssue({
          code: 'custom',
          path: ['assessments'],
          message: `missing an assessment for criterion id(s): ${missing.join(', ')}`,
        });
      }
    });
}

export type ReviewResponse = z.infer<ReturnType<typeof reviewResponseSchema>>;

/**
 * JSON Schema sent to providers with structured output. It deliberately uses
 * the widely supported subset (type, properties, required, items, enum). Ranges
 * and cross-field rules are enforced by the Zod schema above.
 */
export function reviewJsonSchema(criterionIds: readonly string[]): Record<string, unknown> {
  return {
    type: 'object',
    properties: {
      assessments: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            criterionId: { type: 'string', enum: [...criterionIds] },
            evidence: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  quote: { type: 'string', description: 'Exact words copied from the submission.' },
                  location: { type: 'string', description: 'The [anchor] the quote comes from.' },
                },
                required: ['quote', 'location'],
              },
            },
            reasoning: { type: 'string' },
            score: { type: 'integer', description: 'Rubric level from 1 to 4.' },
            concern: { type: 'string' },
            suggestion: { type: 'string' },
            confidence: { type: 'string', enum: [...CONFIDENCE_LEVELS] },
          },
          required: ['criterionId', 'evidence', 'reasoning', 'score', 'concern', 'suggestion', 'confidence'],
        },
      },
      strengths: { type: 'array', items: { type: 'string' } },
      summary: { type: 'string' },
    },
    required: ['assessments', 'strengths', 'summary'],
  };
}
