import { describe, expect, test } from 'vitest';
import { InvalidStateTransition } from '../../src/domain/errors';
import { Evaluation, type RetryPolicy } from '../../src/domain/evaluation';
import { aReport } from '../helpers/builders';

const T0 = new Date('2026-09-10T10:00:00Z');
const at = (seconds: number) => new Date(T0.getTime() + seconds * 1000);
const LEASE_MS = 120_000;
const policy: RetryPolicy = { autoRetryDelaysMs: [15_000, 45_000] };

function queued(): Evaluation {
  return Evaluation.queue({
    id: 'ev-1',
    submissionId: 'sub-1',
    rubricVersion: 'v1',
    promptVersion: 'lld-review/v1',
    now: T0,
  });
}

function claimed(): Evaluation {
  const evaluation = queued();
  evaluation.claim(T0, LEASE_MS);
  return evaluation;
}

describe('Evaluation lifecycle', () => {
  test('is queued and claimable immediately after submission', () => {
    const evaluation = queued();

    expect(evaluation.status).toBe('QUEUED');
    expect(evaluation.isClaimable(T0)).toBe(true);
  });

  test('claiming starts a run under a lease', () => {
    const evaluation = claimed();

    expect(evaluation.status).toBe('EVALUATING');
    expect(evaluation.runCount).toBe(1);
    expect(evaluation.leaseUntil).toEqual(at(120));
    expect(evaluation.startedAt).toEqual(T0);
  });

  test('cannot be claimed twice', () => {
    const evaluation = claimed();

    expect(() => evaluation.claim(T0, LEASE_MS)).toThrow(InvalidStateTransition);
  });

  test('completes with a report and releases the lease', () => {
    const evaluation = claimed();
    const report = aReport();

    evaluation.complete(report, at(10));

    expect(evaluation.status).toBe('COMPLETED');
    expect(evaluation.report).toEqual(report);
    expect(evaluation.completedAt).toEqual(at(10));
    expect(evaluation.leaseUntil).toBeNull();
  });

  test('cannot complete without having been claimed', () => {
    expect(() => queued().complete(aReport(), T0)).toThrow(InvalidStateTransition);
  });
});

describe('Evaluation failure handling', () => {
  test('a retryable failure re-queues with backoff while automatic retries remain', () => {
    const evaluation = claimed();

    const outcome = evaluation.recordFailure({ error: 'all providers rate limited', retryable: true, partialReport: null, now: at(5), policy });

    expect(outcome).toBe('requeued');
    expect(evaluation.status).toBe('QUEUED');
    expect(evaluation.isClaimable(at(19))).toBe(false);
    expect(evaluation.isClaimable(at(20))).toBe(true);
    expect(evaluation.lastError).toBe('all providers rate limited');
  });

  test('the second automatic retry waits for the next backoff delay', () => {
    const evaluation = claimed();
    evaluation.recordFailure({ error: 'e1', retryable: true, partialReport: null, now: at(0), policy });
    evaluation.claim(at(15), LEASE_MS);

    evaluation.recordFailure({ error: 'e2', retryable: true, partialReport: null, now: at(20), policy });

    expect(evaluation.isClaimable(at(64))).toBe(false);
    expect(evaluation.isClaimable(at(65))).toBe(true);
  });

  test('fails with the partial report once automatic retries are exhausted', () => {
    const evaluation = claimed();
    const partial = aReport({ partial: true });
    evaluation.recordFailure({ error: 'e1', retryable: true, partialReport: null, now: at(0), policy });
    evaluation.claim(at(15), LEASE_MS);
    evaluation.recordFailure({ error: 'e2', retryable: true, partialReport: null, now: at(20), policy });
    evaluation.claim(at(65), LEASE_MS);

    const outcome = evaluation.recordFailure({ error: 'e3', retryable: true, partialReport: partial, now: at(70), policy });

    expect(outcome).toBe('failed');
    expect(evaluation.status).toBe('FAILED');
    expect(evaluation.report).toEqual(partial);
    expect(evaluation.lastError).toBe('e3');
  });

  test('a non-retryable failure fails immediately', () => {
    const evaluation = claimed();

    const outcome = evaluation.recordFailure({ error: 'bug', retryable: false, partialReport: null, now: at(1), policy });

    expect(outcome).toBe('failed');
    expect(evaluation.status).toBe('FAILED');
  });

  test('a learner retry re-queues a failed evaluation with a fresh retry budget', () => {
    const evaluation = claimed();
    evaluation.recordFailure({ error: 'bug', retryable: false, partialReport: null, now: at(1), policy });

    const retried = evaluation.retry(at(100));

    expect(retried).toBe(true);
    expect(evaluation.status).toBe('QUEUED');
    expect(evaluation.isClaimable(at(100))).toBe(true);
    evaluation.claim(at(100), LEASE_MS);
    expect(evaluation.recordFailure({ error: 'again', retryable: true, partialReport: null, now: at(101), policy })).toBe('requeued');
  });

  test('retry is a no-op unless the evaluation has failed', () => {
    const evaluation = claimed();

    expect(evaluation.retry(at(1))).toBe(false);
    expect(evaluation.status).toBe('EVALUATING');
  });
});

describe('Evaluation lease recovery', () => {
  test('an evaluation whose worker died is re-queued once its lease expires', () => {
    const evaluation = claimed();

    expect(evaluation.recoverExpiredLease(at(119))).toBe(false);
    expect(evaluation.recoverExpiredLease(at(121))).toBe(true);
    expect(evaluation.status).toBe('QUEUED');
    expect(evaluation.isClaimable(at(121))).toBe(true);
  });

  test('a live worker extends its lease so slow AI calls are not mistaken for a crash', () => {
    const evaluation = claimed();

    evaluation.extendLease(at(100), LEASE_MS);

    expect(evaluation.leaseUntil).toEqual(at(220));
    expect(evaluation.recoverExpiredLease(at(150))).toBe(false);
  });

  test('only a running evaluation can extend its lease', () => {
    expect(() => queued().extendLease(T0, LEASE_MS)).toThrow(InvalidStateTransition);
  });
});
