import { defineConfig } from 'vitest/config';

/**
 * Self-contained on purpose: backend/ installs its own node_modules in
 * isolation (CI runs `cd backend && npm ci`, never a root install). Without
 * this file, `vitest` walks up to the repo-root config, which requires
 * `vitest/config` from the root's node_modules — present locally, absent in
 * CI, so every backend-only run failed at startup there.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
