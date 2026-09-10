import path from 'node:path';
import type { ChangeImpact, DesignDocument } from '@designloop/shared';
import { emptyDesignDocument } from '@designloop/shared';
import { describe, expect, test } from 'vitest';
import { Problem } from '../../src/domain/problem';
import { StructuredDesignFormatV1 } from '../../src/evaluation/formats/structured-design-v1';
import { blockersOf, checkDesign } from '../../src/evaluation/structural/checks';
import { loadRubric } from '../../src/infrastructure/content/file-problem-catalog';
import { aDesign, aProblemData } from '../helpers/builders';
import { CONTENT_DIR } from '../helpers/paths';

const format = new StructuredDesignFormatV1();
const problem = new Problem(aProblemData());

function check(design: DesignDocument, changeImpact: ChangeImpact | null = null) {
  return checkDesign(format.toModel(design, changeImpact), problem);
}

const ids = (report: ReturnType<typeof check>) => report.findings.map((f) => f.checkId);

const goodImpact: ChangeImpact = {
  approach: 'Add a ChargingSpot type and an EnergyFee component behind PricingStrategy.',
  modifiedEntityIds: ['e2'],
  newEntities: [
    { id: 'n1', name: 'ChargingSpot', responsibility: 'Spot with a charger.' },
    { id: 'n2', name: 'EnergyFee', responsibility: 'Adds per-kWh cost.' },
  ],
  risks: '',
};

describe('checkDesign on a complete design', () => {
  test('finds no blockers and reports metrics', () => {
    const report = check(aDesign(), goodImpact);

    expect(blockersOf(report)).toEqual([]);
    expect(report.metrics).toEqual({
      entityCount: 3,
      abstractionCount: 1,
      relationshipCount: 2,
      requirementCoverage: { mapped: 3, total: 3 },
      flowCount: 1,
      decisionCount: 1,
      changeImpact: { modified: 1, added: 2 },
    });
    expect(report.caps).toEqual([]);
  });
});

describe('curveball gate blockers', () => {
  test('an empty design is blocked on entities and flows', () => {
    const report = check(emptyDesignDocument());

    expect(blockersOf(report).map((f) => f.checkId)).toEqual(['entities.min', 'flows.min']);
  });

  test('duplicate entity names block (case-insensitive)', () => {
    const design = aDesign();
    design.entities[1]!.name = 'parkinglot';

    expect(blockersOf(check(design)).map((f) => f.checkId)).toContain('entities.duplicate-names');
  });

  test('an unnamed entity blocks', () => {
    const design = aDesign();
    design.entities[2]!.name = '  ';

    expect(blockersOf(check(design)).map((f) => f.checkId)).toContain('entities.unnamed');
  });

  test('a relationship to a missing entity blocks', () => {
    const design = aDesign();
    design.relationships.push({ id: 'r9', fromId: 'e1', type: 'associates', toId: 'ghost', note: '' });

    expect(blockersOf(check(design)).map((f) => f.checkId)).toContain('relationships.dangling');
  });

  test('a class inheriting from itself blocks', () => {
    const design = aDesign();
    design.relationships.push({ id: 'r9', fromId: 'e2', type: 'inherits', toId: 'e2', note: '' });

    expect(blockersOf(check(design)).map((f) => f.checkId)).toContain('relationships.self-inheritance');
  });
});

