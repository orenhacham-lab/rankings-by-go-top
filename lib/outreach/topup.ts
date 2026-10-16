/**
 * Keeping the prospect list full, by itself.
 *
 * WHY THIS EXISTS. On 16 Oct 2026 the channel had 27 unsent businesses left and
 * Oren asked for thirty messages a day. At thirty a day a hand-built list is
 * one day of sending, so the sender cannot be automatic while the list is
 * manual: the whole thing is only as autonomous as its slowest human step.
 *
 * WHERE THE BUSINESSES COME FROM, and the line that must not move. A public
 * listing — a state programme's member directory, a trade association's
 * members, a chamber of commerce — tells us that a business EXISTS and where
 * its website is. Everything else, the contact address above all, comes from
 * the business's own public pages (lib/outreach/qualify.ts). That split is not
 * a preference: the published privacy text says the address comes from the
 * business's own site or a public business registry, and a directory is neither.
 * Anyone raising the yield later will be tempted to take the address straight
 * off the listing page, which would make a sentence we publish in four
 * languages false.
 *
 * WHY THE SOURCES ARE IN CODE. A source is a decision with legal content: it
 * must be open to every visitor, it must not be licensed commercial contact
 * data, and it must not be a directory of individuals or licensed
 * professionals. Those are reviewable in a diff and not in an environment
 * variable.
 *
 * WHAT IS HONESTLY UNKNOWN. Which of these sources yields anything can only be
 * learned in Production: this container's egress is not the deployment's, and
 * directories move, paginate and go behind challenges. So every pass logs what
 * each source gave it, an unreachable or challenged source is a logged skip
 * rather than an error, and the list below is meant to be trimmed and extended
 * from those logs.
 *
 * ONE BUSINESS PER PASS. The cron runs every fifteen minutes, so one business a
 * pass is around ninety a day against a ceiling of thirty sends — enough to
 * stay ahead of the sender without ever looking like a crawl. The pass is
 * therefore also cheap to fail: whatever it could not do, the next quarter hour
 * tries again.
 */
import type { ServiceRoleClient } from '@/lib/supabase/admin'
import { hashEmail, isSuppressed } from '@/lib/email-suppression'
import type { PageFetcher } from './finding'
import { PROSPECTS_TABLE } from './prospects'
import { qualifyBusiness, type ProspectDraft, type RefusalReason } from './qualify'
import {
  detailLinks,
  isOpenPage,
  listingCandidates,
  pageTitle,
  robotsAllows,
  US_STATES,
  type ListingCandidate,
} from './sourcing'
import { CRAWLER_AGENT } from './qualify'

export interface PublicSource {
  /** What the log line calls it. */
  name: string
  /** The listing page. Must be open to every visitor and need no form. */
  url: string
  /**
   * Set when the listing names its members on its own pages rather than linking
   * straight out: the path fragment those member pages share.
   */
  detailHint?: string
}

/**
 * Public listings of American businesses, each open to every visitor.
 *
 * Chosen for three things: they are open, they list BUSINESSES rather than
 * people, and their members are the kind of business the product can actually
 * act on — a shop or a producer with a Shopify or WordPress site. State "grown"
 * and "made" programmes fit all three, which is why they lead.
 */
export const PUBLIC_SOURCES: readonly PublicSource[] = [
  { name: 'minnesota-grown', url: 'https://minnesotagrown.com/directory/', detailHint: '/directory/' },
  { name: 'georgia-grown', url: 'https://georgiagrown.com/georgia-grown-members/', detailHint: '/member' },
  { name: 'pride-of-ny', url: 'https://certifiedny.agriculture.ny.gov/producers', detailHint: '/producer' },
  { name: 'jersey-fresh', url: 'https://findjerseyfresh.com/directory/', detailHint: '/listing' },
  { name: 'made-in-michigan', url: 'https://www.michiganbusiness.org/industries/food-agriculture/' },
  { name: 'alabama-farmers', url: 'https://alabamafarmersmarket.org/vendors/' },
]

/** Businesses examined in one pass before it gives up and waits for the next. */
export const MAX_CANDIDATES_PER_PASS = 4
/** Member pages followed on one directory in one pass. */
export const MAX_DETAIL_PAGES = 4

export interface TopUpSummary {
  /** The source this pass used, or null when none could be read. */
  source: string | null
  /** Businesses whose own site was read. */
  examined: number
  /** Requests made to other people's servers, listing pages included. */
  fetched: number
  added: string | null
  /** Why each examined business was refused, for the log line. */
  refusals: string[]
}

export interface TopUpDeps {
  fetchPage: PageFetcher
  now: Date
  /** Which source to start from. The pass rotates so one slow source cannot block the rest. */
  startAt?: number
  sources?: readonly PublicSource[]
}

/**
 * One pass: find a business, qualify it, write it down. At most one row.
 *
 * Never throws: this is a passenger on a cron that has other work to do, and a
 * directory redesigning itself overnight must not take the article pipeline
 * down with it.
 */
