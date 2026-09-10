import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { StructuredDesignFormatV1 } from '../../src/evaluation/formats/structured-design-v1';
import { blockersOf, checkDesign } from '../../src/evaluation/structural/checks';
import { FileProblemCatalog } from '../../src/infrastructure/content/file-problem-catalog';
import { loadFixture } from '../../scripts/shared';
import { CONTENT_DIR } from '../helpers/paths';

const catalog = FileProblemCatalog.load(path.join(CONTENT_DIR, 'problems'));
const format = new StructuredDesignFormatV1();

function check(fixture: string) {
  const { submission } = loadFixture(fixture);
  const problem = catalog.get(submission.problemId)!;
  expect(problem.findCurveball(submission.curveballId)).toBeDefined();
  return checkDesign(format.toModel(submission.design, submission.changeImpact), problem);
}

describe('calibration fixtures', () => {
  test('the strong design clears every gate and triggers no caps', () => {
    const report = check('parking-lot.strong.json');

    expect(blockersOf(report)).toEqual([]);
    expect(report.caps).toEqual([]);
    expect(report.metrics.requirementCoverage).toEqual({ mapped: 7, total: 7 });
  });

  test('the weak design is capped exactly where its evidence is missing', () => {
    const report = check('parking-lot.weak.json');

    expect(blockersOf(report)).toEqual([]);
    expect(report.caps.map((c) => c.criterionId).sort()).toEqual(['requirements', 'robustness', 'tradeoffs']);
    expect(report.findings.map((f) => f.checkId)).toContain('entities.god-class');
  });
});
