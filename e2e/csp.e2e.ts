/**
 * The Content-Security-Policy in public/_headers, enforced: `vite preview` serves the
 * production headers (vite.config.ts), so every suite runs under it. This one fails on
 * any CSP violation report while each kind of page loads and works, and on a WebAssembly
 * utility (the custom-code sandbox is covered by engine.e2e.ts, which also runs under it).
 */
import { expect, test, type Page } from '@playwright/test'
import { quickAdd, result, setInput } from './utils'

declare global {
  interface Window { __cspViolations?: string[] }
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.__cspViolations = []
    document.addEventListener('securitypolicyviolation', e => {
      window.__cspViolations!.push(`${e.effectiveDirective} blocked ${e.blockedURI || 'inline'} (${e.sourceFile}:${e.lineNumber})`)
    })
  })
})

const violations = (page: Page) => page.evaluate(() => window.__cspViolations ?? [])

const PAGES = [
  '/', '/utilities/', '/util/base64_encode/', '/presets/', '/presets/decode-saml-request/',
  '/blog/', '/docs/', '/about/', '/privacy/', '/contact/', '/advertise/', '/no-such-page/',
]

test('every kind of page loads under the CSP without a violation', async ({ page }) => {
  test.setTimeout(60_000)
  for (const path of PAGES) {
    const res = await page.goto(path)
    expect(res!.headers()['content-security-policy'], path).toContain("script-src 'self'")
    await expect(page.locator('#root h1, #root main').first(), path).toBeVisible()
    await page.waitForLoadState('networkidle')
    expect(await violations(page), path).toEqual([])
  }
})

test('a WebAssembly utility runs under the CSP', async ({ page }) => {
  test.setTimeout(30_000)
  await page.goto('/')
  await quickAdd(page, 'sha3')
  await setInput(page, 'hello')
  await expect(result(page)).toHaveText('3338be694f50c5f338814986cdf0686453a888b84f424d792af4b9202398f392', { timeout: 15_000 })
  expect(await violations(page)).toEqual([])
})
