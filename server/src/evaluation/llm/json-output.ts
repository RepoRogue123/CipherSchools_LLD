import type { z } from 'zod';

export type ParsedOutput<T> = { ok: true; data: T } | { ok: false; error: string };

const MAX_ISSUES_REPORTED = 8;

function extractJson(text: string): string | null {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const candidate = (fenced?.[1] ?? text).trim();
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  return start >= 0 && end > start ? candidate.slice(start, end + 1) : null;
}

/** Extracts and validates the JSON object in a model reply; errors are phrased so the model can fix them. */
export function parseJsonOutput<T>(text: string, schema: z.ZodType<T>): ParsedOutput<T> {
  const json = extractJson(text);
  if (json === null) return { ok: false, error: 'the reply did not contain a JSON object' };
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch (error) {
    return { ok: false, error: `the reply was not valid JSON (${(error as Error).message})` };
  }
  const result = schema.safeParse(raw);
  if (result.success) return { ok: true, data: result.data };
  const issues = result.error.issues
    .slice(0, MAX_ISSUES_REPORTED)
    .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('; ');
  return { ok: false, error: `the JSON did not match the required schema (${issues})` };
}
