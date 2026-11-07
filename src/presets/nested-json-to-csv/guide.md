---
title: Nested JSON to CSV: Flatten API Responses Into Columns
description: Flatten nested JSON to CSV online: pick the records out of an API response's envelope, spread nested objects and arrays into columns and get snake_case headers.
---

## Why a plain JSON-to-CSV conversion falls short

A CSV file is a flat grid, and the JSON an API returns rarely is. The records you want usually sit one level down, in a `data`, `results` or `items` array next to paging details such as `meta` or `links`. A converter that expects an array of records sees one object instead, and typically writes a single very wide row (`data[0].id`, `data[1].id`, `meta.page`) or puts the whole array into one cell. Nested objects such as `total` need flattening too, and the flattened names (`total.amount`, `items[0].sku`) make awkward column names in SQL or a dataframe. A plain nested JSON to CSV converter usually handles one of these layers, not all three.

So the order matters: select the records first, or the envelope is flattened along with them, and rename the headers last, once flattening has created the final column names.

## What each step does

[jsonpath query](/util/jsonpath/) runs `$.data[*]`, which returns the elements of the `data` array as a list of records. The path is the setting you are most likely to change: `$.results[*]` or `$.items[*]` for other envelopes, `$.data.orders[*]` for a GraphQL `orders` query, `$.data.orders.edges[*].node` when a GraphQL connection wraps each record in an edge, and `$` for a single record pasted on its own. Keep the `[*]`: on its own, `$.data` returns the array wrapped in a second array, and the result is one garbled header line. A filter such as `$.data[?(@.status == "shipped")]` exports only the matching records. The step runs only when the input starts with `{`, so a top-level array skips it; to filter one, write the path as `$[?(@.status == "shipped")]` and remove the step's condition.

[json to csv](/util/json_to_csv/), with flatten nested on, writes one row per record. Its columns are every key found in any record, in the order they first appear: nested objects become dotted columns and arrays become numbered ones. A missing field or a `null` leaves the cell empty, and a value containing a comma, a double quote or a line break is wrapped in double quotes, with inner quotes doubled, as [RFC 4180](https://www.rfc-editor.org/rfc/rfc4180) describes. If the JSON does not parse, the pipeline stops here and shows the parser's error.

[csv normalize headers](/util/csv_normalize_headers/) rewrites the header row only. Dots, brackets and camelCase boundaries become underscores, so `items[0].sku` turns into `items_0_sku` and `createdAt` into `created_at`. When two names come out identical, such as `customer_id` and `customer.id`, the later one gets a `_2` suffix. The step detects the delimiter, so switching the CSV step to semicolons or tabs needs no change here.

## Limits to know before you rely on it

Arrays become columns, not rows, and column order follows first appearance: when a later order has more line items than the first, its extra `items_1_…` columns land after every column seen before them, as in the plain-array example. The CSV step's columns option picks and orders columns by their flattened names, such as `items[1].sku`. A path like `$.data[*].items[*]` gives one row per line item, but without the order's own fields: this pipeline cannot copy parent fields onto child rows (the code below can). A field that is `null`, `{}` or `[]` in some records and nested in others gets a column of its own as well, such as `shipping`, which stays empty. If the records are arrays of values rather than objects, as some SQL query APIs return them, the CSV step takes the first one as the header row.

Numbers are parsed into JavaScript's 64-bit floating-point numbers and printed again, so `1249.50` comes out as `1249.5`, `1e3` as `1000`, and an integer above 9007199254740991 can come out rounded (12345678901234567890 becomes 12345678901234567000). Amounts and IDs sent as strings pass through untouched.

A path that matches nothing gives empty output rather than an error, and so does an empty array: check the path first when the result is blank. If you turn off the header row, disable the last step as well, or it renames your first record. JSON Lines input needs a [jsonl to json](/util/jsonl_to_json/) step in front.

Excel guesses column types when you double-click a CSV file, dropping the leading zero from 02134 and keeping only 15 significant digits of a long number; import through Data > From Text/CSV to set such columns to text. Cells that begin with =, +, - or @ are left as they are, and spreadsheet apps may evaluate them as formulas, so look over data other people typed before opening it there.

## The same job in code

With jq you list the columns yourself: `jq -r '["id","status","amount"], (.data[] | [.id, .status, .total.amount]) | @csv' response.json`. Its @csv filter rejects an object or array inside a row, so every nested value has to be picked by path. The same approach gives one row per line item with the order's id: `.data[] | .id as $id | .items[] | [$id, .sku, .qty] | @csv`. In Python, `pd.json_normalize(payload["data"], sep="_").to_csv("orders.csv", index=False)` flattens nested objects much as this preset does, but it keeps a list in a single cell and leaves camelCase names alone; adding `record_path="items", meta=["id"]` gives one row per line item instead.
