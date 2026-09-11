/**
 * AI reviewers often quote identifiers in markdown backticks ("`ParkingSpot`").
 * Show those as inline code instead of literal backticks; everything else stays plain text.
 */
export function InlineText({ text }: { text: string }) {
  const parts = text.split('`');
  // An odd number of parts means every backtick is paired.
  if (parts.length < 3 || parts.length % 2 === 0) return <>{text}</>;
  return (
    <>
      {parts.map((part, index) =>
        index % 2 === 1 ? (
          <code key={index} className="code rounded bg-paper px-1">
            {part}
          </code>
        ) : (
          part
        ),
      )}
    </>
  );
}
