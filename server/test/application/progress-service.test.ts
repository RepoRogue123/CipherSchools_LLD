import { describe, expect, test } from 'vitest';
import { aChangeImpact, aRubric } from '../helpers/builders';
import { aReviewReply } from '../helpers/fake-llm';
import { submitAttempt, testApp } from '../helpers/harness';

const rubric = aRubric();

async function learnerWithAttempts(replies: unknown[]) {
  const app = testApp({ llmReplies: replies });
  const learner = app.practice.registerLearner('Asha').id;
  const attemptIds: string[] = [];
  let seed: string | undefined;
  for (let i = 0; i < replies.length; i += 1) {
    app.clock.advance(30 * 60_000);
    const { submission } = submitAttempt(app, learner, seed ? { seedFromAttemptId: seed } : {});
    await app.worker.runOnce();
    attemptIds.push(submission.attemptId);
    seed = submission.attemptId;
  }
  return { app, learner, attemptIds };
}

describe('ProgressService.problemHistory', () => {
  test('lists each attempt with its outcome and per-criterion scores', async () => {
    const { app, learner } = await learnerWithAttempts([
      aReviewReply(rubric, { tradeoffs: { score: 1 } }),
      aReviewReply(rubric, { tradeoffs: { score: 3 } }),
    ]);

    const history = app.progress.problemHistory(learner, 'parking-lot');

    expect(history.map((h) => [h.number, h.status, h.evaluationStatus, h.curveballTitle])).toEqual([
      [1, 'SUBMITTED', 'COMPLETED', 'EV charging'],
      [2, 'SUBMITTED', 'COMPLETED', 'Reservations'],
    ]);
    expect(history[0]!.scores).toEqual({ requirements: 3, responsibilities: 3, tradeoffs: 1, robustness: 3 });
    expect(history[1]!.overall).toEqual({ mean: 3, band: 'Solid' });
  });

  test('does not reveal the curveball of an attempt still being designed', () => {
    const app = testApp();
    const learner = app.practice.registerLearner('Asha').id;
    app.practice.startAttempt(learner, 'parking-lot', null);

    expect(app.progress.problemHistory(learner, 'parking-lot')[0]!.curveballTitle).toBeNull();
  });
});

describe('ProgressService.compare', () => {
  test('shows per-criterion movement against the previous attempt', async () => {
    const { app, learner, attemptIds } = await learnerWithAttempts([
      aReviewReply(rubric, { tradeoffs: { score: 1 }, robustness: { score: 4 } }),
      aReviewReply(rubric, { tradeoffs: { score: 3 }, robustness: { score: 2 } }),
    ]);

    const comparison = app.progress.compare(learner, attemptIds[1]!)!;

    expect(comparison.previousNumber).toBe(1);
    expect(comparison.criteria.find((c) => c.criterionId === 'tradeoffs')).toMatchObject({ previous: 1, current: 3, delta: 2 });
    expect(comparison.criteria.find((c) => c.criterionId === 'robustness')).toMatchObject({ previous: 4, current: 2, delta: -2 });
    expect(comparison.overall).toEqual({ previous: 2.75, current: 2.75, delta: 0 });
    expect(comparison.rubricVersionChanged).toBe(false);
  });

  test('has nothing to compare on a first attempt', async () => {
    const { app, learner, attemptIds } = await learnerWithAttempts([aReviewReply(rubric)]);

    expect(app.progress.compare(learner, attemptIds[0]!)).toBeNull();
  });

  test('lists structure findings resolved since the previous attempt', async () => {
    const app = testApp({ llmReplies: [aReviewReply(rubric), aReviewReply(rubric)] });
    const learner = app.practice.registerLearner('Asha').id;
    const vague = { ...aChangeImpact(), modifiedEntityIds: [], newEntities: [], approach: 'We would extend the system carefully to support the new behaviour.' };
    const first = submitAttempt(app, learner, { changeImpact: vague });
    await app.worker.runOnce();
    const second = submitAttempt(app, learner, { seedFromAttemptId: first.submission.attemptId });
    await app.worker.runOnce();

    const comparison = app.progress.compare(learner, second.submission.attemptId)!;

    expect(comparison.resolvedFindings.map((f) => f.checkId)).toContain('change.no-entities');
  });
});

describe('ProgressService.progress', () => {
  test('surfaces a criterion that is weak across most attempts as a focus area', async () => {
    const { app, learner } = await learnerWithAttempts([
      aReviewReply(rubric, { tradeoffs: { score: 1 }, robustness: { score: 2 } }),
      aReviewReply(rubric, { tradeoffs: { score: 2, suggestion: 'Name the alternative you rejected.' } }),
      aReviewReply(rubric, { tradeoffs: { score: 3 } }),
    ]);

    const progress = app.progress.progress(learner);

    expect(progress.assessedAttempts).toBe(3);
    expect(progress.focusAreas.map((f) => [f.criterionId, f.weakCount])).toEqual([['tradeoffs', 2]]);
    expect(progress.focusAreas[0]!.latestSuggestion).toBe('Name the alternative you rejected.');
    expect(progress.focusAreas[0]!.occurrences.map((o) => o.attemptNumber)).toEqual([1, 2]);
  });

  test('summarises each problem with the learner’s latest attempt', async () => {
    const { app, learner } = await learnerWithAttempts([aReviewReply(rubric)]);

    const summaries = app.progress.problemSummaries(learner);

    expect(summaries.find((s) => s.id === 'parking-lot')).toMatchObject({
      attemptCount: 1,
      latest: { number: 1, status: 'SUBMITTED', evaluationStatus: 'COMPLETED', band: 'Solid' },
    });
    expect(summaries.find((s) => s.id === 'elevator')).toMatchObject({ attemptCount: 0, latest: null });
  });
});
