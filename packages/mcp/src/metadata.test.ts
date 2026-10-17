// @vitest-environment node
/**
 * The server describes itself in several places: what it answers `initialize` with (server.ts), its npm
 * package (package.json), the MCP Registry entry (server.json), the .mcpb manifest (manifest.json), the
 * Claude plugin (plugins/string-utility-belt) and the READMEs. Directories read different ones, so they
 * must agree.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import type { Tool } from '@modelcontextprotocol/sdk/types.js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import pluginMcp from '../../../plugins/string-utility-belt/.mcp.json'
import plugin from '../../../plugins/string-utility-belt/.claude-plugin/plugin.json'
import registryEntry from '../../../server.json'
import { staticRegistry } from '../../../src/utilities/static-registry'
import manifest from '../manifest.json'
import pkg from '../package.json'
import { SERVER_ICONS, SERVER_TITLE, createServer } from './server'

const PACKAGE_DIR = path.resolve(__dirname, '..')
const ROOT = path.resolve(PACKAGE_DIR, '../..')
const PLUGIN_DIR = path.join(ROOT, 'plugins/string-utility-belt')

/** Every file under `dir`, relative to it. */
function filesUnder(dir: string, rel = ''): string[] {
  return readdirSync(path.join(dir, rel), { withFileTypes: true }).flatMap(entry => {
    const child = rel ? `${rel}/${entry.name}` : entry.name
    return entry.isDirectory() ? filesUnder(dir, child) : [child]
  })
}

