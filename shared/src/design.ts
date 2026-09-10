import { z } from 'zod';
import { entityKindSchema, relationshipTypeSchema } from './enums';

/**
 * Size limits keep drafts reviewable and prompts bounded.
 * Schemas enforce shape and size only; completeness is judged by structural checks,
 * so an unfinished draft is still a valid document.
 */
export const LIMITS = {
  shortText: 200,
  mediumText: 1_000,
  longText: 4_000,
  maxEntities: 40,
  maxRelationships: 80,
  maxFlows: 8,
  maxDecisions: 10,
  maxNewEntities: 12,
} as const;

/** Format identifier for the only submission format in the MVP. */
export const STRUCTURED_DESIGN_V1 = 'structured-design/v1' as const;

const idSchema = z.string().min(1).max(64);
const shortText = z.string().max(LIMITS.shortText);
const mediumText = z.string().max(LIMITS.mediumText);
const longText = z.string().max(LIMITS.longText);

export const entitySpecSchema = z.object({
  id: idSchema,
  name: shortText,
  kind: entityKindSchema,
  responsibility: mediumText,
  /** One attribute per line, e.g. "spots: List<ParkingSpot>". */
  attributes: mediumText,
  /** One method per line, e.g. "park(vehicle): Ticket". */
  methods: mediumText,
});
export type EntitySpec = z.infer<typeof entitySpecSchema>;

export const relationshipSpecSchema = z.object({
  id: idSchema,
  fromId: idSchema,
  type: relationshipTypeSchema,
  toId: idSchema,
  note: shortText,
});
export type RelationshipSpec = z.infer<typeof relationshipSpecSchema>;

export const flowSpecSchema = z.object({
  id: idSchema,
  name: shortText,
  steps: longText,
});
export type FlowSpec = z.infer<typeof flowSpecSchema>;

export const decisionSpecSchema = z.object({
  id: idSchema,
  decision: mediumText,
  alternative: mediumText,
  rationale: mediumText,
});
export type DecisionSpec = z.infer<typeof decisionSpecSchema>;

export const designDocumentSchema = z.object({
  assumptions: longText,
  entities: z.array(entitySpecSchema).max(LIMITS.maxEntities),
  relationships: z.array(relationshipSpecSchema).max(LIMITS.maxRelationships),
  /** Requirement id (e.g. "R3") → how the design satisfies it. */
  requirementMappings: z.record(z.string().max(16), mediumText),
  flows: z.array(flowSpecSchema).max(LIMITS.maxFlows),
  edgeCases: longText,
  decisions: z.array(decisionSpecSchema).max(LIMITS.maxDecisions),
});
export type DesignDocument = z.infer<typeof designDocumentSchema>;

export const newEntitySpecSchema = z.object({
  id: idSchema,
  name: shortText,
  responsibility: mediumText,
});
export type NewEntitySpec = z.infer<typeof newEntitySpecSchema>;

/** The learner's answer to the curveball, written after the core design is locked. */
export const changeImpactSchema = z.object({
  approach: longText,
  modifiedEntityIds: z.array(idSchema).max(LIMITS.maxEntities),
  newEntities: z.array(newEntitySpecSchema).max(LIMITS.maxNewEntities),
  risks: mediumText,
});
export type ChangeImpact = z.infer<typeof changeImpactSchema>;

export function emptyDesignDocument(): DesignDocument {
  return {
    assumptions: '',
    entities: [],
    relationships: [],
    requirementMappings: {},
    flows: [],
    edgeCases: '',
    decisions: [],
  };
}

export function emptyChangeImpact(): ChangeImpact {
  return { approach: '', modifiedEntityIds: [], newEntities: [], risks: '' };
}
