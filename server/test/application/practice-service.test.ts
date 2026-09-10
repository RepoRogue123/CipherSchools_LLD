import { emptyChangeImpact, emptyDesignDocument } from '@designloop/shared';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import {
  NotFound,
  NotReadyForCurveball,
  NotReadyToSubmit,
  ValidationFailed,
  VersionConflict,
} from '../../src/domain/errors';
import { aDesign } from '../helpers/builders';
import { aReviewReply } from '../helpers/fake-llm';
import { submitAttempt, testApp, type TestApp } from '../helpers/harness';

let app: TestApp;
let asha: string;

beforeEach(() => {
  app = testApp({ llmReplies: [] });
  asha = app.practice.registerLearner('  Asha ').id;
});

describe('learners', () => {
  test('registers a learner and finds them again', () => {
    expect(app.practice.getLearner(asha).name).toBe('Asha');
    expect(() => app.practice.getLearner('nobody')).toThrow(NotFound);
    expect(() => app.practice.registerLearner('')).toThrow(ValidationFailed);
  });
});

describe('starting attempts', () => {
  test('starts attempt #1 with an empty design and live structure checks', () => {
    const { view, resumed } = app.practice.startAttempt(asha, 'parking-lot', null);

    expect(resumed).toBe(false);
    expect(view.attempt).toMatchObject({ number: 1, status: 'IN_PROGRESS', curveballId: 'c-first' });
    expect(view.checks.findings.map((f) => f.checkId)).toContain('entities.min');
  });

  test('starting again while an attempt is open resumes it instead of creating a duplicate', () => {
    const first = app.practice.startAttempt(asha, 'parking-lot', null);

    const second = app.practice.startAttempt(asha, 'parking-lot', null);

    expect(second.resumed).toBe(true);
    expect(second.view.attempt.id).toBe(first.view.attempt.id);
  });

  test('rejects an unknown problem', () => {
    expect(() => app.practice.startAttempt(asha, 'no-such-problem', null)).toThrow(NotFound);
  });
});

describe('designing', () => {
  test('saving returns fresh checks and refuses a stale version', () => {
    const { view } = app.practice.startAttempt(asha, 'parking-lot', null);

    const saved = app.practice.saveDesign(asha, view.attempt.id, aDesign(), view.attempt.version);

    expect(saved.checks.metrics.entityCount).toBe(3);
    expect(() => app.practice.saveDesign(asha, view.attempt.id, aDesign(), view.attempt.version)).toThrow(
      VersionConflict,
    );
  });

  test('another learner can neither read nor change my attempt', () => {
    const ravi = app.practice.registerLearner('Ravi').id;
    const { view } = app.practice.startAttempt(asha, 'parking-lot', null);

    expect(() => app.practice.getAttempt(ravi, view.attempt.id)).toThrow(NotFound);
    expect(() => app.practice.saveDesign(ravi, view.attempt.id, aDesign(), view.attempt.version)).toThrow(NotFound);
  });
});

describe('the curveball', () => {
  test('cannot be revealed while the design has blockers', () => {
    const { view } = app.practice.startAttempt(asha, 'parking-lot', null);
    app.practice.saveDesign(asha, view.attempt.id, emptyDesignDocument(), view.attempt.version);

    expect(() => app.practice.revealCurveball(asha, view.attempt.id)).toThrow(NotReadyForCurveball);
  });

  test('is revealed once the design passes the gate', () => {
    const { view } = app.practice.startAttempt(asha, 'parking-lot', null);
    app.practice.saveDesign(asha, view.attempt.id, aDesign(), view.attempt.version);

    const revealed = app.practice.revealCurveball(asha, view.attempt.id);

    expect(revealed.attempt.status).toBe('CURVEBALL_REVEALED');
    expect(revealed.curveball?.title).toBe('EV charging');
  });
});

describe('submitting', () => {
  test('stores the submission and a queued evaluation together, then wakes the worker once', () => {
    const notify = vi.spyOn(app.worker, 'notify').mockImplementation(() => undefined);

    const result = submitAttempt(app, asha);

    expect(result.created).toBe(true);
    expect(result.evaluation.status).toBe('QUEUED');
    expect(result.submission.changeImpact.newEntities).toHaveLength(2);
    const view = app.practice.getAttempt(asha, result.submission.attemptId);
    expect(view.attempt.status).toBe('SUBMITTED');
    expect(view.evaluation?.id).toBe(result.evaluation.id);
    expect(notify).toHaveBeenCalledTimes(1);
  });

  test('a duplicate submit returns the original submission and evaluation', () => {
    const notify = vi.spyOn(app.worker, 'notify').mockImplementation(() => undefined);
    const first = submitAttempt(app, asha);

    const again = app.practice.submit(asha, first.submission.attemptId);

    expect(again.created).toBe(false);
    expect(again.submission.id).toBe(first.submission.id);
    expect(again.evaluation.id).toBe(first.evaluation.id);
    expect(notify).toHaveBeenCalledTimes(1);
  });

  test('is blocked while the change impact is not explained', () => {
    expect(() => submitAttempt(app, asha, { changeImpact: emptyChangeImpact() })).toThrow(NotReadyToSubmit);
  });
});

describe('trying again', () => {
  test('a revised attempt starts from the submitted design, faces the other curveball and carries focus goals', async () => {
    app = testApp({ llmReplies: [aReviewReply(app.rubric, { tradeoffs: { score: 1, suggestion: 'Justify the pricing seam.' } })] });
    asha = app.practice.registerLearner('Asha').id;
    const first = submitAttempt(app, asha);
    await app.worker.runOnce();

    const { view } = app.practice.startAttempt(asha, 'parking-lot', first.submission.attemptId);

    expect(view.attempt).toMatchObject({
      number: 2,
      curveballId: 'c-second',
      seededFromAttemptId: first.submission.attemptId,
    });
    expect(view.attempt.design).toEqual(aDesign());
    expect(view.attempt.focusGoals[0]).toBe('Justify the pricing seam.');
  });

  test('starting fresh still carries the previous focus goals but not the design', async () => {
    app = testApp({ llmReplies: [aReviewReply(app.rubric, { robustness: { score: 1, suggestion: 'Handle the lost ticket.' } })] });
    asha = app.practice.registerLearner('Asha').id;
    submitAttempt(app, asha);
    await app.worker.runOnce();

    const { view } = app.practice.startAttempt(asha, 'parking-lot', null);

    expect(view.attempt.design).toEqual(emptyDesignDocument());
    expect(view.attempt.focusGoals).toContain('Handle the lost ticket.');
  });

  test('cannot seed from another learner’s attempt', () => {
    const first = submitAttempt(app, asha);
    const ravi = app.practice.registerLearner('Ravi').id;

    expect(() => app.practice.startAttempt(ravi, 'parking-lot', first.submission.attemptId)).toThrow(NotFound);
  });

  test('cannot seed from an attempt at a different problem', () => {
    const first = submitAttempt(app, asha);

    expect(() => app.practice.startAttempt(asha, 'elevator', first.submission.attemptId)).toThrow(
      ValidationFailed,
    );
  });
});
