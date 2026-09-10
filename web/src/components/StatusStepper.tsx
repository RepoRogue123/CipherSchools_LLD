import type { EvaluationStatus } from '@designloop/shared';

const STEPS = ['Submitted', 'Evaluating', 'Feedback ready'] as const;

function position(status: EvaluationStatus): number {
  if (status === 'QUEUED') return 0;
  if (status === 'EVALUATING') return 1;
  return 2;
}

/** Submitted → Evaluating → Completed/Failed, as the learner sees it. */
export function StatusStepper({ status }: { status: EvaluationStatus }) {
  const current = position(status);
  const failed = status === 'FAILED';
  return (
    <ol className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm" aria-label="Evaluation progress">
      {STEPS.map((step, index) => {
        const label = index === 2 && failed ? 'Review incomplete' : step;
        const done = index < current || (index === current && index === 2);
        const active = index === current && index < 2;
        return (
          <li key={step} className="flex items-center gap-3" aria-current={index === current ? 'step' : undefined}>
            <span className="flex items-center gap-2">
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full border text-[0.7rem] font-bold ${
                  failed && index === 2
                    ? 'border-pencil bg-pencil text-white'
                    : done
                      ? 'border-cobalt bg-cobalt text-white'
                      : active
                        ? 'animate-pulse border-cobalt text-cobalt'
                        : 'border-rule-strong text-ink-faint'
                }`}
                aria-hidden="true"
              >
                {index + 1}
              </span>
              <span className={index <= current ? 'font-semibold' : 'text-ink-faint'}>{label}</span>
            </span>
            {index < STEPS.length - 1 && <span className="h-px w-8 bg-rule-strong" aria-hidden="true" />}
          </li>
        );
      })}
    </ol>
  );
}
