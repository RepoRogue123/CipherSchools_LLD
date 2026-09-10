import { emptyChangeImpact } from '@designloop/shared';
import { describe, expect, test } from 'vitest';
import { Submission } from '../../src/domain/submission';
import { aDesign } from '../helpers/builders';

const base = {
  id: 'sub-1',
  attemptId: 'att-1',
  learnerId: 'lrn-1',
  problemId: 'parking-lot',
  curveballId: 'c-first',
  submittedAt: new Date('2026-09-10T10:00:00Z'),
};

describe('Submission', () => {
  test('content hash ignores object key order', () => {
    const design = aDesign();
    const reordered = JSON.parse(JSON.stringify(design, Object.keys(design).reverse()));
    Object.assign(reordered, design);

    const a = Submission.create({ ...base, design, changeImpact: emptyChangeImpact() });
    const b = Submission.create({ ...base, id: 'sub-2', design: reordered, changeImpact: emptyChangeImpact() });

    expect(a.contentHash).toBe(b.contentHash);
    expect(a.contentHash).toMatch(/^[0-9a-f]{64}$/);
  });

  test('content hash changes when the content changes', () => {
    const design = aDesign();
    const changed = aDesign();
    changed.entities[0]!.responsibility = 'Something else entirely.';

    const a = Submission.create({ ...base, design, changeImpact: emptyChangeImpact() });
    const b = Submission.create({ ...base, design: changed, changeImpact: emptyChangeImpact() });

    expect(a.contentHash).not.toBe(b.contentHash);
  });

  test('is a deep copy that later edits to the source cannot change', () => {
    const design = aDesign();
    const submission = Submission.create({ ...base, design, changeImpact: emptyChangeImpact() });

    design.entities[0]!.name = 'Mutated';

    expect(submission.design.entities[0]!.name).toBe('ParkingLot');
    expect(() => {
      (submission.design.entities as unknown as unknown[]).push({});
    }).toThrow(TypeError);
  });
});
