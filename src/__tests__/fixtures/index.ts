import type { Registry } from '@/lib/schemas';

import registryFixture from './registry.fixture.json';

/** Returns a deep clone of the handcrafted registry fixture. */
export function loadFixtureRegistry(): Registry {
  return structuredClone(registryFixture) as unknown as Registry;
}
