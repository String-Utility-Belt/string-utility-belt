---
title: SAML Decoder: Decode SAMLRequest and SAMLResponse to XML
description: Decode a SAML request online: paste a redirect URL, POST form body, cURL command or a bare SAMLRequest or SAMLResponse value and read it as indented XML.
---

## Why a SAML message takes several steps to read

In SAML 2.0 browser single sign-on, the service provider's request and the identity provider's response both travel through the browser, so when a login fails you can capture them in the network panel (in Chrome DevTools, tick Preserve log first: the flow spans several page loads), but not read them. The HTTP-Redirect binding, which service providers commonly use for an AuthnRequest, compresses the XML with raw DEFLATE (RFC 1951, no zlib header), Base64-encodes the result and URL-encodes that into a `SAMLRequest` query parameter. The HTTP-POST binding, the usual way identity providers deliver a Response, skips the compression: the XML is Base64-encoded into a hidden form field named `SAMLResponse`, and the browser URL-encodes the field when it submits the form. Both are defined in the OASIS [SAML 2.0 bindings specification](https://docs.oasis-open.org/security/saml/v2.0/saml-bindings-2.0-os.pdf).

So one decoder is not enough. A Base64 decoder turns a redirect value into binary noise, because what it decoded is still compressed; an inflate tool that expects a zlib header rejects the raw stream. And the parameter name does not tell you the binding: a `LogoutResponse` sent by redirect is a compressed `SAMLResponse`. That is why this SAML decoder is a chain: a URL decode, a Base64 decode, a raw deflate when the bytes need it and a pretty print of the XML, with each step's output visible on its own.

## What each step does, and why in this order

[sed script](/util/sed/) keeps the value of the first `SAMLRequest` or `SAMLResponse` parameter and drops everything around it: the URL or cURL command, `RelayState`, and the `SigAlg` and `Signature` parameters of a signed request. A `SAMLResponse: value` line works too, and a bare value passes through. [url decode](/util/url_decode/) must come before the Base64 step, because `%` is not a Base64 character. It uses `decodeURIComponent`, so a literal `+` stays a `+`; a form decoder such as `URLSearchParams` would read it as a space and corrupt the Base64.

[base64url decode](/util/base64url_decode/) accepts both the standard and the URL-safe alphabet, ignores line breaks, and is set to output bytes. [deflate decompress](/util/deflate_decompress/) could read the Base64 text by itself, but decoding it first lets its condition look at the actual bytes: when they already start with `<`, the message is uncompressed XML, whatever the parameter is called, and the step is skipped. Its format is set to raw, as the Redirect binding requires. Last, [xml pretty](/util/xml_pretty/) indents the XML so each element sits on a line of its own.

## What to check in the decoded XML

In an AuthnRequest, compare the `Issuer` with the entity ID the identity provider has registered for your application, character for character: a trailing slash makes it a different ID. Check `AssertionConsumerServiceURL` against the assertion consumer URLs registered there, and note the request's `ID`, which the response should echo in `InResponseTo`.

In a Response, read the `StatusCode` first. A top-level value other than `urn:oasis:names:tc:SAML:2.0:status:Success` means the request failed; a nested code such as `InvalidNameIDPolicy` or `RequestDenied`, and an optional `StatusMessage`, say why. On success, check that `Audience` equals your entity ID, that `Recipient` and `Destination` equal your assertion consumer URL, and that it arrived between the assertion's `NotBefore` and `NotOnOrAfter`: a clock difference between the two servers can put a fresh assertion outside that window.

## What this pipeline does not do

It decodes only the first SAML parameter in the input and checks no signatures. On a signed redirect request the signature is not in the XML but in the `Signature` parameter, computed over the URL-encoded `SAMLRequest`, `RelayState` and `SigAlg` parameters. Pretty-printing changes whitespace, and line breaks inside long text values such as an `X509Certificate` become spaces, so never feed the formatted output to a signature check. An `EncryptedAssertion` stays encrypted, as reading it takes the service provider's private key, and a `SAMLart` parameter (Artifact binding) is only a reference to a message fetched server to server.

It does not parse HTML: from the auto-submitting form of the POST binding, copy just the `value` attribute. If the SAML URL is itself URL-encoded inside another URL, as in a `returnTo` parameter, add a second url decode step at the start. If the inflate step fails on a redirect value, the sender may have written a zlib-wrapped stream (the default of Python's `zlib.compress` and Java's `Deflater`), which a receiver that follows the binding will usually reject too; set the step's format to auto to read it anyway. Unlike a SAML decoder browser extension, it needs no install and takes a value from any source, but it only decodes what you paste and does not capture messages as they pass. Decoding runs in your browser, so the message and the personal data in it are not sent to a server.

## The same decode on the command line

For a redirect value, Python's standard library covers all three layers: `python3 -c "import sys,zlib,base64,urllib.parse as u; print(zlib.decompress(base64.b64decode(u.unquote(sys.argv[1])), -15).decode())" 'VALUE'`. The `-15` tells zlib to expect a raw stream with no header. For a POST-binding value, leave out `zlib.decompress` and its `-15`. Pipe either into `xmllint --format -` to indent it. Use `unquote`, not `unquote_plus`, which would turn a stray `+` into a space.
