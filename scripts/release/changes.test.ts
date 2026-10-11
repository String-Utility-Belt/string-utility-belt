// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { affectedBy, deepEqual, shipsPath, type ChangeSet } from './changes'
import { targetById } from './targets'

const app = targetById('app')
const cli = targetById('cli')
const mcp = targetById('mcp')
const extension = targetById('extension')

function change(files: string[], before: Record<string, unknown> = {}, after: Record<string, unknown> = {}): ChangeSet {
  const text = (side: Record<string, unknown>, path: string) => (path in side ? JSON.stringify(side[path], null, 2) : null)
  return { files, before: p => text(before, p), after: p => text(after, p) }
}

const lock = (packages: Record<string, unknown>) => ({ name: 'x', version: '1.0.0', lockfileVersion: 3, packages })

describe('shipsPath', () => {
  it('ships the engine in every package, and the guides only on the site', () => {
    for (const target of [app, cli, mcp, extension]) {
      expect(shipsPath(target, 'src/core/runner.ts'), target.id).toBe(true)
      expect(shipsPath(target, 'src/utilities/pad/index.ts'), target.id).toBe(true)
    }
    expect(shipsPath(app, 'src/utilities/pad/guide.md')).toBe(true)
    expect(shipsPath(cli, 'src/utilities/pad/guide.md')).toBe(false)
    expect(shipsPath(app, 'src/utilities/_generated/headings.ts')).toBe(true)
    expect(shipsPath(cli, 'src/utilities/_generated/headings.ts')).toBe(false)
    expect(shipsPath(cli, 'src/utilities/guideCheck.ts')).toBe(false)
    expect(shipsPath(cli, 'src/utilities/_generated/posts.ts')).toBe(false)
  })

  it('keeps each package to its own directory', () => {
    expect(shipsPath(cli, 'packages/cli/src/main.ts')).toBe(true)
    expect(shipsPath(cli, 'packages/mcp/src/server.ts')).toBe(false)
    expect(shipsPath(app, 'packages/cli/src/main.ts')).toBe(false)
    expect(shipsPath(mcp, 'server.json')).toBe(true)
    expect(shipsPath(cli, 'server.json')).toBe(false)
  })

  it('never ships tests, fixtures, store copy or release tooling', () => {
    for (const path of ['src/core/runner.test.ts', 'src/utilities/__properties__/base64.test.ts', 'scripts/__fixtures__/sample-dist/index.html']) {
      expect(shipsPath(app, path), path).toBe(false)
      expect(shipsPath(cli, path), path).toBe(false)
    }
    expect(shipsPath(extension, 'packages/extension/tests/icons.test.ts')).toBe(false)
    expect(shipsPath(extension, 'packages/extension/store-listing/description.md')).toBe(false)
    expect(shipsPath(app, 'scripts/release/plan.ts')).toBe(false)
    expect(shipsPath(app, 'scripts/release.ts')).toBe(false)
    expect(shipsPath(app, 'scripts/check-bundle.ts')).toBe(false)
    expect(shipsPath(app, 'scripts/seo/build.ts')).toBe(true)
    expect(shipsPath(app, '.github/workflows/ci.yml')).toBe(false)
  })
})

