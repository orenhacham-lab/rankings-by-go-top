/**
 * The link network's routes, for one project (the whole contract; the route
 * files only wire the real dependencies in):
 *
 *   GET  /api/projects/[id]/link-network
 *        the network's size (shown before joining too), the switch, the link
 *        type in force, this month's caps, and the placement log of both sides.
 *   POST /api/projects/[id]/link-network/membership  { join, consent, consentVersion }
 *        join (only with explicit consent to the current text, and only for a
 *        site whose domain the owner proved: rules.ts provenDomains) or leave.
 *   POST /api/projects/[id]/link-network/placements/[placementId]/reject
 *        the giving side takes a link out of a draft before it is published.
 *
 * proxy.ts does not cover /api/*, so each handler authenticates the caller and
 * proves ownership itself. OWNER FILTER: every read of this owner's rows is
 * filtered by the verified project AND owner; the only reads beyond this owner
 * are the member count (a number), the network's link type, and, for a link
 * this project RECEIVED, whether the giving article is live (the giving site's
 * domain, its address and the sentence around the link once it is published;
 * nothing of a draft, and a link the giver rejected is not listed at all).
 * The giver's account and article ids never leave the server.
 *
 * Hidden, not an error: without the network's tables (migration not applied),
 * and for a Shopify project, GET answers { available: false } and the POSTs 409.
 * Answers carry stable codes only, never database or provider text.
 * Guarded by lib/link-network/__qa__/link-network.qa.ts.
 */
import { bareDomain } from '@/lib/site-links/classify'
import { safeExternalUrl } from '@/lib/site-links/model'
import { linkContext, linkPresent, removeLink, type LinkRel } from './anchor'
import { LINK_NETWORK_CONSENT_VERSION } from './consent'
import { LINK_NETWORK_RULES, receivedCapFor, siteQualifies } from './rules'
import { loadSites, networkRows, NetworkUnavailable, readLinkRel, rows, type MemberRow, type NetworkDb, type PlacementRow } from './store'

export interface NetworkDeps {
  session: () => Promise<{ userId: string | null }>
  admin: () => NetworkDb
  now: () => Date
}

export type PlacementState = 'waiting' | 'published' | 'rejected' | 'removed'

export interface GivenItem {
  id: string
  articleId: string | null
  articleTitle: string | null
  targetDomain: string
  targetUrl: string
  anchor: string
  placedAt: string
  state: PlacementState
  liveUrl: string | null
  context: string | null
  canReject: boolean
}

export interface ReceivedItem {
  id: string
  /** The giving site, only once its article is live (null while it is a draft or the link is gone). */
  sourceDomain: string | null
  targetUrl: string
  anchor: string
  placedAt: string
  state: PlacementState
  liveUrl: string | null
  context: string | null
}

/** domain_unverified: the site is not connected (WordPress / Search Console / Wix / custom site), so the switch cannot be turned on. */
export type Readiness = 'ready' | 'domain_unverified' | 'thin_or_new' | 'category_unknown'

export type NetworkAnswer =
  | { ok: true; available: false }
  | {
      ok: true
      available: true
      memberCount: number
      linkRel: LinkRel
      consentVersion: string
      membership: { active: boolean; since: string | null; leftAt: string | null }
      readiness: Readiness
      caps: { receivedThisMonth: number; receivedCap: number; givenThisMonth: number; givenCap: number; perArticle: number }
      totals: { received: number; given: number }
      received: ReceivedItem[]
      given: GivenItem[]
    }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const NO_STORE = { 'cache-control': 'no-store' }
const refuse = (status: number, code: string) => Response.json({ ok: false, code }, { status, headers: NO_STORE })
export const LOG_READ_LIMIT = 100

type ProjectRow = { id: string; user_id: string }
type ArticleRow = { id: string; project_id: string; user_id: string; title: string | null; status: string | null; wp_post_url: string | null; content_html: string | null }

type Gate =
  | { ok: false; response: Response }
  | { ok: true; userId: string; project: ProjectRow; db: NetworkDb; hidden: boolean; rel: LinkRel | null }

