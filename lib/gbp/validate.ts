/**
 * What a post on the merchant's Google Business Profile may contain, checked the
 * same way in the composer (live counter, inline errors) and on the server
 * (the only check that counts). Pure: no server imports, safe in a client bundle.
 *
 * Sources (scratchpad research, w7-gbp/research.md):
 *   - text up to 1,500 characters (Business Profile help, "Create & manage posts");
 *   - no phone number in the text (posts content policy 7213077); the CALL
 *     button dials the business's own number instead;
 *   - button types BOOK, ORDER, SHOP, LEARN_MORE, SIGN_UP, CALL (localPosts
 *     CallToAction.ActionType; GET_OFFER is deprecated and never offered);
 *   - every button but CALL carries a URL.
 * Our own rules on top: the URL is https, and by default on the project's own
 * site (a subdomain counts); a different site needs an explicit opt-in.
 */

export const GBP_SUMMARY_MAX = 1500
export const GBP_URL_MAX = 2048

export const GBP_CTA_TYPES = ['LEARN_MORE', 'BOOK', 'ORDER', 'SHOP', 'SIGN_UP', 'CALL'] as const
export type GbpCtaType = typeof GBP_CTA_TYPES[number]

export type GbpValidationCode =
  | 'summary_empty'
  | 'summary_too_long'
  | 'summary_has_phone'
  | 'cta_type_invalid'
  | 'cta_url_required'
  | 'cta_url_not_allowed'
  | 'cta_url_invalid'
  | 'cta_url_not_https'
  | 'cta_url_other_site'
  | 'cta_url_too_long'
  | 'schedule_invalid'
  | 'schedule_in_past'
  | 'schedule_too_far'

/**
 * Characters as a person counts them: code points, so an emoji or a Hebrew
 * letter with a combining mark never counts as two. The server and the
 * counter use this same function.
 */
export function countPostChars(text: string): number {
  return Array.from(text.trim()).length
}

/** The text cut to the limit on a code-point boundary (never half an emoji). */
export function clampPostText(text: string, max = GBP_SUMMARY_MAX): string {
  const chars = Array.from(text.trim())
  if (chars.length <= max) return chars.join('')
  const cut = chars.slice(0, max).join('')
  // Prefer ending at the last sentence end inside the final 30%.
  const lastStop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '), cut.lastIndexOf('\n'))
  return (lastStop > max * 0.7 ? cut.slice(0, lastStop + 1) : cut).trim()
}

/**
 * A phone number in the text. Deliberately narrow so a date ("29-09-2026"), a
 * price or a year is not mistaken for one: an international number (+ and
 * 8 to 15 digits), a local number starting with 0 (9 to 11 digits), or a
 * tel: link. Separators: spaces, hyphens, dots and parentheses.
 */
export function containsPhoneNumber(text: string): boolean {
  if (/\btel:/i.test(text)) return true
  for (const m of text.matchAll(/(?<![\w+])[+(]?\d[\d\s().-]{6,}\d(?!\d)/g)) {
    const run = m[0]
    const digits = run.replace(/\D/g, '')
    if (run.startsWith('+') && digits.length >= 8 && digits.length <= 15) return true
    if (digits.startsWith('0') && digits.length >= 9 && digits.length <= 11 && !/^\d{1,2}[.-]\d{1,2}[.-]\d{2,4}$/.test(run)) return true
  }
  return false
}

/** "www.shop.co.il" and "shop.co.il" are the same site; "blog.shop.co.il" belongs to it. */
function siteHost(raw: string | null | undefined): string | null {
  if (!raw) return null
  try {
    const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`)
    return u.hostname.toLowerCase().replace(/^www\./, '')
  } catch { return null }
}

export function isSameSite(url: string, siteUrl: string | null | undefined): boolean {
  const site = siteHost(siteUrl)
  const host = siteHost(url)
  if (!site || !host) return false
  return host === site || host.endsWith(`.${site}`)
}

export interface GbpPostInput {
  summary: string
  ctaType?: string | null
  ctaUrl?: string | null
  /** The project's own site, for the same-site default. */
  siteUrl?: string | null
  /** The merchant explicitly allowed a button that leads to another site. */
  allowOtherSite?: boolean
  /** ISO time to publish at; absent means now. */
  scheduledAt?: string | null
  now?: Date
}

export interface GbpPostChecked {
  summary: string
  ctaType: GbpCtaType | null
  ctaUrl: string | null
  scheduledAt: string | null
}

export type GbpValidation =
  | { ok: true; value: GbpPostChecked }
  | { ok: false; errors: GbpValidationCode[] }

const MIN_LEAD_MS = 5 * 60 * 1000
const MAX_AHEAD_MS = 365 * 24 * 60 * 60 * 1000

export function validatePostInput(input: GbpPostInput): GbpValidation {
  const errors: GbpValidationCode[] = []
  const summary = typeof input.summary === 'string' ? input.summary.trim() : ''
  const chars = countPostChars(summary)
  if (chars === 0) errors.push('summary_empty')
  if (chars > GBP_SUMMARY_MAX) errors.push('summary_too_long')
  if (chars > 0 && containsPhoneNumber(summary)) errors.push('summary_has_phone')

  let ctaType: GbpCtaType | null = null
  let ctaUrl: string | null = null
  const rawType = typeof input.ctaType === 'string' && input.ctaType ? input.ctaType : null
  const rawUrl = typeof input.ctaUrl === 'string' && input.ctaUrl.trim() ? input.ctaUrl.trim() : null
  if (rawType !== null) {
    if (!(GBP_CTA_TYPES as readonly string[]).includes(rawType)) {
      errors.push('cta_type_invalid')
    } else {
      ctaType = rawType as GbpCtaType
      if (ctaType === 'CALL') {
        if (rawUrl) errors.push('cta_url_not_allowed')
      } else if (!rawUrl) {
        errors.push('cta_url_required')
      } else if (rawUrl.length > GBP_URL_MAX) {
        errors.push('cta_url_too_long')
      } else {
        let parsed: URL | null = null
        try { parsed = new URL(rawUrl) } catch { parsed = null }
        if (!parsed || !parsed.hostname || parsed.username || parsed.password || /\s/.test(rawUrl)) errors.push('cta_url_invalid')
        else if (parsed.protocol !== 'https:') errors.push('cta_url_not_https')
        else if (!input.allowOtherSite && !isSameSite(parsed.href, input.siteUrl)) errors.push('cta_url_other_site')
        else ctaUrl = parsed.href
      }
    }
  } else if (rawUrl) {
    // A URL without a button type would be silently dropped; say so instead.
    errors.push('cta_type_invalid')
  }

  let scheduledAt: string | null = null
  if (input.scheduledAt) {
    const t = Date.parse(input.scheduledAt)
    const now = (input.now ?? new Date()).getTime()
    if (!Number.isFinite(t)) errors.push('schedule_invalid')
    else if (t < now + MIN_LEAD_MS) errors.push('schedule_in_past')
    else if (t > now + MAX_AHEAD_MS) errors.push('schedule_too_far')
    else scheduledAt = new Date(t).toISOString()
  }

  if (errors.length > 0) return { ok: false, errors }
  return { ok: true, value: { summary, ctaType, ctaUrl, scheduledAt } }
}
