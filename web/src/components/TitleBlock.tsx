import type { ReactNode } from 'react';

export interface TitleBlockCell {
  label: string;
  value: ReactNode;
  grow?: boolean;
}

/**
 * Page header modelled on an engineering drawing's title block: a ruled grid
 * whose cells carry the facts of the sheet (problem, attempt, status).
 */
export function TitleBlock({ cells }: { cells: TitleBlockCell[] }) {
  return (
    <dl className="grid grid-cols-2 border border-rule-strong bg-sheet sm:flex">
      {cells.map((cell) => (
        <div
          key={cell.label}
          className={`border-rule-strong px-4 py-2.5 not-last:border-b sm:not-last:border-r sm:not-last:border-b-0 ${cell.grow ? 'col-span-2 sm:flex-1' : 'sm:min-w-32'}`}
        >
          <dt className="label">{cell.label}</dt>
          <dd className="mt-0.5 font-medium">{cell.value}</dd>
        </div>
      ))}
    </dl>
  );
}
