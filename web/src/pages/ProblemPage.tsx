import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router';
import { api } from '../api/client';
import { HeatTable } from '../components/HeatTable';
import { ErrorState, Loading } from '../components/States';
import { TitleBlock } from '../components/TitleBlock';
import { bandTone, formatDateTime, formatDuration, toneText } from '../lib/format';

export function ProblemPage() {
  const { problemId = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const brief = useQuery({ queryKey: ['problem', problemId], queryFn: () => api.problem(problemId) });
  const history = useQuery({ queryKey: ['history', problemId], queryFn: () => api.history(problemId) });
  const rubric = useQuery({ queryKey: ['rubric'], queryFn: api.rubric, staleTime: Infinity });
  const start = useMutation({
    mutationFn: () => api.startAttempt(problemId, null),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ['history', problemId] });
      navigate(`/attempts/${result.attempt.id}`);
    },
  });

  if (brief.error) return <ErrorState error={brief.error} />;
  if (!brief.data || !history.data) return <Loading />;

  const open = history.data.find((h) => h.status !== 'SUBMITTED');
  const nextNumber = history.data.length + 1;

  return (
    <div className="mx-auto max-w-5xl px-4 pb-20 sm:px-6">
      <div className="py-5">
        <TitleBlock
          cells={[
            { label: 'Problem', value: brief.data.title, grow: true },
            { label: 'Difficulty', value: <span className="capitalize">{brief.data.difficulty}</span> },
            { label: 'Time', value: `About ${brief.data.estimatedMinutes} min` },
            { label: 'Your attempts', value: history.data.length },
          ]}
        />
      </div>

      <div className="grid gap-10 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <section>
          <h1 className="text-[2rem]">{brief.data.summary}</h1>
          <p className="mt-4 max-w-[65ch] text-lg text-ink-soft">{brief.data.context}</p>
          <p className="mt-4 text-sm text-ink-soft">Concepts this problem exercises: {brief.data.focusConcepts.join(', ')}.</p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            {open ? (
              <Link to={`/attempts/${open.attemptId}`} className="btn btn-primary">
                Continue attempt #{open.number}
              </Link>
            ) : (
              <button type="button" className="btn btn-primary" onClick={() => start.mutate()} disabled={start.isPending}>
                {nextNumber === 1 ? 'Start your first attempt' : `Start attempt #${nextNumber}`}
              </button>
            )}
            <Link to="/rubric" className="link text-sm">
              How designs are assessed
            </Link>
          </div>
          {start.error && <p className="mt-2 text-sm text-pencil">{start.error.message}</p>}
        </section>

        <section aria-labelledby="history-title">
          <h2 id="history-title" className="text-xl">
            Your attempts
          </h2>
          {history.data.length === 0 ? (
            <p className="mt-2 text-ink-soft">No attempts yet. Your history and progress will show here.</p>
          ) : (
            <ul className="mt-3 divide-y divide-rule rounded-md border border-rule bg-sheet">
              {[...history.data].reverse().map((item) => (
                <li key={item.attemptId} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                  <div>
                    <p className="font-semibold">Attempt #{item.number}</p>
                    <p className="text-sm text-ink-soft">
                      {item.curveballTitle ? `Curveball: ${item.curveballTitle}` : 'Designing'}
                      {item.durationMinutes !== null && `, ${formatDuration(item.durationMinutes)}`}
                    </p>
                    <p className="text-xs text-ink-faint">Started {formatDateTime(item.startedAt)}</p>
                  </div>
                  {item.evaluationId ? (
                    <Link to={`/evaluations/${item.evaluationId}`} className="text-right">
                      <span className={`block font-semibold ${toneText[bandTone(item.overall?.band ?? null)]}`}>
                        {item.overall?.band ?? evaluationLabel(item.evaluationStatus)}
                      </span>
                      <span className="link text-sm">Open review</span>
                    </Link>
                  ) : (
                    <Link to={`/attempts/${item.attemptId}`} className="link text-sm">
                      Continue
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {rubric.data && history.data.some((h) => h.overall) && (
        <section aria-labelledby="progress-title" className="mt-12">
          <h2 id="progress-title" className="text-xl">
            Progress by criterion
          </h2>
          <p className="mb-3 mt-1 text-sm text-ink-soft">Scores from each reviewed attempt, 1 (missing) to 4 (strong).</p>
          <div className="rounded-md border border-rule bg-sheet p-4">
            <HeatTable history={history.data} rubric={rubric.data} />
          </div>
        </section>
      )}
    </div>
  );
}

function evaluationLabel(status: string | null): string {
  if (status === 'FAILED') return 'Review incomplete';
  if (status === 'COMPLETED') return 'Checks only';
  return 'In review';
}
