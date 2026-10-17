/**
 * Loads what the cannibalization check compares against, for ONE project of ONE
 * owner (check.ts says what each source is for).
 *
 * The callers, every path that creates a topic or a keyword:
 *   app/api/content/automation/recommendations   strategy generation   skips a duplicate
 *   lib/content/automation/topic-topup            the monthly top-up    skips a duplicate
 *   app/api/content/topics (POST)                 manual add, keyword research's
 *                                                 "add to content", the AI questions'
 *                                                 "write an article", existing content
 *                                                                       warns (overlap)
 *   app/api/content/automation/topics/bulk        "add a keyword", approving an idea
 *                                                                       warns (overlaps)
 *   app/api/content/topics/overlap                the brief form's check before saving
 *
 * The service-role client bypasses RLS, so every read names the project AND, where
 * the table has one, its owner. Every read is best-effort: a source that cannot be
 * read is empty, and the check then simply knows less. It never fails a creation.
 * Nothing here writes, calls a model or leaves the database.
 */
import type { createAdminClient } from '@/lib/supabase/admin'
import { readSiteMap } from '@/lib/content/existing-content/site-map-store'
import { getContentIndex } from '@/lib/content/content-index'
import { reassembleReport } from '@/lib/content/wordpress-content-index'
import { latestSucceededRun } from '@/lib/gsc/service'
import { buildOverlapIndex, GSC_MAX_POSITION, GSC_MIN_IMPRESSIONS, type OverlapIndex, type OverlapIndexData } from './check'

type Admin = ReturnType<typeof createAdminClient>

/** Enough for any site's ranking queries; the strongest first. */
export const MAX_GSC_QUERIES = 2000
const MAX_ROWS = 5000

type Rows = Record<string, unknown>[]
async function safe<T>(fn: () => PromiseLike<T> | T, fallback: T): Promise<T> {
  try { return await fn() } catch { return fallback }
}
const s = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null)

export async function loadOverlapData(
  admin: Admin,
  scope: { projectId: string; userId: string },
  opts: { gsc: boolean },
): Promise<OverlapIndexData> {
  const { projectId, userId } = scope

  const [project, map, index, shopify, articles, topics, ideas, gsc] = await Promise.all([
    safe(async () => {
      const { data } = await admin.from('projects').select('target_domain').eq('id', projectId).eq('user_id', userId).maybeSingle()
      return s((data as { target_domain?: unknown } | null)?.target_domain)
    }, null),
    safe(async () => {
      const read = await readSiteMap(admin, { projectId, userId }, { entries: true })
      return read.available && read.row && Array.isArray(read.row.entries) ? read.row.entries : []
    }, []),
    safe(async () => {
      const row = await getContentIndex(projectId, userId, admin)
      return row ? ((reassembleReport(row).targets ?? []) as { targetTitle?: string; targetUrl?: string }[]) : []
    }, [] as { targetTitle?: string; targetUrl?: string }[]),
    safe(async () => {
      const { data, error } = await admin.from('shopify_entities').select('title, handle, canonical_url').eq('project_id', projectId).eq('user_id', userId).eq('is_active', true).limit(MAX_ROWS)
      return error ? [] : ((data ?? []) as Rows)
    }, [] as Rows),
    safe(async () => {
      const { data, error } = await admin.from('generated_articles').select('id, topic_id, title, slug, wp_post_url, shopify_article_url, site_post_url').eq('project_id', projectId).eq('user_id', userId).limit(MAX_ROWS)
      return error ? [] : ((data ?? []) as Rows)
    }, [] as Rows),
    safe(async () => {
      const { data, error } = await admin.from('article_topics').select('id, topic, primary_keyword, status').eq('project_id', projectId).eq('user_id', userId).limit(MAX_ROWS)
      return error ? [] : ((data ?? []) as Rows)
    }, [] as Rows),
    safe(async () => {
      const { data, error } = await admin.from('content_topic_ideas').select('id, title, primary_keyword, status').eq('project_id', projectId).eq('user_id', userId).in('status', ['pending', 'approved']).limit(MAX_ROWS)
      return error ? [] : ((data ?? []) as Rows)
    }, [] as Rows),
    opts.gsc ? safe(() => readRankingQueries(admin, projectId), []) : Promise.resolve([]),
  ])

  const pages: OverlapIndexData['pages'] = []
  for (const e of map) pages.push({ title: s(e?.t), url: s(e?.u) })
  for (const t of index) pages.push({ title: s(t?.targetTitle), url: s(t?.targetUrl) })
  for (const r of shopify) pages.push({ title: s(r.title), url: s(r.canonical_url) ?? (s(r.handle) ? `/${String(r.handle)}` : null) })

  return {
    pages,
    articles: articles.map((r) => ({
      id: String(r.id), title: s(r.title), slug: s(r.slug), topicId: s(r.topic_id),
      url: s(r.wp_post_url) ?? s(r.shopify_article_url) ?? s(r.site_post_url),
    })),
    gsc,
    topics: topics.map((r) => ({ id: String(r.id), topic: s(r.topic), primaryKeyword: s(r.primary_keyword), status: s(r.status) })),
    ideas: ideas.map((r) => ({ id: String(r.id), title: s(r.title), primaryKeyword: s(r.primary_keyword), status: s(r.status) })),
    homeHosts: project ? [project] : [],
  }
}

/** The queries the site ranks for with a page, from the latest 28-day sync. */
async function readRankingQueries(admin: Admin, projectId: string): Promise<OverlapIndexData['gsc']> {
  const run = await latestSucceededRun(admin, projectId, 28)
  if (!run) return []
  const { data, error } = await admin
    .from('gsc_query_page_metrics')
    .select('query, page, impressions, position')
    .eq('sync_run_id', run.id)
    .eq('project_id', projectId)
    .lte('position', GSC_MAX_POSITION)
    .gte('impressions', GSC_MIN_IMPRESSIONS)
    .order('impressions', { ascending: false })
    .limit(MAX_GSC_QUERIES)
  if (error) return []
  return ((data ?? []) as { query: string; page: string; impressions: number; position: number }[])
}

export async function loadOverlapIndex(admin: Admin, scope: { projectId: string; userId: string }, opts: { gsc: boolean }): Promise<OverlapIndex> {
  return buildOverlapIndex(await loadOverlapData(admin, scope, opts))
}
