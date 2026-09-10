import type { AiReviewInfo, Score } from '@designloop/shared';
import { describe, expect, test } from 'vitest';
import type { CriterionAssessment, EvaluatorOutput } from '../../src/domain/evaluator';
import { FeedbackAssembler } from '../../src/evaluation/feedback-assembler';
import { aRubric } from '../helpers/builders';

const rubric = aRubric();
const assembler = new FeedbackAssembler(rubric);
const aiCompleted: AiReviewInfo = {
  status: 'completed',
  provider: 'gemini',
  model: 'm',
  latencyMs: 10,
  promptVersion: 'lld-review/v1',
  message: null,
};

function assessment(criterionId: string, score: Score, extra: Partial<CriterionAssessment> = {}): CriterionAssessment {
  return {
    criterionId,
    score,
    evidence: [{ quote: 'q', location: 'assumptions', verified: true }],
    reasoning: `reasoning for ${criterionId}`,
    concern: `concern for ${criterionId}`,
    suggestion: `improve ${criterionId}`,
    confidence: 'medium',
    source: 'ai',
    ...extra,
  };
}

function output(parts: Partial<EvaluatorOutput>): EvaluatorOutput {
  return {
    findings: [],
    metrics: null,
    caps: [],
    assessments: [],
    strengths: [],
    summary: null,
    meta: { provider: null, model: null, latencyMs: null, promptVersion: null },
    ...parts,
  };
}

const metrics = {
  entityCount: 3,
  abstractionCount: 1,
  relationshipCount: 2,
  requirementCoverage: { mapped: 1, total: 3 },
  flowCount: 1,
  decisionCount: 1,
  changeImpact: { modified: 1, added: 1 },
};

function assemble(outputs: EvaluatorOutput[], aiReview: AiReviewInfo = aiCompleted) {
  return assembler.assemble({
    outputs: outputs.map((o, i) => ({ evaluatorId: `ev${i}`, output: o })),
    aiReview,
    partial: false,
  });
}

const criterion = (report: ReturnType<typeof assemble>, id: string) =>
  report.criteria.find((c) => c.criterionId === id)!;

describe('FeedbackAssembler criteria', () => {
  test('shows each criterion with the rubric level label, in rubric order', () => {
    const report = assemble([output({ assessments: [assessment('tradeoffs', 3), assessment('requirements', 4)] })]);

    expect(report.criteria.map((c) => c.criterionId)).toEqual(['requirements', 'responsibilities', 'tradeoffs', 'robustness']);
    expect(criterion(report, 'requirements')).toMatchObject({ score: 4, levelLabel: 'Strong', name: 'Requirement understanding', source: 'ai' });
  });

  test('a deterministic cap lowers a higher score and says why', () => {
    const report = assemble([
      output({ caps: [{ criterionId: 'requirements', maxScore: 2, checkId: 'mapping.coverage', reason: 'Only 1 of 3 mapped.' }], metrics }),
      output({ assessments: [assessment('requirements', 4)] }),
    ]);

    expect(criterion(report, 'requirements')).toMatchObject({
      score: 2,
      levelLabel: 'Emerging',
      cap: { maxScore: 2, originalScore: 4, reason: 'Only 1 of 3 mapped.' },
    });
  });

  test('a cap never raises a lower score', () => {
    const report = assemble([
      output({ caps: [{ criterionId: 'robustness', maxScore: 2, checkId: 'edge-cases.empty', reason: 'Empty.' }] }),
      output({ assessments: [assessment('robustness', 1)] }),
    ]);

    expect(criterion(report, 'robustness')).toMatchObject({ score: 1, cap: null });
  });

  test('the strictest cap wins when several target one criterion', () => {
    const report = assemble([
      output({
        caps: [
          { criterionId: 'tradeoffs', maxScore: 3, checkId: 'a', reason: 'loose' },
          { criterionId: 'tradeoffs', maxScore: 2, checkId: 'b', reason: 'strict' },
        ],
      }),
      output({ assessments: [assessment('tradeoffs', 4)] }),
    ]);

    expect(criterion(report, 'tradeoffs').cap).toEqual({ maxScore: 2, originalScore: 4, reason: 'strict' });
  });

  test('a human assessment takes precedence over the AI for the same criterion', () => {
    const report = assemble([
      output({ assessments: [assessment('responsibilities', 2)] }),
      output({ assessments: [assessment('responsibilities', 4, { source: 'human', reasoning: 'reviewer says' })] }),
    ]);

    expect(criterion(report, 'responsibilities')).toMatchObject({ score: 4, source: 'human', reasoning: 'reviewer says' });
  });

  test('unassessed criteria have no score and are excluded from the overall mean', () => {
    const report = assemble([output({ assessments: [assessment('requirements', 4), assessment('tradeoffs', 2)] })]);

    expect(criterion(report, 'robustness')).toMatchObject({ score: null, levelLabel: null, source: null, evidence: [] });
    expect(report.overall).toEqual({ mean: 3, band: 'Solid', assessedCount: 2, totalCriteria: 4 });
  });
});

