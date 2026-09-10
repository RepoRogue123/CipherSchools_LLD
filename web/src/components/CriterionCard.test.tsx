import type { CriterionFeedback } from '@designloop/shared';
import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { CriterionCard } from './CriterionCard';

function criterion(overrides: Partial<CriterionFeedback> = {}): CriterionFeedback {
  return {
    criterionId: 'requirements',
    name: 'Requirement understanding',
    score: 2,
    levelLabel: 'Emerging',
    evidence: [{ quote: 'ParkingLot composes floors', location: 'mapping:R1', verified: true }],
    reasoning: 'Most requirements are covered.',
    concern: 'R4 and R6 are not traced to any class.',
    suggestion: 'Map R4 to ParkingFloor.assign.',
    confidence: 'medium',
    source: 'ai',
    cap: null,
    ...overrides,
  };
}

describe('CriterionCard', () => {
  test('shows the score as a rubric level, with the reviewer’s concern and suggestion', () => {
    render(<CriterionCard criterion={criterion()} />);

    expect(screen.getByRole('img', { name: 'Emerging (2 of 4)' })).toBeInTheDocument();
    expect(screen.getByText('R4 and R6 are not traced to any class.')).toBeInTheDocument();
    expect(screen.getByText('Map R4 to ParkingFloor.assign.')).toBeInTheDocument();
    expect(screen.getByText('AI review')).toBeInTheDocument();
  });

  test('explains when an automated check capped the reviewer’s score', () => {
    render(
      <CriterionCard
        criterion={criterion({ cap: { maxScore: 2, originalScore: 4, reason: 'Only 1 of 7 requirements are mapped.' } })}
      />,
    );

    expect(screen.getByText(/Capped at 2 by an automated check \(the reviewer gave 4\)/)).toHaveTextContent(
      'Only 1 of 7 requirements are mapped.',
    );
  });

  test('flags a quote that could not be found in the submission', () => {
    render(
      <CriterionCard
        criterion={criterion({
          evidence: [
            { quote: 'ParkingLot composes floors', location: 'mapping:R1', verified: true },
            { quote: 'uses an event bus', location: 'entity:ParkingLot', verified: false },
          ],
        })}
      />,
    );

    const flags = screen.getAllByText('Not found in your submission');
    expect(flags).toHaveLength(1);
    expect(flags[0]!.parentElement).toHaveTextContent('uses an event bus');
    expect(screen.getByText(/One quote could not be matched/)).toBeInTheDocument();
  });

  test('shows an unassessed criterion without any judgement', () => {
    render(<CriterionCard criterion={criterion({ score: null, levelLabel: null, source: null, concern: '', suggestion: '', evidence: [] })} />);

    expect(screen.getByText('Not assessed in this review.')).toBeInTheDocument();
    expect(screen.queryByText('Concern')).not.toBeInTheDocument();
  });
});
