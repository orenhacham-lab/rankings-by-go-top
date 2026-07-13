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
import { recordPublishFinalFailureAlert, resolvePublishAlerts } from '@/lib/content/automation/alerts'
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
 * Publish one pool item to Shopify. Returns a PublishItemResult; never throws for
 * an expected failure. Requires write_content + a selected target blog.
 */
export async function publishShopifyPoolItem(admin: Admin, item: PoolItem): Promise<PublishItemResult> {
  const articleId = item.article_id as string

  const { data: artData } = await admin.from('generated_articles').select(ARTICLE_SELECT).eq('id', articleId).maybeSingle()
  const article = artData as (ShopifyPublishArticleRow & { title: string | null }) | null
  if (!article) { await finalizeItem(admin, item.id, 'failed', 'article_missing'); return { itemId: item.id, status: 'failed', articleId, reason: 'article_missing' } }

  const loaded = await loadShopifyConnection(admin, item.project_id)
  if ('error' in loaded) { await finalizeItem(admin, item.id, 'quality_check_failed', 'no_shopify_connection'); return { itemId: item.id, status: 'quality_check_failed', articleId, reason: 'no_shopify_connection' } }

  // Publishing prerequisites — surfaced clearly, not retried into the alert cap.
  if (!hasWriteContent(loaded.connection.granted_scopes)) { await finalizeItem(admin, item.id, 'quality_check_failed', 'missing_write_content_scope'); return { itemId: item.id, status: 'quality_check_failed', articleId, reason: 'missing_write_content_scope' } }
  if (!article.shopify_blog_id) { await finalizeItem(admin, item.id, 'quality_check_failed', 'no_shopify_blog'); return { itemId: item.id, status: 'quality_check_failed', articleId, reason: 'no_shopify_blog' } }

  // Retry cap (same bound as WordPress).
  if (item.status === 'failed' && (item.attempts ?? 0) >= AUTOMATION_MAX_ATTEMPTS) {
    return { itemId: item.id, status: item.status, articleId, noop: 'max_attempts' }
  }

  const alertOnFinalFailure = async (reason: string) => {
    if (((item.attempts ?? 0) + 1) < AUTOMATION_MAX_ATTEMPTS) return
    await recordPublishFinalFailureAlert(admin, {
      projectId: item.project_id, poolItemId: item.id, articleId, topicId: item.topic_id,
      title: article.title, error: reason, attempts: (item.attempts ?? 0) + 1,
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
}
