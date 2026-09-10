import type { DatabaseSync } from 'node:sqlite';
import type { HealthDto } from '@designloop/shared';
import { EvaluationWorker, type WorkerOptions } from './application/evaluation-worker';
import type { Logger } from './application/logger';
import { PracticeService } from './application/practice-service';
import { ProgressService } from './application/progress-service';
import type { Clock, IdGenerator, ProblemCatalog } from './domain/ports';
import type { Rubric } from './domain/rubric';
import { EvaluationPipeline } from './evaluation/evaluation-pipeline';
import { FeedbackAssembler } from './evaluation/feedback-assembler';
import { DesignFormatRegistry } from './evaluation/formats/design-format-registry';
import { StructuredDesignFormatV1 } from './evaluation/formats/structured-design-v1';
import type { LlmClient } from './evaluation/llm/llm-client';
import { LlmRubricEvaluator } from './evaluation/llm/llm-rubric-evaluator';
import { PROMPT_VERSION } from './evaluation/llm/prompt-builder';
import { StructuralEvaluator } from './evaluation/structural/structural-evaluator';
import {
  SqliteAttemptRepository,
  SqliteEvaluationRepository,
  SqliteLearnerRepository,
  SqliteSubmissionRepository,
  SqliteTransactionRunner,
} from './infrastructure/sqlite/repositories';

export interface ContainerOptions {
  db: DatabaseSync;
  catalog: ProblemCatalog;
  rubric: Rubric;
  /** null when no AI provider is configured: evaluations then complete with deterministic feedback only. */
  llm: LlmClient | null;
  llmProviders: { name: string; model: string }[];
  llmStatus?: () => { name: string; coolingDownUntil: Date | null }[];
  clock: Clock;
  ids: IdGenerator;
  logger: Logger;
  worker: WorkerOptions;
}

/**
 * Composition root: the one place that knows every concrete class. A second
 * evaluator (rule-based or human review) is registered in the `evaluators` list
 * below, and nothing else changes.
 */
export function buildContainer(options: ContainerOptions) {
  const { db, catalog, rubric, llm, clock, ids, logger } = options;
  const repositories = {
    learners: new SqliteLearnerRepository(db),
    attempts: new SqliteAttemptRepository(db),
    submissions: new SqliteSubmissionRepository(db),
    evaluations: new SqliteEvaluationRepository(db),
  };
  const formats = new DesignFormatRegistry([new StructuredDesignFormatV1()]);

  const pipeline = new EvaluationPipeline({
    evaluators: [new StructuralEvaluator(), new LlmRubricEvaluator(llm)],
    formats,
    catalog,
    rubric,
    evaluations: repositories.evaluations,
    assembler: new FeedbackAssembler(rubric),
    clock,
  });

  const worker = new EvaluationWorker(
    { evaluations: repositories.evaluations, submissions: repositories.submissions, pipeline, clock, logger },
    options.worker,
  );

  const practice = new PracticeService({
    catalog,
    rubric,
    promptVersion: PROMPT_VERSION,
    formats,
    ...repositories,
    tx: new SqliteTransactionRunner(db),
    clock,
    ids,
    onSubmitted: () => worker.notify(),
  });

  const progress = new ProgressService({ catalog, rubric, ...repositories });

  const health = (): HealthDto => {
    const cooling = new Map((options.llmStatus?.() ?? []).map((s) => [s.name, s.coolingDownUntil]));
    return {
      status: 'ok',
      aiReview: {
        enabled: llm !== null,
        providers: options.llmProviders.map((p) => ({
          name: p.name,
          model: p.model,
          coolingDownUntil: cooling.get(p.name)?.toISOString() ?? null,
        })),
      },
    };
  };

  return { repositories, practice, progress, worker, catalog, rubric, health };
}

export type Container = ReturnType<typeof buildContainer>;
