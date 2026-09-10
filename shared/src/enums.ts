import { z } from 'zod';

export const DIFFICULTIES = ['easy', 'medium', 'hard'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export const ENTITY_KINDS = ['class', 'interface', 'abstract', 'enum'] as const;
export const entityKindSchema = z.enum(ENTITY_KINDS);
export type EntityKind = z.infer<typeof entityKindSchema>;

export const RELATIONSHIP_TYPES = [
  'inherits',
  'implements',
  'composes',
  'aggregates',
  'associates',
  'depends',
] as const;
export const relationshipTypeSchema = z.enum(RELATIONSHIP_TYPES);
export type RelationshipType = z.infer<typeof relationshipTypeSchema>;

/** Practice lifecycle: design → curveball revealed (core design locked) → submitted. */
export const ATTEMPT_STATUSES = ['IN_PROGRESS', 'CURVEBALL_REVEALED', 'SUBMITTED'] as const;
export type AttemptStatus = (typeof ATTEMPT_STATUSES)[number];

/** Evaluation job lifecycle. QUEUED is shown to learners as "Submitted". */
export const EVALUATION_STATUSES = ['QUEUED', 'EVALUATING', 'COMPLETED', 'FAILED'] as const;
export type EvaluationStatus = (typeof EVALUATION_STATUSES)[number];

export const STEP_STATUSES = ['PENDING', 'COMPLETED', 'FAILED', 'SKIPPED'] as const;
export type StepStatus = (typeof STEP_STATUSES)[number];

export const FINDING_SEVERITIES = ['blocker', 'warning', 'info'] as const;
export type FindingSeverity = (typeof FINDING_SEVERITIES)[number];

export const CONFIDENCE_LEVELS = ['low', 'medium', 'high'] as const;
export const confidenceSchema = z.enum(CONFIDENCE_LEVELS);
export type Confidence = z.infer<typeof confidenceSchema>;

export const ASSESSMENT_SOURCES = ['deterministic', 'ai', 'human'] as const;
export type AssessmentSource = (typeof ASSESSMENT_SOURCES)[number];

export const SCORES = [1, 2, 3, 4] as const;
export type Score = (typeof SCORES)[number];

export const BANDS = ['Foundational', 'Developing', 'Solid', 'Strong'] as const;
export type Band = (typeof BANDS)[number];