/** Session, ownership, and whether the network exists for this project at all. */
async function gate(projectId: string, deps: NetworkDeps): Promise<Gate> {
  let userId: string | null
  try {
    userId = (await deps.session()).userId
  } catch {
    return { ok: false, response: refuse(503, 'unavailable') }
  }
  if (!userId) return { ok: false, response: refuse(401, 'unauthorized') }
  if (!UUID.test(projectId)) return { ok: false, response: refuse(404, 'not_found') }
  const db = deps.admin()
  let project: ProjectRow | null
  try {
    project = (await rows<ProjectRow>(db.from('projects').select('id, user_id').eq('id', projectId).eq('user_id', userId).limit(1)))[0] ?? null
  } catch {
    return { ok: false, response: refuse(500, 'internal') }
  }
  // Belt and braces: the filter said so, and so must the row.
  if (!project || project.user_id !== userId) return { ok: false, response: refuse(404, 'not_found') }
  let rel: LinkRel
  try {
    rel = await readLinkRel(db)
  } catch (err) {
    if (err instanceof NetworkUnavailable) return { ok: true, userId, project, db, hidden: true, rel: null }
    return { ok: false, response: refuse(500, 'internal') }
  }
  return { ok: true, userId, project, db, hidden: false, rel }
}

const monthOf = (iso: string) => iso.slice(0, 7)
const published = (a: Pick<ArticleRow, 'status' | 'wp_post_url'>) => !!a.wp_post_url || a.status === 'published' || a.status === 'publishing'

function stateOf(p: PlacementRow, article: ArticleRow | undefined): PlacementState {
  if (p.status === 'rejected') return 'rejected'
  if (!article || !linkPresent(article.content_html, p.target_url)) return 'removed'
  return published(article) ? 'published' : 'waiting'
}

