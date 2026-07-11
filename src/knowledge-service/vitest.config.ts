import { defineConfig } from 'vitest/config';

// MSG-NEXUS-012: Parallel Test Execution Configuration
export default defineConfig({
  test: {
    // ─── Parallel Execution ──────────────────────────────────────────────────

    // Use thread pool for parallel test execution
    pool: 'threads',
    poolOptions: {
      threads: {
        // Use 50-75% of CPU cores for optimal performance
        maxThreads: Math.max(2, Math.floor((require('os').cpus().length * 0.75))),
        minThreads: 2,
      },
    },

    // Test isolation for thread safety
    isolate: true,

    // ─── Environment ─────────────────────────────────────────────────────────

    globals: true,
    environment: 'node',

    // ─── Coverage ────────────────────────────────────────────────────────────

    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules',
        'dist',
        '**/*.test.ts',
        '**/*.e2e.test.ts',
        'src/__tests__/fixtures/**'
      ],
      // Target coverage (Architect recommendation)
      lines: 85,
      functions: 85,
      branches: 80,
      statements: 85
    },

    // ─── Timeouts ────────────────────────────────────────────────────────────

    testTimeout: 10000,
    hookTimeout: 10000,

    // ─── Reporters ───────────────────────────────────────────────────────────

    // Concise output for parallel runs
    reporter: process.env.CI ? ['dot', 'json'] : ['verbose'],
  }
});
