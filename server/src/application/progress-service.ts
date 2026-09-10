import type {
  AttemptHistoryItemDto,
  ComparisonDto,
  FeedbackReport,
  Finding,
  FocusAreaDto,
  ProblemSummaryDto,
  ProgressDto,
  Score,
} from '@designloop/shared';
import type { Attempt } from '../domain/attempt';
import { NotFound } from '../domain/errors';
import type { Evaluation } from '../domain/evaluation';
import type {
  AttemptRepository,
  EvaluationRepository,
  ProblemCatalog,
  SubmissionRepository,
} from '../domain/ports';
import type { Rubric } from '../domain/rubric';

export interface ProgressDependencies {
  catalog: ProblemCatalog;
  rubric: Rubric;
  attempts: AttemptRepository;
  submissions: SubmissionRepository;
  evaluations: EvaluationRepository;
}

interface AttemptRecord {
  attempt: Attempt;
  evaluation: Evaluation | null;
  report: FeedbackReport | null;
}

/** A criterion is a recurring weakness when it scores ≤ 2 in ≥ 2 attempts and in ≥ half of those assessed. */
const WEAK_SCORE = 2;
const MIN_WEAK_OCCURRENCES = 2;
const MIN_WEAK_SHARE = 0.5;
const MAX_FOCUS_AREAS = 3;

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Read models for the learning loop: history, attempt-to-attempt comparison and
 * recurring weaknesses. Everything here is deterministic aggregation over stored
 * reports, with no model calls, so progress is explainable and reproducible.
 */
export class ProgressService {
  constructor(private readonly deps: ProgressDependencies) {}

  problemSummaries(learnerId: string): ProblemSummaryDto[] {
    return this.deps.catalog.list().map((problem) => {
      const attempts = this.deps.attempts.listForProblem(learnerId, problem.id);
      const latest = attempts.at(-1);
      const record = latest ? this.record(latest) : null;
      return {
        id: problem.id,
        title: problem.title,
        difficulty: problem.difficulty,
        estimatedMinutes: problem.estimatedMinutes,
        summary: problem.summary,
        focusConcepts: [...problem.focusConcepts],
        attemptCount: attempts.length,
        latest: record
          ? {
              attemptId: record.attempt.id,
              number: record.attempt.number,
              status: record.attempt.status,
              evaluationStatus: record.evaluation?.status ?? null,
              band: record.report?.overall.band ?? null,
              mean: record.report?.overall.mean ?? null,
            }
          : null,
      };
    });
  }

  problemHistory(learnerId: string, problemId: string): AttemptHistoryItemDto[] {
    const problem = this.deps.catalog.get(problemId);
    if (!problem) throw new NotFound(`Problem "${problemId}" not found.`);
    return this.deps.attempts.listForProblem(learnerId, problemId).map((attempt) => {
      const { evaluation, report } = this.record(attempt);
      return {
        attemptId: attempt.id,
        number: attempt.number,
        status: attempt.status,
        startedAt: attempt.startedAt.toISOString(),
        submittedAt: attempt.submittedAt?.toISOString() ?? null,
        durationMinutes: attempt.submittedAt
          ? Math.round((attempt.submittedAt.getTime() - attempt.startedAt.getTime()) / 60_000)
          : null,
        curveballTitle: attempt.isCurveballRevealed ? problem.findCurveball(attempt.curveballId)?.title ?? null : null,
        evaluationId: evaluation?.id ?? null,
        evaluationStatus: evaluation?.status ?? null,
        overall: report ? { mean: report.overall.mean, band: report.overall.band } : null,
        scores: Object.fromEntries(this.deps.rubric.criteria.map((c) => [c.id, scoreOf(report, c.id)])),
      };
    });
  }

