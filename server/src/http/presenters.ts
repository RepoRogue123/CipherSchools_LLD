import type {
  AttemptDto,
  EvaluationDto,
  EvaluationSummaryDto,
  LearnerDto,
  ProblemBriefDto,
  RubricDto,
  SubmitResponse,
} from '@designloop/shared';
import type { AttemptView, EvaluationView, SubmitResult } from '../application/practice-service';
import type { Evaluation } from '../domain/evaluation';
import type { Learner } from '../domain/learner';
import type { Problem } from '../domain/problem';
import type { Rubric } from '../domain/rubric';
import { blockersOf } from '../evaluation/structural/checks';

const iso = (date: Date | null): string | null => date?.toISOString() ?? null;

export function toLearnerDto(learner: Learner): LearnerDto {
  return { id: learner.id, name: learner.name };
}

export function toRubricDto(rubric: Rubric): RubricDto {
  return {
    id: rubric.id,
    version: rubric.version,
    scale: rubric.scale.map((s) => ({ ...s })),
    criteria: rubric.criteria.map((c) => ({ id: c.id, name: c.name, question: c.question, levels: { ...c.levels } })),
  };
}

/** The learner-safe view of a problem. Curveballs and reviewer notes are deliberately left out. */
export function toBriefDto(problem: Problem): ProblemBriefDto {
  return {
    id: problem.id,
    title: problem.title,
    difficulty: problem.difficulty,
    estimatedMinutes: problem.estimatedMinutes,
    summary: problem.summary,
    context: problem.context,
    focusConcepts: [...problem.focusConcepts],
    requirements: problem.requirements.map((r) => ({ ...r })),
    outOfScope: [...problem.outOfScope],
    clarifyingQuestions: problem.clarifyingQuestions.map((q) => ({ ...q })),
    keyFlows: [...problem.keyFlows],
  };
}

function toEvaluationSummary(evaluation: Evaluation): EvaluationSummaryDto {
  return {
    id: evaluation.id,
    status: evaluation.status,
    queuedAt: evaluation.queuedAt.toISOString(),
    completedAt: iso(evaluation.completedAt),
  };
}

export function toAttemptDto(view: AttemptView): AttemptDto {
  const { attempt } = view;
  return {
    id: attempt.id,
    problemId: attempt.problemId,
    number: attempt.number,
    status: attempt.status,
    version: attempt.version,
    design: attempt.design,
    changeImpact: attempt.changeImpact,
    focusGoals: attempt.focusGoals,
    seededFromAttemptId: attempt.seededFromAttemptId,
    startedAt: attempt.startedAt.toISOString(),
    curveballRevealedAt: iso(attempt.curveballRevealedAt),
    submittedAt: iso(attempt.submittedAt),
    curveball: view.curveball
      ? { id: view.curveball.id, title: view.curveball.title, description: view.curveball.description }
      : null,
    checks: {
      findings: view.checks.findings,
      metrics: view.checks.metrics,
      blockerCount: blockersOf(view.checks).length,
    },
    submissionId: view.submission?.id ?? null,
    evaluation: view.evaluation ? toEvaluationSummary(view.evaluation) : null,
  };
}

export function toSubmitResponse(result: SubmitResult): SubmitResponse {
  return {
    submissionId: result.submission.id,
    evaluation: toEvaluationSummary(result.evaluation),
    created: result.created,
  };
}

export function toEvaluationDto(view: EvaluationView): EvaluationDto {
  const { evaluation, problem, curveball } = view;
  const report = evaluation.report;
  return {
    id: evaluation.id,
    attemptId: view.attempt.id,
    problemId: problem.id,
    problemTitle: problem.title,
    attemptNumber: view.attempt.number,
    status: evaluation.status,
    runCount: evaluation.runCount,
    queuedAt: evaluation.queuedAt.toISOString(),
    startedAt: iso(evaluation.startedAt),
    completedAt: iso(evaluation.completedAt),
    lastError: evaluation.lastError,
    rubricVersion: evaluation.rubricVersion,
    promptVersion: evaluation.promptVersion,
    steps: view.steps.map((s) => ({ evaluatorId: s.evaluatorId, status: s.status, detail: s.detail })),
    curveball: { id: curveball.id, title: curveball.title, description: curveball.description },
    report,
    // Reviewer material is shown only once there is feedback to learn from.
    debrief: report
      ? {
          designPressures: [...problem.designPressures],
          edgeCases: [...problem.edgeCases],
          curveballTests: curveball.tests,
          alternativeApproaches: problem.alternativeApproaches.map((a) => ({ ...a })),
        }
      : null,
  };
}
