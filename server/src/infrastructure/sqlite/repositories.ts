import type { DatabaseSync, SQLInputValue } from 'node:sqlite';
import type { AttemptStatus, EvaluationStatus, StepStatus } from '@designloop/shared';
import { Attempt } from '../../domain/attempt';
import { VersionConflict } from '../../domain/errors';
import { Evaluation } from '../../domain/evaluation';
import type { EvaluationStepRecord } from '../../domain/evaluator';
import { Learner } from '../../domain/learner';
import type {
  AttemptRepository,
  EvaluationRepository,
  LearnerRepository,
  SubmissionRepository,
  TransactionRunner,
} from '../../domain/ports';
import { Submission, type SubmissionFormat } from '../../domain/submission';

type Row = Record<string, unknown>;

const iso = (date: Date | null): string | null => (date ? date.toISOString() : null);
const toDate = (value: unknown): Date => new Date(String(value));
const toDateOrNull = (value: unknown): Date | null => (value === null ? null : toDate(value));
const json = (value: unknown): string | null => (value === null ? null : JSON.stringify(value));
const parse = <T>(value: unknown): T => JSON.parse(String(value)) as T;
const parseOrNull = <T>(value: unknown): T | null => (value === null ? null : parse<T>(value));

function changes(result: { changes: number | bigint }): number {
  return Number(result.changes);
}

export class SqliteTransactionRunner implements TransactionRunner {
  private depth = 0;

  constructor(private readonly db: DatabaseSync) {}

  run<T>(work: () => T): T {
    if (this.depth > 0) return work();
    this.db.exec('BEGIN IMMEDIATE');
    this.depth += 1;
    try {
      const result = work();
      if (result instanceof Promise) {
        throw new Error('Transactions must be synchronous; do not await inside a transaction.');
      }
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    } finally {
      this.depth -= 1;
    }
  }
}

export class SqliteLearnerRepository implements LearnerRepository {
  constructor(private readonly db: DatabaseSync) {}

  insert(learner: Learner): void {
    this.db
      .prepare('INSERT INTO learners (id, name, created_at) VALUES (?, ?, ?)')
      .run(learner.id, learner.name, learner.createdAt.toISOString());
  }

  get(id: string): Learner | undefined {
    const row = this.db.prepare('SELECT * FROM learners WHERE id = ?').get(id) as Row | undefined;
    return row
      ? Learner.restore({ id: String(row.id), name: String(row.name), createdAt: toDate(row.created_at) })
      : undefined;
  }
}

export class SqliteAttemptRepository implements AttemptRepository {
  constructor(private readonly db: DatabaseSync) {}

