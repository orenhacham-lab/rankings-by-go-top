/**
 * Free listings: sites where a business adds ITSELF, for free: a business
 * profile, a directory card, a review page. The owner does it alone, on the
 * site's own sign-up page; nobody is asked for a link, nothing is paid for.
 *
 * Wave 9 (owner, 2026-09-30): the Links tab used to list every directory, "best
 * of" article, association and news site that showed up in the project's
 * searches, with steps for asking each one for a link. "Nobody gives you a link
 * just like that": that list is gone. What stays is this short, curated list,
 * each entry checked by hand against the site's own terms:
 *
 *   - the basic listing is free (a paid upgrade may exist; it is never needed);
 *   - the business opens it itself, on the site's own page (no editor to write
 *     to, no approval by a person to ask for);
 *   - it is a business listing, not a competitor and not a marketplace.
 *
 * Left out on purpose (checked): price-comparison and lead sites where a listing
 * is paid (zap.co.il, midrag.co.il, zips.co.il), sites whose consumer directory
 * closed (Foursquare City Guide, 2024), and any "best of" list, association or
 * newspaper (those are someone else's editorial choice).
 *
 * `url` is the site's own "add your business" page, or its home page when the
 * sign-up page moves often. Every address is https on the site's own domain.
 *
 * Pure: no React, no I/O. Guarded by lib/site-links/__qa__/free-listings.qa.ts.
 */

/** Who the site is for. The screen says it in words (dictionary: siteLinks.listings.fit). */
export type ListingFit = 'any' | 'local' | 'hospitality' | 'home' | 'b2b' | 'software'
/** Where the site works: everywhere, only in Israel, or everywhere but Israel. */
export type ListingRegion = 'all' | 'il' | 'not_il'

export interface FreeListing {
  /** Stable key; the dictionary's words for the entry are under it. */
  id: string
  name: string
  domain: string
  url: string
  fit: ListingFit
  region: ListingRegion
}

export const FREE_LISTINGS: readonly FreeListing[] = [
  // Every business: the maps and assistants that answer "near me" questions.
  { id: 'google', name: 'Google Business Profile', domain: 'google.com', url: 'https://www.google.com/business/', fit: 'any', region: 'all' },
  { id: 'bing', name: 'Bing Places for Business', domain: 'bingplaces.com', url: 'https://www.bingplaces.com/', fit: 'any', region: 'all' },
  { id: 'apple', name: 'Apple Business Connect', domain: 'businessconnect.apple.com', url: 'https://businessconnect.apple.com/', fit: 'any', region: 'all' },
  // Israel: the business directories with a free basic card.
  { id: 'dapei_zahav', name: 'דפי זהב', domain: 'd.co.il', url: 'https://www.d.co.il/', fit: 'local', region: 'il' },
  { id: 'b144', name: 'B144', domain: 'b144.co.il', url: 'https://www.b144.co.il/', fit: 'local', region: 'il' },
  { id: 'easy', name: 'Easy', domain: 'easy.co.il', url: 'https://easy.co.il/', fit: 'local', region: 'il' },
  // Outside Israel (Yelp does not list Israeli businesses).
  { id: 'yelp', name: 'Yelp for Business', domain: 'yelp.com', url: 'https://biz.yelp.com/', fit: 'local', region: 'not_il' },
  // Reviews: a free business page any business can open.
  { id: 'trustpilot', name: 'Trustpilot', domain: 'trustpilot.com', url: 'https://business.trustpilot.com/', fit: 'any', region: 'all' },
  // By field.
  { id: 'tripadvisor', name: 'Tripadvisor', domain: 'tripadvisor.com', url: 'https://www.tripadvisor.com/Owners', fit: 'hospitality', region: 'all' },
  { id: 'houzz', name: 'Houzz', domain: 'houzz.com', url: 'https://www.houzz.com/', fit: 'home', region: 'all' },
  { id: 'clutch', name: 'Clutch', domain: 'clutch.co', url: 'https://clutch.co/get-listed', fit: 'b2b', region: 'all' },
  { id: 'goodfirms', name: 'GoodFirms', domain: 'goodfirms.co', url: 'https://www.goodfirms.co/', fit: 'b2b', region: 'all' },
  { id: 'capterra', name: 'Capterra', domain: 'capterra.com', url: 'https://www.capterra.com/vendors/', fit: 'software', region: 'all' },
  { id: 'g2', name: 'G2', domain: 'g2.com', url: 'https://sell.g2.com/', fit: 'software', region: 'all' },
]

/** Israel when the project says so (country), or, with no country, a Hebrew project. */
export function isIsraeliProject(country: string | null | undefined, language: string | null | undefined): boolean {
  const c = String(country ?? '').trim().toUpperCase()
  if (c) return c === 'IL'
  return String(language ?? '').trim().toLowerCase() === 'he'
}

/** The listings that work where the project's business is, in the list's order (every business first). */
export function listingsFor(country: string | null | undefined, language: string | null | undefined): FreeListing[] {
  const il = isIsraeliProject(country, language)
  const here = FREE_LISTINGS.filter((l) => l.region === 'all' || (l.region === 'il') === il)
  const first = (l: FreeListing) => (l.fit === 'any' ? 0 : l.fit === 'local' ? 1 : 2)
  return here.map((l, i) => ({ l, i })).sort((a, b) => first(a.l) - first(b.l) || a.i - b.i).map(({ l }) => l)
}

const bare = (d: string) => d.trim().toLowerCase().replace(/^www\./, '')

/**
 * Which listings already show up in the project's own Google results or AI answers
 * (the domains the Links route found; lib/site-links/model.ts). Only an exact domain
 * or a subdomain of it counts. Showing up there means the site ranks for the
 * business's searches: a card on it is worth more.
 */
export function listingsSeen(listings: readonly FreeListing[], foundDomains: readonly string[]): Set<string> {
  const found = foundDomains.map(bare).filter(Boolean)
  const seen = new Set<string>()
  for (const l of listings) {
    const d = bare(l.domain)
    if (found.some((f) => f === d || f.endsWith(`.${d}`))) seen.add(l.id)
  }
  return seen
}
