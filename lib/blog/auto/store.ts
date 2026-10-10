/**
 * blog_plan reads and writes, and the one insert into the public `articles`
 * table that publishes an auto-written article.
 *
 * Every claim is atomic in the same way the customer engine's are: the update
 * carries the status it expects in its WHERE, so two overlapping runs cannot
 * both take the same row (the 15-minute cron-job.org call and the daily Vercel
 * cron can overlap).
 */

import type { createAdminClient } from '@/lib/supabase/admin'
import { sanitizePublicArticleHtml } from '@/lib/content/public-article-html'
import { articlePublishBlockReason } from '@/lib/articles/publish-rules'
import type { BlogAutoLocale } from '@/lib/blog/auto/rotation'
import type { SelectedKeyword } from '@/lib/blog/auto/keyword-plan'
import type { InternalLinkTarget } from '@/lib/blog/auto/brief'
import { BLOG_AUTHOR } from '@/lib/blog/auto/brief'

type Admin = ReturnType<typeof createAdminClient>

export const PLAN_TABLE = 'blog_plan'
/** A row claimed longer than this had its run killed mid-flight. */
export const STALE_LOCK_MS = 45 * 60 * 1000
export const MAX_ATTEMPTS = 3

const nowIso = () => new Date().toISOString()

export interface PlanRow {
  id: string
  locale: BlogAutoLocale
  topic: string
  primary_keyword: string
  secondary_keywords: string[] | null
  monthly_searches: number | null
  status: string
  attempts: number
}

const PLAN_FIELDS = 'id, locale, topic, primary_keyword, secondary_keywords, monthly_searches, status, attempts'

/** Keywords already spoken for in this language: planned, in flight, or published. */
export async function readTakenKeywords(admin: Admin, locale: BlogAutoLocale): Promise<string[]> {
  const [{ data: plan }, { data: articles }] = await Promise.all([
    admin.from(PLAN_TABLE).select('primary_keyword, topic').eq('locale', locale).neq('status', 'rejected'),
    admin.from('articles').select('title').eq('locale', locale),
  ])
  const taken: string[] = []
  for (const row of (plan ?? []) as { primary_keyword: string; topic: string }[]) {
    taken.push(row.primary_keyword, row.topic)
  }
  for (const row of (articles ?? []) as { title: string | null }[]) {
    if (row.title) taken.push(row.title)
  }
  return taken.filter(Boolean)
}

/**
 * Add researched keywords to the queue. The unique (locale, primary_keyword)
 * constraint is the real guard, so a row that is already there is ignored
 * rather than updated: its topic may have been edited by hand.
 */
export async function addPlanRows(admin: Admin, locale: BlogAutoLocale, keywords: SelectedKeyword[]): Promise<number> {
  if (!keywords.length) return 0
  const rows = keywords.map((k) => ({
    locale,
    topic: k.keyword,
    primary_keyword: k.keyword,
    monthly_searches: k.monthlySearches,
    competition: k.competition,
    source: 'keyword_planner',
  }))
  const { data, error } = await admin
    .from(PLAN_TABLE)
    .upsert(rows, { onConflict: 'locale,primary_keyword', ignoreDuplicates: true })
    .select('id')
  if (error) return 0
  return (data ?? []).length
}

export async function countPlanned(admin: Admin, locale: BlogAutoLocale): Promise<number> {
  const { count } = await admin
    .from(PLAN_TABLE)
    .select('id', { count: 'exact', head: true })
    .eq('locale', locale)
    .eq('status', 'planned')
  return count ?? 0
}

/** Our own published articles of this language, newest first — the link targets. */
export async function readInternalTargets(admin: Admin, locale: BlogAutoLocale, limit = 6): Promise<InternalLinkTarget[]> {
  const { data } = await admin
    .from('articles')
    .select('title, slug')
    .eq('locale', locale)
    .eq('is_published', true)
    .order('published_at', { ascending: false })
    .limit(limit)
  return ((data ?? []) as { title: string | null; slug: string | null }[])
    .filter((r): r is InternalLinkTarget => !!r.title && !!r.slug)
}