export async function runProspectTopUp(
  admin: ServiceRoleClient,
  deps: TopUpDeps,
): Promise<TopUpSummary> {
  const sources = deps.sources ?? PUBLIC_SOURCES
  const summary: TopUpSummary = { source: null, examined: 0, fetched: 0, added: null, refusals: [] }
  if (sources.length === 0) return summary

  // Rotate, so a source that is down or exhausted costs one pass rather than
  // every pass. The hour is the rotation, which needs nothing stored.
  const start = deps.startAt ?? deps.now.getUTCHours()
  for (let i = 0; i < sources.length; i += 1) {
    const source = sources[(start + i) % sources.length]
    const candidates = await readListing(source, deps, summary)
    if (candidates.length === 0) continue
    summary.source = source.name

    for (const candidate of candidates) {
      if (summary.examined >= MAX_CANDIDATES_PER_PASS) return summary
      // Cheapest possible refusal: a business already on the list, decided from
      // our own table before anyone's server is asked for anything.
      if (await alreadyListed(admin, candidate.host)) {
        summary.refusals.push(`${candidate.host}: already listed`)
        continue
      }
      summary.examined += 1
      const verdict = await qualifyBusiness(
        { company: candidate.company, host: candidate.host, sourceSecond: source.url },
        deps.fetchPage,
      )
      summary.fetched += verdict.pagesRead
      if (!verdict.ok) {
        summary.refusals.push(`${candidate.host}: ${verdict.reason}${verdict.detail ? ` (${verdict.detail})` : ''}`)
        continue
      }
      const written = await addProspect(admin, verdict.draft)
      if (written === 'added') {
        summary.added = verdict.draft.siteHost
        return summary
      }
      summary.refusals.push(`${candidate.host}: ${written}`)
    }
    return summary
  }
  return summary
}

/** The businesses one source names, following one hop where it needs to. */
async function readListing(
  source: PublicSource,
  deps: TopUpDeps,
  summary: TopUpSummary,
): Promise<ListingCandidate[]> {
  const listing = await fetchOrNull(deps.fetchPage, source.url)
  summary.fetched += 1
  if (listing === null || !isOpenPage(listing)) return []

  // Their robots.txt decides, on the listing as on anything else.
  const origin = (() => { try { return new URL(source.url).origin } catch { return null } })()
  if (origin !== null) {
    const robots = await fetchOrNull(deps.fetchPage, `${origin}/robots.txt`)
    summary.fetched += 1
    const path = (() => { try { return new URL(source.url).pathname } catch { return '/' } })()
    if (robots !== null && robots.status === 200 && !robotsAllows(robots.body, path, CRAWLER_AGENT)) return []
  }

  const direct = listingCandidates(listing.body, source.url)
  if (direct.length > 0) return direct
  if (source.detailHint === undefined) return []

  // One hop in: the member's own page, where the member's website is.
  const out: ListingCandidate[] = []
  const pages = detailLinks(listing.body, source.url, source.detailHint).slice(0, MAX_DETAIL_PAGES)
  for (const url of pages) {
    const page = await fetchOrNull(deps.fetchPage, url)
    summary.fetched += 1
    if (page === null || !isOpenPage(page)) continue
    const links = listingCandidates(page.body, url)
    if (links.length === 0) continue
    // The member page names one business; its own heading is that business's
    // name, which reads better in a subject line than a link's anchor text.
    const named = pageTitle(page.body)
    out.push({ company: named ?? links[0].company, host: links[0].host })
  }
  return out
}

async function fetchOrNull(fetchPage: PageFetcher, url: string) {
  try {
    return await fetchPage(url)
  } catch {
    return null
  }
}

/** True when this site is already on the list, in any state. */
async function alreadyListed(admin: ServiceRoleClient, host: string): Promise<boolean> {
  try {
    const { data, error } = await admin.from(PROSPECTS_TABLE).select('id').eq('site_host', host).limit(1)
    // A read that failed is not a licence to add a business twice.
    if (error) return true
    return ((data ?? []) as unknown[]).length > 0
  } catch {
    return true
  }
}

export type WriteOutcome =
  | 'added'
  | 'already listed'
  | 'suppressed'
  | 'suppression unreadable'
  | 'rejected: not a US state'
  | 'rejected: missing a source'
  | 'write failed'

/**
 * Write the row, re-checking the things the published text promises.
 *
 * These are checked AGAIN here, having been checked in the qualifier, and the
 * duplication is the point: the table's own CHECKs are the last line, this is
 * the line before it, and the cost of both is a few comparisons against the
 * cost of a row that contradicts a public page. The suppression list is
 * consulted first and FAILS CLOSED — a list we cannot read is not permission to
 * add somebody who asked us to go away.
 */
export async function addProspect(admin: ServiceRoleClient, draft: ProspectDraft): Promise<WriteOutcome> {
  const state = draft.postalAddress.match(/\b([A-Z]{2})\s+\d{5}(?:-\d{4})?\s*$/)
  if (state === null || !US_STATES.includes(state[1])) return 'rejected: not a US state'
  if (draft.sourceSite.trim().length === 0 || draft.sourceSecond.trim().length === 0) {
    return 'rejected: missing a source'
  }

  let suppression
  try {
    suppression = await isSuppressed(admin, draft.email)
  } catch {
    return 'suppression unreadable'
  }
  if (suppression.suppressed) {
    return suppression.reason === 'listed' || suppression.reason === 'invalid_address'
      ? 'suppressed'
      : 'suppression unreadable'
  }

  try {
    const { error } = await admin.from(PROSPECTS_TABLE).insert({
      email: draft.email,
      email_hash: hashEmail(draft.email),
      company: draft.company,
      site_host: draft.siteHost,
      platform: draft.platform,
      country: 'US',
      postal_address: draft.postalAddress,
      source_site: draft.sourceSite,
      source_second: draft.sourceSecond,
      status: 'new',
      note: 'auto sourced',
    })
    if (error) {
      // The unique index on the address hash is the table telling us we already
      // hold this business under another host.
      const code = (error as { code?: string }).code
      return code === '23505' ? 'already listed' : 'write failed'
    }
  } catch {
    return 'write failed'
  }
  return 'added'
}

/** What a refusal reason is called in the log line. */
export type TopUpRefusal = RefusalReason | WriteOutcome | 'already listed'
