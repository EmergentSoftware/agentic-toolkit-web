import { RequireAuth } from '@/components/RequireAuth';
import { SignedOutLanding } from '@/components/SignedOutLanding';
import { useSession } from '@/hooks/useSession';
import { BrowseRoute } from '@/routes/Browse';

/**
 * Landing route at `/`. Signed-out visitors see an intro + Sign-in CTA; signed-in
 * visitors are routed through RequireAuth to BrowseRoute (verifying → loading,
 * member → browse, non-member → redirect to /not-authorized).
 */
export function IndexRoute() {
  const { status } = useSession();

  if (status === 'signed-out') {
    return <SignedOutLanding />;
  }

  return (
    <RequireAuth>
      <BrowseRoute />
    </RequireAuth>
  );
}

export default IndexRoute;
