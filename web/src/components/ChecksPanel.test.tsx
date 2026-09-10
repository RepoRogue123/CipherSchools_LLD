import type { Finding } from '@designloop/shared';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { ChecksPanel } from './ChecksPanel';

const findings: Finding[] = [
  { checkId: 'entities.orphan', severity: 'info', message: 'Not connected to anything yet: Ticket.' },
  { checkId: 'mapping.coverage', severity: 'warning', message: 'R4, R6 are not mapped to any part of your design.' },
  { checkId: 'flows.min', severity: 'blocker', message: 'Describe at least one key flow.' },
  { checkId: 'edge-cases.empty', severity: 'warning', message: 'List the edge cases your design handles.' },
];

describe('ChecksPanel', () => {
  test('groups findings by how much they matter, blockers first', () => {
    render(<ChecksPanel findings={findings} />);

    const groups = screen.getAllByRole('region');
    expect(groups.map((g) => g.getAttribute('aria-label'))).toEqual([
      'Must fix before the next step',
      'Worth fixing',
      'Worth a look',
    ]);
    expect(within(groups[1]!).getAllByRole('listitem')).toHaveLength(2);
    expect(within(groups[0]!).getByText('Describe at least one key flow.')).toBeInTheDocument();
  });

  test('links each finding to the editor section that fixes it', async () => {
    const onGoTo = vi.fn();
    render(<ChecksPanel findings={findings} onGoTo={onGoTo} />);

    await userEvent.click(screen.getByRole('button', { name: 'Requirement mapping' }));

    expect(onGoTo).toHaveBeenCalledWith('mapping');
  });

  test('says so when there is nothing to fix', () => {
    render(<ChecksPanel findings={[]} />);

    expect(screen.getByText(/No structural issues/)).toBeInTheDocument();
  });
});
