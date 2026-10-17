/**
 * roadmap §13.3 — pipeline persistence and undo/redo. Each test gets a fresh
 * context (Playwright's default), so there is no cross-test localStorage bleed.
 */
import { test, expect } from '@playwright/test'
import { quickAdd, result, setInput, stepCard } from './utils'

test.describe('persistence', () => {
  test('a 2-step pipeline with edited params survives a reload', async ({ page }) => {
    await page.goto('/')
    await quickAdd(page, 'pad')
    await quickAdd(page, 'case')

    const pad = stepCard(page, 0)
    const caseStep = stepCard(page, 1)
    await pad.getByLabel('target length').fill('8')
    await pad.getByLabel('pad character').fill('*')
    await caseStep.getByLabel('Mode').selectOption('title')

    // Wait for the settled output, not just any text: until a run on this input completes, the
    // result region shows the previous run's output, or the raw input if none has completed yet
    // (`OutputPanel`). Every edited param shows in it: the defaults would give "HELLO     ".
    const expected = 'Hello***'
    await setInput(page, 'hello')
    await expect(result(page)).toHaveText(expected)

    // Only the pipeline (steps + params) is persisted across a reload, not the raw
    // text input (see `src/lib/persist.ts`'s `PersistedState`) — so the input box
    // starts empty again, and re-entering the same text must reproduce the same
    // output, proving the params themselves (not just their on-screen values) survived.
    await page.reload()

    await expect(page.locator('#pipeline-input')).toHaveValue('')
    await expect(stepCard(page, 0).getByLabel('target length')).toHaveValue('8')
    await expect(stepCard(page, 0).getByLabel('pad character')).toHaveValue('*')
    await expect(stepCard(page, 1).getByLabel('Mode')).toHaveValue('title')

    await setInput(page, 'hello')
    await expect(result(page)).toHaveText(expected)
  })

  test('undo/redo via the toolbar buttons and Ctrl+Z/Ctrl+Shift+Z (focus outside text fields)', async ({ page }) => {
    await page.goto('/')
    await quickAdd(page, 'pad')
    await quickAdd(page, 'case')
    const caseSelect = stepCard(page, 1).getByLabel('Mode')
    await expect(caseSelect).toHaveValue('upper') // default
    await caseSelect.selectOption('title')
    await expect(caseSelect).toHaveValue('title')

    const undoBtn = page.getByRole('button', { name: 'undo' })
    const redoBtn = page.getByRole('button', { name: 'redo' })

    // Undo #1 (button): reverts the param edit, both steps still present.
    await undoBtn.click()
    await expect(page.locator('[data-step-id]')).toHaveCount(2)
    await expect(stepCard(page, 1).getByLabel('Mode')).toHaveValue('upper')

    // Move focus to a non-text-field element before using the keyboard shortcut —
    // Ctrl+Z inside a text field must not fire the app's own undo.
    await page.getByText('Paste some text, add steps').click()

    // Undo #2 (Ctrl+Z): removes the second step entirely.
    await page.keyboard.press('Control+z')
    await expect(page.locator('[data-step-id]')).toHaveCount(1)

    // Redo #1 (button): the case step comes back with its pre-undo (default) params.
    await redoBtn.click()
    await expect(page.locator('[data-step-id]')).toHaveCount(2)
    await expect(stepCard(page, 1).getByLabel('Mode')).toHaveValue('upper')

    // Redo #2 (Ctrl+Shift+Z): the param edit is restored too.
    await page.keyboard.press('Control+Shift+z')
    await expect(stepCard(page, 1).getByLabel('Mode')).toHaveValue('title')
  })
})
