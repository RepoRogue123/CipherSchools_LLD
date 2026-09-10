import type { ChangeImpact } from '@designloop/shared';
import { buildContainer } from '../../src/container';
import { silentLogger } from '../../src/application/logger';
import type { ProblemCatalog } from '../../src/domain/ports';
import { Problem } from '../../src/domain/problem';
import { openDatabase } from '../../src/infrastructure/sqlite/database';
import { aChangeImpact, aDesign, aProblemData, aRubric } from './builders';
import { FakeLlmClient } from './fake-llm';
import { FixedClock, SequentialIds } from './fakes';

export const T0 = new Date('2026-09-10T10:00:00Z');

export function catalogOf(...problems: Problem[]): ProblemCatalog {
  return {
    list: () => problems,
    get: (id) => problems.find((p) => p.id === id),
  };
}

/**
 * The real object graph (repositories, format, checks, pipeline, worker) over an
 * in-memory database, with a scripted LLM, a controllable clock and predictable ids.
 * Pass `llmReplies: null` to simulate "no AI provider configured".
 */
export function testApp(options: { llmReplies?: unknown[] | null } = {}) {
  const clock = new FixedClock(T0);
  const llm = options.llmReplies === null ? null : new FakeLlmClient(options.llmReplies ?? []);
  const problem = new Problem(aProblemData());
  const other = new Problem(aProblemData({ id: 'elevator', title: 'Elevator System' }));
  const rubric = aRubric();
  const container = buildContainer({
    db: openDatabase(':memory:'),
    catalog: catalogOf(problem, other),
    rubric,
    llm,
    llmProviders: llm ? [{ name: 'fake', model: 'fake-model' }] : [],
    clock,
    ids: new SequentialIds(),
    logger: silentLogger,
    worker: { pollIntervalMs: 60_000, leaseMs: 60_000, retryPolicy: { autoRetryDelaysMs: [15_000, 45_000] } },
  });
  return { ...container, clock, llm, problem, rubric };
}

export type TestApp = ReturnType<typeof testApp>;

/** Drives a learner through design → reveal → change impact → submit on the Parking Lot problem. */
export function submitAttempt(
  app: TestApp,
  learnerId: string,
  options: { changeImpact?: ChangeImpact; seedFromAttemptId?: string } = {},
) {
  const { view } = app.practice.startAttempt(learnerId, 'parking-lot', options.seedFromAttemptId ?? null);
  const saved = app.practice.saveDesign(learnerId, view.attempt.id, aDesign(), view.attempt.version);
  const revealed = app.practice.revealCurveball(learnerId, saved.attempt.id);
  app.practice.saveChangeImpact(learnerId, revealed.attempt.id, options.changeImpact ?? aChangeImpact(), revealed.attempt.version);
  return app.practice.submit(learnerId, revealed.attempt.id);
}
