/**
 * The allowed-fix whitelist, enforced. `validateFix` is the ONLY way a request
 * body becomes a FixPayload: an unknown type, an extra field, markup where plain
 * text belongs, an address off the project's own site, a schema type we do not
 * write, or a value out of bounds is refused with a stable code before anything
 * is stored or sent.
 *
 * The WordPress plugin repeats these checks on its side (it never trusts the
 * app alone); the QA suite runs both against the same cases.
 */
import { domainKey, normalizeCheckUrl } from '@/lib/free-check'
import { FIX_TYPES, type FaqItem, type FixErrorCode, type FixPayload, type FixType } from './types'

export const LIMITS = {
  title: { min: 1, max: 120 },
  description: { min: 1, max: 320 },
  focus: { min: 2, max: 100 },
  alt: { min: 1, max: 150 },
  altImages: 20,
  faqItems: { min: 1, max: 8 },
  faqQuestion: { min: 5, max: 200 },
  faqAnswer: { min: 10, max: 1200 },
  faqHeading: { min: 2, max: 80 },
  anchor: { min: 2, max: 80 },
  url: 2048,
  schemaChars: 16000,
  schemaDepth: 8,
} as const

/** The schema.org types the fix writes. No Product (prices and products are never touched), no Offer, no Review. */
export const SCHEMA_TYPES = [
  'Organization', 'LocalBusiness', 'WebSite', 'WebPage', 'AboutPage', 'ContactPage', 'Article', 'BlogPosting',
  'NewsArticle', 'FAQPage', 'BreadcrumbList', 'Person', 'Service', 'Question', 'Answer', 'ListItem', 'PostalAddress',
  'ImageObject', 'SearchAction', 'EntryPoint', 'ContactPoint',
] as const

type Ok = { ok: true; payload: FixPayload }
type Bad = { ok: false; code: FixErrorCode }
const bad = (code: FixErrorCode): Bad => ({ ok: false, code })

/** Plain text on one line: whitespace collapsed, no markup characters. */
export function plain(v: unknown): string {
  return String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim()
}
const hasMarkup = (s: string) => /[<>]/.test(s)
const within = (s: string, r: { min: number; max: number }) => s.length >= r.min && s.length <= r.max

/** The site key (host without www) of an http(s) address, or null. */
export function siteKeyOf(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length > LIMITS.url) return null
  const t = raw.trim()
  if (!/^https?:\/\//i.test(t)) return null
  const u = normalizeCheckUrl(t)
  return u.ok ? domainKey(u.url) : null
}

/** An absolute http(s) address on one of the project's own hosts. */
export function onSite(raw: unknown, siteKeys: ReadonlySet<string>): string | null {
  const key = siteKeyOf(raw)
  return key && siteKeys.has(key) ? String(raw).trim() : null
}

const KEYS: Record<FixType, readonly string[]> = {
  seo_title: ['value'],
  meta_description: ['value'],
  canonical: ['value'],
  focus_keyphrase: ['value'],
  image_alt: ['images'],
  faq_block: ['items', 'heading'],
  schema_jsonld: ['schema'],
  broken_link: ['href', 'replacement'],
  internal_link: ['target', 'anchor'],
}

function schemaNodeOk(node: unknown, depth: number, budget: { n: number }): boolean {
  if (depth > LIMITS.schemaDepth || ++budget.n > 400) return false
  if (node === null || typeof node === 'number' || typeof node === 'boolean') return true
  if (typeof node === 'string') return node.length <= 2000 && !hasMarkup(node)
  if (Array.isArray(node)) return node.length <= 50 && node.every((x) => schemaNodeOk(x, depth + 1, budget))
  if (typeof node !== 'object') return false
  for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
    if (k.length > 64 || !/^@?[A-Za-z][A-Za-z0-9_]*$/.test(k)) return false
    if (k === '@type') {
      const types = Array.isArray(v) ? v : [v]
      if (!types.every((t) => typeof t === 'string' && (SCHEMA_TYPES as readonly string[]).includes(t))) return false
      continue
    }
    if (!schemaNodeOk(v, depth + 1, budget)) return false
  }
  return true
}

/** A JSON-LD object we are willing to print on the merchant's page. */
export function validSchema(schema: unknown): schema is Record<string, unknown> {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return false
  const s = schema as Record<string, unknown>
  if (s['@context'] !== 'https://schema.org' && s['@context'] !== 'http://schema.org') return false
  const nodes = Array.isArray(s['@graph']) ? (s['@graph'] as unknown[]) : [s]
  if (nodes.length === 0 || !nodes.every((n) => n && typeof n === 'object' && '@type' in (n as object))) return false
  let text: string
  try { text = JSON.stringify(s) } catch { return false }
  if (text.length > LIMITS.schemaChars) return false
  return schemaNodeOk(s, 0, { n: 0 })
}

/**
 * A request body's fix, validated against the whitelist and the project's own
 * hosts. `page` is the page that is written to; it too must be on the site.
 */
