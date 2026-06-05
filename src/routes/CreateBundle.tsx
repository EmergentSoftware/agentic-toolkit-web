import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { compare as semverCompare, rsort as semverRsort, valid as semverValid } from 'semver';
import { z } from 'zod';

import { useWideLayout } from '@/components/layout/LayoutWidthContext';
import { LoadingIndicator } from '@/components/LoadingIndicator';
import { MarkdownRenderer } from '@/components/MarkdownRenderer';
import { PageHeader } from '@/components/PageHeader';
import { SectionHeader } from '@/components/SectionHeader';
import { Stepper, type StepperStep } from '@/components/Stepper';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useRegistry } from '@/hooks/useRegistry';
import { useSession } from '@/hooks/useSession';
import { useToast } from '@/hooks/useToast';
import { PublishError } from '@/lib/publish-errors';
import { publishBundle, type PublishProgressEvent } from '@/lib/publish-service';
import { findExistingBundle } from '@/lib/registry-client';
import { type Bundle, BundleSchema } from '@/lib/schemas/bundle';
import { AssetType } from '@/lib/schemas/manifest';
import { type Registry, type RegistryAsset } from '@/lib/schemas/registry';
import { type BumpType, bumpVersion } from '@/lib/version-utils';

export const DRAFT_STORAGE_KEY = 'atk:bundle:draft';

/** A member asset selected for the bundle. `version` omitted means "latest". */
export interface BundleAssetDraft {
  name: string;
  org?: string;
  type: AssetType;
  version?: string;
}

export interface BundleDraftState {
  assets: BundleAssetDraft[];
  author: string;
  description: string;
  name: string;
  setupInstructions: string;
  step: number;
  tags: string[];
  version: string;
  versionConflict: VersionConflictState;
}

/** Navigation state used to seed the builder when editing / versioning an existing bundle. */
export interface CreateBundleSeed {
  assets: BundleAssetDraft[];
  author: string;
  description: string;
  name: string;
  setupInstructions?: string;
  tags?: string[];
  version: string;
}

export interface VersionConflictState {
  latestVersion?: string;
  status: 'conflict' | 'none' | 'update';
}

const STEPS: StepperStep[] = [
  { description: 'Name, version, description, tags', id: 'metadata', title: 'Metadata' },
  { description: 'Pick the assets to bundle', id: 'assets', title: 'Assets' },
  { description: 'Optional post-install notes', id: 'setup', title: 'Setup' },
  { description: 'Validate and submit', id: 'review', title: 'Review' },
];

const KEBAB_CASE_REGEX = /^[a-z][a-z0-9-]*(?<!-)$/;
const MAX_ASSET_RESULTS = 25;

export function createInitialBundleDraft(author = ''): BundleDraftState {
  return {
    assets: [],
    author,
    description: '',
    name: '',
    setupInstructions: '',
    step: 0,
    tags: [],
    version: '1.0.0',
    versionConflict: { status: 'none' },
  };
}

// Persisted to sessionStorage — everything except the transient conflict panel state.
const PersistedDraftSchema = z.object({
  assets: z.array(
    z.object({
      name: z.string(),
      org: z.string().optional(),
      type: AssetType,
      version: z.string().optional(),
    }),
  ),
  author: z.string(),
  description: z.string(),
  name: z.string(),
  setupInstructions: z.string(),
  step: z.number().int().min(0).max(STEPS.length - 1),
  tags: z.array(z.string()),
  version: z.string(),
});

interface StepProps {
  draft: BundleDraftState;
  onChange: <K extends keyof BundleDraftState>(key: K, value: BundleDraftState[K]) => void;
}

export function assetKey(ref: { name: string; org?: string; type: string }): string {
  return `${ref.type}:${ref.org ?? ''}:${ref.name}`;
}

export function buildBundleInput(draft: BundleDraftState): Record<string, unknown> {
  const bundle: Record<string, unknown> = {
    assets: draft.assets.map((a) => ({
      name: a.name,
      type: a.type,
      ...(a.org ? { org: a.org } : {}),
      ...(a.version ? { version: a.version } : {}),
    })),
    author: draft.author,
    description: draft.description,
    name: draft.name,
    version: draft.version,
  };
  if (draft.tags.length > 0) bundle.tags = draft.tags;
  if (draft.setupInstructions.trim().length > 0) bundle.setupInstructions = draft.setupInstructions;
  return bundle;
}

