/** roadmap §13.3 — the command palette (Ctrl+K) and the shortcuts help dialog ('?'). */
import { test, expect } from '@playwright/test'
import { result, setInput } from './utils'

test.describe('command palette', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('#pipeline-input')).toBeVisible()
  })

  test('Ctrl+K opens it; typing a utility name and Enter adds that step', async ({ page }) => {
    await expect(page.locator('[data-step-id]')).toHaveCount(0)

    await page.keyboard.press('Control+k')
    const palette = page.getByRole('dialog', { name: 'Command palette' })
    await expect(palette).toBeVisible()
    await expect(palette.getByRole('combobox')).toBeFocused()

    await page.keyboard.type('reverse')
    // #cmdk-u-reverse: the palette's stable per-utility id (`cmdk-u-<utility id>`),
    // so this does not depend on how the option's name/chip render as text.
    await expect(palette.locator('#cmdk-u-reverse')).toBeVisible()
    await page.keyboard.press('Enter')
    await expect(palette).toBeHidden()

    await expect(page.locator('[data-step-id]')).toHaveCount(1)
    await setInput(page, 'star')
    await expect(result(page)).toHaveText('rats')
  })

  test('Escape closes the palette', async ({ page }) => {
    await page.keyboard.press('Control+k')
    const palette = page.getByRole('dialog', { name: 'Command palette' })
    await expect(palette).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(palette).toBeHidden()
  })

  test('"?" opens keyboard shortcuts help; Escape closes it', async ({ page }) => {
    // move focus off any text field first: '?' is ignored while typing
    await page.getByRole('heading', { level: 1 }).click()

    await page.keyboard.press('?')
    const help = page.getByRole('dialog', { name: 'Keyboard shortcuts' })
    await expect(help).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(help).toBeHidden()
  })
})