describe('FeedbackAssembler overall band', () => {
  test.each([
    [[4, 4, 3, 3], 3.5, 'Strong'],
    [[3, 3, 3, 2], 2.75, 'Solid'],
    [[2, 2, 2, 2], 2, 'Developing'],
    [[1, 2, 2, 2], 1.75, 'Foundational'],
  ] as const)('scores %j give mean %d and band %s', (scores, mean, band) => {
    const ids = ['requirements', 'responsibilities', 'tradeoffs', 'robustness'];
    const report = assemble([output({ assessments: scores.map((s, i) => assessment(ids[i]!, s as Score)) })]);

    expect(report.overall.mean).toBe(mean);
    expect(report.overall.band).toBe(band);
  });

  test('has no band when nothing was assessed', () => {
    const report = assemble([output({ metrics })], { ...aiCompleted, status: 'skipped' });

    expect(report.overall).toEqual({ mean: null, band: null, assessedCount: 0, totalCriteria: 4 });
  });
});

describe('FeedbackAssembler next steps', () => {
  test('are the suggestions for the three lowest-scoring criteria, ties in rubric order', () => {
    const report = assemble([
      output({
        assessments: [
          assessment('requirements', 3),
          assessment('responsibilities', 2),
          assessment('tradeoffs', 3),
          assessment('robustness', 4),
        ],
      }),
    ]);

    expect(report.nextSteps.map((s) => s.criterionId)).toEqual(['responsibilities', 'requirements', 'tradeoffs']);
    expect(report.nextSteps[0]).toEqual({
      criterionId: 'responsibilities',
      criterionName: 'Class responsibilities',
      text: 'improve responsibilities',
    });
  });

  test('come from structural warnings when there is no AI review', () => {
    const report = assemble(
      [
        output({
          metrics,
          findings: [
            { checkId: 'entities.orphan', severity: 'info', message: 'Orphan.' },
            { checkId: 'mapping.coverage', severity: 'warning', message: 'R2 is not mapped.' },
            { checkId: 'edge-cases.empty', severity: 'warning', message: 'List edge cases.' },
          ],
        }),
      ],
      { ...aiCompleted, status: 'skipped' },
    );

    expect(report.nextSteps.map((s) => s.text)).toEqual(['R2 is not mapped.', 'List edge cases.']);
  });
});

describe('FeedbackAssembler report assembly', () => {
  test('merges findings, takes metrics from the structural output and strengths from the AI', () => {
    const report = assemble([
      output({ metrics, findings: [{ checkId: 'mapping.coverage', severity: 'warning', message: 'R2 unmapped.' }] }),
      output({ assessments: [assessment('requirements', 3)], strengths: ['Clear pricing seam.'], summary: 'Good start.' }),
    ]);

    expect(report.findings.map((f) => f.checkId)).toEqual(['mapping.coverage']);
    expect(report.metrics).toEqual(metrics);
    expect(report.strengths).toEqual(['Clear pricing seam.']);
    expect(report.summary).toBe('Good start.');
    expect(report.rubricVersion).toBe('v1');
    expect(report.aiReview).toEqual(aiCompleted);
  });
});