  insert(attempt: Attempt): void {
    const values = this.columns(attempt);
    this.db
      .prepare(
        `INSERT INTO attempts (id, learner_id, problem_id, number, status, curveball_id, design_json,
           change_impact_json, focus_goals_json, seeded_from_attempt_id, version, started_at,
           curveball_revealed_at, submitted_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(...values);
  }

  save(attempt: Attempt, expectedVersion: number): void {
    const s = attempt.toSnapshot();
    const result = this.db
      .prepare(
        `UPDATE attempts SET status = ?, design_json = ?, change_impact_json = ?, focus_goals_json = ?,
           version = ?, curveball_revealed_at = ?, submitted_at = ?, updated_at = ?
         WHERE id = ? AND version = ?`,
      )
      .run(
        s.status,
        JSON.stringify(s.design),
        json(s.changeImpact),
        JSON.stringify(s.focusGoals),
        s.version,
        iso(s.curveballRevealedAt),
        iso(s.submittedAt),
        s.updatedAt.toISOString(),
        s.id,
        expectedVersion,
      );
    if (changes(result) === 0) {
      throw new VersionConflict('This attempt was changed elsewhere. Reload to continue.');
    }
  }

  get(id: string): Attempt | undefined {
    const row = this.db.prepare('SELECT * FROM attempts WHERE id = ?').get(id) as Row | undefined;
    return row ? this.toAttempt(row) : undefined;
  }

  findOpen(learnerId: string, problemId: string): Attempt | undefined {
    const row = this.db
      .prepare(`SELECT * FROM attempts WHERE learner_id = ? AND problem_id = ? AND status <> 'SUBMITTED'`)
      .get(learnerId, problemId) as Row | undefined;
    return row ? this.toAttempt(row) : undefined;
  }

  listForProblem(learnerId: string, problemId: string): Attempt[] {
    return (
      this.db
        .prepare('SELECT * FROM attempts WHERE learner_id = ? AND problem_id = ? ORDER BY number')
        .all(learnerId, problemId) as Row[]
    ).map((row) => this.toAttempt(row));
  }

  listForLearner(learnerId: string): Attempt[] {
    return (
      this.db
        .prepare('SELECT * FROM attempts WHERE learner_id = ? ORDER BY started_at')
        .all(learnerId) as Row[]
    ).map((row) => this.toAttempt(row));
  }

  nextNumber(learnerId: string, problemId: string): number {
    const row = this.db
      .prepare('SELECT COALESCE(MAX(number), 0) AS last FROM attempts WHERE learner_id = ? AND problem_id = ?')
      .get(learnerId, problemId) as { last: number };
    return Number(row.last) + 1;
  }

  private columns(attempt: Attempt): SQLInputValue[] {
    const s = attempt.toSnapshot();
    return [
      s.id,
      s.learnerId,
      s.problemId,
      s.number,
      s.status,
      s.curveballId,
      JSON.stringify(s.design),
      json(s.changeImpact),
      JSON.stringify(s.focusGoals),
      s.seededFromAttemptId,
      s.version,
      s.startedAt.toISOString(),
      iso(s.curveballRevealedAt),
      iso(s.submittedAt),
      s.updatedAt.toISOString(),
    ];
  }

  private toAttempt(row: Row): Attempt {
    return Attempt.restore({
      id: String(row.id),
      learnerId: String(row.learner_id),
      problemId: String(row.problem_id),
      number: Number(row.number),
      status: row.status as AttemptStatus,
      curveballId: String(row.curveball_id),
      design: parse(row.design_json),
      changeImpact: parseOrNull(row.change_impact_json),
      focusGoals: parse(row.focus_goals_json),
      seededFromAttemptId: row.seeded_from_attempt_id === null ? null : String(row.seeded_from_attempt_id),
      version: Number(row.version),
      startedAt: toDate(row.started_at),
      curveballRevealedAt: toDateOrNull(row.curveball_revealed_at),
      submittedAt: toDateOrNull(row.submitted_at),
      updatedAt: toDate(row.updated_at),
    });
  }
}

export class SqliteSubmissionRepository implements SubmissionRepository {
  constructor(private readonly db: DatabaseSync) {}

  insert(submission: Submission): void {
    this.db
      .prepare(
        `INSERT INTO submissions (id, attempt_id, learner_id, problem_id, curveball_id, format,
           design_json, change_impact_json, content_hash, submitted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        submission.id,
        submission.attemptId,
        submission.learnerId,
        submission.problemId,
        submission.curveballId,
        submission.format,
        JSON.stringify(submission.design),
        JSON.stringify(submission.changeImpact),
        submission.contentHash,
        submission.submittedAt.toISOString(),
      );
  }

  get(id: string): Submission | undefined {
    const row = this.db.prepare('SELECT * FROM submissions WHERE id = ?').get(id) as Row | undefined;
    return row ? this.toSubmission(row) : undefined;
  }

  findByAttempt(attemptId: string): Submission | undefined {
    const row = this.db.prepare('SELECT * FROM submissions WHERE attempt_id = ?').get(attemptId) as
      | Row
      | undefined;
    return row ? this.toSubmission(row) : undefined;
  }

  private toSubmission(row: Row): Submission {
    return Submission.restore({
      id: String(row.id),
      attemptId: String(row.attempt_id),
      learnerId: String(row.learner_id),
      problemId: String(row.problem_id),
      curveballId: String(row.curveball_id),
      format: row.format as SubmissionFormat,
      design: parse(row.design_json),
      changeImpact: parse(row.change_impact_json),
      contentHash: String(row.content_hash),
      submittedAt: toDate(row.submitted_at),
    });
  }
}

export class SqliteEvaluationRepository implements EvaluationRepository {
  constructor(private readonly db: DatabaseSync) {}

