import {
  STRUCTURED_DESIGN_V1,
  type ChangeImpact,
  type DesignDocument,
  type RelationshipType,
} from '@designloop/shared';
import type { DesignFormat, DesignModel, ReviewDocument, ReviewSection } from '../../domain/design-format';
import type { Problem } from '../../domain/problem';

const RELATIONSHIP_VERBS: Record<RelationshipType, string> = {
  inherits: 'inherits from',
  implements: 'implements',
  composes: 'composes',
  aggregates: 'aggregates',
  associates: 'is associated with',
  depends: 'depends on',
};

const EMPTY = '(empty)';

function lines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/** Adapter for the MVP's guided, sectioned design document. */
export class StructuredDesignFormatV1 implements DesignFormat<DesignDocument> {
  readonly id = STRUCTURED_DESIGN_V1;

  toModel(design: DesignDocument, changeImpact: ChangeImpact | null): DesignModel {
    return {
      assumptions: design.assumptions.trim(),
      entities: design.entities.map((entity) => ({
        id: entity.id,
        name: entity.name.trim(),
        kind: entity.kind,
        responsibility: entity.responsibility.trim(),
        attributes: lines(entity.attributes),
        methods: lines(entity.methods),
      })),
      relationships: design.relationships.map((r) => ({
        id: r.id,
        fromId: r.fromId,
        toId: r.toId,
        type: r.type,
        note: r.note.trim(),
      })),
      requirementMappings: Object.fromEntries(
        Object.entries(design.requirementMappings).map(([id, text]) => [id, text.trim()]),
      ),
      flows: design.flows.map((f) => ({ id: f.id, name: f.name.trim(), steps: f.steps.trim() })),
      edgeCases: design.edgeCases.trim(),
      decisions: design.decisions.map((d) => ({
        id: d.id,
        decision: d.decision.trim(),
        alternative: d.alternative.trim(),
        rationale: d.rationale.trim(),
      })),
      changeImpact: changeImpact
        ? {
            approach: changeImpact.approach.trim(),
            modifiedEntityIds: [...changeImpact.modifiedEntityIds],
            newEntities: changeImpact.newEntities.map((e) => ({
              name: e.name.trim(),
              responsibility: e.responsibility.trim(),
            })),
            risks: changeImpact.risks.trim(),
          }
        : null,
    };
  }

  render(model: DesignModel, problem: Problem): ReviewDocument {
    const nameOf = new Map(model.entities.map((e, i) => [e.id, e.name || `(unnamed ${i + 1})`]));
    const sections: ReviewSection[] = [
      { anchor: 'assumptions', title: 'Assumptions & scope', text: model.assumptions || EMPTY },
    ];

    model.entities.forEach((entity, index) => {
      const name = entity.name || `(unnamed ${index + 1})`;
      sections.push({
        anchor: `entity:${name}`,
        title: `${name} (${entity.kind})`,
        text: [
          `Responsibility: ${entity.responsibility || EMPTY}`,
          `Attributes: ${entity.attributes.length ? entity.attributes.join('; ') : 'none'}`,
          `Methods: ${entity.methods.length ? entity.methods.join('; ') : 'none'}`,
        ].join('\n'),
      });
    });

    sections.push({
      anchor: 'relationships',
      title: 'Relationships',
      text:
        model.relationships
          .map((r) => {
            const from = nameOf.get(r.fromId) ?? '(missing entity)';
            const to = nameOf.get(r.toId) ?? '(missing entity)';
            return `${from} ${RELATIONSHIP_VERBS[r.type]} ${to}${r.note ? ` (${r.note})` : ''}`;
          })
          .join('\n') || '(none)',
    });

    for (const requirement of problem.requirements) {
      sections.push({
        anchor: `mapping:${requirement.id}`,
        title: `${requirement.id}: ${requirement.text}`,
        text: model.requirementMappings[requirement.id] || '(not mapped)',
      });
    }

    model.flows.forEach((flow, index) => {
      const name = flow.name || `${index + 1}`;
      sections.push({ anchor: `flow:${name}`, title: `Flow: ${name}`, text: flow.steps || EMPTY });
    });

    sections.push({
      anchor: 'edgeCases',
      title: 'Edge cases & failure handling',
      text: model.edgeCases || EMPTY,
    });

    model.decisions.forEach((decision, index) => {
      sections.push({
        anchor: `decision:${index + 1}`,
        title: `Decision ${index + 1}`,
        text: [
          `Decision: ${decision.decision || EMPTY}`,
          `Alternative considered: ${decision.alternative || EMPTY}`,
          `Rationale: ${decision.rationale || EMPTY}`,
        ].join('\n'),
      });
    });

    if (model.changeImpact) {
      const impact = model.changeImpact;
      const modified = impact.modifiedEntityIds.map((id) => nameOf.get(id) ?? '(missing entity)');
      const added = impact.newEntities
        .filter((e) => e.name)
        .map((e) => (e.responsibility ? `${e.name} (${e.responsibility})` : e.name));
      sections.push({
        anchor: 'changeImpact',
        title: 'Change impact (written after the curveball, with the core design locked)',
        text: [
          `Approach: ${impact.approach || EMPTY}`,
          `Modifies existing: ${modified.length ? modified.join(', ') : 'none'}`,
          `Adds new: ${added.length ? added.join('; ') : 'none'}`,
          `Risks: ${impact.risks || 'none stated'}`,
        ].join('\n'),
      });
    }

    return { sections };
  }
}
