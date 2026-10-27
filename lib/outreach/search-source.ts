/**
 * Where the channel finds businesses when a directory cannot supply them.
 *
 * WHY THIS EXISTS. On 26 Oct 2026 the list was filling at three or four
 * businesses a day against a quota of thirty, and Production said plainly why:
 * of the four public directories the channel reads, one was productive and is
 * nearly exhausted (newmfgalliance, 384 Wisconsin members, most of them already
 * listed or refused), the two state farm programmes added nothing at all in a
 * week — twenty-five fetches a pass, every candidate refused as
 * `unrecognized_platform`, because a farm is rarely on Shopify or WordPress —
 * and the chamber directory now answers a bot check rather than a page. A
 * channel whose supply is one page on one association's website is a channel
 * with one point of failure and a ceiling far below what it was asked for.
 *
 * SO THE SUPPLY IS A SEARCH, not a page. A trade and a place is exactly how a
 * person looks for this kind of business ("cabinet maker nashville tn"), and the
 * businesses themselves are what rank for it. The grid below is 48 trades by 64
 * places: 3,072 queries, one per pass, so the channel can run for a month of
 * quarter-hours before a query repeats, and every query is a different town.
 *
 * WHAT THIS DOES NOT DECIDE. Nothing here says a business is worth writing to.
 * The search only names candidates; `qualifyBusiness` still reads the
 * business's own site for its platform, its US postal address and a contact
 * address, and `offTargetSector` still refuses the sectors this channel does not
 * sell to. A search result is a weaker signal than a member list, which is why
 * the aggregator filter below is explicit: a directory, a marketplace or a
 * jobs board ranks for these queries too, and none of them is a business we
 * could write to about its own site.
 *
 * The request itself is the scanner's: `createSerperSearch` in
 * lib/seed-scan/serper.ts, one call, a hard timeout, and no key means no search
 * rather than a failure that costs the pass.
 */
import type { SearchFn } from '@/lib/seed-scan/serper'
import { isNonCompetitor } from '@/lib/seed-scan/serper'
import type { ListingCandidate } from './sourcing'

/** The market the queries are asked in. US businesses, in English. */
export const SEARCH_MARKET = { gl: 'us', hl: 'en' } as const

/**
 * Trades whose businesses sell from their own site, which is what this channel
 * has anything to say to. Each is how the business describes itself, not a
 * census category.
 */
export const TRADES: readonly string[] = [
  'cabinet maker', 'metal fabrication shop', 'machine shop', 'sign company',
  'commercial printer', 'upholstery shop', 'furniture maker', 'custom apparel printer',
  'embroidery shop', 'awning company', 'glass company', 'countertop fabricator',
  'millwork company', 'welding shop', 'powder coating shop', 'tool and die shop',
  'plastics manufacturer', 'packaging supplier', 'industrial supplier', 'pump supplier',
  'coffee roaster', 'bakery', 'butcher shop', 'cheese maker',
  'brewery', 'distillery', 'winery', 'specialty food maker',
  'pet supply store', 'garden center', 'nursery and landscape supply', 'feed store',
  'bike shop', 'outdoor gear shop', 'archery shop', 'gun shop',
  'music store', 'hobby shop', 'toy store', 'book shop',
  'jewelry store', 'leather goods maker', 'candle maker', 'soap maker',
  'flooring store', 'lighting store', 'appliance store', 'mattress store',
]

/**
 * Places, spread across the country on purpose: a channel that writes to one
 * metro reads to its recipients like a list someone bought.
 */
export const PLACES: readonly string[] = [
  'nashville tn', 'knoxville tn', 'chattanooga tn', 'memphis tn',
  'birmingham al', 'huntsville al', 'mobile al', 'montgomery al',
  'atlanta ga', 'savannah ga', 'augusta ga', 'columbus ga',
  'charlotte nc', 'raleigh nc', 'greensboro nc', 'asheville nc',
  'charleston sc', 'greenville sc', 'columbia sc', 'spartanburg sc',
  'jacksonville fl', 'tampa fl', 'orlando fl', 'sarasota fl',
  'louisville ky', 'lexington ky', 'cincinnati oh', 'dayton oh',
  'cleveland oh', 'columbus oh', 'toledo oh', 'akron oh',
  'indianapolis in', 'fort wayne in', 'south bend in', 'evansville in',
  'grand rapids mi', 'lansing mi', 'kalamazoo mi', 'traverse city mi',
  'milwaukee wi', 'madison wi', 'green bay wi', 'appleton wi',
  'minneapolis mn', 'duluth mn', 'rochester mn', 'st cloud mn',
  'des moines ia', 'cedar rapids ia', 'omaha ne', 'lincoln ne',
  'kansas city mo', 'springfield mo', 'st louis mo', 'columbia mo',
  'tulsa ok', 'oklahoma city ok', 'wichita ks', 'topeka ks',
  'dallas tx', 'fort worth tx', 'san antonio tx', 'austin tx',
]

