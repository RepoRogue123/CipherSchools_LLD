import type { EvidenceQuote } from '@designloop/shared';
import type { ReviewDocument, ReviewSection } from '../../domain/design-format';

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

/** The part of a section the learner wrote: always its text, and its title when they named it. */
function learnerWords(section: ReviewSection): string {
  return normalise(section.titleByLearner ? `${section.title} ${section.text}` : section.text);
}

/** Headings that are ours, longest first: every anchor, and every title the learner did not write. */
function platformHeadings(review: ReviewDocument): string[] {
  return review.sections
    .flatMap((s) => (s.titleByLearner ? [s.anchor] : [s.anchor, `${s.anchor} ${s.title}`, s.title]))
    .map(normalise)
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
}

/**
 * Deterministic guard against hallucinated evidence. A quote counts only if it
 * comes from what the learner wrote: verbatim anywhere (ignoring case and
 * punctuation), or near-verbatim inside the section it cites. Reviewers often
 * quote a heading along with the text under it, so a leading heading of ours is
 * set aside first, and a quote that is nothing but one of our headings says
 * nothing about the design and is dropped. A requirement's heading carries the
 * problem's own wording, so it never counts as the learner's evidence.
 */
export function verifyEvidence(
  evidence: readonly { quote: string; location: string }[],
  review: ReviewDocument,
): EvidenceQuote[] {
  const learnerText = ` ${review.sections.map(learnerWords).join(' ')} `;
  const headings = platformHeadings(review);

  return evidence.flatMap(({ quote, location }) => {
    const words = wordsAfterHeading(quote);
    if (words === null) return [];
    const anchor = location.trim().replace(/^\[|\]$/g, '');
    return [{ quote: quote.trim(), location: anchor, verified: isVerified(words, anchor) }];
  });

  /** The quote's words once a leading heading of ours is set aside; null when that heading is all there is. */
  function wordsAfterHeading(quote: string): string | null {
    const normalised = normalise(quote);
    const heading = headings.find((h) => normalised === h || normalised.startsWith(`${h} `));
    if (heading === undefined) return normalised;
    return normalised === heading ? null : normalised.slice(heading.length + 1);
  }

  function isVerified(words: string, anchor: string): boolean {
    if (words.length < MIN_QUOTE_CHARS) return false;
    if (learnerText.includes(` ${words} `)) return true;

    const section = review.sections.find((s) => s.anchor === anchor);
    const quoteTokens = words.split(' ');
    if (!section || quoteTokens.length < MIN_FUZZY_TOKENS) return false;
    const sectionTokens = new Set(learnerWords(section).split(' '));
    const hits = quoteTokens.filter((t) => sectionTokens.has(t)).length;
    return hits / quoteTokens.length >= FUZZY_THRESHOLD;
  }
}
