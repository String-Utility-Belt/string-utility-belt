import { POSTS } from '@/utilities/_generated/posts'

export interface UtilityPost { slug: string; title: string }

/**
 * Blog posts about a utility (their `utilities` in `public/blog/_manifest.json`), linked from
 * its page in the app and the pre-render alike, so no post is reachable from the blog index only.
 */
export const postsAbout = (id: string): UtilityPost[] => POSTS[id] ?? []

/** A post's crawlable, pre-rendered URL path. */
export const postPath = (slug: string): string => `/blog/${encodeURIComponent(slug)}/`
