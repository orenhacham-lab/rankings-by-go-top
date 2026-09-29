/**
 * The project's own call to action at the end of every article: a heading, a
 * line of text and one button to a page of the owner's choosing. Part of the
 * article-design settings (project_article_styles.article_cta,
 * supabase/migrations/20260929120000_project_article_cta.sql).
 *
 * OFF UNTIL THE OWNER TURNS IT ON. No row, no column yet, an empty or invalid
 * stored value: the call to action is off and articles are exactly as before.
 * The card pre-fills a suggestion from the business details, but a suggestion
 * is never shown in an article until the owner switches it on and saves.
 *
 * SAFE BY CONSTRUCTION. The three texts are plain text (tags and control
 * characters removed, length-capped) and are HTML-escaped where they are drawn
 * (./html.ts). The button's link is https only: no javascript:, data:, http:,
 * credentials, whitespace or control characters; anything else is rejected,
 * never repaired into a different address. The HTML the box is drawn in then
 * passes the design's sanitizer like every other part of the article.
 *
 * WHERE IT GOES: WordPress, a custom site's webhook, and the in-app view. A
 * Shopify store and a Wix site keep the minimal design without boxes, as
 * before (siteCta returns null for them).
 *
 * Pure: no I/O, safe in the browser and on the server.
 */
import type { DesignPlatform } from './types'

export type ArticleCta = {
  enabled: boolean
  heading: string
  text: string
  buttonLabel: string
  /** https only, normalised; '' while not set. */
  buttonUrl: string
}

export const CTA_LIMITS = { heading: 80, text: 240, buttonLabel: 40, buttonUrl: 300 } as const

export const DEFAULT_ARTICLE_CTA: ArticleCta = Object.freeze({ enabled: false, heading: '', text: '', buttonLabel: '', buttonUrl: '' }) as ArticleCta

