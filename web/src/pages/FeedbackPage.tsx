import type { ComparisonDto, EvaluationDto, FeedbackReport } from '@designloop/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router';
import { api } from '../api/client';
import { ChecksPanel } from '../components/ChecksPanel';
import { CriterionCard } from '../components/CriterionCard';
import { ErrorState, Loading } from '../components/States';
import { StatusStepper } from '../components/StatusStepper';
import { TitleBlock } from '../components/TitleBlock';
import { bandTone, formatDateTime, formatMean, toneText } from '../lib/format';

const IN_FLIGHT = new Set(['QUEUED', 'EVALUATING']);

export function FeedbackPage() {
  const { evaluationId = '' } = useParams();
  const evaluationQuery = useQuery({
    queryKey: ['evaluation', evaluationId],
    queryFn: () => api.evaluation(evaluationId),
    refetchInterval: (query) => (query.state.data && IN_FLIGHT.has(query.state.data.status) ? 1500 : false),
  });
  const evaluation = evaluationQuery.data;
  const comparisonQuery = useQuery({
    queryKey: ['comparison', evaluation?.attemptId],
    queryFn: () => api.comparison(evaluation!.attemptId),
    enabled: Boolean(evaluation?.report),
  });

  if (evaluationQuery.error) return <ErrorState error={evaluationQuery.error} />;
  if (!evaluation) return <Loading what="Loading your review" />;

  return (
    <div className="mx-auto max-w-5xl px-4 pb-20 sm:px-6">
      <div className="space-y-4 py-5">
        <TitleBlock
          cells={[
            {
              label: 'Problem',
              value: <Link className="link" to={`/problems/${evaluation.problemId}`}>{evaluation.problemTitle}</Link>,
              grow: true,
            },
            { label: 'Attempt', value: `#${evaluation.attemptNumber}` },
            { label: 'Curveball', value: evaluation.curveball.title },
            { label: 'Submitted', value: formatDateTime(evaluation.queuedAt) },
          ]}
        />
        <StatusStepper status={evaluation.status} />
      </div>

      {IN_FLIGHT.has(evaluation.status) && <Waiting evaluation={evaluation} />}
      {evaluation.status === 'FAILED' && <FailedNotice evaluation={evaluation} />}
      {evaluation.report && (
        <Report
          evaluation={evaluation}
          report={evaluation.report}
          comparison={comparisonQuery.data?.comparison ?? null}
        />
      )}
    </div>
  );
}

function Waiting({ evaluation }: { evaluation: EvaluationDto }) {
  return (
    <section className="rounded-md border border-rule bg-sheet p-6" aria-live="polite">
      <h1 className="text-2xl">{evaluation.status === 'QUEUED' ? 'Your design is saved and queued for review.' : 'Reviewing your design.'}</h1>
      <p className="mt-2 max-w-[65ch] text-ink-soft">
        Automated checks run first, then the AI reviewer scores each rubric criterion against your own words. This
        usually takes under a minute. You can leave this page; the review keeps going and will be here when you come back.
      </p>
      {evaluation.runCount > 1 && (
        <p className="mt-2 text-sm text-amber">The reviewer was busy on the first try, so this is attempt {evaluation.runCount} at the review.</p>
      )}
    </section>
  );
}

function FailedNotice({ evaluation }: { evaluation: EvaluationDto }) {
  const queryClient = useQueryClient();
  const retry = useMutation({
    mutationFn: () => api.retryEvaluation(evaluation.id),
    onSuccess: (updated) => queryClient.setQueryData(['evaluation', evaluation.id], updated),
  });
  return (
    <section className="mb-6 rounded-md border border-pencil bg-pencil-wash p-5" role="alert">
      <h1 className="text-xl text-pencil">The AI review couldn’t finish.</h1>
      <p className="mt-2 max-w-[70ch]">
        {evaluation.lastError ?? 'The reviewer did not respond.'} Your submission is safe, and the automated checks
        below are complete. Retrying runs only the part that failed.
      </p>
      <button type="button" className="btn btn-primary mt-4" onClick={() => retry.mutate()} disabled={retry.isPending}>
        {retry.isPending ? 'Retrying…' : 'Retry the review'}
      </button>
      {retry.error && <p className="mt-2 text-sm text-pencil">{retry.error.message}</p>}
    </section>
  );
}

