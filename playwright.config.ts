import { defineConfig, devices } from '@playwright/test'

/**
 * End-to-end config (roadmap §13.3). Runs against a production preview build
 * so tests see exactly what ships, not the dev server. CI builds straight into
 * `dist/` and sets neither variable. For a local run next to other agents:
 * `E2E_DIST` points the preview at a scratch build (`npx vite build --outDir
 * <dir> --emptyOutDir`) and `E2E_PORT` moves it off 4173. A server already
 * listening on the port is only reused when previewing the default `dist/` —
 * with `E2E_DIST` set it could be someone else's build, so the port must be free.
 */
const distDir = process.env.E2E_DIST
const port = Number(process.env.E2E_PORT) || 4173
const baseURL = `http://localhost:${port}`
const previewCommand = `npx vite preview --port ${port} --strictPort${distDir ? ` --outDir ${JSON.stringify(distDir)}` : ''}`

export default defineConfig({
  testDir: 'e2e',
  testMatch: '**/*.e2e.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['html', { open: 'never' }], ['list']] : 'list',
  use: {
    baseURL,
    trace: 'on-first-retry'
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    // The custom-code sandbox leans on how each engine applies a frame's CSP to the Worker it starts
    { name: 'firefox', use: { ...devices['Desktop Firefox'] }, grep: /@sandbox/ }
  ],
  webServer: {
    command: previewCommand,
    url: baseURL,
    reuseExistingServer: !process.env.CI && !distDir
  }
})
