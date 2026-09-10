import request from 'supertest';
import { beforeEach, describe, expect, test } from 'vitest';
import { emptyDesignDocument } from '@designloop/shared';
import type { Express } from 'express';
import { createApp } from '../../src/http/app';
import { AllProvidersFailedError } from '../../src/evaluation/llm/llm-client';
import { aChangeImpact, aDesign, aRubric } from '../helpers/builders';
import { aReviewReply } from '../helpers/fake-llm';
import { testApp, type TestApp } from '../helpers/harness';

const rubric = aRubric();

let app: TestApp;
let http: Express;
let learnerId: string;

async function newLearner(name = 'Asha'): Promise<string> {
  const res = await request(http).post('/api/learners').send({ name }).expect(201);
  return res.body.id as string;
}

function as(id: string) {
  return {
    get: (url: string) => request(http).get(url).set('X-Learner-Id', id),
    post: (url: string) => request(http).post(url).set('X-Learner-Id', id),
    put: (url: string) => request(http).put(url).set('X-Learner-Id', id),
  };
}

async function revealedAttempt(id: string) {
  const started = await as(id).post('/api/problems/parking-lot/attempts').send({}).expect(201);
  const attempt = started.body.attempt;
  const saved = await as(id).put(`/api/attempts/${attempt.id}/design`).send({ design: aDesign(), version: attempt.version }).expect(200);
  const revealed = await as(id).post(`/api/attempts/${attempt.id}/curveball`).expect(200);
  expect(saved.body.checks.blockerCount).toBe(0);
  return revealed.body;
}

async function submittedAttempt(id: string) {
  const attempt = await revealedAttempt(id);
  await as(id)
    .put(`/api/attempts/${attempt.id}/change-impact`)
    .send({ changeImpact: aChangeImpact(), version: attempt.version })
    .expect(200);
  const submitted = await as(id).post(`/api/attempts/${attempt.id}/submit`).expect(202);
  return { attemptId: attempt.id as string, ...submitted.body };
}

beforeEach(async () => {
  app = testApp({ llmReplies: [aReviewReply(rubric, { tradeoffs: { score: 2 } }), aReviewReply(rubric)] });
  http = createApp(app);
  learnerId = await newLearner();
});

describe('choosing a problem and designing', () => {
  test('lists problems and serves a brief without reviewer-only material', async () => {
    const problems = await as(learnerId).get('/api/problems').expect(200);
    expect(problems.body.map((p: { id: string }) => p.id)).toEqual(['parking-lot', 'elevator']);

    const brief = await as(learnerId).get('/api/problems/parking-lot').expect(200);

    expect(brief.body.requirements).toHaveLength(3);
    expect(brief.body.clarifyingQuestions[0]).toEqual({ question: 'Pricing?', answer: 'Hourly.' });
    expect(brief.body).not.toHaveProperty('curveballs');
    expect(brief.body).not.toHaveProperty('designPressures');
    expect(brief.body).not.toHaveProperty('alternativeApproaches');
  });

  test('the curveball stays hidden until the learner reveals it', async () => {
    const started = await as(learnerId).post('/api/problems/parking-lot/attempts').send({}).expect(201);
    expect(started.body.attempt.curveball).toBeNull();

    const resumed = await as(learnerId).post('/api/problems/parking-lot/attempts').send({}).expect(200);
    expect(resumed.body).toMatchObject({ resumed: true, attempt: { id: started.body.attempt.id } });

    await as(learnerId).put(`/api/attempts/${started.body.attempt.id}/design`).send({ design: aDesign(), version: 1 }).expect(200);
    const revealed = await as(learnerId).post(`/api/attempts/${started.body.attempt.id}/curveball`).expect(200);

    expect(revealed.body).toMatchObject({ status: 'CURVEBALL_REVEALED', curveball: { title: 'EV charging' } });
    await as(learnerId)
      .put(`/api/attempts/${started.body.attempt.id}/design`)
      .send({ design: aDesign(), version: revealed.body.version })
      .expect(409)
      .expect((res) => expect(res.body.error.code).toBe('DESIGN_LOCKED'));
  });
});

