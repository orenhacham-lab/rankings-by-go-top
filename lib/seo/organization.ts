/**
 * WHO THE PRODUCT BELONGS TO, said once.
 *
 * Both JSON-LD surfaces — app/layout.tsx on every page, and /api/schema —
 * used to name GO TOP (https://www.gotop.co.il, the separate agency) as the
 * SoftwareApplication's `publisher`, `brand`, `author` and `parentOrganization`,
 * and the Organization's only `sameAs` entry was that agency's site.
 *
 * Two things follow from that, and both cost us reach:
 *
 * 1. An entity resolver — Google's, and every AI engine that reads schema —
 *    was told the SaaS is a sub-brand of an Israeli marketing agency. So the
 *    links and mentions the product earns accrue to the agency's entity, not
 *    to Go Top SEO, and "Digital Marketing" (the agency's mark) is the nearest
 *    label it has for us.
 * 2. `sameAs` is the one field that tells a resolver which profiles around the
 *    web ARE this product. Ours named none of them: not the Shopify listing,
 *    not the WordPress.org plugin, not the YouTube channel. Each of those is a
 *    verified, live profile, and listing them is how the four become one entity.
 *
 * Every URL below was fetched and returned 200 on 28 Oct 2026. A profile goes
 * in this list only once it is live — `sameAs` pointing at a 404 is worse than
 * a short list, because it is the one claim a resolver can cheaply disprove.
 *
 * Re-checked on 9 Nov 2026: eight of the ten answered 200 and named the product.
 * Two could not be read, and neither is a disproof of the claim, so both stay:
 * `www.vettoria.it` answered 429 to every request including its own
 * `robots.txt`, which is a host refusing this network rather than a missing
 * page, and `ainave.com` answered 502 on every page while its `robots.txt`
 * answered 200, which is their server erroring rather than our listing gone.
 * A removal needs a 404 or a page that no longer names the product.
 */

import { publicSiteLanguages } from './site-languages'

export const SITE_URL = 'https://www.gotopseo.com'

/** The organization node every other node points at, by id. */
export const ORGANIZATION_ID = `${SITE_URL}/#organization`

/**
 * The product's own profiles elsewhere. Verified live, newest last.
 * The agency's site is deliberately NOT here: it is a different organization,
 * and claiming it as "the same as" us is what pointed the entity at it.
 */
export const BRAND_PROFILES = [
  'https://apps.shopify.com/go-top-seo',
  'https://wordpress.org/plugins/go-top-seo-bridge/',
  'https://www.youtube.com/@GoTopSEO',
  'https://aitoolsatlas.ai/tools/go-top-seo',
  'https://toolradar.com/tools/go-top-seo',
  'https://www.vettoria.it/prodotti/go-top-seo',
  // Published since the list was written, and re-checked with the six above on
  // 2 Nov 2026: every entry returned 200 AND its page names the product. That
  // second half matters — addonbiz.com/job/go-top-seo/ also answers 200, but
  // the page it serves is their generic "add your business" page with no
  // mention of us, so it is a soft 404 and is deliberately NOT here.
  'https://ainave.com/products/go-top-seo',
  'https://biz100.co.il/listing/go-top-seo/',
  // Published 2 Nov 2026 by AI BEST SEARCH's own editors from our public pages.
  // Read in full before it went in here: monthly tracking, the three engines
  // checked automatically against the six the pricing page offers, $79 + tax,
  // the seven languages, WordPress/Shopify/Wix. Nothing in it needed a
  // correction, which is why it can be claimed as the same entity.
  'https://ai-best-search.com/products/go-top-seo',
  // Published 9 Nov 2026 by KI-Toolnavigator's editor, Dr Andreas Stoeckl, as a
  // full review written from our public pages — critical, not a puff piece, and
  // accurate. Read in full before it went in here. Verified the way this file
  // requires: HTTP 200 and the page names the product. It is also the first
  // earned do-follow source whose two anchors point at the free checker and the
  // open dataset rather than at the home page.
  'https://ki-toolnavigator.com/tool/go-top-seo',
] as const

/**
 * No `legalName`: the registered name carries the agency's "Digital Marketing"
 * mark, which never goes on a SaaS-brand surface.
 *
 * The contact details are the ones the site already prints in its footer and
 * on every legal page (components/public/contact.ts), so the markup and the
 * page agree. Markup that names a contact the reader cannot see is cloaking.
 */
export const SUPPORT_EMAIL = 'oren@gotop.co.il'
export const SUPPORT_PHONE = '054-9489377'

/** The publisher/brand/author node, by reference rather than by repetition. */
export const BRAND_REF = { '@type': 'Organization' as const, '@id': ORGANIZATION_ID }

export function organizationSchema(description: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': ORGANIZATION_ID,
    name: 'Go Top SEO',
    alternateName: ['Rankings by Go Top'],
    url: SITE_URL,
    logo: `${SITE_URL}/gotop-primary.png`,
    description,
    sameAs: [...BRAND_PROFILES],
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'Customer Support',
      email: SUPPORT_EMAIL,
      telephone: SUPPORT_PHONE,
      // The live locales, read from the routing gate rather than listed here:
      // the hand-written list said bare `pt`, which is not the Portuguese this
      // site serves. See lib/seo/site-languages.ts.
      availableLanguage: publicSiteLanguages(),
    },
    address: {
      '@type': 'PostalAddress',
      addressCountry: 'IL',
    },
  }
}
