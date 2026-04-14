import { useCallback, useMemo } from 'react';
import { Link, useParams } from 'react-router';

import type { BundleAssetRef } from '@/lib/schemas/bundle';

import { EmptyState } from '@/components/EmptyState';
import { LoadingIndicator } from '@/components/LoadingIndicator';
import { MarkdownRenderer } from '@/components/MarkdownRenderer';
import { PageHeader } from '@/components/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useBundleManifest } from '@/hooks/useBundleManifest';
import { useDownloadBundle } from '@/hooks/useDownloadBundle';
import { useRegistry } from '@/hooks/useRegistry';
import { RegistryNotFoundError } from '@/lib/registry-errors';

export function BundleDetailRoute() {
  const { bundleId } = useParams<{ bundleId: string }>();
  const manifestQuery = useBundleManifest({ name: bundleId });
  const registryQuery = useRegistry();
  const { download, isDownloading } = useDownloadBundle();

  const resolveVersion = useCallback(
    (member: BundleAssetRef) => {
      const registry = registryQuery.data;
      if (!registry) return undefined;
      const match = registry.assets.find(
        (asset) => asset.name === member.name && asset.type === member.type && (asset.org ?? undefined) === member.org,
      );
      return match?.latest;
    },
    [registryQuery.data],
  );

  const memberVersions = useMemo(() => {
    const manifest = manifestQuery.data;
    if (!manifest) return new Map<string, string | undefined>();
    const map = new Map<string, string | undefined>();
    for (const member of manifest.assets) {
      map.set(memberKey(member), member.version ?? resolveVersion(member));
    }
    return map;
  }, [manifestQuery.data, resolveVersion]);

  if (!bundleId) {
    return (
      <>
        <PageHeader title='Bundle detail' />
        <EmptyState
          actions={<BackToBundlesLink />}
          description='The bundle URL is malformed or the bundle could not be found in the registry.'
          title='Bundle not found'
        />
      </>
    );
  }

  if (manifestQuery.isLoading) {
    return (
      <>
        <PageHeader title={bundleId} />
        <LoadingIndicator label='Loading bundle manifest…' variant='skeleton' />
      </>
    );
  }

  if (manifestQuery.isError) {
    if (manifestQuery.error instanceof RegistryNotFoundError) {
      return <BundleNotFound />;
    }
    return (
      <>
        <PageHeader title={bundleId} />
        <div
          className='rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-sm'
          data-testid='bundle-detail-error'
          role='alert'
        >
          <p className='font-medium text-foreground'>Failed to load the bundle manifest.</p>
          <p className='text-muted-foreground'>{manifestQuery.error?.message ?? 'Unknown error.'}</p>
        </div>
      </>
    );
  }

  const manifest = manifestQuery.data;
  if (!manifest) {
    return <BundleNotFound />;
  }

  return (
    <div className='flex flex-col gap-6'>
      <PageHeader
        actions={
          <DownloadButton
            isLoading={isDownloading(manifest.name)}
            name={manifest.name}
            onClick={() => void download(manifest.name, { resolveVersion })}
          />
        }
        description={
          <span className='flex flex-wrap items-center gap-2 text-muted-foreground'>
            <Badge variant='secondary'>bundle</Badge>
            <span>v{manifest.version}</span>
          </span>
        }
        title={manifest.name}
      />

      <Card data-testid='bundle-detail-metadata'>
        <CardHeader>
          <CardTitle>Metadata</CardTitle>
        </CardHeader>
        <CardContent className='flex flex-col gap-6 text-sm'>
          <MetadataRow label='Author'>{manifest.author}</MetadataRow>
          <MetadataRow label='Description'>{manifest.description}</MetadataRow>
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
        </CardContent>
      </Card>

      <section aria-label='Bundle assets' data-testid='bundle-detail-assets'>
        <h2 className='mb-3 text-lg font-semibold tracking-tight text-foreground'>Assets</h2>
        <ul className='grid gap-3 sm:grid-cols-2'>
          {manifest.assets.map((member) => {
            const resolved = memberVersions.get(memberKey(member));
            return (
              <li key={memberKey(member)}>
                <BundleMemberCard member={member} resolvedVersion={resolved} />
              </li>
            );
          })}
        </ul>
      </section>

      {manifest.setupInstructions ? (
        <section aria-label='Setup instructions' data-testid='bundle-detail-setup'>
          <h2 className='mb-3 text-lg font-semibold tracking-tight text-foreground'>Setup instructions</h2>
          <MarkdownRenderer content={manifest.setupInstructions} />
        </section>
      ) : null}
    </div>
  );
}

function BackToBundlesLink() {
  return (
    <Link
      className='inline-flex h-8 items-center justify-center rounded-md border border-input bg-background px-3 text-xs font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground'
      to='/bundles'
    >
      Back to Bundles
    </Link>
  );
}

function BundleMemberCard({
  member,
  resolvedVersion,
}: {
  member: BundleAssetRef;
  resolvedVersion: string | undefined;
}) {
  const version = resolvedVersion;
  const orgSuffix = member.org ? `?org=${encodeURIComponent(member.org)}` : '';
  const canLink = Boolean(version);
  const href = canLink
    ? `/assets/${member.type}/${encodeURIComponent(member.name)}/${encodeURIComponent(version!)}${orgSuffix}`
    : undefined;

  const inner = (
    <Card
      className={canLink ? 'h-full transition-colors hover:border-primary/40' : 'h-full opacity-70'}
      data-testid={`bundle-member-${member.name}`}
    >
      <CardHeader>
        <div className='flex items-start justify-between gap-2'>
          <CardTitle className='text-base'>{member.name}</CardTitle>
          <Badge variant='secondary'>{member.type}</Badge>
        </div>
      </CardHeader>
      <CardContent className='flex flex-col gap-1 text-xs text-muted-foreground'>
        <span>{version ? `v${version}` : 'version unresolved'}</span>
        {member.org ? <span>org: {member.org}</span> : null}
      </CardContent>
    </Card>
  );

  if (!href) return inner;
  return (
    <Link aria-label={`Open ${member.name}`} className='block h-full' to={href}>
      {inner}
    </Link>
  );
}

function BundleNotFound() {
  return (
    <>
      <PageHeader title='Bundle detail' />
      <EmptyState
        actions={<BackToBundlesLink />}
        description='We could not find this bundle in the registry. It may have been renamed or removed.'
        title='Bundle not found'
      />
    </>
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
      data-testid='bundle-detail-download'
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

function memberKey(member: BundleAssetRef): string {
  return `${member.type}:${member.org ?? ''}:${member.name}`;
}

function MetadataRow({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <div className='flex flex-col gap-1'>
      <span className='text-xs font-medium uppercase tracking-wide text-muted-foreground'>{label}</span>
      <div className='text-foreground'>{children}</div>
    </div>
  );
}

export default BundleDetailRoute;
