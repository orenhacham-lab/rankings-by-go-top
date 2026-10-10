/**
 * BACKFILL: the SEO title and meta description of articles ALREADY published to WordPress that
 * never got them (scripts/backfill-article-seo-meta.ts is the command; this is its tested core).
 *
 * Why they are missing: Yoast / Rank Math keep these in protected post meta that core REST cannot
 * write. Before the Go Top plugin or its Bridge route was on the site, publishing answered
 * seo_bridge_required and nothing was recorded (seo_status is null on every such article).
 *
 * THE ONE RULE: NEVER REPLACE A VALUE THAT IS ALREADY THERE. Per article, per field:
 *   1. Read the live page (an anonymous GET of wp_post_url through the free check's guarded
 *      fetcher) and look at its <head>:
 *        description  missing  no <meta name="description"> (or an empty one)
 *                     ours     it is the article's own meta_description
 *                     kept     anything else (the merchant's, or an SEO plugin template)
 *        title        ours     the <title> contains the article's own meta_title
 *                     missing  no <title>, or one that STARTS WITH the post's own title: the
 *                              SEO plugin's default template ("Post title - Site name")
 *                     kept     anything else (a custom SEO title someone set)
 *      A page that cannot be read is `unknown` and nothing is written for it.
 *   2. Write ONLY the `missing` fields, through the paths publishing already uses:
 *        the Go Top plugin is connected   writeSeoViaGoTopPlugin, one field per call, with
 *                                         onlyIfEmpty: the plugin itself writes only while the
 *                                         stored value is empty (its compare-and-set), into
 *                                         Yoast / Rank Math's own key or its own when neither
 *        otherwise (application password) writeVerifiedSeoMeta with ONLY the missing field(s)
 *                                         and no focus keyphrase (its absence cannot be seen
 *                                         from the page): core REST, then the Bridge seo-meta
 *                                         route, verified by read-back; a site with no SEO
 *                                         plugin has nowhere to keep them (needs the plugin)
 *   3. Persist the truthful outcome (persistSeoOutcome) — only with --apply.
 *
 * ONLY POSTS WE PUBLISHED. Candidates are generated_articles rows with our own wp_post_id and
 * wp_post_url. The post's address must be on the connected site's own host, the page must not
 * redirect elsewhere, and the page must NAME ITS POST ID (body class postid-N, WordPress's
 * shortlink ?p=N, or its REST alternate link /wp/v2/posts/N): every id it names must be the
 * article's wp_post_id, and a page that names none is skipped (post_id_unconfirmed), so the
 * plugin path, which writes to the post at that address, can only reach our own post. A dry run (the default) reads pages and the database only: no WordPress
 * call, no plugin call, no database write. Idempotent: a second run finds the fields `ours`.
 *
 * The service role bypasses RLS: the plugin link is read by project AND its owner, and an article
 * whose user_id is not the project owner's is skipped.
 */
import type { createAdminClient } from '@/lib/supabase/admin'
import type { WordPressCredentials } from '@/lib/wordpress/types'
import { writeVerifiedSeoMeta } from '@/lib/wordpress/client'
import { loadWordPressCredentials } from '@/lib/content/api-auth'
import { persistSeoOutcome, writeSeoViaGoTopPlugin, type SeoPublishResult } from '@/lib/content/seo-publish'
import { readPluginLink } from '@/lib/site-fix/store'
import { fetchSiteHtml, type FetchedPage, type FetchResult } from '@/lib/free-check/site-fetch'
import { extractSiteSignals } from '@/lib/free-check/html-signals'
import type { SeoPlugin } from '@/lib/content/wordpress-taxonomy'

type Admin = ReturnType<typeof createAdminClient>

export type FieldState = 'missing' | 'ours' | 'kept' | 'unknown'
export type FieldOutcome =
  | 'not_needed'        // ours or kept: nothing sent
  | 'would_write'       // dry run: would be sent
  | 'written'           // sent and verified (or the plugin answered "already")
  | 'kept_existing'     // sent with compare-and-set; the site already had a value: untouched
  | 'failed'            // sent; not verified (see detail)
  | 'skipped'           // the article was skipped (see skip)

