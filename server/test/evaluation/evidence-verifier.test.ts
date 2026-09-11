import { describe, expect, test } from 'vitest';
import type { ReviewDocument } from '../../src/domain/design-format';
import { verifyEvidence } from '../../src/evaluation/llm/evidence-verifier';

const review: ReviewDocument = {
  sections: [
    {
      anchor: 'entity:ParkingFloor',
      title: 'ParkingFloor (class)',
      titleByLearner: true,
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

  test('drops a quote that is only a section heading, since headings are not the learner’s words', () => {
    const results = verifyEvidence(
      [
        { quote: '[decision:1] Decision 1', location: 'decision:1' },
        { quote: 'Decision 1', location: 'decision:1' },
        { quote: 'Pricing changes often and should be swappable.', location: 'decision:1' },
      ],
      review,
    );

    expect(results.map((r) => r.quote)).toEqual(['Pricing changes often and should be swappable.']);
  });

  test('verifies a quote that runs on from one of our headings into the learner’s text', () => {
    const results = verifyEvidence(
      [
        { quote: '[decision:1] Decision 1 Decision: PricingStrategy interface', location: 'decision:1' },
        {
          quote: '[entity:ParkingFloor] ParkingFloor (class) Responsibility: Owns its spots and assigns them atomically',
          location: 'entity:ParkingFloor',
        },
      ],
      review,
    );

    expect(results.map((r) => r.verified)).toEqual([true, true]);
  });

  test('counts an entity’s name and kind as the learner’s words, because the learner chose them', () => {
    const results = verifyEvidence(
      [
        { quote: 'ParkingFloor (class)', location: 'entity:ParkingFloor' },
        { quote: '[entity:ParkingFloor] ParkingFloor (class)', location: 'entity:ParkingFloor' },
      ],
      review,
    );

    expect(results.map((r) => r.verified)).toEqual([true, true]);
  });

  test('does not accept the problem’s own requirement text, shown in a heading, as the learner’s evidence', () => {
    const withMapping: ReviewDocument = {
      sections: [
        {
          anchor: 'mapping:R7',
          title: 'R7: Several gates operate at the same time, and a spot must never be assigned to two vehicles.',
          text: 'ParkingFloor.tryReserve runs under a per-floor lock.',
        },
      ],
    };

    const results = verifyEvidence(
      [
        { quote: 'Several gates operate at the same time, and a spot must never be assigned to two vehicles', location: 'mapping:R7' },
        { quote: 'ParkingFloor.tryReserve runs under a per-floor lock', location: 'mapping:R7' },
        {
          quote: 'R7: Several gates operate at the same time, and a spot must never be assigned to two vehicles. ParkingFloor.tryReserve runs under a per-floor lock',
          location: 'mapping:R7',
        },
      ],
      withMapping,
    );

    expect(results.map((r) => r.verified)).toEqual([false, true, true]);
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
