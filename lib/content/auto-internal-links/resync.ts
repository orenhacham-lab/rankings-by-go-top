/**
 * Sending a PUBLISHED article to its site again, in place, so the live post
 * matches the copy we hold (./heal.ts, after a dead automatic link was taken
 * out of the body).
 *
 * It is deliberately the SAME path the "update" button uses — the publisher the
 * project is connected with (the GO TOP SEO Bridge plugin when it is there,
 * otherwise the application password), publishArticleToWordPress with the
 * article's EXISTING post id — so this adds no new way to write to a customer's
 * site and inherits every guard that path already has.
 *
 * It refuses to do anything but an in-place update of an already published
 * post: no new post (never `forceNew`), no draft (which would take the page off
 * the site), no scheduling, no author change. It writes nothing to our own
 * tables; the caller owns that.
 */
import type { ServiceRoleClient } from '@/lib/supabase/admin'
import { loadWordPressPublisher, publishArticleToWordPress } from '@/lib/content/wordpress-plugin-publish'
import type { HealScope } from './heal'

/**
 * True when the live post was updated. Never throws: a site that refuses is a
 * `false`, and the pass tries it again later.
 */
export async function resyncPublishedArticle(admin: ServiceRoleClient, scope: HealScope): Promise<boolean> {
  const { data } = await admin.from('generated_articles').select('*')
    .eq('id', scope.articleId).eq('project_id', scope.projectId).eq('status', 'published').maybeSingle()
  const article = data as Record<string, unknown> | null
  if (!article) return false
  const postId = Number(article.wp_post_id)
  if (!Number.isInteger(postId) || postId <= 0) return false

  const loaded = await loadWordPressPublisher(admin, scope.projectId, { ownerId: scope.userId })
  if ('error' in loaded) {
    console.warn('[auto-link-heal] no publisher', { articleId: scope.articleId, reason: loaded.error })
    return false
  }
  const existing = {
    postId,
    featuredMediaId: typeof article.wp_featured_media_id === 'number' ? (article.wp_featured_media_id as number) : null,
  }
  const sent = await publishArticleToWordPress(admin, loaded, article as never, { status: 'publish', existing })
  if (!sent.ok) {
    console.warn('[auto-link-heal] site refused the update', { articleId: scope.articleId, stage: sent.stage, detail: sent.detail ?? null })
    return false
  }
  console.log('[auto-link-heal] live post updated', { articleId: scope.articleId, postId, via: sent.via })
  return true
}
