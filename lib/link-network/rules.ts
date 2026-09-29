/**
 * THE LINK NETWORK'S MATCHING RULES — pure, no I/O.
 *
 * Who may link to whom, decided before any model is asked. The placement step
 * (lib/link-network/place.ts) reads the members, their profiles and the
 * placement log, and this file answers, for one source article's project, which
 * members may receive its one link. Every "no" has a named reason, so the log
 * line of a skipped placement says why.
 *
 * The rules, in plain words (the report and the screen say the same):
 *   - only members who joined with explicit consent, both sides;
 *   - only a site whose owner proved control of its domain in the app: a
 *     connected WordPress (application password or the GO TOP plugin) or a
 *     connected Wix / custom-site connection on that exact host, or a verified
 *     Search Console property covering it (provenDomains). Typing a domain into
 *     a project proves nothing, so a stranger's site can never enter the network;
 *   - never Shopify, never a site that is new or thin (too young, never scanned
 *     successfully, or with too little published content);
 *   - never a project to itself, to another project of the same owner or of the
 *     same client, or to a site on the same server address;
 *   - never the same or a competing business: the same category (or one
 *     containing the other), or a domain either side lists as a competitor;
 *     a site whose category we do not know is left out, never guessed;
 *   - never a pair that already links, in either direction (our log, and the
 *     links already in either side's articles): so never reciprocal, and a pair
 *     links at most once;
 *   - never a short loop: A -> B is refused when B -> X and X -> A exist;
 *   - low caps: one network link per article; a target receives at most 1 link
 *     in its first month in the network, 2 in the second and 3 a month after
 *     that; a source gives at most 4 a month.
 * The anchor rules (mostly branded / partial / natural, exact match rare) and
 * the relevance threshold live in lib/link-network/anchor.ts and choose.ts.
 *
 * Guarded, each rule with a mutation control, by
 * lib/link-network/__qa__/link-network.qa.ts.
 */
import { bareDomain, isCompetitorDomain } from '@/lib/site-links/classify'
import { isUnverifiedPermission, propertyCoversProjectUrl } from '@/lib/gsc/property-match'

export type AnchorKind = 'branded' | 'partial' | 'natural' | 'exact'

export const LINK_NETWORK_RULES = {
  /** One network link per article, never more. */
  maxLinksPerArticle: 1,
  /** Links a target may receive per calendar month (UTC), by its month in the network: 1st, 2nd, then every later month. */
  receivedPerMonthRamp: [1, 2, 3] as readonly number[],
  /** Links a source may give per calendar month (UTC). */
  maxGivenPerMonth: 4,
  /** Exact-match anchors: at most this share of a target's links (the new one included). */
  maxExactShare: 0.2,
  /** Nothing is placed when the model judges the fit below this (0-100). */
  minRelevance: 70,
  /** A site younger than this in the app is "new". */
  minProjectAgeDays: 14,
  /** "Some published content": this many published articles, or this many indexed pages. */
  minPublishedArticles: 3,
  minIndexedPages: 10,
} as const

/** One member project, as the rules see it. Built by the store from stored rows only. */
export interface NetworkSite {
  projectId: string
  userId: string
  clientId: string | null
  /** Bare domains (target_domain and aliases). */
  domains: string[]
  /** The subset of `domains` the owner proved control of (provenDomains). Links go only to these. */
  verifiedDomains: string[]
  /** 'he' | 'en' | … as stored on the project. */
  language: string
  /** The business category, as stored (the seed scan's niche, or the owner's profile). null = unknown. */
  category: string | null
  /** Bare domains this project lists as competitors. */
  competitors: string[]
  /** The server addresses its domain resolves to (empty when unresolved). */
  addresses: string[]
  /** A Shopify store, by connection, detected platform or billing authority. */
  shopify: boolean
  /** Member with consent, switch on. */
  active: boolean
  /** When it joined (consented_at). */
  memberSince: string | null
  /** When the project was created in the app. */
  createdAt: string
  /** A seed scan or a site crawl finished successfully. */
  scanned: boolean
  publishedArticles: number
  indexedPages: number
  /** Bare domains its articles already link to (read from its stored article HTML). */
  linkedDomains: string[]
}

