import { Link, useParams, useSearchParams } from 'react-router';

import type { AssetType, Manifest } from '@/lib/schemas';

import { EmptyState } from '@/components/EmptyState';
import { LoadingIndicator } from '@/components/LoadingIndicator';
import { MarkdownRenderer } from '@/components/MarkdownRenderer';
import { PageHeader } from '@/components/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAssetManifest } from '@/hooks/useAssetManifest';
import { useAssetReadme } from '@/hooks/useAssetReadme';
import { useDownloadAsset } from '@/hooks/useDownloadAsset';
import { RegistryNotFoundError } from '@/lib/registry-errors';

const ASSET_TYPES = new Set<AssetType>(['agent', 'hook', 'mcp-config', 'memory-template', 'rule', 'skill']);

export function AssetDetailRoute() {
  const { name, type, version } = useParams<{ name: string; type: string; version: string }>();
  const [searchParams] = useSearchParams();
  const org = searchParams.get('org') ?? undefined;

  const assetType = type && ASSET_TYPES.has(type as AssetType) ? (type as AssetType) : undefined;
  const ref = { name, org, type: assetType, version };

  const manifestQuery = useAssetManifest(ref);
  const readmeQuery = useAssetReadme(ref);
  const { download, isDownloading } = useDownloadAsset();

  if (!assetType || !name || !version) {
    return (
      <>
        <PageHeader title='Asset detail' />
        <EmptyState
          actions={<BackToBrowseLink />}
          description='The asset URL is malformed or the asset could not be found in the registry.'
          title='Asset not found'
        />
      </>
    );
  }

  if (manifestQuery.isLoading) {
    return (
      <>
        <PageHeader title={name} />
        <LoadingIndicator label='Loading asset manifest…' variant='skeleton' />
      </>
    );
  }

  if (manifestQuery.isError) {
    if (manifestQuery.error instanceof RegistryNotFoundError) {
      return <AssetNotFound />;
    }
    return (
      <>
        <PageHeader title={name} />
        <div
          className='rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-sm'
          data-testid='asset-detail-error'
          role='alert'
        >
          <p className='font-medium text-foreground'>Failed to load the asset manifest.</p>
          <p className='text-muted-foreground'>{manifestQuery.error?.message ?? 'Unknown error.'}</p>
        </div>
      </>
    );
  }

  const manifest = manifestQuery.data;
  if (!manifest) {
    return <AssetNotFound />;
  }

  return (
    <div className='flex flex-col gap-6'>
      <PageHeader
        actions={
          <DownloadButton
            isLoading={isDownloading({
              name: manifest.name,
              org: manifest.org,
              type: manifest.type,
              version: manifest.version,
            })}
            name={manifest.name}
            onClick={() =>
              void download({
                name: manifest.name,
                org: manifest.org,
                type: manifest.type,
                version: manifest.version,
              })
            }
          />
        }
        description={
          <span className='flex flex-wrap items-center gap-2 text-muted-foreground'>
            <Badge variant='secondary'>{manifest.type}</Badge>
            <span>v{manifest.version}</span>
          </span>
        }
        title={manifest.name}
      />

      <Card data-testid='asset-detail-metadata'>
        <CardHeader>
          <CardTitle>Metadata</CardTitle>
        </CardHeader>
        <CardContent className='flex flex-col gap-6 text-sm'>
          <MetadataRow label='Author'>{manifest.author}</MetadataRow>
          <MetadataRow label='Description'>{manifest.description}</MetadataRow>
          <MetadataRow label='Org scope'>
            {manifest.org ? <Badge variant='secondary'>{manifest.org}</Badge> : <span className='text-muted-foreground'>global</span>}
          </MetadataRow>

          {manifest.tags && manifest.tags.length > 0 ? (
            <MetadataRow label='Tags'>
              <div className='flex flex-wrap gap-1'>
                {manifest.tags.map((tag) => (
                  <Badge key={tag} variant='outline'>
                    {tag}
                  </Badge>
                ))}
              </div>
            </MetadataRow>
          ) : null}

          {manifest.tools && manifest.tools.length > 0 ? (
            <MetadataRow label='Tool compatibility'>
              <ul className='flex flex-col gap-2' data-testid='tool-compatibility'>
                {manifest.tools.map((tool) => (
                  <li className='rounded-md border border-border p-3' key={tool.tool}>
                    <div className='flex flex-wrap items-center gap-2'>
                      <Badge variant='outline'>{tool.tool}</Badge>
                      {tool.minVersion ? (
                        <span className='text-xs text-muted-foreground'>min: {tool.minVersion}</span>
                      ) : null}
                      {tool.maxVersion ? (
                        <span className='text-xs text-muted-foreground'>max: {tool.maxVersion}</span>
                      ) : null}
                    </div>
                    {tool.notes ? (
                      <p className='mt-2 text-xs text-muted-foreground'>{tool.notes}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </MetadataRow>
          ) : null}

          {manifest.security ? (
            <MetadataRow label='Security'>
              <SecurityBlockView security={manifest.security} />
            </MetadataRow>
          ) : null}

          {manifest.dependencies && manifest.dependencies.length > 0 ? (
            <MetadataRow label='Dependencies'>
              <ul className='flex flex-col gap-1' data-testid='asset-dependencies'>
                {manifest.dependencies.map((dep) => (
                  <li
                    className='flex flex-wrap items-center gap-2 text-sm'
                    key={`${dep.type}:${dep.name}:${dep.version ?? ''}`}
                  >
                    <Badge variant='outline'>{dep.type}</Badge>
                    <span className='font-medium text-foreground'>{dep.name}</span>
                    {dep.version ? <span className='text-muted-foreground'>{dep.version}</span> : null}
                  </li>
                ))}
              </ul>
            </MetadataRow>
          ) : null}
        </CardContent>
      </Card>

      <section aria-label='Asset README' data-testid='asset-detail-readme'>
        <h2 className='mb-3 text-lg font-semibold tracking-tight text-foreground'>README</h2>
        <ReadmeView
          isError={readmeQuery.isError}
          isLoading={readmeQuery.isLoading}
          readme={readmeQuery.data ?? null}
        />
      </section>
    </div>
  );
}

function AssetNotFound() {
  return (
    <>
      <PageHeader title='Asset detail' />
      <EmptyState
        actions={<BackToBrowseLink />}
        description='We could not find this asset in the registry. It may have been renamed or removed.'
        title='Asset not found'
      />
    </>
  );
}

function BackToBrowseLink() {
  return (
    <Link
      className='inline-flex h-8 items-center justify-center rounded-md border border-input bg-background px-3 text-xs font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground'
      to='/'
    >
      Back to Browse
    </Link>
  );
}

function DownloadButton({
  isLoading,
  name,
  onClick,
}: {
  isLoading: boolean;
  name: string;
  onClick: () => void;
}) {
  return (
    <Button
      aria-busy={isLoading || undefined}
      aria-label={`Download ${name}`}
      data-testid='asset-detail-download'
      disabled={isLoading}
      onClick={onClick}
      size='sm'
      variant='outline'
    >
      {isLoading ? (
        <span aria-hidden='true' className='mr-2 inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent' />
      ) : null}
      {isLoading ? 'Downloading…' : 'Download'}
    </Button>
  );
}

function MetadataRow({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <div className='flex flex-col gap-1'>
      <span className='text-xs font-medium uppercase tracking-wide text-muted-foreground'>{label}</span>
      <div className='text-foreground'>{children}</div>
    </div>
  );
}

function ReadmeView({
  isError,
  isLoading,
  readme,
}: {
  isError: boolean;
  isLoading: boolean;
  readme: null | string;
}) {
  if (isLoading) {
    return <LoadingIndicator label='Loading README…' variant='skeleton' />;
  }
  if (isError || !readme) {
    return (
      <p className='text-sm text-muted-foreground' data-testid='asset-detail-readme-missing'>
        No README is available for this asset.
      </p>
    );
  }
  return <MarkdownRenderer content={readme} />;
}

function SecurityBlockView({ security }: { security: NonNullable<Manifest['security']> }) {
  return (
    <div className='flex flex-col gap-2' data-testid='security-block'>
      {security.permissions && security.permissions.length > 0 ? (
        <div className='flex flex-wrap items-center gap-1'>
          <span className='text-xs text-muted-foreground'>Permissions:</span>
          {security.permissions.map((perm) => (
            <Badge key={perm} variant='outline'>
              {perm}
            </Badge>
          ))}
        </div>
      ) : null}
      {security.reviewedBy ? (
        <p className='text-xs text-muted-foreground'>
          Reviewed by <span className='text-foreground'>{security.reviewedBy}</span>
          {security.reviewedAt ? ` on ${security.reviewedAt}` : ''}
        </p>
      ) : security.reviewedAt ? (
        <p className='text-xs text-muted-foreground'>Reviewed on {security.reviewedAt}</p>
      ) : null}
    </div>
  );
}

export default AssetDetailRoute;
