import type { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, test } from 'vitest';
import { Attempt } from '../../src/domain/attempt';
import { Evaluation } from '../../src/domain/evaluation';
import {
  EvaluatorError,
  type EvaluationContext,
  type Evaluator,
  type EvaluatorOutcome,
} from '../../src/domain/evaluator';
import { Learner } from '../../src/domain/learner';
import { Problem } from '../../src/domain/problem';
import type { ProblemCatalog } from '../../src/domain/ports';
import type { Submission } from '../../src/domain/submission';
import { EvaluationPipeline } from '../../src/evaluation/evaluation-pipeline';
import { FeedbackAssembler } from '../../src/evaluation/feedback-assembler';
import { DesignFormatRegistry } from '../../src/evaluation/formats/design-format-registry';
import { StructuredDesignFormatV1 } from '../../src/evaluation/formats/structured-design-v1';
import { StructuralEvaluator } from '../../src/evaluation/structural/structural-evaluator';
import { openDatabase } from '../../src/infrastructure/sqlite/database';
import {
  SqliteAttemptRepository,
  SqliteEvaluationRepository,
  SqliteLearnerRepository,
  SqliteSubmissionRepository,
} from '../../src/infrastructure/sqlite/repositories';
import { aChangeImpact, aDesign, aProblemData, aRubric } from '../helpers/builders';
import { FixedClock } from '../helpers/fakes';

const T0 = new Date('2026-09-10T10:00:00Z');
const problem = new Problem(aProblemData());
const catalog: ProblemCatalog = { list: () => [problem], get: (id) => (id === problem.id ? problem : undefined) };
const rubric = aRubric();

/** An AI-kind evaluator whose behaviour is scripted per call. */
class ScriptedAiEvaluator implements Evaluator {
  readonly id = 'llm-rubric';
  readonly kind = 'ai' as const;
  calls = 0;
  seenPriorOutputs: string[] = [];

  constructor(private readonly script: Array<'score' | 'skip' | EvaluatorError>) {}

  async evaluate(context: EvaluationContext): Promise<EvaluatorOutcome> {
    this.calls += 1;
    this.seenPriorOutputs = [...context.priorOutputs.keys()];
    const next = this.script.shift() ?? 'score';
    if (next instanceof EvaluatorError) throw next;
    if (next === 'skip') return { status: 'skipped', reason: 'No provider configured.' };
    return {
      status: 'completed',
      output: {
        findings: [],
        metrics: null,
        caps: [],
        assessments: rubric.criterionIds.map((criterionId) => ({
          criterionId,
          score: 3,
          evidence: [],
          reasoning: 'r',
          concern: 'c',
          suggestion: `improve ${criterionId}`,
          confidence: 'medium',
          source: 'ai',
        })),
        strengths: [],
        summary: 'ok',
        meta: { provider: 'fake', model: 'fake-model', latencyMs: 5, promptVersion: 'lld-review/v1' },
      },
    };
  }
}

/** Wraps the real structural evaluator to count invocations. */
class CountingStructural extends StructuralEvaluator {
  calls = 0;
  override async evaluate(context: EvaluationContext): Promise<EvaluatorOutcome> {
    this.calls += 1;
    return super.evaluate(context);
  }
}

let db: DatabaseSync;
let evaluations: SqliteEvaluationRepository;
let submission: Submission;

beforeEach(() => {
  db = openDatabase(':memory:');
  evaluations = new SqliteEvaluationRepository(db);
  new SqliteLearnerRepository(db).insert(Learner.register({ id: 'lrn-1', name: 'Asha', now: T0 }));
  const attempts = new SqliteAttemptRepository(db);
  const attempt = Attempt.start({ id: 'att-1', learnerId: 'lrn-1', problem, number: 1, now: T0 });
  attempts.insert(attempt);
  attempt.saveDesign(aDesign(), 1, T0);
  attempt.revealCurveball([], T0);
  attempt.saveChangeImpact(aChangeImpact(), attempt.version, T0);
  submission = attempt.submit([], 'sub-1', T0);
  attempts.save(attempt, 1);
  new SqliteSubmissionRepository(db).insert(submission);
  evaluations.insert(Evaluation.queue({ id: 'ev-1', submissionId: 'sub-1', rubricVersion: 'v1', promptVersion: 'lld-review/v1', now: T0 }));
});

