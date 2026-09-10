import type { ChangeImpact, DesignDocument } from '@designloop/shared';
import { newId } from '../../lib/format';
import { RemoveButton } from './Section';

/** The learner's answer to the curveball: how the locked design absorbs the change. */
export function ChangeImpactEditor({
  design,
  impact,
  update,
  readOnly,
}: {
  design: DesignDocument;
  impact: ChangeImpact;
  update: (update: (impact: ChangeImpact) => ChangeImpact) => void;
  readOnly: boolean;
}) {
  const named = design.entities.filter((e) => e.name.trim());
  const toggle = (id: string) =>
    update((i) => ({
      ...i,
      modifiedEntityIds: i.modifiedEntityIds.includes(id)
        ? i.modifiedEntityIds.filter((x) => x !== id)
        : [...i.modifiedEntityIds, id],
    }));

  return (
    <div className="space-y-5">
      <div>
        <label htmlFor="impact-approach" className="mb-1 block font-medium">
          How does your design absorb this change?
        </label>
        <textarea
          id="impact-approach"
          className="field min-h-32"
          value={impact.approach}
          readOnly={readOnly}
          placeholder="Walk through the change: which abstractions it plugs into, what you add, and what you have to edit."
          onChange={(e) => update((i) => ({ ...i, approach: e.target.value }))}
        />
      </div>

      <fieldset disabled={readOnly}>
        <legend className="mb-1 font-medium">Existing entities you would modify</legend>
        <p className="mb-2 text-sm text-ink-soft">Fewer edits to existing classes usually means the design was open for this change.</p>
        <div className="flex flex-wrap gap-2">
          {named.map((entity) => {
            const checked = impact.modifiedEntityIds.includes(entity.id);
            return (
              <label
                key={entity.id}
                className={`code cursor-pointer rounded-md border px-2.5 py-1.5 ${checked ? 'border-cobalt bg-cobalt-wash text-cobalt-deep' : 'border-rule bg-sheet'}`}
              >
                <input type="checkbox" className="sr-only" checked={checked} onChange={() => toggle(entity.id)} />
                {entity.name}
              </label>
            );
          })}
        </div>
      </fieldset>

      <fieldset disabled={readOnly} className="space-y-2">
        <legend className="mb-1 font-medium">New entities you would add</legend>
        {impact.newEntities.map((entity, index) => (
          <div key={entity.id} className="flex flex-wrap gap-2">
            <input
              aria-label={`New entity ${index + 1} name`}
              className="field field-code w-48"
              value={entity.name}
              placeholder="ChargingSpot"
              onChange={(e) =>
                update((i) => ({ ...i, newEntities: i.newEntities.map((n) => (n.id === entity.id ? { ...n, name: e.target.value } : n)) }))
              }
            />
            <input
              aria-label={`New entity ${index + 1} responsibility`}
              className="field min-w-48 flex-1"
              value={entity.responsibility}
              placeholder="What it owns"
              onChange={(e) =>
                update((i) => ({
                  ...i,
                  newEntities: i.newEntities.map((n) => (n.id === entity.id ? { ...n, responsibility: e.target.value } : n)),
                }))
              }
            />
            {!readOnly && (
              <RemoveButton
                label={`Remove new entity ${index + 1}`}
                onClick={() => update((i) => ({ ...i, newEntities: i.newEntities.filter((n) => n.id !== entity.id) }))}
              />
            )}
          </div>
        ))}
        {!readOnly && (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => update((i) => ({ ...i, newEntities: [...i.newEntities, { id: newId('n'), name: '', responsibility: '' }] }))}
          >
            Add new entity
          </button>
        )}
      </fieldset>

      <div>
        <label htmlFor="impact-risks" className="mb-1 block font-medium">
          Risks or limitations
        </label>
        <textarea
          id="impact-risks"
          className="field min-h-16"
          value={impact.risks}
          readOnly={readOnly}
          placeholder="What could break, or what would you revisit with more time?"
          onChange={(e) => update((i) => ({ ...i, risks: e.target.value }))}
        />
      </div>
    </div>
  );
}
