import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { SANDBOX_BOOTSTRAP_SCRIPT } from '../src/app/sandbox/frame'
import { hashSource, inlineScripts, pageViolations, parseCsp, stylesheetViolations } from './csp'
import { headersOf, parseHeadersFile, siteHeaders } from './headers'

const root = path.resolve(__dirname, '..')
const policy = siteHeaders(path.join(root, 'public'))['Content-Security-Policy']
const csp = parseCsp(policy ?? '')
const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8')

describe('the site CSP (public/_headers)', () => {
  it('is set for every page', () => {
    expect(policy).toBeTruthy()
  })

  it('allows exactly the inline scripts the site runs, by hash', () => {
    const expected = [
      ...inlineScripts(indexHtml).map(s => ({ hash: hashSource(s), what: `index.html: ${s.trim().split('\n')[0]}` })),
      { hash: hashSource(SANDBOX_BOOTSTRAP_SCRIPT), what: 'SANDBOX_BOOTSTRAP_SCRIPT (src/app/sandbox/frame.ts)' },
    ]
    const listed = (csp.get('script-src') ?? []).filter(s => s.startsWith("'sha256-"))
    const missing = expected.filter(e => !listed.includes(e.hash)).map(e => `add ${e.hash} for ${e.what}`)
    const stale = listed.filter(h => !expected.some(e => e.hash === h)).map(h => `remove ${h}`)
    expect([...missing, ...stale], "update script-src in public/_headers").toEqual([])
    expect(inlineScripts(indexHtml)).toHaveLength(1)
  })

  it('never allows inline script or script from anywhere but this site and Cloudflare Web Analytics', () => {
    const scriptSrc = csp.get('script-src')!
    expect(scriptSrc).not.toContain("'unsafe-inline'")
    expect(scriptSrc).not.toContain('data:')
    expect(scriptSrc.filter(s => /^https?:|^\*/.test(s))).toEqual(['https://static.cloudflareinsights.com'])
    expect(csp.get('default-src')).toEqual(["'self'"])
    expect(csp.get('object-src')).toEqual(["'none'"])
    expect(csp.get('base-uri')).toEqual(["'self'"])
    expect(csp.get('worker-src')).toEqual(["'self'", 'blob:'])
  })

  it("lets a request to this site through, so only the sandbox frame's own policy can block the Worker's probe", () => {
    // src/app/sandbox/frame.ts: the Worker refuses to run code unless that request fails
    expect(csp.get('connect-src')).toContain("'self'")
  })

  it('loads fonts and stylesheets from this site only (the fonts are self-hosted)', () => {
    expect(csp.get('font-src')).toEqual(["'self'"])
    expect(csp.get('style-src')?.filter(s => /^https?:|^\*/.test(s))).toEqual([])
    expect(indexHtml).not.toMatch(/<link[^>]+href="(?:https?:)?\/\//)
  })

  it('leaves the page frameable, for the #/embed widget', () => {
    expect(csp.has('frame-ancestors')).toBe(false)
    expect(Object.keys(siteHeaders(path.join(root, 'public')))).not.toContain('X-Frame-Options')
  })

  it('stays clear of Google advertising and analytics hosts', () => {
    const google = /googlesyndication|adservice|adsbygoogle|google-adsense|googletagmanager|google-analytics|doubleclick|gtag\(/
    expect(policy).not.toMatch(google)
    expect(indexHtml).not.toMatch(google)
  })
})

describe('pageViolations', () => {
  const allow = (script: string) => `script-src 'self' ${hashSource(script)}`

  it('passes a page whose inline scripts are all listed, ignoring data blocks and external scripts', () => {
    const html = '<script>run()</script><script type="application/json">{"a":"<b>"}</script>' +
      '<script type="application/ld+json">{}</script><script type="module" src="/x.js"></script>'
    expect(pageViolations(html, allow('run()'))).toEqual([])
  })

  it('reports an inline script whose hash is not listed, including module scripts', () => {
    expect(pageViolations('<script>a()</script>', allow('b()'))[0]).toMatch(/^inline script 'sha256-.*' is not in/)
    expect(pageViolations('<script type="module">a()</script>', allow('b()'))).toHaveLength(1)
  })

  it('hashes the script as a browser sees it, with CRLF turned into LF', () => {
    expect(pageViolations('<script>a()\r\nb()</script>', allow('a()\nb()'))).toEqual([])
  })

  it('ends a script where a browser does, so a data block cannot hide the script after it', () => {
    const page = '<script type="application/json">{}</script foo><script>a()</script\t><script>b()</script/>'
    expect(pageViolations(page, allow('b()'))).toEqual([expect.stringMatching(/^inline script 'sha256-/)])
  })

  it('reports inline event handlers however the markup spells them, in templates and SVG too', () => {
    const page = '<img/onerror=go()><IMG ONLOAD="go()"><svg><rect onclick="go()"/></svg><template><b onmouseover=go()></b></template>' +
      '<!-- <img onerror=go()> --><p>onerror=go()</p>'
    expect(pageViolations(page, "script-src 'self'").map(p => p.split(' is ')[0])).toEqual([
      'inline event handler onerror= on <img>', 'inline event handler onload= on <img>',
      'inline event handler onclick= on <rect>', 'inline event handler onmouseover= on <b>',
    ])
  })

  it('reports javascript: URLs however they are written, and nothing else', () => {
    const page = '<a href="&#106;avascript:go()">a</a><a href=" java&#9;script:go()">b</a><button formaction="JavaScript:go()">c</button>' +
      '<svg><a xlink:href="javascript:go()"><text>d</text></a></svg><a href="/javascript-guide/">e</a><a href="https://example.com/?javascript:">f</a>'
    expect(pageViolations(page, "script-src 'self'").map(p => p.split(': <')[1])).toEqual([
      'a href="javascript:go()">', 'a href="java\tscript:go()">', 'button formaction="JavaScript:go()">', 'a href="javascript:go()">',
    ])
  })

  it('reports inline event handlers and javascript: URLs, but not text inside script data blocks', () => {
    const problems = pageViolations(
      '<img src="x.png" onerror="go()"><a href="javascript:go()">x</a>' +
      '<script type="application/json">{"html":"<img onerror=x>"}</script>', "script-src 'self'")
    expect(problems).toHaveLength(2)
    expect(problems[0]).toMatch(/onerror=/)
    expect(problems[1]).toMatch(/javascript:/)
  })
})

describe('inlineScripts', () => {
  const scripts = (attrs: string[]) => attrs.map(a => `<script${a}>x()</script>`).join('')

  it("runs exactly the types the HTML standard runs: an empty or missing type is JavaScript, a language stands in for a missing one", () => {
    const runs = ['', ' type=""', ' type="text/javascript1.5"', ' type="application/x-javascript"', ' type=" TEXT/JavaScript "',
      ' type="module"', ' type="importmap"', ' type="speculationrules"', ' language="JavaScript"', ' language=""', ' type="" language="vbscript"']
    const inert = [' type="application/json"', ' type="application/ld+json"', ' type="text/template"', ' type=" "',
      ' language="vbscript"', ' type="text/plain" language="javascript"']
    expect(inlineScripts(scripts(runs))).toHaveLength(runs.length)
    expect(inlineScripts(scripts(inert))).toEqual([])
  })

  it('skips a script with an external source: src in HTML, even empty, and href in SVG', () => {
    expect(inlineScripts(scripts([' src="/a.js"', ' src=""']))).toEqual([])
    expect(inlineScripts('<svg><script href="/a.js">x()</script><script xlink:href="/b.js">y()</script></svg>')).toEqual([])
  })

  it('finds scripts where a browser parses them: in templates and SVG, never in a comment or a noscript', () => {
    expect(inlineScripts('<template><script>a()</script></template><svg><script>b()</script></svg>')).toEqual(['a()', 'b()'])
    expect(inlineScripts('<!-- <script>a()</script> --><noscript><script>b()</script></noscript>')).toEqual([])
  })

  it('takes an SVG script\'s text as a browser does, character references and CDATA resolved', () => {
    expect(inlineScripts('<svg><script>a(&quot;x&quot;)<![CDATA[ && b()]]></script></svg>')).toEqual(['a("x") && b()'])
  })
})

describe('stylesheetViolations', () => {
  const face = (src: string) => `@font-face{font-family:X;src:${src} format("woff2")}`

  it("passes same-origin font files under font-src 'self'", () => {
    expect(stylesheetViolations(face('url(/assets/x-AbC.woff2)') + face("url('./y.woff2')"), "font-src 'self'")).toEqual([])
  })

  it('reports a data: font or a third-party font the policy does not list', () => {
    const css = face('url(data:font/woff2;base64,AAAA)') + face('url("https://fonts.gstatic.com/s/x.woff2")')
    const problems = stylesheetViolations(css, "font-src 'self'")
    expect(problems).toHaveLength(2)
    expect(problems[0]).toMatch(/data:font/)
    expect(problems[1]).toMatch(/fonts\.gstatic\.com/)
    expect(stylesheetViolations(css, "font-src 'self' data: https://fonts.gstatic.com")).toEqual([])
  })

  it('ignores url()s outside @font-face and falls back to default-src', () => {
    expect(stylesheetViolations('a{background:url(data:image/png;base64,AA)}', "font-src 'self'")).toEqual([])
    expect(stylesheetViolations(face('url(data:font/woff2;base64,AA)'), "default-src 'self'")).toHaveLength(1)
  })
})

describe('parseHeadersFile', () => {
  it('reads patterns, their indented headers and skips comments', () => {
    const rules = parseHeadersFile('# c\n/*\n  A: 1\n  B: x: y\n\n/guides/*\n  C: 2\n')
    expect(rules).toEqual([
      { pattern: '/*', headers: [['A', '1'], ['B', 'x: y']] },
      { pattern: '/guides/*', headers: [['C', '2']] },
    ])
    expect(headersOf(rules, '/*')).toEqual({ A: '1', B: 'x: y' })
  })

  it('rejects a header line outside any pattern', () => {
    expect(() => parseHeadersFile('  A: 1\n')).toThrow(/line 1/)
  })
})
