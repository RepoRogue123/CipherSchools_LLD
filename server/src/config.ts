import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));

/** Blank values in .env files mean "use the default". */
const env = <T extends z.ZodType>(schema: T) => z.preprocess((value) => (value === '' ? undefined : value), schema);

const schema = z.object({
  PORT: env(z.coerce.number().int().min(1).max(65_535).default(4000)),
  DATABASE_PATH: env(z.string().default(path.join(REPO_ROOT, 'server', 'data', 'designloop.db'))),
  CONTENT_DIR: env(z.string().default(path.join(REPO_ROOT, 'content'))),
  WEB_DIST_DIR: env(z.string().default(path.join(REPO_ROOT, 'web', 'dist'))),
  /** Per-request timeout for one LLM call. */
  LLM_TIMEOUT_MS: env(z.coerce.number().int().positive().default(45_000)),
  /** How long a claimed evaluation is reserved before it is considered abandoned (renewed by heartbeat). */
  EVALUATION_LEASE_MS: env(z.coerce.number().int().positive().default(60_000)),
  WORKER_POLL_MS: env(z.coerce.number().int().positive().default(2_000)),
});

export interface AppConfig {
  port: number;
  databasePath: string;
  contentDir: string;
  webDistDir: string;
  llmTimeoutMs: number;
  evaluationLeaseMs: number;
  workerPollMs: number;
}

export function loadConfig(source: Record<string, string | undefined> = process.env): AppConfig {
  const result = schema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid configuration: ${issues}`);
  }
  const c = result.data;
  return {
    port: c.PORT,
    databasePath: c.DATABASE_PATH,
    contentDir: c.CONTENT_DIR,
    webDistDir: c.WEB_DIST_DIR,
    llmTimeoutMs: c.LLM_TIMEOUT_MS,
    evaluationLeaseMs: c.EVALUATION_LEASE_MS,
    workerPollMs: c.WORKER_POLL_MS,
  };
}
