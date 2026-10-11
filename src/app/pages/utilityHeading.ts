import { HEADINGS } from '@/utilities/_generated/headings'
import { displayName } from './seo'

/**
 * A utility page's `<h1>`, the same in the app and the pre-render: the search term from
 * its guide's title ("Base64 Encode"), else the utility name. Only the doc page and the
 * pre-render import this, so the map stays out of the entry chunk.
 */
export const utilityHeading = (id: string, name: string): string => HEADINGS[id] ?? displayName(name)
