import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { valid as semverValid } from 'semver';
import { z } from 'zod';

import { LoadingIndicator } from '@/components/LoadingIndicator';
import { MarkdownRenderer } from '@/components/MarkdownRenderer';
import { PageHeader } from '@/components/PageHeader';
import { SectionHeader } from '@/components/SectionHeader';
import { Stepper, type StepperStep } from '@/components/Stepper';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useSession } from '@/hooks/useSession';
import { useToast } from '@/hooks/useToast';
import { PublishError } from '@/lib/publish-errors';
import { publishContribution, type PublishProgressEvent } from '@/lib/publish-service';
import { AssetType, type Manifest, ManifestSchema } from '@/lib/schemas/manifest';

export const DRAFT_STORAGE_KEY = 'atk:contribute:draft';

export interface DraftState {
  author: string;
  description: string;
  files: FileEntry[];
  mcpConfig: string;
  name: string;
  org: string;
  readme: string;
  step: number;
  tags: string[];
  type: '' | AssetType;
  version: string;
}

export interface FileEntry {
  content: string;
  path: string;
  size: number;
}

const ASSET_TYPES: AssetType[] = ['skill', 'agent', 'rule', 'hook', 'memory-template', 'mcp-config'];

const STEPS: StepperStep[] = [
  { description: 'Choose what you are contributing', id: 'type', title: 'Asset type' },
  { description: 'Upload files or JSON config', id: 'files', title: 'Files' },
  { description: 'Name, description, tags', id: 'metadata', title: 'Metadata' },
  { description: 'Write or edit the README', id: 'readme', title: 'README' },
  { description: 'Validate and submit', id: 'review', title: 'Review' },
];

const KEBAB_CASE_REGEX = /^[a-z][a-z0-9-]*(?<!-)$/;
const ORG_REGEX = /^[a-zA-Z][a-zA-Z0-9-]*$/;

export function createInitialDraft(author = ''): DraftState {
  return {
    author,
    description: '',
    files: [],
    mcpConfig: '',
    name: '',
    org: '',
    readme: '',
    step: 0,
    tags: [],
    type: '',
    version: '1.0.0',
  };
}

// Schema for what we persist to sessionStorage — files are ephemeral.
const PersistedDraftSchema = z.object({
  author: z.string(),
  description: z.string(),
  mcpConfig: z.string(),
  name: z.string(),
  org: z.string(),
  readme: z.string(),
  step: z.number().int().min(0).max(STEPS.length - 1),
  tags: z.array(z.string()),
  type: z.union([z.literal(''), AssetType]),
  version: z.string(),
});

interface StepProps {
  draft: DraftState;
  onChange: <K extends keyof DraftState>(key: K, value: DraftState[K]) => void;
}

interface StepReviewProps {
  draft: DraftState;
  validation: z.ZodSafeParseResult<Manifest>;
}

interface StepValidity {
  canProceedFrom: boolean[];
  highestReachable: number;
}

interface WizardNavProps {
  canProceed: boolean;
  canSubmit: boolean;
  isLast: boolean;
  onBack: () => void;
  onNext: () => void;
  onSubmit: () => void;
  step: number;
  submitting?: boolean;
}

export function buildManifestInput(draft: DraftState): Record<string, unknown> {
  const manifest: Record<string, unknown> = {
    author: draft.author,
    description: draft.description,
    name: draft.name,
    type: draft.type || undefined,
    version: draft.version,
  };
  if (draft.tags.length > 0) manifest.tags = draft.tags;
  if (draft.org) manifest.org = draft.org;
  if (draft.type !== 'mcp-config') {
    const entrypoint = pickEntrypoint(draft);
    if (entrypoint) manifest.entrypoint = entrypoint;
    const additional = draft.files.filter((f) => f.path !== entrypoint).map((f) => f.path);
    if (additional.length > 0) manifest.files = additional;
  }
  return manifest;
}

export function clearDraftFromStorage(): void {
  window.sessionStorage.removeItem(DRAFT_STORAGE_KEY);
}

