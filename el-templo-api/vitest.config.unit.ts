import { defineConfig } from "vitest/config";

/**
 * Vitest config for pure unit tests (no DB required).
 * Run with: pnpm vitest run --config vitest.config.unit.ts
 */
export default defineConfig({
  test: {
    globals: true,
    root: ".",
    include: ["test/unit/**/*.test.ts"],
    exclude: ["test/unit/aura-service.test.ts"], // needs DB
    fileParallelism: true,
    testTimeout: 5000,
  },
});
