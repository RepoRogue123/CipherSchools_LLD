import type { Finding } from '@designloop/shared';

export const SECTIONS = [
  { id: 'assumptions', title: 'Assumptions & scope' },
  { id: 'entities', title: 'Entities' },
  { id: 'relationships', title: 'Relationships' },
  { id: 'mapping', title: 'Requirement mapping' },
  { id: 'flows', title: 'Key flows' },
  { id: 'edgeCases', title: 'Edge cases' },
  { id: 'decisions', title: 'Decisions & trade-offs' },
  { id: 'changeImpact', title: 'Change impact' },
] as const;

export type SectionId = (typeof SECTIONS)[number]['id'];

const BY_PREFIX: [prefix: string, section: SectionId][] = [
  ['entities.orphan', 'relationships'],
  ['entities.', 'entities'],
  ['names.', 'entities'],
  ['relationships.', 'relationships'],
  ['mapping.', 'mapping'],
  ['flows.', 'flows'],
  ['assumptions.', 'assumptions'],
  ['edge-cases.', 'edgeCases'],
  ['decisions.', 'decisions'],
  ['change.', 'changeImpact'],
];

/** Which editor section a structural finding belongs to, so the learner can jump straight to it. */
export function sectionFor(finding: Finding): SectionId {
  return BY_PREFIX.find(([prefix]) => finding.checkId.startsWith(prefix))?.[1] ?? 'entities';
}

export function sectionStatus(findings: Finding[], section: SectionId): 'blocker' | 'warning' | 'ok' {
  const own = findings.filter((f) => f.severity !== 'info' && sectionFor(f) === section);
  if (own.some((f) => f.severity === 'blocker')) return 'blocker';
  return own.length > 0 ? 'warning' : 'ok';
}
