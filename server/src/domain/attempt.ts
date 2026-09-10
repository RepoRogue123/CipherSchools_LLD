import {
  emptyChangeImpact,
  emptyDesignDocument,
  type AttemptStatus,
  type ChangeImpact,
  type DesignDocument,
  type Finding,
} from '@designloop/shared';
import {
  DesignLocked,
  InvalidStateTransition,
  NotReadyForCurveball,
  NotReadyToSubmit,
  VersionConflict,
} from './errors';
import type { Problem } from './problem';
import { Submission } from './submission';

export interface AttemptSnapshot {
  id: string;
  learnerId: string;
  problemId: string;
  /** 1-based attempt number for this learner and problem. */
  number: number;
  status: AttemptStatus;
  /** Chosen at start (it rotates per attempt) but only shown once revealed. */
  curveballId: string;
  design: DesignDocument;
  changeImpact: ChangeImpact | null;
  /** Next steps carried over from the previous attempt's feedback. */
  focusGoals: string[];
  seededFromAttemptId: string | null;
  /** Optimistic-concurrency version, bumped on every change. */
  version: number;
  startedAt: Date;
  curveballRevealedAt: Date | null;
  submittedAt: Date | null;
  updatedAt: Date;
}

export interface StartAttemptParams {
  id: string;
  learnerId: string;
  problem: Problem;
  number: number;
  now: Date;
  seed?: { design: DesignDocument; fromAttemptId: string };
  focusGoals?: string[];
}

/**
 * One learner's practice attempt at one problem. Owns every practice rule:
 *   IN_PROGRESS --revealCurveball--> CURVEBALL_REVEALED --submit--> SUBMITTED
 * The core design locks at reveal, so the curveball measures how the design as
 * originally drawn absorbs change. The learner explains the impact instead of
 * quietly redesigning.
 */
export class Attempt {
  private constructor(private state: AttemptSnapshot) {}

  static start(params: StartAttemptParams): Attempt {
    return new Attempt({
      id: params.id,
      learnerId: params.learnerId,
      problemId: params.problem.id,
      number: params.number,
      status: 'IN_PROGRESS',
      curveballId: params.problem.curveballFor(params.number).id,
      design: params.seed ? structuredClone(params.seed.design) : emptyDesignDocument(),
      changeImpact: null,
      focusGoals: [...(params.focusGoals ?? [])],
      seededFromAttemptId: params.seed?.fromAttemptId ?? null,
      version: 1,
      startedAt: params.now,
      curveballRevealedAt: null,
      submittedAt: null,
      updatedAt: params.now,
    });
  }

  static restore(snapshot: AttemptSnapshot): Attempt {
    return new Attempt(structuredClone(snapshot));
  }

  toSnapshot(): AttemptSnapshot {
    return structuredClone(this.state);
  }

  get id(): string {
    return this.state.id;
  }
  get learnerId(): string {
    return this.state.learnerId;
  }
  get problemId(): string {
    return this.state.problemId;
  }
  get number(): number {
    return this.state.number;
  }
  get status(): AttemptStatus {
    return this.state.status;
  }
  get curveballId(): string {
    return this.state.curveballId;
  }
  get design(): DesignDocument {
    return structuredClone(this.state.design);
  }
  get changeImpact(): ChangeImpact | null {
    return structuredClone(this.state.changeImpact);
  }
  get focusGoals(): string[] {
    return [...this.state.focusGoals];
  }
  get seededFromAttemptId(): string | null {
    return this.state.seededFromAttemptId;
  }
  get version(): number {
    return this.state.version;
  }
  get startedAt(): Date {
    return this.state.startedAt;
  }
  get curveballRevealedAt(): Date | null {
    return this.state.curveballRevealedAt;
  }
  get submittedAt(): Date | null {
    return this.state.submittedAt;
  }
  get isCurveballRevealed(): boolean {
    return this.state.status !== 'IN_PROGRESS';
  }

  saveDesign(design: DesignDocument, expectedVersion: number, now: Date): void {
    if (this.state.status !== 'IN_PROGRESS') throw new DesignLocked();
    this.assertVersion(expectedVersion);
    this.state.design = structuredClone(design);
    this.touch(now);
  }

  /** Blockers come from the structural checks on the current design. Repeating a reveal is a no-op. */
  revealCurveball(blockers: readonly Finding[], now: Date): void {
    if (this.state.status === 'CURVEBALL_REVEALED') return;
    if (this.state.status === 'SUBMITTED') {
      throw new InvalidStateTransition('This attempt has already been submitted.');
    }
    if (blockers.length > 0) throw new NotReadyForCurveball(blockers);
    this.state.status = 'CURVEBALL_REVEALED';
    this.state.curveballRevealedAt = now;
    this.state.changeImpact = emptyChangeImpact();
    this.touch(now);
  }

  saveChangeImpact(changeImpact: ChangeImpact, expectedVersion: number, now: Date): void {
    if (this.state.status !== 'CURVEBALL_REVEALED') {
      throw new InvalidStateTransition(
        this.state.status === 'IN_PROGRESS'
          ? 'Reveal the curveball before describing its impact.'
          : 'This attempt has already been submitted.',
      );
    }
    this.assertVersion(expectedVersion);
    this.state.changeImpact = structuredClone(changeImpact);
    this.touch(now);
  }

  /** Freezes the design and change impact into an immutable submission. */
  submit(blockers: readonly Finding[], submissionId: string, now: Date): Submission {
    if (this.state.status !== 'CURVEBALL_REVEALED') {
      throw new InvalidStateTransition(
        this.state.status === 'IN_PROGRESS'
          ? 'Reveal the curveball and describe its impact before submitting.'
          : 'This attempt has already been submitted.',
      );
    }
    if (blockers.length > 0) throw new NotReadyToSubmit(blockers);
    const submission = Submission.create({
      id: submissionId,
      attemptId: this.state.id,
      learnerId: this.state.learnerId,
      problemId: this.state.problemId,
      curveballId: this.state.curveballId,
      design: this.state.design,
      changeImpact: this.state.changeImpact ?? emptyChangeImpact(),
      submittedAt: now,
    });
    this.state.status = 'SUBMITTED';
    this.state.submittedAt = now;
    this.touch(now);
    return submission;
  }

  private assertVersion(expectedVersion: number): void {
    if (expectedVersion !== this.state.version) {
      throw new VersionConflict('This attempt was changed elsewhere. Reload to continue.');
    }
  }

  private touch(now: Date): void {
    this.state.version += 1;
    this.state.updatedAt = now;
  }
}
