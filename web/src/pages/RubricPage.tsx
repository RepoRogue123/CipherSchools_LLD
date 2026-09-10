import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { ErrorState, Loading } from '../components/States';
import { toneText, scoreTone } from '../lib/format';

/** The rubric is public before you start: no hidden grading. */
export function RubricPage() {
  const rubric = useQuery({ queryKey: ['rubric'], queryFn: api.rubric, staleTime: Infinity });
  if (rubric.error) return <ErrorState error={rubric.error} />;
  if (!rubric.data) return <Loading />;

  return (
    <div className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
      <section className="py-10">
        <h1 className="text-[2.5rem]">How your design is assessed</h1>
        <p className="mt-4 max-w-[68ch] text-lg text-ink-soft">
          Many designs can be right. So there’s no answer key: every submission is scored on the same{' '}
          {rubric.data.criteria.length} criteria, each on four described levels. Automated checks cover structure and
          completeness, and can cap a score when evidence is plainly missing. The AI reviewer judges the rest and must
          quote your design for every judgement.
        </p>
        <p className="mt-2 text-sm text-ink-faint">Rubric {rubric.data.version}</p>
      </section>

      <div className="overflow-x-auto rounded-md border border-rule bg-sheet">
        <table className="w-full min-w-[56rem] border-collapse text-sm">
          <caption className="sr-only">Rubric criteria and level descriptors</caption>
          <thead>
            <tr className="border-b border-rule-strong">
              <th scope="col" className="w-64 px-4 py-3 text-left font-semibold">
                Criterion
              </th>
              {rubric.data.scale.map((level) => (
                <th key={level.score} scope="col" className={`px-4 py-3 text-left font-semibold ${toneText[scoreTone(level.score)]}`}>
                  {level.score} {level.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rubric.data.criteria.map((criterion) => (
              <tr key={criterion.id} className="border-b border-rule align-top last:border-b-0">
                <th scope="row" className="px-4 py-3 text-left">
                  <span className="block font-semibold">{criterion.name}</span>
                  <span className="mt-1 block font-normal text-ink-soft">{criterion.question}</span>
                </th>
                {rubric.data.scale.map((level) => (
                  <td key={level.score} className="px-4 py-3 text-ink-soft">
                    {criterion.levels[`${level.score}` as '1' | '2' | '3' | '4']}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
