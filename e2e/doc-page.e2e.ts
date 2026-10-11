/**
 * roadmap §13.3 — utility doc pages: the live playground, a pre-rendered `/util/<id>/`
 * page, the header's "Tool" link from one, and the tool's docs links (step card, picker)
 * that open one in place. The pre-rendered assertions need a build
 * where `build:seo:fast` ran against the SAME outDir as `E2E_DIST` (see playwright.config.ts
 * and CLAUDE.md) — without it, `/util/sha3/` would still resolve (vite preview's SPA
 * fallback serves the client app, whose router reads the real path), but the raw-HTML
 * check below would fail, which is the point: it proves the page was actually
 * pre-rendered, not just reached via client-side fallback.
 */
import { test, expect } from '@playwright/test'
import { isSameDocument, markDocument, quickAdd, stepCard } from './utils'

test.describe('utility doc page', () => {
  test('the playground turns input into output live (#/util/base64_encode)', async ({ page }) => {
    await page.goto('/#/util/base64_encode')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Base64 Encode')

    const input = page.getByRole('textbox', { name: 'playground input' })
    const output = page.getByRole('status', { name: 'playground output' })
    await input.fill('hi')
    await expect(output).toHaveText('aGk=')

    await input.fill('hi!')
    await expect(output).toHaveText('aGkh')
  })

  test('the pre-rendered path /util/sha3/ is served with real pre-rendered content', async ({ page, request }) => {
    // Fetches the raw response before any JS runs: a plain SPA fallback would return the
    // generic app shell (an empty #root), not the utility's actual name/description.
    const raw = await request.get('/util/sha3/')
    expect(raw.ok()).toBeTruthy()
    const body = await raw.text()
    expect(body).toContain('sha3')

    await page.goto('/util/sha3/')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('SHA-3')
  })

  test('the header nav "Tool" link works from a pre-rendered /util/<id>/ page', async ({ page }) => {
    await page.goto('/util/sha3/')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('SHA-3')

    const tool = page.getByRole('navigation', { name: 'main' }).getByRole('link', { name: 'Tool' })
    // a crawlable path, followed in place by the app
    await expect(tool).toHaveAttribute('href', '/')
    await tool.click()

    await expect(page.locator('#pipeline-input')).toBeVisible()
    await expect(page).toHaveURL(/^https?:\/\/[^/]+\/$/)
  })

  test("a step card's docs link opens the utility's page in place", async ({ page }) => {
    await page.goto('/')
    await quickAdd(page, 'trim')
    const docs = stepCard(page, 0).getByRole('link', { name: 'trim docs' })
    await expect(docs).toHaveAttribute('href', '/util/trim/')
    await markDocument(page)
    await docs.click()

    await expect(page).toHaveURL(/\/util\/trim\/$/)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Trim Whitespace')
    expect(await isSameDocument(page)).toBe(true)
  })

  test("the utility picker's docs link opens the utility's page in place", async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: /^add step$/i }).click()
    const docs = page.getByRole('listbox', { name: 'utilities' }).locator('a[href="/util/base64_encode/"]').first()
    await markDocument(page)
    await docs.click()

    await expect(page).toHaveURL(/\/util\/base64_encode\/$/)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Base64 Encode')
    expect(await isSameDocument(page)).toBe(true)
  })
})
