/**
 * Phase 4F.2 — Shopify backend for the automation publisher.
 *
 * Mirrors the WordPress publish-item safety envelope (atomic claim, retry bound,
 * persisted final-failure alert, idempotent create/update) but targets Shopify
 * Blog Articles. Dispatched from publishPoolItem ONLY for Shopify-only projects;
 * the WordPress path is untouched. One failed article never blocks other queue
 * items (each item is published independently).
 */

import type { createAdminClient } from '@/lib/supabase/admin'
import { loadShopifyConnection } from '@/lib/shopify/api-auth'
import { publishArticleToShopify, type ShopifyPublishArticleRow } from '@/lib/shopify/publish-article'
import { hasWriteContent } from '@/lib/shopify/constants'
import { AUTOMATION_MAX_ATTEMPTS } from '@/lib/content/automation/generate-item'
import { recordPublishFinalFailureAlert, recordPublishBlockedAlert, resolvePublishAlerts } from '@/lib/content/automation/alerts'
import type { PublishItemResult } from '@/lib/content/automation/publish-item'

type Admin = ReturnType<typeof createAdminClient>
const nowIso = () => new Date().toISOString()

const ARTICLE_SELECT =
  'id, topic_id, title, slug, excerpt, meta_description, content_html, featured_image_url, shopify_blog_id, shopify_article_id, shopify_tags'

interface PoolItem { id: string; project_id: string; topic_id: string | null; article_id: string | null; status: string; attempts: number }

async function finalizeItem(admin: Admin, itemId: string, status: string, lastError: string | null): Promise<void> {
  await admin.from('article_pool_items').update({ status, last_error: lastError, locked_at: null, updated_at: nowIso() }).eq('id', itemId)
}

/**
 * Area E — a DETERMINISTIC, action-required blocker: PAUSE the item (terminal,
 * not re-picked by the runner) and raise an immediate deduped alert. Local (not
 * imported from publish-item) to avoid a circular import. Best-effort alert.
 */
async function blockShopifyItem(admin: Admin, item: PoolItem, reason: string, articleTitle: string | null): Promise<void> {
  await finalizeItem(admin, item.id, 'paused', reason)
  await recordPublishBlockedAlert(admin, {
    projectId: item.project_id, poolItemId: item.id, articleId: item.article_id, topicId: item.topic_id,
    title: articleTitle, error: reason, attempts: item.attempts ?? 0,
  })
}

/**
 * Publish one pool item to Shopify. Returns a PublishItemResult; never throws for
 * an expected failure. Requires write_content + a selected target blog.
 */
export async function publishShopifyPoolItem(admin: Admin, item: PoolItem): Promise<PublishItemResult> {
  const articleId = item.article_id as string
  // Retained title so the terminal catch can still raise a proper deduped alert.
  let articleTitle: string | null = null
  try {
    const { data: artData } = await admin.from('generated_articles').select(ARTICLE_SELECT).eq('id', articleId).maybeSingle()
    const article = artData as (ShopifyPublishArticleRow & { title: string | null }) | null
    // Area E — deterministic, action-required blockers → paused + immediate alert.
    if (!article) { await blockShopifyItem(admin, item, 'article_missing', null); return { itemId: item.id, status: 'paused', articleId, reason: 'article_missing' } }
    articleTitle = article.title

    const loaded = await loadShopifyConnection(admin, item.project_id)
    if ('error' in loaded) { await blockShopifyItem(admin, item, 'no_shopify_connection', articleTitle); return { itemId: item.id, status: 'paused', articleId, reason: 'no_shopify_connection' } }

    // Publishing prerequisite — a config gate that won't change on retry.
    if (!hasWriteContent(loaded.connection.granted_scopes)) { await blockShopifyItem(admin, item, 'missing_write_content_scope', articleTitle); return { itemId: item.id, status: 'paused', articleId, reason: 'missing_write_content_scope' } }
    // NOTE: the target blog is NOT checked here — publishArticleToShopify resolves
    // the article-level blog OR the project default. A missing blog fails through
    // the normal publish path below (retry-bounded + alert after max attempts), so
    // a never-opened queue article publishes to the project default automatically.

    // Retry cap (same bound as WordPress).
    if (item.status === 'failed' && (item.attempts ?? 0) >= AUTOMATION_MAX_ATTEMPTS) {
      return { itemId: item.id, status: item.status, articleId, noop: 'max_attempts' }
    }

    const alertOnFinalFailure = async (reason: string) => {
      if (((item.attempts ?? 0) + 1) < AUTOMATION_MAX_ATTEMPTS) return
      await recordPublishFinalFailureAlert(admin, {
        projectId: item.project_id, poolItemId: item.id, articleId, topicId: item.topic_id,
        title: articleTitle, error: reason, attempts: (item.attempts ?? 0) + 1,
      })
    }

    // Atomic claim (only one worker flips to 'publishing'; bounds retries).
    const { data: claimed } = await admin
      .from('article_pool_items')
      .update({ status: 'publishing', locked_at: nowIso(), attempts: (item.attempts ?? 0) + 1, updated_at: nowIso() })
      .eq('id', item.id).in('status', ['generated', 'failed']).select('id').maybeSingle()
    if (!claimed) return { itemId: item.id, status: item.status, articleId, noop: 'already_claimed' }
    await admin.from('generated_articles').update({ status: 'publishing', updated_at: nowIso() }).eq('id', articleId).in('status', ['draft', 'ready', 'generated', 'failed'])

    // Idempotent create/update (scheduled publish → published). The orchestrator
    // persists shopify_article_id BEFORE the final state and never duplicates.
    const result = await publishArticleToShopify(admin, loaded.connection, loaded.creds, article, { published: true, authorName: null })
    if (!result.ok) {
      await admin.from('generated_articles').update({ status: 'draft', updated_at: nowIso() }).eq('id', articleId)
      const reason = `shopify_${result.reason}${result.detail ? `: ${result.detail.slice(0, 120)}` : ''}`
      await finalizeItem(admin, item.id, 'failed', reason)
      await alertOnFinalFailure(reason)
      return { itemId: item.id, status: 'failed', articleId, reason: result.reason }
    }

    await admin.from('generated_articles').update({ status: 'published', published_at: nowIso(), last_error: null, updated_at: nowIso() }).eq('id', articleId)
    await admin.from('article_pool_items').update({ status: 'published', published_at: nowIso(), last_error: null, locked_at: null, updated_at: nowIso() }).eq('id', item.id)
    await resolvePublishAlerts(admin, item.id)
    return { itemId: item.id, status: 'published', articleId, wpPostUrl: result.url }
  } catch (e) {
    // Area E — this path previously had NO try/catch: an unexpected throw here
    // propagated to publishPoolItem's catch, which set 'failed' without Shopify
    // context. Handle it locally with a proper deduped alert + retained context.
    const msg = e instanceof Error ? e.message.slice(0, 200) : 'unexpected_error'
    console.error('[automation-publish-shopify] unexpected', { itemId: item.id, message: msg })
    try { await finalizeItem(admin, item.id, 'failed', `unexpected: ${msg}`) } catch { /* ignore */ }
    await recordPublishFinalFailureAlert(admin, {
      projectId: item.project_id, poolItemId: item.id, articleId, topicId: item.topic_id,
      title: articleTitle, error: `unexpected: ${msg}`, attempts: (item.attempts ?? 0),
    })
    return { itemId: item.id, status: 'failed', articleId, reason: 'unexpected_error' }
  }
}
