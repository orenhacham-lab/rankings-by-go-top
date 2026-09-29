/**
 * The link network's reads and writes. Service-role only, so every read that is
 * about ONE owner is filtered by that owner explicitly (the callers pass the
 * verified user); the reads across members (candidates, the log's edges, the
 * member count) return only what the rules and the screen need, never another
 * member's article text beyond the one check that needs it (does it already
 * link to the other side).
 *
 * A database without the network's tables (the migration is not applied yet) is
 * "unavailable": the screen hides the network and the generation step does
 * nothing. Never an error.
 */
import { bareDomain } from '@/lib/site-links/classify'
import { safeExternalUrl } from '@/lib/site-links/model'
import { provenDomains, type AnchorKind, type DomainProof, type Edge, type NetworkSite } from './rules'
import type { LinkRel } from './anchor'

/* eslint-disable @typescript-eslint/no-explicit-any -- the service-role client or the QA fake */
export type NetworkDb = { from: (table: string) => any }

export class NetworkUnavailable extends Error {
  constructor() { super('link_network_unavailable'); this.name = 'NetworkUnavailable' }
}

export function isMissingTable(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code
  return code === '42P01' || code === 'PGRST205'
}

/** Rows of a read; a missing optional table is no rows; any other error throws. */
export async function rows<T>(query: PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  const { data, error } = await query
  if (error) {
    if (isMissingTable(error)) return []
    throw new Error('read_failed')
  }
  return Array.isArray(data) ? (data as T[]) : []
}

/** Rows of a read of the NETWORK's own tables: missing means the whole feature is unavailable. */
export async function networkRows<T>(query: PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  const { data, error } = await query
  if (error) {
    if (isMissingTable(error)) throw new NetworkUnavailable()
    throw new Error('read_failed')
  }
  return Array.isArray(data) ? (data as T[]) : []
}

/** The network-wide link type. Unavailable when the table does not exist; follow when the row is missing. */
export async function readLinkRel(db: NetworkDb): Promise<LinkRel> {
  const found = await networkRows<{ link_rel: string }>(db.from('link_network_settings').select('link_rel').eq('id', 1).limit(1))
  return found[0]?.link_rel === 'nofollow' ? 'nofollow' : 'follow'
}

export interface MemberRow {
  project_id: string
  user_id: string
  active: boolean
  consent_version: string
  consented_at: string
  consent_link_rel: string
  left_at: string | null
}

export const MEMBER_READ_LIMIT = 500
export const EDGE_READ_LIMIT = 5000

export async function activeMemberIds(db: NetworkDb): Promise<string[]> {
  const found = await networkRows<{ project_id: string }>(db.from('link_network_members').select('project_id').eq('active', true).limit(MEMBER_READ_LIMIT))
  return found.map((r) => r.project_id)
}

export interface PlacementRow {
  id: string
  source_project_id: string
  source_user_id: string
  source_article_id: string | null
  source_domain: string
  target_project_id: string
  target_user_id: string
  target_url: string
  anchor_text: string
  link_rel: string
  anchor_kind: AnchorKind
  relevance: number
  status: 'placed' | 'rejected'
  placed_at: string
  rejected_at: string | null
}

/** Every PLACED link of the network, newest first: the graph the rules check. */
export async function placedEdges(db: NetworkDb): Promise<Edge[]> {
  const found = await networkRows<Pick<PlacementRow, 'source_project_id' | 'target_project_id' | 'placed_at' | 'anchor_kind'>>(
    db.from('link_network_placements').select('source_project_id, target_project_id, placed_at, anchor_kind')
      .eq('status', 'placed').order('placed_at', { ascending: false }).limit(EDGE_READ_LIMIT))
  return found.map((r) => ({ source: r.source_project_id, target: r.target_project_id, placedAt: r.placed_at, anchorKind: r.anchor_kind }))
}

// ── Site profiles ─────────────────────────────────────────────────────────────

