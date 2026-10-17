/**
 * WHAT A PUBLISHED ARTICLE MUST CARRY.
 *
 * The four GEO articles went live without a cover image, and nothing stopped
 * them: every write path took `featured_image_url || null` and published
 * happily. A blog post with no cover looks unfinished on the index, has no
 * image for a share card, and gives Google nothing for the article's
 * `image` field.
 *
 * So the rule lives in ONE place and every path that can publish calls it:
 * the admin API (create and edit) and the internal publish endpoint. A DRAFT
 * is never blocked — an article is written before its cover is made, and
 * refusing the draft would mean losing the text.
 */

export interface ArticlePublishInput {
  is_published?: boolean | null
  featured_image_url?: string | null
}

/**
 * The reason this article may not be published, or null when it may be.
 *
 * English, because it is an API error read by the admin screen and by
 * whoever is reading a log, not merchant-facing copy.
 */
export function articlePublishBlockReason(input: ArticlePublishInput): string | null {
  if (!input.is_published) return null
  if (!input.featured_image_url || !input.featured_image_url.trim()) {
    return 'A published article must have a featured image'
  }
  return null
}
