import { Component, type ErrorInfo, type ReactNode } from 'react';

import { Button } from '@/components/ui/button';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: (error: Error, reset: () => void) => ReactNode;
  onError?: (error: Error, info: ErrorInfo) => void;
  scope?: string;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    this.props.onError?.(error, info);
  }

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    if (this.props.fallback) return this.props.fallback(error, this.reset);

    return (
      <div
        className='flex flex-col items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-6'
        data-testid='error-boundary-fallback'
        role='alert'
      >
        <div className='flex flex-col gap-1'>
          <p className='text-base font-semibold text-foreground'>Something went wrong{this.props.scope ? ` in ${this.props.scope}` : ''}.</p>
          <p className='text-sm text-muted-foreground'>{error.message || 'An unexpected error occurred.'}</p>
        </div>
        <Button onClick={this.reset} size='sm' variant='outline'>
          Try again
        </Button>
      </div>
    );
  }

  reset = (): void => {
    this.setState({ error: null });
  };
}
