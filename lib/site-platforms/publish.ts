/**
 * Publishing an article to a Wix or custom-site (webhook) connection.
 *
 * ONE orchestrator for both paths that publish today — the manual publish route
 * (app/api/content/articles/[id]/site-platform) and the content automation
 * runner (publishSitePoolItem below, dispatched from publishPoolItem). WordPress
 * and Shopify keep their own orchestrators, untouched; publishPoolItem reaches
 * this file only when the resolver says the project's platform is Wix or webhook.
 *
 * Idempotent: the post id is written to generated_articles.site_post_id before
 * the article is marked published, and an article that already has one for the
 * connected platform is reconciled, never posted twice.
 *
 * Failures are stable codes (types.ts SiteErrorCode). Logs carry the platform
 * and the code only — never a URL path, a key, a payload or the receiver's text.
 */
import type { createAdminClient } from '@/lib/supabase/admin'
import { loadSiteConnection, markSiteConnection, type LoadedSiteConnection } from './store'
import { publishToWix, type FetchLike } from './wix'
import { publishViaWebhook, type WebhookDeps } from './webhook'
import { SITE_ARTICLE_SELECT, type SitePlatform, type SitePublishArticle, type SitePublishResult, type SiteErrorCode } from './types'
import { AUTOMATION_MAX_ATTEMPTS } from '@/lib/content/automation/generate-item'
import { recordPublishFinalFailureAlert, recordPublishBlockedAlert, resolvePublishAlerts } from '@/lib/content/automation/alerts'
import { ensureProjectKeywordFromPublishedArticle } from '@/lib/content/keyword-from-article'
import { loadSchemaContext } from '@/lib/content/article-visibility'
import { composeWebhookBody } from '@/lib/content/article-style/publish'
import type { PublishItemResult } from '@/lib/content/automation/publish-item'

type Admin = ReturnType<typeof createAdminClient>
const nowIso = () => new Date().toISOString()

export type SiteAdapterDeps = { fetch?: FetchLike; webhook?: WebhookDeps }
export type SiteAdapter = (conn: LoadedSiteConnection, article: SitePublishArticle, deps: SiteAdapterDeps) => Promise<SitePublishResult>

/** The adapter for each platform. The dispatch below picks from this map and nothing else. */
export const SITE_ADAPTERS: Record<SitePlatform, SiteAdapter> = {
  wix: (conn, article, deps) => conn.platform === 'wix'
    ? publishToWix({ siteId: conn.siteId, apiKey: conn.apiKey, memberId: conn.memberId }, article, deps.fetch)
    : Promise.resolve({ ok: false, code: 'unexpected', retryable: false }),
  webhook: (conn, article, deps) => conn.platform === 'webhook'
    ? publishViaWebhook({ endpointUrl: conn.endpointUrl, secret: conn.secret }, article, deps.webhook)
    : Promise.resolve({ ok: false, code: 'unexpected', retryable: false }),
}

/** Failures that mean the connection itself is broken until the owner fixes it. */
const CONNECTION_FAILURES: SiteErrorCode[] = ['wix_auth_failed', 'wix_blog_missing', 'url_not_public', 'url_not_https', 'invalid_url', 'webhook_redirect_refused']

export type SitePublishOutcome =
  | { ok: true; platform: SitePlatform; postId: string; url: string | null; reconciled: boolean }
  | { ok: false; code: SiteErrorCode; retryable: boolean; platform: SitePlatform | null }

type ArticleRow = SitePublishArticle & { project_id: string; status: string; topic_id: string | null }

async function loadArticle(admin: Admin, projectId: string, articleId: string): Promise<ArticleRow | null> {
  const { data } = await admin.from('generated_articles').select(SITE_ARTICLE_SELECT).eq('id', articleId).eq('project_id', projectId).maybeSingle()
  return (data as ArticleRow | null) ?? null
}

async function persistPost(admin: Admin, articleId: string, platform: SitePlatform, postId: string, url: string | null): Promise<boolean> {
  for (let i = 0; i < 3; i++) {
    const { error } = await admin.from('generated_articles')
      .update({ site_post_platform: platform, site_post_id: postId, site_post_url: url, updated_at: nowIso() })
      .eq('id', articleId)
    if (!error) return true
  }
  return false
}

/**
 * Publish one article of `projectId` to its Wix / webhook connection. The caller
 * has proved ownership (manual route) or is the automation runner (service).
 */
