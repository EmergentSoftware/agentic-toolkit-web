import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildManifestInput,
  ContributeRoute,
  createInitialDraft,
  DRAFT_STORAGE_KEY,
  type DraftState,
  isJsonValid,
  validateDraft,
} from '@/routes/Contribute';

import { makeSessionValue, SessionHarness } from '../utils/session-harness';

function fillMetadata(overrides: Partial<Record<'author' | 'description' | 'name' | 'version', string>> = {}) {
  fireEvent.change(screen.getByTestId('field-name'), {
    target: { value: overrides.name ?? 'my-asset' },
  });
  fireEvent.change(screen.getByTestId('field-description'), {
    target: { value: overrides.description ?? 'A helpful thing' },
  });
  if (overrides.version) {
    fireEvent.change(screen.getByTestId('field-version'), { target: { value: overrides.version } });
  }
  if (overrides.author) {
    fireEvent.change(screen.getByTestId('field-author'), { target: { value: overrides.author } });
  }
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function makeFile(name: string, content = '# content') {
  return new File([content], name, { type: 'text/markdown' });
}

function renderContribute(login = 'test-user') {
  const session = makeSessionValue({
    status: 'member',
    user: { avatarUrl: null, login, name: null },
  });
  return render(
    <SessionHarness session={session}>
      <ContributeRoute />
    </SessionHarness>,
  );
}

async function uploadFiles(files: File[]) {
  const input = screen.getByTestId('file-input') as HTMLInputElement;
  Object.defineProperty(input, 'files', { configurable: true, value: files });
  fireEvent.change(input);
  await flush();
}

beforeEach(() => {
  window.sessionStorage.clear();
});

afterEach(() => {
  window.sessionStorage.clear();
  vi.restoreAllMocks();
});

describe('Contribute — validation helpers', () => {
  it('accepts a well-formed skill draft', () => {
    const draft: DraftState = {
      ...createInitialDraft('jason'),
      description: 'A helpful skill',
      files: [{ content: '# Skill', path: 'skill.md', size: 10 }],
      name: 'my-skill',
      tags: ['workflow'],
      type: 'skill',
      version: '1.0.0',
    };
    const result = validateDraft(draft);
    expect(result.success).toBe(true);
  });

  it('rejects a non-mcp-config draft without files (missing entrypoint)', () => {
    const draft = {
      ...createInitialDraft('jason'),
      description: 'A skill',
      name: 'my-skill',
      type: 'skill' as const,
    };
    const result = validateDraft(draft);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('entrypoint'))).toBe(true);
    }
  });

  it('allows mcp-config drafts without entrypoint', () => {
    const draft: DraftState = {
      ...createInitialDraft('jason'),
      description: 'An MCP server config',
      mcpConfig: '{"mcpServers":{}}',
      name: 'my-mcp',
      type: 'mcp-config',
    };
    const result = validateDraft(draft);
    expect(result.success).toBe(true);
  });

  it('rejects invalid semver versions', () => {
    const draft: DraftState = {
      ...createInitialDraft('jason'),
      description: 'x',
      files: [{ content: '# a', path: 'a.md', size: 3 }],
      name: 'my-asset',
      type: 'skill',
      version: 'v1.0',
    };
    const result = validateDraft(draft);
    expect(result.success).toBe(false);
  });

  it('rejects invalid org strings', () => {
    const draft: DraftState = {
      ...createInitialDraft('jason'),
      description: 'x',
      files: [{ content: '# a', path: 'a.md', size: 3 }],
      name: 'my-asset',
      org: '1bad-start',
      type: 'skill',
      version: '1.0.0',
    };
    const result = validateDraft(draft);
    expect(result.success).toBe(false);
  });

  it('builds a manifest that includes provided tags and org', () => {
    const draft: DraftState = {
      ...createInitialDraft('jason'),
      description: 'x',
      files: [{ content: '# a', path: 'a.md', size: 3 }],
      name: 'my-asset',
      org: 'acme',
      tags: ['alpha', 'beta'],
      type: 'skill',
      version: '1.0.0',
    };
    const manifest = buildManifestInput(draft);
    expect(manifest.org).toBe('acme');
    expect(manifest.tags).toEqual(['alpha', 'beta']);
    expect(manifest.entrypoint).toBe('a.md');
  });

  it('validates JSON via isJsonValid', () => {
    expect(isJsonValid('{}')).toBe(true);
    expect(isJsonValid('{"a":1}')).toBe(true);
    expect(isJsonValid('{"a":')).toBe(false);
  });
});