export function ContributeRoute() {
  const { octokit, user } = useSession();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const defaultAuthor = user?.login ?? '';
  const [draft, setDraft] = useState<DraftState>(() => createInitialDraft(defaultAuthor));
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState<null | PublishProgressEvent>(null);
  const hydratedRef = useRef(false);
  const skipNextPersistRef = useRef(false);

  const dryRun = useMemo(() => {
    const search = location.search || window.location.hash.split('?')[1] || '';
    if (!search) return false;
    const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
    return params.get('dryRun') === '1';
  }, [location.search]);

  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    const persisted = loadDraftFromStorage();
    if (persisted) {
      setDraft((prev) => ({ ...prev, ...persisted, author: persisted.author || defaultAuthor }));
    } else if (defaultAuthor) {
      setDraft((prev) => (prev.author ? prev : { ...prev, author: defaultAuthor }));
    }
  }, [defaultAuthor]);

  useEffect(() => {
    if (!hydratedRef.current) return;
    if (skipNextPersistRef.current) {
      skipNextPersistRef.current = false;
      return;
    }
    persistDraft(draft);
  }, [draft]);

  const update = <K extends keyof DraftState>(key: K, value: DraftState[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  const stepValid = useMemo(() => getStepValidity(draft), [draft]);
  const validation = useMemo(() => validateDraft(draft), [draft]);

  const goTo = (index: number) => {
    if (index < 0 || index >= STEPS.length) return;
    update('step', index);
  };
  const next = () => goTo(draft.step + 1);
  const back = () => goTo(draft.step - 1);

  const onSubmit = async () => {
    const result = validateDraft(draft);
    if (!result.success) return;
    if (submitting) return;
    if (!octokit || !user) {
      toast.add({
        description: 'You need to be signed in to submit a contribution.',
        priority: 'high',
        title: 'Not signed in',
      });
      return;
    }

    setSubmitting(true);
    setProgress({ message: 'Preparing your workspace', step: 'preparing-workspace' });

    try {
      const publishResult = await publishContribution({
        dryRun,
        files: draft.files.map((f) => ({ content: f.content, path: f.path })),
        manifest: result.data,
        octokit,
        onProgress: (event) => setProgress(event),
        readme: draft.readme,
      });
      skipNextPersistRef.current = true;
      clearDraftFromStorage();
      setDraft(createInitialDraft(defaultAuthor));
      navigate('/contribute/success', {
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
      toast.add({
        description: message,
        priority: 'high',
        title: 'Submission failed',
      });
    } finally {
      setSubmitting(false);
      setProgress(null);
    }
  };

  return (
    <>
      <PageHeader
        description='Draft a new asset or bundle and open a pull request against the registry.'
        title='Contribute'
      />
      <Stepper
        className='pb-6'
        currentStep={draft.step}
        onStepSelect={goTo}
        stepCanBeVisited={(i) => i <= draft.step || stepValid.highestReachable >= i}
        steps={STEPS}
      />
      <section aria-labelledby='contribute-step-heading' className='space-y-6'>
        {draft.step === 0 && <StepType draft={draft} onChange={update} />}
        {draft.step === 1 && <StepFiles draft={draft} onChange={update} />}
        {draft.step === 2 && <StepMetadata draft={draft} onChange={update} />}
        {draft.step === 3 && <StepReadme draft={draft} onChange={update} />}
        {draft.step === 4 && <StepReview draft={draft} validation={validation} />}
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
          onSubmit={() => {
            void onSubmit();
          }}
          step={draft.step}
          submitting={submitting}
        />
      </section>
    </>
  );
}

export function isJsonValid(value: string): boolean {
  try {
    JSON.parse(value);
    return true;
  } catch {
    return false;
  }
}

export function isValidSemver(value: string): boolean {
  if (!value) return false;
  if (value.startsWith('v')) return false;
  return semverValid(value) !== null;
}

export function loadDraftFromStorage(): null | Partial<DraftState> {
  try {
    const raw = window.sessionStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = PersistedDraftSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function persistDraft(draft: DraftState): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { files, ...persisted } = draft;
    window.sessionStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(persisted));
  } catch {
    // Ignore quota errors — draft persistence is best-effort.
  }
}

export default ContributeRoute;

export function validateDraft(draft: DraftState): z.ZodSafeParseResult<Manifest> {
  return ManifestSchema.safeParse(buildManifestInput(draft));
}

function basename(path: string): string {
  const i = path.lastIndexOf('/');
  return i === -1 ? path : path.slice(i + 1);
}

function describeType(type: AssetType): string {
  switch (type) {
    case 'agent':
      return 'A specialized agent definition';
    case 'hook':
      return 'A Claude Code hook script';
    case 'mcp-config':
      return 'A Model Context Protocol server configuration (JSON only)';
    case 'memory-template':
      return 'A reusable memory template';
    case 'rule':
      return 'A rule that governs assistant behavior';
    case 'skill':
      return 'A skill bundle (prompt + supporting files)';
    default:
      return '';
  }
}

function extractManifest(files: FileEntry[]): Partial<DraftState> | undefined {
  const manifestFile = files.find((f) => basename(f.path).toLowerCase() === 'manifest.json');
  if (!manifestFile) return undefined;
  try {
    const parsed = JSON.parse(manifestFile.content) as Record<string, unknown>;
    const prefill: Partial<DraftState> = {};
    if (typeof parsed.type === 'string' && (ASSET_TYPES as string[]).includes(parsed.type)) {
      prefill.type = parsed.type as AssetType;
    }
    if (typeof parsed.name === 'string') prefill.name = parsed.name;
    if (typeof parsed.description === 'string') prefill.description = parsed.description;
    if (typeof parsed.author === 'string') prefill.author = parsed.author;
    if (typeof parsed.version === 'string') prefill.version = parsed.version;
    if (typeof parsed.org === 'string') prefill.org = parsed.org;
    if (Array.isArray(parsed.tags)) {
      prefill.tags = parsed.tags.filter((t): t is string => typeof t === 'string');
    }
    return prefill;
  } catch {
    return undefined;
  }
}

function extractReadme(files: FileEntry[]): string | undefined {
  const readme = files.find((f) => basename(f.path).toLowerCase() === 'readme.md');
  return readme?.content;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getStepValidity(draft: DraftState): StepValidity {
  const s0 = draft.type !== '';
  const s1 =
    draft.type === 'mcp-config'
      ? draft.mcpConfig.trim().length > 0 && isJsonValid(draft.mcpConfig)
      : draft.files.length > 0;
  const s2 =
    KEBAB_CASE_REGEX.test(draft.name) &&
    draft.description.trim().length > 0 &&
    (!draft.org || ORG_REGEX.test(draft.org)) &&
    isValidSemver(draft.version) &&
    draft.author.trim().length > 0;
  const s3 = true;
  const canProceedFrom = [s0, s0 && s1, s0 && s1 && s2, s0 && s1 && s2 && s3, false];
  let highest = 0;
  for (let i = 0; i < canProceedFrom.length; i++) {
    if (canProceedFrom[i]) highest = i + 1;
    else break;
  }
  return { canProceedFrom, highestReachable: Math.min(highest, STEPS.length - 1) };
}

function mergeFiles(existing: FileEntry[], incoming: FileEntry[]): FileEntry[] {
  const map = new Map<string, FileEntry>();
  for (const f of existing) map.set(f.path, f);
  for (const f of incoming) map.set(f.path, f);
  return Array.from(map.values());
}

function pickEntrypoint(draft: DraftState): string | undefined {
  if (draft.type === 'mcp-config' || draft.files.length === 0) return undefined;
  const byName = draft.files.find((f) => {
    const base = basename(f.path).toLowerCase();
    return base === `${draft.name}.md` || base === 'skill.md' || base === 'agent.md';
  });
  if (byName) return byName.path;
  const md = draft.files.find((f) => f.path.toLowerCase().endsWith('.md') && !/readme/i.test(basename(f.path)));
  if (md) return md.path;
  return draft.files[0]?.path;
}

async function readDropEntries(dataTransfer: DataTransfer): Promise<FileEntry[]> {
  const items = dataTransfer.items ? Array.from(dataTransfer.items) : [];
  const roots = items
    .filter((item) => item.kind === 'file')
    .map((item) => (typeof item.webkitGetAsEntry === 'function' ? item.webkitGetAsEntry() : null))
    .filter((entry): entry is FileSystemEntry => entry !== null);
  if (roots.length === 0) return readFileList(dataTransfer.files);
  const entries: FileEntry[] = [];
  for (const root of roots) {
    const walked = await walkFsEntry(root);
    entries.push(...walked);
  }
  return stripCommonRoot(entries);
}

async function readFileList(fileList: FileList): Promise<FileEntry[]> {
  const entries: FileEntry[] = [];
  for (const file of Array.from(fileList)) {
    const path =
      (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
    const content = await file.text();
    entries.push({ content, path, size: file.size });
  }
  return stripCommonRoot(entries);
}

function StepFiles({ draft, onChange }: StepProps) {
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<null | string>(null);

  const applyIncomingEntries = (entries: FileEntry[]) => {
    if (entries.length === 0) return;
    const merged = mergeFiles(draft.files, entries);
    onChange('files', merged);
    const readmeContent = extractReadme(entries);
    if (readmeContent && !draft.readme) onChange('readme', readmeContent);
    const prefill = extractManifest(entries);
    if (prefill) {
      if (prefill.type) onChange('type', prefill.type);
      if (prefill.name) onChange('name', prefill.name);
      if (prefill.description) onChange('description', prefill.description);
      if (prefill.author) onChange('author', prefill.author);
      if (prefill.version) onChange('version', prefill.version);
      if (prefill.org) onChange('org', prefill.org);
      if (prefill.tags) onChange('tags', prefill.tags);
    }
  };

  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setError(null);
    try {
      applyIncomingEntries(await readFileList(fileList));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to read selected files');
    }
  };

  const handleDrop = async (dataTransfer: DataTransfer) => {
    setError(null);
    try {
      applyIncomingEntries(await readDropEntries(dataTransfer));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to read dropped files');
    }
  };

  const removeFile = (path: string) => {
    onChange(
      'files',
      draft.files.filter((f) => f.path !== path),
    );
  };

  if (draft.type === 'mcp-config') {
    const jsonValid = !draft.mcpConfig || isJsonValid(draft.mcpConfig);
    return (
      <Card>
        <CardHeader>
          <CardTitle id='contribute-step-heading'>Step 2 — MCP configuration</CardTitle>
        </CardHeader>
        <CardContent className='space-y-3'>
          <SectionHeader
            description='Paste the JSON configuration for this MCP server. No file upload is required.'
            title='MCP server JSON'
          />
          <Label htmlFor='mcp-config-editor'>Configuration JSON</Label>
          <Textarea
            aria-describedby='mcp-config-error'
            aria-invalid={!jsonValid}
            className='min-h-[240px] font-mono text-xs'
            data-testid='mcp-config-editor'
            id='mcp-config-editor'
            onChange={(event) => onChange('mcpConfig', event.target.value)}
            placeholder='{"mcpServers": {"my-server": {"command": "..."}}}'
            value={draft.mcpConfig}
          />
          <div aria-live='polite' id='mcp-config-error' role='status'>
            {!jsonValid ? (
              <p className='text-sm text-destructive' data-testid='mcp-config-invalid'>
                Invalid JSON. Fix syntax errors before continuing.
              </p>
            ) : null}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle id='contribute-step-heading'>Step 2 — Files</CardTitle>
      </CardHeader>
      <CardContent className='space-y-4'>
        <SectionHeader
          description='Drag and drop files or a folder. Individual files and folders are both supported.'
          title='Upload asset files'
        />
        <div
          aria-label='File drop zone'
          className={`flex flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed px-6 py-10 text-center transition-colors ${
            dragActive ? 'border-primary bg-primary/5' : 'border-border bg-transparent'
          }`}
          data-testid='file-dropzone'
          onDragLeave={(event) => {
            event.preventDefault();
            setDragActive(false);
          }}
          onDragOver={(event) => {
            event.preventDefault();
            setDragActive(true);
          }}
          onDrop={(event) => {
            event.preventDefault();
            setDragActive(false);
            void handleDrop(event.dataTransfer);
          }}
        >
          <p className='text-sm text-muted-foreground'>Drop files here, or use one of the buttons below.</p>
          <div className='flex flex-wrap gap-2'>
            <label className='inline-block'>
              <input
                aria-label='Add files'
                className='sr-only'
                data-testid='file-input'
                multiple
                onChange={(event) => {
                  void handleFiles(event.target.files);
                  event.target.value = '';
                }}
                type='file'
              />
              <span className='inline-flex h-9 cursor-pointer items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground'>
                Add files
              </span>
            </label>
            <label className='inline-block'>
              <input
                aria-label='Add folder'
                className='sr-only'
                data-testid='folder-input'
                multiple
                onChange={(event) => {
                  void handleFiles(event.target.files);
                  event.target.value = '';
                }}
                ref={(node) => {
                  if (node) node.setAttribute('webkitdirectory', '');
                }}
                type='file'
              />
              <span className='inline-flex h-9 cursor-pointer items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground'>
                Add folder
              </span>
            </label>
          </div>
        </div>
        <div aria-live='polite' role='status'>
          {error ? <p className='text-sm text-destructive'>{error}</p> : null}
        </div>
        {draft.files.length === 0 ? (
          <p className='text-sm text-muted-foreground' data-testid='files-empty'>
            No files added yet.
          </p>
        ) : (
          <ul className='divide-y divide-border rounded-md border border-border' data-testid='files-list'>
            {draft.files.map((file) => (
              <li className='flex items-center justify-between gap-3 px-3 py-2' key={file.path}>
                <span className='truncate font-mono text-xs'>{file.path}</span>
                <div className='flex items-center gap-2'>
                  <Badge variant='secondary'>{formatSize(file.size)}</Badge>
                  <Button
                    aria-label={`Remove ${file.path}`}
                    data-testid={`remove-file-${file.path}`}
                    onClick={() => removeFile(file.path)}
                    size='sm'
                    type='button'
                    variant='ghost'
                  >
                    Remove
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function StepMetadata({ draft, onChange }: StepProps) {
  const [tagDraft, setTagDraft] = useState('');
  const nameValid = !draft.name || KEBAB_CASE_REGEX.test(draft.name);
  const orgValid = !draft.org || ORG_REGEX.test(draft.org);
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
        <CardTitle id='contribute-step-heading'>Step 3 — Metadata</CardTitle>
      </CardHeader>
      <CardContent className='space-y-5'>
        <div className='grid gap-4 sm:grid-cols-2'>
          <div className='space-y-1.5'>
            <Label htmlFor='contrib-name'>Name</Label>
            <Input
              aria-describedby='contrib-name-error'
              aria-invalid={!nameValid}
              data-testid='field-name'
              id='contrib-name'
              onChange={(event) => onChange('name', event.target.value)}
              placeholder='my-asset-name'
              value={draft.name}
            />
            <div aria-live='polite' id='contrib-name-error' role='status'>
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
            <Label htmlFor='contrib-version'>Version</Label>
            <Input
              aria-describedby='contrib-version-error'
              aria-invalid={!versionValid}
              data-testid='field-version'
              id='contrib-version'
              onChange={(event) => onChange('version', event.target.value)}
              placeholder='1.0.0'
              value={draft.version}
            />
            <div aria-live='polite' id='contrib-version-error' role='status'>
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
          <Label htmlFor='contrib-description'>Short description</Label>
          <Input
            data-testid='field-description'
            id='contrib-description'
            onChange={(event) => onChange('description', event.target.value)}
            placeholder='One-line summary of what this asset does'
            value={draft.description}
          />
        </div>
        <div className='grid gap-4 sm:grid-cols-2'>
          <div className='space-y-1.5'>
            <Label htmlFor='contrib-org'>Org (optional)</Label>
            <Input
              aria-describedby='contrib-org-error'
              aria-invalid={!orgValid}
              data-testid='field-org'
              id='contrib-org'
              onChange={(event) => onChange('org', event.target.value)}
              placeholder='my-org'
              value={draft.org}
            />
            <div aria-live='polite' id='contrib-org-error' role='status'>
              {!orgValid ? (
                <p className='text-xs text-destructive' data-testid='error-org'>
                  Org must start with a letter and contain only letters, digits, and hyphens.
                </p>
              ) : (
                <p className='text-xs text-muted-foreground'>Leave blank for global scope.</p>
              )}
            </div>
          </div>
          <div className='space-y-1.5'>
            <Label htmlFor='contrib-author'>Author</Label>
            <Input
              data-testid='field-author'
              id='contrib-author'
              onChange={(event) => onChange('author', event.target.value)}
              placeholder='GitHub login'
              value={draft.author}
            />
            <p className='text-xs text-muted-foreground'>Pre-filled from your GitHub session; edit if needed.</p>
          </div>
        </div>
        <div className='space-y-1.5'>
          <Label htmlFor='contrib-tag-input'>Tags</Label>
          <div className='flex gap-2'>
            <Input
              data-testid='field-tag-input'
              id='contrib-tag-input'
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

function StepReadme({ draft, onChange }: StepProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle id='contribute-step-heading'>Step 4 — README</CardTitle>
      </CardHeader>
      <CardContent className='space-y-3'>
        <SectionHeader
          description='Markdown supported. A live preview appears alongside your draft.'
          title='README content'
        />
        <div className='grid gap-4 lg:grid-cols-2'>
          <div className='space-y-1.5'>
            <Label htmlFor='contrib-readme'>Markdown source</Label>
            <Textarea
              className='min-h-[320px] font-mono text-xs'
              data-testid='field-readme'
              id='contrib-readme'
              onChange={(event) => onChange('readme', event.target.value)}
              placeholder='# My Asset&#10;&#10;Describe what it does...'
              value={draft.readme}
            />
          </div>
          <div className='space-y-1.5'>
            <Label>Preview</Label>
            <div
              aria-label='README preview'
              className='min-h-[320px] overflow-auto rounded-md border border-border bg-card p-4'
              data-testid='readme-preview'
            >
              {draft.readme.trim() ? (
                <MarkdownRenderer content={draft.readme} />
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

function StepReview({ draft, validation }: StepReviewProps) {
  const manifestInput = buildManifestInput(draft);
  return (
    <Card>
      <CardHeader>
        <CardTitle id='contribute-step-heading'>Step 5 — Review &amp; submit</CardTitle>
      </CardHeader>
      <CardContent className='space-y-5'>
        <SectionHeader
          description='Verify the generated manifest, file list, and README before submitting.'
          title='Review your contribution'
        />
        <div>
          <h3 className='pb-2 text-sm font-semibold'>Manifest</h3>
          <pre
            className='overflow-x-auto rounded-md border border-border bg-muted p-4 font-mono text-xs'
            data-testid='review-manifest'
          >
            {JSON.stringify(manifestInput, null, 2)}
          </pre>
        </div>
        <div>
          <h3 className='pb-2 text-sm font-semibold'>Files</h3>
          {draft.type === 'mcp-config' ? (
            <p className='text-sm text-muted-foreground'>MCP configuration asset (no source files).</p>
          ) : draft.files.length === 0 ? (
            <p className='text-sm text-muted-foreground'>No files attached.</p>
          ) : (
            <ul className='divide-y divide-border rounded-md border border-border' data-testid='review-files'>
              {draft.files.map((file) => (
                <li className='flex items-center justify-between gap-3 px-3 py-2' key={file.path}>
                  <span className='truncate font-mono text-xs'>{file.path}</span>
                  <Badge variant='secondary'>{formatSize(file.size)}</Badge>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div aria-live='polite' role='status'>
          {validation.success ? (
            <p className='text-sm text-foreground' data-testid='review-valid'>
              Manifest passes schema validation. You can submit now.
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

function StepType({ draft, onChange }: StepProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle id='contribute-step-heading'>Step 1 — Asset type</CardTitle>
      </CardHeader>
      <CardContent>
        <SectionHeader
          description='Pick the category that best describes what you are contributing.'
          title='Select an asset type'
        />
        <div aria-label='Asset type' className='grid grid-cols-1 gap-2 sm:grid-cols-2' role='radiogroup'>
          {ASSET_TYPES.map((type) => {
            const selected = draft.type === type;
            return (
              <button
                aria-checked={selected}
                className={`flex flex-col items-start rounded-md border px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
                  selected
                    ? 'border-primary bg-primary/10'
                    : 'border-border bg-transparent hover:bg-accent hover:text-accent-foreground'
                }`}
                data-testid={`asset-type-${type}`}
                key={type}
                onClick={() => onChange('type', type)}
                role='radio'
                tabIndex={selected || draft.type === '' ? 0 : -1}
                type='button'
              >
                <span className='text-sm font-semibold'>{type}</span>
                <span className='text-xs text-muted-foreground'>{describeType(type)}</span>
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Normalize uploaded file paths by stripping a single common leading directory
 * shared by every entry. Browser folder uploads (`webkitRelativePath` or
 * drag-and-drop of a directory) prefix each file with the selected folder's
 * name, which otherwise double-nests the asset under its registry path and
 * causes the manifest entrypoint/files fields to reference paths that don't
 * exist in the committed tree. Flat drops and divergent roots are left
 * untouched.
 */
function stripCommonRoot(files: FileEntry[]): FileEntry[] {
  if (files.length === 0) return files;
  const heads = files.map((f) => {
    const i = f.path.indexOf('/');
    return i === -1 ? null : f.path.slice(0, i);
  });
  const root = heads[0];
  if (root === null || heads.some((h) => h !== root)) return files;
  const prefix = `${root}/`;
  return files
    .map((f) => ({ ...f, path: f.path.slice(prefix.length) }))
    .filter((f) => f.path.length > 0);
}

async function walkFsEntry(entry: FileSystemEntry): Promise<FileEntry[]> {
  if (entry.isFile) {
    const fileEntry = entry as FileSystemFileEntry;
    const file = await new Promise<File>((resolve, reject) => fileEntry.file(resolve, reject));
    const relPath = entry.fullPath.replace(/^\//, '') || file.name;
    const content = await file.text();
    return [{ content, path: relPath, size: file.size }];
  }
  const dirEntry = entry as FileSystemDirectoryEntry;
  const reader = dirEntry.createReader();
  const collected: FileEntry[] = [];
  // readEntries returns batches; loop until the reader signals completion with an empty batch.
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((resolve, reject) =>
      reader.readEntries(resolve, reject),
    );
    if (batch.length === 0) break;
    for (const child of batch) {
      const childEntries = await walkFsEntry(child);
      collected.push(...childEntries);
    }
  }
  return collected;
}

function WizardNav({ canProceed, canSubmit, isLast, onBack, onNext, onSubmit, step, submitting }: WizardNavProps) {
  return (
    <div className='flex items-center justify-between gap-2 pt-2'>
      <Button
        data-testid='wizard-back'
        disabled={step === 0 || submitting}
        onClick={onBack}
        type='button'
        variant='outline'
      >
        Back
      </Button>
      {isLast ? (
        <Button data-testid='wizard-submit' disabled={!canSubmit} onClick={onSubmit} type='button'>
          {submitting ? 'Submitting…' : 'Submit contribution'}
        </Button>
      ) : (
        <Button data-testid='wizard-next' disabled={!canProceed} onClick={onNext} type='button'>
          Next
        </Button>
      )}
    </div>
  );
}

