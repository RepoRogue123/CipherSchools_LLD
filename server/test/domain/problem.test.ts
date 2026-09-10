import { describe, expect, test } from 'vitest';
import { Problem } from '../../src/domain/problem';
import { aProblemData } from '../helpers/builders';

describe('Problem', () => {
  test('rotates curveballs so each new attempt faces a change it has not seen', () => {
    const problem = new Problem(aProblemData());

    expect(problem.curveballFor(1).id).toBe('c-first');
    expect(problem.curveballFor(2).id).toBe('c-second');
    expect(problem.curveballFor(3).id).toBe('c-first');
  });

  test('rejects attempt numbers below one', () => {
    const problem = new Problem(aProblemData());

    expect(() => problem.curveballFor(0)).toThrow(RangeError);
  });

  test('exposes requirement ids in declared order', () => {
    const problem = new Problem(aProblemData());

    expect(problem.requirementIds).toEqual(['R1', 'R2', 'R3']);
  });
});
