/**
 * English source strings — the canonical dictionary every other locale (and
 * the `I18nKey` type) is derived from. Nest related strings under a shared
 * prefix (`blog.*`, `theme.*`) rather than inventing flat, ambiguous names.
 * A plural is an object of Intl.PluralRules categories used via `plural()`.
 *
 * See `../i18n.ts` for how a key is looked up and how to register a locale.
 */
export const en = {
  common: {
    loading: 'Loading…',
    items: { one: '{count} item', other: '{count} items' },
  },
  nav: {
    tool: 'Tool',
    docs: 'Docs',
    utilities: 'Utilities',
    presets: 'Presets',
    blog: 'Blog',
    changelog: 'Changelog',
  },
  integrations: {
    label: 'Integrations',
    lead: 'Get it for',
    new: 'New',
    chrome: 'Chrome',
    chromeName: 'Chrome extension, on the Chrome Web Store (opens in a new tab)',
    vscode: 'VS Code',
    vscodeName: 'VS Code extension, on the Visual Studio Marketplace (opens in a new tab)',
    mcp: 'MCP',
    mcpName: 'MCP server for AI agents: how to install',
    cli: 'CLI',
    cliName: 'CLI (command-line tool): how to install',
  },
  footer: {
    label: 'site',
    utilities: 'All utilities',
    integrations: 'Extensions, CLI & MCP',
    about: 'About',
    privacy: 'Privacy policy',
    contact: 'Contact',
    feedback: 'Feedback',
    advertise: 'Advertise',
    sponsor: 'Sponsor on GitHub',
    newTab: '(opens in a new tab)',
  },
  blog: {
    title: 'Blog',
    empty: 'No posts yet.',
    notFound: 'Post not found.',
  },
  select: {
    placeholder: '— select —',
  },
  theme: {
    system: 'System',
    light: 'Light',
    dark: 'Dark',
    toggleAria: 'Theme: {current}. Click for {next}.',
  },
  generate: {
    button: 'Describe it',
    buttonTitle: 'Describe a job in words and get a chain of steps to start from',
    title: 'Describe a pipeline',
    intro: 'Say what should happen to your text, step by step if you like. You get a chain of utilities to start from, which you can then edit, save to your library and reuse. Only this description is sent, to our server and on to Anthropic’s AI model; your input and output stay in your browser.',
    privacy: 'What is kept',
    label: 'What should the pipeline do?',
    placeholder: 'e.g. decode this base64, pretty-print the JSON, then sort its keys',
    count: '{count} / {max}',
    submit: 'Build steps',
    building: 'Building…',
    stepsHeading: 'Suggested steps',
    notesHeading: 'Notes',
    replace: 'Replace pipeline',
    use: 'Use these steps',
    append: 'Add to the end',
    review: 'Check each step on your own input before relying on the result.',
    unknownUtility: 'unknown utility',
    fallback: 'You can still build it yourself:',
    search: 'search the utilities',
    or: ', or ',
    mcp: 'use the MCP server from your own AI agent',
    error: {
      ai_off: 'The AI pipeline builder is not switched on right now.',
      ai_budget: 'The AI pipeline builder has used up today’s budget. It starts again at midnight UTC.',
      rateSoon: 'Too many requests at once. Try again in {seconds} s.',
      rateToday: 'That is all the AI pipelines for today. More are available after midnight UTC.',
      ai_invalid: 'That description could not be used. Describe the job in at most {max} characters.',
      ai_unusable: 'No usable steps came back for that description. Try naming the formats involved, such as base64, JSON or CSV.',
      ai_upstream: 'The AI model could not be reached. Try again in a minute.',
      offline: 'The AI pipeline builder could not be reached. Check your connection and try again.',
    },
  },
} as const
