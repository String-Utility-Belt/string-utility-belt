// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { promoteUnreleased, readJsonVersion, writeJsonVersion } from './version-files'

// formatting JSON.stringify would not reproduce: inline arrays, mixed indentation, escapes
const MANIFEST = `{
  "manifest_version": 3,
  "name": "Ext \\"quoted\\" — \\u00e9",
  "version": "1.4.0",
  "permissions": ["contextMenus", "storage"],
  "nested": { "version": "9.9.9", "list": [ { "version": "0.0.1" }, {"version":"0.0.2"} ] },
  "empty": {}, "nums": [1, -2.5e3, true, null]
}
`

describe('readJsonVersion / writeJsonVersion', () => {
  it('reads the string at a path of keys and indexes', () => {
    expect(readJsonVersion(MANIFEST, ['version'])).toBe('1.4.0')
    expect(readJsonVersion(MANIFEST, ['nested', 'version'])).toBe('9.9.9')
    expect(readJsonVersion(MANIFEST, ['nested', 'list', 1, 'version'])).toBe('0.0.2')
  })

  it('rewrites only that value, leaving every other byte as it was', () => {
    const out = writeJsonVersion(MANIFEST, ['version'], '1.4.1')
    expect(out).toBe(MANIFEST.replace('"version": "1.4.0"', '"version": "1.4.1"'))
    const nested = writeJsonVersion(MANIFEST, ['nested', 'list', 1, 'version'], '0.0.3')
    expect(nested).toBe(MANIFEST.replace('{"version":"0.0.2"}', '{"version":"0.0.3"}'))
  })

  it('finds the key "" (package-lock.json\'s root package entry)', () => {
    const lock = '{\n  "version": "1.0.0",\n  "packages": {\n    "": {\n      "version": "1.0.0"\n    },\n    "node_modules/a": { "version": "2.0.0" }\n  }\n}\n'
    const out = writeJsonVersion(lock, ['packages', '', 'version'], '1.0.1')
    expect(JSON.parse(out).packages['']).toEqual({ version: '1.0.1' })
    expect(JSON.parse(out).packages['node_modules/a'].version).toBe('2.0.0')
    expect(JSON.parse(out).version).toBe('1.0.0')
  })

  it('reads and rewrites a version after a prefix, such as a package pinned in an npx argument', () => {
    const mcp = '{\n  "mcpServers": {\n    "x": { "command": "npx", "args": ["-y", "@scope/pkg@1.7.0"] }\n  }\n}\n'
    const pointer = ['mcpServers', 'x', 'args', 1]
    expect(readJsonVersion(mcp, pointer, '@scope/pkg@')).toBe('1.7.0')
    expect(writeJsonVersion(mcp, pointer, '1.7.1', '@scope/pkg@')).toBe(mcp.replace('@scope/pkg@1.7.0', '@scope/pkg@1.7.1'))
  })

  it('refuses a value that does not start with the prefix, rather than overwrite it', () => {
    const mcp = '{ "args": ["-y", "@other/pkg@1.7.0"] }'
    expect(() => readJsonVersion(mcp, ['args', 1], '@scope/pkg@')).toThrow(/\["args"\]\[1\] does not start with "@scope\/pkg@"/)
    expect(() => writeJsonVersion(mcp, ['args', 1], '1.7.1', '@scope/pkg@')).toThrow(/does not start with/)
  })

  it('refuses missing paths and non-string values', () => {
    expect(() => readJsonVersion(MANIFEST, ['nope'])).toThrow(/no value at \["nope"\]/)
    expect(() => readJsonVersion(MANIFEST, ['nested', 'list', 5])).toThrow(/no value/)
    expect(() => readJsonVersion(MANIFEST, ['manifest_version'])).toThrow(/not a string/)
    expect(() => readJsonVersion(MANIFEST, ['permissions', 'x'])).toThrow(/no value/)
  })
})

describe('promoteUnreleased', () => {
  const CHANGELOG = [
    '# Changelog', '', '## [Unreleased]', '', '### Fixed', '', '- A fix.', '', '## [1.4.0] - 2026-10-06', '', '- Old.', '',
  ].join('\n')

  it('moves [Unreleased] entries under the new version and leaves [Unreleased] empty', () => {
    expect(promoteUnreleased(CHANGELOG, '1.4.1', '2026-10-07')).toBe([
      '# Changelog', '', '## [Unreleased]', '', '## [1.4.1] - 2026-10-07', '', '### Fixed', '', '- A fix.', '',
      '## [1.4.0] - 2026-10-06', '', '- Old.', '',
    ].join('\n'))
  })

  it('promotes a trailing [Unreleased] section with no release after it', () => {
    expect(promoteUnreleased('## [Unreleased]\n- Only.\n', '0.1.0', '2026-01-01')).toBe('## [Unreleased]\n\n## [0.1.0] - 2026-01-01\n\n- Only.\n')
  })

  it('does nothing when [Unreleased] is empty or missing', () => {
    expect(promoteUnreleased('# Changelog\n\n## [Unreleased]\n\n## [1.0.0]\n', '1.0.1', '2026-01-01')).toBeNull()
    expect(promoteUnreleased('# Changelog\n\n## [1.0.0]\n- x\n', '1.0.1', '2026-01-01')).toBeNull()
  })

  it('refuses to write a second section for a version that already has one', () => {
    expect(() => promoteUnreleased(CHANGELOG, '1.4.0', '2026-10-07')).toThrow(/already has a section for 1\.4\.0/)
  })
})
