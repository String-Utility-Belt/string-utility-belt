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
} as const
