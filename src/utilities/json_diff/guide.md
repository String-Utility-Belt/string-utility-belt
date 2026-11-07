---
title: Semantic JSON Diff Online: Compare Two JSON Documents
description: Compare two JSON documents online by value, ignoring key order and whitespace: an added/removed/changed summary, an RFC 6902 JSON Patch, or a unified line diff.
---
## What does comparing JSON structurally mean?

Running a plain text diff on two JSON documents shows you which *lines* changed, which is misleading once formatting, key order, or line wrapping differ even though the data is the same. A structural diff instead parses both documents and walks them value by value, so it reports exactly which keys were added, which were removed, and which values changed, regardless of whitespace or key order. This tool takes the input as one document and a second document (**compare with**) to diff it against, in one of three output shapes.

## How it works

The default **summary** format reports what changed as a real JSON object, with counts and a list for each kind of change:

```example
title: a changed value and an added key
input: {"a":1,"b":2}
params: {"other": "{\"a\":1,\"b\":3,\"c\":4}", "format": "summary"}
output:
{
  "equal": false,
  "counts": {
    "added": 1,
    "removed": 0,
    "changed": 1,
    "total": 2
  },
  "added": [
    {
      "path": "$.c",
      "value": 4
    }
  ],
  "removed": [],
  "changed": [
    {
      "path": "$.b",
      "from": 2,
      "to": 3
    }
  ]
}
```

Objects are compared key by key: a key present only on one side is an addition or a removal, and a key present on both with a different value is a change. Arrays are compared element by element up to the shorter length, with any extra elements on the longer side reported as additions or removals. An array isn't diffed by matching similar elements, so inserting an item in the middle shows as a cascade of "changed" entries for every shifted position rather than one clean insertion.

### RFC 6902 JSON Patch

**json-patch** format emits the same comparison as a standard [JSON Patch](https://www.rfc-editor.org/rfc/rfc6902): a list of `add`/`remove`/`replace` operations with RFC 6901 JSON Pointer paths that, applied to the input, produces the "compare with" document:

```example
title: emit an RFC 6902 patch
input: [1,2,3]
params: {"other": "[1,5]", "format": "json-patch"}
output:
[
  {
    "op": "replace",
    "path": "/1",
    "value": 5
  },
  {
    "op": "remove",
    "path": "/2"
  }
]
```

### Unified diff

**unified** pretty-prints both documents (each with 2-space indentation) and runs a line-based diff over that text, producing familiar `---`/`+++`/`@@` unified diff output with three lines of context around each change. That is useful when you want a human-scannable diff rather than a machine-readable list of changes. Because it compares text, whitespace in the originals never matters, but key order does: the same keys in a different order show up as changed lines. Identical documents produce empty output:

```example
title: a unified line diff of the pretty-printed documents
input: {"a":1}
params: {"other": "{\"a\":2}", "format": "unified"}
output-matches: ^--- input\n\+\+\+ compare-with\n@@ -1,3 \+1,3 @@\n \{\n-  "a": 1\n\+  "a": 2\n \}$
```

## Options

- **compare with**: the second JSON document to diff the input against (paste it or load a `.json` file); defaults to `{}`, while a field you clear completely is read as `null`.
- **format**: `summary` (default), `json-patch` or `unified`, as above.

## Common uses

- Reviewing exactly what changed between two versions of a config file or API response, independent of formatting.
- Generating a JSON Patch to send only the changed fields to an API that supports RFC 6902.
- Verifying that a transformation pipeline produced the expected output by diffing it against a known-good document.
- Spotting unintended changes in generated JSON, such as build output or a serialized snapshot, across two runs.

## Tips and pitfalls

- In the summary and json-patch formats, two documents that are equal after parsing (regardless of key order or whitespace) report `equal: true` with all counts at zero (or an empty patch, `[]`); reformatting alone is never a change. The unified format is the exception for key order, as noted above.
- Array comparison is positional, not similarity-matched: inserting an element at the start of an array shows every shifted position as changed, plus an addition at the end, rather than one insertion, since there's no reordering heuristic.
- Both documents must be valid JSON (or empty, which is treated as `null`); malformed JSON in either one throws an error naming which side was the problem.
- To keep key order out of a unified diff, run both documents through [json sort keys](/util/json_sort_keys/) first; to extract just one path from a document before comparing it, use [jsonpath query](/util/jsonpath/).
