/**
 * BACKFILL: the search-engine listing of articles ALREADY published to a Shopify
 * blog that never got one.
 *
 * WHY THEY ARE MISSING. Measured in Production on 21 Nov 2026: of 616 published
 * customer articles, 368 had `seo_status` NULL, and every recent such row was a
 * Shopify article. `buildArticleInput` sent title, body, handle, summary, tags,
 * author, publish date and image — and no SEO field at all. PR #486 fixed the
 * payload, so every new publish and every re-export now carries the listing;
 * this module is for the articles that went up before it.
 *
 * WHAT IT WRITES. Nothing but the two metafields Shopify documents as a
 * resource's search engine listing: `global.title_tag` and
 * `global.description_tag`. The update sends `{ metafields: [...] }` and NOTHING
 * else — not the body, not the title, not the publish state — so a backfill
 * cannot re-render a merchant's article or move its publication date. That is
 * the difference between this and simply re-publishing every row.
 *
 * THE ONE RULE: NEVER REPLACE A VALUE THAT IS ALREADY THERE. The article's
 * current metafields are read from the Shopify API first (no HTML to scrape,
 * unlike the WordPress backfill in lib/content/seo-backfill.ts), and a field the
 * merchant has filled in is left exactly as it is. A title somebody typed into
 * Shopify's "Edit website SEO" panel is theirs.
 *
 * ONLY ARTICLES WE PUBLISHED, and only to the store that project is connected
 * to now: candidates carry our own `shopify_article_id`, the Shopify id is used
 * verbatim, and an article whose remote counterpart no longer exists is skipped
 * rather than recreated.
 *
 * A DRY RUN IS THE DEFAULT and reads only: one Shopify read per article, no
 * write and no database write. Idempotent — a second run finds every field
 * either ours or the merchant's and writes nothing.
 */
import type { createAdminClient } from '@/lib/supabase/admin'
import { loadShopifyConnection } from '@/lib/shopify/api-auth'
import { shopifyArticleUpdate, shopifyGetArticle } from '@/lib/shopify/client'
import {
  buildSeoMetafields, SEO_DESCRIPTION_METAFIELD_KEY, SEO_TITLE_METAFIELD_KEY,
} from '@/lib/shopify/article-payload'
import { seoOutcomeForPublish } from '@/lib/shopify/publish-article'

type Admin = ReturnType<typeof createAdminClient>

/** What happened to one field. */
export type FieldOutcome =
  | 'not_needed'   // the merchant has one, or we have nothing to offer
  | 'would_write'  // dry run
  | 'written'      // sent, and Shopify read it back
  | 'unverified'   // sent, and the response did not confirm it
  | 'skipped'

export type SkipReason =
  | 'no_shopify_article' | 'no_connection' | 'remote_missing' | 'nothing_to_write' | 'update_failed'

export interface ShopifyBackfillArticle {
  id: string
  projectId: string
  projectName: string
  title: string
  metaTitle: string
  metaDescription: string
  shopifyArticleId: string
  seoStatus: string | null
}

export interface ShopifyBackfillReport {
  id: string
  project: string
  shopifyArticleId: string
  skip: SkipReason | null
  /** What the store had before the call. */
  existing: { title: string | null; description: string | null }
  title: FieldOutcome
  description: FieldOutcome
  /** What --apply sends (or sent): metafield key → the exact words. */
  writes: Record<string, string>
  detail?: string
  persisted?: { seo_status: string } | null
}

export interface ShopifyBackfillDeps {
  loadConnection: typeof loadShopifyConnection
  getArticle: typeof shopifyGetArticle
  updateArticle: typeof shopifyArticleUpdate
}

export const defaultShopifyBackfillDeps: ShopifyBackfillDeps = {
  loadConnection: loadShopifyConnection,
  getArticle: shopifyGetArticle,
  updateArticle: shopifyArticleUpdate,
}

/**
 * The articles that need one. A published article of ours on Shopify whose
 * listing was never recorded.
 *
 * `seo_verified_at IS NULL` rather than `seo_status IS NULL`, so a row that was
 * recorded as `written_not_verifiable` by an earlier attempt is tried again,
 * while one already verified is left alone.
 */
