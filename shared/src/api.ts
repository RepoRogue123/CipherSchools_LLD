import { z } from 'zod';
import { changeImpactSchema, designDocumentSchema, type ChangeImpact, type DesignDocument } from './design';
import type {
  AttemptStatus,
  Band,
  Difficulty,
  EvaluationStatus,
  Score,
  StepStatus,
} from './enums';
import type { DesignMetrics, FeedbackReport, Finding } from './feedback';

/* Requests */

export const createLearnerRequestSchema = z.object({ name: z.string().max(200) });
export type CreateLearnerRequest = z.infer<typeof createLearnerRequestSchema>;

export const startAttemptRequestSchema = z.object({
  seedFromAttemptId: z.string().max(64).nullable().optional(),
});
export type StartAttemptRequest = z.infer<typeof startAttemptRequestSchema>;

export const saveDesignRequestSchema = z.object({
  design: designDocumentSchema,
  version: z.number().int().positive(),
});
export type SaveDesignRequest = z.infer<typeof saveDesignRequestSchema>;

export const saveChangeImpactRequestSchema = z.object({
  changeImpact: changeImpactSchema,
  version: z.number().int().positive(),
});
export type SaveChangeImpactRequest = z.infer<typeof saveChangeImpactRequestSchema>;

/* Errors */

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    blockers?: Finding[];
    issues?: string[];
  };
}

/* Responses. Dates are ISO-8601 strings. */

export interface LearnerDto {
  id: string;
  name: string;
}

export interface LatestAttemptDto {
  attemptId: string;
  number: number;
  status: AttemptStatus;
  evaluationStatus: EvaluationStatus | null;
  band: Band | null;
  mean: number | null;
}

export interface ProblemSummaryDto {
  id: string;
  title: string;
  difficulty: Difficulty;
  estimatedMinutes: number;
  summary: string;
  focusConcepts: string[];
  attemptCount: number;
  latest: LatestAttemptDto | null;
}

export interface ProblemBriefDto {
  id: string;
  title: string;
  difficulty: Difficulty;
  estimatedMinutes: number;
  summary: string;
  context: string;
  focusConcepts: string[];
  requirements: { id: string; text: string }[];
  outOfScope: string[];
  clarifyingQuestions: { question: string; answer: string }[];
  keyFlows: string[];
}

/** Reviewer material, revealed only once the attempt has been evaluated. */
export interface ProblemDebriefDto {
  designPressures: string[];
  edgeCases: string[];
  curveballTests: string;
  alternativeApproaches: { name: string; summary: string; strengths: string; tradeoffs: string }[];
}

export interface CurveballDto {
  id: string;
  title: string;
  description: string;
}

export interface RubricDto {
  id: string;
  version: string;
  scale: { score: Score; label: string }[];
  criteria: {
    id: string;
    name: string;
    question: string;
    levels: Record<'1' | '2' | '3' | '4', string>;
  }[];
}

export interface CheckResultDto {
  findings: Finding[];
  metrics: DesignMetrics;
  blockerCount: number;
}

export interface EvaluationSummaryDto {
  id: string;
  status: EvaluationStatus;
  queuedAt: string;
  completedAt: string | null;
}

export interface AttemptDto {
  id: string;
  problemId: string;
  number: number;
  status: AttemptStatus;
  version: number;
  design: DesignDocument;
  changeImpact: ChangeImpact | null;
  focusGoals: string[];
  seededFromAttemptId: string | null;
  startedAt: string;
  curveballRevealedAt: string | null;
  submittedAt: string | null;
  /** Present once the curveball has been revealed. */
  curveball: CurveballDto | null;
  checks: CheckResultDto;
  submissionId: string | null;
  evaluation: EvaluationSummaryDto | null;
}

export interface StartAttemptResponse {
  attempt: AttemptDto;
  resumed: boolean;
}

export interface SubmitResponse {
  submissionId: string;
  evaluation: EvaluationSummaryDto;
  created: boolean;
}

export interface EvaluationStepDto {
  evaluatorId: string;
  status: StepStatus;
  detail: string | null;
}

export interface EvaluationDto {
  id: string;
  attemptId: string;
  problemId: string;
  problemTitle: string;
  attemptNumber: number;
  status: EvaluationStatus;
  runCount: number;
  queuedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  lastError: string | null;
  rubricVersion: string;
  promptVersion: string;
  steps: EvaluationStepDto[];
  curveball: CurveballDto;
  report: FeedbackReport | null;
  debrief: ProblemDebriefDto | null;
}

export interface AttemptHistoryItemDto {
  attemptId: string;
  number: number;
  status: AttemptStatus;
  startedAt: string;
  submittedAt: string | null;
  durationMinutes: number | null;
  /** Null until the curveball has been revealed in that attempt. */
  curveballTitle: string | null;
  evaluationId: string | null;
  evaluationStatus: EvaluationStatus | null;
  overall: { mean: number | null; band: Band | null } | null;
  scores: Record<string, Score | null>;
}

export interface CriterionDeltaDto {
  criterionId: string;
  name: string;
  previous: Score | null;
  current: Score | null;
  delta: number | null;
}

export interface ComparisonDto {
  previousAttemptId: string;
  previousNumber: number;
  currentAttemptId: string;
  currentNumber: number;
  overall: { previous: number | null; current: number | null; delta: number | null };
  criteria: CriterionDeltaDto[];
  resolvedFindings: Finding[];
  newFindings: Finding[];
  rubricVersionChanged: boolean;
}

export interface FocusAreaDto {
  criterionId: string;
  name: string;
  weakCount: number;
  assessedCount: number;
  latestSuggestion: string;
  occurrences: {
    attemptId: string;
    problemId: string;
    problemTitle: string;
    attemptNumber: number;
    score: Score;
  }[];
}

export interface ProgressDto {
  assessedAttempts: number;
  focusAreas: FocusAreaDto[];
}

export interface HealthDto {
  status: 'ok';
  aiReview: {
    enabled: boolean;
    providers: { name: string; model: string; coolingDownUntil: string | null }[];
  };
}
