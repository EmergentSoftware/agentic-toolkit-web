import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// Provide deterministic Vite env values for tests that exercise the session layer.
vi.stubEnv('VITE_GITHUB_OAUTH_CLIENT_ID', 'test-client-id');
vi.stubEnv('VITE_AUTH_FUNCTION_URL', 'http://localhost:7071');
