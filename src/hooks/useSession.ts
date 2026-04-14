import { useContext } from 'react';

import { SessionContext, type SessionContextValue } from '@/providers/SessionProvider';

/** Consume the session context. Must be called inside a <SessionProvider>. */
export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) {
    throw new Error('useSession must be used within a SessionProvider');
  }
  return ctx;
}
