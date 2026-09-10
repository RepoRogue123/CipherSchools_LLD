import type { AttemptHistoryItemDto, RubricDto } from '@designloop/shared';
import { Link } from 'react-router';
import { formatMean, scoreTone, toneWash } from '../lib/format';

/** Criterion × attempt grid: improvement (or a recurring gap) is visible at a glance. */
export function HeatTable({ history, rubric }: { history: AttemptHistoryItemDto[]; rubric: RubricDto }) {
  const evaluated = history.filter((h) => h.overall !== null);
  if (evaluated.length === 0) return null;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[32rem] border-collapse text-sm">
        <caption className="sr-only">Scores by criterion for each evaluated attempt</caption>
        <thead>
          <tr>
            <th scope="col" className="py-2 pr-4 text-left font-medium text-ink-soft">
              Criterion
            </th>
            {evaluated.map((item) => (
              <th key={item.attemptId} scope="col" className="px-1 py-2 text-center font-medium">
                {item.evaluationId ? (
                  <Link className="link" to={`/evaluations/${item.evaluationId}`}>
                    #{item.number}
                  </Link>
                ) : (
                  `#${item.number}`
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rubric.criteria.map((criterion) => (
            <tr key={criterion.id} className="border-t border-rule">
              <th scope="row" className="py-1.5 pr-4 text-left font-normal">
                {criterion.name}
              </th>
              {evaluated.map((item) => {
                const score = item.scores[criterion.id] ?? null;
                return (
                  <td key={item.attemptId} className="px-1 py-1">
                    <span
                      className={`mx-auto flex h-7 w-10 items-center justify-center rounded font-semibold ${toneWash[scoreTone(score)]}`}
                    >
                      {score ?? '–'}
                    </span>
                  </td>
                );
              })}
            </tr>
          ))}
          <tr className="border-t-2 border-rule-strong">
            <th scope="row" className="py-2 pr-4 text-left font-semibold">
              Average
            </th>
            {evaluated.map((item) => (
              <td key={item.attemptId} className="py-2 text-center font-semibold">
                {formatMean(item.overall?.mean ?? null)}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
