import type { Preset } from '../types'
import { step } from '../define'

const preset: Preset = {
  slug: 'convert-curl-to-powershell',
  name: 'Convert a curl command to PowerShell',
  summary:
    'Paste a curl command from API docs or Chrome\'s "Copy as cURL" and get the same request as a PowerShell Invoke-RestMethod command: headers, body, auth and flags carried over, every value quoted for PowerShell.',
  category: 'Web & APIs',
  primaryQuery: 'curl to powershell',
  published: '2026-10-12',
  related: ['decode-jwts-in-log-file'],
  steps: [
    step('parse', 'curl_parse', {},
      'Reads the command the way bash would: undoes its quoting, joins the backslash line continuations, and sorts out method, URL, headers, body, credentials and flags as JSON.',
      { label: 'parse the curl command' }),
    step('build', 'powershell_request_build', { cmdlet: 'Invoke-RestMethod', multiline: true, pretty: false },
      'Writes that request as an Invoke-RestMethod call, maps each curl flag to its PowerShell parameter, and single-quotes every value so PowerShell sends exactly what curl would.',
      { label: 'write Invoke-RestMethod' }),
  ],
  samples: [
    {
      id: 'api-post',
      title: 'POST from API docs',
      input: `curl -X POST 'https://api.example.com/v1/orders' \\
  -H 'Authorization: Bearer test_token_123' \\
  -H 'Content-Type: application/json' \\
  -d '{"sku":"SKU-1001","quantity":2,"note":"Leave it at O'\\''Brien'\\''s door"}' \\
  --max-time 30`,
      output: `$params = @{
  Uri = 'https://api.example.com/v1/orders'
  Method = 'Post'
  Headers = @{
    'Authorization' = 'Bearer test_token_123'
  }
  ContentType = 'application/json'
  Body = '{"sku":"SKU-1001","quantity":2,"note":"Leave it at O''Brien''s door"}'
  TimeoutSec = 30
}
Invoke-RestMethod @params`,
    },
    {
      id: 'chrome-copy',
      title: 'Copied from Chrome DevTools',
      input: `curl 'https://shop.example.com/api/cart?currency=EUR' \\
  -H 'accept: application/json' \\
  -H 'accept-language: en-GB,en;q=0.9' \\
  -b 'session=3f9a1c; consent=yes' \\
  -H 'user-agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36' \\
  --compressed`,
      output: `$params = @{
  Uri = 'https://shop.example.com/api/cart?currency=EUR'
  Headers = @{
    'accept' = 'application/json'
    'accept-language' = 'en-GB,en;q=0.9'
    'Cookie' = 'session=3f9a1c; consent=yes'
  }
  UserAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36'
}
Invoke-RestMethod @params`,
    },
    {
      id: 'basic-auth-search',
      title: 'Basic auth and -G query',
      input: `curl -G -k -u 'reports:example-pass' https://staging.example.com/api/search --data-urlencode 'q=late orders' -d limit=50`,
      output: `$params = @{
  Uri = 'https://staging.example.com/api/search?q=late%20orders&limit=50'
  Headers = @{
    'Authorization' = 'Basic ' + [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes('reports:example-pass'))
  }
  SkipCertificateCheck = $true
}
Invoke-RestMethod @params`,
    },
    {
      id: 'file-upload',
      title: 'Multipart file upload',
      input: `curl -F 'file=@invoices.csv' -F 'month=2026-09' -H 'X-Api-Key: test-key-42' https://upload.example.com/v1/imports`,
      output: `$params = @{
  Uri = 'https://upload.example.com/v1/imports'
  Method = 'Post'
  Headers = @{
    'X-Api-Key' = 'test-key-42'
  }
  Form = @{
    'file' = (Get-Item -LiteralPath 'invoices.csv')
    'month' = '2026-09'
  }
}
Invoke-RestMethod @params`,
    },
  ],
}
export default preset
