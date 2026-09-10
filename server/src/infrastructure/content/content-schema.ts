import { DIFFICULTIES } from '@designloop/shared';
import { z } from 'zod';

const text = z.string().trim().min(1);

export const problemFileSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/, 'id must be a lowercase slug'),
    version: z.number().int().positive(),
    title: text,
    difficulty: z.enum(DIFFICULTIES),
    estimatedMinutes: z.number().int().positive(),
    summary: text,
    context: text,
    focusConcepts: z.array(text).min(1),
    requirements: z
      .array(z.object({ id: z.string().regex(/^R\d+$/, 'requirement ids look like R1'), text }))
      .min(3),
    outOfScope: z.array(text),
    clarifyingQuestions: z.array(z.object({ question: text, answer: text })).min(1),
    keyFlows: z.array(text).min(1).max(4),
    designPressures: z.array(text).min(1),
    edgeCases: z.array(text).min(1),
    curveballs: z
      .array(z.object({ id: text, title: text, description: text, tests: text }))
      .length(2, 'each problem needs exactly two curveballs (one per alternating attempt)'),
    alternativeApproaches: z
      .array(z.object({ name: text, summary: text, strengths: text, tradeoffs: text }))
      .min(2),
  })
  .superRefine((problem, ctx) => {
    const seen = new Set<string>();
    for (const requirement of problem.requirements) {
      if (seen.has(requirement.id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['requirements'],
          message: `duplicate requirement id ${requirement.id}`,
        });
      }
      seen.add(requirement.id);
    }
    const [first, second] = problem.curveballs;
    if (first && second && first.id === second.id) {
      ctx.addIssue({ code: 'custom', path: ['curveballs'], message: 'curveball ids must differ' });
    }
  });

const levelText = text;

export const rubricFileSchema = z.object({
  id: text,
  version: text,
  scale: z
    .array(z.object({ score: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]), label: text }))
    .length(4),
  criteria: z
    .array(
      z.object({
        id: z.string().regex(/^[a-z-]+$/),
        name: text,
        question: text,
        levels: z.object({ '1': levelText, '2': levelText, '3': levelText, '4': levelText }),
      }),
    )
    .min(1),
});
