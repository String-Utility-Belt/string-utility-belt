/**
 * Directories that list the site, and the badge each one asks for in return. Badges are
 * copies served from `public/badges/` (listings.test.ts checks them like a sponsor's SVG
 * logo), never the directory's own image or script: a page view sends the directory
 * nothing, and only a visitor who follows the link reaches it.
 */
export const DEVHUNT = {
  href: 'https://devhunt.org/tool/string-utility-belt',
  title: 'String Utility Belt on DevHunt',
  alt: 'String Utility Belt - Featured on DevHunt',
  light: '/badges/devhunt-light.svg',
  dark: '/badges/devhunt-dark.svg',
  /** The badge is 220×54; the footer shows it smaller, at the same aspect ratio. */
  width: 163,
  height: 40,
} as const
