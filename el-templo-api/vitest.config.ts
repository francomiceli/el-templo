import { defineConfig } from "vitest/config";
import dotenv from "dotenv";
import path from "path";

// Load .env.development so DB credentials are available in config and globalSetup
dotenv.config({ path: path.resolve(__dirname, ".env.development") });
dotenv.config({ path: path.resolve(__dirname, ".env") });

// File-level parallelism: each worker owns its own MySQL DB
// (eltemplo_test_<VITEST_POOL_ID>). MAX_TEST_WORKERS defaults to 4 — bump
// up to 8 on beefier machines if MySQL max_connections allows. CI runners
// have 2 vCPUs, so 4 forks is a sensible cap there too (forks > vCPUs still
// helps because tests are I/O-bound on the DB).
const MAX_WORKERS = Number(process.env.MAX_TEST_WORKERS) || 4;

export default defineConfig({
  test: {
    globals: true,
    root: ".",
    include: ["test/**/*.test.ts"],
    // Cross-run cleanup of stale per-worker DBs (runs once in main process).
    globalSetup: ["test/setup-global.ts"],
    // Per-worker DB provisioning (runs once per worker on first test file).
    setupFiles: ["test/setup.ts"],
    fileParallelism: true,
    pool: "forks",
    // Vitest 4 reads maxWorkers/minWorkers at top level (not under
    // poolOptions.forks). Caps the number of worker processes that can run
    // test files in parallel.
    maxWorkers: MAX_WORKERS,
    minWorkers: 1,
    // isolate: false reuses the same fork process across test files within a
    // worker. Saves ~5s import overhead per file (50 files × 5s = ~4 min).
    // Safe here because each file builds its own Fastify app and runs
    // cleanAllTestData in beforeEach — no shared mutable state.
    poolOptions: {
      forks: {
        isolate: false,
      },
    },
    testTimeout: 30000, // DB operations can be slow
    hookTimeout: 120000, // First-test-file beforeAll provisions the per-worker DB
    // Compact reporter in CI keeps logs readable (~200 lines vs 5000+).
    // Local runs keep the default verbose reporter for inline feedback.
    reporters: process.env.CI ? ["dot", "github-actions"] : ["default"],
    env: {
      NODE_ENV: "test",
      // DB_NAME is set per-worker by test/setup.ts (do NOT set it here).
      DB_HOST: process.env.DB_HOST || "localhost",
      DB_PORT: process.env.DB_PORT || "3306",
      DB_USER: process.env.DB_USER || "root",
      DB_PASSWORD: process.env.DB_PASSWORD || "",
      JWT_SECRET: "test-secret-for-testing",
      // Silence non-Fastify pino loggers (session-generator, cron jobs, etc.)
      // unless explicitly overridden for debugging.
      LOG_LEVEL: process.env.LOG_LEVEL || "silent",
    },
  },
});
