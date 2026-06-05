import type { Octokit } from '@octokit/rest';
import type { UseQueryResult } from '@tanstack/react-query';

import { Toast } from '@base-ui-components/react/toast';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { type ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Registry } from '@/lib/schemas';

import { Toaster } from '@/components/Toaster';
import * as publishServiceModule from '@/lib/publish-service';
import {
  assetKey,
  buildBundleInput,
  type BundleDraftState,
  computeBundleVersionConflict,
  CreateBundleRoute,
  createInitialBundleDraft,
  validateBundleDraft,
} from '@/routes/CreateBundle';

import { loadFixtureRegistry } from '../fixtures';
import { makeSessionValue, SessionHarness, stubOctokit } from '../utils/session-harness';

const useRegistryMock = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/useRegistry', () => ({ useRegistry: useRegistryMock }));

function renderCreateBundle(octokit: null | Octokit = stubOctokit(async () => ({ data: '' }))) {
  const session = makeSessionValue({
    octokit,
    status: 'member',
    user: { avatarUrl: null, login: 'test-user', name: null },
  });
  return render(
    <MemoryRouter initialEntries={['/bundles/new']}>
      <SessionHarness session={session}>
        <ToastProviderStub>
          <CreateBundleRoute />
        </ToastProviderStub>
      </SessionHarness>
    </MemoryRouter>,
  );
}

function setRegistry(data: Registry | undefined, extra: Partial<UseQueryResult<Registry, Error>> = {}) {
  useRegistryMock.mockReturnValue({
    data,
    error: null,
    isError: false,
    isLoading: false,
    isSuccess: Boolean(data),
    ...extra,
  } as UseQueryResult<Registry, Error>);
}

function ToastProviderStub({ children }: { children: ReactNode }) {
  return (
    <Toast.Provider>
      {children}
      <Toaster />
    </Toast.Provider>
  );
}

beforeEach(() => {
  window.sessionStorage.clear();
  setRegistry(loadFixtureRegistry());
});

afterEach(() => {
  window.sessionStorage.clear();
  vi.restoreAllMocks();
  useRegistryMock.mockReset();
});

describe('CreateBundle — helpers', () => {
  it('builds a bundle input that omits version for latest members and keeps pins', () => {
    const draft: BundleDraftState = {
      ...createInitialBundleDraft('jason'),
      assets: [
        { name: 'clarification-agent', type: 'agent' },
        { name: 'validate', org: 'agentic-toolkit', type: 'agent', version: '1.1.0' },
      ],
      description: 'd',
      name: 'my-bundle',
      tags: ['workflow'],
    };
    const input = buildBundleInput(draft) as {
      assets: Array<{ name: string; org?: string; version?: string }>;
      tags?: string[];
    };
    expect(input.assets[0]).toEqual({ name: 'clarification-agent', type: 'agent' });
    expect(input.assets[1]).toEqual({ name: 'validate', org: 'agentic-toolkit', type: 'agent', version: '1.1.0' });
    expect(input.tags).toEqual(['workflow']);
  });

  it('validates a well-formed bundle draft and rejects one with no assets', () => {
    const base: BundleDraftState = {
      ...createInitialBundleDraft('jason'),
      assets: [{ name: 'clarification-agent', type: 'agent' }],
      description: 'A bundle',
      name: 'my-bundle',
    };
    expect(validateBundleDraft(base).success).toBe(true);
    expect(validateBundleDraft({ ...base, assets: [] }).success).toBe(false);
  });

  it('flags a version conflict against an existing bundle and an update for a newer version', () => {
    const registry = loadFixtureRegistry();
    const draft = { ...createInitialBundleDraft('jason'), name: 'feature-workflow', version: '1.0.0' };
    expect(computeBundleVersionConflict(draft, registry).status).toBe('conflict');
    expect(computeBundleVersionConflict({ ...draft, version: '1.1.0' }, registry).status).toBe('update');
    expect(computeBundleVersionConflict({ ...draft, name: 'brand-new' }, registry).status).toBe('none');
  });

  it('derives a stable composite key from a member ref', () => {
    expect(assetKey({ name: 'a', type: 'skill' })).toBe('skill::a');
    expect(assetKey({ name: 'a', org: 'o', type: 'skill' })).toBe('skill:o:a');
  });
});

describe('CreateBundle — wizard flow', () => {
  it('walks metadata → assets → review and submits a bundle via publishBundle', async () => {
    const publishSpy = vi
      .spyOn(publishServiceModule, 'publishBundle')
      .mockResolvedValue({ branchName: 'bundle/my-bundle/1.0.0', dryRun: false, prUrl: 'https://x/pull/1' });

    renderCreateBundle();

    // Step 1 — metadata
    fireEvent.change(screen.getByTestId('field-name'), { target: { value: 'my-bundle' } });
    fireEvent.change(screen.getByTestId('field-description'), { target: { value: 'A useful bundle' } });
    fireEvent.click(screen.getByTestId('wizard-next'));

    // Step 2 — assets: add a member from the registry
    fireEvent.click(screen.getByTestId('add-asset-clarification-agent'));
    expect(screen.getByTestId('bundle-asset-clarification-agent')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('wizard-next'));

    // Step 3 — setup (optional) → continue
    fireEvent.click(screen.getByTestId('wizard-next'));

    // Step 4 — review & submit
    expect(screen.getByTestId('review-valid')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('wizard-submit'));

    await waitFor(() => expect(publishSpy).toHaveBeenCalledTimes(1));
    const arg = publishSpy.mock.calls[0]![0];
    expect(arg.bundle.name).toBe('my-bundle');
    expect(arg.bundle.assets).toEqual([{ name: 'clarification-agent', type: 'agent' }]);
  });

  it('blocks proceeding past the assets step until at least one asset is selected', () => {
    renderCreateBundle();
    fireEvent.change(screen.getByTestId('field-name'), { target: { value: 'my-bundle' } });
    fireEvent.change(screen.getByTestId('field-description'), { target: { value: 'desc' } });
    fireEvent.click(screen.getByTestId('wizard-next'));

    // On the assets step with nothing selected, Next is disabled.
    expect(screen.getByTestId('bundle-assets-empty')).toBeInTheDocument();
    expect(screen.getByTestId('wizard-next')).toBeDisabled();
  });
});