export async function publishArticleToSite(
  admin: Admin,
  projectId: string,
  articleId: string,
  deps: SiteAdapterDeps & { adapters?: Record<SitePlatform, SiteAdapter> } = {},
): Promise<SitePublishOutcome> {
  const loaded = await loadSiteConnection(admin, projectId)
  if (!loaded.ok) return { ok: false, code: loaded.code, retryable: loaded.code === 'unexpected', platform: null }
  const platform = loaded.conn.platform

  const article = await loadArticle(admin, projectId, articleId)
  if (!article) return { ok: false, code: 'article_missing', retryable: false, platform }

  // Already on this platform → reconcile, never a second post.
  if (article.site_post_id && article.site_post_platform === platform) {
    if (article.status !== 'published') {
      await admin.from('generated_articles').update({ status: 'published', published_at: nowIso(), last_error: null, updated_at: nowIso() }).eq('id', article.id)
    }
    return { ok: true, platform, postId: article.site_post_id, url: article.site_post_url ?? null, reconciled: true }
  }

  // The webhook payload carries structured_data (JSON-LD): its publisher facts
  // come from the project this call already scoped the article to.
  if (platform === 'webhook') {
    try { article.schema_context = await loadSchemaContext(admin, projectId, article.topic_id) } catch { article.schema_context = null }
    // The body with its inline images and the project's article design
    // (lib/content/article-style/publish.ts). Wix keeps the plain body: its rich
    // content has no place for styled boxes.
    if (article.content_html) article.content_html = await composeWebhookBody(admin, article.id, article.content_html)
  }

  const adapter = (deps.adapters ?? SITE_ADAPTERS)[platform]
  let result: SitePublishResult
  try {
    result = await adapter(loaded.conn, article, deps)
  } catch {
    result = { ok: false, code: 'unexpected', retryable: true }
  }
  if (!result.ok) {
    console.warn('[site-publish] failed', { platform, code: result.code })
    if (CONNECTION_FAILURES.includes(result.code)) await markSiteConnection(admin, projectId, { status: 'failed', code: result.code })
    return { ok: false, code: result.code, retryable: result.retryable, platform }
  }

  if (!(await persistPost(admin, article.id, platform, result.postId, result.url))) {
    // The post exists on the site but its id could not be stored: say so loudly
    // (a retry could otherwise post again) and leave the article unpublished here.
    console.error('[site-publish] post id persist failed after publish', { platform })
    return { ok: false, code: 'save_failed', retryable: false, platform }
  }
  await admin.from('generated_articles').update({ status: 'published', published_at: nowIso(), last_error: null, updated_at: nowIso() }).eq('id', article.id)
  await ensureProjectKeywordFromPublishedArticle(admin, article.id)
  return { ok: true, platform, postId: result.postId, url: result.url, reconciled: false }
}

interface PoolItem { id: string; project_id: string; topic_id: string | null; article_id: string | null; status: string; attempts: number }

async function finalizeItem(admin: Admin, itemId: string, status: string, lastError: string | null): Promise<void> {
  await admin.from('article_pool_items').update({ status, last_error: lastError, locked_at: null, updated_at: nowIso() }).eq('id', itemId)
}

/** Blockers a retry cannot clear: pause the item and alert once. */
const DETERMINISTIC: SiteErrorCode[] = [
  'no_site_connection', 'site_connection_inactive', 'credentials_unreadable', 'article_missing', 'article_empty',
  'wix_auth_failed', 'wix_blog_missing', 'wix_no_author', 'wix_rejected', 'url_not_public', 'url_not_https', 'invalid_url',
  'webhook_redirect_refused', 'webhook_too_large', 'save_failed',
]

/**
 * The automation runner's Wix / webhook publisher: the same safety envelope as
 * the Shopify one (atomic claim, bounded retries, one alert on the final
 * failure, pause + alert on a deterministic blocker). Alerts carry no channel
 * (the alerts table knows only 'shopify' | 'wordpress'), so they render under
 * the neutral heading.
 */
export async function publishSitePoolItem(admin: Admin, item: PoolItem, deps: SiteAdapterDeps & { adapters?: Record<SitePlatform, SiteAdapter> } = {}): Promise<PublishItemResult> {
  const articleId = item.article_id as string
  const alertBase = { projectId: item.project_id, poolItemId: item.id, articleId, topicId: item.topic_id, title: null as string | null, channel: null }
  try {
    const { data: titleRow } = await admin.from('generated_articles').select('title').eq('id', articleId).maybeSingle()
    alertBase.title = (titleRow as { title?: string | null } | null)?.title ?? null
    if (item.status === 'failed' && (item.attempts ?? 0) >= AUTOMATION_MAX_ATTEMPTS) {
      return { itemId: item.id, status: item.status, articleId, noop: 'max_attempts' }
    }
    const { data: claimed } = await admin
      .from('article_pool_items')
      .update({ status: 'publishing', locked_at: nowIso(), attempts: (item.attempts ?? 0) + 1, updated_at: nowIso() })
      .eq('id', item.id).in('status', ['generated', 'failed']).select('id').maybeSingle()
    if (!claimed) return { itemId: item.id, status: item.status, articleId, noop: 'already_claimed' }

    const out = await publishArticleToSite(admin, item.project_id, articleId, deps)
    if (out.ok) {
      await admin.from('article_pool_items').update({ status: 'published', published_at: nowIso(), last_error: null, locked_at: null, updated_at: nowIso() }).eq('id', item.id)
      await resolvePublishAlerts(admin, item.id, { articleId, channel: null })
      return { itemId: item.id, status: 'published', articleId, wpPostUrl: out.url, ...(out.reconciled ? { noop: 'reconciled' as const } : {}) }
    }
    const reason = `site_${out.code}`
    if (DETERMINISTIC.includes(out.code)) {
      await finalizeItem(admin, item.id, 'paused', reason)
      await recordPublishBlockedAlert(admin, { ...alertBase, error: reason, attempts: (item.attempts ?? 0) + 1 })
      return { itemId: item.id, status: 'paused', articleId, reason }
    }
    await finalizeItem(admin, item.id, 'failed', reason)
    if ((item.attempts ?? 0) + 1 >= AUTOMATION_MAX_ATTEMPTS) {
      await recordPublishFinalFailureAlert(admin, { ...alertBase, error: reason, attempts: (item.attempts ?? 0) + 1 })
    }
    return { itemId: item.id, status: 'failed', articleId, reason }
  } catch {
    console.error('[site-publish] unexpected in pool item')
    try { await finalizeItem(admin, item.id, 'failed', 'site_unexpected') } catch { /* ignore */ }
    await recordPublishFinalFailureAlert(admin, { ...alertBase, error: 'site_unexpected', attempts: item.attempts ?? 0 })
    return { itemId: item.id, status: 'failed', articleId, reason: 'unexpected_error' }
  }
}
