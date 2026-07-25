/**
 * Content-automation — headless "publish one generated item to WordPress"
 * service (Phase 6). Atomic locking, duplicate prevention, publish-time quality
 * gate, and crash recovery. Reuses the existing WordPress libs (loadWordPress-
 * Credentials, wpCreatePost → uploadMedia/createPost, updatePostSeoMeta). Never
 * uses force. No cron. NO changes to the manual publish route behavior.
 */

import type { createAdminClient } from '@/lib/supabase/admin'
import { loadWordPressCredentials } from '@/lib/content/api-auth'
import { publishArticleSeo } from '@/lib/content/seo-publish'
import { wpCreatePost } from '@/lib/content/wordpress-publish'
import { runQualityGate } from '@/lib/content/automation/quality-gate'
import { AUTOMATION_MAX_ATTEMPTS } from '@/lib/content/automation/generate-item'
import { ensureProjectKeywordFromPublishedArticle } from '@/lib/content/keyword-from-article'
import { recordPublishFinalFailureAlert, recordPublishBlockedAlert, resolvePublishAlerts } from '@/lib/content/automation/alerts'
import { publishShopifyPoolItem } from '@/lib/content/automation/publish-item-shopify'
import { loadActivePlatform } from '@/lib/content/platform/load-active-platform'
import type { WpCreateError } from '@/lib/content/wordpress-publish'

type Admin = ReturnType<typeof createAdminClient>

/** Context retained for alerting even if an unexpected error is thrown later. */
interface PublishAlertContext { projectId: string; articleId: string | null; topicId: string | null; title: string | null; attempts: number }

/**
 * Area E — a DETERMINISTIC, action-required blocker (missing connection/scope,
 * platform conflict, publish quality-gate failure, duplicate topic, missing
 * source image, …). A retry cannot clear it, so the item is PAUSED (terminal,
 * not re-picked by the runner) and an immediate deduped alert is raised so the
 * owner can act. Best-effort alert; never throws.
 */
async function blockItem(admin: Admin, itemId: string, reason: string, ctx: PublishAlertContext): Promise<void> {
  await finalizeItem(admin, itemId, 'paused', reason)
  await recordPublishBlockedAlert(admin, {
    projectId: ctx.projectId, poolItemId: itemId, articleId: ctx.articleId, topicId: ctx.topicId,
    title: ctx.title, error: reason, attempts: ctx.attempts,
  })
}

/**
 * Classify a wpCreatePost media_upload_failed. 'deterministic' = the source image
 * is missing/invalid or WordPress rejected the media with a client error (a retry
 * won't help → pause + alert). 'transient' = a timeout / 429 / 5xx / unstructured
 * network throw (retry may succeed → stays a bounded, retryable failure).
 */
export function classifyMediaFailure(created: WpCreateError): 'deterministic' | 'transient' {
  const meta = created.wpErrorMeta
  // No detail + no structured meta = the Supabase storage source object could not
  // be downloaded (missing/invalid source image) — deterministic.
  if (!created.detail && !meta) return 'deterministic'
  if (meta) {
    if (meta.timeout) return 'transient'
    const s = meta.status
    if (typeof s === 'number' && (s === 429 || s >= 500)) return 'transient'
    // 4xx (auth/forbidden/unsupported-media/invalid) or a WP REST error code → deterministic.
    return 'deterministic'
  }
  // detail present but no HTTP meta (non-WordPressClientError upload throw) → assume transient.
  return 'transient'
}

export interface PublishItemResult {
  itemId: string
  status: string
  articleId: string | null
  wpPostUrl?: string | null
  reason?: string
  noop?: 'already_published' | 'reconciled' | 'no_article' | 'item_not_found' | 'already_claimed' | 'max_attempts'
}

const nowIso = () => new Date().toISOString()

async function finalizeItem(admin: Admin, itemId: string, status: string, lastError: string | null): Promise<void> {
  await admin.from('article_pool_items').update({ status, last_error: lastError, locked_at: null, updated_at: nowIso() }).eq('id', itemId)
}

interface ArticleRow {
  id: string
  topic_id: string | null
  title: string | null
  slug: string | null
  excerpt: string | null
  meta_title: string | null
  meta_description: string | null
  content_html: string | null
  status: string
  featured_image_url: string | null
  featured_image_storage_path: string | null
  wp_post_id: number | null
  wp_post_url: string | null
}

