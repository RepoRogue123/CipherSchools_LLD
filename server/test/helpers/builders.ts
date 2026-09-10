import type { ChangeImpact, DesignDocument, FeedbackReport } from '@designloop/shared';
import type { EvaluationContext, EvaluatorOutput } from '../../src/domain/evaluator';
import { Problem, type ProblemData } from '../../src/domain/problem';
import { Rubric } from '../../src/domain/rubric';
import { Submission } from '../../src/domain/submission';
import { StructuredDesignFormatV1 } from '../../src/evaluation/formats/structured-design-v1';

export function aChangeImpact(): ChangeImpact {
  return {
    approach: 'Add a ChargingSpot type and an EnergyFee component behind PricingStrategy; ParkingFloor learns to allocate it.',
    modifiedEntityIds: ['e2'],
    newEntities: [
      { id: 'n1', name: 'ChargingSpot', responsibility: 'A spot with a charger that meters energy.' },
      { id: 'n2', name: 'EnergyFee', responsibility: 'Adds the per-kWh cost.' },
    ],
    risks: 'Pricing now has two components.',
  };
}

export function aSubmission(overrides: { design?: DesignDocument; changeImpact?: ChangeImpact } = {}): Submission {
  return Submission.create({
    id: 'sub-1',
    attemptId: 'att-1',
    learnerId: 'lrn-1',
    problemId: 'parking-lot',
    curveballId: 'c-first',
    design: overrides.design ?? aDesign(),
    changeImpact: overrides.changeImpact ?? aChangeImpact(),
    submittedAt: new Date('2026-09-10T10:30:00Z'),
  });
}

/** A fully built evaluation context over `aDesign()`, using the real format adapter. */
export function aContext(overrides: Partial<EvaluationContext> = {}): EvaluationContext {
  const problem = overrides.problem ?? new Problem(aProblemData());
  const submission = overrides.submission ?? aSubmission();
  const format = new StructuredDesignFormatV1();
  const model = format.toModel(submission.design, submission.changeImpact);
  return {
    submission,
    problem,
    curveball: problem.findCurveball(submission.curveballId)!,
    rubric: aRubric(),
    model,
    review: format.render(model, problem),
    priorOutputs: new Map<string, EvaluatorOutput>(),
    ...overrides,
  };
}

/** A four-criterion rubric with literal labels, for tests that need hand-checkable expectations. */
export function aRubric(): Rubric {
  const levels = { '1': 'one', '2': 'two', '3': 'three', '4': 'four' };
  return new Rubric(
    'test-rubric',
    'v1',
    [
      { score: 1, label: 'Missing' },
      { score: 2, label: 'Emerging' },
      { score: 3, label: 'Solid' },
      { score: 4, label: 'Strong' },
    ],
    [
      { id: 'requirements', name: 'Requirement understanding', question: 'Q1?', levels },
      { id: 'responsibilities', name: 'Class responsibilities', question: 'Q2?', levels },
      { id: 'tradeoffs', name: 'Explanation & trade-offs', question: 'Q3?', levels },
      { id: 'robustness', name: 'Edge cases & testability', question: 'Q4?', levels },
    ],
  );
}

/** A small but complete Parking Lot design: passes every blocker check. */
export function aDesign(): DesignDocument {
  return {
    assumptions: 'Single lot; payment gateway is external and can fail.',
    entities: [
      {
        id: 'e1',
        name: 'ParkingLot',
        kind: 'class',
        responsibility: 'Entry point that coordinates floors and issues tickets.',
        attributes: 'floors: List<ParkingFloor>',
        methods: 'park(vehicle): Ticket\nunpark(ticket): Receipt',
      },
      {
        id: 'e2',
        name: 'ParkingFloor',
        kind: 'class',
        responsibility: 'Owns its spots and assigns them atomically.',
        attributes: 'spots: List<ParkingSpot>',
        methods: 'assign(vehicle): ParkingSpot',
      },
      {
        id: 'e3',
        name: 'PricingStrategy',
        kind: 'interface',
        responsibility: 'Computes the fee for a ticket.',
        attributes: '',
        methods: 'fee(ticket, exitTime): Money',
      },
    ],
    relationships: [
      { id: 'r1', fromId: 'e1', type: 'composes', toId: 'e2', note: '' },
      { id: 'r2', fromId: 'e1', type: 'depends', toId: 'e3', note: 'fee calculation' },
    ],
    requirementMappings: {
      R1: 'ParkingLot composes ParkingFloor objects.',
      R2: 'ParkingFloor.assign checks compatibility.',
      R3: 'ParkingLot.unpark uses PricingStrategy.',
    },
    flows: [
      { id: 'f1', name: 'Vehicle enters', steps: 'Gate calls ParkingLot.park, which asks each ParkingFloor to assign.' },
    ],
    edgeCases: 'Two gates racing for the last spot: ParkingFloor.assign is synchronised.',
    decisions: [
      {
        id: 'd1',
        decision: 'PricingStrategy interface',
        alternative: 'Fee table inside ParkingLot',
        rationale: 'Pricing changes often and should be swappable.',
      },
    ],
  };
}

export function aReport(overrides: Partial<FeedbackReport> = {}): FeedbackReport {
  return {
    rubricVersion: 'v1',
    overall: { mean: 3, band: 'Solid', assessedCount: 1, totalCriteria: 1 },
    criteria: [],
    findings: [],
    metrics: {
      entityCount: 3,
      abstractionCount: 1,
      relationshipCount: 2,
      requirementCoverage: { mapped: 3, total: 3 },
      flowCount: 1,
      decisionCount: 1,
      changeImpact: null,
    },
    strengths: [],
    nextSteps: [],
    summary: null,
    aiReview: { status: 'completed', provider: 'fake', model: 'fake-1', latencyMs: 1, promptVersion: 'lld-review/v1', message: null },
    partial: false,
    ...overrides,
  };
}

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