type ProjectRow = {
  id: string; user_id: string; client_id: string | null; target_domain: string | null; domain_aliases: string[] | null
  language: string | null; created_at: string; is_active: boolean | null; business_name: string | null
  ai_business_profile: { primaryCategory?: unknown } | null
}
type IndexRow = { project_id: string; targets: unknown; scan_status?: string | null }
type OwnedSiteRow = { project_id: string; user_id: string | null; site_url: string | null }
type GscPropertyRow = { project_id: string; connection_id: string | null; site_url: string | null; permission_level: string | null }

export interface SiteExtras {
  businessName: string | null
  description: string | null
  /** Published pages we can link to: our published articles and the pages of the site's index. */
  pages: { url: string; title: string }[]
}

const str = (v: unknown, max: number): string | null => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null)

function domainsOf(p: ProjectRow): string[] {
  return [...new Set([p.target_domain, ...(p.domain_aliases ?? [])].map((d) => bareDomain(d ?? '')).filter(Boolean))]
}

function summaryCompetitors(summary: unknown): string[] {
  const list = summary && typeof summary === 'object' ? (summary as { competitors?: unknown }).competitors : null
  if (!Array.isArray(list)) return []
  return list.map((c) => (c && typeof c === 'object' ? bareDomain(String((c as { domain?: unknown }).domain ?? '')) : '')).filter(Boolean)
}

/** Bare domains a piece of HTML links to (absolute http(s) links only). */
export function linkedDomainsOf(html: string | null | undefined): string[] {
  if (!html) return []
  const out = new Set<string>()
  for (const m of html.matchAll(/href\s*=\s*"(https?:\/\/[^"]+)"/gi)) {
    const d = bareDomain(m[1])
    if (d) out.add(d)
  }
  return [...out]
}

/** A page of this site we may link to: http(s), on one of the site's own domains. */
export function ownPage(url: unknown, domains: string[]): string | null {
  const safe = safeExternalUrl(url)
  if (!safe) return null
  const host = bareDomain(safe)
  return domains.some((d) => host === d || host.endsWith(`.${d}`)) ? safe : null
}

/**
 * The rules' view of these projects (and, for each, what the screen and the
 * model need). One read per table, filtered by the project ids; no article text
 * is read here (linkedDomains stays empty: see readLinkedDomains).
 */