export function clearBundleDraftFromStorage(): void {
  window.sessionStorage.removeItem(DRAFT_STORAGE_KEY);
}

export function computeBundleVersionConflict(
  draft: BundleDraftState,
  registry: null | Registry,
): VersionConflictState {
  if (!registry) return { status: 'none' };
  if (!draft.name || !isValidSemver(draft.version)) return { status: 'none' };
  const found = findExistingBundle(registry, { name: draft.name });
  if (!found) return { status: 'none' };
  const cmp = semverCompare(draft.version, found.latest);
  return cmp > 0
    ? { latestVersion: found.latest, status: 'update' }
    : { latestVersion: found.latest, status: 'conflict' };
}

export function CreateBundleRoute() {
  useWideLayout();
  const { octokit, user } = useSession();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const registryQuery = useRegistry();
  const registry = registryQuery.data ?? null;

  const seed = (location.state ?? null) as CreateBundleSeed | null;
  const defaultAuthor = user?.login ?? '';

  const [draft, setDraft] = useState<BundleDraftState>(() => createInitialBundleDraft(defaultAuthor));
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState<null | PublishProgressEvent>(null);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const hydratedRef = useRef(false);
  const skipNextPersistRef = useRef(false);

  const dryRun = useMemo(() => {
    const search = location.search || window.location.hash.split('?')[1] || '';
    if (!search) return false;
    const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
    return params.get('dryRun') === '1';
  }, [location.search]);

  // Hydrate once: an explicit edit/version seed wins over any persisted draft.
  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    if (seed) {
      setDraft((prev) => ({
        ...prev,
        assets: seed.assets,
        author: seed.author || defaultAuthor,
        description: seed.description,
        name: seed.name,
        setupInstructions: seed.setupInstructions ?? '',
        tags: seed.tags ?? [],
        version: seed.version,
      }));
      return;
    }
    const persisted = loadBundleDraftFromStorage();
    if (persisted) {
      setDraft((prev) => ({ ...prev, ...persisted, author: persisted.author || defaultAuthor }));
    } else if (defaultAuthor) {
      setDraft((prev) => (prev.author ? prev : { ...prev, author: defaultAuthor }));
    }
  }, [defaultAuthor, seed]);

  useEffect(() => {
    if (!hydratedRef.current) return;
    if (skipNextPersistRef.current) {
      skipNextPersistRef.current = false;
      return;
    }
    persistBundleDraft(draft);
  }, [draft]);

  useEffect(() => {
    setDraft((prev) => {
      const next = computeBundleVersionConflict(prev, registry);
      const current = prev.versionConflict;
      if (current.status === next.status && current.latestVersion === next.latestVersion) {
        return prev;
      }
      return { ...prev, versionConflict: next };
    });
  }, [registry, draft.name, draft.version]);

  const update = <K extends keyof BundleDraftState>(key: K, value: BundleDraftState[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  const stepValid = useMemo(() => getStepValidity(draft), [draft]);
  const validation = useMemo(() => validateBundleDraft(draft), [draft]);

  const goTo = (index: number) => {
    if (index < 0 || index >= STEPS.length) return;
    update('step', index);
  };
  const next = () => goTo(draft.step + 1);
  const back = () => goTo(draft.step - 1);

  const resetDraft = () => {
    clearBundleDraftFromStorage();
    skipNextPersistRef.current = true;
    setDraft(createInitialBundleDraft(defaultAuthor));
    toast.add({
      description: 'The bundle builder has been reset.',
      priority: 'high',
      title: 'Draft cleared',
    });
  };

  const onSubmit = async () => {
    const result = validateBundleDraft(draft);
    if (!result.success) return;
    if (submitting) return;
    if (!octokit || !user) {
      toast.add({
        description: 'You need to be signed in to publish a bundle.',
        priority: 'high',
        title: 'Not signed in',
      });
      return;
    }

    setSubmitting(true);
    setProgress({ message: 'Preparing your workspace', step: 'preparing-workspace' });

    try {
      const publishResult = await publishBundle({
        bundle: result.data,
        dryRun,
        octokit,
        onProgress: (event) => setProgress(event),
        readme: '',
      });
      skipNextPersistRef.current = true;
      clearBundleDraftFromStorage();
      setDraft(createInitialBundleDraft(defaultAuthor));
      navigate('/bundles/new/success', {
        replace: true,
        state: {
          branchName: publishResult.branchName,
          dryRun: publishResult.dryRun,
          prUrl: publishResult.prUrl,
        },
      });
    } catch (error) {
      const message =
        error instanceof PublishError
          ? error.userMessage
          : error instanceof Error
            ? error.message
            : 'An unexpected error occurred while publishing.';
      toast.add({ description: message, priority: 'high', title: 'Submission failed' });
    } finally {
      setSubmitting(false);
      setProgress(null);
    }
  };

  return (
    <>
      <PageHeader
        description='Group already-published assets into an installable bundle and open a pull request against the registry.'
        title='Create bundle'
      />
      <Stepper
        className='pb-6'
        currentStep={draft.step}
        onStepSelect={goTo}
        stepCanBeVisited={(i) => i <= draft.step || stepValid.highestReachable >= i}
        steps={STEPS}
      />
      <section aria-labelledby='create-bundle-step-heading' className='space-y-6'>
        {draft.step === 0 && <StepMetadata draft={draft} onChange={update} />}
        {draft.step === 1 && (
          <StepAssets
            draft={draft}
            isLoading={registryQuery.isLoading}
            onChange={update}
            registry={registry}
          />
        )}
        {draft.step === 2 && <StepSetup draft={draft} onChange={update} />}
        {draft.step === 3 && <StepReview draft={draft} validation={validation} />}
        {submitting && progress ? (
          <div
            aria-live='polite'
            className='rounded-md border border-border bg-card p-4'
            data-testid='publish-progress'
            role='status'
          >
            <LoadingIndicator label={progress.message} />
            {dryRun ? (
              <p className='pt-1 text-xs text-muted-foreground' data-testid='publish-progress-dry-run'>
                Dry run mode — no pull request will be created.
              </p>
            ) : null}
          </div>
        ) : null}
        <WizardNav
          canProceed={stepValid.canProceedFrom[draft.step]}
          canSubmit={validation.success && !submitting}
          isLast={draft.step === STEPS.length - 1}
          onBack={back}
          onNext={next}
          onReset={() => setResetDialogOpen(true)}
          onSubmit={() => {
            void onSubmit();
          }}
          step={draft.step}
          submitting={submitting}
        />
      </section>
      <ConfirmDialog
        cancelLabel='Cancel'
        confirmLabel='Start over'
        description='All entered bundle data — metadata, selected assets, and setup notes — will be lost. This cannot be undone.'
        onConfirm={resetDraft}
        onOpenChange={setResetDialogOpen}
        open={resetDialogOpen}
        testId='reset-confirm'
        title='Discard bundle draft?'
      />
    </>
  );
}

export function isValidSemver(value: string): boolean {
  if (!value) return false;
  if (value.startsWith('v')) return false;
  return semverValid(value) !== null;
}

export function loadBundleDraftFromStorage(): null | Partial<BundleDraftState> {
  try {
    const raw = window.sessionStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = PersistedDraftSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function persistBundleDraft(draft: BundleDraftState): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { versionConflict, ...persisted } = draft;
    window.sessionStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(persisted));
  } catch {
    // Best-effort — ignore quota errors.
  }
}

