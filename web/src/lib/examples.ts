import type { ChangeImpact, DesignDocument } from '@designloop/shared';
import strong from '../../../content/examples/parking-lot.strong.json';

interface Example {
  problemId: string;
  design: DesignDocument;
  changeImpact: ChangeImpact;
}

/**
 * Demo aid for evaluating the prototype quickly: add `?demo` to an attempt URL
 * to load a complete sample design instead of typing one. It is never shown
 * otherwise, because in real practice the learner writes every word.
 */
const EXAMPLES: Example[] = [strong as Example];

export function exampleFor(problemId: string): Example | undefined {
  if (typeof window === 'undefined' || !new URLSearchParams(window.location.search).has('demo')) return undefined;
  return EXAMPLES.find((example) => example.problemId === problemId);
}