export async function loadSites(db: NetworkDb, projectIds: string[]): Promise<Map<string, { site: NetworkSite; extras: SiteExtras }>> {
  const ids = [...new Set(projectIds)].slice(0, MEMBER_READ_LIMIT)
  const out = new Map<string, { site: NetworkSite; extras: SiteExtras }>()
  if (!ids.length) return out
  const projects = await rows<ProjectRow>(db.from('projects')
    .select('id, user_id, client_id, target_domain, domain_aliases, language, created_at, is_active, business_name, ai_business_profile')
    .in('id', ids).limit(ids.length))
  if (!projects.length) return out
  const userIds = [...new Set(projects.map((p) => p.user_id))]
  const [members, profiles, shopify, governance, competitors, seedRuns, crawl, wpIndex, published, proof] = await Promise.all([
    networkRows<MemberRow>(db.from('link_network_members').select('project_id, user_id, active, consent_version, consented_at, consent_link_rel, left_at').in('project_id', ids).limit(ids.length)),
    rows<{ project_id: string; niche: string | null; description: string | null; detected_platform: string | null }>(
      db.from('project_profiles').select('project_id, niche, description, detected_platform').in('project_id', ids).limit(ids.length)),
    rows<{ project_id: string }>(db.from('shopify_connections').select('project_id').in('project_id', ids).is('archived_at', null).limit(ids.length * 2)),
    rows<{ user_id: string; billing_authority: string | null }>(db.from('billing_governance').select('user_id, billing_authority').in('user_id', userIds).limit(userIds.length)),
    rows<{ project_id: string; domain: string | null }>(db.from('ai_visibility_competitors').select('project_id, domain').in('project_id', ids).eq('is_active', true).limit(ids.length * 30)),
    rows<{ project_id: string; status: string | null; summary: unknown; created_at: string }>(
      db.from('project_seed_runs').select('project_id, status, summary, created_at').in('project_id', ids).order('created_at', { ascending: false }).limit(ids.length * 4)),
    rows<IndexRow>(db.from('site_crawl_index').select('project_id, targets, scan_status').in('project_id', ids).limit(ids.length)),
    rows<IndexRow>(db.from('wordpress_content_index').select('project_id, targets').in('project_id', ids).limit(ids.length)),
    rows<{ project_id: string; title: string | null; wp_post_url: string | null }>(
      db.from('generated_articles').select('project_id, title, wp_post_url').in('project_id', ids).eq('status', 'published').limit(ids.length * 30)),
    readDomainProof(db, projects),
  ])
  const by = <T extends { project_id: string }>(list: T[]) => {
    const m = new Map<string, T[]>()
    for (const r of list) m.set(r.project_id, [...(m.get(r.project_id) ?? []), r])
    return m
  }
  const memberOf = new Map(members.map((m) => [m.project_id, m]))
  const profileOf = new Map(profiles.map((p) => [p.project_id, p]))
  const shopifyIds = new Set(shopify.map((s) => s.project_id))
  const shopifyBilled = new Set(governance.filter((g) => g.billing_authority === 'shopify').map((g) => g.user_id))
  const compOf = by(competitors), runsOf = by(seedRuns), crawlOf = by(crawl), wpOf = by(wpIndex), pubOf = by(published)

  for (const p of projects) {
    const domains = domainsOf(p)
    const verifiedDomains = provenDomains(domains, proof.get(p.id) ?? { hosts: [], gscProperties: [] })
    const profile = profileOf.get(p.id)
    const member = memberOf.get(p.id)
    const runs = runsOf.get(p.id) ?? []
    const crawlRow = crawlOf.get(p.id)?.[0]
    const index = [...(Array.isArray(wpOf.get(p.id)?.[0]?.targets) ? (wpOf.get(p.id)![0].targets as unknown[]) : []),
      ...(Array.isArray(crawlRow?.targets) ? (crawlRow!.targets as unknown[]) : [])]
    const pages: { url: string; title: string }[] = []
    const seen = new Set<string>()
    // A page we may link to is on a domain the owner proved, never on one only typed in.
    const addPage = (url: unknown, title: unknown) => {
      const u = ownPage(url, verifiedDomains)
      const t = str(title, 200)
      if (!u || !t || seen.has(u)) return
      seen.add(u)
      pages.push({ url: u, title: t })
    }
    for (const a of pubOf.get(p.id) ?? []) addPage(a.wp_post_url, a.title)
    for (const t of index) {
      if (!t || typeof t !== 'object') continue
      const row = t as { targetUrl?: unknown; targetTitle?: unknown; eligibility?: unknown }
      if (row.eligibility === 'no') continue
      addPage(row.targetUrl, row.targetTitle)
    }
    const category = str(profile?.niche, 120) ?? str(p.ai_business_profile?.primaryCategory, 120)
    const site: NetworkSite = {
      projectId: p.id,
      userId: p.user_id,
      clientId: p.client_id ?? null,
      domains,
      verifiedDomains,
      language: p.language ?? '',
      category,
      competitors: [...new Set([
        ...(compOf.get(p.id) ?? []).map((c) => bareDomain(c.domain ?? '')).filter(Boolean),
        ...summaryCompetitors(runs.find((r) => r.summary)?.summary),
      ])],
      addresses: [],
      shopify: shopifyIds.has(p.id) || /shopify/i.test(profile?.detected_platform ?? '') || shopifyBilled.has(p.user_id),
      active: !!member?.active && p.is_active !== false,
      memberSince: member?.active ? member.consented_at : null,
      createdAt: p.created_at,
      scanned: runs.some((r) => r.status === 'done' || r.status === 'partial') || crawlRow?.scan_status === 'completed' || crawlRow?.scan_status === 'partial',
      publishedArticles: (pubOf.get(p.id) ?? []).length,
      indexedPages: index.length,
      linkedDomains: [],
    }
    out.set(p.id, { site, extras: { businessName: str(p.business_name, 120), description: str(profile?.description, 400), pages } })
  }
  return out
}

