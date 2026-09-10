import { describe, expect, test } from 'vitest';
import { ValidationFailed } from '../../src/domain/errors';
import { Learner } from '../../src/domain/learner';

const now = new Date('2026-09-10T10:00:00Z');

describe('Learner.register', () => {
  test('trims the display name', () => {
    const learner = Learner.register({ id: 'lrn-1', name: '  Asha  ', now });

    expect(learner.name).toBe('Asha');
  });

  test.each(['', '   ', 'x'.repeat(61)])('rejects an unusable name %#', (name) => {
    expect(() => Learner.register({ id: 'lrn-1', name, now })).toThrow(ValidationFailed);
  });
});