export function validateFix(input: unknown, page: unknown, siteKeys: ReadonlySet<string>): Ok | Bad {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return bad('invalid_request')
  const b = input as Record<string, unknown>
  const type = b.type as FixType
  if (!(FIX_TYPES as readonly string[]).includes(String(type))) return bad('not_allowed')
  // No field beyond the type's own: nothing rides along with an approval.
  const extra = Object.keys(b).filter((k) => k !== 'type' && !KEYS[type].includes(k))
  if (extra.length > 0) return bad('not_allowed')
  if (!onSite(page, siteKeys)) return bad('off_site')

  switch (type) {
    case 'seo_title':
    case 'meta_description':
    case 'focus_keyphrase': {
      const raw = typeof b.value === 'string' ? b.value : ''
      if (hasMarkup(raw)) return bad('value_invalid')
      const v = plain(raw)
      const r = type === 'seo_title' ? LIMITS.title : type === 'meta_description' ? LIMITS.description : LIMITS.focus
      return within(v, r) ? { ok: true, payload: { type, value: v } } : bad('value_invalid')
    }
    case 'canonical': {
      const v = onSite(b.value, siteKeys)
      if (!v) return typeof b.value === 'string' && siteKeyOf(b.value) ? bad('off_site') : bad('value_invalid')
      return { ok: true, payload: { type, value: v } }
    }
    case 'image_alt': {
      if (!Array.isArray(b.images) || b.images.length === 0 || b.images.length > LIMITS.altImages) return bad('value_invalid')
      const images: { src: string; alt: string }[] = []
      for (const i of b.images as unknown[]) {
        const x = (i ?? {}) as Record<string, unknown>
        if (Object.keys(x).some((k) => k !== 'src' && k !== 'alt')) return bad('not_allowed')
        const src = typeof x.src === 'string' ? x.src.trim() : ''
        const rawAlt = typeof x.alt === 'string' ? x.alt : ''
        if (!src || src.length > LIMITS.url || /["<>\s]/.test(src) || /^(javascript|data|vbscript):/i.test(src)) return bad('value_invalid')
        if (hasMarkup(rawAlt) || rawAlt.includes('"')) return bad('value_invalid')
        const alt = plain(rawAlt)
        if (!within(alt, LIMITS.alt)) return bad('value_invalid')
        images.push({ src, alt })
      }
      return { ok: true, payload: { type, images } }
    }
    case 'faq_block': {
      if (!Array.isArray(b.items)) return bad('value_invalid')
      const items: FaqItem[] = []
      for (const i of b.items as unknown[]) {
        const x = (i ?? {}) as Record<string, unknown>
        if (Object.keys(x).some((k) => k !== 'q' && k !== 'a')) return bad('not_allowed')
        const rq = typeof x.q === 'string' ? x.q : ''
        const ra = typeof x.a === 'string' ? x.a : ''
        if (hasMarkup(rq) || hasMarkup(ra)) return bad('value_invalid')
        const q = plain(rq)
        const a = plain(ra)
        if (!q && !a) continue
        if (!within(q, LIMITS.faqQuestion) || !within(a, LIMITS.faqAnswer)) return bad('value_invalid')
        items.push({ q, a })
      }
      if (items.length < LIMITS.faqItems.min || items.length > LIMITS.faqItems.max) return bad('value_invalid')
      const rawHeading = typeof b.heading === 'string' ? b.heading : ''
      if (hasMarkup(rawHeading)) return bad('value_invalid')
      const heading = plain(rawHeading)
      if (!within(heading, LIMITS.faqHeading)) return bad('value_invalid')
      return { ok: true, payload: { type, heading, items } }
    }
    case 'schema_jsonld':
      return validSchema(b.schema) ? { ok: true, payload: { type, schema: b.schema as Record<string, unknown> } } : bad('value_invalid')
    case 'broken_link': {
      const href = onSite(b.href, siteKeys)
      if (!href) return bad('off_site')
      if (b.replacement === null || b.replacement === undefined || b.replacement === '') return { ok: true, payload: { type, href, replacement: null } }
      const replacement = onSite(b.replacement, siteKeys)
      if (!replacement) return bad('off_site')
      if (replacement === href) return bad('value_invalid')
      return { ok: true, payload: { type, href, replacement } }
    }
    case 'internal_link': {
      const target = onSite(b.target, siteKeys)
      if (!target) return bad('off_site')
      const raw = typeof b.anchor === 'string' ? b.anchor : ''
      if (hasMarkup(raw)) return bad('value_invalid')
      const anchor = plain(raw)
      return within(anchor, LIMITS.anchor) ? { ok: true, payload: { type, target, anchor } } : bad('value_invalid')
    }
  }
}

/** The one-line "after" the queue shows for a job. */
export function summaryOf(p: FixPayload): string {
  switch (p.type) {
    case 'seo_title':
    case 'meta_description':
    case 'canonical':
    case 'focus_keyphrase':
      return p.value
    case 'image_alt':
      return p.images.map((i) => i.alt).join(' · ').slice(0, 4000)
    case 'faq_block':
      return p.items.map((i) => i.q).join(' · ').slice(0, 4000)
    case 'schema_jsonld': {
      const nodes = Array.isArray(p.schema['@graph']) ? (p.schema['@graph'] as Record<string, unknown>[]) : [p.schema]
      return nodes.map((n) => String(n['@type'] ?? '')).join(' + ')
    }
    case 'broken_link':
      return p.replacement ?? ''
    case 'internal_link':
      return p.anchor
  }
}

/** The payload without its type: what is stored in `site_fix_jobs.payload` and sent as `value`. */
export function valueOf(p: FixPayload): Record<string, unknown> {
  const { type: _type, ...rest } = p
  void _type
  return rest
}

/** Rebuild a FixPayload from a stored job (the stored value was validated when it was approved). */
export function payloadFromJob(type: FixType, stored: Record<string, unknown>): FixPayload {
  return { type, ...stored } as FixPayload
}
