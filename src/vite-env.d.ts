/// <reference types="vite/client" />

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface ImportMetaEnv {
  readonly VITE_AUTH_FUNCTION_URL?: string;
  readonly VITE_GITHUB_OAUTH_CLIENT_ID?: string;
}