export async function handleNetworkGet(projectId: string, deps: NetworkDeps): Promise<Response> {
  const g = await gate(projectId, deps)
  if (!g.ok) return g.response
  if (g.hidden) return Response.json({ ok: true, available: false } satisfies NetworkAnswer, { status: 200, headers: NO_STORE })
  const { db, userId, project } = g
  const now = deps.now()
  try {
    const sites = await loadSites(db, [project.id])
    const me = sites.get(project.id)
    // Shopify: the network does not exist for this project. Not shown, not joinable.
    if (!me || me.site.shopify) return Response.json({ ok: true, available: false } satisfies NetworkAnswer, { status: 200, headers: NO_STORE })

    const countQuery = await db.from('link_network_members').select('project_id', { count: 'exact', head: true }).eq('active', true)
    if (countQuery.error) throw countQuery.error
    const memberCount = typeof countQuery.count === 'number' ? countQuery.count : Array.isArray(countQuery.data) ? countQuery.data.length : 0

    const [memberRows, givenRows, receivedRows] = await Promise.all([
      networkRows<MemberRow>(db.from('link_network_members').select('project_id, user_id, active, consent_version, consented_at, consent_link_rel, left_at')
        .eq('project_id', project.id).eq('user_id', userId).limit(1)),
      networkRows<PlacementRow>(db.from('link_network_placements').select('*')
        .eq('source_project_id', project.id).eq('source_user_id', userId).order('placed_at', { ascending: false }).limit(LOG_READ_LIMIT)),
      networkRows<PlacementRow>(db.from('link_network_placements').select('*')
        .eq('target_project_id', project.id).eq('target_user_id', userId).order('placed_at', { ascending: false }).limit(LOG_READ_LIMIT)),
    ])
    const member = memberRows[0]

    // The giving side's own articles: owner-filtered.
    const givenArticleIds = [...new Set(givenRows.map((p) => p.source_article_id).filter((id): id is string => !!id))]
    const ownArticles = givenArticleIds.length
      ? await rows<ArticleRow>(db.from('generated_articles').select('id, project_id, user_id, title, status, wp_post_url, content_html')
        .in('id', givenArticleIds).eq('project_id', project.id).eq('user_id', userId))
      : []
    const ownById = new Map(ownArticles.filter((a) => a.project_id === project.id && a.user_id === userId).map((a) => [a.id, a]))

    // The articles that link to this project: each only as the placement's own
    // source article (same id AND same source project), and only its live state.
    const recvArticleIds = [...new Set(receivedRows.map((p) => p.source_article_id).filter((id): id is string => !!id))]
    const recvArticles = recvArticleIds.length
      ? await rows<ArticleRow>(db.from('generated_articles').select('id, project_id, user_id, title, status, wp_post_url, content_html').in('id', recvArticleIds))
      : []
    const recvById = new Map(recvArticles.map((a) => [a.id, a]))

    const given: GivenItem[] = givenRows.map((p) => {
      const a = p.source_article_id ? ownById.get(p.source_article_id) : undefined
      const state = stateOf(p, a)
      return {
        id: p.id,
        articleId: a?.id ?? null,
        articleTitle: a?.title ?? null,
        targetDomain: bareDomain(p.target_url),
        targetUrl: safeExternalUrl(p.target_url) ?? '',
        anchor: p.anchor_text,
        placedAt: p.placed_at,
        state,
        liveUrl: state === 'published' ? safeExternalUrl(a?.wp_post_url) : null,
        context: a && state !== 'rejected' ? linkContext(a.content_html, p.target_url) : null,
        canReject: state === 'waiting',
      }
    })
    // A link the giver rejected never existed for the receiver: not listed.
    const received: ReceivedItem[] = receivedRows.filter((p) => p.status !== 'rejected').map((p) => {
      const found = p.source_article_id ? recvById.get(p.source_article_id) : undefined
      const a = found && found.project_id === p.source_project_id ? found : undefined
      const state = stateOf(p, a)
      return {
        id: p.id,
        // Nothing of another customer's draft: who is giving only once it is live.
        sourceDomain: state === 'published' ? p.source_domain : null,
        targetUrl: safeExternalUrl(p.target_url) ?? '',
        anchor: p.anchor_text,
        placedAt: p.placed_at,
        state,
        liveUrl: state === 'published' ? safeExternalUrl(a?.wp_post_url) : null,
        context: state === 'published' && a ? linkContext(a.content_html, p.target_url) : null,
      }
    })

    const month = monthOf(now.toISOString())
    const readinessReason = siteQualifies({ ...me.site, active: true }, now)
    const answer: NetworkAnswer = {
      ok: true,
      available: true,
      memberCount,
      linkRel: g.rel!,
      consentVersion: LINK_NETWORK_CONSENT_VERSION,
      membership: { active: !!member?.active, since: member?.active ? member.consented_at : null, leftAt: member?.left_at ?? null },
      readiness: readinessReason === 'domain_unverified' ? 'domain_unverified' : readinessReason ? 'thin_or_new' : me.site.category ? 'ready' : 'category_unknown',
      caps: {
        receivedThisMonth: receivedRows.filter((p) => p.status === 'placed' && monthOf(p.placed_at) === month).length,
        receivedCap: receivedCapFor({ memberSince: member?.active ? member.consented_at : null }, now),
        givenThisMonth: givenRows.filter((p) => p.status === 'placed' && monthOf(p.placed_at) === month).length,
        givenCap: LINK_NETWORK_RULES.maxGivenPerMonth,
        perArticle: LINK_NETWORK_RULES.maxLinksPerArticle,
      },
      totals: {
        received: received.filter((r) => r.state === 'published' || r.state === 'waiting').length,
        given: given.filter((r) => r.state === 'published' || r.state === 'waiting').length,
      },
      received,
      given,
    }
    return Response.json(answer, { status: 200, headers: NO_STORE })
  } catch (err) {
    if (err instanceof NetworkUnavailable) return Response.json({ ok: true, available: false } satisfies NetworkAnswer, { status: 200, headers: NO_STORE })
    console.error('[link-network] read failed', { projectId: project.id })
    return refuse(500, 'internal')
  }
}

async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  // JSON only: a cross-site form cannot send it without a preflight.
  if (!(request.headers.get('content-type') ?? '').toLowerCase().includes('application/json')) return null
  try {
    const body = await request.json()
    return body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : null
  } catch {
    return null
  }
}

