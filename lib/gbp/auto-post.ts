/**
 * AUTOMATIC POSTS: an article that just published to the owner's site also
 * becomes a post on their Google Business Profile, with nobody pressing
 * anything. Server-only.
 *
 * OPT-IN, OFF for everyone by default (Oren, 2026-10-12): it runs only for a
 * project whose owner connected a Business Profile location AND turned
 * `auto_post_on_publish` on. Nothing here changes what any existing project does.
 *
 * WHAT THIS FUNCTION IS ALLOWED TO DO, and nothing more: read a few rows and
 * write ONE gbp_posts row. It makes no call to Google and no call to a model, so
 * nothing Google or Gemini does can slow down, delay or fail an article publish.
 * It never throws; the caller logs the reason and carries on. (The article cron
 * stalled in every project 2026-10-07..11; nothing added to that path may ever
 * be able to break it again.)
 *
 * The text it stores is the article's OWN title and summary, clamped to Google's
 * limit, and the row is marked `needs_ai_draft`. The GBP cron rewrites it with
 * the AI draft on its own schedule, just before publishing (lib/gbp/publish.ts).
 * If the model is unavailable the article's own words go out — never a blank post.
 *
 * Posting twice about one article is impossible: uq_gbp_posts_auto_article is a
 * unique index, so a retried or reconciled publish inserts nothing the second
 * time even if two runners race.
 */
import type { createAdminClient } from '@/lib/supabase/admin'
import { isGbpPostsEnabled } from './config'
import { insertPost, readGbpConnection, readProjectLocation, GbpStoreError } from './store'
import { clampPostText, containsPhoneNumber, GBP_SUMMARY_MAX } from './validate'
import type { GbpCtaType } from './validate'

type Admin = ReturnType<typeof createAdminClient>

export type AutoPostReason =
  | 'feature_off'          // GBP_POSTS_ENABLED is not on
  | 'no_article'           // the article row is gone
  | 'not_published'        // not actually published (we post about live articles only)
  | 'no_location'          // this project has no Business Profile connected
  | 'switch_off'           // the owner has not approved automatic posting
  | 'not_connected'        // the Google connection needs reconnecting
  | 'already_queued'       // an automatic post for this article exists (incl. the race)
  | 'no_text'              // the article has no title and no summary to post
  | 'language_unsupported' // a post can only be he or en today; see postLanguage
  | 'queued'
  | 'insert_failed'
  | 'error'

export interface AutoPostResult {
  /** True when the helper ran without an unexpected error — queued, or a benign skip. */
  ok: boolean
  queued: boolean
  reason: AutoPostReason
  postId?: string
}

/** The columns this helper reads. Nothing else about the article is touched. */
const ARTICLE_SELECT =
  'id, project_id, user_id, title, status, meta_description, excerpt, featured_image_url, wp_post_url, shopify_article_url, site_post_url'

interface ArticleRow {
  id: string
  project_id: string | null
  title?: string | null
  status?: string | null
  meta_description?: string | null
  excerpt?: string | null
  featured_image_url?: string | null
  wp_post_url?: string | null
  shopify_article_url?: string | null
  site_post_url?: string | null
}