function Report({
  evaluation,
  report,
  comparison,
}: {
  evaluation: EvaluationDto;
  report: FeedbackReport;
  comparison: ComparisonDto | null;
}) {
  const aiSkipped = report.aiReview.status === 'skipped';
  const tone = bandTone(report.overall.band);
  return (
    <div className="space-y-10">
      <section aria-labelledby="summary-title" className="grid gap-8 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div>
          <h1 id="summary-title" className="sr-only">
            Review summary
          </h1>
          {report.overall.band ? (
            <>
              <p className={`text-[3.25rem] font-bold leading-none [font-stretch:125%] ${toneText[tone]}`}>{report.overall.band}</p>
              <p className="mt-3 text-ink-soft">
                Average {formatMean(report.overall.mean)} of 4 across {report.overall.assessedCount} of{' '}
                {report.overall.totalCriteria} criteria. Each score is a rubric level backed by quotes from your design.
              </p>
            </>
          ) : (
            <p className="text-2xl font-semibold [font-stretch:112%]">Automated checks only</p>
          )}
          {report.summary && <p className="mt-4 text-lg">{report.summary}</p>}
          {report.strengths.length > 0 && (
            <div className="mt-5">
              <h2 className="text-base">What worked</h2>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {report.strengths.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <div className="rounded-md border border-rule bg-sheet p-5">
          <h2 className="text-lg">Your next three moves</h2>
          {report.nextSteps.length > 0 ? (
            <ol className="mt-3 space-y-3">
              {report.nextSteps.map((step, index) => (
                <li key={`${step.criterionId}-${index}`} className="flex gap-3">
                  <span className="text-lg font-semibold text-cobalt [font-stretch:112%]">{index + 1}</span>
                  <span>
                    {step.text}
                    <span className="label ml-2">{step.criterionName}</span>
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-2 text-ink-soft">Nothing pressing. Try the problem again to face the other curveball.</p>
          )}
          <TryAgain evaluation={evaluation} />
        </div>
      </section>

      {aiSkipped && (
        <p className="rounded-md bg-amber-wash px-4 py-3 text-sm text-amber">
          AI review is not configured on this server, so only the automated checks ran and the rubric criteria are
          unscored. Add a free Gemini, Groq or OpenRouter key to <span className="code">.env</span> to enable it.
        </p>
      )}

      {comparison && <Comparison comparison={comparison} />}

      <section aria-labelledby="criteria-title">
        <h2 id="criteria-title" className="text-2xl">
          The review, criterion by criterion
        </h2>
        <p className="mt-1 max-w-[70ch] text-sm text-ink-soft">
          Highlighted text is quoted from your submission. Struck-through quotes could not be found in it, so the
          judgement relying on them is marked low confidence.
        </p>
        <div className="mt-2 rounded-md border border-rule bg-sheet px-5">
          {report.criteria.map((criterion) => (
            <CriterionCard key={criterion.criterionId} criterion={criterion} />
          ))}
        </div>
      </section>

      <section aria-labelledby="checks-title">
        <h2 id="checks-title" className="text-2xl">
          Automated checks
        </h2>
        <p className="mt-1 text-sm text-ink-soft">
          Deterministic rules over your design’s structure. They can cap a criterion when evidence is plainly missing.
        </p>
        <div className="mt-3 rounded-md border border-rule bg-sheet p-5">
          <ChecksPanel findings={report.findings} />
        </div>
      </section>

      {evaluation.debrief && (
        <section aria-labelledby="debrief-title" className="grid gap-8 md:grid-cols-2">
          <div>
            <h2 id="debrief-title" className="text-2xl">
              What reviewers look for here
            </h2>
            <ul className="mt-3 list-disc space-y-2 pl-5">
              {evaluation.debrief.designPressures.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
            <h3 className="mt-6 text-lg">What the curveball was testing</h3>
            <p className="mt-2 text-ink-soft">{evaluation.debrief.curveballTests}</p>
          </div>
          <div>
            <h2 className="text-2xl">Other valid designs</h2>
            <p className="mt-1 text-sm text-ink-soft">Alternatives with their trade-offs, not the answer.</p>
            <div className="mt-3 space-y-4">
              {evaluation.debrief.alternativeApproaches.map((a) => (
                <article key={a.name} className="rounded-md border border-rule bg-sheet p-4">
                  <h3 className="text-base">{a.name}</h3>
                  <p className="mt-1 text-sm">{a.summary}</p>
                  <p className="mt-2 text-sm">
                    <span className="label mr-1 text-moss">Strengths</span> {a.strengths}
                  </p>
                  <p className="mt-1 text-sm">
                    <span className="label mr-1 text-pencil">Costs</span> {a.tradeoffs}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>
      )}

      <footer className="border-t border-rule pt-4 text-sm text-ink-faint">
        {report.aiReview.status === 'completed' ? (
          <>
            Reviewed by {report.aiReview.provider} ({report.aiReview.model})
            {report.aiReview.latencyMs !== null && ` in ${(report.aiReview.latencyMs / 1000).toFixed(1)}s`}, with prompt{' '}
            {report.aiReview.promptVersion} and rubric {report.rubricVersion}.
          </>
        ) : (
          <>Rubric {report.rubricVersion}. AI review {report.aiReview.status}.</>
        )}
      </footer>
    </div>
  );
}

function TryAgain({ evaluation }: { evaluation: EvaluationDto }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const start = useMutation({
    mutationFn: (seed: string | null) => api.startAttempt(evaluation.problemId, seed),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries();
      navigate(`/attempts/${result.attempt.id}`);
    },
  });
  return (
    <div className="mt-6 flex flex-wrap gap-3 border-t border-rule pt-4">
      <button type="button" className="btn btn-primary" onClick={() => start.mutate(evaluation.attemptId)} disabled={start.isPending}>
        Revise this design
      </button>
      <button type="button" className="btn btn-secondary" onClick={() => start.mutate(null)} disabled={start.isPending}>
        Start fresh
      </button>
      <p className="w-full text-sm text-ink-soft">Your next attempt faces the other curveball, so extensibility is tested again.</p>
      {start.error && <p className="w-full text-sm text-pencil">{start.error.message}</p>}
    </div>
  );
}

function Comparison({ comparison }: { comparison: ComparisonDto }) {
  const moved = comparison.criteria.filter((c) => c.delta !== null && c.delta !== 0);
  return (
    <section aria-labelledby="comparison-title" className="rounded-md border border-rule bg-sheet p-5">
      <h2 id="comparison-title" className="text-xl">
        Since attempt #{comparison.previousNumber}
      </h2>
      {comparison.rubricVersionChanged && (
        <p className="mt-1 text-sm text-amber">The rubric changed between these attempts, so compare with care.</p>
      )}
      <p className="mt-2 text-ink-soft">
        Average {formatMean(comparison.overall.previous)} → {formatMean(comparison.overall.current)}
        {comparison.overall.delta !== null && comparison.overall.delta !== 0 && (
          <span className={comparison.overall.delta > 0 ? 'ml-2 text-moss' : 'ml-2 text-pencil'}>
            ({comparison.overall.delta > 0 ? '+' : ''}
            {comparison.overall.delta})
          </span>
        )}
      </p>
      {moved.length > 0 ? (
        <ul className="mt-3 grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
          {moved.map((c) => (
            <li key={c.criterionId} className="flex justify-between gap-3">
              <span>{c.name}</span>
              <span className={c.delta! > 0 ? 'font-semibold text-moss' : 'font-semibold text-pencil'}>
                {c.previous} → {c.current}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-ink-soft">No criterion moved.</p>
      )}
      {comparison.resolvedFindings.length > 0 && (
        <p className="mt-3 text-sm text-moss">
          Resolved since last time: {comparison.resolvedFindings.map((f) => f.message).join(' ')}
        </p>
      )}
    </section>
  );
}
