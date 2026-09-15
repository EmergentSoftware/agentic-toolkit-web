/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  base: '/agentic-toolkit-web/',
  build: {
    rollupOptions: {
      // Two entries: the SPA and the MSAL redirect bridge page (served at <base>auth-redirect.html).
      input: {
        main: path.resolve(import.meta.dirname, 'index.html'),
        redirect: path.resolve(import.meta.dirname, 'auth-redirect.html'),
      },
    },
  },
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['src/setupTests.ts'],
  },
});