export type Channel =
  | { kind: 'plugin'; siteUrl: string; seoPlugin: 'yoast' | 'rankmath' | 'none' | null; version: string | null }
  | { kind: 'app_password'; siteUrl: string }
  | { kind: 'none' }

export interface BackfillArticle {
  id: string
  projectId: string
  projectName: string
  ownerId: string | null
  articleUserId: string | null
  title: string
  metaTitle: string
  metaDescription: string
  wpPostId: number | null
  wpPostUrl: string
  seoStatus: string | null
}

export interface HeadReading {
  title: string | null
  description: string | null
  /** Every post id the page names for itself: body class postid-N, shortlink ?p=N, REST alternate link. */
  postIds: number[]
  seoPluginHint: 'yoast' | 'rankmath' | null
}

export interface ArticleReport {
  id: string
  project: string
  url: string
  channel: Channel['kind']
  seoPluginHint: string | null
  skip: null | 'not_owner' | 'no_url' | 'no_channel' | 'site_mismatch' | 'page_unreadable' | 'redirected' | 'post_id_mismatch' | 'post_id_unconfirmed' | 'no_post_id' | 'nothing_to_write'
  head: { title: FieldState; description: FieldState; pageTitle: string | null; pageDescription: string | null }
  title: FieldOutcome
  description: FieldOutcome
  /** What --apply sends (or sent): field → the exact words. */
  writes: { seo_title?: string; meta_description?: string }
  detail?: string
  persisted?: SeoPublishResult | null
}

export interface BackfillDeps {
  fetchHtml: (url: URL) => Promise<FetchResult<FetchedPage>>
  writeViaPlugin: typeof writeSeoViaGoTopPlugin
  writeViaAppPassword: typeof writeVerifiedSeoMeta
  loadCreds: (admin: Admin, projectId: string) => Promise<{ creds: WordPressCredentials } | { error: string }>
  persist: typeof persistSeoOutcome
}

export const defaultBackfillDeps: BackfillDeps = {
  fetchHtml: (url) => fetchSiteHtml(url),
  writeViaPlugin: writeSeoViaGoTopPlugin,
  writeViaAppPassword: writeVerifiedSeoMeta,
  loadCreds: async (admin, projectId) => {
    const r = await loadWordPressCredentials(admin, projectId)
    return 'error' in r ? { error: r.error } : { creds: r.creds }
  },
  persist: persistSeoOutcome,
}

const norm = (s: string | null | undefined) => String(s ?? '').replace(/\s+/g, ' ').trim().toLowerCase()
const host = (u: string) => { try { return new URL(u).hostname.toLowerCase().replace(/^www\./, '') } catch { return '' } }

