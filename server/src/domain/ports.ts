import type { Problem } from './problem';

/** Read-only access to practice problems. File-backed today; a DB or CMS later. */
export interface ProblemCatalog {
  list(): Problem[];
  get(id: string): Problem | undefined;
}

export interface Clock {
  now(): Date;
}

export interface IdGenerator {
  next(): string;
}
