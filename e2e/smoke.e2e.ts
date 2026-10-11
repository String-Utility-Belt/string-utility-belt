/**
 * End-to-end smoke test (roadmap §13.3), run against a production preview
 * build (see `playwright.config.ts`). Deliberately narrow: the UI is being
 * built out concurrently by other workstreams, so this only asserts
 * behaviour that is part of the app's stable contract (routes, ids and
 * aria-labels documented in the feature brief / CLAUDE.md, the share-link
 * wire format, the custom-code quarantine), not incidental layout or copy.
 */
import { test as base, expect, type Page } from '@playwright/test'
import LZString from 'lz-string'

/** Every test, on every route, fails on a console error or an uncaught exception. */
const test = base.extend<{ consoleErrors: string[] }>({
  consoleErrors: [
    async ({ page }, use) => {
      const errors: string[] = []
      page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()) })
      page.on('pageerror', (err) => errors.push(String(err)))
      await use(errors)
      expect(errors, `console errors:\n${errors.join('\n')}`).toEqual([])
    },
    { auto: true }
  ]
})

/**
 * A `#/p/` payload built by hand — lz-string over `{v: 2, steps, input?}` —
 * instead of with the app's own `encodeShare`, so a change to the wire format
 * that would break every link already shared fails here rather than
 * round-tripping through the same new code.
 */
const sharePayload = (doc: { v: 2; steps: unknown[]; input?: string }) =>
  LZString.compressToEncodedURIComponent(JSON.stringify(doc))

const result = (page: Page) => page.getByRole('region', { name: 'result' })

/** A step that replaces any input with a marker — visible proof that custom code ran. */
const CODE_STEP = { id: 'c1', utilityId: 'custom_js', params: { code: "return 'PWNED'" } }
const UPPER_STEP = { id: 'u1', utilityId: 'case', params: { mode: 'upper' } }

test.describe('smoke', () => {
  test('home page renders the tool under the app title', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveTitle('Free Online String & Text Tools | String Utility Belt')
    // wait for the app to mount so errors thrown while rendering are caught by the fixture
    await expect(page.locator('#pipeline-input')).toBeVisible()
  })

  test('typing input and quick-adding trim then slug produces a slugified result', async ({ page }) => {
    await page.goto('/')
    await page.locator('#pipeline-input').fill('  Héllo World  ')

    const quickAdd = page.getByRole('combobox', { name: 'quick add a utility' })
    await quickAdd.selectOption('trim')
    await quickAdd.selectOption('slug')

    await expect(result(page)).toContainText('hello-world')
  })

  test('a #/p/<payload> share link loads its steps and input, then runs them', async ({ page }) => {
    const payload = sharePayload({
      v: 2,
      steps: [
        { id: 's1', utilityId: 'trim' },
        { id: 's2', utilityId: 'slug' }
      ],
      input: '  Héllo World  '
    })
    await page.goto(`/#/p/${payload}`)

    await expect(page.locator('#pipeline-input')).toHaveValue('  Héllo World  ')
    await expect(result(page)).toContainText('hello-world')
  })

  test('custom code from a share link arrives disabled and never runs', async ({ page }) => {
    const payload = sharePayload({ v: 2, steps: [CODE_STEP, UPPER_STEP], input: 'abc' })
    await page.goto(`/#/p/${payload}`)

    // the steps after it still run, so the pipeline did execute — just without the code step
    await expect(result(page)).toContainText('ABC')
    await expect(result(page)).not.toContainText('PWNED')
  })

  test('the same custom code step does run from the user\'s own saved pipeline (control)', async ({ page }) => {
    // Without this control the quarantine test above would also pass if custom code were
    // simply broken in the build. The working pipeline in localStorage is the user's own,
    // so it is trusted (CLAUDE.md: persisted under `string-utility-belt`).
    await page.addInitScript((steps) => {
      // init scripts run in every frame, including the opaque-origin custom-code sandbox
      if (window !== window.top) return
      localStorage.setItem('string-utility-belt', JSON.stringify({ v: 2, steps, showPreviews: false }))
    }, [CODE_STEP, UPPER_STEP])
    await page.goto('/')
    await page.locator('#pipeline-input').fill('abc')

    await expect(result(page)).toContainText('PWNED')
  })

  test('#/utilities lists every utility, each linking to its doc page', async ({ page }) => {
    await page.goto('/#/utilities')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    // crawlable paths to the pre-rendered pages, not #/ routes
    await expect(page.locator('a[href="/util/base64_encode/"]')).toBeVisible()
    // 240+ utilities ship; a handful would mean the registry or the page broke
    expect(await page.locator('a[href^="/util/"]').count()).toBeGreaterThan(200)
  })

  test('#/util/base64_encode shows its heading', async ({ page }) => {
    await page.goto('/#/util/base64_encode')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Base64 Encode')
  })
})
