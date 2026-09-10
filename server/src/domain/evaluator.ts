import type {
  AssessmentSource,
  Confidence,
  DesignMetrics,
  EvidenceQuote,
  Finding,
  Score,
  ScoreCap,
  StepStatus,
} from '@designloop/shared';
import type { DesignModel, ReviewDocument } from './design-format';
import type { Curveball, Problem } from './problem';
import type { Rubric } from './rubric';
import type { Submission } from './submission';

/** One criterion judged by one evaluator: criterion → score → evidence → concern → suggestion → confidence. */
export interface CriterionAssessment {
  criterionId: string;
  score: Score;
  evidence: EvidenceQuote[];
  reasoning: string;
  concern: string;
  suggestion: string;
  confidence: Confidence;
  source: AssessmentSource;
}

export interface EvaluatorMeta {
  provider: string | null;
  model: string | null;
  latencyMs: number | null;
  promptVersion: string | null;
}

export interface EvaluatorOutput {
  findings: Finding[];
  metrics: DesignMetrics | null;
  caps: ScoreCap[];
  assessments: CriterionAssessment[];
  strengths: string[];
  summary: string | null;
  meta: EvaluatorMeta;
}

export interface EvaluationContext {
  submission: Submission;
  problem: Problem;
  curveball: Curveball;
  rubric: Rubric;
  model: DesignModel;
  review: ReviewDocument;
  /** Outputs of evaluators that already ran for this evaluation, keyed by evaluator id. */
  priorOutputs: ReadonlyMap<string, EvaluatorOutput>;
}

export type EvaluatorOutcome =
  | { status: 'completed'; output: EvaluatorOutput }
  | { status: 'skipped'; reason: string };

export type EvaluatorKind = 'deterministic' | 'ai' | 'human';

/**
 * The evaluation seam (Change Test B). Deterministic checks and the LLM reviewer
 * are two implementations today; a rule-based or human reviewer is another class
 * registered in the pipeline, with no change to the practice flow.
 */
export interface Evaluator {
  readonly id: string;
  readonly kind: EvaluatorKind;
  evaluate(context: EvaluationContext): Promise<EvaluatorOutcome>;
}

/** Thrown by evaluators; `retryable` tells the worker whether backoff-and-retry can help. */
export class EvaluatorError extends Error {
  override name = 'EvaluatorError';

  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

/** Persisted result of one evaluator for one evaluation, so re-runs skip finished steps. */
export interface EvaluationStepRecord {
  evaluationId: string;
  evaluatorId: string;
  status: StepStatus;
  output: EvaluatorOutput | null;
  /** Failure message or skip reason. */
  detail: string | null;
  updatedAt: Date;
}
