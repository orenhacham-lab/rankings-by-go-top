/**
 * Case-insensitive indexOf whose result is a valid offset into `haystack`.
 *
 * `String.prototype.toLowerCase()` is not length-preserving for every
 * character — U+0130 "İ" lowercases to the two-code-unit "i̇" — so an index
 * taken from a lowercased copy can sit one or more positions off against the
 * original. Slicing the original at such an index splits a word (or a
 * surrogate pair), and the reader sees a garbled word beside the link.
 *
 * The lowercased index is therefore used only while lowercasing is
 * length-stable for both strings; otherwise this falls back to an exact,
 * case-sensitive search, which is always offset-correct. A missed match costs
 * one internal link; a shifted one corrupts the article.
 */
export function indexOfCaseInsensitive(haystack: string, needle: string, from = 0): number {
  if (!needle) return -1
  const lowerHay = haystack.toLowerCase()
  const lowerNeedle = needle.toLowerCase()
  if (lowerHay.length === haystack.length && lowerNeedle.length === needle.length) {
    return lowerHay.indexOf(lowerNeedle, from)
  }
  return haystack.indexOf(needle, from)
}
