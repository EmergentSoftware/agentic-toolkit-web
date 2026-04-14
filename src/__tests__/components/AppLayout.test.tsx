import { Toast } from '@base-ui-components/react/toast';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it } from 'vitest';

import { AppLayout } from '@/components/layout/AppLayout';
import { ThemeProvider } from '@/components/theme/ThemeProvider';

function renderLayout(initialPath = '/') {
  return render(
    <ThemeProvider>
      <Toast.Provider>
        <MemoryRouter initialEntries={[initialPath]}>
          <Routes>
            <Route element={<AppLayout />} path='/'>
              <Route element={<p>landing-content</p>} index />
            </Route>
          </Routes>
        </MemoryRouter>
      </Toast.Provider>
    </ThemeProvider>,
  );
}

describe('AppLayout', () => {
  it('renders the header, main, and footer regions', () => {
    renderLayout();

    expect(screen.getByTestId('app-header')).toBeInTheDocument();
    expect(screen.getByTestId('app-main')).toBeInTheDocument();
    expect(screen.getByTestId('app-footer')).toBeInTheDocument();
  });

  it('renders the brand mark and primary nav links', () => {
    renderLayout();

    expect(screen.getByRole('link', { name: /agentic toolkit/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /browse/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /contribute/i })).toBeInTheDocument();
  });

  it('renders the outlet content in the main region', () => {
    renderLayout();

    expect(screen.getByText('landing-content')).toBeInTheDocument();
  });

  it('renders the theme toggle and user affordance placeholder', () => {
    renderLayout();

    expect(screen.getByRole('button', { name: /switch to/i })).toBeInTheDocument();
    expect(screen.getByTestId('user-affordance')).toBeInTheDocument();
  });
});
