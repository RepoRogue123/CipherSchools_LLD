import {
  ENTITY_KINDS,
  RELATIONSHIP_TYPES,
  type DesignDocument,
  type EntityKind,
  type EntitySpec,
  type ProblemBriefDto,
  type RelationshipType,
} from '@designloop/shared';
import { newId } from '../../lib/format';
import { RemoveButton } from './Section';

type Update = (update: (design: DesignDocument) => DesignDocument) => void;

interface SectionProps {
  design: DesignDocument;
  update: Update;
  locked: boolean;
}

const KIND_LABEL: Record<EntityKind, string> = {
  class: 'Class',
  interface: 'Interface',
  abstract: 'Abstract class',
  enum: 'Enum',
};

const RELATIONSHIP_LABEL: Record<RelationshipType, string> = {
  inherits: 'inherits from',
  implements: 'implements',
  composes: 'composes (owns the lifecycle of)',
  aggregates: 'aggregates (holds, shared)',
  associates: 'is associated with',
  depends: 'depends on (uses)',
};

export function AssumptionsEditor({ design, update, locked }: SectionProps) {
  return (
    <textarea
      aria-label="Assumptions and scope"
      className="field min-h-28"
      value={design.assumptions}
      readOnly={locked}
      placeholder="What did you assume? What is deliberately out of scope, and why?"
      onChange={(e) => update((d) => ({ ...d, assumptions: e.target.value }))}
    />
  );
}

export function EntitiesEditor({ design, update, locked }: SectionProps) {
  const patch = (id: string, change: Partial<EntitySpec>) =>
    update((d) => ({ ...d, entities: d.entities.map((e) => (e.id === id ? { ...e, ...change } : e)) }));

  const remove = (id: string) =>
    update((d) => ({
      ...d,
      entities: d.entities.filter((e) => e.id !== id),
      // Keep the document consistent: drop relationships that pointed at the removed entity.
      relationships: d.relationships.filter((r) => r.fromId !== id && r.toId !== id),
    }));

  return (
    <div className="space-y-4">
      {design.entities.map((entity, index) => (
        <fieldset key={entity.id} className="rounded-md border border-rule bg-sheet p-3" disabled={locked}>
          <legend className="sr-only">Entity {index + 1}</legend>
          <div className="flex gap-2">
            <input
              aria-label={`Entity ${index + 1} name`}
              className="field field-code flex-1"
              value={entity.name}
              placeholder="ParkingLot"
              onChange={(e) => patch(entity.id, { name: e.target.value })}
            />
            <select
              aria-label={`Entity ${index + 1} kind`}
              className="field w-40"
              value={entity.kind}
              onChange={(e) => patch(entity.id, { kind: e.target.value as EntityKind })}
            >
              {ENTITY_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {KIND_LABEL[kind]}
                </option>
              ))}
            </select>
            {!locked && <RemoveButton label={`Remove ${entity.name || `entity ${index + 1}`}`} onClick={() => remove(entity.id)} />}
          </div>
          <textarea
            aria-label={`Entity ${index + 1} responsibility`}
            className="field mt-2 min-h-14"
            rows={2}
            value={entity.responsibility}
            placeholder="In one sentence: what does it own and decide?"
            onChange={(e) => patch(entity.id, { responsibility: e.target.value })}
          />
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <textarea
              aria-label={`Entity ${index + 1} attributes`}
              className="field field-code"
              value={entity.attributes}
              placeholder={'Attributes, one per line\nfloors: List<ParkingFloor>'}
              onChange={(e) => patch(entity.id, { attributes: e.target.value })}
            />
            <textarea
              aria-label={`Entity ${index + 1} methods`}
              className="field field-code"
              value={entity.methods}
              placeholder={'Methods, one per line\npark(vehicle): Ticket'}
              onChange={(e) => patch(entity.id, { methods: e.target.value })}
            />
          </div>
        </fieldset>
      ))}
      {!locked && (
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() =>
            update((d) => ({
              ...d,
              entities: [...d.entities, { id: newId('e'), name: '', kind: 'class', responsibility: '', attributes: '', methods: '' }],
            }))
          }
        >
          Add entity
        </button>
      )}
    </div>
  );
}

