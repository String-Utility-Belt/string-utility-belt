import type { BumpLevel } from './semver'
import type { VersionFile } from './version-files'

export type TargetId = 'app' | 'core' | 'cli' | 'mcp' | 'extension' | 'vscode'

/**
 * Something this repo ships on its own version: the site, or one of the
 * packages. Each is released when what it ships has changed since its last
 * release tag (`<id>-v<version>`), and only then.
 */
export interface Target {
  id: TargetId
  title: string
  /**
   * `auto`: released by every run after CI passes on main. `manual`: only when a run
   * is started by hand and asks for it (changes wait until then).
   */
  trigger: 'auto' | 'manual'
  /** Repo-relative globs (see `glob.ts`) for the files that end up in, or build, what ships. */
  include: readonly string[]
  /** Paths under `include` that never ship (tests, fixtures, store listing copy). */
  exclude: readonly string[]
  /**
   * How a change to the root `package.json` / `package-lock.json` counts (the root
   * version itself never does): `all` — any change, for the target whose build
   * tooling lives there; `bundled` — only changes to the npm packages its build
   * `entries` import, and to their dependencies, which is what it ships.
   */
  rootManifest: 'all' | 'bundled'
  /** The build's entry points (modules, or HTML pages), whose imports decide what `bundled` covers. */
  entries: readonly string[]
  /** Every place the version is written. All of them must agree; a release rewrites them together. */
  versionFiles: readonly VersionFile[]
  /** A Keep a Changelog file whose `[Unreleased]` section becomes the new version's section. */
  changelog?: string
}

/** Every package bundles the framework-free engine and every utility (but not their guides). */
const ENGINE = ['src/core/**', 'src/types/**', 'src/utilities/**']

/** Never part of anything shipped, wherever they sit. */
const NOT_SHIPPED = [
  '**/*.test.{ts,tsx,js,jsx,mjs}',
  '**/__fixtures__/**',
  '**/__properties__/**',
  '**/test-helpers/**',
  '**/tests/**',
]

const PACKAGE_EXCLUDE = [...NOT_SHIPPED, 'src/utilities/*/guide.md']

export const TARGETS: readonly Target[] = [
  {
    id: 'app',
    title: 'Web app (stringutilitybelt.com)',
    trigger: 'auto',
    include: [
      'src/**', 'public/**', 'worker/**', 'scripts/**',
      'index.html', 'vite.config.ts', 'postcss.config.js', 'wrangler.jsonc', 'CHANGELOG.md',
    ],
    // release tooling, CI-only checks and the README's demo recorder don't change the deployed site
    exclude: [...NOT_SHIPPED, 'scripts/release.ts', 'scripts/release/**', 'scripts/check-*.ts', 'scripts/readme-demo.ts'],
    rootManifest: 'all',
    entries: [],
    versionFiles: [
      { path: 'package.json', pointer: ['version'] },
      { path: 'package-lock.json', pointer: ['version'] },
      { path: 'package-lock.json', pointer: ['packages', '', 'version'] },
    ],
    changelog: 'CHANGELOG.md',
  },
  {
    id: 'core',
    title: '@string-utility-belt/core (npm)',
    trigger: 'auto',
    include: [...ENGINE, 'packages/core/**'],
    exclude: PACKAGE_EXCLUDE,
    rootManifest: 'bundled',
    entries: ['packages/core/src/index.ts'],
    versionFiles: [{ path: 'packages/core/package.json', pointer: ['version'] }],
  },
  {
    id: 'cli',
    title: 'subelt CLI (npm)',
    trigger: 'auto',
    include: [...ENGINE, 'packages/cli/**'],
    exclude: PACKAGE_EXCLUDE,
    rootManifest: 'bundled',
    entries: ['packages/cli/src/bin.ts'],
    versionFiles: [{ path: 'packages/cli/package.json', pointer: ['version'] }],
  },
  {
    id: 'mcp',
    title: '@string-utility-belt/mcp (npm + MCP Registry)',
    trigger: 'auto',
    include: [...ENGINE, 'packages/mcp/**', 'server.json'],
    exclude: [...PACKAGE_EXCLUDE, 'packages/mcp/assets/screenshots/**'],
    rootManifest: 'bundled',
    entries: ['packages/mcp/src/bin.ts'],
    versionFiles: [
      { path: 'packages/mcp/package.json', pointer: ['version'] },
      { path: 'packages/mcp/manifest.json', pointer: ['version'] },
      { path: 'server.json', pointer: ['version'] },
      { path: 'server.json', pointer: ['packages', 0, 'version'] },
    ],
  },
  {
    id: 'extension',
    title: 'Browser extension (Chrome Web Store)',
    trigger: 'manual',
    include: [...ENGINE, 'packages/extension/**'],
    exclude: [...PACKAGE_EXCLUDE, 'packages/extension/store-listing/**'],
    rootManifest: 'bundled',
    entries: ['packages/extension/src/background.ts', 'packages/extension/popup.html', 'packages/extension/options.html'],
    versionFiles: [{ path: 'packages/extension/manifest.json', pointer: ['version'] }],
  },
  {
    id: 'vscode',
    title: 'VS Code extension (Marketplace)',
    trigger: 'auto',
    include: [...ENGINE, 'packages/vscode/**'],
    exclude: [...PACKAGE_EXCLUDE, 'packages/vscode/vitest.config.ts'],
    rootManifest: 'bundled',
    entries: ['packages/vscode/src/extension.ts'],
    versionFiles: [{ path: 'packages/vscode/package.json', pointer: ['version'] }],
  },
]

/** Ids of the targets started by hand, e.g. for `plan --manual`. */
export const MANUAL_TARGETS: readonly TargetId[] = TARGETS.filter(t => t.trigger === 'manual').map(t => t.id)

export function targetById(id: string): Target {
  const target = TARGETS.find(t => t.id === id)
  if (!target) throw new Error(`unknown release target "${id}" (expected one of ${TARGETS.map(t => t.id).join(', ')})`)
  return target
}

/** Release tags are `<id>-v<version>`, e.g. `cli-v1.3.1`. */
export function releaseTag(id: TargetId, version: string): string {
  return `${id}-v${version}`
}

/** Labels on a merged pull request that raise the bump level of the targets it changed. */
export const LEVEL_LABELS: ReadonlyMap<string, BumpLevel> = new Map([['release:major', 'major'], ['release:minor', 'minor']])

/** Subject prefix of the commits the release workflow pushes (version bumps and changelog promotion). */
export const RELEASE_COMMIT_PREFIX = 'chore(release): '
