import type { Preset } from '../types'
import { each, laneStep, step } from '../define'

/**
 * Click ids and campaign tags that identify the visit, never the page (ClearURLs and
 * Firefox lists, vendor docs). `si` (Spotify, YouTube shares) and `ref` stay: on some
 * sites they select content.
 */
const TRACKERS = [
  'utm_*',
  // Google Ads, Merchant Center and Analytics
  'gclid', 'gclsrc', 'dclid', 'gbraid', 'wbraid', 'gad_source', 'gad_campaignid', 'srsltid', '_gl', '_ga',
  // Meta, Microsoft, X, TikTok, LinkedIn
  'fbclid', 'igshid', 'igsh', 'msclkid', 'twclid', 'ttclid', 'li_fat_id',
  // email platforms: Mailchimp, HubSpot, Marketo, MailerLite, Vero, Drip, Klaviyo, Kit
  'mc_cid', 'mc_eid', '_hsenc', '_hsmi', '__hssc', '__hstc', '__hsfp', 'hsCtaTracking', 'hsa_*', 'mkt_tok',
  'ml_subscriber', 'ml_subscriber_hash', 'vero_id', 'vero_conv', '__s', '_kx', 'ck_subscriber_id',
  // others in the ClearURLs and Firefox lists
  'yclid', 'oly_anon_id', 'oly_enc_id', 's_cid', 'rb_clickid', 'wickedid',
].join(',')

/** A character of a bare link: nothing that wraps one (quotes, brackets, parentheses) or separates CSV fields. */
const URL_CHAR = String.raw`[^\s"'<>()\[\]{}|\\^,]`
/** A line that is one bare link, protocol-relative link, root-relative path or host/path, with a query. */
const ONE_LINK_WITH_QUERY = String.raw`^\s*(?:https?://|//|/|[a-z0-9-]+(?:\.[a-z0-9-]+)+[/?])` + URL_CHAR + '*\\?' + URL_CHAR + String.raw`+\s*$`

