import type { Score } from '@designloop/shared';

export interface ScaleLevel {
  score: Score;
  label: string;
}

export interface Criterion {
  id: string;
  name: string;
  /** The question a reviewer answers for this criterion. */
  question: string;
  /** Anchored descriptor for each score level, so every score means the same thing every time. */
  levels: Record<`${Score}`, string>;
}

/**
 * A versioned, data-defined rubric. Evaluations record the version they were
 * scored against, so scores from different versions are never compared silently.
 */
export class Rubric {
  constructor(
    readonly id: string,
    readonly version: string,
    readonly scale: readonly ScaleLevel[],
    readonly criteria: readonly Criterion[],
  ) {}

  get criterionIds(): string[] {
    return this.criteria.map((c) => c.id);
  }

  criterion(id: string): Criterion | undefined {
    return this.criteria.find((c) => c.id === id);
  }

  levelLabel(score: Score): string {
    return this.scale.find((level) => level.score === score)?.label ?? String(score);
  }
}