describe('affectedBy', () => {
  it('lists the shipped paths that changed', () => {
    expect(affectedBy(cli, change(['packages/cli/README.md', 'README.md', 'src/core/a.test.ts']))).toEqual(['packages/cli/README.md'])
    expect(affectedBy(cli, change(['README.md', '.github/workflows/ci.yml']))).toEqual([])
  })

  it('caps the reasons it lists', () => {
    const files = Array.from({ length: 8 }, (_, i) => `src/core/f${i}.ts`)
    expect(affectedBy(cli, change(files))).toEqual([...files.slice(0, 5), '…and 3 more'])
  })

  it('ignores a root package.json version change for everyone', () => {
    const c = change(['package.json'], { 'package.json': { name: 'x', version: '1.0.0' } }, { 'package.json': { name: 'x', version: '1.0.1' } })
    expect(affectedBy(app, c)).toEqual([])
    expect(affectedBy(cli, c)).toEqual([])
  })

  it('counts any other root package.json change for the app, but only the dependencies a package bundles', () => {
    const scripts = change(['package.json'],
      { 'package.json': { scripts: { a: '1' }, devDependencies: { vite: '7' } } },
      { 'package.json': { scripts: { a: '2' }, devDependencies: { vite: '8' } } })
    expect(affectedBy(app, scripts)).toEqual(['package.json'])
    expect(affectedBy(cli, scripts, new Set(['yaml']))).toEqual([])

    const deps = change(['package.json'],
      { 'package.json': { dependencies: { yaml: '2.8', react: '18.2' }, devDependencies: { fflate: '0.8.2' } } },
      { 'package.json': { dependencies: { yaml: '2.9', react: '18.3' }, devDependencies: { fflate: '0.8.3' } } })
    // a bundled devDependency counts like any other; react isn't in this build
    expect(affectedBy(cli, deps, new Set(['yaml', 'fflate']))).toEqual(['package.json (yaml, fflate)'])
    expect(affectedBy(cli, deps, new Set(['zod']))).toEqual([])
  })

  it('reads package-lock.json: any package matters to the app, only bundled ones and their dependencies to a package', () => {
    const before = lock({
      '': { version: '1.0.0', dependencies: { yaml: '^2', react: '^18' } },
      'node_modules/yaml': { version: '2.8.0', dependencies: { 'yaml-helper': '^1' } },
      'node_modules/yaml-helper': { version: '1.0.0' },
      'node_modules/react': { version: '18.2.0' },
      'node_modules/vite': { version: '7.0.0', dev: true },
    })
    const bump = (pkgs: Record<string, string>) => {
      const after = structuredClone(before) as { packages: Record<string, { version: string }> }
      for (const [key, version] of Object.entries(pkgs)) after.packages[key].version = version
      return change(['package-lock.json'], { 'package-lock.json': before }, { 'package-lock.json': after })
    }
    const bundlesYaml = new Set(['yaml'])

    expect(affectedBy(app, bump({ 'node_modules/vite': '7.1.0' }))).toEqual(['package-lock.json (package: vite)'])
    expect(affectedBy(cli, bump({ 'node_modules/vite': '7.1.0' }), bundlesYaml)).toEqual([])
    expect(affectedBy(cli, bump({ 'node_modules/react': '18.3.0' }), bundlesYaml)).toEqual([])
    expect(affectedBy(cli, bump({ 'node_modules/yaml-helper': '1.0.1' }), bundlesYaml)).toEqual(['package-lock.json (bundled package: yaml-helper)'])
    expect(affectedBy(cli, bump({ 'node_modules/yaml': '2.9.0', 'node_modules/react': '18.3.0' }), bundlesYaml))
      .toEqual(['package-lock.json (bundled package: yaml)'])
  })

  it('counts a bundled package\'s dependency that a change removes', () => {
    const before = lock({ 'node_modules/yaml': { version: '2.8.0', dependencies: { old: '^1' } }, 'node_modules/old': { version: '1.0.0' } })
    const after = lock({ 'node_modules/yaml': { version: '2.8.0' } })
    expect(affectedBy(cli, change(['package-lock.json'], { 'package-lock.json': before }, { 'package-lock.json': after }), new Set(['yaml'])))
      .toEqual(['package-lock.json (bundled packages: yaml, old)'])
  })

  it('ignores the lockfile\'s own copy of the root version', () => {
    const c = change(['package-lock.json'],
      { 'package-lock.json': { ...lock({ '': { name: 'x', version: '1.0.0' } }), version: '1.0.0' } },
      { 'package-lock.json': { ...lock({ '': { name: 'x', version: '1.0.1' } }), version: '1.0.1' } })
    expect(affectedBy(app, c)).toEqual([])
    expect(affectedBy(cli, c, new Set(['yaml']))).toEqual([])
  })

  it('treats a manifest added or removed like any other change', () => {
    const added = change(['package.json'], {}, { 'package.json': { dependencies: { a: '1' } } })
    expect(affectedBy(cli, added, new Set(['a']))).toEqual(['package.json (a)'])
  })
})

describe('deepEqual', () => {
  it('compares structure, not key order', () => {
    expect(deepEqual({ a: 1, b: [1, { c: 2 }] }, { b: [1, { c: 2 }], a: 1 })).toBe(true)
    expect(deepEqual({ a: 1 }, { a: 1, b: undefined })).toBe(false)
    expect(deepEqual([1, 2], { 0: 1, 1: 2 })).toBe(false)
    expect(deepEqual(null, {})).toBe(false)
  })
})
