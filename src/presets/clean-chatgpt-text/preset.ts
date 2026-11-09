import type { Preset } from '../types'
import { step } from '../define'

/** Step 3: keep list numbers, bullets, tables and bold labels readable before strip markdown runs. */
const LISTS = [
  '# drop horizontal rules and table divider rows (---, * * *, |---|:--|)',
  String.raw`/^[\s|:]*([-*_][\s|:]*){3,}$/d`,
  '# table rows lose their outer pipes',
  String.raw`s/^\s*\|\s*(.*?)\s*\|\s*$/\1/`,
  '# bullets become •, keeping their indent',
  String.raw`s/^(\s*)[-*+]\s+/\1• /`,
  '# write 1. as 1\\. so strip markdown keeps the number',
  String.raw`s/^(\s*\d+)\.\s+/\1\\. /`,
  '# a bold label opening a line or list item: **Label** — text becomes **Label**: text',
  String.raw`s/^(\s*(?:• |\d+\\\. )?\*\*[^*]+\*\*) *— */\1: /`,
].join('\n')

const preset: Preset = {
  slug: 'clean-chatgpt-text',
  name: 'Remove ChatGPT formatting from copied text',
  summary:
    'Paste a ChatGPT answer and get plain text for an email, post or CMS: Markdown symbols gone, list numbers and bullets kept, and em dashes, curly quotes and hidden characters replaced.',
  category: 'Writing & Marketing',
  primaryQuery: 'remove chatgpt formatting',
  published: '2026-10-07',
  updated: '2026-11-06',
  related: ['fix-pdf-line-breaks', 'fix-bash-bad-interpreter'],
  steps: [
    step('hidden', 'remove_invisible', { mode: 'remove' },
      'Deletes zero-width spaces, soft hyphens, byte order marks and other characters you cannot see. They survive copy and paste, make exact-match search miss text that looks identical, and at the start of a line they hide a bullet or ### from the steps after this one.'),
    step('spaces', 'collapse_whitespace', { spaces: false, newlines: false, trim: false, tabsToSpaces: false, unicodeSpaces: true },
      'Turns no-break (U+00A0), narrow no-break (U+202F) and other Unicode spaces into ordinary ones. They look like spaces but stop lines from wrapping, and the dash rules after this step match plain spaces only. Collapsing and trimming are off so indented sub-lists keep their indent.',
      { label: 'no-break spaces to plain spaces' }),
    step('lists', 'sed', { script: LISTS, perLine: true },
      'Strip markdown deletes list markers, numbers included, so this runs first: bullets become • with their indent kept, 1. becomes 1\\. so the number survives, divider rows and horizontal rules go, table rows lose their outer pipes, and an em dash after a bold label that opens a line or list item becomes a colon.',
      { label: 'keep lists, tables and labels readable' }),
    step('markdown', 'markdown_strip', { keepLinkUrls: true, keepCodeBlocks: true },
      'Removes the remaining Markdown: ** and * emphasis, ### headings, > quote markers, backticks and code fences (the code itself stays), and turns 1\\. back into 1. Links keep their URL in parentheses after the link text.'),
    step('dashes', 'multi_replace', { rules: [['–', '-'], ['(^|\\n) *— *', '$1- '], [' *— *', ', ']], regex: true, ignoreCase: false, applyOnce: false },
      'En dashes become hyphens, so 30–50 and Mon–Fri keep their meaning; an em dash opening a line becomes "- "; every other em dash becomes a comma. It runs after the Markdown steps, which would read that "- " as a bullet. Edit the last rule to use another mark.',
      { label: 'replace em and en dashes' }),
    step('quotes', 'smart_quotes', { direction: 'to-straight', quotes: true, dashes: false, ellipsis: true },
      'Turns curly quotes and apostrophes into straight ones and the … character into three periods, their plain ASCII forms. Its dashes option is off so it never turns a dash into -- or ---: step 5 has already chosen what each dash becomes.',
      { label: 'straighten quotes' }),
  ],
  samples: [
    {
      id: 'email-tips',
      title: 'Answer with lists and a link',
      input:
        '### How to Improve Your Email Open Rates\n\n' +
        'Email marketing still works—if your emails get *opened*. Here’s what helps in 2026:\n\n' +
        '1. **Write shorter subject lines**\u00a0— aim for 30–50 characters.\n' +
        '2. **Personalize beyond the first name**:\n' +
        '   - Segment by last order date\n' +
        '   - Mention the product they viewed\n' +
        '3. **Send at the right time** — test mornings vs. evenings.\n' +
        '4. **Skip the hype**: phrases like “FREE!!!” or “Act now…” read as spam.\n\n' +
        '---\n\n' +
        '> **Pro tip:** Clean your list every 90\u202fdays\u200b to protect your sender reputation. ' +
        'This [deliverability checklist](https://example.com/deliverability) covers the rest.\n\n' +
        'In short—focus on relevance, not volume. Want me to draft a few subject lines for you?\n',
      output:
        'How to Improve Your Email Open Rates\n\n' +
        "Email marketing still works, if your emails get opened. Here's what helps in 2026:\n\n" +
        '1. Write shorter subject lines: aim for 30-50 characters.\n' +
        '2. Personalize beyond the first name:\n' +
        '   • Segment by last order date\n' +
        '   • Mention the product they viewed\n' +
        '3. Send at the right time: test mornings vs. evenings.\n' +
        '4. Skip the hype: phrases like "FREE!!!" or "Act now..." read as spam.\n\n' +
        'Pro tip: Clean your list every 90 days to protect your sender reputation. ' +
        'This deliverability checklist (https://example.com/deliverability) covers the rest.\n\n' +
        'In short, focus on relevance, not volume. Want me to draft a few subject lines for you?',
    },
    {
      id: 'comparison-table',
      title: 'Comparison table',
      input:
        'Here’s a quick comparison of the three plans:\n\n' +
        '| Plan | Price | Best for |\n' +
        '|------|-------|----------|\n' +
        '| **Starter** | $9/mo | Solo creators |\n' +
        '| **Team** | $29/mo | Teams of 5–20 |\n' +
        '| **Business** | Custom | Phone support Mon–Fri |\n\n' +
        '---\n\n' +
        '**Bottom line:** most small teams should start with *Team*—the best value per seat.\n',
      output:
        "Here's a quick comparison of the three plans:\n\n" +
        'Plan | Price | Best for\n' +
        'Starter | $9/mo | Solo creators\n' +
        'Team | $29/mo | Teams of 5-20\n' +
        'Business | Custom | Phone support Mon-Fri\n\n' +
        'Bottom line: most small teams should start with Team, the best value per seat.',
    },
    {
      id: 'linkedin-post',
      title: 'Social post with a quote',
      input:
        '**Hot take:** your onboarding emails are too long. 📩\n\n' +
        'We cut ours from 450 words to 120—and replies went *up*.\n\n' +
        '“If it takes more than one scroll, nobody reads it.”\n' +
        '— our head of lifecycle marketing\n\n' +
        '#emailmarketing #saas\n',
      output:
        'Hot take: your onboarding emails are too long. 📩\n\n' +
        'We cut ours from 450 words to 120, and replies went up.\n\n' +
        '"If it takes more than one scroll, nobody reads it."\n' +
        '- our head of lifecycle marketing\n\n' +
        '#emailmarketing #saas',
    },
    {
      id: 'bold-mid-sentence',
      title: 'Bold phrase before a dash',
      input:
        'Pick a topic you can write about **every week**\u2014not just once.\n' +
        '\n' +
        '- **Consistency** \u2014 the habit matters more than the length.\n' +
        '- Start with **Team**\u2014the best value per seat.\n',
      output:
        'Pick a topic you can write about every week, not just once.\n' +
        '\n' +
        '\u2022 Consistency: the habit matters more than the length.\n' +
        '\u2022 Start with Team, the best value per seat.',
    },
  ],
}
export default preset
