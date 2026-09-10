import type { EvidenceQuote } from '@designloop/shared';
import type { ReviewDocument } from '../../domain/design-format';

const MIN_QUOTE_CHARS = 3;
const MIN_FUZZY_TOKENS = 4;
/** Share of a quote's words that must appear in the cited section for a near-verbatim match. */
const FUZZY_THRESHOLD = 0.8;

function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function tokens(text: string): string[] {
  return normalise(text).split(' ').filter(Boolean);
}

/**
 * Deterministic guard against hallucinated evidence. A quote counts only if it
 * appears in the exact text the reviewer was shown: verbatim anywhere (ignoring
 * case and punctuation), or near-verbatim inside the section it cites.
 */
export function verifyEvidence(
  evidence: readonly { quote: string; location: string }[],
  review: ReviewDocument,
): EvidenceQuote[] {
  const whole = ` ${review.sections.map((s) => normalise(`${s.title} ${s.text}`)).join(' ')} `;

  return evidence.map(({ quote, location }) => {
    const anchor = location.trim().replace(/^\[|\]$/g, '');
    return { quote: quote.trim(), location: anchor, verified: isVerified(quote, anchor) };
  });

  function isVerified(quote: string, anchor: string): boolean {
    const normalised = normalise(quote);
    if (normalised.length < MIN_QUOTE_CHARS) return false;
    if (whole.includes(` ${normalised} `)) return true;

    const section = review.sections.find((s) => s.anchor === anchor);
    const quoteTokens = tokens(quote);
    if (!section || quoteTokens.length < MIN_FUZZY_TOKENS) return false;
    const sectionTokens = new Set(tokens(`${section.title} ${section.text}`));
    const hits = quoteTokens.filter((t) => sectionTokens.has(t)).length;
    return hits / quoteTokens.length >= FUZZY_THRESHOLD;
  }
}
