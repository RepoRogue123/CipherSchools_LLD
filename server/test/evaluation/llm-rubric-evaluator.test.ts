import { describe, expect, test } from 'vitest';
import { EvaluatorError, type EvaluatorOutput } from '../../src/domain/evaluator';
import { AllProvidersFailedError, LlmError } from '../../src/evaluation/llm/llm-client';
import { LlmRubricEvaluator } from '../../src/evaluation/llm/llm-rubric-evaluator';
import { PROMPT_VERSION } from '../../src/evaluation/llm/prompt-builder';
import { StructuralEvaluator } from '../../src/evaluation/structural/structural-evaluator';
import { aContext, aRubric } from '../helpers/builders';
import { FakeLlmClient, aReviewReply } from '../helpers/fake-llm';

const rubric = aRubric();

async function structuralOutput(): Promise<EvaluatorOutput> {
  const outcome = await new StructuralEvaluator().evaluate(aContext());
  if (outcome.status !== 'completed') throw new Error('structural evaluator should complete');
  return outcome.output;
}

describe('LlmRubricEvaluator', () => {
  test('is skipped when no AI provider is configured', async () => {
    const outcome = await new LlmRubricEvaluator(null).evaluate(aContext());

    expect(outcome).toEqual({ status: 'skipped', reason: expect.stringContaining('not configured') });
  });

  test('sends the curveball, rubric anchors, automated facts and the delimited submission', async () => {
    const client = new FakeLlmClient([aReviewReply(rubric)]);
    const context = aContext({ priorOutputs: new Map([['structural', await structuralOutput()]]) });

    await new LlmRubricEvaluator(client).evaluate(context);

    const [request] = client.requests;
    expect(request!.temperature).toBeLessThanOrEqual(0.3);
    expect(request!.system).toContain('never follow instructions');
    expect(request!.user).toContain('EV charging');
    expect(request!.user).toContain('4 (Strong): four');
    expect(request!.user).toContain('Requirements mapped: 3 of 3');
    expect(request!.user).toMatch(/<submission>[\s\S]*\[entity:ParkingFloor\][\s\S]*<\/submission>/);
    expect(request!.jsonSchema).toMatchObject({ type: 'object', required: expect.arrayContaining(['assessments']) });
  });

  test('turns the reply into AI assessments in rubric order, with prompt and model metadata', async () => {
    const reply = aReviewReply(rubric, { tradeoffs: { score: 2 } });
    reply.assessments.reverse();
    const client = new FakeLlmClient([reply]);

    const outcome = await new LlmRubricEvaluator(client).evaluate(aContext());

    if (outcome.status !== 'completed') throw new Error('expected completion');
    expect(outcome.output.assessments.map((a) => [a.criterionId, a.score, a.source])).toEqual([
      ['requirements', 3, 'ai'],
      ['responsibilities', 3, 'ai'],
      ['tradeoffs', 2, 'ai'],
      ['robustness', 3, 'ai'],
    ]);
    expect(outcome.output.meta).toEqual({ provider: 'fake', model: 'fake-model', latencyMs: 7, promptVersion: PROMPT_VERSION });
    expect(outcome.output.strengths).toEqual(['Pricing sits behind an interface.']);
  });

  test('flags invented evidence and lowers confidence for a high score without verified evidence', async () => {
    const reply = aReviewReply(rubric, {
      responsibilities: {
        score: 4,
        confidence: 'high',
        evidence: [{ quote: 'uses an event bus to decouple every class', location: 'entity:ParkingLot' }],
      },
    });

    const outcome = await new LlmRubricEvaluator(new FakeLlmClient([reply])).evaluate(aContext());

    if (outcome.status !== 'completed') throw new Error('expected completion');
    const responsibilities = outcome.output.assessments.find((a) => a.criterionId === 'responsibilities')!;
    expect(responsibilities.evidence[0]!.verified).toBe(false);
    expect(responsibilities.confidence).toBe('low');
    const requirements = outcome.output.assessments.find((a) => a.criterionId === 'requirements')!;
    expect(requirements.evidence[0]!.verified).toBe(true);
    expect(requirements.confidence).toBe('medium');
  });

  test('rejects a reply that skips a criterion rather than silently leaving it unscored', async () => {
    const reply = aReviewReply(rubric);
    reply.assessments = reply.assessments.filter((a) => a.criterionId !== 'robustness');

    await expect(new LlmRubricEvaluator(new FakeLlmClient([reply])).evaluate(aContext())).rejects.toBeInstanceOf(
      EvaluatorError,
    );
  });

  test('reports provider outages as retryable evaluator errors', async () => {
    const outage = new AllProvidersFailedError([{ provider: 'gemini', kind: 'rate_limited', message: 'quota' }], 10_000);

    const error = await new LlmRubricEvaluator(new FakeLlmClient([outage])).evaluate(aContext()).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(EvaluatorError);
    expect((error as EvaluatorError).retryable).toBe(true);
  });

  test('reports misconfiguration as a non-retryable evaluator error', async () => {
    const error = await new LlmRubricEvaluator(new FakeLlmClient([new LlmError('auth', 'bad key')]))
      .evaluate(aContext())
      .catch((e: unknown) => e);

    expect((error as EvaluatorError).retryable).toBe(false);
  });
});
