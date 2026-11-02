import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { installBrowserSandbox } from '@/app/sandbox/browserSandbox'
import { registerSW } from '@/app/pwa/registerSW'
import { getRoute } from '@/lib/router'
import { preloadPresetRoute } from '@/app/pages/presets/routes'
import { preloadStepListFor } from '@/app/tool/stepListChunk'
// self-hosted variable fonts (weight axis), bundled into /assets: no third-party font request.
// Imported here, not from index.css: Tailwind's @import inlining would not rebase their url()s.
import '@fontsource-variable/instrument-sans/wght.css'
import '@fontsource-variable/jetbrains-mono/wght.css'
import './index.css'

// custom JavaScript steps run in a sandboxed iframe + worker; without this they refuse to run
installBrowserSandbox()
// offline support + update notifications (production only, never inside an embed iframe)
registerSW()

/**
 * Longest wait for a page's code and data before mounting anyway. Meanwhile the
 * pre-rendered HTML stays on screen, so a preset page (or the tool opening on a
 * pipeline with steps) is replaced by the finished page rather than by a "Loading…"
 * state; past this the page loads as usual.
 */
const PRELOAD_CAP_MS = 2500

function mount() {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )
}

let cap: ReturnType<typeof setTimeout> | undefined
const route = getRoute()
Promise.race([
  Promise.all([preloadPresetRoute(route), preloadStepListFor(route)]),
  new Promise(resolve => { cap = setTimeout(resolve, PRELOAD_CAP_MS) }),
])
  .catch(() => { /* a failed chunk shows its own error once mounted */ })
  .finally(() => {
    clearTimeout(cap)
    mount()
  })
