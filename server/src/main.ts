import { existsSync } from 'node:fs';
import path from 'node:path';
import { consoleLogger } from './application/logger';
import { loadConfig } from './config';
import { buildContainer } from './container';
import { DEFAULT_RETRY_POLICY } from './domain/evaluation';
import { createApp } from './http/app';
import { FileProblemCatalog, loadRubric } from './infrastructure/content/file-problem-catalog';
import { FallbackLlmClient } from './infrastructure/llm/fallback-llm-client';
import { OpenAiCompatibleClient } from './infrastructure/llm/openai-compatible-client';
import { providerConfigsFromEnv } from './infrastructure/llm/providers';
import { openDatabase } from './infrastructure/sqlite/database';
import { randomIds, systemClock } from './infrastructure/system';

const logger = consoleLogger;
const config = loadConfig();

const db = openDatabase(config.databasePath);
const catalog = FileProblemCatalog.load(path.join(config.contentDir, 'problems'));
const rubric = loadRubric(path.join(config.contentDir, 'rubric.v1.json'));

const providers = providerConfigsFromEnv(process.env, config.llmTimeoutMs);
const llm = providers.length
  ? new FallbackLlmClient(
      providers.map((provider) => ({ name: provider.name, client: new OpenAiCompatibleClient(provider) })),
      systemClock,
    )
  : null;

const container = buildContainer({
  db,
  catalog,
  rubric,
  llm,
  llmProviders: providers.map(({ name, model }) => ({ name, model })),
  llmStatus: () => llm?.status() ?? [],
  clock: systemClock,
  ids: randomIds,
  logger,
  worker: {
    pollIntervalMs: config.workerPollMs,
    leaseMs: config.evaluationLeaseMs,
    retryPolicy: DEFAULT_RETRY_POLICY,
  },
});

const webDistDir = existsSync(path.join(config.webDistDir, 'index.html')) ? config.webDistDir : null;
const app = createApp(container, { webDistDir, logger });

container.worker.start();
const server = app.listen(config.port, () => {
  logger.info('DesignLoop is running', {
    url: `http://localhost:${config.port}`,
    problems: catalog.list().length,
    aiReview: providers.length ? providers.map((p) => `${p.name}:${p.model}`) : 'disabled (no provider key set)',
    servingWeb: webDistDir !== null,
  });
});

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info('Shutting down', { signal });
  server.close();
  await container.worker.stop();
  db.close();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('unhandledRejection', (reason) => logger.error('Unhandled promise rejection', { reason: String(reason) }));
