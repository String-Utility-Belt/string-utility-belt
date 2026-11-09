import type { Preset } from '../types'
import { step } from '../define'

/** Senders that are systems, not people: no-reply and notification addresses, bounce handlers, mail-server roles. */
const AUTOMATED = '^(?:no-?reply|do-?not-?reply|notifications?|bounces?|mailer-daemon|postmaster)(?:[+._-][^@]*)?@'

const preset: Preset = {
  slug: 'extract-unique-emails-from-text',
  name: 'Extract unique email addresses from text',
  summary:
    'Paste an email thread, a CSV export or a contact page and get each address once: matched in any surrounding text, lower-cased so case variants count as one, sorted, and with no-reply senders left out.',
  category: 'Data & Spreadsheets',
  primaryQuery: 'extract unique email addresses from text',
  published: '2026-10-09',
  updated: '2026-11-06',
  related: ['hash-email-list-for-customer-match', 'extract-domains-from-urls'],
  steps: [
    step('lower', 'case', { mode: 'lower' },
      'Lower-cases everything first, so Dana.Whitfield@Example.com and dana.whitfield@example.com are recognised as the same address when duplicates are removed in the next step.',
      { label: 'lower-case' }),
    step('extract', 'extract_preset', { type: ['emails'], unique: true, sort: true, separator: '\n', count: false },
      'Finds every email address in the text, wherever it sits: inside angle brackets, after mailto:, in a CSV cell or at the end of a sentence. Keeps each one once and sorts the list alphabetically.',
      { label: 'pull out unique addresses' }),
    step('people', 'grep_lines', { pattern: AUTOMATED, regex: true, invert: true, ignoreCase: true, wholeWord: false, context: 0, lineNumbers: false },
      'Drops addresses that belong to systems rather than people, such as noreply@, notifications@, bounces+id@ and mailer-daemon@. Nobody reads them, and mail sent to them bounces or vanishes.',
      { label: 'leave out no-reply senders' }),
  ],
  samples: [
    {
      id: 'email-thread',
      title: 'Copied email thread',
      input: [
        'From: Dana Whitfield <Dana.Whitfield@example.com>',
        'To: marcus.oneil@example.org, "Priya Raman" <priya.raman@example.net>',
        'Cc: dana.whitfield@example.com',
        'Subject: Re: Q3 vendor list',
        '',
        'Thanks Priya. Looping in leo.martins@example.org for the contract.',
        '',
        'On Tue, Sep 29, 2026 at 9:14 AM Ticket Desk <noreply@help.example.com> wrote:',
        '> Your request #4471 was updated. Reply to support@example.com.',
        '',
      ].join('\n'),
      output: 'dana.whitfield@example.com\nleo.martins@example.org\nmarcus.oneil@example.org\npriya.raman@example.net\nsupport@example.com',
    },
    {
      id: 'csv-export',
      title: 'CSV export with repeats',
      input: [
        'name,email,company,last_bounce',
        'Ada Lovelace,ADA@example.com,Analytical Engines,',
        'Ada L.,ada@example.com,Analytical Engines,',
        'Grace Hopper,grace.hopper@example.org,,',
        'Alan Turing,alan.turing@example.co.uk,,bounces+8812@mail.example.com',
        '',
      ].join('\n'),
      output: 'ada@example.com\nalan.turing@example.co.uk\ngrace.hopper@example.org',
    },
    {
      id: 'contact-page',
      title: 'Contact page HTML',
      input: [
        '<p>Press enquiries: press@example.com.</p>',
        '<p>Sales: <a href="mailto:Sales@Example.co.uk?subject=Quote">Sales@Example.co.uk</a></p>',
        '<p>Updates come from notifications@example.com; please do not reply.</p>',
        '',
      ].join('\n'),
      output: 'press@example.com\nsales@example.co.uk',
    },
  ],
}
export default preset
