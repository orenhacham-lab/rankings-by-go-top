/**
 * A keyword the system added after it wrote an article carries a machine note
 * (lib/content/keyword-from-article.ts): "source=generated_article article=<id>
 * topic=<id> wp_post=<id>". It is not for people to read; the keywords table
 * shows a short link to the article instead.
 */
const MARKER = /^source=generated_article article=([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b/i

/** The article id when the note is the system's, else null (a note the owner wrote). */
export function articleIdFromNote(notes: string | null | undefined): string | null {
  const m = typeof notes === 'string' ? notes.trim().match(MARKER) : null
  return m ? m[1].toLowerCase() : null
}
