import type { Preset } from '../types'
import { each, laneStep, step } from '../define'

const preset: Preset = {
  slug: 'bulk-md5-hash',
  name: 'MD5-hash every line of a list',
  summary:
    'Paste a list of values, one per line, and get the MD5 of each on the same row, with hidden characters and stray spaces removed first so every hash is the hash of the value you can see.',
  category: 'Data & Spreadsheets',
  primaryQuery: 'md5 hash a list of strings',
  published: '2026-11-06',
  related: ['hash-email-list-for-customer-match', 'bulk-base64-decode', 'extract-ip-addresses-from-text'],
  steps: [
    step('hidden', 'remove_invisible', { mode: 'remove' },
      'Deletes zero-width spaces, a byte order mark and other characters that take no room on screen. Text copied from a web page, a Word document or a file saved by Notepad often carries them, and one of them changes the hash completely while the value looks identical.',
      { label: 'remove hidden characters' }),
    step('trim', 'trim_lines', { side: 'both', characters: '' },
      'Removes spaces, tabs and no-break spaces from both ends of every line, the padding a spreadsheet or a terminal adds when a column is copied. MD5 hashes those too, so "SKU-1002 " and "SKU-1002" would never match.',
      { label: 'trim each line' }),
    each('hash', { mode: 'lines' }, [laneStep('md5', 'md5', {})],
      'Hashes every line on its own and writes the 32 hex digits back on the same row. Blank lines stay blank, so the output pastes next to the original column and the rows still line up; without this step the whole list would become one hash.',
      { label: 'MD5 each line' }),
  ],
  samples: [
    {
      id: 'sku-column',
      title: 'SKU column with a BOM and padding',
      input: '﻿SKU-1001\nSKU-1002 \nSKU-2040​\n\nSKU-1001\n',
      output: '4bc3d027bedf267b06fbf215d0afcfa1\nac05fb9136bb66787df98e8907a34cc5\n5cc9d2ae83fa419b05848b74afbed378\n\n4bc3d027bedf267b06fbf215d0afcfa1\n',
    },
    {
      id: 'email-list-windows',
      title: 'Email list saved on Windows',
      input: 'dana@example.com\r\nMarcus.ONeil@example.org\r\n\tpriya.raman@example.net\r\n',
      output: 'e556d839bbda3d423c5b09096613f2d7\r\n8c27f9065aac6ae5a2395b0faece8e11\r\nee0999d9a3a4e9b8d91c58a6d9fccc80\r\n',
    },
    {
      id: 'invoice-numbers',
      title: 'Invoice numbers copied from a web page',
      input: 'INV-2026-00017 \nINV-2026-00018\n',
      output: '705af60e0f47fa88714d304c9e66668c\nc5c8b58a5817ddc02a9f4aea9b7f7d21\n',
    },
  ],
}
export default preset
