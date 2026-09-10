import type { ReactNode } from 'react';

const STATUS_STYLE = {
  blocker: { dot: 'bg-pencil', text: 'Needs attention' },
  warning: { dot: 'bg-amber', text: 'Has suggestions' },
  ok: { dot: 'bg-moss', text: 'Looks complete' },
} as const;

/** One numbered part of the design document. The numbering is real: sections are read in this order. */
export function Section({
  id,
  number,
  title,
  hint,
  status,
  locked,
  children,
}: {
  id: string;
  number: number;
  title: string;
  hint: string;
  status: keyof typeof STATUS_STYLE;
  locked?: boolean;
  children: ReactNode;
}) {
  const style = STATUS_STYLE[status];
  return (
    <section id={`section-${id}`} className="scroll-mt-28 border-b border-rule py-7 last:border-b-0" aria-labelledby={`title-${id}`}>
      <header className="mb-3 flex items-start gap-3">
        <span className="mt-0.5 w-6 shrink-0 text-lg font-semibold text-ink-faint [font-stretch:112%]">{number}</span>
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h2 id={`title-${id}`} className="text-xl">
              {title}
            </h2>
            <span className="inline-flex items-center gap-1.5 text-xs text-ink-soft">
              <span className={`h-2 w-2 rounded-full ${style.dot}`} aria-hidden="true" />
              {style.text}
            </span>
            {locked && <span className="rounded border border-rule-strong px-1.5 text-xs text-ink-soft">Locked</span>}
          </div>
          <p className="mt-1 max-w-[65ch] text-sm text-ink-soft">{hint}</p>
        </div>
      </header>
      <div className="pl-9">{children}</div>
    </section>
  );
}

export function RemoveButton({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      className="btn btn-quiet h-9 w-9 shrink-0 p-0 text-lg text-ink-faint hover:text-pencil"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
    >
      ×
    </button>
  );
}