export function validateBundleDraft(draft: BundleDraftState): z.ZodSafeParseResult<Bundle> {
  return BundleSchema.safeParse(buildBundleInput(draft));
}

function getStepValidity(draft: BundleDraftState): { canProceedFrom: boolean[]; highestReachable: number } {
  const s0 =
    KEBAB_CASE_REGEX.test(draft.name) &&
    draft.description.trim().length > 0 &&
    isValidSemver(draft.version) &&
    draft.author.trim().length > 0 &&
    draft.versionConflict.status !== 'conflict';
  const s1 = draft.assets.length > 0;
  const s2 = true;
  const canProceedFrom = [s0, s0 && s1, s0 && s1 && s2, false];
  let highest = 0;
  for (let i = 0; i < canProceedFrom.length; i++) {
    if (canProceedFrom[i]) highest = i + 1;
    else break;
  }
  return { canProceedFrom, highestReachable: Math.min(highest, STEPS.length - 1) };
}

function StepAssets({
  draft,
  isLoading,
  onChange,
  registry,
}: StepProps & { isLoading: boolean; registry: null | Registry }) {
  const [query, setQuery] = useState('');

  const selectedKeys = useMemo(() => new Set(draft.assets.map(assetKey)), [draft.assets]);

  const results = useMemo<RegistryAsset[]>(() => {
    if (!registry) return [];
    const q = query.trim().toLowerCase();
    const matches = registry.assets.filter((asset) => {
      if (selectedKeys.has(assetKey({ name: asset.name, org: asset.org, type: asset.type }))) return false;
      if (!q) return true;
      return asset.name.toLowerCase().includes(q) || asset.tags.some((t) => t.toLowerCase().includes(q));
    });
    matches.sort((a, b) => a.name.localeCompare(b.name));
    return matches.slice(0, MAX_ASSET_RESULTS);
  }, [registry, query, selectedKeys]);

  const addAsset = (asset: RegistryAsset) => {
    const member: BundleAssetDraft = {
      name: asset.name,
      ...(asset.org ? { org: asset.org } : {}),
      type: asset.type,
    };
    onChange('assets', [...draft.assets, member]);
  };

  const removeAsset = (key: string) => {
    onChange('assets', draft.assets.filter((a) => assetKey(a) !== key));
  };

  const setMemberVersion = (key: string, version: string | undefined) => {
    onChange(
      'assets',
      draft.assets.map((a) => (assetKey(a) === key ? { ...a, version } : a)),
    );
  };

  const versionsFor = (member: BundleAssetDraft): string[] => {
    const match = registry?.assets.find(
      (a) => a.name === member.name && a.type === member.type && (a.org ?? undefined) === member.org,
    );
    if (!match) return [];
    return semverRsort(Object.keys(match.versions));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle id='create-bundle-step-heading'>Step 2 — Assets</CardTitle>
      </CardHeader>
      <CardContent className='space-y-5'>
        <SectionHeader
          description='Search the registry and add the assets this bundle should install. Each defaults to its latest version — pin a specific version if you need reproducibility.'
          title='Select bundle assets'
        />

        <div className='space-y-3' data-testid='bundle-selected-assets'>
          <Label>Selected assets ({draft.assets.length})</Label>
          {draft.assets.length === 0 ? (
            <p className='text-sm text-muted-foreground' data-testid='bundle-assets-empty'>
              No assets added yet. Add at least one to continue.
            </p>
          ) : (
            <ul className='divide-y divide-border rounded-md border border-border'>
              {draft.assets.map((member) => {
                const key = assetKey(member);
                const versions = versionsFor(member);
                return (
                  <li
                    className='flex flex-wrap items-center justify-between gap-3 px-3 py-2'
                    data-testid={`bundle-asset-${member.name}`}
                    key={key}
                  >
                    <div className='flex items-center gap-2'>
                      <Badge variant='secondary'>{member.type}</Badge>
                      <span className='font-medium text-foreground'>{member.name}</span>
                      {member.org ? <Badge variant='outline'>@{member.org}</Badge> : null}
                    </div>
                    <div className='flex items-center gap-2'>
                      <select
                        aria-label={`Version for ${member.name}`}
                        className='h-8 rounded-md border border-input bg-background px-2 text-xs'
                        data-testid={`bundle-asset-version-${member.name}`}
                        onChange={(event) =>
                          setMemberVersion(key, event.target.value === '' ? undefined : event.target.value)
                        }
                        value={member.version ?? ''}
                      >
                        <option value=''>Latest</option>
                        {versions.map((v) => (
                          <option key={v} value={v}>
                            v{v}
                          </option>
                        ))}
                      </select>
                      <Button
                        aria-label={`Remove ${member.name}`}
                        data-testid={`remove-asset-${member.name}`}
                        onClick={() => removeAsset(key)}
                        size='sm'
                        type='button'
                        variant='ghost'
                      >
                        Remove
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className='space-y-2'>
          <Label htmlFor='bundle-asset-search'>Add assets</Label>
          <Input
            autoComplete='off'
            data-testid='bundle-asset-search'
            id='bundle-asset-search'
            onChange={(event) => setQuery(event.target.value)}
            placeholder='Search assets by name or tag…'
            type='search'
            value={query}
          />
          {isLoading ? (
            <LoadingIndicator label='Loading registry…' />
          ) : results.length === 0 ? (
            <p className='text-sm text-muted-foreground' data-testid='bundle-asset-results-empty'>
              {registry ? 'No matching assets.' : 'Registry unavailable.'}
            </p>
          ) : (
            <ul className='divide-y divide-border rounded-md border border-border' data-testid='bundle-asset-results'>
              {results.map((asset) => {
                const key = assetKey({ name: asset.name, org: asset.org, type: asset.type });
                return (
                  <li className='flex items-center justify-between gap-3 px-3 py-2' key={key}>
                    <div className='flex items-center gap-2'>
                      <Badge variant='secondary'>{asset.type}</Badge>
                      <span className='font-medium text-foreground'>{asset.name}</span>
                      {asset.org ? <Badge variant='outline'>@{asset.org}</Badge> : null}
                      <span className='text-xs text-muted-foreground'>v{asset.latest}</span>
                    </div>
                    <Button
                      aria-label={`Add ${asset.name}`}
                      data-testid={`add-asset-${asset.name}`}
                      onClick={() => addAsset(asset)}
                      size='sm'
                      type='button'
                      variant='outline'
                    >
                      Add
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function StepMetadata({ draft, onChange }: StepProps) {
  const [tagDraft, setTagDraft] = useState('');
  const nameValid = !draft.name || KEBAB_CASE_REGEX.test(draft.name);
  const versionValid = draft.version === '' || isValidSemver(draft.version);

  const addTag = () => {
    const cleaned = tagDraft.trim();
    if (!cleaned) return;
    if (draft.tags.includes(cleaned)) {
      setTagDraft('');
      return;
    }
    onChange('tags', [...draft.tags, cleaned]);
    setTagDraft('');
  };
  const removeTag = (tag: string) => onChange('tags', draft.tags.filter((t) => t !== tag));

  return (
    <Card>
      <CardHeader>
        <CardTitle id='create-bundle-step-heading'>Step 1 — Metadata</CardTitle>
      </CardHeader>
      <CardContent className='space-y-5'>
        <VersionConflictPanel
          onBump={(type) => {
            const latest = draft.versionConflict.latestVersion;
            if (!latest) return;
            onChange('version', bumpVersion(latest, type));
          }}
          state={draft.versionConflict}
          userVersion={draft.version}
        />
        <div className='grid gap-4 sm:grid-cols-2'>
          <div className='space-y-1.5'>
            <Label htmlFor='bundle-name'>Name</Label>
            <Input
              aria-invalid={!nameValid}
              data-testid='field-name'
              id='bundle-name'
              onChange={(event) => onChange('name', event.target.value)}
              placeholder='my-bundle-name'
              value={draft.name}
            />
            <div aria-live='polite' role='status'>
              {!nameValid ? (
                <p className='text-xs text-destructive' data-testid='error-name'>
                  Name must be kebab-case: lowercase letters, digits, and hyphens only.
                </p>
              ) : (
                <p className='text-xs text-muted-foreground'>Kebab-case identifier (lowercase, hyphens).</p>
              )}
            </div>
          </div>
          <div className='space-y-1.5'>
            <Label htmlFor='bundle-version'>Version</Label>
            <Input
              aria-invalid={!versionValid}
              data-testid='field-version'
              id='bundle-version'
              onChange={(event) => onChange('version', event.target.value)}
              placeholder='1.0.0'
              value={draft.version}
            />
            <div aria-live='polite' role='status'>
              {!versionValid ? (
                <p className='text-xs text-destructive' data-testid='error-version'>
                  Version must be valid semver (e.g., 1.0.0) without a &ldquo;v&rdquo; prefix.
                </p>
              ) : (
                <p className='text-xs text-muted-foreground'>Semver string without a &ldquo;v&rdquo; prefix.</p>
              )}
            </div>
          </div>
        </div>
        <div className='space-y-1.5'>
          <Label htmlFor='bundle-description'>Short description</Label>
          <Textarea
            data-testid='field-description'
            id='bundle-description'
            onChange={(event) => onChange('description', event.target.value)}
            placeholder='Short summary of what this bundle provides'
            value={draft.description}
          />
        </div>
        <div className='space-y-1.5'>
          <Label htmlFor='bundle-author'>Author</Label>
          <Input
            data-testid='field-author'
            id='bundle-author'
            onChange={(event) => onChange('author', event.target.value)}
            placeholder='GitHub login'
            value={draft.author}
          />
          <p className='text-xs text-muted-foreground'>Pre-filled from your GitHub session; edit if needed.</p>
        </div>
        <div className='space-y-1.5'>
          <Label htmlFor='bundle-tag-input'>Tags</Label>
          <div className='flex gap-2'>
            <Input
              data-testid='field-tag-input'
              id='bundle-tag-input'
              onChange={(event) => setTagDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  addTag();
                }
              }}
              placeholder='Type a tag and press Enter'
              value={tagDraft}
            />
            <Button data-testid='add-tag' onClick={addTag} type='button' variant='outline'>
              Add
            </Button>
          </div>
          {draft.tags.length > 0 ? (
            <div className='flex flex-wrap gap-1.5 pt-1' data-testid='tag-list'>
              {draft.tags.map((tag) => (
                <Badge className='gap-1' key={tag} variant='secondary'>
                  {tag}
                  <button
                    aria-label={`Remove tag ${tag}`}
                    className='ml-1 rounded-sm px-1 text-xs hover:bg-accent hover:text-accent-foreground'
                    data-testid={`remove-tag-${tag}`}
                    onClick={() => removeTag(tag)}
                    type='button'
                  >
                    ×
                  </button>
                </Badge>
              ))}
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function StepReview({
  draft,
  validation,
}: {
  draft: BundleDraftState;
  validation: z.ZodSafeParseResult<Bundle>;
}) {
  const bundleInput = buildBundleInput(draft);
  return (
    <Card>
      <CardHeader>
        <CardTitle id='create-bundle-step-heading'>Step 4 — Review &amp; submit</CardTitle>
      </CardHeader>
      <CardContent className='space-y-5'>
        <SectionHeader
          description='Verify the generated bundle.json and asset list before submitting.'
          title='Review your bundle'
        />
        {draft.versionConflict.status === 'update' && draft.versionConflict.latestVersion ? (
          <div data-testid='review-update-badge'>
            <Badge variant='secondary'>
              Updating v{draft.versionConflict.latestVersion} → v{draft.version}
            </Badge>
          </div>
        ) : null}
        <div>
          <h3 className='pb-2 text-sm font-semibold'>bundle.json</h3>
          <pre
            className='overflow-x-auto rounded-md border border-border bg-muted p-4 font-mono text-xs'
            data-testid='review-bundle'
          >
            {JSON.stringify(bundleInput, null, 2)}
          </pre>
        </div>
        <div aria-live='polite' role='status'>
          {validation.success ? (
            <p className='text-sm text-foreground' data-testid='review-valid'>
              Bundle passes schema validation. You can submit now.
            </p>
          ) : (
            <div data-testid='review-invalid'>
              <p className='pb-1 text-sm text-destructive'>Fix the following issues before submitting:</p>
              <ul className='list-disc pl-5 text-sm text-destructive'>
                {validation.error.issues.map((issue, i) => (
                  <li key={`${issue.path.join('.')}-${i}`}>
                    <span className='font-mono text-xs'>{issue.path.join('.') || '(root)'}:</span> {issue.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function StepSetup({ draft, onChange }: StepProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle id='create-bundle-step-heading'>Step 3 — Setup instructions</CardTitle>
      </CardHeader>
      <CardContent className='space-y-3'>
        <SectionHeader
          description='Optional post-install notes shown on the bundle page. Markdown supported, with a live preview.'
          title='Setup instructions'
        />
        <div className='grid gap-4 lg:grid-cols-2'>
          <div className='space-y-1.5'>
            <Label htmlFor='bundle-setup'>Markdown source</Label>
            <Textarea
              className='min-h-[320px] font-mono text-xs'
              data-testid='field-setup'
              id='bundle-setup'
              onChange={(event) => onChange('setupInstructions', event.target.value)}
              placeholder='## Setup&#10;&#10;Run `atk sync` after install...'
              value={draft.setupInstructions}
            />
          </div>
          <div className='space-y-1.5'>
            <Label>Preview</Label>
            <div
              aria-label='Setup instructions preview'
              className='min-h-[320px] overflow-auto rounded-md border border-border bg-card p-4'
              data-testid='setup-preview'
            >
              {draft.setupInstructions.trim() ? (
                <MarkdownRenderer content={draft.setupInstructions} />
              ) : (
                <p className='text-sm text-muted-foreground'>Preview will appear here once you start typing.</p>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function VersionConflictPanel({
  onBump,
  state,
  userVersion,
}: {
  onBump: (type: BumpType) => void;
  state: VersionConflictState;
  userVersion: string;
}) {
  if (state.status === 'none' || !state.latestVersion) return null;
  const latest = state.latestVersion;
  if (state.status === 'update') {
    return (
      <div aria-live='polite' data-testid='version-update-badge' role='status'>
        <Badge variant='secondary'>
          New version v{latest} → v{userVersion}
        </Badge>
      </div>
    );
  }
  const safeBump = (type: BumpType): null | string => {
    try {
      return bumpVersion(latest, type);
    } catch {
      return null;
    }
  };
  const patchPreview = safeBump('patch');
  const minorPreview = safeBump('minor');
  const majorPreview = safeBump('major');
  return (
    <div
      aria-live='polite'
      className='rounded-md border border-destructive/50 bg-destructive/5 p-4'
      data-testid='version-conflict-panel'
      role='status'
    >
      <p className='pb-1 text-sm font-semibold text-destructive' data-testid='version-conflict-message'>
        Version {userVersion} is not newer than the published v{latest}.
      </p>
      <p className='pb-3 text-xs text-muted-foreground'>
        Bump the version to publish a new bundle version. The registry already has v{latest}.
      </p>
      <div className='flex flex-wrap gap-2'>
        {patchPreview ? (
          <Button data-testid='bump-patch' onClick={() => onBump('patch')} size='sm' type='button' variant='outline'>
            Patch → v{patchPreview}
          </Button>
        ) : null}
        {minorPreview ? (
          <Button data-testid='bump-minor' onClick={() => onBump('minor')} size='sm' type='button' variant='outline'>
            Minor → v{minorPreview}
          </Button>
        ) : null}
        {majorPreview ? (
          <Button data-testid='bump-major' onClick={() => onBump('major')} size='sm' type='button' variant='outline'>
            Major → v{majorPreview}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function WizardNav({
  canProceed,
  canSubmit,
  isLast,
  onBack,
  onNext,
  onReset,
  onSubmit,
  step,
  submitting,
}: {
  canProceed: boolean;
  canSubmit: boolean;
  isLast: boolean;
  onBack: () => void;
  onNext: () => void;
  onReset: () => void;
  onSubmit: () => void;
  step: number;
  submitting?: boolean;
}) {
  return (
    <div className='flex items-center justify-between gap-2 pt-2'>
      <Button data-testid='wizard-back' disabled={step === 0 || submitting} onClick={onBack} type='button' variant='outline'>
        Back
      </Button>
      <div className='flex items-center gap-2'>
        <Button
          className='text-destructive hover:bg-destructive/10 hover:text-destructive'
          data-testid='wizard-reset'
          disabled={submitting}
          onClick={onReset}
          type='button'
          variant='ghost'
        >
          Start over
        </Button>
        {isLast ? (
          <Button data-testid='wizard-submit' disabled={!canSubmit} onClick={onSubmit} type='button'>
            {submitting ? 'Submitting…' : 'Submit bundle'}
          </Button>
        ) : (
          <Button data-testid='wizard-next' disabled={!canProceed} onClick={onNext} type='button'>
            Next
          </Button>
        )}
      </div>
    </div>
  );
}

export default CreateBundleRoute;
