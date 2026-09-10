import type { Finding } from '@designloop/shared';
import { emptyChangeImpact, emptyDesignDocument } from '@designloop/shared';
import { describe, expect, test } from 'vitest';
import { Attempt } from '../../src/domain/attempt';
import {
  DesignLocked,
  InvalidStateTransition,
  NotReadyForCurveball,
  NotReadyToSubmit,
  VersionConflict,
} from '../../src/domain/errors';
import { Problem } from '../../src/domain/problem';
import { aDesign, aProblemData } from '../helpers/builders';

const T0 = new Date('2026-09-10T10:00:00Z');
const T1 = new Date('2026-09-10T10:20:00Z');
const T2 = new Date('2026-09-10T10:35:00Z');
const problem = new Problem(aProblemData());
const noBlockers: Finding[] = [];
const blocker: Finding = { checkId: 'entities.min', severity: 'blocker', message: 'Add at least 3 entities.' };

function startAttempt(number = 1): Attempt {
  return Attempt.start({ id: 'att-1', learnerId: 'lrn-1', problem, number, now: T0 });
}

function revealedAttempt(): Attempt {
  const attempt = startAttempt();
  attempt.saveDesign(aDesign(), attempt.version, T1);
  attempt.revealCurveball(noBlockers, T1);
  return attempt;
}

describe('Attempt.start', () => {
  test('starts in progress with an empty design and the curveball for its attempt number', () => {
    const attempt = startAttempt(2);

    expect(attempt.status).toBe('IN_PROGRESS');
    expect(attempt.design).toEqual(emptyDesignDocument());
    expect(attempt.curveballId).toBe('c-second');
    expect(attempt.startedAt).toEqual(T0);
  });

  test('can be seeded from a previous design and carries focus goals', () => {
    const seed = aDesign();
    const attempt = Attempt.start({
      id: 'att-2',
      learnerId: 'lrn-1',
      problem,
      number: 2,
      now: T0,
      seed: { design: seed, fromAttemptId: 'att-1' },
      focusGoals: ['Map every requirement to a class.'],
    });

    expect(attempt.design).toEqual(seed);
    expect(attempt.seededFromAttemptId).toBe('att-1');
    expect(attempt.focusGoals).toEqual(['Map every requirement to a class.']);
  });
});

describe('Attempt.saveDesign', () => {
  test('replaces the design and bumps the version', () => {
    const attempt = startAttempt();
    const before = attempt.version;

    attempt.saveDesign(aDesign(), before, T1);

    expect(attempt.design.entities).toHaveLength(3);
    expect(attempt.version).toBe(before + 1);
  });

  test('rejects a save based on a stale version (e.g. a second browser tab)', () => {
    const attempt = startAttempt();
    attempt.saveDesign(aDesign(), attempt.version, T1);

    expect(() => attempt.saveDesign(emptyDesignDocument(), attempt.version - 1, T1)).toThrow(VersionConflict);
  });

  test('is locked once the curveball is revealed', () => {
    const attempt = revealedAttempt();

    expect(() => attempt.saveDesign(aDesign(), attempt.version, T2)).toThrow(DesignLocked);
  });
});

describe('Attempt.revealCurveball', () => {
  test('refuses while the design has blockers and reports them', () => {
    const attempt = startAttempt();

    const error = captureError(() => attempt.revealCurveball([blocker], T1));

    expect(error).toBeInstanceOf(NotReadyForCurveball);
    expect((error as NotReadyForCurveball).blockers).toEqual([blocker]);
    expect(attempt.status).toBe('IN_PROGRESS');
  });

  test('locks the core design and opens an empty change impact', () => {
    const attempt = revealedAttempt();

    expect(attempt.status).toBe('CURVEBALL_REVEALED');
    expect(attempt.curveballRevealedAt).toEqual(T1);
    expect(attempt.changeImpact).toEqual(emptyChangeImpact());
  });

  test('is idempotent when repeated', () => {
    const attempt = revealedAttempt();
    const version = attempt.version;

    attempt.revealCurveball(noBlockers, T2);

    expect(attempt.version).toBe(version);
    expect(attempt.curveballRevealedAt).toEqual(T1);
  });
});

describe('Attempt.saveChangeImpact', () => {
  test('is not allowed before the curveball is revealed', () => {
    const attempt = startAttempt();

    expect(() => attempt.saveChangeImpact(emptyChangeImpact(), attempt.version, T1)).toThrow(
      InvalidStateTransition,
    );
  });

  test('stores the change impact after reveal', () => {
    const attempt = revealedAttempt();
    const impact = { ...emptyChangeImpact(), approach: 'Add a ChargingSpot behind ParkingSpot.' };

    attempt.saveChangeImpact(impact, attempt.version, T2);

    expect(attempt.changeImpact?.approach).toBe('Add a ChargingSpot behind ParkingSpot.');
  });
});

describe('Attempt.submit', () => {
  test('is not allowed before the curveball is revealed', () => {
    const attempt = startAttempt();

    expect(() => attempt.submit(noBlockers, 'sub-1', T2)).toThrow(InvalidStateTransition);
  });

  test('refuses while the change impact has blockers', () => {
    const attempt = revealedAttempt();
    const changeBlocker: Finding = { checkId: 'change.present', severity: 'blocker', message: 'Explain the change.' };

    expect(() => attempt.submit([changeBlocker], 'sub-1', T2)).toThrow(NotReadyToSubmit);
    expect(attempt.status).toBe('CURVEBALL_REVEALED');
  });

  test('freezes an immutable submission snapshot of exactly what was evaluated', () => {
    const attempt = revealedAttempt();
    attempt.saveChangeImpact({ ...emptyChangeImpact(), approach: 'Add ChargingSpot.' }, attempt.version, T2);

    const submission = attempt.submit(noBlockers, 'sub-1', T2);

    expect(attempt.status).toBe('SUBMITTED');
    expect(attempt.submittedAt).toEqual(T2);
    expect(submission).toMatchObject({
      id: 'sub-1',
      attemptId: 'att-1',
      learnerId: 'lrn-1',
      problemId: 'parking-lot',
      curveballId: 'c-first',
      format: 'structured-design/v1',
    });
    expect(submission.changeImpact.approach).toBe('Add ChargingSpot.');
    expect(Object.isFrozen(submission.design.entities[0])).toBe(true);
  });

  test('cannot be submitted twice', () => {
    const attempt = revealedAttempt();
    attempt.submit(noBlockers, 'sub-1', T2);

    expect(() => attempt.submit(noBlockers, 'sub-2', T2)).toThrow(InvalidStateTransition);
  });
});

describe('Attempt snapshot round-trip', () => {
  test('restoring a snapshot yields an attempt with the same state', () => {
    const attempt = revealedAttempt();

    const restored = Attempt.restore(attempt.toSnapshot());

    expect(restored.toSnapshot()).toEqual(attempt.toSnapshot());
    expect(() => restored.saveDesign(aDesign(), restored.version, T2)).toThrow(DesignLocked);
  });
});

function captureError(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  throw new Error('expected function to throw');
}
