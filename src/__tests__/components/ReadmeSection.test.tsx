import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ReadmeSection } from '@/components/ReadmeSection';

const baseProps = {
  ariaLabel: 'Bundle README',
  emptyMessage: 'No README is available for this bundle.',
  isError: false,
  isLoading: false,
  testId: 'bundle-detail-readme',
};

describe('ReadmeSection', () => {
  it('renders a labelled section with a README heading', () => {
    render(<ReadmeSection {...baseProps} readme='# Hello' />);

    const section = screen.getByTestId('bundle-detail-readme');
    expect(section).toHaveAttribute('aria-label', 'Bundle README');
    expect(within(section).getByRole('heading', { level: 2, name: 'README' })).toBeInTheDocument();
  });

  it('renders the markdown when a README is present', () => {
    render(<ReadmeSection {...baseProps} readme={'# Hello\n\n- item one'} />);

    const section = screen.getByTestId('bundle-detail-readme');
    expect(within(section).getByTestId('markdown-renderer')).toBeInTheDocument();
    expect(within(section).getByRole('heading', { level: 1, name: 'Hello' })).toBeInTheDocument();
    expect(within(section).getByText('item one')).toBeInTheDocument();
    expect(screen.queryByTestId('bundle-detail-readme-missing')).not.toBeInTheDocument();
  });

  it('shows a loading skeleton while the README is inflight', () => {
    render(<ReadmeSection {...baseProps} isLoading readme={undefined} />);

    expect(screen.getByRole('status', { name: /loading readme/i })).toBeInTheDocument();
  });

  it('shows the empty message when the README is missing', () => {
    render(<ReadmeSection {...baseProps} readme={null} />);

    expect(screen.getByTestId('bundle-detail-readme-missing')).toHaveTextContent(
      'No README is available for this bundle.',
    );
  });

  it('treats an empty string as a missing README', () => {
    render(<ReadmeSection {...baseProps} readme='' />);

    expect(screen.getByTestId('bundle-detail-readme-missing')).toBeInTheDocument();
  });

  it('falls back to the empty message when the fetch failed', () => {
    render(<ReadmeSection {...baseProps} isError readme={undefined} />);

    expect(screen.getByTestId('bundle-detail-readme-missing')).toBeInTheDocument();
  });
});
