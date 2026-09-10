import type { FeedbackReport } from '@designloop/shared';
import { VersionConflict } from '../domain/errors';
import type { Evaluation, RetryPolicy } from '../domain/evaluation';
import { EvaluatorError } from '../domain/evaluator';
import type { Clock, EvaluationRepository, SubmissionRepository } from '../domain/ports';
import type { EvaluationPipeline } from '../evaluation/evaluation-pipeline';
import type { Logger } from './logger';

export interface WorkerOptions {
  /** Safety-net poll interval; submissions also wake the worker immediately via notify(). */
  pollIntervalMs: number;
  /** How long a claimed job is reserved; renewed by heartbeat while the run is alive. */
  leaseMs: number;
  retryPolicy: RetryPolicy;
}

export interface WorkerDependencies {
  evaluations: EvaluationRepository;
  submissions: SubmissionRepository;
  pipeline: EvaluationPipeline;
  clock: Clock;
  logger: Logger;
}

type RunOutcome =
  | { status: 'completed'; report: FeedbackReport }
  | { status: 'failed'; report: FeedbackReport | null; error: string; retryable: boolean };

/**
 * In-process background worker over a database-backed queue. API requests never
 * wait for AI review. Jobs survive restarts because the queue is the
 * evaluations table. Claims use optimistic versioning, so this can later be
 * moved into a separate process (or several) without changing the logic.
 */
export class EvaluationWorker {
  private timer: ReturnType<typeof setInterval> | null = null;
  private draining: Promise<void> | null = null;
  private stopped = true;

  constructor(
    private readonly deps: WorkerDependencies,
    private readonly options: WorkerOptions,
  ) {}

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.timer = setInterval(() => this.notify(), this.options.pollIntervalMs);
    this.timer.unref?.();
    this.notify();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    await this.draining;
  }

  /** Wake the worker (e.g. right after a submission). No-op if it is already draining or stopped. */
  notify(): void {
    if (this.stopped || this.draining) return;
    this.draining = this.drain()
      .catch((error: unknown) => this.deps.logger.error('Evaluation worker loop failed', { error: String(error) }))
      .finally(() => {
        this.draining = null;
      });
  }

  /** Claims and processes at most one job. Returns false when nothing was due. */
  async runOnce(): Promise<boolean> {
    const now = this.deps.clock.now();
    this.recoverExpiredLeases(now);
    const evaluation = this.claimNext(now);
    if (!evaluation) return false;
    await this.process(evaluation);
    return true;
  }

  private async drain(): Promise<void> {
    while (!this.stopped && (await this.runOnce())) {
      // keep going while there is due work
    }
  }

  private recoverExpiredLeases(now: Date): void {
    for (const evaluation of this.deps.evaluations.findExpiredLeases(now)) {
      const loadedVersion = evaluation.version;
      if (!evaluation.recoverExpiredLease(now)) continue;
      try {
        this.deps.evaluations.save(evaluation, loadedVersion);
        this.deps.logger.warn('Re-queued an evaluation whose worker stopped responding', { evaluationId: evaluation.id });
      } catch (error) {
        if (!(error instanceof VersionConflict)) throw error;
      }
    }
  }

  private claimNext(now: Date): Evaluation | null {
    for (const candidate of this.deps.evaluations.findClaimable(now, 5)) {
      const loadedVersion = candidate.version;
      candidate.claim(now, this.options.leaseMs);
      try {
        this.deps.evaluations.save(candidate, loadedVersion);
        return candidate;
      } catch (error) {
        if (error instanceof VersionConflict) continue; // another worker got it first
        throw error;
      }
    }
    return null;
  }

  private async process(evaluation: Evaluation): Promise<void> {
    const heartbeat = setInterval(() => this.heartbeat(evaluation), Math.max(1_000, this.options.leaseMs / 3));
    heartbeat.unref?.();
    try {
      const outcome = await this.run(evaluation);
      const now = this.deps.clock.now();
      const loadedVersion = evaluation.version;
      if (outcome.status === 'completed') {
        evaluation.complete(outcome.report, now);
        this.deps.logger.info('Evaluation completed', { evaluationId: evaluation.id, runCount: evaluation.runCount });
      } else {
        const result = evaluation.recordFailure({
          error: outcome.error,
          retryable: outcome.retryable,
          partialReport: outcome.report,
          now,
          policy: this.options.retryPolicy,
        });
        this.deps.logger.warn(result === 'requeued' ? 'Evaluation will be retried' : 'Evaluation failed', {
          evaluationId: evaluation.id,
          error: outcome.error,
        });
      }
      this.deps.evaluations.save(evaluation, loadedVersion);
    } catch (error) {
      // Leaving the job EVALUATING is safe: its lease expires and it is re-queued.
      const message = error instanceof VersionConflict ? 'Lost ownership of evaluation; result discarded' : 'Evaluation run crashed';
      this.deps.logger.error(message, { evaluationId: evaluation.id, error: String(error) });
    } finally {
      clearInterval(heartbeat);
    }
  }

  private async run(evaluation: Evaluation): Promise<RunOutcome> {
    const submission = this.deps.submissions.get(evaluation.submissionId);
    if (!submission) return { status: 'failed', report: null, error: 'Submission not found.', retryable: false };
    try {
      return await this.deps.pipeline.run(evaluation.id, submission);
    } catch (error) {
      return {
        status: 'failed',
        report: null,
        error: error instanceof Error ? error.message : String(error),
        retryable: error instanceof EvaluatorError && error.retryable,
      };
    }
  }

  private heartbeat(evaluation: Evaluation): void {
    const loadedVersion = evaluation.version;
    try {
      evaluation.extendLease(this.deps.clock.now(), this.options.leaseMs);
      this.deps.evaluations.save(evaluation, loadedVersion);
    } catch (error) {
      this.deps.logger.warn('Could not extend evaluation lease', { evaluationId: evaluation.id, error: String(error) });
    }
  }
}
