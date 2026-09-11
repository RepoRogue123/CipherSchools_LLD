/**
 * Calibration: does the reviewer separate a strong design from a weak one, and
 * does it score the same design consistently? Runs the real evaluators (checks,
 * then AI review, then assembly) on two fixtures, several times each.
 *   npm run calibrate            # 3 runs per fixture
 *   npm run calibrate -- --runs 5
 */
import type { FeedbackReport } from '@designloop/shared';
import { EvaluatorError, type EvaluatorOutput } from '../src/domain/evaluator';
import { FeedbackAssembler } from '../src/evaluation/feedback-assembler';
import { StructuredDesignFormatV1 } from '../src/evaluation/formats/structured-design-v1';
import { LlmRubricEvaluator } from '../src/evaluation/llm/llm-rubric-evaluator';
import { StructuralEvaluator } from '../src/evaluation/structural/structural-evaluator';
import { fallbackClient, loadEnvironment, loadFixture } from './shared';

const runsArg = process.argv.indexOf('--runs');
const RUNS = runsArg > 0 ? Number(process.argv[runsArg + 1]) : 3;

const { catalog, rubric, providers } = loadEnvironment();
if (providers.length === 0) {
  console.log('No LLM provider configured; calibration needs AI review. Set a key in .env.');
  process.exit(1);
}

const llm = new LlmRubricEvaluator(fallbackClient(providers));
const structural = new StructuralEvaluator();
const format = new StructuredDesignFormatV1();
const assembler = new FeedbackAssembler(rubric);

async function review(fixtureFile: string): Promise<FeedbackReport> {
  const { submission } = loadFixture(fixtureFile);
  const problem = catalog.get(submission.problemId)!;
  const model = format.toModel(submission.design, submission.changeImpact);
  const base = { submission, problem, curveball: problem.findCurveball(submission.curveballId)!, rubric, model, review: format.render(model, problem) };
  const outputs = new Map<string, EvaluatorOutput>();
  const checks = await structural.evaluate({ ...base, priorOutputs: outputs });
  if (checks.status === 'completed') outputs.set('structural', checks.output);
  const ai = await llm.evaluate({ ...base, priorOutputs: outputs });
  if (ai.status !== 'completed') throw new Error(ai.reason);
  outputs.set('llm-rubric', ai.output);
  return assembler.assemble({
    outputs: [...outputs].map(([evaluatorId, output]) => ({ evaluatorId, output })),
    aiReview: { status: 'completed', ...ai.output.meta, message: null },
    partial: false,
  });
}

/**
 * Free tiers return 503 "high demand" in bursts, so retry transient failures
 * with growing pauses instead of aborting the whole calibration run.
 */
async function withRetry<T>(label: string, work: () => Promise<T>): Promise<T> {
  const delaysMs = [15_000, 30_000, 60_000, 90_000];
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await work();
    } catch (error) {
      const delay = delaysMs[attempt];
      if (!(error instanceof EvaluatorError && error.retryable) || delay === undefined) throw error;
      console.log(`${label}: ${error.message} Retrying in ${delay / 1000}s.`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

const results: Record<string, FeedbackReport[]> = { strong: [], weak: [] };
for (const label of ['strong', 'weak'] as const) {
  for (let run = 1; run <= RUNS; run += 1) {
    const report = await withRetry(`${label} run ${run}`, () => review(`parking-lot.${label}.json`));
    results[label]!.push(report);
    const verified = report.criteria.flatMap((c) => c.evidence).filter((e) => e.verified).length;
    const quotes = report.criteria.flatMap((c) => c.evidence).length;
    console.log(
      `${label} run ${run}: mean ${report.overall.mean} (${report.overall.band}) via ${report.aiReview.provider}/${report.aiReview.model}, ` +
        `${verified}/${quotes} quotes verified, caps: ${report.criteria.filter((c) => c.cap).map((c) => c.criterionId).join(', ') || 'none'}`,
    );
  }
}

console.log('\nCriterion'.padEnd(30) + 'strong runs'.padEnd(18) + 'weak runs'.padEnd(18) + 'max spread');
let maxSpread = 0;
for (const criterion of rubric.criteria) {
  const scores = (label: string) => results[label]!.map((r) => r.criteria.find((c) => c.criterionId === criterion.id)?.score ?? 0);
  const all = [scores('strong'), scores('weak')];
  const spread = Math.max(...all.map((s) => Math.max(...s) - Math.min(...s)));
  maxSpread = Math.max(maxSpread, spread);
  console.log(criterion.name.padEnd(30) + scores('strong').join(' ').padEnd(18) + scores('weak').join(' ').padEnd(18) + spread);
}

const mean = (label: string) => results[label]!.reduce((sum, r) => sum + (r.overall.mean ?? 0), 0) / RUNS;
const separated = Math.min(...results.strong!.map((r) => r.overall.mean ?? 0)) > Math.max(...results.weak!.map((r) => r.overall.mean ?? 0));
console.log(`\nAverage mean: strong ${mean('strong').toFixed(2)}, weak ${mean('weak').toFixed(2)}`);
console.log(`Every strong run outscored every weak run: ${separated ? 'yes' : 'NO'}`);
console.log(`Largest per-criterion spread across repeated runs: ${maxSpread}`);
process.exit(separated ? 0 : 1);