export async function loadShopifySeoCandidates(
  admin: Admin,
  filter: { projectId?: string; articleId?: string; limit?: number; offset?: number } = {},
): Promise<ShopifyBackfillArticle[]> {
  let q = admin
    .from('generated_articles')
    .select('id, project_id, title, meta_title, meta_description, shopify_article_id, seo_status, seo_verified_at')
    .not('shopify_article_id', 'is', null)
    .is('seo_verified_at', null)
    .order('created_at', { ascending: true })
  if (filter.projectId) q = q.eq('project_id', filter.projectId)
  if (filter.articleId) q = q.eq('id', filter.articleId)
  const from = filter.offset ?? 0
  if (filter.limit) q = q.range(from, from + filter.limit - 1)

  const { data } = await q
  const rows = (data ?? []) as Record<string, unknown>[]
  const projectIds = [...new Set(rows.map((r) => String(r.project_id)))]
  const names = new Map<string, string>()
  if (projectIds.length) {
    const { data: projects } = await admin.from('projects').select('id, name').in('id', projectIds)
    for (const p of (projects ?? []) as { id: string; name: string | null }[]) names.set(p.id, p.name ?? '')
  }
  return rows
    .filter((r) => String(r.shopify_article_id ?? '').trim())
    .map((r) => ({
      id: String(r.id),
      projectId: String(r.project_id),
      projectName: names.get(String(r.project_id)) ?? '',
      title: String(r.title ?? ''),
      // The same fallback the publisher uses: the article title is still a title
      // we wrote the keyword into, and better than Shopify's own default.
      metaTitle: String(r.meta_title ?? '').trim() || String(r.title ?? '').trim(),
      metaDescription: String(r.meta_description ?? '').trim(),
      shopifyArticleId: String(r.shopify_article_id),
      seoStatus: (r.seo_status as string | null) ?? null,
    }))
}

const fieldOutcome = (
  sent: Record<string, string>, key: string, confirmed: boolean, apply: boolean,
): FieldOutcome => {
  if (!(key in sent)) return 'not_needed'
  if (!apply) return 'would_write'
  return confirmed ? 'written' : 'unverified'
}

/**
 * One article. Reads its current listing, writes only the empty half, and
 * records the truthful outcome — never a verdict it cannot prove.
 */
export async function backfillShopifyArticleSeo(
  admin: Admin,
  article: ShopifyBackfillArticle,
  opts: { apply?: boolean } = {},
  deps: ShopifyBackfillDeps = defaultShopifyBackfillDeps,
): Promise<ShopifyBackfillReport> {
  const apply = opts.apply === true
  const report: ShopifyBackfillReport = {
    id: article.id,
    project: article.projectName,
    shopifyArticleId: article.shopifyArticleId,
    skip: null,
    existing: { title: null, description: null },
    title: 'skipped',
    description: 'skipped',
    writes: {},
  }

  if (!article.shopifyArticleId.trim()) return { ...report, skip: 'no_shopify_article' }

  const loaded = await deps.loadConnection(admin, article.projectId)
  if ('error' in loaded) return { ...report, skip: 'no_connection', detail: loaded.reason }

  let existing: Awaited<ReturnType<typeof shopifyGetArticle>>
  try {
    existing = await deps.getArticle(loaded.creds, article.shopifyArticleId)
  } catch {
    return { ...report, skip: 'remote_missing', detail: 'article_read_failed' }
  }
  if (!existing) return { ...report, skip: 'remote_missing' }
  report.existing = { title: existing.seoTitle ?? null, description: existing.seoDescription ?? null }

  // THE RULE, and it is the same function the live publisher uses, so the two
  // can never drift apart: update mode, with what the store already has.
  const metafields = buildSeoMetafields({
    mode: 'update',
    metaTitle: article.metaTitle,
    metaDescription: article.metaDescription,
    existingSeoTitle: existing.seoTitle ?? null,
    existingSeoDescription: existing.seoDescription ?? null,
  })
  const sent: Record<string, string> = {}
  for (const m of metafields) sent[m.key] = m.value
  report.writes = sent

  if (!metafields.length) {
    return { ...report, skip: 'nothing_to_write', title: 'not_needed', description: 'not_needed' }
  }

  if (!apply) {
    return {
      ...report,
      title: fieldOutcome(sent, SEO_TITLE_METAFIELD_KEY, false, false),
      description: fieldOutcome(sent, SEO_DESCRIPTION_METAFIELD_KEY, false, false),
    }
  }

  // ONLY the metafields. Sending a body or a title here would re-render a
  // merchant's live article for the sake of a meta description.
  let res: Awaited<ReturnType<typeof shopifyArticleUpdate>>
  try {
    res = await deps.updateArticle(loaded.creds, article.shopifyArticleId, { metafields })
  } catch {
    return { ...report, skip: 'update_failed', detail: 'shopify_update_threw' }
  }
  if (!res.ok) {
    return { ...report, skip: 'update_failed', detail: res.userErrors.map((e) => e.code || 'user_error').join(',').slice(0, 300) }
  }

  const outcome = seoOutcomeForPublish(sent, res.article)
  const confirmed = outcome?.seo_status === 'verified'
  if (outcome) {
    await admin.from('generated_articles').update({ ...outcome, updated_at: new Date().toISOString() }).eq('id', article.id)
  }
  return {
    ...report,
    title: fieldOutcome(sent, SEO_TITLE_METAFIELD_KEY, confirmed, true),
    description: fieldOutcome(sent, SEO_DESCRIPTION_METAFIELD_KEY, confirmed, true),
    persisted: outcome ? { seo_status: outcome.seo_status } : null,
  }
}

