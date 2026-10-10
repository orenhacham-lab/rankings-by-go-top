/**
 * ONE shared WordPress SEO-meta publishing service — used by manual publishing, automated
 * publishing, and update-in-place. It ALWAYS includes metaTitle + metaDescription + the
 * focus keyword (loaded from the topic's primary_keyword), writes through the verifying,
 * bridge-aware `writeVerifiedSeoMeta`, and PERSISTS the truthful outcome on the article so
 * both the editor and ContentHub can surface it. A 2xx is NEVER treated as success — only a
 * verified read-back is. Never throws; SEO failure is surfaced, never a silent success.
 */
import crypto from 'node:crypto'
import type { createAdminClient } from '@/lib/supabase/admin'
import type { WordPressCredentials } from '@/lib/wordpress/types'
import { writeVerifiedSeoMeta } from '@/lib/wordpress/client'
import type { SeoMetaStatus, SeoPlugin } from '@/lib/content/wordpress-taxonomy'
import { decryptCredential } from '@/lib/security/credentials-crypto'
import { pluginFix, type PluginLink, type PluginPost } from '@/lib/site-fix/plugin-client'
import { readPluginLink } from '@/lib/site-fix/store'

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

export interface SeoPluginDeps { decrypt?: (s: string) => string; post?: PluginPost }

/** A stable job id (UUID-shaped, as the plugin requires) for this article, this field and these words. */
export function seoJobId(articleId: string, type: 'seo_title' | 'meta_description', value: string): string {
  const h = crypto.createHash('sha256').update(`article-seo:${articleId}:${type}:${value}`).digest('hex')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`
}

/**
 * A site with NO SEO plugin prints no meta description and only the post's own title: WordPress
 * itself has no field for them. The Go Top plugin has one (`_gotop_seo_title`, `_gotop_seo_description`)
 * and prints it in the page's head only while no SEO plugin is active
 * (wordpress-plugin/gotop-seo-bridge/includes/output.php). So when the plugin is connected, the
 * article's own title and description go there, through its signed /fix route, the same way the
 * article's schema does (lib/content/wordpress-schema.ts). The plugin keeps the previous value for
 * undo and answers "already" when the words are unchanged. Null: the plugin is not connected (or
 * the post has no public address yet), and the caller keeps the outcome it had.
 */
export async function writeSeoViaGoTopPlugin(
  admin: Admin,
  // onlyIfEmpty: the plugin writes a field only while its stored value is still empty (its own
  // compare-and-set, `expected: ''`), so a value the merchant set is never replaced; it answers
  // changed_since_preview instead. Used by the backfill (scripts/backfill-article-seo-meta.ts).
  input: { articleId: string; postUrl: string; metaTitle: string; metaDescription: string | null; onlyIfEmpty?: boolean },
  deps: SeoPluginDeps = {},
): Promise<SeoPublishResult | null> {
  try {
    if (!/^https:\/\//i.test(input.postUrl)) return null
    const { data: art } = await admin.from('generated_articles').select('project_id').eq('id', input.articleId).maybeSingle()
    const projectId = (art as { project_id?: string | null } | null)?.project_id
    if (!projectId) return null
    const { data: proj } = await admin.from('projects').select('user_id').eq('id', projectId).maybeSingle()
    const userId = (proj as { user_id?: string | null } | null)?.user_id
    if (!userId) return null
    const row = await readPluginLink(admin, { projectId, userId }).catch(() => null)
    if (!row || row.status !== 'connected') return null
    let link: PluginLink
    try {
      link = { siteUrl: row.site_url, keyId: row.key_id, secret: (deps.decrypt ?? decryptCredential)(row.secret_encrypted) }
    } catch {
      return null
    }
    const fields: ['seo_title' | 'meta_description', string][] = []
    const title = input.metaTitle.trim().slice(0, 120)
    const description = (input.metaDescription ?? '').trim().slice(0, 320)
    if (title) fields.push(['seo_title', title])
    if (description) fields.push(['meta_description', description])
    if (!fields.length) return null
    for (const [type, value] of fields) {
      const answer = await pluginFix(link, { jobId: seoJobId(input.articleId, type, value), type, url: input.postUrl, value: { value }, expected: input.onlyIfEmpty ? '' : null }, deps.post)
      if (!answer.ok) return { plugin: 'none', status: answer.connectionLost ? 'seo_bridge_required' : 'exact_failure', detail: `gotop_plugin_${answer.code}` }
    }
    return { plugin: 'none', status: 'verified' }
  } catch {
    return null
  }
}

/**
 * Publish SEO meta for an article to the SAME wp_post_id (idempotent — never creates a post),
 * loading the focus keyword and persisting the verified outcome. Returns the truthful result.
 * `postUrl` (the post's public address, once it is published) lets a site with no SEO plugin get
 * its title and description through the Go Top plugin (writeSeoViaGoTopPlugin).
 */
export async function publishArticleSeo(
  admin: Admin,
  creds: WordPressCredentials,
  postId: number,
  opts: { articleId: string; metaTitle: string; metaDescription: string | null; topicId: string | null | undefined; postUrl?: string | null },
  deps: SeoPluginDeps = {},
): Promise<SeoPublishResult> {
  const focusKeyword = await loadFocusKeyword(admin, opts.topicId)
  let seo: SeoPublishResult = await writeVerifiedSeoMeta(creds, postId, { metaTitle: opts.metaTitle, metaDescription: opts.metaDescription, focusKeyword })
  if (seo.plugin === 'none' && seo.status === 'plugin_unavailable' && seo.detail !== 'other_seo_plugin' && opts.postUrl) {
    seo = (await writeSeoViaGoTopPlugin(admin, { articleId: opts.articleId, postUrl: opts.postUrl, metaTitle: opts.metaTitle, metaDescription: opts.metaDescription }, deps)) ?? seo
  }
  await persistSeoOutcome(admin, opts.articleId, seo)
  return seo
}
