import type { ProblemData } from '../../src/domain/problem';

export function aProblemData(overrides: Partial<ProblemData> = {}): ProblemData {
  return {
    id: 'parking-lot',
    version: 1,
    title: 'Parking Lot',
    difficulty: 'medium',
    estimatedMinutes: 40,
    summary: 'Park cars.',
    context: 'A mall garage.',
    focusConcepts: ['Strategy'],
    requirements: [
      { id: 'R1', text: 'Floors have spots.' },
      { id: 'R2', text: 'Vehicles fit compatible spots.' },
      { id: 'R3', text: 'Exit computes the fee.' },
    ],
    outOfScope: ['Payments gateway'],
    clarifyingQuestions: [{ question: 'Pricing?', answer: 'Hourly.' }],
    keyFlows: ['Vehicle enters', 'Vehicle exits'],
    designPressures: ['Pricing changes often.'],
    edgeCases: ['Lost ticket.'],
    curveballs: [
      { id: 'c-first', title: 'EV charging', description: 'Add chargers.', tests: 'Extension.' },
      { id: 'c-second', title: 'Reservations', description: 'Hold spots.', tests: 'Extension.' },
    ],
    alternativeApproaches: [
      { name: 'Strategies', summary: 'S', strengths: 'St', tradeoffs: 'T' },
      { name: 'Tables', summary: 'S', strengths: 'St', tradeoffs: 'T' },
    ],
    ...overrides,
  };
}
