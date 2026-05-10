import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'node:path'

/**
 * Vitest configuration for component-level + hook unit tests.
 *
 * Why a separate framework alongside Playwright:
 *   - Playwright covers cross-browser end-to-end behavior of the live app.
 *   - Vitest covers logic that is too fine-grained or expensive to spin
 *     up a browser for, e.g. concurrency guards in custom hooks.
 *
 * Naming convention: tests live next to their source under
 * `<dir>/__tests__/*.test.tsx` (or `.test.ts`). The Playwright suite
 * lives in `e2e/*.spec.ts` and is excluded from this runner.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  // Skip the project's PostCSS pipeline. The app uses lightningcss /
  // tailwindcss v4 native bindings that are not relevant for unit tests
  // and have known npm-optional-deps install issues across platforms.
  // Hook-level tests don't render real CSS anyway.
  css: {
    postcss: { plugins: [] },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    // Restrict to __tests__ folders so Playwright specs in e2e/ are not
    // picked up (they use a different runner with different globals).
    include: ['**/__tests__/**/*.test.{ts,tsx}'],
    exclude: ['node_modules', 'e2e', '.next'],
  },
})
