import { render, screen } from '@testing-library/react';
import { HashRouter } from 'react-router';
import { describe, expect, it } from 'vitest';

import { App } from '@/App';

describe('App', () => {
  it('renders the hello-world heading on the root route', () => {
    render(
      <HashRouter>
        <App />
      </HashRouter>,
    );

    expect(screen.getByRole('heading', { name: /hello, agentic toolkit web/i })).toBeInTheDocument();
  });
});
