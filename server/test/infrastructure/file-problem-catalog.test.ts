import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import {
  ContentError,
  FileProblemCatalog,
  loadRubric,
} from '../../src/infrastructure/content/file-problem-catalog';
import { CONTENT_DIR } from '../helpers/paths';

function validProblem(id: string): Record<string, unknown> {
  return {
    id,
    version: 1,
    title: `Problem ${id}`,
    difficulty: 'easy',
    estimatedMinutes: 30,
    summary: 'A summary.',
    context: 'Some context.',
    focusConcepts: ['State'],
    requirements: [
      { id: 'R1', text: 'First requirement.' },
      { id: 'R2', text: 'Second requirement.' },
      { id: 'R3', text: 'Third requirement.' },
    ],
    outOfScope: ['Payments'],
    clarifyingQuestions: [{ question: 'Q?', answer: 'A.' }],
    keyFlows: ['Main flow'],
    designPressures: ['Pricing changes.'],
    edgeCases: ['Sold out.'],
    curveballs: [
      { id: `${id}-c1`, title: 'Change 1', description: 'First change.', tests: 'Extensibility.' },
      { id: `${id}-c2`, title: 'Change 2', description: 'Second change.', tests: 'Extensibility.' },
    ],
    alternativeApproaches: [
      { name: 'A', summary: 'S', strengths: 'St', tradeoffs: 'T' },
      { name: 'B', summary: 'S', strengths: 'St', tradeoffs: 'T' },
    ],
  };
}

let tempDirs: string[] = [];

function problemsDir(files: Record<string, unknown>): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'designloop-content-'));
  tempDirs.push(dir);
  const problems = path.join(dir, 'problems');
  mkdirSync(problems);
  for (const [name, body] of Object.entries(files)) {
    writeFileSync(path.join(problems, name), JSON.stringify(body));
  }
  return problems;
}

afterEach(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
  tempDirs = [];
});

describe('FileProblemCatalog', () => {
  test('loads every problem file and finds problems by id', () => {
    const dir = problemsDir({
      'b.json': validProblem('bravo'),
      'a.json': validProblem('alpha'),
    });

    const catalog = FileProblemCatalog.load(dir);

    expect(catalog.list().map((p) => p.id)).toEqual(['alpha', 'bravo']);
    expect(catalog.get('bravo')?.title).toBe('Problem bravo');
    expect(catalog.get('missing')).toBeUndefined();
  });

  test('rejects a problem whose requirement ids repeat', () => {
    const bad = validProblem('dup');
    bad.requirements = [
      { id: 'R1', text: 'One.' },
      { id: 'R1', text: 'Also one.' },
      { id: 'R2', text: 'Two.' },
    ];
    const dir = problemsDir({ 'dup.json': bad });

    expect(() => FileProblemCatalog.load(dir)).toThrow(/dup\.json.*duplicate requirement id R1/s);
  });

  test('rejects a problem that does not have exactly two curveballs', () => {
    const bad = validProblem('one-curveball');
    bad.curveballs = [(bad.curveballs as unknown[])[0]];
    const dir = problemsDir({ 'one.json': bad });

    expect(() => FileProblemCatalog.load(dir)).toThrow(ContentError);
  });

  test('rejects two files that declare the same problem id', () => {
    const dir = problemsDir({ 'a.json': validProblem('same'), 'b.json': validProblem('same') });

    expect(() => FileProblemCatalog.load(dir)).toThrow(/duplicate problem id "same"/);
  });

  test('shipped problem content is valid', () => {
    const catalog = FileProblemCatalog.load(path.join(CONTENT_DIR, 'problems'));

    expect(catalog.list().length).toBeGreaterThanOrEqual(3);
    for (const problem of catalog.list()) {
      expect(problem.keyFlows.length).toBeGreaterThan(0);
    }
  });
});

describe('loadRubric', () => {
  test('shipped rubric loads with a descriptor for every score level', () => {
    const rubric = loadRubric(path.join(CONTENT_DIR, 'rubric.v1.json'));

    expect(rubric.version).toBe('v1');
    for (const criterion of rubric.criteria) {
      expect(Object.keys(criterion.levels).sort()).toEqual(['1', '2', '3', '4']);
    }
  });

  test('rejects a rubric criterion that is missing a level descriptor', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'designloop-rubric-'));
    tempDirs.push(dir);
    const file = path.join(dir, 'rubric.json');
    writeFileSync(
      file,
      JSON.stringify({
        id: 'r',
        version: 'v9',
        scale: [
          { score: 1, label: 'Missing' },
          { score: 2, label: 'Emerging' },
          { score: 3, label: 'Solid' },
          { score: 4, label: 'Strong' },
        ],
        criteria: [
          { id: 'c', name: 'C', question: 'Q?', levels: { '1': 'a', '2': 'b', '3': 'c' } },
        ],
      }),
    );

    expect(() => loadRubric(file)).toThrow(ContentError);
  });
});
