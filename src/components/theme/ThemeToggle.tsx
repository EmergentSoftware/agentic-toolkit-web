import { Monitor, Moon, Sun } from 'lucide-react';

import { Button } from '@/components/ui/button';

import { type Theme, useTheme } from './ThemeProvider';

const NEXT_THEME: Record<Theme, Theme> = {
  dark: 'system',
  light: 'dark',
  system: 'light',
};

const LABEL: Record<Theme, string> = {
  dark: 'Switch to system theme',
  light: 'Switch to dark theme',
  system: 'Switch to light theme',
};

export function ThemeToggle() {
  const { setTheme, theme } = useTheme();
  const Icon = theme === 'dark' ? Moon : theme === 'light' ? Sun : Monitor;

  return (
    <Button
      aria-label={LABEL[theme]}
      data-theme={theme}
      onClick={() => setTheme(NEXT_THEME[theme])}
      size='icon'
      title={LABEL[theme]}
      variant='ghost'
    >
      <Icon aria-hidden='true' />
    </Button>
  );
}
