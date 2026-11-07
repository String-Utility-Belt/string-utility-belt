import type { Preset } from '../types'
import { step } from '../define'

/** sed, one line at a time: delete the lines that are only a page number. */
const FOOTERS = [
  '# a page number alone on a line: 7, - 7 -, – 7 –',
  '/^\\s*[-–—]?\\s*\\d{1,4}\\s*[-–—]?\\s*$/d',
  '# Page 4, Page 4 of 12 (any case)',
  '/^\\s*page\\s+\\d+(\\s+of\\s+\\d+)?\\s*$/Id',
  '# add a line for your own running header or footer, e.g.',
  '# /^Example Corp Annual Report$/d',
].join('\n')

/** sed over the whole text: close the gap after a hyphen at a line end. */
const HYPHENS = [
  '# spe- / cific: a hyphen (or soft hyphen) between lowercase letters is the typesetter’s: drop it',
  's/(\\p{Ll})[-\\u00AD]\\n(\\p{Ll})/\\1\\2/g',
  '# 12- / month, 2023– / 2024: any other hyphen or dash is part of the text: keep it',
  's/(\\S[-–—])\\n(\\S)/\\1\\2/g',
].join('\n')

const preset: Preset = {
  slug: 'fix-pdf-line-breaks',
  name: 'Fix line breaks in text copied from a PDF',
  summary:
    'Paste text copied from a PDF and get running text back: broken lines joined, hyphenated words rejoined, page numbers removed and ligature characters spelled out, with blank-line paragraph breaks and list items kept.',
  category: 'Writing & Marketing',
  primaryQuery: 'remove line breaks from pdf text',
  published: '2026-10-07',
  updated: '2026-11-06',
  related: ['clean-chatgpt-text'],
  steps: [
    step('eol', 'normalize_line_endings', { mode: 'lf', finalNewline: 'keep' },
      'Files saved on Windows end every line with CR LF. Converting them to plain LF first lets the hyphen rules below, which expect a line feed straight after the hyphen, match there too.'),
    step('ligatures', 'multi_replace', {
      rules: [['\\uFB00', 'ff'], ['\\uFB01', 'fi'], ['\\uFB02', 'fl'], ['\\uFB03', 'ffi'], ['\\uFB04', 'ffl']],
      regex: true, ignoreCase: false, applyOnce: false,
    }, 'Text copied from some PDFs holds ff, fi, fl, ffi and ffl as single ligature characters (U+FB00–U+FB04). They look right but are different code points, so a search or comparison that matches exact characters does not find “find” in “ﬁnd”. This spells each one out.', { label: 'expand ligatures' }),
    step('footers', 'sed', { script: FOOTERS, perLine: true },
      'Deletes page numbers picked up from the page footer, such as “Page 4 of 12” or a bare “7”. It has to run while each is still a line of its own: after unwrapping, it would sit in the middle of a sentence.', { label: 'delete page numbers' }),
    step('hyphens', 'sed', { script: HYPHENS, perLine: false },
      'Rejoins words split at a line end before the lines are joined, which would otherwise leave “spe- cific”. A hyphen or soft hyphen between two lowercase letters is dropped; any other hyphen or dash, as in “12-month” or “2023–2024”, is kept.', { label: 'rejoin hyphenated words' }),
    step('unwrap', 'unwrap', { separator: ' ', preserveLists: true, preserveIndented: false },
      'Joins the lines of each paragraph with single spaces, an indented first line included. A blank line stays a paragraph break, and a line that starts with a bullet or a number such as “1.” keeps its own line, so lists survive.'),
    step('tidy', 'collapse_whitespace', { spaces: true, newlines: true, trim: true, tabsToSpaces: false, unicodeSpaces: false },
      'Deleting a page number that stood between two blank lines leaves a double gap, and the text keeps its final newline. This squeezes blank lines to one, collapses repeated spaces and trims every line and both ends.'),
  ],
  samples: [
    {
      id: 'article-copy',
      title: 'Article copied from a PDF viewer',
      input:
        'Content marketing works best when each article answers a spe-\n' +
        'ciﬁc question your audience is already asking. Plan a 12-\n' +
        'month calendar around those questions, then give each new\n' +
        'Page 4 of 12\n' +
        'article one clear, well-deﬁned job: explain, compare or\n' +
        'persuade. Diﬀerent jobs need diﬀerent calls to action, and a\n' +
        'reader who arrives from search should ﬁnd the answer on the\n' +
        'ﬁrst screen, not after three paragraphs of background.\n' +
        '\n' +
        'To ﬁnd the questions, start with what customers write:\n' +
        '• the sales team’s inbox\n' +
        '• support tickets that ask the same question in the\n' +
        'customer’s own words\n' +
        '• searches people run on your own site',
      output:
        'Content marketing works best when each article answers a specific question your audience is already asking. Plan a 12-month calendar around those questions, then give each new article one clear, well-defined job: explain, compare or persuade. Different jobs need different calls to action, and a reader who arrives from search should find the answer on the first screen, not after three paragraphs of background.\n' +
        '\n' +
        'To find the questions, start with what customers write:\n' +
        '• the sales team’s inbox\n' +
        '• support tickets that ask the same question in the customer’s own words\n' +
        '• searches people run on your own site',
    },
    {
      id: 'windows-crlf',
      title: 'Text file saved on Windows (CRLF)',
      input:
        'Every image needs alt text. A decorative one gets an empty alt at-\r\n' +
        'tribute, so screen readers skip it; a chart needs a sentence that\r\n' +
        '- 7 -\r\n' +
        'states the trend it shows, such as “Enrolment rose 40% in the 2023–\r\n' +
        '2024 school year”, not just “Bar chart, enrolment by year”.\r\n',
      output:
        'Every image needs alt text. A decorative one gets an empty alt attribute, so screen readers skip it; a chart needs a sentence that states the trend it shows, such as “Enrolment rose 40% in the 2023–2024 school year”, not just “Bar chart, enrolment by year”.',
    },
    {
      id: 'soft-hyphens',
      title: 'Soft hyphens, page number between paragraphs',
      input:
        'Refunds always go back to the original payment method. Re\u00AD\n' +
        'quests must reach our support team within 30 days of pur\u00AD\n' +
        'chase.\n' +
        '\n' +
        '12\n' +
        '\n' +
        'Annual plans are refunded pro rata for the full months\n' +
        'that remain.\n',
      output:
        'Refunds always go back to the original payment method. Requests must reach our support team within 30 days of purchase.\n' +
        '\n' +
        'Annual plans are refunded pro rata for the full months that remain.',
    },
    {
      id: 'indented-paragraphs',
      title: 'Paragraphs with indented first lines',
      input:
        '     Content briefs save editing time. Each one names the\n' +
        'reader, the question the article answers and the single call\n' +
        'to action it ends with.\n' +
        '\n' +
        '     Writers who get a brief before they start need fewer re-\n' +
        'vision rounds, and the published piece stays on topic.\n',
      output:
        'Content briefs save editing time. Each one names the reader, the question the article answers and the single call to action it ends with.\n' +
        '\n' +
        'Writers who get a brief before they start need fewer revision rounds, and the published piece stays on topic.',
    },
    {
      id: 'docs-bullets-and-clauses',
      title: 'Google Docs bullets and contract clauses',
      input:
        'Our onboarding covers three areas:\n' +
        '\u25cf Account setup and billing\n' +
        '\u25cf Importing contacts from a CSV\n' +
        'file or another CRM\n' +
        '\u25cf Building the first campaign\n' +
        '\n' +
        'The Supplier shall:\n' +
        '(a) deliver the goods within 30 days of the\n' +
        'order date;\n' +
        '(b) replace defective goods at its own cost; and\n' +
        '(c) keep records for six years.\n',
      output:
        'Our onboarding covers three areas:\n' +
        '\u25cf Account setup and billing\n' +
        '\u25cf Importing contacts from a CSV file or another CRM\n' +
        '\u25cf Building the first campaign\n' +
        '\n' +
        'The Supplier shall:\n' +
        '(a) deliver the goods within 30 days of the order date;\n' +
        '(b) replace defective goods at its own cost; and\n' +
        '(c) keep records for six years.',
    },
  ],
}
export default preset