function pipeline(evaluators: Evaluator[]): EvaluationPipeline {
  return new EvaluationPipeline({
    evaluators,
    formats: new DesignFormatRegistry([new StructuredDesignFormatV1()]),
    catalog,
    rubric,
    evaluations,
    assembler: new FeedbackAssembler(rubric),
    clock: new FixedClock(T0),
  });
}

describe('EvaluationPipeline', () => {
  test('runs evaluators in order and gives the AI reviewer the structural facts', async () => {
    const ai = new ScriptedAiEvaluator(['score']);

    const result = await pipeline([new StructuralEvaluator(), ai]).run('ev-1', submission);

    expect(ai.seenPriorOutputs).toEqual(['structural']);
    expect(result.status).toBe('completed');
    expect(result.report.overall.assessedCount).toBe(4);
    expect(result.report.metrics.entityCount).toBe(3);
    expect(result.report.aiReview).toMatchObject({ status: 'completed', provider: 'fake', model: 'fake-model' });
    expect(evaluations.listSteps('ev-1').map((s) => [s.evaluatorId, s.status])).toEqual([
      ['llm-rubric', 'COMPLETED'],
      ['structural', 'COMPLETED'],
    ]);
  });

  test('a failed AI review returns a partial report with the deterministic findings', async () => {
    const ai = new ScriptedAiEvaluator([new EvaluatorError('AI review unavailable: gemini (rate limited).', true)]);

    const result = await pipeline([new StructuralEvaluator(), ai]).run('ev-1', submission);

    expect(result).toMatchObject({ status: 'failed', retryable: true, error: expect.stringContaining('rate limited') });
    expect(result.report.partial).toBe(true);
    expect(result.report.metrics.entityCount).toBe(3);
    expect(result.report.overall.assessedCount).toBe(0);
    expect(result.report.aiReview).toMatchObject({ status: 'failed', message: expect.stringContaining('rate limited') });
  });

  test('a re-run reuses completed steps and only repeats the failed one', async () => {
    const structural = new CountingStructural();
    const ai = new ScriptedAiEvaluator([new EvaluatorError('timeout', true), 'score']);
    const run = pipeline([structural, ai]);

    await run.run('ev-1', submission);
    const retried = await run.run('ev-1', submission);

    expect(structural.calls).toBe(1);
    expect(ai.calls).toBe(2);
    expect(retried.status).toBe('completed');
    expect(retried.report.metrics.entityCount).toBe(3);
  });

  test('without an AI provider the evaluation still completes with deterministic feedback', async () => {
    const result = await pipeline([new StructuralEvaluator(), new ScriptedAiEvaluator(['skip'])]).run('ev-1', submission);

    expect(result.status).toBe('completed');
    expect(result.report.aiReview).toMatchObject({ status: 'skipped', message: 'No provider configured.' });
    expect(result.report.criteria.every((c) => c.score === null)).toBe(true);
    expect(result.report.partial).toBe(false);
  });

  test('an unexpected evaluator crash is treated as non-retryable', async () => {
    const broken: Evaluator = {
      id: 'structural',
      kind: 'deterministic',
      evaluate: async () => {
        throw new TypeError('undefined is not a function');
      },
    };

    const result = await pipeline([broken, new ScriptedAiEvaluator(['score'])]).run('ev-1', submission);

    expect(result).toMatchObject({ status: 'failed', retryable: false });
    expect(result.report.aiReview.status).toBe('pending');
  });
});
