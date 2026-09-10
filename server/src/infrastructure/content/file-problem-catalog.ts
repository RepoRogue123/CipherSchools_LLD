import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { z } from 'zod';
import type { ProblemCatalog } from '../../domain/ports';
import { Problem } from '../../domain/problem';
import { Rubric } from '../../domain/rubric';
import { problemFileSchema, rubricFileSchema } from './content-schema';

/** Thrown at boot when authored content is malformed, so bad content never reaches a learner. */
export class ContentError extends Error {
  override name = 'ContentError';
}

function readValidated<T>(file: string, schema: z.ZodType<T>): T {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    throw new ContentError(`${path.basename(file)}: not valid JSON (${(error as Error).message})`);
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ');
    throw new ContentError(`${path.basename(file)}: ${issues}`);
  }
  return result.data;
}

export class FileProblemCatalog implements ProblemCatalog {
  private constructor(private readonly problems: ReadonlyMap<string, Problem>) {}

  static load(problemsDir: string): FileProblemCatalog {
    const files = readdirSync(problemsDir)
      .filter((name) => name.endsWith('.json'))
      .sort();
    const problems = new Map<string, Problem>();
    for (const name of files) {
      const data = readValidated(path.join(problemsDir, name), problemFileSchema);
      if (problems.has(data.id)) {
        throw new ContentError(`${name}: duplicate problem id "${data.id}"`);
      }
      problems.set(data.id, new Problem(data));
    }
    return new FileProblemCatalog(problems);
  }

  list(): Problem[] {
    return [...this.problems.values()].sort((a, b) => a.id.localeCompare(b.id));
  }

  get(id: string): Problem | undefined {
    return this.problems.get(id);
  }
}

export function loadRubric(file: string): Rubric {
  const data = readValidated(file, rubricFileSchema);
  return new Rubric(data.id, data.version, data.scale, data.criteria);
}
