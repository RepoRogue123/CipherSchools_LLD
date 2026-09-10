import type { DesignMetrics, Finding, FindingSeverity, ScoreCap } from '@designloop/shared';
import type { DesignModel } from '../../domain/design-format';
import type { Problem } from '../../domain/problem';

export interface CheckReport {
  findings: Finding[];
  metrics: DesignMetrics;
  caps: ScoreCap[];
}

const MIN_ENTITIES = 3;
const MIN_RESPONSIBILITY_CHARS = 8;
const MIN_CHANGE_APPROACH_CHARS = 40;
const GOD_CLASS_METHODS = 12;
const GOD_CLASS_RELATIONSHIPS = 6;
const MAX_NAMES_LISTED = 6;
/** Two or more capitalised word parts, e.g. PaymentService, ParkingLot (not "The", "UPI"). */
const CLASS_LIKE_NAME = /\b[A-Z][a-z0-9]+(?:[A-Z][a-z0-9]+)+\b/g;

function finding(checkId: string, severity: FindingSeverity, message: string, location?: string): Finding {
  return location ? { checkId, severity, message, location } : { checkId, severity, message };
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function mentionsAny(text: string, names: readonly string[]): boolean {
  return names.some((name) => new RegExp(`\\b${escapeRegExp(name)}\\b`, 'i').test(text));
}

function listed(names: readonly string[]): string {
  const shown = names.slice(0, MAX_NAMES_LISTED).join(', ');
  return names.length > MAX_NAMES_LISTED ? `${shown} and ${names.length - MAX_NAMES_LISTED} more` : shown;
}

/**
 * Deterministic structure checks over a normalised design. They are cheap and
 * exact, run on every autosave, gate the curveball and submission (blockers),
 * advise the learner (warnings, info), give the AI reviewer grounded facts
 * (metrics), and bound its scores where evidence is plainly missing (caps).
 */
export function checkDesign(model: DesignModel, problem: Problem): CheckReport {
  const findings: Finding[] = [];
  const caps: ScoreCap[] = [];
  const named = model.entities.filter((e) => e.name.length > 0);
  const names = named.map((e) => e.name);
  const entityIds = new Set(model.entities.map((e) => e.id));
  const nameById = new Map(model.entities.map((e) => [e.id, e.name]));

  // Blockers: without these the design cannot meaningfully face a curveball.
  if (named.length < MIN_ENTITIES) {
    findings.push(
      finding('entities.min', 'blocker', `Add at least ${MIN_ENTITIES} entities (you have ${named.length}).`),
    );
  }
  const unnamed = model.entities.length - named.length;
  if (unnamed > 0) {
    findings.push(finding('entities.unnamed', 'blocker', `${unnamed} ${unnamed === 1 ? 'entity has' : 'entities have'} no name.`));
  }
  const byLowerName = new Map<string, string[]>();
  for (const name of names) {
    const key = name.toLowerCase();
    byLowerName.set(key, [...(byLowerName.get(key) ?? []), name]);
  }
  const duplicates = [...byLowerName.values()].filter((group) => group.length > 1).map((group) => group[0]!);
  if (duplicates.length > 0) {
    findings.push(
      finding('entities.duplicate-names', 'blocker', `Entity names must be unique: ${listed(duplicates)}.`),
    );
  }
  const dangling = model.relationships.filter((r) => !entityIds.has(r.fromId) || !entityIds.has(r.toId));
  if (dangling.length > 0) {
    findings.push(
      finding('relationships.dangling', 'blocker', `${dangling.length} relationship(s) point to an entity that no longer exists.`, 'relationships'),
    );
  }
  for (const r of model.relationships) {
    if ((r.type === 'inherits' || r.type === 'implements') && r.fromId === r.toId && entityIds.has(r.fromId)) {
      findings.push(
        finding('relationships.self-inheritance', 'blocker', `${nameById.get(r.fromId)} cannot ${r.type === 'inherits' ? 'inherit from' : 'implement'} itself.`, 'relationships'),
      );
    }
  }
  const flows = model.flows.filter((f) => f.steps.length > 0);
  if (flows.length === 0) {
    findings.push(finding('flows.min', 'blocker', 'Describe at least one key flow step by step, naming the objects involved.'));
  }

  // Warnings: gaps a reviewer will notice.
  const missingResponsibility = named.filter((e) => e.responsibility.length < MIN_RESPONSIBILITY_CHARS);
  for (const entity of missingResponsibility) {
    findings.push(
      finding('entities.responsibility', 'warning', `Give ${entity.name} a one-sentence responsibility.`, `entity:${entity.name}`),
    );
  }
  if (named.length > 0 && missingResponsibility.length > named.length / 3) {
    caps.push({
      criterionId: 'responsibilities',
      maxScore: 2,
      checkId: 'entities.responsibility',
      reason: `${missingResponsibility.length} of ${named.length} entities have no responsibility statement.`,
    });
  }

  const requirementIds = problem.requirementIds;
  const mapped = requirementIds.filter((id) => (model.requirementMappings[id] ?? '').length > 0);
  const unmapped = requirementIds.filter((id) => !mapped.includes(id));
  if (unmapped.length > 0) {
    findings.push(
      finding('mapping.coverage', 'warning', `${unmapped.join(', ')} ${unmapped.length === 1 ? 'is' : 'are'} not mapped to any part of your design.`),
    );
  }
  if (requirementIds.length > 0 && mapped.length / requirementIds.length < 0.5) {
    caps.push({
      criterionId: 'requirements',
      maxScore: 2,
      checkId: 'mapping.coverage',
      reason: `Only ${mapped.length} of ${requirementIds.length} requirements are mapped to the design.`,
    });
  }
  for (const id of mapped) {
    if (!mentionsAny(model.requirementMappings[id]!, names)) {
      findings.push(
        finding('mapping.no-entity', 'warning', `The mapping for ${id} doesn't name any of your entities.`, `mapping:${id}`),
      );
    }
  }

  const known = new Set(
    [...names, ...(model.changeImpact?.newEntities.map((e) => e.name) ?? [])].map((n) => n.toLowerCase()),
  );
  const scanned = [
    ...model.flows.map((f) => f.steps),
    ...Object.values(model.requirementMappings),
    model.edgeCases,
    ...model.decisions.flatMap((d) => [d.decision, d.alternative, d.rationale]),
    ...model.entities.flatMap((e) => [...e.attributes, ...e.methods]),
    model.changeImpact?.approach ?? '',
  ].join('\n');
  const undeclared = [...new Set(scanned.match(CLASS_LIKE_NAME) ?? [])].filter(
    (name) => !known.has(name.toLowerCase()),
  );
  if (undeclared.length > 0) {
    findings.push(
      finding('names.undeclared', 'warning', `These look like classes but aren't in your entities: ${listed(undeclared)}. Add them or rename.`),
    );
  }

  if (model.assumptions.length === 0) {
    findings.push(finding('assumptions.empty', 'warning', 'State your assumptions and what you consider out of scope.', 'assumptions'));
  }
  if (model.edgeCases.length === 0) {
    findings.push(finding('edge-cases.empty', 'warning', 'List the edge cases your design handles and where.', 'edgeCases'));
    caps.push({ criterionId: 'robustness', maxScore: 2, checkId: 'edge-cases.empty', reason: 'The edge-case section is empty.' });
  }
  const tradeoffs = model.decisions.filter((d) => d.decision && d.alternative && d.rationale);
  if (tradeoffs.length === 0) {
    findings.push(
      finding('decisions.tradeoff', 'warning', 'Record at least one decision with the alternative you considered and why you chose against it.'),
    );
    caps.push({
      criterionId: 'tradeoffs',
      maxScore: 2,
      checkId: 'decisions.tradeoff',
      reason: 'No decision lists both an alternative and a rationale.',
    });
  }

  // Info: signals worth a look, not necessarily wrong.
  const linked = new Set(model.relationships.flatMap((r) => [r.fromId, r.toId]));
  if (named.length >= 2 && model.relationships.length === 0) {
    findings.push(finding('relationships.none', 'warning', 'Add relationships so the reviewer can see how your entities collaborate.', 'relationships'));
  } else {
    const orphans = named.filter((e) => !linked.has(e.id)).map((e) => e.name);
    if (orphans.length > 0) {
      findings.push(finding('entities.orphan', 'info', `Not connected to anything yet: ${listed(orphans)}.`, 'relationships'));
    }
  }
  for (const entity of named) {
    const degree = model.relationships.filter((r) => r.fromId === entity.id || r.toId === entity.id).length;
    if (entity.methods.length >= GOD_CLASS_METHODS || degree >= GOD_CLASS_RELATIONSHIPS) {
      findings.push(
        finding('entities.god-class', 'info', `${entity.name} has ${entity.methods.length} methods and ${degree} relationships. Check it isn't doing too much.`, `entity:${entity.name}`),
      );
    }
  }

  // Change impact: only exists after the curveball is revealed.
  const impact = model.changeImpact;
  if (impact) {
    if (impact.approach.length < MIN_CHANGE_APPROACH_CHARS) {
      findings.push(
        finding('change.approach', 'blocker', 'Explain in a few sentences how your design absorbs the change.', 'changeImpact'),
      );
    }
    const unknown = impact.modifiedEntityIds.filter((id) => !entityIds.has(id));
    if (unknown.length > 0) {
      findings.push(
        finding('change.unknown-entities', 'blocker', 'The change impact modifies entities that are not in your design.', 'changeImpact'),
      );
    }
    const added = impact.newEntities.filter((e) => e.name.length > 0);
    if (impact.modifiedEntityIds.length === 0 && added.length === 0 && !mentionsAny(impact.approach, names)) {
      findings.push(
        finding('change.no-entities', 'warning', 'Name the classes you would modify or add. The impact is hard to judge otherwise.', 'changeImpact'),
      );
      caps.push({
        criterionId: 'extensibility',
        maxScore: 2,
        checkId: 'change.no-entities',
        reason: "The change impact doesn't name any class it modifies or adds.",
      });
    }
  }

  return {
    findings,
    caps,
    metrics: {
      entityCount: named.length,
      abstractionCount: named.filter((e) => e.kind === 'interface' || e.kind === 'abstract').length,
      relationshipCount: model.relationships.length,
      requirementCoverage: { mapped: mapped.length, total: requirementIds.length },
      flowCount: flows.length,
      decisionCount: model.decisions.filter((d) => d.decision.length > 0).length,
      changeImpact: impact
        ? { modified: impact.modifiedEntityIds.length, added: impact.newEntities.filter((e) => e.name).length }
        : null,
    },
  };
}

export function blockersOf(report: CheckReport): Finding[] {
  return report.findings.filter((f) => f.severity === 'blocker');
}
