/**
 * The command palette's registry: plain data + a `run()` that reaches the tool
 * (mounted outside <ToolProvider>) only through window CustomEvents, so it never
 * needs React context. `ToolCommandBridge` (mounted inside ToolPage) executes the
 * tool-scoped ones; the rest are handled by whichever feature owns that event.
 */

/** Tool-scoped commands, executed by `ToolCommandBridge`. */
export type ToolCommandName =
  | 'undo' | 'redo' | 'clear' | 'runNow' | 'toggleLive' | 'togglePreviews'
  | 'enableAll' | 'disableAll' | 'addStep'

export interface ToolCommandDetail {
  command: ToolCommandName
  /** Only for `addStep`. */
  utilityId?: string
}

export const TOOL_COMMAND_EVENT = 'sub:tool-command'
export const EVENT_MAGIC = 'sub:magic'
export const EVENT_OPEN_SHARE = 'sub:open-share'
export const EVENT_OPEN_LIBRARY = 'sub:open-library'
export const EVENT_OPEN_PRESETS = 'sub:open-presets'
/** Opens the describe dialog (the AI pipeline builder, `src/app/generate/`). */
export const EVENT_OPEN_GENERATE = 'sub:open-generate'
export const EVENT_TOGGLE_THEME = 'sub:toggle-theme'
export const EVENT_OPEN_SHORTCUTS = 'sub:open-shortcuts'
export const EVENT_OPEN_PALETTE = 'sub:open-palette'

/** Optional detail of `sub:open-palette`: `{ mode: 'utility' }` opens straight into "Add utility…". */
export interface OpenPaletteDetail { mode?: 'all' | 'utility' }

export function dispatchToolCommand(detail: ToolCommandDetail): void {
  window.dispatchEvent(new CustomEvent<ToolCommandDetail>(TOOL_COMMAND_EVENT, { detail }))
}

// ---------------------------------------------------------------------------
// Bridge presence: whether a pipeline editor (ToolCommandBridge) is on screen
// ---------------------------------------------------------------------------

/** Actions held for a bridge that has not mounted yet are dropped after this long. */
const PENDING_TTL_MS = 10_000
let mountedBridges = 0
let pending: { run: () => void; at: number }[] = []

/** True while a `ToolCommandBridge` is mounted, i.e. some pipeline editor can take tool commands. */
export function hasToolBridge(): boolean {
  return mountedBridges > 0
}

/**
 * Run `action` now when an editor is mounted; otherwise hold it until the next
 * `ToolCommandBridge` mounts (e.g. right after navigating to the tool route,
 * which may render later than any timer would guess).
 */
function whenToolReady(action: () => void): void {
  if (mountedBridges > 0) action()
  else pending.push({ run: action, at: Date.now() })
}

/** Dispatch now when an editor is mounted; otherwise hold the command until one mounts. */
export function queueToolCommand(detail: ToolCommandDetail): void {
  whenToolReady(() => dispatchToolCommand(detail))
}

/**
 * Navigate to the tool. On a pre-rendered page (`/util/<id>/`, `/blog/`…) the path
 * itself routes when the hash is empty, so `#/` alone would stay put: leave the path
 * for the app root (same approach as the utility doc page's "open in tool").
 */
export function goToTool(): void {
  const root = import.meta.env.BASE_URL || '/'
  if (location.pathname === root) { location.hash = '#/'; return }
  history.pushState(history.state, '', `${root}#/`)
  window.dispatchEvent(new HashChangeEvent('hashchange'))
}

/**
 * Run `action` in the pipeline editor: straight away when one is on screen (the
 * home tool or an opened share link), otherwise go to the tool and run it once
 * its editor has mounted.
 */
export function runInTool(action: () => void): void {
  if (mountedBridges > 0) { action(); return }
  whenToolReady(action)
  goToTool()
}

/**
 * Called by `ToolCommandBridge` once it listens for `sub:tool-command`: flushes
 * held actions to it. Returns the matching detach function.
 */
export function attachToolBridge(): () => void {
  mountedBridges++
  const now = Date.now()
  const ready = pending.filter(p => now - p.at < PENDING_TTL_MS)
  pending = []
  // Deferred past the rest of this commit's effects: the tool's own dialogs (share,
  // library, magic…) start listening in sibling effects that may run after this one.
  if (ready.length) queueMicrotask(() => ready.forEach(p => p.run()))
  let attached = true
  return () => { if (attached) { attached = false; mountedBridges-- } }
}

const fire = (name: string) => () => window.dispatchEvent(new CustomEvent(name))
/** For events only the tool page listens to (its toolbar dialogs need `useTool()`). */
const fireInTool = (name: string) => () => runInTool(fire(name))

export interface CommandContext {
  /** Switch the open palette to utility-only search (used by "Add utility…"). */
  setMode?: (mode: 'all' | 'utility') => void
}

export interface Command {
  id: string
  title: string
  /** Extra search terms beyond the title. */
  keywords?: string[]
  /** Display-only shortcut hint, e.g. "Ctrl+Z". */
  shortcut?: string
  group: string
  /** Running this command should leave the palette open (only "Add utility…" today). */
  keepOpen?: boolean
  /** Acts on the open pipeline editor: hidden from the palette when none is mounted. */
  requiresTool?: boolean
  run: (ctx: CommandContext) => void
}

