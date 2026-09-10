import type { AssessmentSource, CriterionFeedback } from '@designloop/shared';
import { ScoreGauge } from './ScoreGauge';

const SOURCE_LABEL: Record<AssessmentSource, string> = {
  ai: 'AI review',
  deterministic: 'Automated check',
  human: 'Human review',
};

/**
 * One rubric criterion as a marked-up review: the learner's own words
 * highlighted as evidence, then the reviewer's reasoning, concern and suggestion.
 */
export function CriterionCard({ criterion }: { criterion: CriterionFeedback }) {
  const unverified = criterion.evidence.filter((e) => !e.verified).length;
  return (
    <article className="border-t border-rule py-5 first:border-t-0" aria-labelledby={`criterion-${criterion.criterionId}`}>
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 id={`criterion-${criterion.criterionId}`} className="text-lg">
          {criterion.name}
        </h3>
        <div className="flex items-center gap-3">
          <ScoreGauge score={criterion.score} label={criterion.levelLabel} />
          {criterion.source && <span className="label">{SOURCE_LABEL[criterion.source]}</span>}
        </div>
      </header>

      {criterion.score === null ? (
        <p className="mt-2 text-sm text-ink-soft">Not assessed in this review.</p>
      ) : (
        <div className="mt-3 space-y-3">
          {criterion.evidence.length > 0 && (
            <ul className="space-y-1.5" aria-label="Evidence from your design">
              {criterion.evidence.map((evidence, index) => (
                <li key={index} className="text-[0.9375rem]">
                  <q className={evidence.verified ? 'evidence-mark' : 'evidence-unverified'}>{evidence.quote}</q>{' '}
                  <span className="code text-ink-faint">{evidence.location}</span>
                  {!evidence.verified && <span className="ml-2 text-xs text-pencil">Not found in your submission</span>}
                </li>
              ))}
            </ul>
          )}
          {criterion.reasoning && <p className="text-ink-soft">{criterion.reasoning}</p>}
          {criterion.concern && (
            <p className="border-l-2 border-pencil pl-3">
              <span className="label mr-2 text-pencil">Concern</span>
              {criterion.concern}
            </p>
          )}
          {criterion.suggestion && (
            <p className="border-l-2 border-cobalt pl-3">
              <span className="label mr-2 text-cobalt">Try next</span>
              {criterion.suggestion}
            </p>
          )}
          <p className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-ink-soft">
            {criterion.confidence && <span>Reviewer confidence: {criterion.confidence}</span>}
            {unverified > 0 && (
              <span className="text-pencil">
                {unverified === 1 ? 'One quote' : `${unverified} quotes`} could not be matched to your design, so treat
                this judgement with care.
              </span>
            )}
          </p>
          {criterion.cap && (
            <p className="rounded-md bg-amber-wash px-3 py-2 text-sm text-amber">
              Capped at {criterion.cap.maxScore} by an automated check (the reviewer gave {criterion.cap.originalScore}):{' '}
              {criterion.cap.reason}
            </p>
          )}
        </div>
      )}
    </article>
  );
}
