import { describe, expect, test } from 'vitest';
import type { ReviewDocument } from '../../src/domain/design-format';
import { verifyEvidence } from '../../src/evaluation/llm/evidence-verifier';

const review: ReviewDocument = {
  sections: [
    {
      anchor: 'entity:ParkingFloor',
      title: 'ParkingFloor (class)',
      text: 'Responsibility: Owns its spots and assigns them atomically to arriving vehicles.',
    },
    {
      anchor: 'decision:1',
      title: 'Decision 1',
      text: 'Decision: PricingStrategy interface\nRationale: Pricing changes often and should be swappable.',
    },
  ],
};

describe('verifyEvidence', () => {
  test('verifies a verbatim quote', () => {
    const [result] = verifyEvidence([{ quote: 'assigns them atomically', location: 'entity:ParkingFloor' }], review);

    expect(result).toEqual({ quote: 'assigns them atomically', location: 'entity:ParkingFloor', verified: true });
  });

  test('ignores differences in case, whitespace and punctuation', () => {
    const [result] = verifyEvidence(
      [{ quote: '  pricing CHANGES often,   and should be swappable ', location: 'decision:1' }],
      review,
    );

    expect(result?.verified).toBe(true);
  });

  test('accepts a near-verbatim quote within the cited section', () => {
    const [result] = verifyEvidence(
      [{ quote: 'owns its spots and assigns them atomically to incoming vehicles', location: 'entity:ParkingFloor' }],
      review,
    );

    expect(result?.verified).toBe(true);
  });

  test('flags a quote that does not appear in the submission', () => {
    const [result] = verifyEvidence(
      [{ quote: 'uses a singleton ParkingLotManager with double-checked locking', location: 'entity:ParkingFloor' }],
      review,
    );

    expect(result?.verified).toBe(false);
  });

  test('does not fuzzy-match a paraphrase against the wrong section', () => {
    const [result] = verifyEvidence(
      [{ quote: 'owns its spots and assigns them atomically to incoming vehicles', location: 'decision:1' }],
      review,
    );

    expect(result?.verified).toBe(false);
  });

  test('never verifies an empty or trivially short quote', () => {
    const results = verifyEvidence(
      [
        { quote: '   ', location: 'decision:1' },
        { quote: 'a', location: 'decision:1' },
      ],
      review,
    );

    expect(results.map((r) => r.verified)).toEqual([false, false]);
  });
});
