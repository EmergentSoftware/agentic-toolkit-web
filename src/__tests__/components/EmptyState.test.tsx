import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { EmptyState } from '@/components/EmptyState';

describe('EmptyState', () => {
  it('renders the title and description', () => {
    render(<EmptyState description='Try adjusting your filters.' title='No results' />);

    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    expect(screen.getByText('No results')).toBeInTheDocument();
    expect(screen.getByText('Try adjusting your filters.')).toBeInTheDocument();
  });

  it('renders optional actions', () => {
    render(
      <EmptyState
        actions={<button type='button'>Clear filters</button>}
        title='No results'
      />,
    );

    expect(screen.getByRole('button', { name: 'Clear filters' })).toBeInTheDocument();
  });

  it('exposes a status role for assistive tech', () => {
    render(<EmptyState title='Nothing here' />);

    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});