export const commands: Command[] = [
  { id: 'undo', requiresTool: true, title: 'Undo', shortcut: 'Ctrl/Cmd+Z', group: 'Edit', keywords: ['undo'], run: () => dispatchToolCommand({ command: 'undo' }) },
  { id: 'redo', requiresTool: true, title: 'Redo', shortcut: 'Ctrl/Cmd+Shift+Z or Ctrl+Y', group: 'Edit', keywords: ['redo'], run: () => dispatchToolCommand({ command: 'redo' }) },
  { id: 'clear', requiresTool: true, title: 'Clear pipeline', group: 'Edit', keywords: ['clear', 'reset', 'empty'], run: () => dispatchToolCommand({ command: 'clear' }) },
  { id: 'run-now', requiresTool: true, title: 'Run now', shortcut: 'Ctrl/Cmd+Enter', group: 'Run', keywords: ['run', 'execute'], run: () => dispatchToolCommand({ command: 'runNow' }) },
  { id: 'toggle-live', requiresTool: true, title: 'Toggle live/manual run', group: 'Run', keywords: ['live', 'manual', 'auto-run', 'auto run'], run: () => dispatchToolCommand({ command: 'toggleLive' }) },
  { id: 'toggle-previews', requiresTool: true, title: 'Toggle intermediate previews', group: 'View', keywords: ['preview', 'previews', 'intermediate'], run: () => dispatchToolCommand({ command: 'togglePreviews' }) },
  { id: 'enable-all', requiresTool: true, title: 'Enable all steps', group: 'Edit', keywords: ['enable', 'steps', 'all'], run: () => dispatchToolCommand({ command: 'enableAll' }) },
  { id: 'disable-all', requiresTool: true, title: 'Disable all steps', group: 'Edit', keywords: ['disable', 'steps', 'all'], run: () => dispatchToolCommand({ command: 'disableAll' }) },
  {
    id: 'add-utility', title: 'Add utility…', group: 'Edit', keepOpen: true,
    keywords: ['add', 'utility', 'step', 'insert'],
    run: ctx => ctx.setMode?.('utility'),
  },
  { id: 'magic-decode', title: 'Magic decode', group: 'Run', keywords: ['magic', 'detect', 'decode', 'auto'], run: fireInTool(EVENT_MAGIC) },
  { id: 'share', title: 'Share', group: 'Pipeline', keywords: ['share', 'link', 'url'], run: fireInTool(EVENT_OPEN_SHARE) },
  { id: 'library', title: 'Library', group: 'Pipeline', keywords: ['library', 'save', 'load', 'pipelines'], run: fireInTool(EVENT_OPEN_LIBRARY) },
  { id: 'presets', title: 'Start from a preset', group: 'Pipeline', keywords: ['presets', 'recipes', 'examples', 'templates', 'gallery'], run: fireInTool(EVENT_OPEN_PRESETS) },
  { id: 'generate', title: 'Describe a pipeline (AI)', group: 'Pipeline', keywords: ['ai', 'describe', 'generate', 'build', 'prompt', 'natural language'], run: fireInTool(EVENT_OPEN_GENERATE) },
  { id: 'toggle-theme', title: 'Toggle theme', group: 'View', keywords: ['theme', 'dark', 'light', 'mode'], run: fire(EVENT_TOGGLE_THEME) },
  { id: 'shortcuts', title: 'Keyboard shortcuts', group: 'Help', keywords: ['shortcuts', 'help', 'keys'], run: fire(EVENT_OPEN_SHORTCUTS) },
  { id: 'goto-tool', title: 'Go to Tool', group: 'Navigate', keywords: ['tool', 'home', 'pipeline'], run: goToTool },
  { id: 'goto-utilities', title: 'Go to Utilities', group: 'Navigate', keywords: ['utilities', 'browse', 'index'], run: () => { location.hash = '#/utilities' } },
  { id: 'goto-presets', title: 'Go to Presets', group: 'Navigate', keywords: ['presets', 'recipes', 'examples', 'how to', 'pipelines'], run: () => { location.hash = '#/presets' } },
  { id: 'goto-blog', title: 'Go to Blog', group: 'Navigate', keywords: ['blog'], run: () => { location.hash = '#/blog' } },
  { id: 'goto-changelog', title: 'Go to Changelog', group: 'Navigate', keywords: ['changelog', 'history'], run: () => { location.hash = '#/changelog' } },
]

export const commandById = new Map(commands.map(c => [c.id, c]))

// ---------------------------------------------------------------------------
// Shortcuts help
// ---------------------------------------------------------------------------

export interface ShortcutInfo { keys: string; description: string }

/** Shortcuts not tied to a runnable command — pure UI navigation. */
export const GLOBAL_SHORTCUTS: ShortcutInfo[] = [
  { keys: 'Ctrl/Cmd+K or /', description: 'Open the command palette' },
  { keys: '?', description: 'Show keyboard shortcuts' },
  { keys: '↑ / ↓ / Home / End', description: 'Navigate the palette or picker' },
  { keys: 'Enter', description: 'Select the highlighted item' },
  { keys: 'Escape', description: 'Close the palette or dialog (in the picker: clear the search first)' },
]

/** Every shortcut worth showing in the help overlay: globals, then every command that declares one. */
export function listShortcuts(): ShortcutInfo[] {
  return [
    ...GLOBAL_SHORTCUTS,
    ...commands.filter(c => c.shortcut).map(c => ({ keys: c.shortcut!, description: c.title })),
  ]
}
