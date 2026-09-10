import type { Difficulty } from '@designloop/shared';

export interface Requirement {
  id: string;
  text: string;
}

export interface ClarifyingQuestion {
  question: string;
  answer: string;
}

/** A change request revealed only after the learner has locked their core design. */
export interface Curveball {
  id: string;
  title: string;
  description: string;
  /** Reviewer note: what this change is meant to reveal about the design. */
  tests: string;
}

export interface AlternativeApproach {
  name: string;
  summary: string;
  strengths: string;
  tradeoffs: string;
}

export interface ProblemData {
  id: string;
  version: number;
  title: string;
  difficulty: Difficulty;
  estimatedMinutes: number;
  summary: string;
  context: string;
  focusConcepts: string[];
  requirements: Requirement[];
  outOfScope: string[];
  clarifyingQuestions: ClarifyingQuestion[];
  keyFlows: string[];
  /** Reviewer notes: what varies in this problem. Shown to the learner only after submission. */
  designPressures: string[];
  /** Reviewer notes: failure paths a strong design anticipates. */
  edgeCases: string[];
  curveballs: Curveball[];
  /** Valid designs with their trade-offs, shown after submission as alternatives, not answers. */
  alternativeApproaches: AlternativeApproach[];
}

/** An LLD practice problem. Content is data; the behaviour here is the practice rules around it. */
export class Problem {
  readonly id: string;
  readonly version: number;
  readonly title: string;
  readonly difficulty: Difficulty;
  readonly estimatedMinutes: number;
  readonly summary: string;
  readonly context: string;
  readonly focusConcepts: readonly string[];
  readonly requirements: readonly Requirement[];
  readonly outOfScope: readonly string[];
  readonly clarifyingQuestions: readonly ClarifyingQuestion[];
  readonly keyFlows: readonly string[];
  readonly designPressures: readonly string[];
  readonly edgeCases: readonly string[];
  readonly curveballs: readonly Curveball[];
  readonly alternativeApproaches: readonly AlternativeApproach[];

  constructor(data: ProblemData) {
    if (data.curveballs.length === 0) {
      throw new Error(`Problem "${data.id}" needs at least one curveball`);
    }
    this.id = data.id;
    this.version = data.version;
    this.title = data.title;
    this.difficulty = data.difficulty;
    this.estimatedMinutes = data.estimatedMinutes;
    this.summary = data.summary;
    this.context = data.context;
    this.focusConcepts = [...data.focusConcepts];
    this.requirements = data.requirements.map((r) => ({ ...r }));
    this.outOfScope = [...data.outOfScope];
    this.clarifyingQuestions = data.clarifyingQuestions.map((q) => ({ ...q }));
    this.keyFlows = [...data.keyFlows];
    this.designPressures = [...data.designPressures];
    this.edgeCases = [...data.edgeCases];
    this.curveballs = data.curveballs.map((c) => ({ ...c }));
    this.alternativeApproaches = data.alternativeApproaches.map((a) => ({ ...a }));
  }

  get requirementIds(): string[] {
    return this.requirements.map((r) => r.id);
  }

  /**
   * Curveballs rotate per attempt, so "try again" re-tests extensibility
   * against a change the learner has not already seen.
   */
  curveballFor(attemptNumber: number): Curveball {
    if (!Number.isInteger(attemptNumber) || attemptNumber < 1) {
      throw new RangeError(`Attempt number must be a positive integer, got ${attemptNumber}`);
    }
    return this.curveballs[(attemptNumber - 1) % this.curveballs.length]!;
  }

  findCurveball(id: string): Curveball | undefined {
    return this.curveballs.find((c) => c.id === id);
  }
}
