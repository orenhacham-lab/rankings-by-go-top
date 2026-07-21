/**
 * ONE shared WordPress SEO-meta publishing service — used by manual publishing, automated
 * publishing, and update-in-place. It ALWAYS includes metaTitle + metaDescription + the
 * focus keyword (loaded from the topic's primary_keyword), writes through the verifying,
 * bridge-aware `writeVerifiedSeoMeta`, and PERSISTS the truthful outcome on the article so
 * both the editor and ContentHub can surface it. A 2xx is NEVER treated as success — only a
 * verified read-back is. Never throws; SEO failure is surfaced, never a silent success.
 */
import type { createAdminClient } from '@/lib/supabase/admin'
import type { WordPressCredentials } from '@/lib/wordpress/types'
import { writeVerifiedSeoMeta } from '@/lib/wordpress/client'
import type { SeoMetaStatus, SeoPlugin } from '@/lib/content/wordpress-taxonomy'

type Admin = ReturnType<typeof createAdminClient>

export interface SeoPublishResult { plugin: SeoPlugin; status: SeoMetaStatus; detail?: string }

/** Load the article's focus keyword from its topic's primary_keyword (never omitted). */
export async function loadFocusKeyword(admin: Admin, topicId: string | null | undefined): Promise<string | null> {
  if (!topicId) return null
  try {
    const { data } = await admin.from('article_topics').select('primary_keyword').eq('id', topicId).maybeSingle()
    const kw = (data as { primary_keyword?: string } | null)?.primary_keyword
    return kw ? String(kw) : null
  } catch {
    return null
  }
}

/** Persist the SEO outcome on the article (safe fields only; tolerant of a pre-migration DB). */
export async function persistSeoOutcome(admin: Admin, articleId: string, seo: SeoPublishResult): Promise<void> {
  try {
    await admin.from('generated_articles').update({
      seo_status: seo.status,
      seo_plugin: seo.plugin,
      seo_last_error: seo.detail ? String(seo.detail).slice(0, 300) : null,
      seo_verified_at: seo.status === 'verified' ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    }).eq('id', articleId)
  } catch { /* seo_* columns may not exist before the migration — non-fatal */ }
}

/**
 * Publish SEO meta for an article to the SAME wp_post_id (idempotent — never creates a post),
 * loading the focus keyword and persisting the verified outcome. Returns the truthful result.
 */
export async function publishArticleSeo(
  admin: Admin,
  creds: WordPressCredentials,
  postId: number,
  opts: { articleId: string; metaTitle: string; metaDescription: string | null; topicId: string | null | undefined },
): Promise<SeoPublishResult> {
  const focusKeyword = await loadFocusKeyword(admin, opts.topicId)
  const seo = await writeVerifiedSeoMeta(creds, postId, { metaTitle: opts.metaTitle, metaDescription: opts.metaDescription, focusKeyword })
  await persistSeoOutcome(admin, opts.articleId, seo)
  return seo
}
