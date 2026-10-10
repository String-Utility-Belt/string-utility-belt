/**
 * Records the README's demo GIF (.github/readme/demo.gif) from the production build:
 * a Base64 token goes in, and three steps (decode, pretty-print, convert to YAML) are
 * added one by one, each output showing as soon as its step is added.
 *
 *   npm run build && npm run readme:demo
 *
 * Needs ffmpeg on the PATH. Chromium is Playwright's own, or CHROMIUM_PATH. Behind an
 * HTTPS proxy (HTTPS_PROXY), the browser uses it for Google Fonts, so the GIF shows the
 * site's real typefaces. Re-run it after a visible change to the editor.
 */
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { chromium, type Page } from '@playwright/test'

const ROOT = path.resolve(__dirname, '..')
const OUT = path.join(ROOT, '.github', 'readme', 'demo.gif')
const PORT = 4187
const BASE = `http://localhost:${PORT}`
const VIEWPORT = { width: 1280, height: 1000 }
/** The GIF's width and frame rate: legible on GitHub, a few MB at most. */
const GIF_WIDTH = 960
const GIF_FPS = 10

/** `{"user":"ada","roles":["admin","dev"],"exp":1790852400}`, Base64-encoded. */
const INPUT = 'eyJ1c2VyIjoiYWRhIiwicm9sZXMiOlsiYWRtaW4iLCJkZXYiXSwiZXhwIjoxNzkwODUyNDAwfQ=='
const STEPS: Array<{ id: string; shows: string }> = [
  { id: 'base64_decode', shows: '"roles"' },
  { id: 'json_pretty', shows: '"admin",' },
  { id: 'json_to_yaml', shows: 'user: ada' },
]

const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

async function startPreview(): Promise<ChildProcess> {
  const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'ignore' })
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(BASE)).ok) return server
    } catch { /* not listening yet */ }
    await pause(500)
  }
  server.kill()
  throw new Error(`vite preview did not answer on ${BASE}`)
}

async function addStep(page: Page, utilityId: string, shows: string) {
  const select = page.getByRole('combobox', { name: 'quick add a utility' })
    .filter({ has: page.locator(`option[value="${utilityId}"]`) })
  await select.selectOption(utilityId)
  await page.getByRole('region', { name: 'result' }).getByText(shows).first().waitFor()
}

async function record(videoDir: string): Promise<{ video: string; startSeconds: number }> {
  const proxy = process.env.HTTPS_PROXY
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    proxy: proxy ? { server: proxy, bypass: 'localhost,127.0.0.1' } : undefined,
  })
  try {
    const context = await browser.newContext({
      viewport: VIEWPORT,
      colorScheme: 'light',
      recordVideo: { dir: videoDir, size: VIEWPORT },
    })
    const recordingStarted = Date.now()
    await context.addInitScript(() => {
      localStorage.setItem('sub:pref:theme', JSON.stringify('light'))
      localStorage.setItem('sub:pref:integrationsSeen', 'true')
    })
    const page = await context.newPage()
    await page.goto(`${BASE}/`)
    const input = page.locator('#pipeline-input')
    await input.waitFor()
    await page.evaluate(() => document.fonts.ready)
    await pause(300)
    // the GIF starts here: the empty editor, fully drawn
    const startSeconds = (Date.now() - recordingStarted) / 1000

    await pause(900)
    await input.click()
    await input.pressSequentially(INPUT, { delay: 12 })
    await pause(900)
    for (const step of STEPS) {
      await addStep(page, step.id, step.shows)
      await pause(1500)
    }
    await pause(1500)

    const video = page.video()
    await context.close()
    if (!video) throw new Error('the browser recorded no video')
    return { video: await video.path(), startSeconds }
  } finally {
    await browser.close()
  }
}

function toGif(video: string, startSeconds: number) {
  mkdirSync(path.dirname(OUT), { recursive: true })
  const filters = [
    `fps=${GIF_FPS}`,
    `scale=${GIF_WIDTH}:-1:flags=lanczos`,
    'split[a][b]',
    '[a]palettegen=max_colors=96:stats_mode=diff[p]',
    '[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle',
  ]
  const ffmpeg = spawnSync('ffmpeg', [
    '-y', '-loglevel', 'error', '-ss', startSeconds.toFixed(2), '-i', video,
    '-filter_complex', `${filters[0]},${filters[1]},${filters[2]};${filters[3]};${filters[4]}`,
    '-loop', '0', OUT,
  ], { stdio: 'inherit' })
  if (ffmpeg.error) throw new Error(`ffmpeg could not run (${ffmpeg.error.message}); install it and try again`)
  if (ffmpeg.status !== 0) throw new Error('ffmpeg failed to write the GIF')
}

async function main() {
  if (!existsSync(path.join(ROOT, 'dist', 'index.html'))) throw new Error('no build in dist/: run `npm run build` first')
  const videoDir = mkdtempSync(path.join(tmpdir(), 'readme-demo-'))
  const server = await startPreview()
  try {
    const { video, startSeconds } = await record(videoDir)
    toGif(video, startSeconds)
    console.log(`[readme-demo] wrote ${path.relative(ROOT, OUT)} (${(statSync(OUT).size / 1024 / 1024).toFixed(1)} MB)`)
  } finally {
    server.kill()
    rmSync(videoDir, { recursive: true, force: true })
  }
}

main().catch(e => {
  console.error(`[readme-demo] ${e instanceof Error ? e.message : String(e)}`)
  process.exit(1)
})