const ARTICLE_SELECT =
  'id, topic_id, title, slug, excerpt, meta_title, meta_description, content_html, status, featured_image_url, featured_image_storage_path, wp_post_id, wp_post_url'

export async function publishPoolItem(admin: Admin, itemId: string): Promise<PublishItemResult> {
  // Retained context so the terminal catch can still raise a proper deduped alert.
  const ctx: PublishAlertContext = { projectId: '', articleId: null, topicId: null, title: null, attempts: 0 }
  try {
    const { data: itemData } = await admin
      .from('article_pool_items')
      .select('id, project_id, topic_id, article_id, status, attempts')
      .eq('id', itemId)
      .maybeSingle()
    const item = itemData as { id: string; project_id: string; topic_id: string | null; article_id: string | null; status: string; attempts: number } | null
    if (!item) return { itemId, status: 'failed', articleId: null, noop: 'item_not_found' }
    if (!item.article_id) return { itemId, status: item.status, articleId: null, noop: 'no_article' }
    ctx.projectId = item.project_id; ctx.articleId = item.article_id; ctx.topicId = item.topic_id; ctx.attempts = item.attempts ?? 0

    // Phase 4F.2 — backend selection by the project's ACTIVE (connected) platform, via the
    // shared resolver. Platform is chosen by connection VALIDITY, not row existence: a
    // stale/failed/untested WordPress row never blocks a valid Shopify connection (the live
    // false-platform_conflict bug), and only TWO genuinely-connected platforms conflict.
    const active = await loadActivePlatform(admin, item.project_id)
    // Area E — deterministic, action-required config blockers → paused + immediate alert.
    if (active.platform === 'conflict') {
      await blockItem(admin, itemId, 'platform_conflict', ctx)
      return { itemId, status: 'paused', articleId: item.article_id, reason: 'platform_conflict' }
    }
    if (active.platform === 'none') {
      await blockItem(admin, itemId, 'no_active_publishing_platform', ctx)
      return { itemId, status: 'paused', articleId: item.article_id, reason: 'no_active_publishing_platform' }
    }
    if (active.platform === 'shopify') {
      return await publishShopifyPoolItem(admin, item)
    }

    const { data: artData } = await admin.from('generated_articles').select(ARTICLE_SELECT).eq('id', item.article_id).maybeSingle()
    const article = artData as ArticleRow | null
    if (!article) { await blockItem(admin, itemId, 'article_missing', ctx); return { itemId, status: 'paused', articleId: item.article_id, reason: 'article_missing' } }
    ctx.title = article.title

    // (C/D) Recovery + already-published: the article already has a WP post →
    // reconcile status instead of creating a duplicate post.
    if (article.wp_post_id) {
      const artUpdate: Record<string, unknown> = { status: 'published', last_error: null, updated_at: nowIso() }
      if (article.status !== 'published') artUpdate.published_at = nowIso()
      await admin.from('generated_articles').update(artUpdate).eq('id', article.id)
      await admin.from('article_pool_items').update({ status: 'published', published_at: nowIso(), last_error: null, locked_at: null, updated_at: nowIso() }).eq('id', itemId)
      // Phase 3E — first time this item reaches published, ensure its keyword.
      // Idempotent (deduped), so the already_published path is a cheap no-op too.
      await ensureProjectKeywordFromPublishedArticle(admin, article.id)
      // Phase 4B.1 — a recovered/reconciled publish resolves any open failure alert.
      await resolvePublishAlerts(admin, itemId)
      return { itemId, status: 'published', articleId: article.id, wpPostUrl: article.wp_post_url, noop: item.status === 'published' ? 'already_published' : 'reconciled' }
    }
    if (item.status === 'published') return { itemId, status: 'published', articleId: article.id, noop: 'already_published' }

    // Phase 4B.1 — record ONE persisted, owner-scoped alert ONLY after the FINAL
    // failed publish attempt. attempts is incremented at the claim below, so the
    // attempt that runs now = item.attempts + 1; alert only when that hits the cap.
    const alertOnFinalFailure = async (reason: string) => {
      if (((item.attempts ?? 0) + 1) < AUTOMATION_MAX_ATTEMPTS) return
      await recordPublishFinalFailureAlert(admin, {
        projectId: item.project_id, poolItemId: itemId, articleId: article.id, topicId: item.topic_id,
        title: article.title, error: reason, attempts: (item.attempts ?? 0) + 1,
      })
    }

    // (E) Publish-time quality gate (structural backstop). Deterministic → pause + alert.
    const gate = runQualityGate(article)
    if (!gate.ok) {
      const reason = `publish_quality_gate_failed: ${gate.failures.join(', ')}`
      await blockItem(admin, itemId, reason, ctx)
      return { itemId, status: 'paused', articleId: article.id, reason }
    }

    // (C) Duplicate topic: a different PUBLISHED article for this topic → block.
    if (article.topic_id) {
      const { data: dup } = await admin
        .from('generated_articles')
        .select('id')
        .eq('topic_id', article.topic_id)
        .eq('status', 'published')
        .neq('id', article.id)
        .limit(1)
        .maybeSingle()
      if (dup) { await blockItem(admin, itemId, 'duplicate_topic_published', ctx); return { itemId, status: 'paused', articleId: article.id, reason: 'duplicate_topic_published' } }
    }

    // (E) WordPress credentials must be present/valid. Deterministic → pause + alert.
    const loaded = await loadWordPressCredentials(admin, item.project_id)
    if ('error' in loaded) {
      await blockItem(admin, itemId, 'no_wordpress_connection', ctx)
      return { itemId, status: 'paused', articleId: article.id, reason: 'no_wordpress_connection' }
    }

    // Retry cap: a repeatedly-failing publish stops after AUTOMATION_MAX_ATTEMPTS
    // and stays 'failed' for a human (never an infinite loop). First publish of a
    // freshly 'generated' item is unaffected (its attempts came from generation).
    if (item.status === 'failed' && (item.attempts ?? 0) >= AUTOMATION_MAX_ATTEMPTS) {
      return { itemId, status: item.status, articleId: article.id, noop: 'max_attempts' }
    }

    // (B) Atomic claim: only one worker flips the item to 'publishing'. Allowed
    // from 'generated' (normal) or 'failed' (retry). Recovery above already
    // handled the wp_post_id case, so this is a fresh publish. Increment attempts
    // so publish retries are bounded by the same cap.
    const { data: claimed } = await admin
      .from('article_pool_items')
      .update({ status: 'publishing', locked_at: nowIso(), attempts: (item.attempts ?? 0) + 1, updated_at: nowIso() })
      .eq('id', itemId)
      .in('status', ['generated', 'failed'])
      .select('id')
      .maybeSingle()
    if (!claimed) return { itemId, status: item.status, articleId: article.id, noop: 'already_claimed' }
    ctx.attempts = (item.attempts ?? 0) + 1
    await admin.from('generated_articles').update({ status: 'publishing', updated_at: nowIso() }).eq('id', article.id).in('status', ['draft', 'ready', 'generated', 'failed'])

    // Create the WordPress post (status=publish; never force; blocks on image
    // upload failure so nothing goes live without its intended image).
    const created = await wpCreatePost(admin, loaded.creds, article as never, { status: 'publish' })
    if (!created.ok) {
      await admin.from('generated_articles').update({ status: 'draft', updated_at: nowIso() }).eq('id', article.id)
      if (created.kind === 'media_upload_failed') {
        // Area E — only a DETERMINISTIC media failure (missing source image /
        // invalid media / WP 4xx) pauses + alerts; a transient timeout/429/5xx
        // stays a bounded, retryable failure (final-failure alert at the cap).
        if (classifyMediaFailure(created) === 'deterministic') {
          await blockItem(admin, itemId, 'wordpress_media_upload_failed', ctx)
          return { itemId, status: 'paused', articleId: article.id, reason: 'wordpress_media_upload_failed' }
        }
        const mediaReason = created.detail ? `wordpress_media_upload_failed: ${created.detail.slice(0, 120)}` : 'wordpress_media_upload_failed'
        await finalizeItem(admin, itemId, 'failed', mediaReason)
        await alertOnFinalFailure(mediaReason)
        return { itemId, status: 'failed', articleId: article.id, reason: 'wordpress_media_upload_failed' }
      }
      const wpReason = created.detail ? `wordpress_post_failed: ${created.detail.slice(0, 120)}` : 'wordpress_post_failed'
      await finalizeItem(admin, itemId, 'failed', wpReason)
      await alertOnFinalFailure(wpReason)
      return { itemId, status: 'failed', articleId: article.id, reason: 'wordpress_post_failed' }
    }

    // (D) CRITICAL: persist wp_post_id/url BEFORE anything else, with retries, so
    // a later DB failure can never cause a duplicate WordPress post on retry.
    const wpPatch: Record<string, unknown> = {
      wp_post_id: created.wpPostId,
      wp_post_url: created.wpPostUrl,
      wp_connection_id: loaded.connection.id,
      updated_at: nowIso(),
    }
    if (typeof created.featuredMediaId === 'number') wpPatch.wp_featured_media_id = created.featuredMediaId
    let persisted = false
    for (let i = 0; i < 3 && !persisted; i++) {
      const { error } = await admin.from('generated_articles').update(wpPatch).eq('id', article.id)
      persisted = !error
    }
    if (!persisted) {
      // The WP post exists but we couldn't record its id — surface loudly; a
      // retry will reconcile ONLY if the id later persists, so flag for a human.
      console.error('[automation-publish] wp id persist failed after publish', { itemId, articleId: article.id, wpPostId: created.wpPostId })
      await finalizeItem(admin, itemId, 'failed', 'db_persist_failed_after_wp_publish')
      await alertOnFinalFailure('db_persist_failed_after_wp_publish')
      return { itemId, status: 'failed', articleId: article.id, reason: 'db_persist_failed_after_wp_publish', wpPostUrl: created.wpPostUrl }
    }

    // SEO meta through the SHARED verifying service — WITH the focus keyword (loaded from the
    // topic's primary_keyword) and PERSISTED truthfully. Never swallowed, never a silent
    // publish without complete SEO data. Non-fatal to the post itself.
    try {
      const seo = await publishArticleSeo(admin, loaded.creds, created.wpPostId, {
        articleId: article.id, metaTitle: article.meta_title || String(article.title || ''), metaDescription: article.meta_description || null, topicId: article.topic_id,
      })
      if (seo.status !== 'verified') console.warn('[automation-publish] seo_not_verified', { itemId, articleId: article.id, plugin: seo.plugin, status: seo.status })
    } catch (e) { console.warn('[automation-publish] seo write failed', { itemId, message: (e as Error)?.message?.slice(0, 120) }) }

    // Finalize: article + item published.
    await admin.from('generated_articles').update({ status: 'published', published_at: nowIso(), last_error: null, updated_at: nowIso() }).eq('id', article.id)
    await admin.from('article_pool_items').update({ status: 'published', published_at: nowIso(), last_error: null, locked_at: null, updated_at: nowIso() }).eq('id', itemId)

    // Phase 3E — add the topic's primary keyword to the project's tracked
    // keywords. Best-effort + idempotent; never affects the publish outcome.
    await ensureProjectKeywordFromPublishedArticle(admin, article.id)

    // Phase 4B.1 — a successful publish resolves any open failure alert.
    await resolvePublishAlerts(admin, itemId)

    return { itemId, status: 'published', articleId: article.id, wpPostUrl: created.wpPostUrl }
  } catch (e) {
    const msg = e instanceof Error ? e.message.slice(0, 200) : 'unexpected_error'
    console.error('[automation-publish] unexpected', { itemId, message: msg })
    try { await finalizeItem(admin, itemId, 'failed', `unexpected: ${msg}`) } catch { /* ignore */ }
    // Area E — an unexpected crash must not silently set 'failed' with no signal.
    // Raise a deduped final-failure alert from the retained context (best-effort).
    if (ctx.projectId) {
      await recordPublishFinalFailureAlert(admin, {
        projectId: ctx.projectId, poolItemId: itemId, articleId: ctx.articleId, topicId: ctx.topicId,
        title: ctx.title, error: `unexpected: ${msg}`, attempts: ctx.attempts,
      })
    }
    return { itemId, status: 'failed', articleId: ctx.articleId, reason: 'unexpected_error' }
  }
}