/** The live article URL, whichever platform published it. https only. */
export function publishedArticleUrl(a: Pick<ArticleRow, 'wp_post_url' | 'shopify_article_url' | 'site_post_url'>): string | null {
  for (const v of [a.wp_post_url, a.shopify_article_url, a.site_post_url]) {
    if (typeof v === 'string' && /^https:\/\//.test(v) && v.length <= 2048) return v
  }
  return null
}

/**
 * The placeholder the row carries until the cron drafts it: the article's own
 * title and summary, nothing invented. Plain text, no URL and no phone number,
 * because Google refuses both in a post's text.
 */
export function placeholderSummary(src: { title: string | null; description: string | null }): string {
  const title = (src.title ?? '').replace(/\s+/g, ' ').trim()
  const body = (src.description ?? '').replace(/\r/g, '').replace(/[^\S\n]+/g, ' ').trim()
  let text = [title, body].filter(Boolean).join('\n\n').replace(/https?:\/\/\S+/g, '').trim()
  if (containsPhoneNumber(text)) text = text.split('\n').filter((l) => !containsPhoneNumber(l)).join('\n').trim()
  return clampPostText(text, GBP_SUMMARY_MAX)
}

/**
 * The project's own language decides the post's language, and a post it cannot be
 * written in is not written at all.
 *
 * gbp_posts.language_code allows only 'he' and 'en' today (the CHECK in
 * 20260929020000_gbp_local_posts.sql), which the composer gets away with because a
 * person picks there. Automatic posting cannot: publishing an English post on a
 * Spanish business's profile would look broken to that business's own customers,
 * which is worse than publishing nothing. So a project in any other language is
 * skipped until posts support its language (the composer, the draft prompt and
 * that CHECK all have to widen together — its own change, not this one).
 */
export function postLanguageFor(projectLanguage: unknown): 'he' | 'en' | null {
  const lang = typeof projectLanguage === 'string' ? projectLanguage.toLowerCase() : ''
  if (lang.startsWith('he')) return 'he'
  if (lang.startsWith('en')) return 'en'
  // No language recorded at all: the project predates the column or never set it.
  // English is the app's own default there, and nothing is lost by using it.
  if (lang === '') return 'en'
  return null
}

async function postLanguage(admin: Admin, projectId: string): Promise<'he' | 'en' | null> {
  const { data } = await admin.from('projects').select('language').eq('id', projectId).maybeSingle()
  return postLanguageFor((data as { language?: string | null } | null)?.language ?? '')
}

/**
 * Queue the automatic post for an article that has just published. Idempotent and
 * never throws. `admin` BYPASSES RLS, so every read is filtered by the owner the
 * article itself names.
 */
export async function enqueueGbpPostForPublishedArticle(admin: Admin, articleId: string): Promise<AutoPostResult> {
  const skip = (reason: AutoPostReason): AutoPostResult => ({ ok: true, queued: false, reason })
  try {
    if (!isGbpPostsEnabled()) return skip('feature_off')

    const { data: artData } = await admin.from('generated_articles').select(ARTICLE_SELECT).eq('id', articleId).maybeSingle()
    const article = artData as ArticleRow | null
    if (!article || !article.project_id) return skip('no_article')
    if (article.status !== 'published') return skip('not_published')

    // The location carries the switch AND the owner. A missing table (the
    // migration not applied yet) reads as "no location", so nothing happens.
    let location
    try {
      location = await readProjectLocation(admin, article.project_id)
    } catch (e) {
      if (e instanceof GbpStoreError && e.code === 'missing') return skip('no_location')
      throw e
    }
    if (!location) return skip('no_location')
    if (!location.auto_post_on_publish) return skip('switch_off')

    // A connection that needs reconnecting would only pile up failing posts.
    const conn = await readGbpConnection(admin, location.user_id)
    if (!conn || conn.status !== 'connected' || conn.id !== location.connection_id) return skip('not_connected')

    // Already queued or posted automatically? The unique index is the real
    // guarantee; this read just saves a pointless insert.
    const { data: existing } = await admin.from('gbp_posts').select('id')
      .eq('source_article_id', article.id).eq('auto_created', true).limit(1)
    if (Array.isArray(existing) && existing.length > 0) return skip('already_queued')

    const language = await postLanguage(admin, article.project_id)
    if (language === null) return skip('language_unsupported')

    const summary = placeholderSummary({
      title: typeof article.title === 'string' ? article.title : null,
      description: (typeof article.meta_description === 'string' && article.meta_description)
        ? article.meta_description
        : (typeof article.excerpt === 'string' ? article.excerpt : null),
    })
    if (!summary) return skip('no_text')

    // The button sends a nearby customer to the article they can actually read.
    // No URL (a project with no site) → no button, and the text still goes up.
    const url = publishedArticleUrl(article)
    const ctaType: GbpCtaType | null = url ? 'LEARN_MORE' : null
    const imageUrl = typeof article.featured_image_url === 'string' && /^https:\/\//.test(article.featured_image_url)
      ? article.featured_image_url
      : null

    try {
      const row = await insertPost(admin, {
        project_id: article.project_id,
        user_id: location.user_id,
        source_article_id: article.id,
        summary,
        cta_type: ctaType,
        cta_url: url,
        image_url: imageUrl,
        image_path: null,
        language_code: language,
        // Due now: the next GBP cron pass drafts it and sends it to Google.
        scheduled_at: new Date().toISOString(),
        auto_created: true,
        needs_ai_draft: true,
      })
      return { ok: true, queued: true, reason: 'queued', postId: row.id }
    } catch {
      // The unique index refusing a racing second insert is the expected,
      // harmless case and reads exactly like this.
      const { data: again } = await admin.from('gbp_posts').select('id')
        .eq('source_article_id', article.id).eq('auto_created', true).limit(1)
      if (Array.isArray(again) && again.length > 0) return skip('already_queued')
      return { ok: false, queued: false, reason: 'insert_failed' }
    }
  } catch {
    return { ok: false, queued: false, reason: 'error' }
  }
}
