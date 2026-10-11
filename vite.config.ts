import { defineConfig } from 'vite'
import { configDefaults } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { utilityManifest } from './scripts/vite-plugin-utilities'
import { pwaServiceWorker } from './scripts/vite-plugin-pwa'
import { utilityGuides } from './scripts/vite-plugin-guides'
import { siteHeaders } from './scripts/headers'
import { previewRedirects } from './scripts/redirects'

export default defineConfig(async ({ mode }) => {
  // previewRedirects: the production redirects (public/_redirects), so E2E follows the same links
  const plugins = [react(), utilityManifest(), utilityGuides(), pwaServiceWorker(), previewRedirects(path.resolve(__dirname, 'public'))];

  // Enable CF plugin only when not testing, and only when you actually want Workers
  const enableCloudflare =
    mode !== 'test' &&
    !process.env.VITEST &&                // Vitest guard
    (process.env.CF_PAGES || process.env.CF_WORKER); // opt-in via env

  if (enableCloudflare) {
    // imported lazily: the plugin pulls in wrangler/miniflare, which costs ~20s of
    // startup for every vitest and vite-node run that never uses it
    const { cloudflare } = await import('@cloudflare/vite-plugin');
    plugins.push(cloudflare());
  }

  return {
    plugins,
    // `pipeline.worker.ts` is a code-split module worker (`new Worker(url, { type: 'module' })`);
    // Rollup can't code-split into the default 'iife' worker format, so builds fail without this.
    worker: {
      format: 'es' as const,
      // The worker and the app lazy-load the same utility chunks. Vite gives the app's bundle these
      // output options but not the worker's, so the two minify the same module differently, the
      // content hashes differ and every utility ships twice (+~470 KB gzip, and fetched twice).
      // Matching them makes the outputs byte-identical, so each chunk is emitted once and shared.
      rolldownOptions: {
        output: {
          topLevelVar: true,
          generatedCode: { preset: 'es2015' as const },
          comments: { annotation: false, jsdoc: false, legal: false },
        },
      },
    },
    build: {
      // never inline a font as a data: URI: the CSP's font-src is 'self' only (public/_headers)
      assetsInlineLimit: (file: string) => (file.endsWith('.woff2') ? false : undefined),
    },
    // Vitest config (so it doesn't try to bring in the CF plugin)
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: 'vitest.setup.ts', // keep or remove if you don't use it
      // suites that lazy-load utility chunks run several seconds on a busy or
      // 2-core CI machine; 5 s (the default) makes them flaky rather than faster
      testTimeout: 15000,
      // .claude/worktrees holds other agents' git worktrees, each resolving its own node_modules
      // (duplicate React → "Invalid hook call"). `vitest bench` swaps in benchmark.exclude, so repeat it.
      exclude: [...configDefaults.exclude, '.claude/**'],
      benchmark: { exclude: [...configDefaults.exclude, '.claude/**'] },
    },
    // honour PORT so a preview harness can assign a free port
    server: process.env.PORT ? { port: Number(process.env.PORT), strictPort: true } : undefined,
    // the production headers (public/_headers), CSP included, so E2E runs under the real policy
    // (not the dev server's: its inline React Refresh preamble is not in the policy)
    preview: { headers: siteHeaders(path.resolve(__dirname, 'public')) },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
    },
  };
});