const preset: Preset = {
  slug: 'remove-tracking-parameters-from-urls',
  name: 'Remove tracking parameters from a list of URLs',
  summary:
    'Paste links one per line and get them back without utm_ tags, fbclid, gclid, srsltid and other click ids, with the parameters a page needs, the order and any #anchor kept.',
  category: 'Writing & Marketing',
  primaryQuery: 'remove tracking parameters from urls',
  published: '2026-10-08',
  updated: '2026-11-06',
  related: ['bulk-utm-link-builder', 'extract-domains-from-urls'],
  steps: [
    step('unescape', 'unescape_html', {},
      'Links copied from an email template or page source write & as &amp;, which turns the next parameter name into amp;utm_source, a name no list matches. Only the basic HTML escapes are undone, so a parameter such as &reg= is not turned into ®=.',
      { label: 'undo &amp;' }),
    each('per-link', { mode: 'lines' }, [
      laneStep('strip', 'query_params_normalize', {
        sort: false, dedupe: 'none', dropEmpty: false, drop: TRACKERS, decode: false, lowercaseHost: false,
      }, { condition: { kind: 'regex', pattern: ONE_LINK_WITH_QUERY, flags: 'i' }, label: 'drop tracking parameters' }),
    ],
    'Cleans one line at a time, and only a line that is a bare link or path with a query: headings, notes, links in quotes or brackets and CSV rows stay as typed. Given the whole list at once, the parameter step would read it as one URL. The parameters it keeps stay in their order.',
    { label: 'clean every link' }),
  ],
  samples: [
    {
      id: 'content-audit',
      title: 'Links gathered for a content audit',
      input: [
        'https://shop.example.com/products/trail-runner-2?variant=41&utm_source=newsletter&utm_medium=email&utm_campaign=fall_sale_2026',
        'https://www.example.com/blog/choosing-running-shoes?fbclid=IwZXh0bgNhZW0CMTEAARSrOw6IhJ9_y136Cf41Am5NIGKCAbQTOyOlNRfoB4',
        'https://shop.example.com/collections/sale?page=2&gad_source=1&gad_campaignid=21839402711&gclid=Cj0KCQjwUGX1QmH8HPvAUjzF68YqzMp4qDwTG_5DQi3bGeiO_BL9skGVIlG-ImOrWbMY_BwE',
        'https://shop.example.com/products/rain-shell?srsltid=AfmBOoDdEmWqX6LUQ5CYh87r4hTuS1i2p_AP25bEfZswbpTmxm',
        'https://www.example.com/pricing?plan=team&msclkid=316e70c60cf58bf70f3f6cda88f99b0b#compare',
        'https://shop.example.com/search?q=waterproof+jacket&color=blue&color=green&utm_source=onsite',
        'https://shop.example.com/products/gift-card?amount=50&amp;mc_cid=1607f293e8&amp;mc_eid=0e96b356ee',
        'https://www.example.com/contact',
        '',
      ].join('\n'),
      output: 'https://shop.example.com/products/trail-runner-2?variant=41\nhttps://www.example.com/blog/choosing-running-shoes\nhttps://shop.example.com/collections/sale?page=2\nhttps://shop.example.com/products/rain-shell\nhttps://www.example.com/pricing?plan=team#compare\nhttps://shop.example.com/search?q=waterproof+jacket&color=blue&color=green\nhttps://shop.example.com/products/gift-card?amount=50\nhttps://www.example.com/contact\n',
    },
    {
      id: 'email-html',
      title: 'Links from an email template',
      input: [
        'October newsletter: which links still carry trackers?',
        'https://www.example.com/webinars/content-audit?utm_source=hs_email&amp;utm_medium=email&amp;_hsenc=p2ANqtz-CKAYqPpnew5Dlw-AI0c7sOltsJKj9wcESykzUVbpQ2AE3KG9UTrTyGtki73q&amp;_hsmi=289412311',
        'https://www.example.com/guides/seo-audit-checklist?utm_campaign=october_newsletter&amp;hsCtaTracking=7c1f2b9e-4d3a-4e8f-9a61-2b5c8d0e3f47%7C3a9d6e12-5b7c-4f80-a1d2-6e9f0b3c4d58',
        'https://events.example.org/2026/lyon-meetup?ticket=early&amp;mkt_tok=NzQ3LUZXUC0yMDQAAAGIy_W1kaSpeWkF1X3fAfZmhY7-0ZJqnLj48Jg960b#agenda',
        'https://shop.example.com/products/wool-socks?_kx=Hq3vP0a8bmZL6eF2c1dmR4nT9sKwQ.XjK8aB&amp;size=m',
        '',
      ].join('\n'),
      output: 'October newsletter: which links still carry trackers?\nhttps://www.example.com/webinars/content-audit\nhttps://www.example.com/guides/seo-audit-checklist\nhttps://events.example.org/2026/lyon-meetup?ticket=early#agenda\nhttps://shop.example.com/products/wool-socks?size=m\n',
    },
    {
      id: 'ga4-paths',
      title: 'Landing page paths (GA4)',
      input: [
        '/pricing?plan=pro&utm_source=linkedin&utm_medium=paid_social&li_fat_id=2caab4c1-ab67-ffd2-3117-998aa6d85563',
        '/blog/seo-checklist?srsltid=AfmBOoDdEmWqX6LUQ5CYh87r4hTuS1i2p_AP25bEfZswbpTmxm',
        '/?gad_source=1&gbraid=0AAAAADm7yUoR3sj-os6t1hzNFUNKgpC&gclid=Cj0KCQjwUGX1QmH8HPvAUjzF68YqzMp4qDwTG_5DQi3bGeiO_BL9skGVIlG-ImOrWbMY_BwE',
        '/docs/getting-started#install',
        '/landing/summer?ttclid=E.C.P.pC2MfOaqGWBn6kS4TeBpDnVz65EGpaR04NDbvFH3&ref=tiktok',
        '/p/insta-launch?igsh=yj3fkm96jn9fwjuf',
      ].join('\n'),
      output: '/pricing?plan=pro\n/blog/seo-checklist\n/\n/docs/getting-started#install\n/landing/summer?ref=tiktok\n/p/insta-launch',
    },
  ],
}
export default preset