/**
 * Hosts that rank for a trade and a place without being a business we could
 * write to: directories, marketplaces, jobs boards, review sites, the press.
 * `isNonCompetitor` already covers the large platforms and every government,
 * school and military domain; these are the ones a local commercial query
 * brings up that it does not.
 */
export const AGGREGATOR_HOSTS: readonly string[] = [
  'yelp.com', 'houzz.com', 'angi.com', 'angieslist.com', 'thumbtack.com', 'homeadvisor.com',
  'bbb.org', 'manta.com', 'yellowpages.com', 'superpages.com', 'dnb.com', 'bizapedia.com',
  'thomasnet.com', 'alignable.com', 'chamberofcommerce.com', 'mapquest.com', 'nextdoor.com',
  'tripadvisor.com', 'opentable.com', 'doordash.com', 'ubereats.com', 'grubhub.com',
  'indeed.com', 'ziprecruiter.com', 'glassdoor.com', 'simplyhired.com', 'snagajob.com',
  'zillow.com', 'realtor.com', 'redfin.com', 'loopnet.com', 'crexi.com',
  'amazon.com', 'etsy.com', 'ebay.com', 'walmart.com', 'target.com', 'wayfair.com',
  'homedepot.com', 'lowes.com', 'menards.com', 'acehardware.com', 'tractorsupply.com',
  'chewy.com', 'petco.com', 'petsmart.com', 'grainger.com', 'mcmaster.com', 'uline.com',
  'untappd.com', 'beeradvocate.com', 'ratebeer.com', 'brewersassociation.org',
  'tripsavvy.com', 'eater.com', 'yellowbook.com', 'citysearch.com', 'foursquare.com',
  'expertise.com', 'porch.com', 'buildzoom.com', 'birdeye.com', 'storecensus.com',
]

/** One quarter-hour's place in the grid: the pass's own clock, nothing stored. */
export function gridIndex(now: Date): number {
  return Math.floor(now.getTime() / (15 * 60 * 1000))
}

/**
 * The query this pass asks. The trade moves every pass and the place every full
 * turn of the trades, so two passes a quarter hour apart never ask the same
 * thing and no town is worked through in one sitting.
 */
export function searchQuery(now: Date): string {
  const index = gridIndex(now)
  const trade = TRADES[((index % TRADES.length) + TRADES.length) % TRADES.length]
  const turn = Math.floor(index / TRADES.length)
  const place = PLACES[((turn % PLACES.length) + PLACES.length) % PLACES.length]
  return `${trade} ${place}`
}

/** A host a local commercial query returns that is not a business of its own. */
export function isAggregator(host: string): boolean {
  const bare = host.replace(/^www\./, '').toLowerCase()
  if (isNonCompetitor(bare)) return true
  return AGGREGATOR_HOSTS.some((h) => bare === h || bare.endsWith(`.${h}`))
}

/** What one search pass found, and whether the search happened at all. */
export interface SearchRead {
  candidates: ListingCandidate[]
  /** False when there is no key, or the provider did not answer. */
  reachable: boolean
  query: string
}

/**
 * The businesses one search names.
 *
 * The company name is left as the host: a search result's title is the page's
 * own words about itself ("Nashville's Best Custom Cabinets | Since 1974"), and
 * `qualifyBusiness` reads the real name off the business's own site. A name
 * taken from a result title would also carry the trade and the town into the
 * message we send, which is the one place it must not appear.
 */
export async function searchCandidates(search: SearchFn, now: Date): Promise<SearchRead> {
  const query = searchQuery(now)
  const outcome = await search(query, SEARCH_MARKET)
  if (!outcome.ok) return { candidates: [], reachable: false, query }
  const candidates: ListingCandidate[] = []
  for (const domain of outcome.domains) {
    const host = domain.replace(/^www\./, '').toLowerCase()
    if (!host.includes('.') || isAggregator(host)) continue
    if (candidates.some((c) => c.host === host)) continue
    candidates.push({ company: host, host })
  }
  return { candidates, reachable: true, query }
}