/** What the live page's <head> says (pure). */
export function readHead(html: string, url: string): HeadReading {
  const s = extractSiteSignals(html, url, { robotsTxt: null, llmsTxt: false })
  const body = html.match(/<body\b[^>]*\bclass\s*=\s*["']([^"']*)["']/i)?.[1] ?? ''
  const ids = new Set<number>()
  const pid = body.match(/(?:^|\s)postid-(\d+)(?:\s|$)/)?.[1]
  if (pid) ids.add(Number(pid))
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    const href = tag.match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1] ?? ''
    if (/\brel\s*=\s*["']?shortlink/i.test(tag)) { const n = href.match(/[?&](?:amp;)?p=(\d+)/)?.[1]; if (n) ids.add(Number(n)) }
    if (/\brel\s*=\s*["']?alternate/i.test(tag)) { const n = href.match(/\/wp\/v2\/posts\/(\d+)/)?.[1]; if (n) ids.add(Number(n)) }
  }
  const hint = /yoast seo plugin|yoast-schema-graph/i.test(html) ? 'yoast' : /rank math|rank-math-schema/i.test(html) ? 'rankmath' : null
  return { title: s.title, description: s.metaDescription, postIds: [...ids], seoPluginHint: hint }
}

/** Which fields are missing on the page (pure). Anything not clearly missing is left alone. */
export function classifyHead(head: HeadReading, article: Pick<BackfillArticle, 'title' | 'metaTitle' | 'metaDescription'>): { title: FieldState; description: FieldState } {
  const desc = norm(head.description)
  const description: FieldState = !desc ? 'missing' : desc === norm(article.metaDescription) ? 'ours' : 'kept'
  const t = norm(head.title)
  const mine = norm(article.metaTitle)
  const post = norm(article.title)
  const title: FieldState = mine && t.includes(mine) ? 'ours' : !t || (post && t.startsWith(post)) ? 'missing' : 'kept'
  return { title, description }
}

/** How the project can be written to now (database only; nothing is decrypted). */
export async function channelFor(admin: Admin, projectId: string, ownerId: string | null): Promise<Channel> {
  if (ownerId) {
    const link = await readPluginLink(admin, { projectId, userId: ownerId }).catch(() => null)
    if (link && link.status === 'connected') return { kind: 'plugin', siteUrl: link.site_url, seoPlugin: link.seo_plugin, version: link.plugin_version }
  }
  const { data } = await admin.from('wordpress_connections').select('site_url').eq('project_id', projectId).maybeSingle()
  const site = (data as { site_url?: string } | null)?.site_url
  return site ? { kind: 'app_password', siteUrl: site } : { kind: 'none' }
}

/** Every article already published to WordPress (wp_post_id or wp_post_url), optionally one project / one article. */
export async function loadBackfillCandidates(admin: Admin, filter: { projectId?: string; articleId?: string } = {}): Promise<BackfillArticle[]> {
  let q = admin.from('generated_articles')
    .select('id, project_id, user_id, title, meta_title, meta_description, wp_post_id, wp_post_url, seo_status')
    .not('wp_post_url', 'is', null)
  if (filter.projectId) q = q.eq('project_id', filter.projectId)
  if (filter.articleId) q = q.eq('id', filter.articleId)
  const { data, error } = await q.order('project_id', { ascending: true }).order('id', { ascending: true }).limit(5000)
  if (error) throw new Error('could not read generated_articles')
  const rows = (data ?? []) as Record<string, unknown>[]
  const projectIds = [...new Set(rows.map((r) => String(r.project_id)))]
  const projects = new Map<string, { name: string; user_id: string | null }>()
  if (projectIds.length) {
    const { data: ps } = await admin.from('projects').select('id, name, user_id').in('id', projectIds)
    for (const p of (ps ?? []) as { id: string; name?: string; user_id?: string | null }[]) projects.set(p.id, { name: p.name ?? p.id, user_id: p.user_id ?? null })
  }
  return rows.map((r) => {
    const p = projects.get(String(r.project_id))
    return {
      id: String(r.id), projectId: String(r.project_id), projectName: p?.name ?? String(r.project_id), ownerId: p?.user_id ?? null,
      articleUserId: (r.user_id as string | null) ?? null, title: String(r.title ?? ''), metaTitle: String(r.meta_title ?? '').trim(),
      metaDescription: String(r.meta_description ?? '').trim(), wpPostId: typeof r.wp_post_id === 'number' ? r.wp_post_id : r.wp_post_id ? Number(r.wp_post_id) : null,
      wpPostUrl: String(r.wp_post_url ?? ''), seoStatus: (r.seo_status as string | null) ?? null,
    }
  })
}

const CAS_REFUSED = 'gotop_plugin_changed_since_preview'

/** One article: read, decide, and (only with apply) write the missing fields and persist. */
export async function backfillArticle(
  admin: Admin, a: BackfillArticle, channel: Channel, opts: { apply: boolean }, deps: BackfillDeps = defaultBackfillDeps,
): Promise<ArticleReport> {
  const report: ArticleReport = {
    id: a.id, project: a.projectName, url: a.wpPostUrl, channel: channel.kind, seoPluginHint: null, skip: null,
    head: { title: 'unknown', description: 'unknown', pageTitle: null, pageDescription: null },
    title: 'skipped', description: 'skipped', writes: {},
  }
  const skip = (why: NonNullable<ArticleReport['skip']>, detail?: string) => { report.skip = why; if (detail) report.detail = detail; return report }
  if (a.articleUserId && a.ownerId && a.articleUserId !== a.ownerId) return skip('not_owner')
  if (!/^https:\/\//i.test(a.wpPostUrl)) return skip('no_url')
  if (!a.wpPostId) return skip('no_post_id')
  if (channel.kind === 'none') return skip('no_channel')
  if (host(channel.siteUrl) !== host(a.wpPostUrl)) return skip('site_mismatch', `${host(a.wpPostUrl)}|${host(channel.siteUrl)}`)

  let page: FetchResult<FetchedPage>
  try { page = await deps.fetchHtml(new URL(a.wpPostUrl)) } catch { page = { ok: false, reason: 'network' } }
  if (!page.ok) return skip('page_unreadable', page.reason + (page.status ? `_${page.status}` : ''))
  // A post that moved or was deleted redirects (often to the home page): that page is not this post.
  const path = (u: string) => { try { return new URL(u).pathname.replace(/\/+$/, '') } catch { return '' } }
  if (host(page.url) !== host(a.wpPostUrl) || path(page.url) !== path(a.wpPostUrl)) return skip('redirected', page.url)
  const head = readHead(page.html, page.url)
  report.seoPluginHint = head.seoPluginHint
  const state = classifyHead(head, a)
  report.head = { ...state, pageTitle: head.title, pageDescription: head.description }
  if (head.postIds.length === 0) return skip('post_id_unconfirmed')
  if (head.postIds.some((id) => id !== a.wpPostId)) return skip('post_id_mismatch', `page:${head.postIds.join(',')}|article:${a.wpPostId}`)

  const wantTitle = state.title === 'missing' && !!a.metaTitle
  const wantDesc = state.description === 'missing' && !!a.metaDescription
  report.title = wantTitle ? 'would_write' : 'not_needed'
  report.description = wantDesc ? 'would_write' : 'not_needed'
  if (wantTitle) report.writes.seo_title = a.metaTitle
  if (wantDesc) report.writes.meta_description = a.metaDescription

  if (!wantTitle && !wantDesc) {
    report.skip = 'nothing_to_write'
    // The live page already shows the article's own words: that IS a verified outcome.
    if (opts.apply && state.title === 'ours' && state.description === 'ours') {
      const seo: SeoPublishResult = { plugin: channel.kind === 'plugin' ? (channel.seoPlugin ?? 'none') : (head.seoPluginHint ?? 'unknown'), status: 'verified' }
      await deps.persist(admin, a.id, seo)
      report.persisted = seo
    }
    return report
  }
  if (!opts.apply) return report

  let seo: SeoPublishResult
  if (channel.kind === 'plugin') {
    const where: SeoPlugin = channel.seoPlugin ?? 'none'
    const one = async (field: 'title' | 'description'): Promise<FieldOutcome | SeoPublishResult> => {
      const r = await deps.writeViaPlugin(admin, {
        articleId: a.id, postUrl: a.wpPostUrl, onlyIfEmpty: true,
        metaTitle: field === 'title' ? a.metaTitle : '', metaDescription: field === 'description' ? a.metaDescription : null,
      })
      if (!r) return { plugin: where, status: 'plugin_unavailable', detail: 'gotop_plugin_not_connected' }
      if (r.status === 'verified') return 'written'
      if (r.detail === CAS_REFUSED) return 'kept_existing'
      return { ...r, plugin: where }
    }
    let failure: SeoPublishResult | null = null
    for (const field of ['title', 'description'] as const) {
      if (field === 'title' ? !wantTitle : !wantDesc) continue
      const out = await one(field)
      if (typeof out === 'string') report[field] = out
      else { report[field] = 'failed'; failure = failure ?? out }
    }
    seo = failure ?? { plugin: where, status: 'verified' }
  } else {
    const loaded = await deps.loadCreds(admin, a.projectId)
    if ('error' in loaded) {
      seo = { plugin: 'unknown', status: 'plugin_unavailable', detail: 'no_wordpress_connection' }
    } else {
      seo = await deps.writeViaAppPassword(loaded.creds, a.wpPostId!, {
        metaTitle: wantTitle ? a.metaTitle : null, metaDescription: wantDesc ? a.metaDescription : null, focusKeyword: null,
      })
      if (seo.plugin === 'none' && seo.status === 'plugin_unavailable') seo = { ...seo, detail: seo.detail ?? 'needs_go_top_plugin' }
    }
    const ok: FieldOutcome = seo.status === 'verified' ? 'written' : 'failed'
    if (wantTitle) report.title = ok
    if (wantDesc) report.description = ok
  }
  if (seo.detail) report.detail = seo.detail
  await deps.persist(admin, a.id, seo)
  report.persisted = seo
  return report
}

/** Every candidate, one after another (never two writes to one site at once). */
export async function runBackfill(
  admin: Admin, opts: { apply: boolean; projectId?: string; articleId?: string; limit?: number },
  deps: BackfillDeps = defaultBackfillDeps, onReport: (r: ArticleReport) => void = () => {},
): Promise<ArticleReport[]> {
  const all = await loadBackfillCandidates(admin, { projectId: opts.projectId, articleId: opts.articleId })
  const list = opts.limit ? all.slice(0, opts.limit) : all
  const channels = new Map<string, Channel>()
  const out: ArticleReport[] = []
  for (const a of list) {
    if (!channels.has(a.projectId)) channels.set(a.projectId, await channelFor(admin, a.projectId, a.ownerId))
    const r = await backfillArticle(admin, a, channels.get(a.projectId)!, { apply: opts.apply }, deps)
    out.push(r)
    onReport(r)
  }
  return out
}

/**
 * One bounded page of a project's backfill, for the admin route (app/api/admin/seo-backfill):
 * at most `limit` articles from `offset`, in a stable order, and no new article is started once
 * `deadlineAt` has passed, so one call stays inside the function's time limit. `nextOffset` is
 * where the next call starts (null: the project is done).
 */
export async function runBackfillPage(
  admin: Admin,
  opts: { apply: boolean; projectId: string; limit: number; offset: number; deadlineAt?: number; now?: () => number },
  deps: BackfillDeps = defaultBackfillDeps,
): Promise<{ total: number; offset: number; nextOffset: number | null; reports: ArticleReport[] }> {
  const now = opts.now ?? Date.now
  const all = await loadBackfillCandidates(admin, { projectId: opts.projectId })
  const page = all.slice(opts.offset, opts.offset + opts.limit)
  const reports: ArticleReport[] = []
  let channel: Channel | null = null
  for (const a of page) {
    if (opts.deadlineAt !== undefined && now() >= opts.deadlineAt) break
    channel = channel ?? await channelFor(admin, a.projectId, a.ownerId)
    reports.push(await backfillArticle(admin, a, channel, { apply: opts.apply }, deps))
  }
  const next = opts.offset + reports.length
  return { total: all.length, offset: opts.offset, nextOffset: next < all.length ? next : null, reports }
}

/** The projects that have articles on WordPress, with how many (for the admin picker). */
export async function listBackfillProjects(admin: Admin): Promise<{ id: string; name: string; articles: number }[]> {
  const all = await loadBackfillCandidates(admin)
  const by = new Map<string, { id: string; name: string; articles: number }>()
  for (const a of all) {
    const p = by.get(a.projectId) ?? { id: a.projectId, name: a.projectName, articles: 0 }
    p.articles++
    by.set(a.projectId, p)
  }
  return [...by.values()].sort((x, y) => y.articles - x.articles)
}