  /** Compares an attempt with the learner's previous evaluated attempt at the same problem. */
  compare(learnerId: string, attemptId: string): ComparisonDto | null {
    const current = this.deps.attempts.get(attemptId);
    if (!current || current.learnerId !== learnerId) throw new NotFound('Attempt not found.');
    const currentRecord = this.record(current);
    if (!currentRecord.report) return null;
    const previousRecord = this.deps.attempts
      .listForProblem(learnerId, current.problemId)
      .filter((a) => a.number < current.number)
      .reverse()
      .map((a) => this.record(a))
      .find((r) => r.report !== null);
    if (!previousRecord?.report) return null;

    const before = previousRecord.report;
    const after = currentRecord.report;
    const key = (f: Finding) => `${f.checkId}|${f.location ?? ''}`;
    const actionable = (f: Finding) => f.severity !== 'info';
    const beforeKeys = new Set(before.findings.map(key));
    const afterKeys = new Set(after.findings.map(key));
    const delta = (a: number | null, b: number | null) => (a !== null && b !== null ? round2(b - a) : null);

    return {
      previousAttemptId: previousRecord.attempt.id,
      previousNumber: previousRecord.attempt.number,
      currentAttemptId: current.id,
      currentNumber: current.number,
      overall: {
        previous: before.overall.mean,
        current: after.overall.mean,
        delta: delta(before.overall.mean, after.overall.mean),
      },
      criteria: this.deps.rubric.criteria.map((criterion) => {
        const previous = scoreOf(before, criterion.id);
        const now = scoreOf(after, criterion.id);
        return { criterionId: criterion.id, name: criterion.name, previous, current: now, delta: delta(previous, now) };
      }),
      resolvedFindings: before.findings.filter((f) => actionable(f) && !afterKeys.has(key(f))),
      newFindings: after.findings.filter((f) => actionable(f) && !beforeKeys.has(key(f))),
      rubricVersionChanged: previousRecord.evaluation?.rubricVersion !== currentRecord.evaluation?.rubricVersion,
    };
  }

  progress(learnerId: string): ProgressDto {
    const assessed = this.deps.attempts
      .listForLearner(learnerId)
      .map((a) => this.record(a))
      .filter((r) => r.report !== null && r.report.overall.assessedCount > 0);

    const focusAreas: (FocusAreaDto & { meanScore: number; order: number })[] = [];
    this.deps.rubric.criteria.forEach((criterion, order) => {
      const scored = assessed.filter((r) => scoreOf(r.report, criterion.id) !== null);
      const weak = scored.filter((r) => scoreOf(r.report, criterion.id)! <= WEAK_SCORE);
      if (weak.length < MIN_WEAK_OCCURRENCES || weak.length / scored.length < MIN_WEAK_SHARE) return;
      const latestWeak = weak.at(-1)!;
      focusAreas.push({
        criterionId: criterion.id,
        name: criterion.name,
        weakCount: weak.length,
        assessedCount: scored.length,
        latestSuggestion:
          latestWeak.report!.criteria.find((c) => c.criterionId === criterion.id)?.suggestion ?? '',
        occurrences: weak.map((r) => ({
          attemptId: r.attempt.id,
          problemId: r.attempt.problemId,
          problemTitle: this.deps.catalog.get(r.attempt.problemId)?.title ?? r.attempt.problemId,
          attemptNumber: r.attempt.number,
          score: scoreOf(r.report, criterion.id)!,
        })),
        meanScore: scored.reduce((sum, r) => sum + scoreOf(r.report, criterion.id)!, 0) / scored.length,
        order,
      });
    });

    return {
      assessedAttempts: assessed.length,
      focusAreas: focusAreas
        .sort((a, b) => b.weakCount - a.weakCount || a.meanScore - b.meanScore || a.order - b.order)
        .slice(0, MAX_FOCUS_AREAS)
        .map(({ meanScore: _meanScore, order: _order, ...area }) => area),
    };
  }

  private record(attempt: Attempt): AttemptRecord {
    const submission = this.deps.submissions.findByAttempt(attempt.id);
    const evaluation = submission ? this.deps.evaluations.findBySubmission(submission.id) ?? null : null;
    return { attempt, evaluation, report: evaluation?.report ?? null };
  }
}

function scoreOf(report: FeedbackReport | null, criterionId: string): Score | null {
  return report?.criteria.find((c) => c.criterionId === criterionId)?.score ?? null;
}
