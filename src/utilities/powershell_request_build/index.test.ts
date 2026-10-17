import { describe, it, expect } from 'vitest'
import util from './index'
import parseUtil from '../curl_parse/index'

const run = async (input: unknown, params: Record<string, unknown> = {}) =>
  (await util.apply(input as any, params)) as string

const fromCurl = async (curl: string, params: Record<string, unknown> = {}) =>
  run(await parseUtil.apply(curl, {}), params)

const oneLine = { multiline: false }

describe('powershell_request_build', () => {
  it('has correct metadata', () => {
    expect(util.id).toBe('powershell_request_build')
    expect(util.category).toBe('Web & Dev')
    expect(util.accepts).toBe('json')
    expect(util.produces).toBe('string')
    expect(Object.keys(util.params).sort()).toEqual(['cmdlet', 'multiline', 'pretty'])
  })

  it('returns an empty string for empty input and requires a url', async () => {
    expect(await run('')).toBe('')
    expect(await run({})).toBe('')
    await expect(run({ method: 'GET' })).rejects.toThrow(/url/)
  })

  it('keeps a short request on one line and leaves GET implicit', async () => {
    expect(await run({ method: 'GET', url: 'https://api.example.com/items' })).toBe(
      "Invoke-RestMethod -Uri 'https://api.example.com/items'"
    )
    expect(await run({ method: 'DELETE', url: 'https://api.example.com/items/7' })).toBe(
      "Invoke-RestMethod -Uri 'https://api.example.com/items/7' -Method Delete"
    )
  })

  it('splats a request with more than two parameters', async () => {
    const out = await fromCurl(
      `curl -X POST https://api.example.com/users -H 'Authorization: Bearer t0k' -H 'Content-Type: application/json' -d '{"name":"Ada"}'`
    )
    expect(out).toBe([
      '$params = @{',
      "  Uri = 'https://api.example.com/users'",
      "  Method = 'Post'",
      '  Headers = @{',
      "    'Authorization' = 'Bearer t0k'",
      '  }',
      "  ContentType = 'application/json'",
      `  Body = '{"name":"Ada"}'`,
      '}',
      'Invoke-RestMethod @params'
    ].join('\n'))
  })

  it('writes one command line with multiline off', async () => {
    expect(await fromCurl(`curl https://x.test/a -H 'Accept: application/json' -H 'X-Id: 1' -d 'a=1'`, oneLine)).toBe(
      "Invoke-RestMethod -Uri 'https://x.test/a' -Method Post -Headers @{ 'Accept' = 'application/json'; 'X-Id' = '1' } -ContentType 'application/x-www-form-urlencoded' -Body 'a=1'"
    )
  })

  it('uses Invoke-WebRequest with -UseBasicParsing when asked', async () => {
    expect(await run({ url: 'https://x.test' }, { cmdlet: 'Invoke-WebRequest' })).toBe(
      "Invoke-WebRequest -Uri 'https://x.test' -UseBasicParsing"
    )
  })

  it('maps methods to -Method, and others to -CustomMethod', async () => {
    expect(await run({ method: 'patch', url: 'https://x.test' })).toContain('-Method Patch')
    expect(await run({ method: 'HEAD', url: 'https://x.test' })).toContain('-Method Head')
    expect(await run({ method: 'PROPFIND', url: 'https://x.test' })).toContain("-CustomMethod 'PROPFIND'")
    expect(await fromCurl('curl -I https://x.test')).toContain('-Method Head')
    expect(await fromCurl('curl -T file.bin https://x.test/u', oneLine)).toBe(
      "Invoke-RestMethod -Uri 'https://x.test/u' -Method Put -InFile 'file.bin'"
    )
  })

  it("defaults the content type to curl's form encoding when data has none", async () => {
    expect(await fromCurl("curl https://x.test -d 'q=1'", oneLine)).toContain(
      "-ContentType 'application/x-www-form-urlencoded' -Body 'q=1'"
    )
    // an upload file carries no implied content type
    expect(await fromCurl('curl -T a.txt https://x.test')).not.toContain('ContentType')
  })

  it('moves -G data into the query string', async () => {
    expect(await fromCurl("curl -G https://x.test/search -d 'q=widgets' -d 'limit=10'")).toBe(
      "Invoke-RestMethod -Uri 'https://x.test/search?q=widgets&limit=10'"
    )
    expect(await fromCurl("curl -G 'https://x.test/s?page=2#top' -d 'q=a'")).toBe(
      "Invoke-RestMethod -Uri 'https://x.test/s?page=2&q=a'"
    )
  })

  it('sends -u credentials up front as a Basic header', async () => {
    expect(await fromCurl("curl -u 'api:p@ss' https://x.test", oneLine)).toBe(
      "Invoke-RestMethod -Uri 'https://x.test' -Headers @{ 'Authorization' = 'Basic ' + [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes('api:p@ss')) }"
    )
    expect(await run({ url: 'https://x.test', auth: 'u:p' }, oneLine)).toContain("GetBytes('u:p')")
    // an explicit Authorization header wins, as it does in curl
    const out = await fromCurl("curl -u 'a:b' -H 'Authorization: Bearer t' https://x.test")
    expect(out).toContain("'Authorization' = 'Bearer t'")
    expect(out).not.toContain('Basic')
  })

  it('answers digest, ntlm and negotiate challenges with -Credential', async () => {
    expect(await fromCurl("curl --digest -u 'ada:pw' https://x.test", oneLine)).toBe(
      "Invoke-RestMethod -Uri 'https://x.test' -Credential ([pscredential]::new('ada', (ConvertTo-SecureString 'pw' -AsPlainText -Force)))"
    )
    const plain = await fromCurl("curl --ntlm -u 'ada' http://intranet.example", oneLine)
    expect(plain).toContain("[pscredential]::new('ada', [securestring]::new())")
    expect(plain).toContain('-AllowUnencryptedAuthentication')
  })

  it('maps headers to their dedicated parameters', async () => {
    const out = await fromCurl(
      "curl https://x.test -A 'agent/1.0' -H 'Content-Length: 99' -b 'a=1' -b 'b=2' -H 'X-Tag: x' -H 'x-tag: y'",
      oneLine
    )
    expect(out).toBe(
      "Invoke-RestMethod -Uri 'https://x.test' -Headers @{ 'Cookie' = 'a=1; b=2'; 'X-Tag' = 'x, y' } -UserAgent 'agent/1.0'"
    )
  })

  it('rejects header values with line breaks', async () => {
    await expect(run({ url: 'https://x.test', headers: { 'X-A': 'a\nb' } })).rejects.toThrow(/line breaks/)
  })

  it('escapes single quotes, typographic quotes included, and leaves $ and backticks literal', async () => {
    expect(await run({ method: 'POST', url: 'https://x.test', headers: { 'Content-Type': 'text/plain' }, body: "it's ‘x’ $HOME `y`" }, oneLine))
      .toContain("-Body ([Text.Encoding]::UTF8.GetBytes('it''s ‘‘x’’ $HOME `y`'))")
  })

  it('double-quotes values with control characters', async () => {
    const out = await run({ method: 'POST', url: 'https://x.test', headers: { 'Content-Type': 'text/plain' }, body: 'a\r\nb\x1bc\0d"$`' }, oneLine)
    expect(out).toContain('-Body "a`r`nb$([char]0x1B)c`0d`"`$``"')
  })

  it('puts a multi-line body in a here-string, keeping a trailing newline', async () => {
    const body = '{\n  "name": "Ada"\n}\n'
    expect(await run({ method: 'PUT', url: 'https://x.test', headers: { 'Content-Type': 'application/json' }, body })).toBe([
      "$body = @'",
      '{',
      '  "name": "Ada"',
      '}',
      '',
      "'@",
      '$params = @{',
      "  Uri = 'https://x.test'",
      "  Method = 'Put'",
      "  ContentType = 'application/json'",
      '  Body = $body',
      '}',
      'Invoke-RestMethod @params'
    ].join('\n'))
  })

  it('falls back to a quoted string when a line would close the here-string', async () => {
    const out = await run({ method: 'POST', url: 'https://x.test', body: "a\n'@ b" })
    expect(out).not.toContain("@'\n")
    expect(out).toContain("Body = 'a\n''@ b'")
  })

  it('keeps a multi-line body on one line with multiline off', async () => {
    expect(await run({ method: 'POST', url: 'https://x.test', body: 'a\nb' }, oneLine)).toContain('-Body "a`nb"')
  })

  it('sends a non-ASCII body as UTF-8 bytes', async () => {
    expect(await run({ method: 'POST', url: 'https://x.test', body: '{\n"n": "Zoë"\n}' })).toContain(
      'Body = ([Text.Encoding]::UTF8.GetBytes($body))'
    )
  })

  it('pretty-prints a JSON body only when asked', async () => {
    const req = { method: 'POST', url: 'https://x.test', headers: { 'Content-Type': 'application/json' }, body: '{"a":1}' }
    expect(await run(req)).toContain(`Body = '{"a":1}'`)
    expect(await run(req, { pretty: true })).toContain("$body = @'\n{\n  \"a\": 1\n}\n'@")
  })

  it('reads -d @file with -InFile, and names stdin as not converted', async () => {
    expect(await fromCurl("curl -H 'Content-Type: text/csv' -d @rows.csv https://x.test/import")).toContain("InFile = 'rows.csv'")
    expect(await fromCurl('curl -d @- https://x.test')).toMatch(/^# Not converted \(no Invoke-RestMethod equivalent\): -d @- \(stdin\)\n/)
  })

  it('builds -Form from -F fields, merging repeated names', async () => {
    const out = await fromCurl(
      "curl https://x.test/upload -F 'file=@report.csv;type=text/csv' -F 'note=weekly' -F 'note=again' -F 'bio=<bio.txt' --form-string 'at=@literal' -H 'Content-Type: multipart/form-data; boundary=x'"
    )
    expect(out).toBe([
      '# Not converted (no Invoke-RestMethod equivalent): -F ;type=',
      '$params = @{',
      "  Uri = 'https://x.test/upload'",
      "  Method = 'Post'",
      '  Form = @{',
      "    'file' = (Get-Item -LiteralPath 'report.csv')",
      "    'note' = 'weekly', 'again'",
      "    'bio' = (Get-Content -Raw -LiteralPath 'bio.txt')",
      "    'at' = '@literal'",
      '  }',
      '}',
      'Invoke-RestMethod @params'
    ].join('\n'))
  })

  it('refuses a body together with form fields or an upload file', async () => {
    await expect(run({ url: 'https://x.test', body: 'a', form: [{ name: 'f', value: 'v' }] })).rejects.toThrow(/body and form/)
    await expect(run({ url: 'https://x.test', body: 'a', flags: { 'upload-file': 'f.bin' } })).rejects.toThrow(/upload file/)
  })

  it('maps curl flags that have a PowerShell parameter', async () => {
    const out = await fromCurl(
      'curl -k -L -s --compressed --max-time 2.5 --max-redirs 3 --retry 2 -x proxy.example:3128 --http2 -o out.json -r 0-99 https://x.test'
    )
    expect(out).toBe([
      '$params = @{',
      "  Uri = 'https://x.test'",
      '  Headers = @{',
      "    'Range' = 'bytes=0-99'",
      '  }',
      "  TimeoutSec = 3",
      '  MaximumRedirection = 3',
      '  MaximumRetryCount = 2',
      "  Proxy = 'http://proxy.example:3128'",
      "  HttpVersion = '2.0'",
      "  OutFile = 'out.json'",
      '  SkipCertificateCheck = $true',
      '}',
      'Invoke-RestMethod @params'
    ].join('\n'))
  })

  it('names flags without an equivalent, never their values', async () => {
    const out = await fromCurl("curl --cacert /etc/ssl/ca.pem --proxy-user 'me:secret' -b cookies.txt --http2-prior-knowledge https://x.test")
    expect(out.split('\n')[0]).toBe(
      '# Not converted (no Invoke-RestMethod equivalent): --cacert, --proxy-user, -b <file>, --http2-prior-knowledge'
    )
    expect(out).not.toContain('secret')
  })

  it('adds the http:// curl assumes for a bare host', async () => {
    expect(await run({ url: 'example.com/a' })).toBe("Invoke-RestMethod -Uri 'http://example.com/a'")
  })
})