describe('POST /api/attempts/:id/submit', () => {
  test('returns 202 with a queued evaluation, then the report once the worker has run', async () => {
    const submitted = await submittedAttempt(learnerId);
    expect(submitted).toMatchObject({ created: true, evaluation: { status: 'QUEUED' } });

    await app.worker.runOnce();
    const evaluation = await as(learnerId).get(`/api/evaluations/${submitted.evaluation.id}`).expect(200);

    expect(evaluation.body).toMatchObject({
      status: 'COMPLETED',
      problemTitle: 'Parking Lot',
      attemptNumber: 1,
      curveball: { title: 'EV charging' },
      report: { overall: { assessedCount: 4 }, aiReview: { status: 'completed' } },
    });
    expect(evaluation.body.report.criteria.find((c: { criterionId: string }) => c.criterionId === 'tradeoffs').score).toBe(2);
    expect(evaluation.body.debrief.alternativeApproaches).toHaveLength(2);
    expect(evaluation.body.steps.map((s: { evaluatorId: string }) => s.evaluatorId)).toEqual(['llm-rubric', 'structural']);
  });

  test('a duplicate submit returns the original evaluation with 200', async () => {
    const first = await submittedAttempt(learnerId);

    const again = await as(learnerId).post(`/api/attempts/${first.attemptId}/submit`).expect(200);

    expect(again.body).toMatchObject({ created: false, submissionId: first.submissionId, evaluation: { id: first.evaluation.id } });
  });

  test('is refused with the blocking checks while the change impact is missing', async () => {
    const attempt = await revealedAttempt(learnerId);

    const res = await as(learnerId).post(`/api/attempts/${attempt.id}/submit`).expect(409);

    expect(res.body.error.code).toBe('NOT_READY_TO_SUBMIT');
    expect(res.body.error.blockers.map((b: { checkId: string }) => b.checkId)).toContain('change.approach');
  });
});

describe('review and try again', () => {
  test('history, comparison and a seeded second attempt', async () => {
    const first = await submittedAttempt(learnerId);
    await app.worker.runOnce();

    const second = await as(learnerId)
      .post('/api/problems/parking-lot/attempts')
      .send({ seedFromAttemptId: first.attemptId })
      .expect(201);
    expect(second.body).toMatchObject({ resumed: false, attempt: { number: 2, curveball: null } });
    expect(second.body.attempt.design).toEqual(aDesign());
    expect(second.body.attempt.focusGoals.length).toBeGreaterThan(0);

    const saved = await as(learnerId).put(`/api/attempts/${second.body.attempt.id}/design`).send({ design: aDesign(), version: second.body.attempt.version }).expect(200);
    const revealed = await as(learnerId).post(`/api/attempts/${saved.body.id}/curveball`).expect(200);
    expect(revealed.body.curveball.title).toBe('Reservations');
    await as(learnerId).put(`/api/attempts/${revealed.body.id}/change-impact`).send({ changeImpact: aChangeImpact(), version: revealed.body.version }).expect(200);
    await as(learnerId).post(`/api/attempts/${revealed.body.id}/submit`).expect(202);
    await app.worker.runOnce();

    const history = await as(learnerId).get('/api/problems/parking-lot/attempts').expect(200);
    expect(history.body.map((h: { number: number; scores: Record<string, number> }) => [h.number, h.scores.tradeoffs])).toEqual([
      [1, 2],
      [2, 3],
    ]);
    const comparison = await as(learnerId).get(`/api/attempts/${revealed.body.id}/comparison`).expect(200);
    expect(comparison.body.comparison.criteria.find((c: { criterionId: string }) => c.criterionId === 'tradeoffs')).toMatchObject({ previous: 2, current: 3, delta: 1 });

    const progress = await as(learnerId).get('/api/me/progress').expect(200);
    expect(progress.body.assessedAttempts).toBe(2);
  });
});

