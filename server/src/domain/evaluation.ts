import type { EvaluationStatus, FeedbackReport } from '@designloop/shared';
import { InvalidStateTransition } from './errors';
import { addMs } from './support';

/** How many times, and after what delays, a transient failure is retried automatically. */
export interface RetryPolicy {
  autoRetryDelaysMs: readonly number[];
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = { autoRetryDelaysMs: [15_000, 45_000] };

export interface EvaluationSnapshot {
  id: string;
  submissionId: string;
  status: EvaluationStatus;
  rubricVersion: string;
  promptVersion: string;
  runCount: number;
  autoRetryCount: number;
  /** Earliest time the job may be claimed (used for retry backoff). */
  notBefore: Date;
  /** While EVALUATING: if the worker dies, the job is recovered after this time. */
  leaseUntil: Date | null;
  lastError: string | null;
  /** Final report, or the partial (deterministic) report of a failed evaluation. */
  report: FeedbackReport | null;
  queuedAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  version: number;
}

export interface FailureParams {
  error: string;
  retryable: boolean;
  partialReport: FeedbackReport | null;
  now: Date;
  policy: RetryPolicy;
}

/**
 * The evaluation job for one submission, kept separate from Attempt because it is
 * slow, can fail and can be retried, and the practice flow must never wait on it.
 *   QUEUED --claim--> EVALUATING --complete--> COMPLETED
 *                     EVALUATING --recordFailure--> QUEUED (auto retry) | FAILED
 *   FAILED --retry (learner)--> QUEUED;  EVALUATING --lease expired--> QUEUED
 */
export class Evaluation {
  private constructor(private state: EvaluationSnapshot) {}

  static queue(params: {
    id: string;
    submissionId: string;
    rubricVersion: string;
    promptVersion: string;
    now: Date;
  }): Evaluation {
    return new Evaluation({
      id: params.id,
      submissionId: params.submissionId,
      status: 'QUEUED',
      rubricVersion: params.rubricVersion,
      promptVersion: params.promptVersion,
      runCount: 0,
      autoRetryCount: 0,
      notBefore: params.now,
      leaseUntil: null,
      lastError: null,
      report: null,
      queuedAt: params.now,
      startedAt: null,
      completedAt: null,
      version: 1,
    });
  }

  static restore(snapshot: EvaluationSnapshot): Evaluation {
    return new Evaluation(structuredClone(snapshot));
  }

  toSnapshot(): EvaluationSnapshot {
    return structuredClone(this.state);
  }

  get id(): string {
    return this.state.id;
  }
  get submissionId(): string {
    return this.state.submissionId;
  }
  get status(): EvaluationStatus {
    return this.state.status;
  }
  get rubricVersion(): string {
    return this.state.rubricVersion;
  }
  get promptVersion(): string {
    return this.state.promptVersion;
  }
  get runCount(): number {
    return this.state.runCount;
  }
  get leaseUntil(): Date | null {
    return this.state.leaseUntil;
  }
  get lastError(): string | null {
    return this.state.lastError;
  }
  get report(): FeedbackReport | null {
    return structuredClone(this.state.report);
  }
  get queuedAt(): Date {
    return this.state.queuedAt;
  }
  get startedAt(): Date | null {
    return this.state.startedAt;
  }
  get completedAt(): Date | null {
    return this.state.completedAt;
  }
  get version(): number {
    return this.state.version;
  }

  isClaimable(now: Date): boolean {
    return this.state.status === 'QUEUED' && this.state.notBefore.getTime() <= now.getTime();
  }

  claim(now: Date, leaseMs: number): void {
    if (!this.isClaimable(now)) {
      throw new InvalidStateTransition(`Evaluation ${this.state.id} is not claimable (${this.state.status}).`);
    }
    this.state.status = 'EVALUATING';
    this.state.runCount += 1;
    this.state.leaseUntil = addMs(now, leaseMs);
    this.state.startedAt = now;
    this.touch();
  }

  /** Heartbeat from the worker that owns the run. */
  extendLease(now: Date, leaseMs: number): void {
    this.assertEvaluating('extend the lease of');
    this.state.leaseUntil = addMs(now, leaseMs);
    this.touch();
  }

  complete(report: FeedbackReport, now: Date): void {
    this.assertEvaluating('complete');
    this.state.status = 'COMPLETED';
    this.state.report = structuredClone(report);
    this.state.completedAt = now;
    this.state.leaseUntil = null;
    this.state.lastError = null;
    this.touch();
  }

  /** Transient failures are retried with backoff; everything else fails with the partial report. */
  recordFailure(params: FailureParams): 'requeued' | 'failed' {
    this.assertEvaluating('fail');
    this.state.lastError = params.error;
    this.state.leaseUntil = null;
    const delay = params.policy.autoRetryDelaysMs[this.state.autoRetryCount];
    if (params.retryable && delay !== undefined) {
      this.state.status = 'QUEUED';
      this.state.notBefore = addMs(params.now, delay);
      this.state.autoRetryCount += 1;
      this.touch();
      return 'requeued';
    }
    this.state.status = 'FAILED';
    this.state.report = structuredClone(params.partialReport);
    this.state.completedAt = params.now;
    this.touch();
    return 'failed';
  }

  /** Learner-initiated retry. Only failed evaluations can be retried; otherwise this is a no-op. */
  retry(now: Date): boolean {
    if (this.state.status !== 'FAILED') return false;
    this.state.status = 'QUEUED';
    this.state.notBefore = now;
    this.state.autoRetryCount = 0;
    this.state.completedAt = null;
    this.touch();
    return true;
  }

  /** Crash recovery: a run whose lease expired is handed back to the queue. */
  recoverExpiredLease(now: Date): boolean {
    const lease = this.state.leaseUntil;
    if (this.state.status !== 'EVALUATING' || lease === null || lease.getTime() > now.getTime()) {
      return false;
    }
    this.state.status = 'QUEUED';
    this.state.leaseUntil = null;
    this.state.notBefore = now;
    this.touch();
    return true;
  }

  private assertEvaluating(action: string): void {
    if (this.state.status !== 'EVALUATING') {
      throw new InvalidStateTransition(`Cannot ${action} evaluation ${this.state.id} in status ${this.state.status}.`);
    }
  }

  private touch(): void {
    this.state.version += 1;
  }
}
