import type { Plugin, ViteDevServer } from 'vite'
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

/** vite-node's CLI script, read from its `bin` so a release that moves the file doesn't break regeneration. */
function viteNodeCli(root: string): string {
  const manifestPath = createRequire(path.join(root, 'package.json')).resolve('vite-node/package.json')
  const { bin } = JSON.parse(readFileSync(manifestPath, 'utf8')) as { bin: string | Record<string, string> }
  return path.resolve(path.dirname(manifestPath), typeof bin === 'string' ? bin : bin['vite-node'])
}

/**
 * Dev-server only: regenerate the utility manifest and the preset index when a
 * utility (or its guide, whose title gives the page's heading), a preset or the blog manifest (which posts each
 * utility page links to) is added, removed or edited, so "create a folder and it
 * appears" keeps working without restarting `npm run dev`. The generators write
 * only files whose content changed, and Vite's HMR picks those up.
 */
export function utilityManifest(): Plugin {
  const UTILITY_FILE = /[\\/](?:src[\\/](?:utilities[\\/][^\\/_][^\\/]*[\\/](?:index\.tsx?|guide\.md)|presets[\\/][^\\/_][^\\/]*[\\/]preset\.ts)|public[\\/]blog[\\/]_manifest\.json)$/
  let timer: ReturnType<typeof setTimeout> | undefined
  let running = false
  let pending = false
  let cli: string | undefined

  const run = (server: ViteDevServer) => {
    if (running) { pending = true; return }
    running = true
    const root = server.config.root
    cli ??= viteNodeCli(root)
    const child = spawn(process.execPath, [cli, 'scripts/gen.ts'], {
      cwd: root, stdio: ['ignore', 'inherit', 'inherit'],
    })
    child.on('exit', () => {
      running = false
      if (pending) { pending = false; run(server) }
    })
  }

  return {
    name: 'utility-manifest',
    apply: 'serve',
    configureServer(server) {
      // vitest also spins up a Vite server; the manifest freshness test covers it
      if (process.env.VITEST) return
      const onFs = (file: string) => {
        if (!UTILITY_FILE.test(file)) return
        clearTimeout(timer)
        timer = setTimeout(() => run(server), 300)
      }
      server.watcher.on('add', onFs)
      server.watcher.on('unlink', onFs)
      server.watcher.on('change', onFs)
    },
  }
}
