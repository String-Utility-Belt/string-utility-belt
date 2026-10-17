/**
 * roadmap §13.3 — the run engine: the large-input guard/banner, and the custom
 * JavaScript sandbox (a real value back, and no network access). The sandbox test is
 * tagged @sandbox: playwright.config.ts runs it in Firefox as well as Chromium.
 */
import { test, expect } from '@playwright/test'
import { outputStats, quickAdd, result, setInput, stepCard } from './utils'

test.describe('engine', () => {
  // the sandbox test counts requests with routes, which never see what a service worker answers
  test.use({ serviceWorkers: 'block' })

  test('a 1.2 MB input shows the large-input banner, and "Run" produces output', async ({ page }) => {
    test.setTimeout(60_000)
    await page.goto('/')
    await quickAdd(page, 'case') // default mode: upper — makes the output visibly different from the input

    const big = 'a'.repeat(1_200_000)
    await setInput(page, big)

    const banner = page.getByRole('status').filter({ hasText: 'Large input' })
    await expect(banner).toContainText('1.1 MB')
    await expect(banner).toContainText('live preview paused')

    await page.getByRole('button', { name: 'Run', exact: true }).click()

    await expect(outputStats(page)).toContainText('1,200,000 chars', { timeout: 30_000 })
    await expect(result(page)).toContainText('AAAA')
  })

  test('a custom JS step runs in the sandbox, and a request from it never leaves the browser', { tag: '@sandbox' }, async ({ page, context, baseURL }) => {
    test.setTimeout(30_000)
    // Every request for these paths that reaches the network is answered and counted here.
    // The site's own CSP allows both (connect-src 'self'), so only the frame's policy can stop
    // the sandbox sending them: the code's request below, and the Worker's own probe of
    // robots.txt before it runs any code (src/app/sandbox/frame.ts).
    const sent: string[] = []
    for (const pattern of ['**/__sandbox-e2e/**', '**/robots.txt']) {
      await context.route(pattern, route => { sent.push(route.request().url()); return route.fulfill({ status: 204 }) })
    }
    const target = (name: string) => new URL(`/__sandbox-e2e/${name}`, baseURL).href
    await page.goto('/')

    // The control: a Worker under the site's policy alone does reach the network, and is counted.
    const control = await page.evaluate(url => new Promise<string>(resolve => {
      const src = `fetch(${JSON.stringify(url)}, { mode: 'no-cors' }).then(() => postMessage('sent'), e => postMessage(String(e)))`
      const worker = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })))
      worker.onmessage = e => { worker.terminate(); resolve(String(e.data)) }
    }), target('control'))
    expect(control).toBe('sent')
    expect(sent).toEqual([target('control')])

    await quickAdd(page, 'custom_js')
    const step = stepCard(page, 0)

    // wait for the real CodeMirror editor to take over from the plain-textarea fallback
    // (its hint paragraph only exists once the chunk has mounted) before typing, so a
    // keystroke never lands mid-swap between the two.
    await step.locator('p', { hasText: 'Tab indents' }).waitFor()
    const codeBox = step.getByRole('textbox', { name: 'code' })
    await codeBox.click()
    await page.keyboard.press('Control+a')
    await page.keyboard.press('Delete')
    // no-cors: the request resolves whenever it is sent, so only a block can make it fail
    await page.keyboard.type(
      `try { await fetch(${JSON.stringify(target('sandbox'))}, { mode: 'no-cors' }); return 'SENT'; } `
      + "catch (e) { return 'BLOCKED:' + String(input).toUpperCase(); }"
    )

    await setInput(page, 'hi')
    await expect(step.locator('[role="alert"]')).toHaveCount(0)
    await expect(result(page)).toHaveText('BLOCKED:HI', { timeout: 10_000 })
    expect(sent).toEqual([target('control')])
  })
})