/**
 * What proves each project's owner controls its site, from the connections the
 * app already stores (no new table). Every row must belong to the project AND to
 * the project's owner. A connection that is not live proves nothing:
 *   wordpress_connections      connection_status 'connected' (application password tested)
 *   site_fix_plugin_links      status 'connected' (the GO TOP plugin answered a signed call)
 *   project_gsc_properties     the assigned Search Console property, its Google
 *                              connection still 'connected' and the owner's own.
 * NOT site_platform_connections: a Wix or custom-site (webhook) site_url is typed
 * by the owner and never checked against the site (a webhook is 'connected' on
 * save, untested), so it proves nothing.
 * A missing table (not migrated yet) is no proof from it.
 */
export async function readDomainProof(db: NetworkDb, projects: { id: string; user_id: string }[]): Promise<Map<string, DomainProof>> {
  const out = new Map<string, DomainProof>()
  if (!projects.length) return out
  const ids = projects.map((p) => p.id)
  const ownerOf = new Map(projects.map((p) => [p.id, p.user_id]))
  const [wp, plugin, gsc] = await Promise.all([
    rows<OwnedSiteRow>(db.from('wordpress_connections').select('project_id, user_id, site_url').in('project_id', ids).eq('connection_status', 'connected').limit(ids.length)),
    rows<OwnedSiteRow>(db.from('site_fix_plugin_links').select('project_id, user_id, site_url').in('project_id', ids).eq('status', 'connected').limit(ids.length)),
    rows<GscPropertyRow>(db.from('project_gsc_properties').select('project_id, connection_id, site_url, permission_level').in('project_id', ids).limit(ids.length)),
  ])
  const connIds = [...new Set(gsc.map((g) => g.connection_id).filter((id): id is string => !!id))]
  const liveConns = connIds.length
    ? await rows<{ id: string; user_id: string }>(db.from('gsc_connections').select('id, user_id').in('id', connIds).eq('status', 'connected').limit(connIds.length))
    : []
  const connOwner = new Map(liveConns.map((c) => [c.id, c.user_id]))
  const entry = (projectId: string) => {
    let e = out.get(projectId)
    if (!e) out.set(projectId, (e = { hosts: [], gscProperties: [] }))
    return e
  }
  for (const r of [...wp, ...plugin]) {
    if (!r.site_url || !ownerOf.has(r.project_id) || r.user_id !== ownerOf.get(r.project_id)) continue
    entry(r.project_id).hosts.push(r.site_url)
  }
  for (const g of gsc) {
    if (!g.site_url || !g.connection_id || !ownerOf.has(g.project_id) || connOwner.get(g.connection_id) !== ownerOf.get(g.project_id)) continue
    entry(g.project_id).gscProperties.push({ siteUrl: g.site_url, permissionLevel: g.permission_level })
  }
  return out
}

/** The domains each project's published articles already link to (the "already linked" rule). Few projects only. */
export async function readLinkedDomains(db: NetworkDb, projectIds: string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>()
  if (!projectIds.length) return out
  const arts = await rows<{ project_id: string; content_html: string | null }>(db.from('generated_articles')
    .select('project_id, content_html').in('project_id', projectIds).eq('status', 'published').limit(projectIds.length * 60))
  for (const a of arts) out.set(a.project_id, [...new Set([...(out.get(a.project_id) ?? []), ...linkedDomainsOf(a.content_html)])])
  return out
}

/** The target's tracked keywords (for classifying an anchor as exact / partial). */
export async function readKeywords(db: NetworkDb, projectId: string): Promise<string[]> {
  const found = await rows<{ keyword: string | null }>(db.from('tracking_targets').select('keyword').eq('project_id', projectId).limit(80))
  return found.map((k) => str(k.keyword, 120)).filter((k): k is string => !!k)
}
