import type { Score } from '@designloop/shared';

const time = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });
const dateTime = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export const formatTime = (iso: string) => time.format(new Date(iso));
export const formatDateTime = (iso: string) => dateTime.format(new Date(iso));

export function formatMean(mean: number | null): string {
  return mean === null ? '–' : mean.toFixed(mean % 1 === 0 ? 0 : 2);
}

export type Tone = 'pencil' | 'amber' | 'cobalt' | 'moss' | 'none';

/** Score colour follows the rubric: missing, emerging, solid, strong. */
export function scoreTone(score: Score | null): Tone {
  switch (score) {
    case 1:
      return 'pencil';
    case 2:
      return 'amber';
    case 3:
      return 'cobalt';
    case 4:
      return 'moss';
    default:
      return 'none';
  }
}

export const toneText: Record<Tone, string> = {
  pencil: 'text-pencil',
  amber: 'text-amber',
  cobalt: 'text-cobalt',
  moss: 'text-moss',
  none: 'text-ink-faint',
};

export const toneFill: Record<Tone, string> = {
  pencil: 'bg-pencil',
  amber: 'bg-amber',
  cobalt: 'bg-cobalt',
  moss: 'bg-moss',
  none: 'bg-rule',
};

export const toneWash: Record<Tone, string> = {
  pencil: 'bg-pencil-wash text-pencil',
  amber: 'bg-amber-wash text-amber',
  cobalt: 'bg-cobalt-wash text-cobalt-deep',
  moss: 'bg-moss-wash text-moss',
  none: 'bg-paper text-ink-faint',
};

export function bandTone(band: string | null): Tone {
  switch (band) {
    case 'Strong':
      return 'moss';
    case 'Solid':
      return 'cobalt';
    case 'Developing':
      return 'amber';
    case 'Foundational':
      return 'pencil';
    default:
      return 'none';
  }
}

export function newId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}
