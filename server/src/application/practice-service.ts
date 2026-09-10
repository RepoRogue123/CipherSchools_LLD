import { STRUCTURED_DESIGN_V1, type ChangeImpact, type DesignDocument } from '@designloop/shared';
import { Attempt } from '../domain/attempt';
import { NotFound, ValidationFailed, InvalidStateTransition } from '../domain/errors';
import { Evaluation } from '../domain/evaluation';
import type { EvaluationStepRecord } from '../domain/evaluator';
import { Learner } from '../domain/learner';
import type {
  AttemptRepository,
  Clock,
  EvaluationRepository,
  IdGenerator,
  LearnerRepository,
  ProblemCatalog,
  SubmissionRepository,
  TransactionRunner,
} from '../domain/ports';
import type { Curveball, Problem } from '../domain/problem';
import type { Rubric } from '../domain/rubric';
import type { Submission } from '../domain/submission';
import type { DesignFormatRegistry } from '../evaluation/formats/design-format-registry';
import { blockersOf, checkDesign, type CheckReport } from '../evaluation/structural/checks';

export interface PracticeDependencies {
  catalog: ProblemCatalog;
  rubric: Rubric;
  promptVersion: string;
  formats: DesignFormatRegistry;
  learners: LearnerRepository;
  attempts: AttemptRepository;
  submissions: SubmissionRepository;
  evaluations: EvaluationRepository;
  tx: TransactionRunner;
  clock: Clock;
  ids: IdGenerator;
  /** Called after a submission is stored, to wake the evaluation worker. */
  onSubmitted: () => void;
}

export interface AttemptView {
  attempt: Attempt;
  problem: Problem;
  /** Only present once revealed. */
  curveball: Curveball | null;
  checks: CheckReport;
  submission: Submission | null;
  evaluation: Evaluation | null;
}

export interface SubmitResult {
  submission: Submission;
  evaluation: Evaluation;
  /** False when this was a duplicate request for an attempt already submitted. */
  created: boolean;
}

export interface EvaluationView {
  evaluation: Evaluation;
  submission: Submission;
  attempt: Attempt;
  problem: Problem;
  curveball: Curveball;
  steps: EvaluationStepRecord[];
}

/**
 * Practice use cases. Each command loads an aggregate, applies one domain
 * operation and saves it in a transaction. The rules themselves live in the
 * aggregates; this layer orchestrates, authorises and turns duplicate requests
 * into reads.
 */
export class PracticeService {
  constructor(private readonly deps: PracticeDependencies) {}

  registerLearner(name: string): Learner {
    const learner = Learner.register({ id: this.deps.ids.next(), name, now: this.deps.clock.now() });
    this.deps.learners.insert(learner);
    return learner;
  }

  getLearner(id: string): Learner {
    const learner = this.deps.learners.get(id);
    if (!learner) throw new NotFound('Learner not found.');
    return learner;
  }

  startAttempt(
    learnerId: string,
    problemId: string,
    seedFromAttemptId: string | null,
  ): { view: AttemptView; resumed: boolean } {
    this.getLearner(learnerId);
    const problem = this.problem(problemId);
    return this.deps.tx.run(() => {
      const open = this.deps.attempts.findOpen(learnerId, problemId);
      if (open) return { view: this.view(open, problem), resumed: true };

      let seed: { design: DesignDocument; fromAttemptId: string } | undefined;
      if (seedFromAttemptId) {
        const source = this.ownedAttempt(learnerId, seedFromAttemptId);
        if (source.problemId !== problemId) {
          throw new ValidationFailed('You can only revise an attempt at the same problem.');
        }
        const submission = this.deps.submissions.findByAttempt(source.id);
        if (!submission) throw new InvalidStateTransition('Only a submitted attempt can be revised.');
        seed = { design: submission.design as DesignDocument, fromAttemptId: source.id };
      }

      const attempt = Attempt.start({
        id: this.deps.ids.next(),
        learnerId,
        problem,
        number: this.deps.attempts.nextNumber(learnerId, problemId),
        now: this.deps.clock.now(),
        focusGoals: this.latestNextSteps(learnerId, problemId),
        ...(seed ? { seed } : {}),
      });
      this.deps.attempts.insert(attempt);
      return { view: this.view(attempt, problem), resumed: false };
    });
  }

  getAttempt(learnerId: string, attemptId: string): AttemptView {
    const attempt = this.ownedAttempt(learnerId, attemptId);
    return this.view(attempt, this.problem(attempt.problemId));
  }

  saveDesign(learnerId: string, attemptId: string, design: DesignDocument, expectedVersion: number): AttemptView {
    return this.mutate(learnerId, attemptId, (attempt) =>
      attempt.saveDesign(design, expectedVersion, this.deps.clock.now()),
    );
  }

  revealCurveball(learnerId: string, attemptId: string): AttemptView {
    return this.mutate(learnerId, attemptId, (attempt, problem) =>
      attempt.revealCurveball(blockersOf(this.check(attempt, problem)), this.deps.clock.now()),
    );
  }

