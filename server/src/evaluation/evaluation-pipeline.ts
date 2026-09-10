import type { AiReviewInfo, FeedbackReport, StepStatus } from '@designloop/shared';
import {
  EvaluatorError,
  type EvaluationContext,
  type Evaluator,
  type EvaluatorOutput,
} from '../domain/evaluator';
import type { Clock, EvaluationRepository, ProblemCatalog } from '../domain/ports';
import type { Rubric } from '../domain/rubric';
import type { Submission } from '../domain/submission';
import type { FeedbackAssembler } from './feedback-assembler';
import type { DesignFormatRegistry } from './formats/design-format-registry';

export interface PipelineDependencies {
  evaluators: readonly Evaluator[];
  formats: DesignFormatRegistry;
  catalog: ProblemCatalog;
  rubric: Rubric;
  evaluations: EvaluationRepository;
  assembler: FeedbackAssembler;
  clock: Clock;
}

export type PipelineResult =
  | { status: 'completed'; report: FeedbackReport }
  | { status: 'failed'; report: FeedbackReport; error: string; retryable: boolean };

interface StepState {
  status: StepStatus;
  detail: string | null;
  output: EvaluatorOutput | null;
}

/**
 * Runs the registered evaluators in order for one submission. Each step's
 * result is persisted as soon as it finishes, so a retry re-runs only what
 * failed and a failed AI step still leaves the deterministic feedback usable.
 */
export class EvaluationPipeline {
  constructor(private readonly deps: PipelineDependencies) {}

  async run(evaluationId: string, submission: Submission): Promise<PipelineResult> {
    const context = this.buildContext(submission);
    const previous = new Map(this.deps.evaluations.listSteps(evaluationId).map((s) => [s.evaluatorId, s]));
    const outputs = new Map<string, EvaluatorOutput>();
    const steps = new Map<string, StepState>();
    let failure: { error: string; retryable: boolean } | null = null;

    for (const evaluator of this.deps.evaluators) {
      const prior = previous.get(evaluator.id);
      if (prior?.status === 'COMPLETED' && prior.output) {
        outputs.set(evaluator.id, prior.output);
        steps.set(evaluator.id, { status: 'COMPLETED', detail: null, output: prior.output });
        continue;
      }
      try {
        const outcome = await evaluator.evaluate({ ...context, priorOutputs: outputs });
        if (outcome.status === 'completed') {
          outputs.set(evaluator.id, outcome.output);
          this.record(evaluationId, evaluator.id, { status: 'COMPLETED', detail: null, output: outcome.output }, steps);
        } else {
          this.record(evaluationId, evaluator.id, { status: 'SKIPPED', detail: outcome.reason, output: null }, steps);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const retryable = error instanceof EvaluatorError && error.retryable;
        this.record(evaluationId, evaluator.id, { status: 'FAILED', detail: message, output: null }, steps);
        failure = { error: message, retryable };
        break;
      }
    }

    const report = this.deps.assembler.assemble({
      outputs: this.deps.evaluators
        .filter((e) => outputs.has(e.id))
        .map((e) => ({ evaluatorId: e.id, output: outputs.get(e.id)! })),
      aiReview: this.aiReviewInfo(steps),
      partial: failure !== null,
    });
    return failure ? { status: 'failed', report, ...failure } : { status: 'completed', report };
  }

  private buildContext(submission: Submission): Omit<EvaluationContext, 'priorOutputs'> {
    const problem = this.deps.catalog.get(submission.problemId);
    if (!problem) throw new EvaluatorError(`Unknown problem "${submission.problemId}"`, false);
    const curveball = problem.findCurveball(submission.curveballId);
    if (!curveball) throw new EvaluatorError(`Unknown curveball "${submission.curveballId}"`, false);
    const format = this.deps.formats.get(submission.format);
    const model = format.toModel(submission.design, submission.changeImpact);
    return { submission, problem, curveball, rubric: this.deps.rubric, model, review: format.render(model, problem) };
  }

  private record(evaluationId: string, evaluatorId: string, state: StepState, steps: Map<string, StepState>): void {
    steps.set(evaluatorId, state);
    this.deps.evaluations.saveStep({
      evaluationId,
      evaluatorId,
      status: state.status,
      output: state.output,
      detail: state.detail,
      updatedAt: this.deps.clock.now(),
    });
  }

  private aiReviewInfo(steps: Map<string, StepState>): AiReviewInfo {
    const none = { provider: null, model: null, latencyMs: null, promptVersion: null };
    const ai = this.deps.evaluators.find((e) => e.kind === 'ai');
    if (!ai) return { status: 'skipped', ...none, message: 'No AI reviewer is registered.' };
    const step = steps.get(ai.id);
    if (!step) return { status: 'pending', ...none, message: null };
    if (step.status === 'COMPLETED' && step.output) {
      return { status: 'completed', ...step.output.meta, message: null };
    }
    return { status: step.status === 'SKIPPED' ? 'skipped' : 'failed', ...none, message: step.detail };
  }
}
