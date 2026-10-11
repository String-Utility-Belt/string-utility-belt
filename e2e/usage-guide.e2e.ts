/**
 * The usage guide at `/docs/`: pre-rendered like the utility pages (the raw-HTML check
 * needs `build:seo` to have run against the previewed outDir — see doc-page.e2e.ts),
 * reached in place from the header nav, with section links that scroll within the page.
 */
import { test, expect } from '@playwright/test'
import { isSameDocument, markDocument } from './utils'

const HEADING = 'How to use String Utility Belt'

test.describe('usage guide', () => {
  test('/docs/ is served pre-rendered, then rendered by the app with the same title', async ({ page, request }) => {
    const raw = await request.get('/docs/')
    expect(raw.ok()).toBeTruthy()
    const body = await raw.text()
    expect(body).toContain(HEADING)
    expect(body).toContain('<link rel="canonical" href="https://stringutilitybelt.com/docs/">')

    await page.goto('/docs/')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(HEADING)
    await expect(page).toHaveTitle('How to use | String Utility Belt')
    await expect(page.getByRole('navigation', { name: 'main' }).getByRole('link', { name: 'Docs' }))
      .toHaveAttribute('aria-current', 'page')
  })

  test('section links scroll to their section without leaving the page', async ({ page }) => {
    await page.goto('/docs/')
    const section = page.locator('section#utilities')
    await expect(section).not.toBeInViewport()

    await page.getByRole('navigation', { name: 'Docs sections' }).getByRole('link', { name: 'Utility reference' }).click()

    await expect(section).toBeInViewport()
    await expect(page).toHaveURL(/\/docs\/$/)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(HEADING)
  })

  test("the header's Docs link opens the guide in place, and its links lead on in place", async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('#pipeline-input')).toBeVisible()
    const docs = page.getByRole('navigation', { name: 'main' }).getByRole('link', { name: 'Docs' })
    await expect(docs).toHaveAttribute('href', '/docs/')
    await markDocument(page)
    await docs.click()

    await expect(page).toHaveURL(/\/docs\/$/)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(HEADING)

    await page.getByRole('link', { name: 'utilities index' }).click()
    await expect(page).toHaveURL(/\/utilities\/$/)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('All text and string tools')
    expect(await isSameDocument(page)).toBe(true)
  })
})
