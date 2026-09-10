import type { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, test } from 'vitest';
import { Attempt } from '../../src/domain/attempt';
import { VersionConflict } from '../../src/domain/errors';
import { Evaluation } from '../../src/domain/evaluation';
import { Learner } from '../../src/domain/learner';
import { Problem } from '../../src/domain/problem';
import { openDatabase } from '../../src/infrastructure/sqlite/database';
import { MIGRATIONS, migrate } from '../../src/infrastructure/sqlite/migrations';
import {
  SqliteAttemptRepository,
  SqliteEvaluationRepository,
  SqliteLearnerRepository,
  SqliteSubmissionRepository,
  SqliteTransactionRunner,
} from '../../src/infrastructure/sqlite/repositories';
import { aDesign, aProblemData, aReport } from '../helpers/builders';

const T0 = new Date('2026-09-10T10:00:00.000Z');
const at = (seconds: number) => new Date(T0.getTime() + seconds * 1000);
const problem = new Problem(aProblemData());

let db: DatabaseSync;
let learners: SqliteLearnerRepository;
let attempts: SqliteAttemptRepository;
let submissions: SqliteSubmissionRepository;
let evaluations: SqliteEvaluationRepository;

beforeEach(() => {
  db = openDatabase(':memory:');
  learners = new SqliteLearnerRepository(db);
  attempts = new SqliteAttemptRepository(db);
  submissions = new SqliteSubmissionRepository(db);
  evaluations = new SqliteEvaluationRepository(db);
  learners.insert(Learner.register({ id: 'lrn-1', name: 'Asha', now: T0 }));
});

function newAttempt(id = 'att-1', number = 1): Attempt {
  return Attempt.start({ id, learnerId: 'lrn-1', problem, number, now: T0 });
}

function submittedAttempt(): { attempt: Attempt; submissionId: string } {
  const attempt = newAttempt();
  attempts.insert(attempt);
  const loaded = attempt.version;
  attempt.saveDesign(aDesign(), attempt.version, at(60));
  attempt.revealCurveball([], at(60));
  const submission = attempt.submit([], 'sub-1', at(120));
  attempts.save(attempt, loaded);
  submissions.insert(submission);
  return { attempt, submissionId: submission.id };
}

function queuedEvaluation(id = 'ev-1', submissionId = 'sub-1', now = T0): Evaluation {
  return Evaluation.queue({ id, submissionId, rubricVersion: 'v1', promptVersion: 'lld-review/v1', now });
}

describe('database', () => {
  test('re-running migrations on an existing database is a no-op', () => {
    expect(() => migrate(db)).not.toThrow();
    const applied = db.prepare('SELECT COUNT(*) AS n FROM schema_migrations').get() as { n: number };
    expect(Number(applied.n)).toBe(MIGRATIONS.length);
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all()
      .map((row) => (row as { name: string }).name);
    expect(tables).toEqual(
      expect.arrayContaining(['attempts', 'evaluation_steps', 'evaluations', 'learners', 'submissions']),
    );
  });
});

describe('SqliteLearnerRepository', () => {
  test('round-trips a learner', () => {
    expect(learners.get('lrn-1')).toMatchObject({ id: 'lrn-1', name: 'Asha', createdAt: T0 });
    expect(learners.get('nobody')).toBeUndefined();
  });
});

describe('SqliteAttemptRepository', () => {
  test('round-trips every field of an attempt', () => {
    const attempt = newAttempt();
    attempts.insert(attempt);
    const loaded = attempt.version;
    attempt.saveDesign(aDesign(), attempt.version, at(30));
    attempts.save(attempt, loaded);

    expect(attempts.get('att-1')?.toSnapshot()).toEqual(attempt.toSnapshot());
  });

  test('rejects a save from a stale copy', () => {
    const attempt = newAttempt();
    attempts.insert(attempt);
    const tabA = attempts.get('att-1')!;
    const tabB = attempts.get('att-1')!;
    tabA.saveDesign(aDesign(), tabA.version, at(10));
    attempts.save(tabA, 1);
    tabB.saveDesign(aDesign(), tabB.version, at(11));

    expect(() => attempts.save(tabB, 1)).toThrow(VersionConflict);
  });

  test('finds the open attempt until it is submitted', () => {
    const attempt = newAttempt();
    attempts.insert(attempt);
    expect(attempts.findOpen('lrn-1', 'parking-lot')?.id).toBe('att-1');

    const loaded = attempt.version;
    attempt.saveDesign(aDesign(), attempt.version, at(1));
    attempt.revealCurveball([], at(2));
    attempt.submit([], 'sub-1', at(3));
    attempts.save(attempt, loaded);

    expect(attempts.findOpen('lrn-1', 'parking-lot')).toBeUndefined();
  });

  test('the database refuses a second open attempt for the same learner and problem', () => {
    attempts.insert(newAttempt('att-1', 1));

    expect(() => attempts.insert(newAttempt('att-2', 2))).toThrow();
  });

  test('numbers attempts per learner and problem', () => {
    expect(attempts.nextNumber('lrn-1', 'parking-lot')).toBe(1);
    submittedAttempt();
    expect(attempts.nextNumber('lrn-1', 'parking-lot')).toBe(2);
    expect(attempts.nextNumber('lrn-1', 'elevator')).toBe(1);
  });

  test('lists attempts for a problem in attempt order', () => {
    submittedAttempt();
    attempts.insert(newAttempt('att-2', 2));

    expect(attempts.listForProblem('lrn-1', 'parking-lot').map((a) => a.id)).toEqual(['att-1', 'att-2']);
    expect(attempts.listForLearner('lrn-1')).toHaveLength(2);
  });
});

