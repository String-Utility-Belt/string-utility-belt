/**
 * The feedback form, in a real browser under the production CSP. `vite preview` has no
 * Worker, so each test answers `POST /api/feedback` itself: as the Worker does when the
 * email goes out, and as it does without the email binding (the form then offers a
 * `mailto:` link).
 */
import { expect, test, type Page } from '@playwright/test'

const footerLink = (page: Page) => page.getByRole('navigation', { name: 'site' }).getByRole('link', { name: 'Feedback' })
const dialog = (page: Page) => page.getByRole('dialog', { name: 'Feedback and suggestions' })

test('the footer opens the form over the page, and a sent message carries only the page path', async ({ page }) => {
  const posted: unknown[] = []
  await page.route('**/api/feedback', async route => {
    posted.push(route.request().postDataJSON())
    await route.fulfill({ status: 204 })
  })
  await page.goto('/utilities/')
  await footerLink(page).click()
  await expect(dialog(page)).toBeVisible()
  await expect(page).toHaveURL(/\/utilities\/$/)

  const message = dialog(page).getByRole('textbox', { name: 'Your message' })
  await expect(message).toBeFocused()
  await dialog(page).getByRole('button', { name: 'Report a bug' }).click()
  await message.fill('The hex view freezes on a 2 MB file.')
  await dialog(page).getByRole('textbox', { name: 'Your email (optional)' }).fill('ada@example.com')
  await dialog(page).getByRole('button', { name: 'Send' }).click()

  await expect(dialog(page).getByRole('status')).toContainText('We’ll reply to ada@example.com')
  expect(posted).toEqual([{
    kind: 'bug', message: 'The hex view freezes on a 2 MB file.', email: 'ada@example.com', page: '/utilities/', website: '',
  }])
  await dialog(page).getByRole('button', { name: 'Close', exact: true }).click()
  await expect(dialog(page)).toBeHidden()
})

test('a utility search that finds nothing starts a suggestion, sent by email app when the Worker cannot', async ({ page }) => {
  await page.route('**/api/feedback', route => route.fulfill({
    status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'sending feedback is not set up here' }),
  }))
  await page.goto('/')
  await page.getByRole('button', { name: 'Add step' }).click()
  await page.getByRole('combobox', { name: 'Search utilities' }).fill('zzqx')
  await page.getByRole('button', { name: 'Suggest it' }).click()

  const message = dialog(page).getByRole('textbox', { name: 'Your message' })
  await expect(message).toHaveValue('I searched for “zzqx” and would like a utility that ')
  await expect(message).toBeFocused()
  await page.keyboard.type('turns it into something useful.')
  await dialog(page).getByRole('button', { name: 'Send' }).click()

  const mailto = dialog(page).getByRole('link', { name: 'Open in your email app' })
  const href = new URL((await mailto.getAttribute('href'))!)
  expect(href.pathname).toBe('contact@stringutilitybelt.com')
  expect(href.searchParams.get('subject')).toBe('Utility suggestion: I searched for “zzqx” and would like a utility that turns i…')
})

// csp.e2e.ts loads /contact/ under the CSP too
test('the contact page carries the form at the #feedback the footer links', async ({ page }) => {
  await page.goto('/contact/#feedback')
  const form = page.locator('section#feedback')
  await expect(form.getByRole('heading', { name: 'Send us a message' })).toBeVisible()
  await expect(form.getByRole('textbox', { name: 'Your message' })).toBeVisible()
})
