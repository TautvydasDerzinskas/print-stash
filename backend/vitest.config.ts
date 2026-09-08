import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 20000,
    hookTimeout: 20000,
    // Every test file shares one real Postgres database, and several files mutate the same
    // global rows (e.g. the Setting table's thingiverse_access_token, set/cleared in
    // beforeAll/afterEach across thingiverseImport/thingiverseLikes/thingiverseCollection/
    // importJobRunner tests) -- running files in parallel worker processes lets one file's
    // "no token configured" assertion race another file's "token is set" setup. Observed this
    // directly as an intermittent failure. Sequential file execution costs a few seconds but
    // makes the suite actually deterministic.
    fileParallelism: false,
  },
});
