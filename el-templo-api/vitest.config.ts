import { defineConfig } from 'vitest/config';
import dotenv from 'dotenv';
import path from 'path';

// Load .env.development so DB credentials are available in config and globalSetup
dotenv.config({ path: path.resolve(__dirname, '.env.development') });
dotenv.config({ path: path.resolve(__dirname, '.env') });

export default defineConfig({
  test: {
    globals: true,
    root: '.',
    include: ['test/**/*.test.ts'],
    globalSetup: ['test/setup.ts'],
    fileParallelism: false, // DB tests must run sequentially
    testTimeout: 30000, // DB operations can be slow
    env: {
      NODE_ENV: 'test',
      DB_NAME: 'eltemplo_test',
      DB_HOST: process.env.DB_HOST || 'localhost',
      DB_PORT: process.env.DB_PORT || '3306',
      DB_USER: process.env.DB_USER || 'root',
      DB_PASSWORD: process.env.DB_PASSWORD || '',
      JWT_SECRET: 'test-secret-for-testing',
    },
  },
});
