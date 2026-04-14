import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ErrorBoundary } from '@/components/ErrorBoundary';

function Boom({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) throw new Error('kaboom');
  return <span>ok-content</span>;
}

function Harness() {
  const [shouldThrow, setShouldThrow] = useState(true);
  return (
    <ErrorBoundary
      fallback={(error, reset) => (
        <div>
          <p data-testid='fallback-message'>{error.message}</p>
          <button
            onClick={() => {
              setShouldThrow(false);
              reset();
            }}
            type='button'
          >
            recover
          </button>
        </div>
      )}
    >
      <Boom shouldThrow={shouldThrow} />
    </ErrorBoundary>
  );
}

describe('ErrorBoundary', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders children when no error is thrown', () => {
    render(
      <ErrorBoundary>
        <span>safe-content</span>
      </ErrorBoundary>,
    );

    expect(screen.getByText('safe-content')).toBeInTheDocument();
  });

  it('renders the default fallback when a child throws', () => {
    render(
      <ErrorBoundary scope='tests'>
        <Boom shouldThrow />
      </ErrorBoundary>,
    );

    expect(screen.getByTestId('error-boundary-fallback')).toBeInTheDocument();
    expect(screen.getByText(/kaboom/)).toBeInTheDocument();
    expect(screen.getByText(/in tests/)).toBeInTheDocument();
  });

  it('invokes custom fallback and recovers after reset', () => {
    render(<Harness />);

    expect(screen.getByTestId('fallback-message')).toHaveTextContent('kaboom');

    fireEvent.click(screen.getByRole('button', { name: 'recover' }));

    expect(screen.getByText('ok-content')).toBeInTheDocument();
  });
});
