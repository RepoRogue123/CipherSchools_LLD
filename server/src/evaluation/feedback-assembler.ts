import type {
  AiReviewInfo,
  AssessmentSource,
  Band,
  CriterionFeedback,
  DesignMetrics,
  FeedbackReport,
  NextStep,
} from '@designloop/shared';
import type { CriterionAssessment, EvaluatorOutput } from '../domain/evaluator';
import type { Criterion, Rubric } from '../domain/rubric';

/** When evaluators disagree on a criterion, the more trusted source wins. */
const SOURCE_PRECEDENCE: Record<AssessmentSource, number> = { human: 3, ai: 2, deterministic: 1 };

const BANDS: readonly [minimumMean: number, band: Band][] = [
  [3.5, 'Strong'],
  [2.75, 'Solid'],
  [2.0, 'Developing'],
];

const MAX_NEXT_STEPS = 3;
const MAX_STRENGTHS = 3;

const EMPTY_METRICS: DesignMetrics = {
  entityCount: 0,
  abstractionCount: 0,
  relationshipCount: 0,
  requirementCoverage: { mapped: 0, total: 0 },
  flowCount: 0,
  decisionCount: 0,
  changeImpact: null,
};

export interface AssemblerInput {
  outputs: readonly { evaluatorId: string; output: EvaluatorOutput }[];
  aiReview: AiReviewInfo;
  partial: boolean;
}

function bandFor(mean: number): Band {
  return BANDS.find(([minimum]) => mean >= minimum)?.[1] ?? 'Foundational';
}

/**
 * The single place that decides what the learner sees. It merges evaluator
 * outputs by source precedence, applies deterministic caps, and derives the
 * overall band and next steps from the criteria. There is never a free-floating
 * AI number.
 */
export class FeedbackAssembler {
  constructor(private readonly rubric: Rubric) {}

  assemble(input: AssemblerInput): FeedbackReport {
    const outputs = input.outputs.map((o) => o.output);
    const findings = outputs.flatMap((o) => o.findings);
    const caps = outputs.flatMap((o) => o.caps);
    const assessments = outputs.flatMap((o) => o.assessments);

    const criteria = this.rubric.criteria.map((criterion) => {
      const chosen = assessments
        .filter((a) => a.criterionId === criterion.id)
        .sort((a, b) => SOURCE_PRECEDENCE[b.source] - SOURCE_PRECEDENCE[a.source])[0];
      return chosen ? this.scored(criterion, chosen, caps) : this.notAssessed(criterion);
    });

    const scores = criteria.flatMap((c) => (c.score === null ? [] : [c.score]));
    const mean = scores.length ? Math.round((scores.reduce((sum, s) => sum + s, 0) / scores.length) * 100) / 100 : null;

    return {
      rubricVersion: this.rubric.version,
      overall: {
        mean,
        band: mean === null ? null : bandFor(mean),
        assessedCount: scores.length,
        totalCriteria: criteria.length,
      },
      criteria,
      findings,
      metrics: outputs.map((o) => o.metrics).find((m) => m !== null) ?? EMPTY_METRICS,
      strengths: outputs.flatMap((o) => o.strengths).slice(0, MAX_STRENGTHS),
      nextSteps: this.nextSteps(criteria, findings),
      summary: outputs.map((o) => o.summary).find((s) => s !== null) ?? null,
      aiReview: input.aiReview,
      partial: input.partial,
    };
  }

  private scored(
    criterion: Criterion,
    assessment: CriterionAssessment,
    caps: EvaluatorOutput['caps'],
  ): CriterionFeedback {
    const strictest = caps
      .filter((cap) => cap.criterionId === criterion.id)
      .sort((a, b) => a.maxScore - b.maxScore)[0];
    const capped = strictest !== undefined && assessment.score > strictest.maxScore;
    const score = capped ? strictest.maxScore : assessment.score;
    return {
      criterionId: criterion.id,
      name: criterion.name,
      score,
      levelLabel: this.rubric.levelLabel(score),
      evidence: assessment.evidence,
      reasoning: assessment.reasoning,
      concern: assessment.concern,
      suggestion: assessment.suggestion,
      confidence: assessment.confidence,
      source: assessment.source,
      cap: capped ? { maxScore: strictest.maxScore, originalScore: assessment.score, reason: strictest.reason } : null,
    };
  }

  private notAssessed(criterion: Criterion): CriterionFeedback {
    return {
      criterionId: criterion.id,
      name: criterion.name,
      score: null,
      levelLabel: null,
      evidence: [],
      reasoning: '',
      concern: '',
      suggestion: '',
      confidence: null,
      source: null,
      cap: null,
    };
  }

  private nextSteps(criteria: CriterionFeedback[], findings: EvaluatorOutput['findings']): NextStep[] {
    const assessed = criteria.filter((c) => c.score !== null);
    if (assessed.length > 0) {
      return assessed
        .filter((c) => c.score! < 4 && c.suggestion.length > 0)
        .sort((a, b) => a.score! - b.score! || criteria.indexOf(a) - criteria.indexOf(b))
        .slice(0, MAX_NEXT_STEPS)
        .map((c) => ({ criterionId: c.criterionId, criterionName: c.name, text: c.suggestion }));
    }
    const rank = { blocker: 0, warning: 1, info: 2 } as const;
    return findings
      .filter((f) => f.severity !== 'info')
      .sort((a, b) => rank[a.severity] - rank[b.severity])
      .slice(0, MAX_NEXT_STEPS)
      .map((f) => ({ criterionId: 'structure', criterionName: 'Design structure', text: f.message }));
  }
}
