import type { Preset } from '../types'
import { step } from '../define'

/** Step 1, over the whole input: keep the value of the first SAMLRequest or SAMLResponse parameter. */
const EXTRACT = [
  '# keep only the value after SAMLRequest= or SAMLResponse= (or ":") in a URL, form body, cURL command or JSON;',
  '# quotes are skipped (Base64 has none), and a bare value has no name to match, so it passes through unchanged',
  String.raw`s/^.*?\bSAML(?:Request|Response)["']?\s*[=:]\s*["']?([^&\s"']+).*$/\1/s`,
].join('\n')

const preset: Preset = {
  slug: 'decode-saml-request',
  name: 'Decode a SAML request or response',
  summary:
    'Paste a SAML redirect URL, a POST form body, a copied cURL command or a bare SAMLRequest or SAMLResponse value and read the message as indented XML, deflated (Redirect binding) or not (POST).',
  category: 'Web & APIs',
  primaryQuery: 'saml decoder',
  published: '2026-10-07',
  updated: '2026-11-06',
  related: ['decode-flask-session-cookie', 'decode-helm-release-secret'],
  steps: [
    step('extract', 'sed', { script: EXTRACT, perLine: false },
      'Keeps only the value of the first SAMLRequest or SAMLResponse parameter, dropping the URL or cURL command around it, RelayState, and the SigAlg and Signature of a signed request. A bare value has no parameter name to match, so it passes through unchanged.',
      { label: 'keep the SAML value' }),
    step('url-decode', 'url_decode', {},
      'Turns %2B, %2F and %3D back into the Base64 characters +, / and =, which the next step needs. It leaves a literal + alone instead of reading it as a space, so a value that was never URL-encoded comes through intact.'),
    step('base64', 'base64url_decode', { output: 'bytes' },
      'Decodes the Base64, standard or URL-safe, line breaks ignored. For the POST binding the result is already the XML; for the redirect binding it is compressed data, which is why the output is set to bytes rather than text.'),
    step('inflate', 'deflate_decompress', { format: 'raw', output: 'text' },
      'The redirect binding compresses the XML with raw DEFLATE (RFC 1951, no zlib header) before Base64-encoding it; this inflates it back to text. POST-binding messages are not compressed, so the step is skipped when its input already starts with <.',
      { condition: { kind: 'regex', pattern: '^\\s*<', negate: true } }),
    step('pretty', 'xml_pretty', { indent: 2, collapseEmpty: true },
      'SAML messages usually arrive as one long line of XML. Indenting it puts Issuer, NameID, Conditions and every other element on a line of its own, so you can compare them with the identity provider and service provider settings.'),
  ],
  samples: [
    {
      id: 'redirect-url',
      title: 'Redirect binding URL',
      input:
        'https://idp.example.com/sso/saml?SAMLRequest=fZJLb8IwEIT%2FSuQ7eZXysCBSCqqKRFsEaQ%2B9VIu9AUuxnXq' +
        'dPv59Q2gFPZTrej7PzNoTAl3VPG%2F83qzxrUHywaeuDPHuYMoaZ7gFUsQNaCTuBd%2Fk90uehjGvnfVW2IqdIZcJIELnlTU' +
        'sWMyn7LVfjkSKCYy3Q9kXVziCQRlvr2UqEhzDsGTBMzpq9VPW4i1E1ODCkAfj21GcDnpJ3IuHRTzmSZ%2Bn6QsL5m0HZcB31' +
        'N77mngUKVmH%2BAm6rjAUVkdENjrEZUH%2BG2lmDTUa3QbduxL4tF6ecKhPuHW7Do1AEAtWPzu4UUYqs7tcf3sUEb8rilVv9' +
        'bgpWDY53MW7Yi676KfRgwQPk%2BgcmRxf8KE1W8xXtlLiK7i1ToP%2FP0sSJt1EyV7ZSTlqUFUupUNqS%2BVVZT9mDsHjlHn' +
        'XIIuyo%2Bvfr5J9Aw%3D%3D&RelayState=%2Freports%3Frange%3D30d',
      output: String.raw`<samlp:AuthnRequest xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="_4f8c2e1a9b7d4c3e8a6f0b5d2c1e9a7f" Version="2.0" IssueInstant="2026-10-07T09:14:22Z" Destination="https://idp.example.com/sso/saml" AssertionConsumerServiceURL="https://app.example.org/saml/acs" ProtocolBinding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST">
  <saml:Issuer>https://app.example.org/saml/metadata</saml:Issuer>
  <samlp:NameIDPolicy Format="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress" AllowCreate="true"/>
</samlp:AuthnRequest>`,
    },
    {
      id: 'post-form-body',
      title: 'POST binding form body',
      input:
        'SAMLResponse=PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiPz48c2FtbHA6UmVzcG9uc2UgeG1sbnM6c2F' +
        'tbHA9InVybjpvYXNpczpuYW1lczp0YzpTQU1MOjIuMDpwcm90b2NvbCIgeG1sbnM6c2FtbD0idXJuOm9hc2lzOm5hbWVzOnR' +
        'jOlNBTUw6Mi4wOmFzc2VydGlvbiIgSUQ9Il85ZDJiN2U0YzFhNmY0ZTBiOGMzZDVhN2YyZTFiNmM5ZCIgSW5SZXNwb25zZVR' +
        'vPSJfNGY4YzJlMWE5YjdkNGMzZThhNmYwYjVkMmMxZTlhN2YiIFZlcnNpb249IjIuMCIgSXNzdWVJbnN0YW50PSIyMDI2LTE' +
        'wLTA3VDA5OjE0OjI1WiIgRGVzdGluYXRpb249Imh0dHBzOi8vYXBwLmV4YW1wbGUub3JnL3NhbWwvYWNzIj48c2FtbDpJc3N' +
        '1ZXI%2BaHR0cHM6Ly9pZHAuZXhhbXBsZS5jb20vbWV0YWRhdGE8L3NhbWw6SXNzdWVyPjxzYW1scDpTdGF0dXM%2BPHNhbWx' +
        'wOlN0YXR1c0NvZGUgVmFsdWU9InVybjpvYXNpczpuYW1lczp0YzpTQU1MOjIuMDpzdGF0dXM6U3VjY2VzcyIvPjwvc2FtbHA' +
        '6U3RhdHVzPjxzYW1sOkFzc2VydGlvbiBJRD0iXzFjN2UzYTlmNWIyZDRlOGEwYzZmOWIzZDdlMmE1YzhmIiBWZXJzaW9uPSI' +
        'yLjAiIElzc3VlSW5zdGFudD0iMjAyNi0xMC0wN1QwOToxNDoyNVoiPjxzYW1sOklzc3Vlcj5odHRwczovL2lkcC5leGFtcGx' +
        'lLmNvbS9tZXRhZGF0YTwvc2FtbDpJc3N1ZXI%2BPHNhbWw6U3ViamVjdD48c2FtbDpOYW1lSUQgRm9ybWF0PSJ1cm46b2Fza' +
        'XM6bmFtZXM6dGM6U0FNTDoxLjE6bmFtZWlkLWZvcm1hdDplbWFpbEFkZHJlc3MiPmpvcmRhbkBleGFtcGxlLm9yZzwvc2Ftb' +
        'DpOYW1lSUQ%2BPHNhbWw6U3ViamVjdENvbmZpcm1hdGlvbiBNZXRob2Q9InVybjpvYXNpczpuYW1lczp0YzpTQU1MOjIuMDp' +
        'jbTpiZWFyZXIiPjxzYW1sOlN1YmplY3RDb25maXJtYXRpb25EYXRhIEluUmVzcG9uc2VUbz0iXzRmOGMyZTFhOWI3ZDRjM2U' +
        '4YTZmMGI1ZDJjMWU5YTdmIiBOb3RPbk9yQWZ0ZXI9IjIwMjYtMTAtMDdUMDk6MTk6MjVaIiBSZWNpcGllbnQ9Imh0dHBzOi8' +
        'vYXBwLmV4YW1wbGUub3JnL3NhbWwvYWNzIi8%2BPC9zYW1sOlN1YmplY3RDb25maXJtYXRpb24%2BPC9zYW1sOlN1YmplY3Q' +
        '%2BPHNhbWw6Q29uZGl0aW9ucyBOb3RCZWZvcmU9IjIwMjYtMTAtMDdUMDk6MTM6NTVaIiBOb3RPbk9yQWZ0ZXI9IjIwMjYtM' +
        'TAtMDdUMDk6MTk6MjVaIj48c2FtbDpBdWRpZW5jZVJlc3RyaWN0aW9uPjxzYW1sOkF1ZGllbmNlPmh0dHBzOi8vYXBwLmV4Y' +
        'W1wbGUub3JnL3NhbWwvbWV0YWRhdGE8L3NhbWw6QXVkaWVuY2U%2BPC9zYW1sOkF1ZGllbmNlUmVzdHJpY3Rpb24%2BPC9zY' +
        'W1sOkNvbmRpdGlvbnM%2BPHNhbWw6QXV0aG5TdGF0ZW1lbnQgQXV0aG5JbnN0YW50PSIyMDI2LTEwLTA3VDA5OjE0OjI0WiI' +
        'gU2Vzc2lvbkluZGV4PSJfNmEzZjljMmU4YjFkNGY3YSI%2BPHNhbWw6QXV0aG5Db250ZXh0PjxzYW1sOkF1dGhuQ29udGV4d' +
        'ENsYXNzUmVmPnVybjpvYXNpczpuYW1lczp0YzpTQU1MOjIuMDphYzpjbGFzc2VzOlBhc3N3b3JkUHJvdGVjdGVkVHJhbnNwb' +
        '3J0PC9zYW1sOkF1dGhuQ29udGV4dENsYXNzUmVmPjwvc2FtbDpBdXRobkNvbnRleHQ%2BPC9zYW1sOkF1dGhuU3RhdGVtZW5' +
        '0PjxzYW1sOkF0dHJpYnV0ZVN0YXRlbWVudD48c2FtbDpBdHRyaWJ1dGUgTmFtZT0iZ3JvdXBzIj48c2FtbDpBdHRyaWJ1dGV' +
        'WYWx1ZT5lbmdpbmVlcmluZzwvc2FtbDpBdHRyaWJ1dGVWYWx1ZT48L3NhbWw6QXR0cmlidXRlPjwvc2FtbDpBdHRyaWJ1dGV' +
        'TdGF0ZW1lbnQ%2BPC9zYW1sOkFzc2VydGlvbj48L3NhbWxwOlJlc3BvbnNlPg%3D%3D&RelayState=%2Freports%3Frang' +
        'e%3D30d',
      output: String.raw`<?xml version="1.0" encoding="UTF-8"?>
<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="_9d2b7e4c1a6f4e0b8c3d5a7f2e1b6c9d" InResponseTo="_4f8c2e1a9b7d4c3e8a6f0b5d2c1e9a7f" Version="2.0" IssueInstant="2026-10-07T09:14:25Z" Destination="https://app.example.org/saml/acs">
  <saml:Issuer>https://idp.example.com/metadata</saml:Issuer>
  <samlp:Status>
    <samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Success"/>
  </samlp:Status>
  <saml:Assertion ID="_1c7e3a9f5b2d4e8a0c6f9b3d7e2a5c8f" Version="2.0" IssueInstant="2026-10-07T09:14:25Z">
    <saml:Issuer>https://idp.example.com/metadata</saml:Issuer>
    <saml:Subject>
      <saml:NameID Format="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress">jordan@example.org</saml:NameID>
      <saml:SubjectConfirmation Method="urn:oasis:names:tc:SAML:2.0:cm:bearer">
        <saml:SubjectConfirmationData InResponseTo="_4f8c2e1a9b7d4c3e8a6f0b5d2c1e9a7f" NotOnOrAfter="2026-10-07T09:19:25Z" Recipient="https://app.example.org/saml/acs"/>
      </saml:SubjectConfirmation>
    </saml:Subject>
    <saml:Conditions NotBefore="2026-10-07T09:13:55Z" NotOnOrAfter="2026-10-07T09:19:25Z">
      <saml:AudienceRestriction>
        <saml:Audience>https://app.example.org/saml/metadata</saml:Audience>
      </saml:AudienceRestriction>
    </saml:Conditions>
    <saml:AuthnStatement AuthnInstant="2026-10-07T09:14:24Z" SessionIndex="_6a3f9c2e8b1d4f7a">
      <saml:AuthnContext>
        <saml:AuthnContextClassRef>urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport</saml:AuthnContextClassRef>
      </saml:AuthnContext>
    </saml:AuthnStatement>
    <saml:AttributeStatement>
      <saml:Attribute Name="groups">
        <saml:AttributeValue>engineering</saml:AttributeValue>
      </saml:Attribute>
    </saml:AttributeStatement>
  </saml:Assertion>
</samlp:Response>`,
    },
    {
      id: 'bare-logout-value',
      title: 'Bare value, not URL-encoded',
      input:
        'fZFda8IwFIb/Ssm9/bLaGrRMkEHB7WKOXexGTptT19F8LCcFf/5iVeaE7Srw5nnOR7IkkL3hW33Qg3vBrwHJBUfZK+LjzYoN' +
        'VnEN1BFXIJG4a/hu/bTlaRhzY7XTje7ZjfK/AURoXacVC6rNiu3jusCZSCFvsjaDBBdiXk+bop1BirnIaha8oSXPr5jXvUQ0' +
        'YKXIgXI+itP5JIkncf6a5DxLeVy8s2Djd+gUuNH6cM4Qj6JOmBCPIE2PYaNlRL2OTuOycnk6+FjYllcczA+u7WFEI4kOBDhY' +
        'RrfK2X/2q1ab4FFbCe7vN0jCZEw6MWlHlKOErl8LYZGIlZ/aClAPN60vzc71z80M33nYr1cpgcdyP4dpu2hSLOpEZG1+me+O' +
        'uoa/vrr8Bg==',
      output: String.raw`<samlp:LogoutRequest xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="_0b8e5d2a7c4f4a1e9d6b3c8f5a2e7d4b" Version="2.0" IssueInstant="2026-10-07T17:42:08Z" Destination="https://idp.example.com/slo/saml">
  <saml:Issuer>https://app.example.org/saml/metadata</saml:Issuer>
  <saml:NameID Format="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress">jordan@example.org</saml:NameID>
  <samlp:SessionIndex>_6a3f9c2e8b1d4f7a</samlp:SessionIndex>
</samlp:LogoutRequest>`,
    },
    {
      id: 'curl-error-response',
      title: 'Copied as cURL, error status',
      input:
        "curl 'https://app.example.org/saml/acs' \\\n" +
        "  -H 'content-type: application/x-www-form-urlencoded' \\\n" +
        "  -H 'origin: https://idp.example.com' \\\n" +
        "  -H 'referer: https://idp.example.com/' \\\n" +
        "  --data-raw 'SAMLResponse=PHNhbWxwOlJlc3BvbnNlIHhtbG5zOnNhbWxwPSJ1cm46b2FzaXM6bmFtZXM6dGM6U0FNT" +
        "DoyLjA6cHJvdG9jb2wiIHhtbG5zOnNhbWw9InVybjpvYXNpczpuYW1lczp0YzpTQU1MOjIuMDphc3NlcnRpb24iIElEPSJfM" +
        "2U5YTZjMWY4YjJkNGE3ZTljNWIwZjNkOGExZTZjMmIiIEluUmVzcG9uc2VUbz0iXzhkM2YxYjZlNGE5YzRlMmY4YjdhNWQwY" +
        "zNlOWYxYTZiIiBWZXJzaW9uPSIyLjAiIElzc3VlSW5zdGFudD0iMjAyNi0xMC0wN1QxMTowMjo0N1oiIERlc3RpbmF0aW9uP" +
        "SJodHRwczovL2FwcC5leGFtcGxlLm9yZy9zYW1sL2FjcyI%2BPHNhbWw6SXNzdWVyPmh0dHBzOi8vaWRwLmV4YW1wbGUuY29" +
        "tL21ldGFkYXRhPC9zYW1sOklzc3Vlcj48c2FtbHA6U3RhdHVzPjxzYW1scDpTdGF0dXNDb2RlIFZhbHVlPSJ1cm46b2FzaXM" +
        "6bmFtZXM6dGM6U0FNTDoyLjA6c3RhdHVzOlJlcXVlc3RlciI%2BPHNhbWxwOlN0YXR1c0NvZGUgVmFsdWU9InVybjpvYXNpc" +
        "zpuYW1lczp0YzpTQU1MOjIuMDpzdGF0dXM6SW52YWxpZE5hbWVJRFBvbGljeSIvPjwvc2FtbHA6U3RhdHVzQ29kZT48c2Ftb" +
        "HA6U3RhdHVzTWVzc2FnZT5OYW1lSUQgZm9ybWF0IHVybjpvYXNpczpuYW1lczp0YzpTQU1MOjIuMDpuYW1laWQtZm9ybWF0O" +
        "nBlcnNpc3RlbnQgaXMgbm90IGVuYWJsZWQgZm9yIHRoaXMgYXBwbGljYXRpb248L3NhbWxwOlN0YXR1c01lc3NhZ2U%2BPC9" +
        "zYW1scDpTdGF0dXM%2BPC9zYW1scDpSZXNwb25zZT4%3D'",
      output: String.raw`<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="_3e9a6c1f8b2d4a7e9c5b0f3d8a1e6c2b" InResponseTo="_8d3f1b6e4a9c4e2f8b7a5d0c3e9f1a6b" Version="2.0" IssueInstant="2026-10-07T11:02:47Z" Destination="https://app.example.org/saml/acs">
  <saml:Issuer>https://idp.example.com/metadata</saml:Issuer>
  <samlp:Status>
    <samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Requester">
      <samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:InvalidNameIDPolicy"/>
    </samlp:StatusCode>
    <samlp:StatusMessage>NameID format urn:oasis:names:tc:SAML:2.0:nameid-format:persistent is not enabled for this application</samlp:StatusMessage>
  </samlp:Status>
</samlp:Response>`,
    },
  ],
}
export default preset
