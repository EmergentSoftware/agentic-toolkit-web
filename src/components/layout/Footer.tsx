export function Footer() {
  return (
    <footer
      className='border-t border-border bg-background/60 py-6 text-xs text-muted-foreground'
      data-testid='app-footer'
    >
      <div className='mx-auto flex w-full max-w-6xl flex-col gap-2 px-4 sm:flex-row sm:items-center sm:justify-between sm:px-6'>
        <div className='flex items-center gap-2'>
          <img alt='' aria-hidden='true' className='h-4 w-4' src={`${import.meta.env.BASE_URL}logomark.svg`} />
          <span>© {new Date().getFullYear()} Emergent Software — Agentic Toolkit</span>
        </div>
        <span>
          Built with{' '}
          <a
            className='text-foreground underline-offset-4 hover:text-primary hover:underline'
            href='https://github.com/EmergentSoftware/agentic-toolkit'
            rel='noreferrer'
            target='_blank'
          >
            @detergent-software/atk
          </a>
        </span>
      </div>
    </footer>
  );
}