/** One PLACED link in the log (rejected ones never count: no link exists). */
export interface Edge {
  source: string
  target: string
  placedAt: string
  anchorKind: AnchorKind
}

export type Exclusion =
  | 'not_member' | 'shopify' | 'domain_unverified' | 'thin_or_new'
  | 'self' | 'same_owner' | 'same_client' | 'same_address'
  | 'language' | 'category_unknown' | 'same_category' | 'competitor'
  | 'reciprocal' | 'already_linked' | 'loop'
  | 'target_month_cap' | 'source_month_cap'

const DAY = 86_400_000

function monthKey(iso: string): string {
  return iso.slice(0, 7)
}

/** Whole months since the member joined (0 in its first month). */
export function monthsInNetwork(memberSince: string | null, now: Date): number {
  if (!memberSince) return 0
  const since = new Date(memberSince)
  if (Number.isNaN(since.getTime())) return 0
  const months = (now.getUTCFullYear() - since.getUTCFullYear()) * 12 + (now.getUTCMonth() - since.getUTCMonth())
  return Math.max(0, months - (now.getUTCDate() < since.getUTCDate() ? 1 : 0))
}

/** How many links this target may receive this month (the ramp for new members). */
export function receivedCapFor(target: Pick<NetworkSite, 'memberSince'>, now: Date): number {
  const ramp = LINK_NETWORK_RULES.receivedPerMonthRamp
  return ramp[Math.min(monthsInNetwork(target.memberSince, now), ramp.length - 1)]
}

/**
 * What the app already knows proves control of a site, read from the project's
 * own connections (never from what the owner typed as the project's domain):
 *   hosts          site URLs of a CONNECTED WordPress (application password or
 *                  the GO TOP plugin link) or Wix / custom-site connection;
 *   gscProperties  Search Console properties assigned to the project, with the
 *                  permission level Google gave (siteUnverifiedUser proves nothing).
 */
export interface DomainProof {
  hosts: string[]
  gscProperties: { siteUrl: string; permissionLevel: string | null }[]
}

/** The domains, of `domains`, whose control `proof` shows: the exact host (www aside), or a verified property covering it. */
export function provenDomains(domains: readonly string[], proof: DomainProof): string[] {
  const hosts = new Set(proof.hosts.map((h) => bareDomain(h)).filter(Boolean))
  const properties = proof.gscProperties.filter((p) => p.siteUrl && !isUnverifiedPermission(p.permissionLevel))
  return domains.filter((d) => {
    const bare = bareDomain(d)
    if (!bare) return false
    return hosts.has(bare) || properties.some((p) => propertyCoversProjectUrl(p.siteUrl, bare))
  })
}

/** Not new, not thin, scanned, not Shopify, a member, its domain proven. The same bar for giving and receiving. */
export function siteQualifies(site: NetworkSite, now: Date): Exclusion | null {
  if (!site.active) return 'not_member'
  if (site.shopify) return 'shopify'
  // The site's own domain (the first one: the project's target domain) must be proven.
  if (site.domains.length > 0 && !site.verifiedDomains.includes(site.domains[0])) return 'domain_unverified'
  const created = new Date(site.createdAt).getTime()
  const young = !Number.isFinite(created) || now.getTime() - created < LINK_NETWORK_RULES.minProjectAgeDays * DAY
  const thin = site.publishedArticles < LINK_NETWORK_RULES.minPublishedArticles && site.indexedPages < LINK_NETWORK_RULES.minIndexedPages
  if (young || thin || !site.scanned || site.domains.length === 0) return 'thin_or_new'
  return null
}

const normalizeCategory = (s: string) =>
  s.toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim()

/**
 * The same line of business: equal, one containing the other ("אינסטלציה" and
 * "אינסטלציה ביתית"), or sharing most of their words.
 */
export function sameCategory(a: string, b: string): boolean {
  const x = normalizeCategory(a), y = normalizeCategory(b)
  if (!x || !y) return false
  if (x === y || x.includes(y) || y.includes(x)) return true
  const wx = new Set(x.split(' ').filter((w) => w.length > 2)), wy = new Set(y.split(' ').filter((w) => w.length > 2))
  if (!wx.size || !wy.size) return false
  let shared = 0
  for (const w of wx) if (wy.has(w)) shared++
  return shared / Math.min(wx.size, wy.size) >= 0.5
}

