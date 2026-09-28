/**
 * JSON-LD for a generated article: one pure builder, used by the article
 * viewer's Schema tab and by the signed webhook payload.
 *
 *   BlogPosting (or Article) — headline, description, image, dates, author,
 *                              publisher, mainEntityOfPage, inLanguage.
 *   FAQPage                  — from the article's stored FAQ pairs (faq_json),
 *                              only when at least one complete pair exists.
 *
 * What this markup is and is not: it tells search engines and AI assistants
 * what the page is. Since August 2023 Google shows FAQ rich results only for a
 * small set of authoritative government and health sites, so nothing here may
 * be presented as a promise of a special display in Google.
 *
 * Every value comes from fields the article already has. Nothing is invented:
 * a missing field is left out, never filled with a placeholder.
 *
 * No I/O, no React, no server imports: the browser bundle and the webhook
 * builder share it.
 */

export type JsonLd = Record<string, unknown>

export interface StructuredDataFaq { question: string; answer: string }

export interface StructuredDataInput {
  headline: string
  description?: string | null
  imageUrl?: string | null
  datePublished?: string | null
  dateModified?: string | null
  /** The article's live URL. Unknown before publishing (and for a webhook). */
  url?: string | null
  /** 'he' | 'en' (anything else is passed through when it looks like a BCP 47 tag). */
  language?: string | null
  /** The business behind the site. Used as publisher and, as an Organization, as author. */
  publisher?: { name: string | null; url?: string | null } | null
  faq?: StructuredDataFaq[] | null
  type?: 'BlogPosting' | 'Article'
}

/** Google truncates longer headlines; the schema.org value is kept to 110 characters. */
export const HEADLINE_MAX = 110
const DESCRIPTION_MAX = 300
const FAQ_MAX = 20

const collapse = (s: unknown): string => String(s ?? '').replace(/\s+/g, ' ').trim()

/** Plain text of a possibly-HTML string (FAQ answers may carry inline markup). */
export function plainText(s: unknown): string {
  return collapse(
    String(s ?? '')
      .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'"),
  )
}

function clip(s: string, max: number): string {
  if (s.length <= max) return s
  const cut = s.slice(0, max - 1)
  const space = cut.lastIndexOf(' ')
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trim()}…`
}

/** An absolute https URL, or null. Nothing else may reach a JSON-LD url field. */
export function httpsUrl(u: unknown): string | null {
  const s = String(u ?? '').trim()
  if (!s || s.length > 2048) return null
  try {
    const parsed = new URL(s)
    return parsed.protocol === 'https:' ? parsed.toString() : null
  } catch {
    return null
  }
}

/** A site URL from a stored domain ("shop.com", "https://shop.com/") — https only. */
export function siteUrlFromDomain(domain: unknown): string | null {
  const s = collapse(domain)
  if (!s) return null
  return httpsUrl(/^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : `https://${s}`)
}

function isoDate(d: unknown): string | null {
  if (!d) return null
  const t = new Date(String(d))
  return Number.isNaN(t.getTime()) ? null : t.toISOString()
}

function languageTag(l: unknown): string | null {
  const s = collapse(l).toLowerCase()
  if (!s) return null
  if (s.startsWith('he') || s === 'iw') return 'he'
  if (s.startsWith('en')) return 'en'
  return /^[a-z]{2,3}(-[a-z0-9]{2,8})*$/.test(s) ? s : null
}

/** The FAQ pairs that can be marked up: both sides non-empty after stripping markup. */
export function validFaqPairs(faq: StructuredDataFaq[] | null | undefined): StructuredDataFaq[] {
  if (!Array.isArray(faq)) return []
  const out: StructuredDataFaq[] = []
  const seen = new Set<string>()
  for (const f of faq) {
    const question = plainText(f?.question)
    const answer = plainText(f?.answer)
    if (!question || !answer) continue
    const key = question.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ question, answer })
    if (out.length >= FAQ_MAX) break
  }
  return out
}

/** The article block alone. Returns null when there is no headline to mark up. */
export function buildArticleJsonLd(input: StructuredDataInput): JsonLd | null {
  const headline = clip(plainText(input.headline), HEADLINE_MAX)
  if (!headline) return null
  const out: JsonLd = {
    '@context': 'https://schema.org',
    '@type': input.type === 'Article' ? 'Article' : 'BlogPosting',
    headline,
  }
  const description = clip(plainText(input.description), DESCRIPTION_MAX)
  if (description) out.description = description
  const image = httpsUrl(input.imageUrl)
  if (image) out.image = [image]
  const published = isoDate(input.datePublished)
  if (published) out.datePublished = published
  const modified = isoDate(input.dateModified)
  if (modified) out.dateModified = modified
  const lang = languageTag(input.language)
  if (lang) out.inLanguage = lang
  const publisherName = collapse(input.publisher?.name)
  if (publisherName) {
    const org: JsonLd = { '@type': 'Organization', name: publisherName }
    const site = siteUrlFromDomain(input.publisher?.url)
    if (site) org.url = site
    out.author = org
    out.publisher = org
  }
  const url = httpsUrl(input.url)
  if (url) {
    out.url = url
    out.mainEntityOfPage = { '@type': 'WebPage', '@id': url }
  }
  return out
}

/** The FAQPage block, or null when the article has no complete FAQ pair. */
export function buildFaqJsonLd(faq: StructuredDataFaq[] | null | undefined, language?: string | null): JsonLd | null {
  const pairs = validFaqPairs(faq)
  if (pairs.length === 0) return null
  const out: JsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: pairs.map((p) => ({
      '@type': 'Question',
      name: p.question,
      acceptedAnswer: { '@type': 'Answer', text: p.answer },
    })),
  }
  const lang = languageTag(language)
  if (lang) out.inLanguage = lang
  return out
}

/** Every block for the article, article first. */
export function buildStructuredData(input: StructuredDataInput): JsonLd[] {
  const out: JsonLd[] = []
  const article = buildArticleJsonLd(input)
  if (article) out.push(article)
  const faq = buildFaqJsonLd(input.faq, input.language)
  if (faq) out.push(faq)
  return out
}

/**
 * JSON safe to place inside <script type="application/ld+json">. `<` is written
 * as <, so no value can close the script element (`</script`) or open an
 * HTML comment; `>` and `&` are escaped for the same reason, and the two line
 * separators JavaScript treats as newlines are escaped too. The result parses
 * back to exactly the same value.
 */
export function serializeJsonLd(block: JsonLd, pretty = false): string {
  return JSON.stringify(block, null, pretty ? 2 : undefined)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}

/** The blocks as script elements, ready to paste into a page's <head>. */
export function toScriptTags(blocks: JsonLd[], pretty = true): string {
  return blocks.map((b) => `<script type="application/ld+json">\n${serializeJsonLd(b, pretty)}\n</script>`).join('\n')
}