describe('failure handling over HTTP', () => {
  test('a failed evaluation exposes its partial report and can be retried', async () => {
    const outage = () => new AllProvidersFailedError([{ provider: 'gemini', kind: 'auth', message: 'bad key' }], null);
    app = testApp({ llmReplies: [outage(), aReviewReply(rubric)] });
    http = createApp(app);
    learnerId = await newLearner();
    const submitted = await submittedAttempt(learnerId);
    await app.worker.runOnce();

    const failed = await as(learnerId).get(`/api/evaluations/${submitted.evaluation.id}`).expect(200);
    expect(failed.body).toMatchObject({ status: 'FAILED', report: { partial: true, aiReview: { status: 'failed' } } });

    const retried = await as(learnerId).post(`/api/evaluations/${submitted.evaluation.id}/retry`).expect(202);
    expect(retried.body.status).toBe('QUEUED');
    await app.worker.runOnce();
    const done = await as(learnerId).get(`/api/evaluations/${submitted.evaluation.id}`).expect(200);
    expect(done.body.status).toBe('COMPLETED');
  });
});

describe('request validation and errors', () => {
  test('learner-specific endpoints require a known learner id', async () => {
    await request(http).get('/api/problems').expect(401);
    const res = await request(http).get('/api/problems').set('X-Learner-Id', 'ghost').expect(401);
    expect(res.body.error.code).toBe('UNKNOWN_LEARNER');
  });

  test('a malformed design is rejected with the validation issues', async () => {
    const started = await as(learnerId).post('/api/problems/parking-lot/attempts').send({}).expect(201);

    const res = await as(learnerId)
      .put(`/api/attempts/${started.body.attempt.id}/design`)
      .send({ design: { ...emptyDesignDocument(), entities: [{ id: 'e1', name: 'X', kind: 'widget' }] }, version: 1 })
      .expect(422);

    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(res.body.error.issues.join(' ')).toContain('design.entities.0.kind');
  });

  test('invalid JSON is a 400', async () => {
    await as(learnerId).post('/api/learners').set('content-type', 'application/json').send('{"name":').expect(400);
  });

  test('revealing the curveball early returns the blockers', async () => {
    const started = await as(learnerId).post('/api/problems/parking-lot/attempts').send({}).expect(201);

    const res = await as(learnerId).post(`/api/attempts/${started.body.attempt.id}/curveball`).expect(409);

    expect(res.body.error.code).toBe('NOT_READY_FOR_CURVEBALL');
    expect(res.body.error.blockers.map((b: { checkId: string }) => b.checkId)).toEqual(['entities.min', 'flows.min']);
  });

  test('a stale design save is a version conflict', async () => {
    const started = await as(learnerId).post('/api/problems/parking-lot/attempts').send({}).expect(201);
    const id = started.body.attempt.id;
    await as(learnerId).put(`/api/attempts/${id}/design`).send({ design: aDesign(), version: 1 }).expect(200);

    const res = await as(learnerId).put(`/api/attempts/${id}/design`).send({ design: aDesign(), version: 1 }).expect(409);

    expect(res.body.error.code).toBe('VERSION_CONFLICT');
  });

  test('another learner’s attempt looks like it does not exist', async () => {
    const started = await as(learnerId).post('/api/problems/parking-lot/attempts').send({}).expect(201);
    const ravi = await newLearner('Ravi');

    await as(ravi).get(`/api/attempts/${started.body.attempt.id}`).expect(404);
  });

  test('unknown API routes return a JSON 404', async () => {
    const res = await request(http).get('/api/nope').expect(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  test('the rubric and health endpoints are public', async () => {
    const rubricRes = await request(http).get('/api/rubric').expect(200);
    expect(rubricRes.body.criteria).toHaveLength(4);
    const health = await request(http).get('/api/health').expect(200);
    expect(health.body).toEqual({ status: 'ok', aiReview: { enabled: true, providers: [{ name: 'fake', model: 'fake-model', coolingDownUntil: null }] } });
  });
});
