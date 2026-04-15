import { useRef } from 'react';

import { cn } from '@/lib/utils';

export interface StepperStep {
  description?: string;
  id: string;
  title: string;
}

interface StepperProps {
  className?: string;
  currentStep: number;
  onStepSelect?: (index: number) => void;
  stepCanBeVisited?: (index: number) => boolean;
  steps: StepperStep[];
}

export function Stepper({ className, currentStep, onStepSelect, stepCanBeVisited, steps }: StepperProps) {
  const listRef = useRef<HTMLOListElement>(null);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    const max = steps.length - 1;
    let next: null | number = null;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = Math.min(max, index + 1);
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = Math.max(0, index - 1);
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = max;
    if (next !== null) {
      event.preventDefault();
      const button = listRef.current?.querySelectorAll<HTMLButtonElement>('[data-stepper-button]')[next];
      button?.focus();
    }
  };

  return (
    <nav aria-label='Progress' className={className}>
      <ol className='flex flex-wrap items-center gap-2 sm:gap-3' ref={listRef}>
        {steps.map((step, index) => {
          const isActive = index === currentStep;
          const isCompleted = index < currentStep;
          const canVisit = stepCanBeVisited ? stepCanBeVisited(index) : index <= currentStep;
          const clickable = Boolean(onStepSelect && canVisit);
          return (
            <li className='flex items-center gap-2' key={step.id}>
              <button
                aria-current={isActive ? 'step' : undefined}
                aria-label={`Step ${index + 1}: ${step.title}`}
                className={cn(
                  'group flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                  isActive
                    ? 'border-primary bg-primary/10 text-foreground'
                    : isCompleted
                      ? 'border-border bg-secondary text-foreground'
                      : 'border-border bg-transparent text-muted-foreground',
                  clickable ? 'cursor-pointer hover:bg-accent hover:text-accent-foreground' : 'cursor-default',
                )}
                data-stepper-button
                data-testid={`stepper-step-${index}`}
                disabled={!clickable}
                onClick={() => clickable && onStepSelect?.(index)}
                onKeyDown={(event) => handleKeyDown(event, index)}
                tabIndex={isActive ? 0 : -1}
                type='button'
              >
                <span
                  aria-hidden='true'
                  className={cn(
                    'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : isCompleted
                        ? 'bg-primary/80 text-primary-foreground'
                        : 'bg-muted text-muted-foreground',
                  )}
                >
                  {isCompleted ? '✓' : index + 1}
                </span>
                <span className='flex flex-col leading-tight'>
                  <span className='text-sm font-medium'>{step.title}</span>
                  {step.description ? (
                    <span className='hidden text-xs text-muted-foreground sm:inline'>{step.description}</span>
                  ) : null}
                </span>
              </button>
              {index < steps.length - 1 ? (
                <span aria-hidden='true' className='hidden h-px w-4 bg-border sm:inline-block' />
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
