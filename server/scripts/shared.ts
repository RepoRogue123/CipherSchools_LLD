import { readFileSync } from 'node:fs';
import path from 'node:path';
import { changeImpactSchema, designDocumentSchema } from '@designloop/shared';
import { z } from 'zod';
import { loadConfig } from '../src/config';
import { Submission } from '../src/domain/submission';
import { FileProblemCatalog, loadRubric } from '../src/infrastructure/content/file-problem-catalog';
import { FallbackLlmClient } from '../src/infrastructure/llm/fallback-llm-client';
import { OpenAiCompatibleClient } from '../src/infrastructure/llm/openai-compatible-client';
import { providerConfigsFromEnv } from '../src/infrastructure/llm/providers';
import { systemClock } from '../src/infrastructure/system';

/** Shared setup for the operator scripts (smoke test, calibration). */
export function loadEnvironment() {
  const config = loadConfig();
  const catalog = FileProblemCatalog.load(path.join(config.contentDir, 'problems'));
  const rubric = loadRubric(path.join(config.contentDir, 'rubric.v1.json'));
  const providers = providerConfigsFromEnv(process.env, config.llmTimeoutMs);
  return { config, catalog, rubric, providers };
}

export function fallbackClient(providers: ReturnType<typeof loadEnvironment>['providers']) {
  return new FallbackLlmClient(
    providers.map((p) => ({ name: p.name, client: new OpenAiCompatibleClient(p) })),
    systemClock,
  );
}

const fixtureSchema = z.object({
  label: z.string(),
  problemId: z.string(),
  curveballId: z.string(),
  design: designDocumentSchema,
  changeImpact: changeImpactSchema,
});

export function loadFixture(name: string) {
  const file = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), 'fixtures', name);
  const fixture = fixtureSchema.parse(JSON.parse(readFileSync(file, 'utf8')));
  const submission = Submission.create({
    id: `fixture-${fixture.label}`,
    attemptId: `fixture-${fixture.label}`,
    learnerId: 'calibration',
    problemId: fixture.problemId,
    curveballId: fixture.curveballId,
    design: fixture.design,
    changeImpact: fixture.changeImpact,
    submittedAt: new Date(),
  });
  return { label: fixture.label, submission };
}
