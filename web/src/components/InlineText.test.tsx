import { render } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { InlineText } from './InlineText';

describe('InlineText', () => {
  test('renders backtick-quoted identifiers from AI feedback as inline code', () => {
    const { container } = render(<InlineText text="Move `occupy()` into `ParkingSpot` so it guards itself." />);

    const code = [...container.querySelectorAll('code')].map((el) => el.textContent);
    expect(code).toEqual(['occupy()', 'ParkingSpot']);
    expect(container.textContent).toBe('Move occupy() into ParkingSpot so it guards itself.');
  });

  test('leaves text without backticks, or with an unpaired backtick, as it is', () => {
    const { container } = render(<InlineText text="Plain text with one ` stray tick." />);

    expect(container.querySelectorAll('code')).toHaveLength(0);
    expect(container.textContent).toBe('Plain text with one ` stray tick.');
  });
});