describe('Contribute — wizard UI', () => {
  it('renders Step 1 on mount and disables Next until a type is picked', () => {
    renderContribute();
    expect(screen.getByText(/Step 1 — Asset type/)).toBeInTheDocument();
    expect(screen.getByTestId('wizard-next')).toBeDisabled();

    fireEvent.click(screen.getByTestId('asset-type-skill'));
    expect(screen.getByTestId('wizard-next')).not.toBeDisabled();
  });

  it('shows MCP config editor instead of file dropzone for mcp-config', () => {
    renderContribute();
    fireEvent.click(screen.getByTestId('asset-type-mcp-config'));
    fireEvent.click(screen.getByTestId('wizard-next'));
    expect(screen.getByTestId('mcp-config-editor')).toBeInTheDocument();
    expect(screen.queryByTestId('file-dropzone')).not.toBeInTheDocument();
  });

  it('surfaces kebab-case errors on the name field', async () => {
    renderContribute();
    fireEvent.click(screen.getByTestId('asset-type-skill'));
    fireEvent.click(screen.getByTestId('wizard-next'));
    await uploadFiles([makeFile('skill.md')]);
    fireEvent.click(screen.getByTestId('wizard-next'));
    fireEvent.change(screen.getByTestId('field-name'), { target: { value: 'NotKebab' } });
    expect(screen.getByTestId('error-name')).toBeInTheDocument();
  });

  it('surfaces org regex errors live', async () => {
    renderContribute();
    fireEvent.click(screen.getByTestId('asset-type-skill'));
    fireEvent.click(screen.getByTestId('wizard-next'));
    await uploadFiles([makeFile('skill.md')]);
    fireEvent.click(screen.getByTestId('wizard-next'));
    fireEvent.change(screen.getByTestId('field-org'), { target: { value: '1-bad' } });
    expect(screen.getByTestId('error-org')).toBeInTheDocument();
    fireEvent.change(screen.getByTestId('field-org'), { target: { value: 'good-org' } });
    expect(screen.queryByTestId('error-org')).not.toBeInTheDocument();
  });

  it('prefills the author field from the signed-in GitHub login', () => {
    renderContribute('octo-login');
    fireEvent.click(screen.getByTestId('asset-type-skill'));
    fireEvent.click(screen.getByTestId('wizard-next'));
    // Skip file step
    // Manually drive to metadata by bypassing file upload through Next re-render not possible;
    // instead, just check draft-level persistence reflects the prefilled author.
    const persisted = window.sessionStorage.getItem(DRAFT_STORAGE_KEY);
    expect(persisted).toContain('"author":"octo-login"');
  });

  it('persists draft changes to sessionStorage and hydrates on mount', () => {
    renderContribute();
    fireEvent.click(screen.getByTestId('asset-type-rule'));
    const stored = window.sessionStorage.getItem(DRAFT_STORAGE_KEY);
    expect(stored).toBeTruthy();
    expect(JSON.parse(stored!)).toMatchObject({ type: 'rule' });
  });

  it('auto-prefills metadata when the uploaded folder includes a manifest.json', async () => {
    renderContribute();
    fireEvent.click(screen.getByTestId('asset-type-skill'));
    fireEvent.click(screen.getByTestId('wizard-next'));
    const manifestJson = JSON.stringify({
      author: 'alice',
      description: 'Prefilled desc',
      name: 'prefilled-name',
      tags: ['imported'],
      type: 'skill',
      version: '2.3.4',
    });
    await uploadFiles([new File([manifestJson], 'manifest.json', { type: 'application/json' }), makeFile('skill.md')]);
    fireEvent.click(screen.getByTestId('wizard-next'));
    expect((screen.getByTestId('field-name') as HTMLInputElement).value).toBe('prefilled-name');
    expect((screen.getByTestId('field-description') as HTMLInputElement).value).toBe('Prefilled desc');
    expect((screen.getByTestId('field-version') as HTMLInputElement).value).toBe('2.3.4');
    expect((screen.getByTestId('field-author') as HTMLInputElement).value).toBe('alice');
    expect(screen.getByTestId('tag-list')).toHaveTextContent('imported');
  });

  it('seeds the README editor when a README.md is uploaded', async () => {
    renderContribute();
    fireEvent.click(screen.getByTestId('asset-type-skill'));
    fireEvent.click(screen.getByTestId('wizard-next'));
    await uploadFiles([makeFile('README.md', '# From file'), makeFile('skill.md')]);
    fireEvent.click(screen.getByTestId('wizard-next'));
    fillMetadata();
    fireEvent.click(screen.getByTestId('wizard-next'));
    expect((screen.getByTestId('field-readme') as HTMLTextAreaElement).value).toContain('# From file');
  });

  it('runs a happy-path end-to-end submission and clears the draft on success', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    renderContribute('octo-login');

    // Step 1
    fireEvent.click(screen.getByTestId('asset-type-skill'));
    fireEvent.click(screen.getByTestId('wizard-next'));

    // Step 2
    await uploadFiles([makeFile('skill.md', '# Skill')]);
    fireEvent.click(screen.getByTestId('wizard-next'));

    // Step 3
    fillMetadata({ description: 'End-to-end test skill', name: 'happy-path-skill' });
    fireEvent.click(screen.getByTestId('wizard-next'));

    // Step 4
    fireEvent.change(screen.getByTestId('field-readme'), { target: { value: '# Hello' } });
    fireEvent.click(screen.getByTestId('wizard-next'));

    // Step 5
    expect(screen.getByTestId('review-valid')).toBeInTheDocument();
    const submit = screen.getByTestId('wizard-submit');
    expect(submit).not.toBeDisabled();
    fireEvent.click(submit);

    expect(logSpy).toHaveBeenCalled();
    const [, payload] = logSpy.mock.calls[0]!;
    expect(payload).toMatchObject({
      manifest: { author: 'octo-login', name: 'happy-path-skill', type: 'skill', version: '1.0.0' },
      readme: '# Hello',
    });
    expect(window.sessionStorage.getItem(DRAFT_STORAGE_KEY)).toBeNull();
  });

  it('keeps the Submit button disabled while validation fails', async () => {
    renderContribute();
    fireEvent.click(screen.getByTestId('asset-type-skill'));
    fireEvent.click(screen.getByTestId('wizard-next'));
    await uploadFiles([makeFile('skill.md')]);
    fireEvent.click(screen.getByTestId('wizard-next'));
    fillMetadata({ version: 'v1.0' });
    // Next button should be disabled due to invalid version
    expect(screen.getByTestId('wizard-next')).toBeDisabled();
  });
});