/** A call stops starting articles after this long, so a route can answer. */
export const SHOPIFY_BACKFILL_BUDGET_MS = 200_000

/**
 * One page of articles. Returns where to go on, so an operator can walk a whole
 * store without a single call that cannot finish.
 */
export async function runShopifySeoBackfillPage(
  admin: Admin,
  opts: { projectId?: string; articleId?: string; limit?: number; offset?: number; apply?: boolean; now?: () => number },
  deps: ShopifyBackfillDeps = defaultShopifyBackfillDeps,
): Promise<{ reports: ShopifyBackfillReport[]; scanned: number; nextOffset: number | null; budgetSpent: boolean }> {
  const now = opts.now ?? Date.now
  const started = now()
  const offset = opts.offset ?? 0
  const candidates = await loadShopifySeoCandidates(admin, {
    projectId: opts.projectId, articleId: opts.articleId, limit: opts.limit, offset,
  })

  const reports: ShopifyBackfillReport[] = []
  let budgetSpent = false
  for (const article of candidates) {
    if (now() - started >= SHOPIFY_BACKFILL_BUDGET_MS) { budgetSpent = true; break }
    reports.push(await backfillShopifyArticleSeo(admin, article, { apply: opts.apply }, deps))
  }
  // A dry run writes nothing, so the next page starts after everything scanned.
  // With --apply a written article leaves the candidate set, so the offset must
  // NOT advance past the ones that were only skipped, or they are never revisited.
  const advanced = opts.apply
    ? offset + reports.filter((r) => r.skip !== null || r.title === 'not_needed').length
    : offset + reports.length
  const more = budgetSpent || candidates.length === (opts.limit ?? candidates.length)
  return { reports, scanned: reports.length, nextOffset: more && reports.length ? advanced : null, budgetSpent }
}

/** Where the gap is: the projects with Shopify articles that have no recorded listing. */
export async function listShopifySeoBackfillProjects(admin: Admin): Promise<{ id: string; name: string; articles: number }[]> {
  const { data } = await admin
    .from('generated_articles')
    .select('project_id')
    .not('shopify_article_id', 'is', null)
    .is('seo_verified_at', null)
  const counts = new Map<string, number>()
  for (const r of (data ?? []) as { project_id: string }[]) {
    counts.set(r.project_id, (counts.get(r.project_id) ?? 0) + 1)
  }
  if (!counts.size) return []
  const { data: projects } = await admin.from('projects').select('id, name').in('id', [...counts.keys()])
  return ((projects ?? []) as { id: string; name: string | null }[])
    .map((p) => ({ id: p.id, name: p.name ?? '', articles: counts.get(p.id) ?? 0 }))
    .sort((a, b) => b.articles - a.articles)
}