/** Join (explicit consent to the current text only) or leave. */
export async function handleMembershipPost(request: Request, projectId: string, deps: NetworkDeps): Promise<Response> {
  const g = await gate(projectId, deps)
  if (!g.ok) return g.response
  if (g.hidden) return refuse(409, 'unavailable')
  const body = await readJson(request)
  if (!body || typeof body.join !== 'boolean') return refuse(400, 'invalid_request')
  const { db, userId, project } = g
  const now = deps.now().toISOString()
  try {
    const me = (await loadSites(db, [project.id])).get(project.id)
    if (!me || me.site.shopify) return refuse(409, 'unavailable')
    if (body.join) {
      if (body.consent !== true || body.consentVersion !== LINK_NETWORK_CONSENT_VERSION) return refuse(400, 'consent_required')
      // Only a site whose owner proved control of its domain may join (leaving is always allowed).
      if (siteQualifies({ ...me.site, active: true }, deps.now()) === 'domain_unverified') return refuse(409, 'domain_unverified')
      const { error } = await db.from('link_network_members').upsert({
        project_id: project.id,
        user_id: userId,
        active: true,
        consent_version: LINK_NETWORK_CONSENT_VERSION,
        consented_by: userId,
        consented_at: now,
        consent_link_rel: g.rel,
        left_at: null,
        updated_at: now,
      }, { onConflict: 'project_id' })
      if (error) throw error
    } else {
      const { error } = await db.from('link_network_members').update({ active: false, left_at: now, updated_at: now })
        .eq('project_id', project.id).eq('user_id', userId)
      if (error) throw error
    }
    return Response.json({ ok: true, active: body.join }, { status: 200, headers: NO_STORE })
  } catch (err) {
    if (err instanceof NetworkUnavailable || isMissing(err)) return refuse(409, 'unavailable')
    console.error('[link-network] membership write failed', { projectId: project.id })
    return refuse(500, 'internal')
  }
}

const isMissing = (err: unknown) => ['42P01', 'PGRST205'].includes((err as { code?: string } | null)?.code ?? '')

/** The giving side takes a link out of a draft, before it is published. */
export async function handleRejectPost(request: Request, projectId: string, placementId: string, deps: NetworkDeps): Promise<Response> {
  const g = await gate(projectId, deps)
  if (!g.ok) return g.response
  if (g.hidden) return refuse(409, 'unavailable')
  if (!UUID.test(placementId)) return refuse(404, 'not_found')
  const { db, userId, project } = g
  const now = deps.now().toISOString()
  try {
    // Only a placement THIS project gave, still placed.
    const placement = (await networkRows<PlacementRow>(db.from('link_network_placements').select('*')
      .eq('id', placementId).eq('source_project_id', project.id).eq('source_user_id', userId).limit(1)))[0]
    if (!placement || placement.source_project_id !== project.id) return refuse(404, 'not_found')
    if (placement.status !== 'placed') return refuse(409, 'already_rejected')
    const article = placement.source_article_id
      ? (await rows<ArticleRow>(db.from('generated_articles').select('id, project_id, user_id, title, status, wp_post_url, content_html')
        .eq('id', placement.source_article_id).eq('project_id', project.id).eq('user_id', userId).limit(1)))[0]
      : undefined
    if (article && published(article)) return refuse(409, 'already_published')
    if (article?.content_html) {
      const html = removeLink(article.content_html, placement.target_url)
      if (html !== null) {
        const { error } = await db.from('generated_articles').update({ content_html: html, updated_at: now })
          .eq('id', article.id).eq('project_id', project.id).eq('user_id', userId)
        if (error) throw error
      }
    }
    const { error } = await db.from('link_network_placements').update({ status: 'rejected', rejected_at: now, rejected_by: userId })
      .eq('id', placement.id).eq('source_project_id', project.id).eq('source_user_id', userId)
    if (error) throw error
    return Response.json({ ok: true }, { status: 200, headers: NO_STORE })
  } catch (err) {
    if (err instanceof NetworkUnavailable || isMissing(err)) return refuse(409, 'unavailable')
    console.error('[link-network] reject failed', { projectId: project.id })
    return refuse(500, 'internal')
  }
}
