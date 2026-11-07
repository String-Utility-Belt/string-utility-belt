import type { Preset } from '../types'
import { step } from '../define'

const preset: Preset = {
  slug: 'nested-json-to-csv',
  name: 'Convert nested JSON to CSV',
  summary:
    'Paste an API response or a JSON array and get a spreadsheet-ready CSV: the records picked out of their envelope, nested objects and arrays spread into columns of their own, and headers renamed to snake_case.',
  category: 'Data & Spreadsheets',
  primaryQuery: 'nested json to csv',
  published: '2026-10-07',
  updated: '2026-11-06',
  related: ['unescape-stringified-json', 'excel-column-to-sql-in-clause'],
  steps: [
    step('rows', 'jsonpath', { path: '$.data[*]', mode: 'values', indent: 2 },
      'Picks the records out of the response envelope. $.data[*] returns each item of the data array and leaves the paging details behind; without it, the whole response becomes one very wide row. Edit the path to match your JSON. Skipped when the input is already an array.',
      { label: 'select the records', condition: { kind: 'regex', pattern: '^\\s*\\{' } }),
    step('csv', 'json_to_csv', { delimiter: ',', header: true, flatten: true, eol: 'lf', columns: '' },
      'Writes one row per record, with a column for every key any record has. Flatten nested gives each nested field its own column, such as total.amount or items[0].sku, instead of a cell of raw JSON. Missing fields and nulls become empty cells; values with commas, quotes or line breaks are quoted.',
      { onError: 'stop' }),
    step('headers', 'csv_normalize_headers', { style: 'snake', delimiter: 'auto', dedupe: true },
      'Renames the header row to snake_case: total.amount becomes total_amount and createdAt becomes created_at. A column name containing a dot has to be quoted in SQL, and PostgreSQL folds an unquoted createdAt to createdat, so these names import cleanly.'),
  ],
  samples: [
    {
      id: 'orders-response',
      title: 'Orders API response',
      input: String.raw`{
  "data": [
    {
      "id": "ord_1001",
      "status": "shipped",
      "createdAt": "2026-03-02T14:21:09Z",
      "total": {"amount": "1249.50", "currency": "USD"},
      "customer": {"name": "Dana Whitfield", "email": "dana@example.com"},
      "shipping": {"city": "Seattle", "country": "US"}
    },
    {
      "id": "ord_1002",
      "status": "pending",
      "createdAt": "2026-03-03T08:02:44Z",
      "total": {"amount": "89.99", "currency": "EUR"},
      "customer": {"name": "Marcus O'Neil", "email": "marcus@example.org"},
      "shipping": {"city": "Dublin", "country": "IE"}
    },
    {
      "id": "ord_1003",
      "status": "shipped",
      "createdAt": "2026-03-03T19:45:00Z",
      "total": {"amount": "310.00", "currency": "USD"},
      "customer": {"name": "Priya Raman", "email": "priya@example.net"},
      "shipping": {"city": "Austin, TX", "country": "US"}
    }
  ],
  "meta": {"page": 1, "perPage": 50, "next": null}
}`,
      output: String.raw`id,status,created_at,total_amount,total_currency,customer_name,customer_email,shipping_city,shipping_country
ord_1001,shipped,2026-03-02T14:21:09Z,1249.50,USD,Dana Whitfield,dana@example.com,Seattle,US
ord_1002,pending,2026-03-03T08:02:44Z,89.99,EUR,Marcus O'Neil,marcus@example.org,Dublin,IE
ord_1003,shipped,2026-03-03T19:45:00Z,310.00,USD,Priya Raman,priya@example.net,"Austin, TX",US`,
    },
    {
      id: 'json-api-document',
      title: 'JSON:API document',
      input: String.raw`{
  "data": [
    {
      "type": "articles",
      "id": "101",
      "attributes": {
        "title": "Rate limits, explained",
        "publishedAt": "2026-05-04",
        "tags": ["api", "http"]
      },
      "relationships": {
        "author": {"data": {"type": "people", "id": "7"}}
      }
    },
    {
      "type": "articles",
      "id": "102",
      "attributes": {
        "title": "Paginating with \"next\" links",
        "publishedAt": null,
        "tags": ["api", "pagination"]
      },
      "relationships": {
        "author": {"data": {"type": "people", "id": "12"}}
      }
    }
  ],
  "links": {
    "self": "https://api.example.com/articles?page[number]=1",
    "next": "https://api.example.com/articles?page[number]=2"
  }
}`,
      output: String.raw`type,id,attributes_title,attributes_published_at,attributes_tags_0,attributes_tags_1,relationships_author_data_type,relationships_author_data_id
articles,101,"Rate limits, explained",2026-05-04,api,http,people,7
articles,102,"Paginating with ""next"" links",,api,pagination,people,12`,
    },
    {
      id: 'plain-array',
      title: 'Plain array with line items',
      input: String.raw`[
  {
    "orderId": "A-3001",
    "placedAt": "2026-04-11",
    "items": [{"sku": "MUG-01", "qty": 2}],
    "giftNote": "Happy birthday!\nLove, Sam",
    "coupon": null
  },
  {
    "orderId": "A-3002",
    "placedAt": "2026-04-12",
    "items": [{"sku": "TEE-M", "qty": 1}, {"sku": "CAP-02", "qty": 3}],
    "coupon": "SPRING10"
  },
  {
    "orderId": "A-3003",
    "placedAt": "2026-04-12",
    "items": [{"sku": "MUG-01", "qty": 1}],
    "coupon": null
  }
]`,
      output: String.raw`order_id,placed_at,items_0_sku,items_0_qty,gift_note,coupon,items_1_sku,items_1_qty
A-3001,2026-04-11,MUG-01,2,"Happy birthday!
Love, Sam",,,
A-3002,2026-04-12,TEE-M,1,,SPRING10,CAP-02,3
A-3003,2026-04-12,MUG-01,1,,,,`,
    },
  ],
}
export default preset
