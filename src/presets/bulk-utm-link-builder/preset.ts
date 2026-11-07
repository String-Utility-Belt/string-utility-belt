import type { Preset } from '../types'
import { each, laneStep, step } from '../define'

/** Step 4: mark where the tags go, choosing ? or & and staying in front of any #fragment. */
const SLOT = [
  '# the link already has a query: add &{utm} before any #fragment',
  String.raw`/^[^#]*\?/ s/^([^#]*)/\1\&{utm}/`,
  '# no query yet: add ?{utm} before any #fragment',
  String.raw`/^[^#]*\?/! s/^([^#]*)/\1?{utm}/`,
].join('\n')

const preset: Preset = {
  slug: 'bulk-utm-link-builder',
  name: 'Add UTM parameters to a list of URLs',
  summary:
    'Paste a list of links, spreadsheet cells, a draft or HTML and get every URL tagged with the same utm_source, utm_medium and utm_campaign: old tags replaced, ? or & chosen per link, #anchors kept working.',
  category: 'Writing & Marketing',
  primaryQuery: 'bulk utm builder',
  published: '2026-10-07',
  updated: '2026-11-06',
  related: ['clean-chatgpt-text'],
  steps: [
    step('extract', 'extract_preset', { type: ['urls'], unique: false, sort: false, separator: '\n', count: false },
      "Pulls every link out of whatever you paste, whether a list, spreadsheet columns, a draft or HTML, one per line. Surrounding spaces, column labels, HTML tags and a sentence's trailing comma, period or closing parenthesis are left behind.",
      { label: 'pull out the links' }),
    each('strip', { mode: 'lines' }, [
      laneStep('amp', 'unescape_html', {}, { label: 'turn &amp; back into &' }),
      laneStep('drop-utm', 'query_params_normalize', {
        sort: false, dedupe: 'none', dropEmpty: false, drop: 'utm_*', decode: false, lowercaseHost: false,
      }, { label: 'drop utm_* parameters' }),
    ],
    'Cleans one link at a time: turns the &amp; of HTML source back into &, then drops every query parameter matching utm_*, in any capitalization, with the ? or & it leaves behind. Add fbclid or gclid to the drop list to strip those too. Otherwise a reused link carries two utm_source values.',
    { label: 'remove old utm_ tags' }),
    step('dedupe', 'line_dedupe', { caseSensitive: true },
      "Drops repeated links. It runs after the old tags are gone, so a page listed twice, once with last campaign's utm_ values and once without, comes out as one link."),
    step('slot', 'sed', { script: SLOT, perLine: true },
      'Marks where the tags go with {utm}, starting a query with ? or extending one with &, always in front of any #fragment. A tag written after # is part of the fragment, which query-string parsers ignore and the browser never sends to the server.',
      { label: 'add ? or & before any #' }),
    step('fill', 'multi_replace', {
      rules: [
        ['{utm}', 'utm_source={source}&utm_medium={medium}&utm_campaign={campaign}'],
        ['{source}', 'newsletter'],
        ['{medium}', 'email'],
        ['{campaign}', 'fall_sale_2026'],
      ],
      regex: false, ignoreCase: false, applyOnce: false,
    },
    'Fills in the tags from an editable table, top row first: {utm} becomes three utm_ pairs, then each placeholder becomes its value. Change newsletter, email or fall_sale_2026 here, or add &utm_content={content} to the first row plus a {content} row, and every link follows.',
    { label: 'your UTM values' }),
  ],
  samples: [
    {
      id: 'page-list',
      title: 'List of pages',
      input: 'https://www.example.com/pricing\n  https://www.example.com/blog/email-open-rates?ref=nav\nhttps://www.example.com/features#integrations\nhttps://www.example.com/pricing?utm_source=newsletter&utm_medium=email&utm_campaign=summer_2026\nhttps://www.example.com/signup?plan=pro&utm_source=twitter&utm_medium=social\nhttps://www.example.com/webinar?utm_campaign=old_promo#register\n',
      output:
        'https://www.example.com/pricing?utm_source=newsletter&utm_medium=email&utm_campaign=fall_sale_2026\nhttps://www.example.com/blog/email-open-rates?ref=nav&utm_source=newsletter&utm_medium=email&utm_campaign=fall_sale_2026\nhttps://www.example.com/features?utm_source=newsletter&utm_medium=email&utm_campaign=fall_sale_2026#integrations\nhttps://www.example.com/signup?plan=pro&utm_source=newsletter&utm_medium=email&utm_campaign=fall_sale_2026\nhttps://www.example.com/webinar?utm_source=newsletter&utm_medium=email&utm_campaign=fall_sale_2026#register',
    },
    {
      id: 'spreadsheet-columns',
      title: 'Spreadsheet columns (Windows)',
      input: 'Page\tURL\r\nHome\thttps://www.example.com/\r\nCase study\thttps://www.example.com/customers/acme-logistics?utm_source=linkedin&utm_medium=social\r\nCase study (old link)\thttps://www.example.com/customers/acme-logistics?utm_source=newsletter&utm_medium=email&utm_campaign=summer_2026\r\nDocs\thttps://docs.example.com/start#install\r\n',
      output:
        'https://www.example.com/?utm_source=newsletter&utm_medium=email&utm_campaign=fall_sale_2026\nhttps://www.example.com/customers/acme-logistics?utm_source=newsletter&utm_medium=email&utm_campaign=fall_sale_2026\nhttps://docs.example.com/start?utm_source=newsletter&utm_medium=email&utm_campaign=fall_sale_2026#install',
    },
    {
      id: 'newsletter-draft',
      title: 'Links in a draft',
      input: "Hi there,\n\nOur fall sale starts Monday. See what's included (https://www.example.com/sale), compare plans at https://www.example.com/pricing?billing=annual, or read the setup guide at www.example.com/guides/getting-started.\n\nQuestions? Visit https://www.example.com/help#contact.\n",
      output:
        'https://www.example.com/sale?utm_source=newsletter&utm_medium=email&utm_campaign=fall_sale_2026\nhttps://www.example.com/pricing?billing=annual&utm_source=newsletter&utm_medium=email&utm_campaign=fall_sale_2026\nwww.example.com/guides/getting-started?utm_source=newsletter&utm_medium=email&utm_campaign=fall_sale_2026\nhttps://www.example.com/help?utm_source=newsletter&utm_medium=email&utm_campaign=fall_sale_2026#contact',
    },
    {
      id: 'html-source',
      title: 'HTML email source',
      input: '<p><a href="https://app.example.com/#/settings?tab=billing">Update your billing details</a></p>\n<p><a href="https://www.example.com/offer?UTM_Source=Partner&amp;utm_medium=referral&amp;ref=footer">See the partner offer</a></p>\n',
      output:
        'https://app.example.com/?utm_source=newsletter&utm_medium=email&utm_campaign=fall_sale_2026#/settings?tab=billing\nhttps://www.example.com/offer?ref=footer&utm_source=newsletter&utm_medium=email&utm_campaign=fall_sale_2026',
    },
  ],
}
export default preset