  insert(evaluation: Evaluation): void {
    const s = evaluation.toSnapshot();
    this.db
      .prepare(
        `INSERT INTO evaluations (id, submission_id, status, rubric_version, prompt_version, run_count,
           auto_retry_count, not_before, lease_until, last_error, report_json, queued_at, started_at,
           completed_at, version)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        s.id,
        s.submissionId,
        s.status,
        s.rubricVersion,
        s.promptVersion,
        s.runCount,
        s.autoRetryCount,
        s.notBefore.toISOString(),
        iso(s.leaseUntil),
        s.lastError,
        json(s.report),
        s.queuedAt.toISOString(),
        iso(s.startedAt),
        iso(s.completedAt),
        s.version,
      );
  }

  save(evaluation: Evaluation, expectedVersion: number): void {
    const s = evaluation.toSnapshot();
    const result = this.db
      .prepare(
        `UPDATE evaluations SET status = ?, run_count = ?, auto_retry_count = ?, not_before = ?,
           lease_until = ?, last_error = ?, report_json = ?, started_at = ?, completed_at = ?, version = ?
         WHERE id = ? AND version = ?`,
      )
      .run(
        s.status,
        s.runCount,
        s.autoRetryCount,
        s.notBefore.toISOString(),
        iso(s.leaseUntil),
        s.lastError,
        json(s.report),
        iso(s.startedAt),
        iso(s.completedAt),
        s.version,
        s.id,
        expectedVersion,
      );
    if (changes(result) === 0) {
      throw new VersionConflict(`Evaluation ${s.id} was changed by another worker.`);
    }
  }

  get(id: string): Evaluation | undefined {
    const row = this.db.prepare('SELECT * FROM evaluations WHERE id = ?').get(id) as Row | undefined;
    return row ? this.toEvaluation(row) : undefined;
  }

  findBySubmission(submissionId: string): Evaluation | undefined {
    const row = this.db.prepare('SELECT * FROM evaluations WHERE submission_id = ?').get(submissionId) as
      | Row
      | undefined;
    return row ? this.toEvaluation(row) : undefined;
  }

  findClaimable(now: Date, limit: number): Evaluation[] {
    return (
      this.db
        .prepare(
          `SELECT * FROM evaluations WHERE status = 'QUEUED' AND not_before <= ?
           ORDER BY not_before, queued_at LIMIT ?`,
        )
        .all(now.toISOString(), limit) as Row[]
    ).map((row) => this.toEvaluation(row));
  }

  findExpiredLeases(now: Date): Evaluation[] {
    return (
      this.db
        .prepare(`SELECT * FROM evaluations WHERE status = 'EVALUATING' AND lease_until <= ?`)
        .all(now.toISOString()) as Row[]
    ).map((row) => this.toEvaluation(row));
  }

  saveStep(step: EvaluationStepRecord): void {
    this.db
      .prepare(
        `INSERT INTO evaluation_steps (evaluation_id, evaluator_id, status, output_json, detail, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (evaluation_id, evaluator_id) DO UPDATE SET
           status = excluded.status, output_json = excluded.output_json,
           detail = excluded.detail, updated_at = excluded.updated_at`,
      )
      .run(
        step.evaluationId,
        step.evaluatorId,
        step.status,
        json(step.output),
        step.detail,
        step.updatedAt.toISOString(),
      );
  }

  listSteps(evaluationId: string): EvaluationStepRecord[] {
    return (
      this.db
        .prepare('SELECT * FROM evaluation_steps WHERE evaluation_id = ? ORDER BY evaluator_id')
        .all(evaluationId) as Row[]
    ).map((row) => ({
      evaluationId: String(row.evaluation_id),
      evaluatorId: String(row.evaluator_id),
      status: row.status as StepStatus,
      output: parseOrNull(row.output_json),
      detail: row.detail === null ? null : String(row.detail),
      updatedAt: toDate(row.updated_at),
    }));
  }

  private toEvaluation(row: Row): Evaluation {
    return Evaluation.restore({
      id: String(row.id),
      submissionId: String(row.submission_id),
      status: row.status as EvaluationStatus,
      rubricVersion: String(row.rubric_version),
      promptVersion: String(row.prompt_version),
      runCount: Number(row.run_count),
      autoRetryCount: Number(row.auto_retry_count),
      notBefore: toDate(row.not_before),
      leaseUntil: toDateOrNull(row.lease_until),
      lastError: row.last_error === null ? null : String(row.last_error),
      report: parseOrNull(row.report_json),
      queuedAt: toDate(row.queued_at),
      startedAt: toDateOrNull(row.started_at),
      completedAt: toDateOrNull(row.completed_at),
      version: Number(row.version),
    });
  }
}
