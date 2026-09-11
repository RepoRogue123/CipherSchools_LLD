import type { ChangeImpact, EntityKind, RelationshipType } from '@designloop/shared';
import type { Problem } from './problem';

export interface ModelEntity {
  id: string;
  name: string;
  kind: EntityKind;
  responsibility: string;
  attributes: string[];
  methods: string[];
}

export interface ModelRelationship {
  id: string;
  fromId: string;
  toId: string;
  type: RelationshipType;
  note: string;
}

/**
 * Format-independent view of a design. Evaluators read this, never the raw
 * submission format, so adding a new format (e.g. a class diagram) is a new
 * DesignFormat adapter and not a change to any evaluator.
 */
export interface DesignModel {
  assumptions: string;
  entities: ModelEntity[];
  relationships: ModelRelationship[];
  /** Requirement id → how the design satisfies it. */
  requirementMappings: Record<string, string>;
  flows: { id: string; name: string; steps: string }[];
  edgeCases: string;
  decisions: { id: string; decision: string; alternative: string; rationale: string }[];
  changeImpact: {
    approach: string;
    modifiedEntityIds: string[];
    newEntities: { name: string; responsibility: string }[];
    risks: string;
  } | null;
}

/** One anchored section of the text a reviewer sees; anchors make evidence citable. */
export interface ReviewSection {
  anchor: string;
  title: string;
  /** What the learner wrote for this section. */
  text: string;
  /** Set when the learner wrote the title too (an entity's name and kind); other titles are ours. */
  titleByLearner?: boolean;
}

export interface ReviewDocument {
  sections: ReviewSection[];
}

export function reviewText(document: ReviewDocument): string {
  return document.sections.map((s) => `[${s.anchor}] ${s.title}\n${s.text}`).join('\n\n');
}

/** Adapter for one submission format (Change Test A: a new format is one new adapter). */
export interface DesignFormat<TContent> {
  readonly id: string;
  toModel(content: TContent, changeImpact: ChangeImpact | null): DesignModel;
  render(model: DesignModel, problem: Problem): ReviewDocument;
}
