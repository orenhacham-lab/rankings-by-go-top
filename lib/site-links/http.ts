/**
 * GET /api/projects/[id]/site-links — the Links tab, for one project.
 *
 * proxy.ts does not cover /api/*, so this handler authenticates the caller and
 * proves ownership itself. It is a READ of what the project already stored:
 * it calls no provider, no model and spends nothing.
 *
 * OWNER FILTER. The rows are read with the service role, which bypasses RLS,
 * so the project is read with `.eq('user_id', <the session's user>)` first (a
 * project of anyone else is a 404, indistinguishable from none), and EVERY
 * later read is filtered by that project and, where the table has the column,
 * by the same owner. ai_citations and ai_prompts have no user_id: they are read
 * only by the project whose ownership was just proven.
 * Guarded (with a mutation control) by lib/site-links/__qa__/site-links.qa.ts.
 *
 * Answers carry stable codes only, never database or provider text.
 */
import {
  buildInternalLinks, buildOpportunities,
  type ArticleRow, type CitationRow, type IndexTarget, type InternalLinksView, type Opportunity, type SearchRecord, type TopicRow,
} from '@/lib/site-links/model'
import { bareDomain } from '@/lib/site-links/classify'

/* eslint-disable @typescript-eslint/no-explicit-any -- the handler takes the service-role client or the QA fake */
export type SiteLinksDb = { from: (table: string) => any }

export interface SiteLinksDeps {
  session: () => Promise<{ userId: string | null }>
  admin: () => SiteLinksDb
  env: Record<string, string | undefined>
}

export type Section<T> = { state: 'ok'; data: T } | { state: 'error' } | { state: 'disabled' }

export interface SiteLinksAnswer {
  ok: true
  project: { domain: string | null; city: string | null }
  keywordsCount: number
  /** How much stored search data the opportunities were built from. */
  sources: { searches: number; citations: number }
  opportunities: Section<Opportunity[]>
  internal: Section<InternalLinksView>
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const NO_STORE = { 'cache-control': 'no-store' }
const refuse = (status: number, code: string) => Response.json({ ok: false, code }, { status, headers: NO_STORE })

export const CITATION_READ_LIMIT = 1000
export const ARTICLE_READ_LIMIT = 200

/** A table this database does not have yet (an older migration state) is "nothing stored", not an error. */
function missingTable(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code
  return code === '42P01' || code === 'PGRST205'
}

async function rows<T>(query: PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  const { data, error } = await query
  if (error) {
    if (missingTable(error)) return []
    throw new Error('read_failed')
  }
  return Array.isArray(data) ? (data as T[]) : []
}

const str = (v: unknown, max: number): string | null => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null)

function readSearchRecords(detail: unknown): SearchRecord[] {
  const results = detail && typeof detail === 'object' ? (detail as { results?: unknown }).results : null
  if (!Array.isArray(results)) return []
  const out: SearchRecord[] = []
  for (const r of results.slice(0, 10)) {
    if (!r || typeof r !== 'object' || (r as { ok?: unknown }).ok !== true) continue
    const query = str((r as { query?: unknown }).query, 160)
    const domains = (r as { domains?: unknown }).domains
    if (!query || !Array.isArray(domains)) continue
    out.push({ query, domains: domains.filter((d): d is string => typeof d === 'string').slice(0, 20) })
  }
  return out
}

function summaryCompetitors(summary: unknown): string[] {
  const list = summary && typeof summary === 'object' ? (summary as { competitors?: unknown }).competitors : null
  if (!Array.isArray(list)) return []
  return list.map((c) => (c && typeof c === 'object' ? str((c as { domain?: unknown }).domain, 253) : null)).filter((d): d is string => !!d)
}

type ProjectRow = { id: string; user_id: string; target_domain: string | null; domain_aliases: string[] | null; city: string | null }

async function readOpportunities(db: SiteLinksDb, project: ProjectRow, userId: string) {
  const pid = project.id
  const [competitorRows, runRows, stepRows, citationRows] = await Promise.all([
    rows<{ domain: string | null }>(db.from('ai_visibility_competitors').select('domain').eq('project_id', pid).eq('user_id', userId).eq('is_active', true)),
    rows<{ summary: unknown }>(db.from('project_seed_runs').select('summary').eq('project_id', pid).eq('user_id', userId).order('created_at', { ascending: false }).limit(1)),
    rows<{ detail: unknown }>(db.from('project_seed_steps').select('detail, finished_at').eq('project_id', pid).eq('user_id', userId).eq('step', 'a4').order('finished_at', { ascending: false }).limit(3)),
    rows<{ url: string | null; domain: string | null; title: string | null; prompt_id: string | null }>(
      db.from('ai_citations').select('url, domain, title, prompt_id').eq('project_id', pid).eq('is_target_domain', false)
        .order('created_at', { ascending: false }).limit(CITATION_READ_LIMIT)),
  ])
  const promptIds = [...new Set(citationRows.map((c) => c.prompt_id).filter((id): id is string => typeof id === 'string'))].slice(0, 300)
  const prompts = promptIds.length
    ? await rows<{ id: string; prompt: string | null }>(db.from('ai_prompts').select('id, prompt').eq('project_id', pid).in('id', promptIds))
    : []
  const question = new Map(prompts.map((p) => [p.id, p.prompt]))

  const searches = stepRows.map((s) => readSearchRecords(s.detail)).find((r) => r.length > 0) ?? []
  const citations: CitationRow[] = citationRows.map((c) => ({
    url: c.url, domain: c.domain, title: c.title, question: c.prompt_id ? question.get(c.prompt_id) ?? null : null,
  }))
  const competitors = [
    ...competitorRows.map((c) => c.domain).filter((d): d is string => !!d),
    ...summaryCompetitors(runRows[0]?.summary),
  ]
  const items = buildOpportunities({
    searches,
    citations,
    selfDomains: [project.target_domain ?? '', ...(project.domain_aliases ?? [])],
    competitors,
    city: project.city,
  })
  return { items, sources: { searches: searches.length, citations: citationRows.length } }
}