/** The `## heading` section of a Markdown file, up to the next `## `. */
function section(markdown: string, heading: string): string {
  return markdown.split(new RegExp(`^## ${heading}$`, 'm'))[1]?.split(/^## /m)[0] ?? ''
}

/** Width and height from a PNG's IHDR chunk. */
function pngSize(file: string) {
  const bytes = readFileSync(file)
  expect([...bytes.subarray(1, 4)].map(b => String.fromCharCode(b)).join(''), file).toBe('PNG')
  return `${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`
}

describe('MCP server metadata', () => {
  let client: Client
  let server: ReturnType<typeof createServer>
  let tools: Tool[]

  beforeAll(async () => {
    server = createServer()
    client = new Client({ name: 'test-client', version: '0.0.0' })
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)])
    ;({ tools } = await client.listTools())
  })

  afterAll(async () => {
    await client.close()
    await server.close()
  })

  describe('initialize', () => {
    it('identifies the server as its npm package and MCP Registry entry do', () => {
      expect(client.getServerVersion()).toEqual({
        name: 'subelt',
        title: registryEntry.title,
        version: pkg.version,
        description: pkg.description,
        websiteUrl: pkg.homepage,
        icons: registryEntry.icons,
      })
    })

    it('gives instructions that count the utilities and name every tool', () => {
      const instructions = client.getInstructions() ?? ''
      expect(instructions).toContain(`${staticRegistry.list().length} string and data transformations`)
      for (const tool of tools) expect(instructions, tool.name).toContain(tool.name)
    })
  })

  describe('tools', () => {
    // Anthropic's directory requires both; Claude decides from the hint whether a call needs confirmation.
    it('each have a title and say whether they are read-only or destructive', () => {
      for (const tool of tools) {
        expect(tool.title, tool.name).toBeTruthy()
        expect(tool.annotations?.readOnlyHint ?? tool.annotations?.destructiveHint, tool.name).toBeTypeOf('boolean')
      }
    })

    it('are the ones manifest.json lists', () => {
      expect(manifest.tools.map(t => t.name).sort()).toEqual(tools.map(t => t.name).sort())
    })
  })

  describe('manifest.json (.mcpb)', () => {
    it('carries the same name, description and links as the package', () => {
      expect(manifest).toMatchObject({
        name: pkg.name,
        display_name: SERVER_TITLE,
        description: pkg.description,
        homepage: pkg.homepage,
        license: pkg.license,
        compatibility: { runtimes: { node: pkg.engines.node } },
      })
    })

    it('links a privacy policy over HTTPS, which the README links too', () => {
      const privacy = section(readFileSync(path.join(PACKAGE_DIR, 'README.md'), 'utf8'), 'Privacy Policy')
      expect(manifest.privacy_policies.length).toBeGreaterThan(0)
      for (const url of manifest.privacy_policies) {
        expect(new URL(url).protocol, url).toBe('https:')
        expect(privacy, `README "## Privacy Policy" links ${url}`).toContain(`](${url})`)
      }
    })

    it('has the 512 px icon Claude Desktop asks for', () => {
      expect(pngSize(path.join(PACKAGE_DIR, manifest.icon))).toBe('512x512')
    })

    // A count here is stale the day a utility is added; the server reports the live one.
    it('states no utility count', () => {
      for (const tool of manifest.tools) expect(tool.description, tool.name).not.toMatch(/\d+ utilities/)
    })
  })

  describe('server.json (MCP Registry)', () => {
    it('carries the same title, description and website as the package', () => {
      expect(registryEntry).toMatchObject({
        title: SERVER_TITLE,
        description: pkg.description,
        websiteUrl: pkg.homepage,
      })
    })

    it('points into the monorepo at the package it publishes', () => {
      expect(registryEntry.repository.subfolder).toBe(pkg.repository.directory)
    })

    it('lists the icons the server reports, served by the site at their declared sizes', () => {
      expect(registryEntry.icons).toEqual(SERVER_ICONS)
      const site = new URL(registryEntry.websiteUrl)
      for (const icon of registryEntry.icons) {
        const url = new URL(icon.src)
        expect(url.origin, icon.src).toBe(site.origin)
        expect(icon.sizes, icon.src).toEqual([pngSize(path.join(ROOT, 'public', url.pathname))])
      }
    })
  })

  // What Anthropic's plugin directory checks: https://claude.com/docs/plugins/pre-submission-checklist
  describe('Claude plugin (plugins/string-utility-belt)', () => {
    it('lists the same name, publisher and links as the .mcpb', () => {
      expect(plugin).toMatchObject({
        displayName: SERVER_TITLE,
        version: pkg.version,
        license: pkg.license,
        author: { name: manifest.author.name, email: manifest.author.email },
        supportUrl: manifest.support,
      })
      expect(manifest.privacy_policies).toContain(plugin.privacyPolicyUrl)
      for (const url of [plugin.homepage, plugin.documentationUrl, plugin.supportUrl, plugin.privacyPolicyUrl]) {
        expect(new URL(url).protocol, url).toBe('https:')
      }
    })

    it('starts the npm package at exactly this version: the directory blocks an unpinned npx package', () => {
      expect(pluginMcp.mcpServers).toEqual({
        subelt: { command: 'npx', args: ['-y', `${pkg.name}@${pkg.version}`] },
      })
    })

    it('has the 512 px icon its manifest names', () => {
      expect(pngSize(path.join(PLUGIN_DIR, plugin.icon))).toBe('512x512')
    })

    it('has a README of at least 40 words outside code that names every tool and links the privacy policy', () => {
      const readme = readFileSync(path.join(PLUGIN_DIR, 'README.md'), 'utf8')
      const prose = readme.replace(/^```[\s\S]*?^```/gm, '')
      expect(prose.split(/\s+/).filter(Boolean).length).toBeGreaterThanOrEqual(40)
      for (const tool of manifest.tools) expect(readme, tool.name).toContain(`\`${tool.name}\``)
      expect(section(readme, 'Privacy Policy')).toContain(`](${plugin.privacyPolicyUrl})`)
    })

    it('carries the repository\'s MIT license text, which installed copies must include', () => {
      expect(readFileSync(path.join(PLUGIN_DIR, 'LICENSE'), 'utf8')).toBe(readFileSync(path.join(ROOT, 'LICENSE'), 'utf8'))
    })

    it('holds nothing the directory blocks or holds for review', () => {
      const files = filesUnder(PLUGIN_DIR)
      // a package-manager config could point npx at another registry; a lockfile installs on every user's machine
      const forbidden = /(^|\/)(\.npmrc|\.yarnrc(\.yml)?|bunfig\.toml|uv\.toml|pip\.conf|package\.json|package-lock\.json|\.DS_Store|Thumbs\.db|desktop\.ini)$/
      expect(files.filter(f => forbidden.test(f))).toEqual([])
      // claude.ai and Cowork refuse to install a plugin with a top-level bin/
      expect(files.filter(f => f.startsWith('bin/'))).toEqual([])
      expect(files.length).toBeLessThanOrEqual(512)
      for (const file of files) {
        const limit = file.endsWith('.png') ? 5 * 1024 * 1024 : 256 * 1024
        expect(statSync(path.join(PLUGIN_DIR, file)).size, file).toBeLessThan(limit)
      }
    })
  })
})
