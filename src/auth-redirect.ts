/**
 * MSAL v5 redirect bridge. Microsoft Entra returns to this page after sign-in
 * and sign-out; it hands the response to MSAL, which navigates back to the
 * route that started the flow. It is a separate Vite entry (see vite.config.ts)
 * and must be served from the app's own origin.
 */
import { broadcastResponseToMainFrame } from '@azure/msal-browser/redirect-bridge';

broadcastResponseToMainFrame().catch((error: unknown) => {
  console.error('[auth-redirect] Could not hand the sign-in response to the app:', error);
});
