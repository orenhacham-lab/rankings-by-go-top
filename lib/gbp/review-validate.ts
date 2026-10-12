/**
 * What a reply to a review on the merchant's Business Profile may contain,
 * checked the same way in the screen (live counter, inline errors) and on the
 * server (the only check that counts). Pure: no server imports, safe in a
 * client bundle.
 *
 * The 4,096-character cap is OURS, not a documented API limit: the reviews
 * reference states no maximum, so we refuse a reply longer than what the
 * Business Profile interface itself accepts rather than let Google reject it
 * after the merchant pressed send.
 *
 * Nothing else about the text is refused. A reply may name a price, a phone
 * number or a URL, which the posts rules forbid (lib/gbp/validate.ts) — a
 * reply is a conversation with one customer, not a post.
 */

export const GBP_REPLY_MAX = 4096

export type GbpReplyValidationCode = 'reply_empty' | 'reply_too_long'

/** Characters as a person counts them: code points, so an emoji is one. */
export function countReplyChars(text: string): number {
  return Array.from(text.trim()).length
}

/** The reply cut to the limit on a code-point boundary (never half an emoji). */
export function clampReply(text: string, max = GBP_REPLY_MAX): string {
  const chars = Array.from(text.trim())
  if (chars.length <= max) return chars.join('')
  const cut = chars.slice(0, max).join('')
  const lastStop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '), cut.lastIndexOf('\n'))
  return (lastStop > max * 0.7 ? cut.slice(0, lastStop + 1) : cut).trim()
}

export interface GbpReplyChecked { comment: string }
export type GbpReplyValidation =
  | { ok: true; value: GbpReplyChecked }
  | { ok: false; errors: GbpReplyValidationCode[] }

export function validateReplyInput(input: { comment: unknown }): GbpReplyValidation {
  const raw = typeof input.comment === 'string' ? input.comment : ''
  // Control characters other than newline and tab would travel to Google as-is.
  const comment = raw.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim()
  const chars = countReplyChars(comment)
  const errors: GbpReplyValidationCode[] = []
  if (chars === 0) errors.push('reply_empty')
  if (chars > GBP_REPLY_MAX) errors.push('reply_too_long')
  if (errors.length > 0) return { ok: false, errors }
  return { ok: true, value: { comment } }
}

/** 'ONE'..'FIVE' → 1..5; anything else (including STAR_RATING_UNSPECIFIED) → null. */
export function starsFromRating(rating: unknown): number | null {
  switch (rating) {
    case 'ONE': return 1
    case 'TWO': return 2
    case 'THREE': return 3
    case 'FOUR': return 4
    case 'FIVE': return 5
    default: return null
  }
}