async function readInternal(db: SiteLinksDb, project: ProjectRow, userId: string): Promise<InternalLinksView> {
  const pid = project.id
  const [articles, wpIndex, crawlIndex] = await Promise.all([
    rows<ArticleRow>(db.from('generated_articles')
      .select('id, title, status, content_html, wp_post_url, shopify_article_url, topic_id')
      .eq('project_id', pid).eq('user_id', userId).order('created_at', { ascending: false }).limit(ARTICLE_READ_LIMIT)),
    rows<{ targets: unknown }>(db.from('wordpress_content_index').select('targets').eq('project_id', pid).eq('user_id', userId).limit(1)),
    rows<{ targets: unknown }>(db.from('site_crawl_index').select('targets').eq('project_id', pid).eq('user_id', userId).limit(1)),
  ])
  const topicIds = [...new Set(articles.map((a) => a.topic_id).filter((id): id is string => typeof id === 'string'))]
  const topics = topicIds.length
    ? await rows<TopicRow>(db.from('article_topics').select('id, brief_notes').eq('project_id', pid).eq('user_id', userId).in('id', topicIds))
    : []
  const targetsOf = (r: { targets: unknown } | undefined) => (Array.isArray(r?.targets) ? (r!.targets as IndexTarget[]) : [])
  // The WordPress index when the site has one, otherwise the seeding scan's crawl of the site.
  const indexTargets = targetsOf(wpIndex[0]).length > 0 ? targetsOf(wpIndex[0]) : targetsOf(crawlIndex[0])
  const hosts = [project.target_domain ?? '', ...(project.domain_aliases ?? [])]
  return buildInternalLinks({ articles, topics, hosts, indexTargets })
}

export async function handleSiteLinksGet(projectId: string, deps: SiteLinksDeps): Promise<Response> {
  let userId: string | null
  try {
    userId = (await deps.session()).userId
  } catch {
    return refuse(503, 'unavailable')
  }
  if (!userId) return refuse(401, 'unauthorized')
  if (!UUID.test(projectId)) return refuse(404, 'not_found')

  const db = deps.admin()
  let project: ProjectRow | null
  try {
    const found = await rows<ProjectRow>(db.from('projects')
      .select('id, user_id, target_domain, domain_aliases, city')
      .eq('id', projectId).eq('user_id', userId).limit(1))
    project = found[0] ?? null
  } catch {
    return refuse(500, 'internal')
  }
  // Belt and braces: the filter said so, and so must the row.
  if (!project || project.user_id !== userId) return refuse(404, 'not_found')

  const contentOn = deps.env.ENABLE_CONTENT === 'true'
  const [keywords, opp, internal] = await Promise.all([
    rows<{ id: string }>(db.from('tracking_targets').select('id').eq('project_id', project.id).eq('user_id', userId).limit(500)).catch(() => null),
    readOpportunities(db, project, userId).catch((err: unknown) => {
      console.error('[site-links] opportunities read failed', { projectId: project!.id, error: err instanceof Error ? err.message : 'unknown' })
      return null
    }),
    contentOn
      ? readInternal(db, project, userId).catch((err: unknown) => {
          console.error('[site-links] internal read failed', { projectId: project!.id, error: err instanceof Error ? err.message : 'unknown' })
          return null
        })
      : Promise.resolve('disabled' as const),
  ])

  const answer: SiteLinksAnswer = {
    ok: true,
    project: { domain: bareDomain(project.target_domain) || null, city: str(project.city, 120) },
    keywordsCount: keywords?.length ?? 0,
    sources: opp?.sources ?? { searches: 0, citations: 0 },
    opportunities: opp ? { state: 'ok', data: opp.items } : { state: 'error' },
    internal: internal === 'disabled' ? { state: 'disabled' } : internal ? { state: 'ok', data: internal } : { state: 'error' },
  }
  return Response.json(answer, { status: 200, headers: NO_STORE })
}
