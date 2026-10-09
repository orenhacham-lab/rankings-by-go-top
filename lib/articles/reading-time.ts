/**
 * "5 min read", from the article's own body.
 *
 * 200 words a minute is the usual figure for prose on a screen. Hebrew words
 * are shorter and fewer for the same thought, so the same divisor overstates a
 * Hebrew article slightly; the number is a courtesy on the byline, not a
 * measurement, and one shared rule is better than four tuned ones nobody can
 * check.
 */
const WORDS_PER_MINUTE = 200

export function readingMinutes(html: string): number {
  const text = html.replace(/<[^>]*>/g, ' ').replace(/&[a-z]+;|&#\d+;/gi, ' ')
  const words = text.split(/\s+/).filter(Boolean).length
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE))
}
