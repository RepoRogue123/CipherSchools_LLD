import type { EvaluationContext, Evaluator, EvaluatorOutcome } from '../../domain/evaluator';
import { checkDesign } from './checks';

/** Deterministic evaluator: structure findings, metrics and score caps. No network, never flaky. */
export class StructuralEvaluator implements Evaluator {
  readonly id = 'structural';
  readonly kind = 'deterministic' as const;

  async evaluate(context: EvaluationContext): Promise<EvaluatorOutcome> {
    const report = checkDesign(context.model, context.problem);
    return {
      status: 'completed',
      output: {
        findings: report.findings,
        metrics: report.metrics,
        caps: report.caps,
        assessments: [],
        strengths: [],
        summary: null,
        meta: { provider: null, model: null, latencyMs: null, promptVersion: null },
      },
    };
  }
}
