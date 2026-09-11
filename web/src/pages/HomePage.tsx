import type { ProblemSummaryDto } from '@designloop/shared';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { api } from '../api/client';
import { InlineText } from '../components/InlineText';
import { ErrorState, Loading } from '../components/States';
import { bandTone, toneText } from '../lib/format';

const LOOP = [
  { title: 'Design', text: 'Classes, responsibilities, how they collaborate, and the trade-offs you made.' },
  { title: 'Face the curveball', text: 'A change request you haven’t seen. Your design locks; you explain the impact.' },
  { title: 'Get reviewed', text: 'Each rubric criterion is scored with quotes from your own design as evidence.' },
  { title: 'Try again', text: 'Revise with your top three next moves pinned, against the other curveball.' },
];

const DIFFICULTY_ORDER = { easy: 0, medium: 1, hard: 2 } as const;

export function HomePage() {
  const problems = useQuery({ queryKey: ['problems'], queryFn: api.problems });
  const progress = useQuery({ queryKey: ['progress'], queryFn: api.progress });

  if (problems.error) return <ErrorState error={problems.error} />;
  if (!problems.data) return <Loading />;

  const sorted = [...problems.data].sort(
    (a, b) => DIFFICULTY_ORDER[a.difficulty] - DIFFICULTY_ORDER[b.difficulty] || a.title.localeCompare(b.title),
  );
  const focusAreas = progress.data?.focusAreas ?? [];

  return (
    <div className="mx-auto max-w-5xl px-4 pb-20 sm:px-6">
      <section className="py-10">
        <h1 className="max-w-[20ch] text-[2.5rem] sm:text-[3rem]">Practise the part of the interview before the code.</h1>
        <p className="mt-4 max-w-[60ch] text-lg text-ink-soft">
          Design a system, then find out how it holds up when the requirements change. There’s no single right answer
          here: your design is reviewed against a rubric, and every judgement quotes your own words.
        </p>
        <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {LOOP.map((step, index) => (
            <li key={step.title} className="border-t-2 border-ink pt-3">
              <p className="font-semibold">
                <span className="mr-2 text-cobalt">{index + 1}</span>
                {step.title}
              </p>
              <p className="mt-1 text-sm text-ink-soft">{step.text}</p>
            </li>
          ))}
        </ol>
      </section>

      {focusAreas.length > 0 && (
        <section aria-labelledby="focus-title" className="mb-10 rounded-md border border-amber bg-amber-wash p-5">
          <h2 id="focus-title" className="text-xl">
            Your recurring gaps
          </h2>
          <p className="mt-1 text-sm text-ink-soft">Criteria that scored 2 or lower in most of your reviews. Work on these deliberately.</p>
          <ul className="mt-4 space-y-3">
            {focusAreas.map((area) => (
              <li key={area.criterionId}>
                <p className="font-semibold">
                  {area.name}{' '}
                  <span className="font-normal text-ink-soft">
                    (weak in {area.weakCount} of {area.assessedCount} reviews)
                  </span>
                </p>
                <p className="text-sm">
                  Latest advice: <InlineText text={area.latestSuggestion} />
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="problems-title">
        <h2 id="problems-title" className="text-2xl">
          Problems
        </h2>
        <ul className="mt-4 divide-y divide-rule rounded-md border border-rule bg-sheet">
          {sorted.map((problem) => (
            <ProblemRow key={problem.id} problem={problem} />
          ))}
        </ul>
      </section>
    </div>
  );
}

function ProblemRow({ problem }: { problem: ProblemSummaryDto }) {
  const latest = problem.latest;
  return (
    <li className="grid gap-3 px-5 py-4 sm:grid-cols-[1fr_auto] sm:items-center">
      <div>
        <Link to={`/problems/${problem.id}`} className="text-lg font-semibold hover:text-cobalt [font-stretch:108%]">
          {problem.title}
        </Link>
        <p className="mt-0.5 text-ink-soft">{problem.summary}</p>
        <p className="mt-1 text-sm text-ink-faint">
          <span className="capitalize">{problem.difficulty}</span>, about {problem.estimatedMinutes} min. Exercises{' '}
          {problem.focusConcepts.join(', ').toLowerCase()}.
        </p>
      </div>
      <div className="flex items-center gap-4 sm:justify-end">
        {latest ? (
          <span className="text-sm">
            {latest.status !== 'SUBMITTED' ? (
              <span className="text-cobalt">Attempt #{latest.number} in progress</span>
            ) : latest.band ? (
              <>
                Latest: <span className={`font-semibold ${toneText[bandTone(latest.band)]}`}>{latest.band}</span>
              </>
            ) : (
              <span className="text-ink-soft">Attempt #{latest.number} submitted</span>
            )}
          </span>
        ) : (
          <span className="text-sm text-ink-faint">Not started</span>
        )}
        <Link to={`/problems/${problem.id}`} className="btn btn-secondary">
          {latest ? 'Open' : 'Start'}
        </Link>
      </div>
    </li>
  );
}
