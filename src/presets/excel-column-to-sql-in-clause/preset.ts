import type { Preset } from '../types'
import { each, laneStep, step } from '../define'

const preset: Preset = {
  slug: 'excel-column-to-sql-in-clause',
  name: 'Turn an Excel column into a SQL IN clause',
  summary:
    'Convert a column copied from Excel or Google Sheets into a comma separated list with single quotes, ready to run as IN (…): whitespace trimmed, duplicates dropped, and every value escaped for your SQL dialect.',
  category: 'Data & Spreadsheets',
  primaryQuery: 'excel column to sql in clause',
  published: '2026-10-07',
  updated: '2026-11-06',
  related: ['nested-json-to-csv'],
  steps: [
    step('trim', 'trim_lines', { side: 'both', characters: '' },
      'Cells copied from a spreadsheet often carry leading or trailing spaces, tabs or non-breaking spaces, which would end up inside the quotes.'),
    step('dedupe', 'line_dedupe', { caseSensitive: true },
      'Repeated values make the list longer without changing the result. Exact matches only, so values that differ in case stay distinct.'),
    each('quote', { mode: 'lines' }, [laneStep('escape', 'sql_escape', { flavor: 'ansi', wrap: true })],
      "Turns each value into a SQL string literal on its own: doubles every apostrophe, so O'Connor stays one value, and wraps it in single quotes. Switch the flavor to mysql for MySQL and MariaDB backslash escapes, or mssql for an N prefix on non-ASCII names.",
      { label: 'quote each value' }),
    step('join', 'line_affix', { prefix: '', suffix: '', skipBlank: true, joinWith: ', ' },
      'Joins the quoted values with commas onto one line, skipping the blank cells between rows, which have nothing to quote.',
      { label: 'join with commas' }),
    step('wrap', 'line_affix', { prefix: 'IN (', suffix: ')', skipBlank: true, joinWith: '' },
      'Adds the IN ( … ) around the list, so the result pastes straight after WHERE column_name in your query.',
      { label: 'wrap in IN ( … )' }),
  ],
  samples: [
    {
      id: 'email-column',
      title: 'Email column',
      input: "  dana.whitfield@example.com\nmarcus.oneil@example.org\n\nPriya.Raman@example.net \ndana.whitfield@example.com\nsean.o'connor@example.com\n\tleo.martins@example.org\nmarcus.oneil@example.org\n",
      output: "IN ('dana.whitfield@example.com', 'marcus.oneil@example.org', 'Priya.Raman@example.net', 'sean.o''connor@example.com', 'leo.martins@example.org')",
    },
    {
      id: 'windows-copy',
      title: 'SKUs copied on Windows',
      input: 'SKU-1001\r\nSKU-1002 \r\nSKU-1001\r\nSKU-2040\r\n',
      output: "IN ('SKU-1001', 'SKU-1002', 'SKU-2040')",
    },
    {
      id: 'customer-names',
      title: 'Names with apostrophes',
      input: "O'Brien\nD'Angelo\nO'Brien\nMcAllister\n",
      output: "IN ('O''Brien', 'D''Angelo', 'McAllister')",
    },
  ],
}
export default preset
