import { describe, expect, test } from 'vitest';
import { EvaluatorError } from '../../src/domain/evaluator';
import { AllProvidersFailedError } from '../../src/evaluation/llm/llm-client';
import { aRubric } from '../helpers/builders';
import { aReviewReply } from '../helpers/fake-llm';
import { submitAttempt, testApp } from '../helpers/harness';

const outage = () => new AllProvidersFailedError([{ provider: 'gemini', kind: 'rate_limited', message: 'quota' }], 10_000);
const rubric = aRubric();

describe('EvaluationWorker', () => {
  test('has nothing to do when the queue is empty', async () => {
    const app = testApp();

    expect(await app.worker.runOnce()).toBe(false);
  });

  test('processes a submitted design into a completed, rubric-scored report', async () => {
    const app = testApp({ llmReplies: [aReviewReply(rubric)] });
    const learner = app.practice.registerLearner('Asha').id;
    const { evaluation } = submitAttempt(app, learner);

    expect(await app.worker.runOnce()).toBe(true);

    const view = app.practice.getEvaluation(learner, evaluation.id);
    expect(view.evaluation.status).toBe('COMPLETED');
    expect(view.evaluation.report?.overall.assessedCount).toBe(4);
    expect(view.evaluation.report?.aiReview).toMatchObject({ status: 'completed', provider: 'fake' });
    expect(view.steps.map((s) => s.status)).toEqual(['COMPLETED', 'COMPLETED']);
  });

  test('backs off after a provider outage and completes on the next attempt', async () => {
    const app = testApp({ llmReplies: [outage(), aReviewReply(rubric)] });
    const learner = app.practice.registerLearner('Asha').id;
    const { evaluation } = submitAttempt(app, learner);

    await app.worker.runOnce();
    expect(app.practice.getEvaluation(learner, evaluation.id).evaluation.status).toBe('QUEUED');
    expect(await app.worker.runOnce()).toBe(false);

    app.clock.advance(15_000);
    expect(await app.worker.runOnce()).toBe(true);
    expect(app.practice.getEvaluation(learner, evaluation.id).evaluation.status).toBe('COMPLETED');
  });

  test('fails with the deterministic feedback once automatic retries run out, and a learner retry recovers', async () => {
    const app = testApp({ llmReplies: [outage(), outage(), outage(), aReviewReply(rubric)] });
    const learner = app.practice.registerLearner('Asha').id;
    const { evaluation } = submitAttempt(app, learner);

    await app.worker.runOnce();
    app.clock.advance(15_000);
    await app.worker.runOnce();
    app.clock.advance(45_000);
    await app.worker.runOnce();

    const failed = app.practice.getEvaluation(learner, evaluation.id).evaluation;
    expect(failed.status).toBe('FAILED');
    expect(failed.report?.partial).toBe(true);
    expect(failed.report?.metrics.entityCount).toBe(3);
    expect(failed.lastError).toContain('rate limited');

    app.practice.retryEvaluation(learner, evaluation.id);
    await app.worker.runOnce();

    expect(app.practice.getEvaluation(learner, evaluation.id).evaluation.status).toBe('COMPLETED');
  });

  test('a non-retryable failure fails immediately', async () => {
    const app = testApp({ llmReplies: [new EvaluatorError('bad key', false)] });
    const learner = app.practice.registerLearner('Asha').id;
    const { evaluation } = submitAttempt(app, learner);

    await app.worker.runOnce();

    expect(app.practice.getEvaluation(learner, evaluation.id).evaluation.status).toBe('FAILED');
  });

  test('retrying an evaluation that has not failed changes nothing', async () => {
    const app = testApp({ llmReplies: [aReviewReply(rubric)] });
    const learner = app.practice.registerLearner('Asha').id;
    const { evaluation } = submitAttempt(app, learner);
    await app.worker.runOnce();

    const view = app.practice.retryEvaluation(learner, evaluation.id);

    expect(view.evaluation.status).toBe('COMPLETED');
    expect(await app.worker.runOnce()).toBe(false);
  });

  test('recovers an evaluation abandoned by a crashed worker', async () => {
    const app = testApp({ llmReplies: [aReviewReply(rubric)] });
    const learner = app.practice.registerLearner('Asha').id;
    const { evaluation } = submitAttempt(app, learner);
    const orphan = app.repositories.evaluations.get(evaluation.id)!;
    orphan.claim(app.clock.now(), 60_000);
    app.repositories.evaluations.save(orphan, 1);

    expect(await app.worker.runOnce()).toBe(false);
    app.clock.advance(60_001);
    expect(await app.worker.runOnce()).toBe(true);

    expect(app.practice.getEvaluation(learner, evaluation.id).evaluation.status).toBe('COMPLETED');
  });

  test('without an AI provider, evaluations complete with deterministic feedback only', async () => {
    const app = testApp({ llmReplies: null });
    const learner = app.practice.registerLearner('Asha').id;
    const { evaluation } = submitAttempt(app, learner);

    await app.worker.runOnce();

    const report = app.practice.getEvaluation(learner, evaluation.id).evaluation.report!;
    expect(report.aiReview.status).toBe('skipped');
    expect(report.overall.assessedCount).toBe(0);
    expect(report.findings.length).toBeGreaterThan(0);
  });
});