describe('warnings and caps', () => {
  test('lists unmapped requirements and caps requirement understanding below 50% coverage', () => {
    const design = aDesign();
    design.requirementMappings = { R1: 'ParkingLot composes floors.' };

    const report = check(design);

    const coverage = report.findings.find((f) => f.checkId === 'mapping.coverage');
    expect(coverage?.severity).toBe('warning');
    expect(coverage?.message).toContain('R2, R3');
    expect(report.caps).toContainEqual(
      expect.objectContaining({ criterionId: 'requirements', maxScore: 2, checkId: 'mapping.coverage' }),
    );
  });

  test('does not cap requirement understanding at exactly 50% or more', () => {
    const design = aDesign();
    design.requirementMappings = { R1: 'ParkingLot.', R2: 'ParkingFloor.' };

    expect(check(design).caps.map((c) => c.criterionId)).not.toContain('requirements');
  });

  test('flags a mapping that names no declared entity', () => {
    const design = aDesign();
    design.requirementMappings.R2 = 'The system checks it somehow.';

    const finding = check(design).findings.find((f) => f.checkId === 'mapping.no-entity');

    expect(finding?.location).toBe('mapping:R2');
  });

  test('flags class-like names used but never declared, ignoring declared and newly added ones', () => {
    const design = aDesign();
    design.flows[0]!.steps = 'Gate calls ParkingLot.park; PaymentService charges; ChargingSpot meters.';

    const report = check(design, goodImpact);
    const undeclared = report.findings.find((f) => f.checkId === 'names.undeclared');

    expect(undeclared?.message).toContain('PaymentService');
    expect(undeclared?.message).not.toContain('ParkingLot');
    expect(undeclared?.message).not.toContain('ChargingSpot');
  });

  test('caps responsibilities when more than a third of entities lack one', () => {
    const design = aDesign();
    design.entities[0]!.responsibility = '';
    design.entities[1]!.responsibility = 'tbd';

    const report = check(design);

    expect(report.findings.filter((f) => f.checkId === 'entities.responsibility')).toHaveLength(2);
    expect(report.caps.map((c) => c.criterionId)).toContain('responsibilities');
  });

  test('caps trade-offs when no decision has both an alternative and a rationale', () => {
    const design = aDesign();
    design.decisions[0]!.alternative = '';

    const report = check(design);

    expect(ids(report)).toContain('decisions.tradeoff');
    expect(report.caps.map((c) => c.criterionId)).toContain('tradeoffs');
  });

  test('caps robustness when the edge-case section is empty', () => {
    const design = aDesign();
    design.edgeCases = '   ';

    const report = check(design);

    expect(ids(report)).toContain('edge-cases.empty');
    expect(report.caps.map((c) => c.criterionId)).toContain('robustness');
  });

  test('reports orphan entities and a missing assumptions section as advice only', () => {
    const design = aDesign();
    design.relationships = design.relationships.filter((r) => r.toId !== 'e3');
    design.assumptions = '';

    const report = check(design);

    expect(report.findings.find((f) => f.checkId === 'entities.orphan')?.severity).toBe('info');
    expect(report.findings.find((f) => f.checkId === 'assumptions.empty')?.severity).toBe('warning');
    expect(blockersOf(report)).toEqual([]);
  });

  test('signals a possible god class', () => {
    const design = aDesign();
    design.entities[0]!.methods = Array.from({ length: 12 }, (_, i) => `m${i}()`).join('\n');

    expect(check(design).findings.find((f) => f.checkId === 'entities.god-class')?.location).toBe(
      'entity:ParkingLot',
    );
  });
});

describe('submit gate (change impact)', () => {
  test('a missing or one-line change explanation blocks submission', () => {
    const report = check(aDesign(), { ...goodImpact, approach: 'Add a class.' });

    expect(blockersOf(report).map((f) => f.checkId)).toEqual(['change.approach']);
  });

  test('modifying an entity that is not in the design blocks submission', () => {
    const report = check(aDesign(), { ...goodImpact, modifiedEntityIds: ['ghost'] });

    expect(blockersOf(report).map((f) => f.checkId)).toEqual(['change.unknown-entities']);
  });

  test('caps extensibility when the change names no class it modifies or adds', () => {
    const report = check(aDesign(), {
      approach: 'We would handle this by extending the system in a sensible and careful way.',
      modifiedEntityIds: [],
      newEntities: [],
      risks: '',
    });

    expect(ids(report)).toContain('change.no-entities');
    expect(report.caps.map((c) => c.criterionId)).toContain('extensibility');
  });

  test('no change-impact checks run before the curveball is revealed', () => {
    expect(ids(check(aDesign(), null)).filter((id) => id.startsWith('change.'))).toEqual([]);
  });
});

describe('caps and the shipped rubric', () => {
  test('every cap targets a criterion that exists in the rubric', () => {
    const rubric = loadRubric(path.join(CONTENT_DIR, 'rubric.v1.json'));
    const design = aDesign();
    design.requirementMappings = {};
    design.entities.forEach((e) => (e.responsibility = ''));
    design.decisions = [];
    design.edgeCases = '';

    const report = check(design, { approach: 'x'.repeat(60), modifiedEntityIds: [], newEntities: [], risks: '' });

    expect(report.caps.length).toBe(5);
    for (const cap of report.caps) expect(rubric.criterionIds).toContain(cap.criterionId);
  });
});
