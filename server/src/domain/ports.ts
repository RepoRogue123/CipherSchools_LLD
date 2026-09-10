import type { Attempt } from './attempt';
import type { Evaluation } from './evaluation';
import type { EvaluationStepRecord } from './evaluator';
import type { Learner } from './learner';
import type { Problem } from './problem';
import type { Submission } from './submission';

/** Read-only access to practice problems. File-backed today; a DB or CMS later. */
export interface ProblemCatalog {
  list(): Problem[];
  get(id: string): Problem | undefined;
}

export interface Clock {
  now(): Date;
}

export interface IdGenerator {
  next(): string;
}

/*
 * Repository ports are synchronous on purpose: the embedded SQLite driver is
 * synchronous, which keeps multi-repository transactions atomic and simple.
 * Moving to a networked database would make these async, a mechanical change
 * confined to this boundary.
 */

export interface LearnerRepository {
  insert(learner: Learner): void;
  get(id: string): Learner | undefined;
}

export interface AttemptRepository {
  insert(attempt: Attempt): void;
  /** Optimistic save: fails with VersionConflict if the stored version is not `expectedVersion`. */
  save(attempt: Attempt, expectedVersion: number): void;
  get(id: string): Attempt | undefined;
  findOpen(learnerId: string, problemId: string): Attempt | undefined;
  listForProblem(learnerId: string, problemId: string): Attempt[];
  listForLearner(learnerId: string): Attempt[];
  nextNumber(learnerId: string, problemId: string): number;
}

export interface SubmissionRepository {
  insert(submission: Submission): void;
  get(id: string): Submission | undefined;
  findByAttempt(attemptId: string): Submission | undefined;
}

export interface EvaluationRepository {
  insert(evaluation: Evaluation): void;
  /** Optimistic save: fails with VersionConflict if another worker changed the row first. */
  save(evaluation: Evaluation, expectedVersion: number): void;
  get(id: string): Evaluation | undefined;
  findBySubmission(submissionId: string): Evaluation | undefined;
  /** Queued evaluations whose backoff has elapsed, oldest first. */
  findClaimable(now: Date, limit: number): Evaluation[];
  findExpiredLeases(now: Date): Evaluation[];
  saveStep(step: EvaluationStepRecord): void;
  listSteps(evaluationId: string): EvaluationStepRecord[];
}

export interface TransactionRunner {
  /** Runs `work` atomically; any thrown error rolls everything back. */
  run<T>(work: () => T): T;
}