export function RelationshipsEditor({ design, update, locked }: SectionProps) {
  const named = design.entities.filter((e) => e.name.trim());
  if (named.length < 2) {
    return <p className="text-sm text-ink-soft">Name at least two entities to connect them.</p>;
  }
  return (
    <div className="space-y-2">
      {design.relationships.map((relationship, index) => (
        <fieldset key={relationship.id} className="flex flex-wrap items-center gap-2" disabled={locked}>
          <legend className="sr-only">Relationship {index + 1}</legend>
          <EntitySelect
            label={`Relationship ${index + 1} from`}
            entities={named}
            value={relationship.fromId}
            onChange={(fromId) =>
              update((d) => ({ ...d, relationships: d.relationships.map((r) => (r.id === relationship.id ? { ...r, fromId } : r)) }))
            }
          />
          <select
            aria-label={`Relationship ${index + 1} type`}
            className="field w-auto"
            value={relationship.type}
            onChange={(e) =>
              update((d) => ({
                ...d,
                relationships: d.relationships.map((r) =>
                  r.id === relationship.id ? { ...r, type: e.target.value as RelationshipType } : r,
                ),
              }))
            }
          >
            {RELATIONSHIP_TYPES.map((type) => (
              <option key={type} value={type}>
                {RELATIONSHIP_LABEL[type]}
              </option>
            ))}
          </select>
          <EntitySelect
            label={`Relationship ${index + 1} to`}
            entities={named}
            value={relationship.toId}
            onChange={(toId) =>
              update((d) => ({ ...d, relationships: d.relationships.map((r) => (r.id === relationship.id ? { ...r, toId } : r)) }))
            }
          />
          <input
            aria-label={`Relationship ${index + 1} note`}
            className="field min-w-40 flex-1"
            value={relationship.note}
            placeholder="Why? (optional)"
            onChange={(e) =>
              update((d) => ({
                ...d,
                relationships: d.relationships.map((r) => (r.id === relationship.id ? { ...r, note: e.target.value } : r)),
              }))
            }
          />
          {!locked && (
            <RemoveButton
              label={`Remove relationship ${index + 1}`}
              onClick={() => update((d) => ({ ...d, relationships: d.relationships.filter((r) => r.id !== relationship.id) }))}
            />
          )}
        </fieldset>
      ))}
      {!locked && (
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() =>
            update((d) => ({
              ...d,
              relationships: [
                ...d.relationships,
                { id: newId('r'), fromId: named[0]!.id, type: 'associates', toId: named[1]!.id, note: '' },
              ],
            }))
          }
        >
          Add relationship
        </button>
      )}
    </div>
  );
}

