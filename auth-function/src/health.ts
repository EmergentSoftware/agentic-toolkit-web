import type {
  HttpHandler,
  HttpRequest,
  HttpResponseInit,
} from '@azure/functions';

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageJsonPath = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'package.json',
);

const version = (() => {
  try {
    const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
      version?: string;
    };
    return pkg.version ?? 'unknown';
  } catch {
    return 'unknown';
  }
})();

export const healthHandler: HttpHandler = async (
  _request: HttpRequest,
): Promise<HttpResponseInit> => {
  return {
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json',
    },
    jsonBody: { status: 'ok', version },
    status: 200,
  };
};