  saveChangeImpact(
    learnerId: string,
    attemptId: string,
    changeImpact: ChangeImpact,
    expectedVersion: number,
  ): AttemptView {
    return this.mutate(learnerId, attemptId, (attempt) =>
      attempt.saveChangeImpact(changeImpact, expectedVersion, this.deps.clock.now()),
    );
  }

  /**
   * Stores the immutable submission and its queued evaluation in one transaction,
   * before any evaluation starts, so nothing is lost if the evaluator fails.
   * A duplicate submit (double click, network retry) returns the original result.
   */
  submit(learnerId: string, attemptId: string): SubmitResult {
    const result = this.deps.tx.run((): SubmitResult => {
      const attempt = this.ownedAttempt(learnerId, attemptId);
      if (attempt.status === 'SUBMITTED') {
        const submission = this.deps.submissions.findByAttempt(attempt.id)!;
        const evaluation = this.deps.evaluations.findBySubmission(submission.id)!;
        return { submission, evaluation, created: false };
      }
      const problem = this.problem(attempt.problemId);
      const loadedVersion = attempt.version;
      const now = this.deps.clock.now();
      const submission = attempt.submit(blockersOf(this.check(attempt, problem)), this.deps.ids.next(), now);
      const evaluation = Evaluation.queue({
        id: this.deps.ids.next(),
        submissionId: submission.id,
        rubricVersion: this.deps.rubric.version,
        promptVersion: this.deps.promptVersion,
        now,
      });
      this.deps.attempts.save(attempt, loadedVersion);
      this.deps.submissions.insert(submission);
      this.deps.evaluations.insert(evaluation);
      return { submission, evaluation, created: true };
    });
    if (result.created) this.deps.onSubmitted();
    return result;
  }

  getEvaluation(learnerId: string, evaluationId: string): EvaluationView {
    const evaluation = this.deps.evaluations.get(evaluationId);
    const submission = evaluation ? this.deps.submissions.get(evaluation.submissionId) : undefined;
    if (!evaluation || !submission || submission.learnerId !== learnerId) {
      throw new NotFound('Evaluation not found.');
    }
    const problem = this.problem(submission.problemId);
    return {
      evaluation,
      submission,
      attempt: this.deps.attempts.get(submission.attemptId)!,
      problem,
      curveball: problem.findCurveball(submission.curveballId)!,
      steps: this.deps.evaluations.listSteps(evaluation.id),
    };
  }

  /** Learner-initiated retry of a failed evaluation; a no-op in any other state. */
  retryEvaluation(learnerId: string, evaluationId: string): EvaluationView {
    const { evaluation } = this.getEvaluation(learnerId, evaluationId);
    const requeued = this.deps.tx.run(() => {
      const loadedVersion = evaluation.version;
      if (!evaluation.retry(this.deps.clock.now())) return false;
      this.deps.evaluations.save(evaluation, loadedVersion);
      return true;
    });
    if (requeued) this.deps.onSubmitted();
    return this.getEvaluation(learnerId, evaluationId);
  }

  private mutate(
    learnerId: string,
    attemptId: string,
    change: (attempt: Attempt, problem: Problem) => void,
  ): AttemptView {
    return this.deps.tx.run(() => {
      const attempt = this.ownedAttempt(learnerId, attemptId);
      const problem = this.problem(attempt.problemId);
      const loadedVersion = attempt.version;
      change(attempt, problem);
      if (attempt.version !== loadedVersion) this.deps.attempts.save(attempt, loadedVersion);
      return this.view(attempt, problem);
    });
  }

  private view(attempt: Attempt, problem: Problem): AttemptView {
    const submission = attempt.status === 'SUBMITTED' ? this.deps.submissions.findByAttempt(attempt.id) ?? null : null;
    return {
      attempt,
      problem,
      curveball: attempt.isCurveballRevealed ? problem.findCurveball(attempt.curveballId) ?? null : null,
      checks: this.check(attempt, problem),
      submission,
      evaluation: submission ? this.deps.evaluations.findBySubmission(submission.id) ?? null : null,
    };
  }

  private check(attempt: Attempt, problem: Problem): CheckReport {
    const model = this.deps.formats.get(STRUCTURED_DESIGN_V1).toModel(attempt.design, attempt.changeImpact);
    return checkDesign(model, problem);
  }

  /** Top next steps from the learner's most recent evaluated attempt at this problem. */
  private latestNextSteps(learnerId: string, problemId: string): string[] {
    for (const attempt of this.deps.attempts.listForProblem(learnerId, problemId).reverse()) {
      const submission = this.deps.submissions.findByAttempt(attempt.id);
      const report = submission ? this.deps.evaluations.findBySubmission(submission.id)?.report : null;
      if (report) return report.nextSteps.map((step) => step.text);
    }
    return [];
  }

  private ownedAttempt(learnerId: string, attemptId: string): Attempt {
    const attempt = this.deps.attempts.get(attemptId);
    // Another learner's attempt is reported as missing, so ids can't be probed.
    if (!attempt || attempt.learnerId !== learnerId) throw new NotFound('Attempt not found.');
    return attempt;
  }

  private problem(problemId: string): Problem {
    const problem = this.deps.catalog.get(problemId);
    if (!problem) throw new NotFound(`Problem "${problemId}" not found.`);
    return problem;
  }
}