function EntitySelect({
  label,
  entities,
  value,
  onChange,
}: {
  label: string;
  entities: EntitySpec[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <select aria-label={label} className="field field-code w-auto" value={value} onChange={(e) => onChange(e.target.value)}>
      {!entities.some((e) => e.id === value) && <option value={value}>(removed entity)</option>}
      {entities.map((entity) => (
        <option key={entity.id} value={entity.id}>
          {entity.name}
        </option>
      ))}
    </select>
  );
}

export function MappingEditor({ design, update, locked, brief }: SectionProps & { brief: ProblemBriefDto }) {
  return (
    <div className="space-y-3">
      {brief.requirements.map((requirement) => (
        <div key={requirement.id}>
          <label htmlFor={`mapping-${requirement.id}`} className="mb-1 block text-sm">
            <span className="font-semibold">{requirement.id}</span> <span className="text-ink-soft">{requirement.text}</span>
          </label>
          <textarea
            id={`mapping-${requirement.id}`}
            className="field min-h-12"
            rows={2}
            readOnly={locked}
            value={design.requirementMappings[requirement.id] ?? ''}
            placeholder="Which classes and methods satisfy this?"
            onChange={(e) =>
              update((d) => ({ ...d, requirementMappings: { ...d.requirementMappings, [requirement.id]: e.target.value } }))
            }
          />
        </div>
      ))}
    </div>
  );
}

export function FlowsEditor({ design, update, locked }: SectionProps) {
  return (
    <div className="space-y-4">
      {design.flows.map((flow, index) => (
        <fieldset key={flow.id} disabled={locked}>
          <legend className="sr-only">Flow {index + 1}</legend>
          <div className="flex gap-2">
            <input
              aria-label={`Flow ${index + 1} name`}
              className="field flex-1 font-medium"
              value={flow.name}
              placeholder="Name of the flow, e.g. Vehicle exits and pays"
              onChange={(e) => update((d) => ({ ...d, flows: d.flows.map((f) => (f.id === flow.id ? { ...f, name: e.target.value } : f)) }))}
            />
            {!locked && (
              <RemoveButton
                label={`Remove flow ${flow.name || index + 1}`}
                onClick={() => update((d) => ({ ...d, flows: d.flows.filter((f) => f.id !== flow.id) }))}
              />
            )}
          </div>
          <textarea
            aria-label={`Flow ${index + 1} steps`}
            className="field mt-2 min-h-28"
            value={flow.steps}
            placeholder={'Step by step, naming the objects involved:\n1. Gate calls ParkingLot.park(vehicle)\n2. ParkingLot asks each ParkingFloor for a compatible spot\n3. …'}
            onChange={(e) => update((d) => ({ ...d, flows: d.flows.map((f) => (f.id === flow.id ? { ...f, steps: e.target.value } : f)) }))}
          />
        </fieldset>
      ))}
      {!locked && (
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => update((d) => ({ ...d, flows: [...d.flows, { id: newId('f'), name: '', steps: '' }] }))}
        >
          Add flow
        </button>
      )}
    </div>
  );
}

export function EdgeCasesEditor({ design, update, locked }: SectionProps) {
  return (
    <textarea
      aria-label="Edge cases and failure handling"
      className="field min-h-28"
      value={design.edgeCases}
      readOnly={locked}
      placeholder="Which failure paths and edge cases does your design handle, and which class handles each?"
      onChange={(e) => update((d) => ({ ...d, edgeCases: e.target.value }))}
    />
  );
}

export function DecisionsEditor({ design, update, locked }: SectionProps) {
  const patch = (id: string, field: 'decision' | 'alternative' | 'rationale', value: string) =>
    update((d) => ({ ...d, decisions: d.decisions.map((x) => (x.id === id ? { ...x, [field]: value } : x)) }));
  return (
    <div className="space-y-4">
      {design.decisions.map((decision, index) => (
        <fieldset key={decision.id} className="grid gap-2 rounded-md border border-rule bg-sheet p-3" disabled={locked}>
          <legend className="sr-only">Decision {index + 1}</legend>
          <div className="flex gap-2">
            <input
              aria-label={`Decision ${index + 1}`}
              className="field flex-1"
              value={decision.decision}
              placeholder="The decision, e.g. Pricing sits behind a PricingStrategy interface"
              onChange={(e) => patch(decision.id, 'decision', e.target.value)}
            />
            {!locked && (
              <RemoveButton
                label={`Remove decision ${index + 1}`}
                onClick={() => update((d) => ({ ...d, decisions: d.decisions.filter((x) => x.id !== decision.id) }))}
              />
            )}
          </div>
          <input
            aria-label={`Decision ${index + 1} alternative`}
            className="field"
            value={decision.alternative}
            placeholder="The alternative you considered"
            onChange={(e) => patch(decision.id, 'alternative', e.target.value)}
          />
          <textarea
            aria-label={`Decision ${index + 1} rationale`}
            className="field min-h-14"
            rows={2}
            value={decision.rationale}
            placeholder="Why this choice over the alternative, and what it costs"
            onChange={(e) => patch(decision.id, 'rationale', e.target.value)}
          />
        </fieldset>
      ))}
      {!locked && (
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() =>
            update((d) => ({ ...d, decisions: [...d.decisions, { id: newId('d'), decision: '', alternative: '', rationale: '' }] }))
          }
        >
          Add decision
        </button>
      )}
    </div>
  );
}