describe('SqliteSubmissionRepository', () => {
  test('round-trips a submission and finds it by attempt', () => {
    submittedAttempt();

    const stored = submissions.get('sub-1')!;

    expect(stored.design).toEqual(aDesign());
    expect(stored.submittedAt).toEqual(at(120));
    expect(submissions.findByAttempt('att-1')?.contentHash).toBe(stored.contentHash);
  });
});

describe('SqliteEvaluationRepository', () => {
  beforeEach(() => {
    submittedAttempt();
  });

  test('round-trips an evaluation including its report', () => {
    const evaluation = queuedEvaluation();
    evaluations.insert(evaluation);
    const loaded = evaluation.version;
    evaluation.claim(T0, 120_000);
    evaluation.complete(aReport(), at(5));
    evaluations.save(evaluation, loaded);

    expect(evaluations.get('ev-1')?.toSnapshot()).toEqual(evaluation.toSnapshot());
    expect(evaluations.findBySubmission('sub-1')?.id).toBe('ev-1');
  });

  test('only one of two workers can claim the same job', () => {
    evaluations.insert(queuedEvaluation());
    const workerA = evaluations.get('ev-1')!;
    const workerB = evaluations.get('ev-1')!;
    workerA.claim(T0, 120_000);
    workerB.claim(T0, 120_000);

    evaluations.save(workerA, 1);

    expect(() => evaluations.save(workerB, 1)).toThrow(VersionConflict);
  });

  test('finds claimable jobs whose backoff has elapsed, oldest first', () => {
    evaluations.insert(queuedEvaluation('ev-1', 'sub-1', at(10)));
    const { submissionId } = secondSubmission();
    evaluations.insert(queuedEvaluation('ev-2', submissionId, at(5)));

    expect(evaluations.findClaimable(at(4), 10)).toEqual([]);
    expect(evaluations.findClaimable(at(10), 10).map((e) => e.id)).toEqual(['ev-2', 'ev-1']);
    expect(evaluations.findClaimable(at(10), 1).map((e) => e.id)).toEqual(['ev-2']);
  });

  test('finds evaluations whose lease has expired', () => {
    const evaluation = queuedEvaluation();
    evaluations.insert(evaluation);
    evaluation.claim(T0, 60_000);
    evaluations.save(evaluation, 1);

    expect(evaluations.findExpiredLeases(at(59))).toEqual([]);
    expect(evaluations.findExpiredLeases(at(61)).map((e) => e.id)).toEqual(['ev-1']);
  });

  test('upserts and lists evaluation steps', () => {
    evaluations.insert(queuedEvaluation());
    evaluations.saveStep({ evaluationId: 'ev-1', evaluatorId: 'llm-rubric', status: 'FAILED', output: null, detail: 'rate limited', updatedAt: at(1) });
    evaluations.saveStep({ evaluationId: 'ev-1', evaluatorId: 'structural', status: 'COMPLETED', output: null, detail: null, updatedAt: at(1) });
    evaluations.saveStep({ evaluationId: 'ev-1', evaluatorId: 'llm-rubric', status: 'SKIPPED', output: null, detail: 'no providers', updatedAt: at(2) });

    const steps = evaluations.listSteps('ev-1');

    expect(steps.map((s) => [s.evaluatorId, s.status])).toEqual([
      ['llm-rubric', 'SKIPPED'],
      ['structural', 'COMPLETED'],
    ]);
  });
});

describe('SqliteTransactionRunner', () => {
  test('rolls back every write when the work throws', () => {
    const tx = new SqliteTransactionRunner(db);

    expect(() =>
      tx.run(() => {
        attempts.insert(newAttempt());
        throw new Error('boom');
      }),
    ).toThrow('boom');

    expect(attempts.get('att-1')).toBeUndefined();
  });

  test('commits when the work succeeds and supports nesting', () => {
    const tx = new SqliteTransactionRunner(db);

    const result = tx.run(() => tx.run(() => {
      attempts.insert(newAttempt());
      return 'done';
    }));

    expect(result).toBe('done');
    expect(attempts.get('att-1')).toBeDefined();
  });
});

function secondSubmission(): { submissionId: string } {
  const other = new Problem(aProblemData({ id: 'elevator' }));
  const attempt = Attempt.start({ id: 'att-9', learnerId: 'lrn-1', problem: other, number: 1, now: T0 });
  attempts.insert(attempt);
  attempt.saveDesign(aDesign(), 1, T0);
  attempt.revealCurveball([], T0);
  const submission = attempt.submit([], 'sub-9', T0);
  attempts.save(attempt, 1);
  submissions.insert(submission);
  return { submissionId: submission.id };
}