/**
 * Take the highest-volume planned row of this language, atomically. Returns
 * null when there is nothing to write, or when another run took it first.
 */
export async function claimNextPlanRow(admin: Admin, locale: BlogAutoLocale): Promise<PlanRow | null> {
  const { data } = await admin
    .from(PLAN_TABLE)
    .select(PLAN_FIELDS)
    .eq('locale', locale)
    .eq('status', 'planned')
    .order('monthly_searches', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle()
  const row = data as PlanRow | null
  if (!row) return null
  if ((row.attempts ?? 0) >= MAX_ATTEMPTS) return null

  const { data: claimed } = await admin
    .from(PLAN_TABLE)
    .update({ status: 'generating', locked_at: nowIso(), attempts: (row.attempts ?? 0) + 1, last_error: null })
    .eq('id', row.id)
    .eq('status', 'planned')
    .select(PLAN_FIELDS)
    .maybeSingle()
  return (claimed as PlanRow | null) ?? null
}

/** Put a row back after a failure, or park it once the attempts are spent. */
export async function releasePlanRow(admin: Admin, id: string, reason: string, attempts: number): Promise<void> {
  await admin
    .from(PLAN_TABLE)
    .update({
      status: attempts >= MAX_ATTEMPTS ? 'failed' : 'planned',
      last_error: reason,
      locked_at: null,
    })
    .eq('id', id)
}

/** A run that died mid-generation leaves a row claimed; this frees it. */
export async function recoverStaleLocks(admin: Admin): Promise<number> {
  const cutoff = new Date(Date.now() - STALE_LOCK_MS).toISOString()
  const { data } = await admin
    .from(PLAN_TABLE)
    .update({ status: 'planned', locked_at: null, last_error: 'stale_lock_recovered' })
    .eq('status', 'generating')
    .lt('locked_at', cutoff)
    .select('id')
  return (data ?? []).length
}

export interface ArticleToPublish {
  locale: BlogAutoLocale
  title: string
  slug: string
  excerpt: string
  metaTitle: string
  metaDescription: string
  /** Raw generated HTML; sanitized here, never stored as received. */
  html: string
  featuredImageUrl: string
  featuredImageAlt: string
}

export type PublishOutcome =
  | { ok: true; articleId: string; slug: string }
  | { ok: false; reason: string }

/**
 * Insert the article and mark its plan row published, in that order: a row
 * marked published without an article would silently drop the keyword, while an
 * article whose row is still 'generating' is recovered by the stale-lock sweep
 * and then seen as already published by the duplicate-slug check.
 */
export async function publishPlanArticle(admin: Admin, planId: string, article: ArticleToPublish): Promise<PublishOutcome> {
  // The same rule the admin API and the internal endpoint enforce: nothing
  // reaches the blog published without a cover.
  const blocked = articlePublishBlockReason({ is_published: true, featured_image_url: article.featuredImageUrl })
  if (blocked) return { ok: false, reason: 'missing_featured_image' }

  const { data: existing } = await admin.from('articles').select('id').eq('slug', article.slug).maybeSingle()
  if (existing) return { ok: false, reason: 'slug_taken' }

  const { data, error } = await admin
    .from('articles')
    .insert([{
      locale: article.locale,
      title: article.title,
      slug: article.slug,
      excerpt: article.excerpt || null,
      content: sanitizePublicArticleHtml(article.html),
      meta_title: article.metaTitle || null,
      meta_description: article.metaDescription || null,
      featured_image_url: article.featuredImageUrl,
      featured_image_alt: article.featuredImageAlt || null,
      author: BLOG_AUTHOR,
      is_published: true,
      published_at: nowIso(),
    }])
    .select('id')
    .single()

  if (error || !data) return { ok: false, reason: 'insert_failed' }
  const articleId = (data as { id: string }).id

  await admin
    .from(PLAN_TABLE)
    .update({ status: 'published', article_id: articleId, article_slug: article.slug, locked_at: null, last_error: null })
    .eq('id', planId)

  return { ok: true, articleId, slug: article.slug }
}
