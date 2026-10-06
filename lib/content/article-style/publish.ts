/**
 * The article body as it goes to a site: the project's design and its call to
 * action applied on the way out, by designForSite (./render.ts), the function
 * the settings preview and the article view draw with. One call per publisher:
 *   - WordPress (lib/content/wordpress-publish.ts), after the inline images
 *     are composed with their WordPress media URLs;
 *   - a custom site's webhook (lib/site-platforms/publish.ts), with the inline
 *     images composed from their stored public URLs;
 *   - a Shopify store (lib/shopify/publish-article.ts), after its sanitizer and
 *     the inline images.
 * Wix gets the body untouched (see effectiveDesign in ./types.ts).
 *
 * Never fails a publish: if the settings cannot be read, or the design throws,
 * the body goes out exactly as it did before this existed.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { injectInlineImages, type ComposableInlineImage } from '@/lib/content/inline-images-compose'
import { designForSite } from './render'
import { readArticleCtaForArticle, readArticleStyleForArticle } from './store'
import type { DesignPlatform } from './types'

export async function applyArticleDesign(
  admin: SupabaseClient,
  articleId: string | null | undefined,
  html: string,
  platform: DesignPlatform,
): Promise<string> {
  if (!articleId) return html
  try {
    if (platform === 'wix') return html
    const { style, projectId } = await readArticleStyleForArticle(admin, articleId)
    const cta = await readArticleCtaForArticle(admin, projectId)
    // The same function the preview and the article view draw with (./render.ts).
    return designForSite(html, { style, cta, platform })
  } catch {
    console.warn('[article-style] design skipped', { platform })
    return html
  }
}

/**
 * The webhook body: the stored body with its ready inline images (stable public
 * URLs) and the project's design. Before this, a webhook site received the body
 * without its inline images.
 */
export async function composeWebhookBody(admin: SupabaseClient, articleId: string, html: string): Promise<string> {
  let body = html
  try {
    const { data } = await admin
      .from('article_inline_images')
      .select('id, section_id, alt_text, caption, storage_url, wp_media_url, position, status')
      .eq('article_id', articleId)
      .order('position', { ascending: true })
    const ready = ((data ?? []) as (ComposableInlineImage & { status?: string })[])
      .filter((r) => (r.status === 'ready' || r.status === 'uploaded') && /^https:\/\//.test(r.wp_media_url || r.storage_url || ''))
    if (ready.length) body = injectInlineImages(body, ready, 'preview')
  } catch {
    // No images table or no rows: the body goes as it is.
  }
  return applyArticleDesign(admin, articleId, body, 'webhook')
}
