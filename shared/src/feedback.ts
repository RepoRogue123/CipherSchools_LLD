import type {
  AssessmentSource,
  Band,
  Confidence,
  FindingSeverity,
  Score,
} from './enums';

/** A deterministic observation about the submitted design. */
export interface Finding {
  checkId: string;
  severity: FindingSeverity;
  message: string;
  /** Anchor in the rendered submission, e.g. "entity:ParkingLot" or "mapping:R3". */
  location?: string;
}

export interface DesignMetrics {
  entityCount: number;
  abstractionCount: number;
  relationshipCount: number;
  requirementCoverage: { mapped: number; total: number };
  flowCount: number;
  decisionCount: number;
  /** How the curveball was absorbed: existing entities modified vs new entities added. */
  changeImpact: { modified: number; added: number } | null;
}

/** A deterministic upper bound on a criterion score, with a learner-visible reason. */
export interface ScoreCap {
  criterionId: string;
  maxScore: Score;
  reason: string;
  checkId: string;
}

export interface EvidenceQuote {
  quote: string;
  location: string;
  /** True when the quote was found in the submission text the reviewer saw. */
  verified: boolean;
}

export interface CriterionFeedback {
  criterionId: string;
  name: string;
  /** null when the criterion was not assessed (e.g. AI review unavailable). */
  score: Score | null;
  levelLabel: string | null;
  evidence: EvidenceQuote[];
  reasoning: string;
  concern: string;
  suggestion: string;
  confidence: Confidence | null;
  source: AssessmentSource | null;
  /** Present when a deterministic cap lowered the reviewer's score. */
  cap: { maxScore: Score; originalScore: Score; reason: string } | null;
}

export interface NextStep {
  criterionId: string;
  criterionName: string;
  text: string;
}

export type AiReviewStatus = 'completed' | 'skipped' | 'failed' | 'pending';

export interface AiReviewInfo {
  status: AiReviewStatus;
  provider: string | null;
  model: string | null;
  latencyMs: number | null;
  promptVersion: string | null;
  message: string | null;
}

export interface FeedbackReport {
  rubricVersion: string;
  overall: {
    mean: number | null;
    band: Band | null;
    assessedCount: number;
    totalCriteria: number;
  };
  criteria: CriterionFeedback[];
  findings: Finding[];
  metrics: DesignMetrics;
  strengths: string[];
  nextSteps: NextStep[];
  summary: string | null;
  aiReview: AiReviewInfo;
  /** True when some evaluation steps did not complete (e.g. AI review failed). */
  partial: boolean;
}
