import type { Finding, FindingSeverity } from '@designloop/shared';
import { sectionFor, SECTIONS, type SectionId } from '../lib/sections';

const GROUPS: { severity: FindingSeverity; title: string; marker: string }[] = [
  { severity: 'blocker', title: 'Must fix before the next step', marker: 'bg-pencil' },
  { severity: 'warning', title: 'Worth fixing', marker: 'bg-amber' },
  { severity: 'info', title: 'Worth a look', marker: 'bg-ink-faint' },
];

/** Deterministic structure checks, grouped by how much they matter. */
export function ChecksPanel({
  findings,
  onGoTo,
}: {
  findings: Finding[];
  onGoTo?: (section: SectionId) => void;
}) {
  if (findings.length === 0) {
    return <p className="text-sm text-moss">No structural issues. The design is ready for review.</p>;
  }
  return (
    <div className="space-y-5">
      {GROUPS.map(({ severity, title, marker }) => {
        const items = findings.filter((f) => f.severity === severity);
        if (items.length === 0) return null;
        return (
          <section key={severity} aria-label={title}>
            <h3 className="mb-2 text-sm font-semibold [font-stretch:100%]">
              {title} <span className="font-normal text-ink-faint">({items.length})</span>
            </h3>
            <ul className="space-y-2">
              {items.map((finding, index) => {
                const section = sectionFor(finding);
                return (
                  <li key={`${finding.checkId}-${finding.location ?? index}`} className="flex gap-2.5 text-sm">
                    <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${marker}`} aria-hidden="true" />
                    <span className="flex-1">
                      {finding.message}
                      {onGoTo && (
                        <button type="button" className="link ml-2 text-xs" onClick={() => onGoTo(section)}>
                          {SECTIONS.find((s) => s.id === section)?.title}
                        </button>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
