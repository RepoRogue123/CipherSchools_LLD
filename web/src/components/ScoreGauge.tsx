import type { Score } from '@designloop/shared';
import { scoreTone, toneFill, toneText } from '../lib/format';

/** Four-segment gauge matching the rubric's four levels; never a percentage. */
export function ScoreGauge({ score, label }: { score: Score | null; label: string | null }) {
  const tone = scoreTone(score);
  const description = score === null ? 'Not assessed' : `${label} (${score} of 4)`;
  return (
    <span className="inline-flex items-center gap-2" aria-label={description} role="img">
      <span className="flex gap-0.5" aria-hidden="true">
        {[1, 2, 3, 4].map((level) => (
          <span
            key={level}
            className={`h-3 w-4 rounded-[2px] ${score !== null && level <= score ? toneFill[tone] : 'bg-rule'}`}
          />
        ))}
      </span>
      <span className={`text-sm font-semibold ${toneText[tone]}`} aria-hidden="true">
        {score === null ? 'Not assessed' : label}
      </span>
    </span>
  );
}
