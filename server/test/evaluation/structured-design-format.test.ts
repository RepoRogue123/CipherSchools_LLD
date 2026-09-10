import { describe, expect, test } from 'vitest';
import { reviewText } from '../../src/domain/design-format';
import { Problem } from '../../src/domain/problem';
import { StructuredDesignFormatV1 } from '../../src/evaluation/formats/structured-design-v1';
import { aDesign, aProblemData } from '../helpers/builders';

const format = new StructuredDesignFormatV1();
const problem = new Problem(aProblemData());

describe('StructuredDesignFormatV1.toModel', () => {
  test('splits attribute and method text into trimmed, non-empty lines', () => {
    const design = aDesign();
    design.entities[0]!.methods = '  park(vehicle): Ticket \n\n unpark(ticket): Receipt\n';

    const model = format.toModel(design, null);

    expect(model.entities[0]!.methods).toEqual(['park(vehicle): Ticket', 'unpark(ticket): Receipt']);
    expect(model.changeImpact).toBeNull();
  });

  test('carries the change impact through', () => {
    const model = format.toModel(aDesign(), {
      approach: ' Add ChargingSpot. ',
      modifiedEntityIds: ['e2'],
      newEntities: [{ id: 'n1', name: ' ChargingSpot ', responsibility: 'Charges EVs.' }],
      risks: '',
    });

    expect(model.changeImpact).toEqual({
      approach: 'Add ChargingSpot.',
      modifiedEntityIds: ['e2'],
      newEntities: [{ name: 'ChargingSpot', responsibility: 'Charges EVs.' }],
      risks: '',
    });
  });
});

describe('StructuredDesignFormatV1.render', () => {
  test('gives every entity, requirement, flow and decision its own citable anchor', () => {
    const model = format.toModel(aDesign(), null);

    const anchors = format.render(model, problem).sections.map((s) => s.anchor);

    expect(anchors).toEqual([
      'assumptions',
      'entity:ParkingLot',
      'entity:ParkingFloor',
      'entity:PricingStrategy',
      'relationships',
      'mapping:R1',
      'mapping:R2',
      'mapping:R3',
      'flow:Vehicle enters',
      'edgeCases',
      'decision:1',
    ]);
  });

  test('marks unmapped requirements explicitly instead of omitting them', () => {
    const design = aDesign();
    delete design.requirementMappings.R3;

    const doc = format.render(format.toModel(design, null), problem);

    expect(doc.sections.find((s) => s.anchor === 'mapping:R3')?.text).toBe('(not mapped)');
  });

  test('renders relationships and the change impact with entity names, not ids', () => {
    const model = format.toModel(aDesign(), {
      approach: 'Add a ChargingSpot.',
      modifiedEntityIds: ['e2'],
      newEntities: [{ id: 'n1', name: 'ChargingSpot', responsibility: 'Meters energy.' }],
      risks: 'Pricing needs an energy component.',
    });

    const text = reviewText(format.render(model, problem));

    expect(text).toContain('ParkingLot composes ParkingFloor');
    expect(text).toContain('ParkingLot depends on PricingStrategy (fee calculation)');
    expect(text).toContain('Modifies existing: ParkingFloor');
    expect(text).toContain('Adds new: ChargingSpot (Meters energy.)');
    expect(text).not.toContain('e2');
  });
});
