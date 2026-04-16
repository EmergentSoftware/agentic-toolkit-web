import { inc as semverInc } from 'semver';

export type BumpType = 'major' | 'minor' | 'patch';

/**
 * Bump a semver string by the requested release type. Matches the CLI's
 * `publisher.ts:bumpVersion` so conflict-bump UX in the web Contribute flow
 * and `atk publish` stay in lockstep.
 */
export function bumpVersion(currentVersion: string, bumpType: BumpType): string {
  const result = semverInc(currentVersion, bumpType);
  if (!result) {
    throw new Error(`Failed to bump version '${currentVersion}' with type '${bumpType}'`);
  }
  return result;
}