const CONTROL = /[\u0000-\u001f\u007f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g
const HAS_CONTROL = /[\u0000-\u001f\u007f\u200e\u200f\u202a-\u202e\u2066-\u2069]/

/** One line of plain text: no tags, no control or direction-override characters, single spaces, capped. */
export function cleanCtaText(input: unknown, max: number): string {
  if (typeof input !== 'string') return ''
  return input.replace(/<[^>]*>?/g, ' ').replace(CONTROL, ' ').replace(/\s+/g, ' ').trim().slice(0, max).trim()
}

/**
 * The button's address: https, a real host name, no user name, password or
 * port, no whitespace. A bare "example.co.il/contact" is read as https. Returns
 * null for anything else (javascript:, data:, http:, mailto:, a relative path).
 */
export function normalizeCtaUrl(input: unknown): string | null {
  if (typeof input !== 'string') return null
  const raw = input.trim()
  if (!raw || raw.length > CTA_LIMITS.buttonUrl || /[\s<>"'`\\]/.test(raw) || HAS_CONTROL.test(raw)) return null
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw) && !/^https:\/\//i.test(raw)) return null
  if (/^\/\//.test(raw) || /^\//.test(raw)) return null
  let url: URL
  try {
    url = new URL(/^https:\/\//i.test(raw) ? raw : `https://${raw}`)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return null
  const host = url.hostname.toLowerCase()
  // A public host name (URL has already turned an IDN into xn--): labels, a dot, a TLD that is not a number.
  if (host.length > 253 || !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9-]{2,63}$/.test(host) || /^\d+$/.test(host.split('.').pop() ?? '')) return null
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) return null
  const out = url.toString()
  return out.length <= CTA_LIMITS.buttonUrl ? out : null
}

/** A call to action that may be drawn: switched on, with a heading, a button label and a valid link. */
export function isCompleteCta(cta: ArticleCta | null | undefined): cta is ArticleCta {
  return !!cta && cta.enabled === true && !!cta.heading && !!cta.buttonLabel && normalizeCtaUrl(cta.buttonUrl) === cta.buttonUrl
}

/** A stored value (or anything) → a call to action. Lenient: whatever is not valid is off/empty. */
export function toArticleCta(value: unknown): ArticleCta {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ...DEFAULT_ARTICLE_CTA }
  const v = value as Record<string, unknown>
  const cta: ArticleCta = {
    enabled: v.enabled === true,
    heading: cleanCtaText(v.heading, CTA_LIMITS.heading),
    text: cleanCtaText(v.text, CTA_LIMITS.text),
    buttonLabel: cleanCtaText(v.buttonLabel ?? v.button_label, CTA_LIMITS.buttonLabel),
    buttonUrl: normalizeCtaUrl(v.buttonUrl ?? v.button_url) ?? '',
  }
  // Switched on but incomplete (or with a link that is no longer valid): off.
  return { ...cta, enabled: cta.enabled && isCompleteCta({ ...cta }) }
}

export type CtaField = 'heading' | 'text' | 'buttonLabel' | 'buttonUrl'
export type ParsedCta = { ok: true; cta: ArticleCta } | { ok: false; invalid: CtaField[] }

/**
 * A save from the card, checked strictly. Switched on, it needs a heading, a
 * button label and an https link; the text is optional. Switched off, the
 * texts are kept as a draft (so turning it on later finds them), but a link
 * that is not https is still refused: nothing unsafe is ever stored.
 */
export function parseArticleCtaInput(input: unknown): ParsedCta {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { ok: false, invalid: [] }
  const v = input as Record<string, unknown>
  if (typeof v.enabled !== 'boolean') return { ok: false, invalid: [] }
  const invalid: CtaField[] = []
  const text = (k: CtaField, max: number) => {
    const raw = v[k]
    if (raw !== undefined && typeof raw !== 'string') { invalid.push(k); return '' }
    const s = typeof raw === 'string' ? raw.trim() : ''
    if (s.length > max) invalid.push(k)
    return cleanCtaText(s, max)
  }
  const heading = text('heading', CTA_LIMITS.heading)
  const body = text('text', CTA_LIMITS.text)
  const buttonLabel = text('buttonLabel', CTA_LIMITS.buttonLabel)
  const rawUrl = typeof v.buttonUrl === 'string' ? v.buttonUrl.trim() : v.buttonUrl === undefined ? '' : null
  const buttonUrl = rawUrl ? normalizeCtaUrl(rawUrl) : rawUrl === '' ? '' : null
  if (buttonUrl === null) invalid.push('buttonUrl')
  if (v.enabled) {
    if (!heading && !invalid.includes('heading')) invalid.push('heading')
    if (!buttonLabel && !invalid.includes('buttonLabel')) invalid.push('buttonLabel')
    if (!buttonUrl && !invalid.includes('buttonUrl')) invalid.push('buttonUrl')
  }
  if (invalid.length) return { ok: false, invalid }
  return { ok: true, cta: { enabled: v.enabled, heading, text: body, buttonLabel, buttonUrl: buttonUrl ?? '' } }
}

export function sameArticleCta(a: ArticleCta, b: ArticleCta): boolean {
  return a.enabled === b.enabled && a.heading === b.heading && a.text === b.text && a.buttonLabel === b.buttonLabel && a.buttonUrl === b.buttonUrl
}

/** The stored JSON (snake_case, the migration's CHECK reads these keys). */
export function toCtaRow(cta: ArticleCta): Record<string, unknown> {
  return { enabled: cta.enabled, heading: cta.heading, text: cta.text, button_label: cta.buttonLabel, button_url: cta.buttonUrl }
}

/** The call to action a site receives: only a complete one that is on, and never on Shopify or Wix. */
export function siteCta(cta: ArticleCta | null | undefined, platform: DesignPlatform): ArticleCta | null {
  if (platform === 'shopify' || platform === 'wix') return null
  return isCompleteCta(cta) ? cta : null
}

export type CtaSuggestionCopy = { heading: string; headingGeneric: string; text: string; textGeneric: string; buttonLabel: string }

/**
 * The card's pre-filled suggestion, from the business details: the business's
 * name and line of business, and its own site's home page as the link. The
 * owner edits it; it stays off until they switch it on.
 */
export function suggestArticleCta(
  subject: { business?: string | null; niche?: string | null; domain?: string | null; contactUrl?: string | null },
  copy: CtaSuggestionCopy,
): ArticleCta {
  const business = cleanCtaText(subject.business ?? '', 40)
  const niche = cleanCtaText(subject.niche ?? '', 40)
  const put = (s: string) => s.replace(/\{business\}/g, business).replace(/\{niche\}/g, niche)
  const domain = String(subject.domain ?? '').trim().replace(/^https?:\/\//i, '').replace(/\/.*$/, '')
  return {
    enabled: false,
    heading: cleanCtaText(put(niche ? copy.heading : copy.headingGeneric), CTA_LIMITS.heading),
    text: cleanCtaText(put(business ? copy.text : copy.textGeneric), CTA_LIMITS.text),
    buttonLabel: cleanCtaText(copy.buttonLabel, CTA_LIMITS.buttonLabel),
    // The contact page when the site map shows one (a button to "contact us" should go there), else the home page.
    buttonUrl: (subject.contactUrl && normalizeCtaUrl(subject.contactUrl)) || (domain && normalizeCtaUrl(`https://${domain}/`)) || '',
  }
}

const CONTACT_PATH = /(^|\/)(contact|contact-us|contactus|contact_us|צור-קשר|צרו-קשר|צור_קשר|צרו_קשר|צור קשר|צרו קשר)(\/|$)/i

/**
 * The site's contact page, from the page addresses the full-site mapping found: a page whose path is
 * "contact" or "contact us" (or its Hebrew form), the shortest path first. Null when none is known. Pure.
 */
export function findContactUrl(entries: readonly { u?: unknown }[] | null | undefined, domain?: string | null): string | null {
  const host = String(domain ?? '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '')
  let best: string | null = null
  for (const e of entries ?? []) {
    if (!e || typeof e.u !== 'string') continue
    let url: URL
    try { url = new URL(e.u) } catch { continue }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') continue
    // Only a page of this project's own site.
    if (host && url.hostname.toLowerCase().replace(/^www\./, '') !== host) continue
    let path: string
    try { path = decodeURIComponent(url.pathname) } catch { path = url.pathname }
    if (!CONTACT_PATH.test(path)) continue
    if (best === null || path.length < new URL(best).pathname.length) best = `${url.origin}${url.pathname}`
  }
  return best
}