const langOf = (l: string) => (l || '').toLowerCase().slice(0, 2)

function listsAsCompetitor(site: NetworkSite, other: NetworkSite): boolean {
  return other.domains.some((d) => isCompetitorDomain(d, site.competitors))
}

function linksTo(site: NetworkSite, other: NetworkSite): boolean {
  return other.domains.some((d) => isCompetitorDomain(d, site.linkedDomains))
}

/** Why `target` may not receive a link from `source` now, or null when it may. */
export function exclusionFor(source: NetworkSite, target: NetworkSite, edges: readonly Edge[], now: Date): Exclusion | null {
  if (source.projectId === target.projectId) return 'self'
  const own = siteQualifies(target, now)
  if (own) return own
  if (source.userId === target.userId) return 'same_owner'
  if (source.clientId && source.clientId === target.clientId) return 'same_client'
  if (source.domains.some((d) => target.domains.some((t) => bareDomain(d) === bareDomain(t)))) return 'same_owner'
  if (source.addresses.length && target.addresses.some((a) => source.addresses.includes(a))) return 'same_address'
  if (langOf(source.language) !== langOf(target.language)) return 'language'
  if (!source.category || !target.category) return 'category_unknown'
  if (sameCategory(source.category, target.category)) return 'same_category'
  if (listsAsCompetitor(source, target) || listsAsCompetitor(target, source)) return 'competitor'

  const s = source.projectId, t = target.projectId
  if (edges.some((e) => e.source === t && e.target === s)) return 'reciprocal'
  if (edges.some((e) => e.source === s && e.target === t)) return 'already_linked'
  if (linksTo(source, target) || linksTo(target, source)) return 'already_linked'
  // A -> T closes A -> T -> X -> A when T -> X and X -> A exist.
  const intoSource = new Set(edges.filter((e) => e.target === s).map((e) => e.source))
  if (edges.some((e) => e.source === t && intoSource.has(e.target))) return 'loop'

  const month = monthKey(now.toISOString())
  const receivedThisMonth = edges.filter((e) => e.target === t && monthKey(e.placedAt) === month).length
  if (receivedThisMonth >= receivedCapFor(target, now)) return 'target_month_cap'
  return null
}

/** The source's own bar: a member, not thin or new, not Shopify, under its monthly giving cap. */
export function sourceExclusion(source: NetworkSite, edges: readonly Edge[], now: Date): Exclusion | null {
  const own = siteQualifies(source, now)
  if (own) return own
  const month = monthKey(now.toISOString())
  const given = edges.filter((e) => e.source === source.projectId && monthKey(e.placedAt) === month).length
  return given >= LINK_NETWORK_RULES.maxGivenPerMonth ? 'source_month_cap' : null
}

/**
 * The members that may receive this source's link, fairest first (the fewest
 * links received this month, then the fewest ever), and why the others may not.
 */
export function eligibleTargets(source: NetworkSite, candidates: readonly NetworkSite[], edges: readonly Edge[], now: Date): {
  eligible: NetworkSite[]
  excluded: { projectId: string; reason: Exclusion }[]
} {
  const eligible: NetworkSite[] = []
  const excluded: { projectId: string; reason: Exclusion }[] = []
  for (const c of candidates) {
    const reason = exclusionFor(source, c, edges, now)
    if (reason) excluded.push({ projectId: c.projectId, reason })
    else eligible.push(c)
  }
  const month = monthKey(now.toISOString())
  const received = (id: string, onlyMonth: boolean) => edges.filter((e) => e.target === id && (!onlyMonth || monthKey(e.placedAt) === month)).length
  eligible.sort((a, b) => received(a.projectId, true) - received(b.projectId, true) || received(a.projectId, false) - received(b.projectId, false) || a.projectId.localeCompare(b.projectId))
  return { eligible, excluded }
}

/** May this target get one more exact-match anchor and stay within the share? */
export function exactAnchorAllowed(targetId: string, edges: readonly Edge[]): boolean {
  const toTarget = edges.filter((e) => e.target === targetId)
  const exact = toTarget.filter((e) => e.anchorKind === 'exact').length
  return (exact + 1) / (toTarget.length + 1) <= LINK_NETWORK_RULES.maxExactShare
}
