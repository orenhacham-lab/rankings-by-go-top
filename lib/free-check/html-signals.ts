/**
 * Deterministic signals read off a real page — no model involved.
 *
 * Everything the results screen calls a FINDING comes from here, so that the
 * claim "we actually read your site, we don't guess" is literally true. The
 * model's job (business-insight.ts) is confined to interpretation: what the
 * business is, which keywords to chase, which articles to write.
 *
 * Parsing is regex-based on purpose: the app has no DOM/parser dependency, the
 * input is hostile and possibly truncated mid-tag, and every signal we need is
 * a presence/absence question rather than a tree walk. Each extractor is
 * written to fail to "absent" rather than to throw.
 */

/** A `<script type="application/ld+json">` payload, parsed if it parses. */
type JsonLdNode = Record<string, unknown>

export type SiteSignals = {
  finalUrl: string
  /** `lang` attribute of <html>, lowercased, or null. */
  htmlLang: string | null
  title: string | null
  metaDescription: string | null
  canonical: string | null
  h1: string[]
  h2: string[]
  images: { total: number; missingAlt: number }
  /** Distinct @type values found across all JSON-LD blocks. */
  schemaTypes: string[]
  hasOrganizationSchema: boolean
  hasFaqSchema: boolean
  /** A visible Q&A block: FAQ schema, or several question-shaped headings. */
  hasFaqSection: boolean
  wordCount: number
  /** Plain text of the page, capped — the only thing handed to the model. */
  text: string
  internalLinks: number
  /** Unique internal URLs seen on the page, capped — a seeding scan's starting set. */
  internalLinkUrls: string[]
  externalDomains: string[]
  /** Postal address and phone as the page's own JSON-LD states them, never guessed. */
  contact: { address: string | null; phone: string | null }
  /**
   * The CMS/commerce platform, read off the markup rather than inferred. null
   * when the page gives nothing away — a caller may then ask the model, but a
   * deterministic answer always wins.
   */
  platform: string | null
  viewportMeta: boolean
  openGraph: boolean
  /** robots.txt as fetched: null when it does not exist. */
  robotsTxt: string | null
  llmsTxt: boolean
}

const QUESTION_MARKERS = [
  'איך', 'מה ', 'מהו', 'מהי', 'למה', 'כמה', 'מתי', 'האם', 'איפה', 'שאלות נפוצות',
  'how ', 'what ', 'why ', 'when ', 'where ', 'which ', 'faq', 'frequently asked',
]

/**
 * WHY THIS FILE AVOIDS REGEXES FOR MARKUP.
 *
 * Every pattern here would run over a document the site under check chooses,
 * up to the 1.5 MB fetch cap, on a public route. Two shapes are quadratic on
 * markup that never closes what it opens, and both were measured on this file's
 * own expressions before they were replaced:
 *
 *   /<!--[\s\S]*?-->/g   on unclosed comments: 200 KB took 3.0 s
 *   /<img\b[^>]*>/gi     on tags with no '>':  200 KB took 6.3 s
 *
 * In each case the scan runs to the end of the input from every occurrence and
 * then fails, so the cost is quadratic in the body size — 1.5 MB never finished
 * in a three-minute probe. indexOf cannot backtrack, so the helpers below do
 * the same work at the same cost on hostile and well-formed markup alike.
 */

/** True for a character that can continue an HTML tag name. */
function isNameChar(code: number): boolean {
  return (code >= 97 && code <= 122) || (code >= 48 && code <= 57) || code === 45 || code === 58 || code === 95
}

/** How many tags of one name we collect from a document. Far above any real page. */
const MAX_TAGS_SCANNED = 4_000

/**
 * Every `<tag …>` opening tag, in document order, as raw strings. The character
 * after the name is checked so `<a` does not match `<abbr`, the way `\b` did.
 */
function openTags(html: string, tag: string): string[] {
  const out: string[] = []
  const hay = html.toLowerCase()
  const needle = `<${tag.toLowerCase()}`
  let i = 0
  while (out.length < MAX_TAGS_SCANNED) {
    const at = hay.indexOf(needle, i)
    if (at < 0) break
    i = at + needle.length
    if (isNameChar(hay.charCodeAt(i))) continue
    const close = hay.indexOf('>', i)
    if (close < 0) break
    out.push(html.slice(at, close + 1))
    i = close + 1
  }
  return out
}

/**
 * The content of the first `<tag …>…</tag>`, or null. An element the document
 * opens and never closes yields null rather than the rest of the file.
 */
function firstElement(html: string, tag: string): string | null {
  const hay = html.toLowerCase()
  const needle = `<${tag.toLowerCase()}`
  let i = 0
  while (true) {
    const at = hay.indexOf(needle, i)
    if (at < 0) return null
    i = at + needle.length
    if (isNameChar(hay.charCodeAt(i))) continue
    const open = hay.indexOf('>', i)
    if (open < 0) return null
    const end = hay.indexOf(`</${tag.toLowerCase()}`, open + 1)
    if (end < 0) return null
    return html.slice(open + 1, end)
  }
}

/**
 * Replace every `<tag …>…</tag>` with a space, including an unclosed one.
 *
 * One pass over one lowercased copy. Re-lowercasing the document per element
 * would be quadratic in the NUMBER of elements, which a page with a few hundred
 * script tags reaches on its own — a different shape of the same bug.
 */
function dropElements(html: string, tag: string): string {
  const hay = html.toLowerCase()
  const needle = `<${tag}`
  if (!hay.includes(needle)) return html
  const parts: string[] = []
  let kept = 0
  let i = 0
  while (true) {
    const at = hay.indexOf(needle, i)
    if (at < 0) break
    const nameEnd = at + needle.length
    if (isNameChar(hay.charCodeAt(nameEnd))) { i = nameEnd; continue }
    const open = hay.indexOf('>', nameEnd)
    const end = open < 0 ? -1 : hay.indexOf(`</${tag}`, open + 1)
    // A tag the document never closes: nothing after it is markup we can read.
    if (end < 0) {
      parts.push(html.slice(kept, at), ' ')
      return parts.join('')
    }
    const endClose = hay.indexOf('>', end)
    const cut = endClose < 0 ? hay.length : endClose + 1
    parts.push(html.slice(kept, at), ' ')
    kept = cut
    i = cut
  }
  parts.push(html.slice(kept))
  return parts.join('')
}

/** Replace every `<!-- … -->` with a space. An unterminated one ends the document. */
function dropComments(html: string): string {
  if (!html.includes('<!--')) return html
  let out = ''
  let i = 0
  while (true) {
    const at = html.indexOf('<!--', i)
    if (at < 0) return out + html.slice(i)
    const end = html.indexOf('-->', at + 4)
    // Browsers treat an unterminated comment as swallowing the rest, and so do we.
    if (end < 0) return `${out}${html.slice(i, at)} `
    out += `${html.slice(i, at)} `
    i = end + 3
  }
}

function stripNoise(html: string): string {
  let out = html
  for (const tag of ['script', 'style', 'noscript']) out = dropElements(out, tag)
  return dropComments(out)
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&[#a-z0-9]+;/gi, ' ')
}

/** Drop every tag. Same reason as above: `/<[^>]*>/g` is quadratic without a '>'. */
function stripTags(fragment: string): string {
  if (!fragment.includes('<')) return fragment
  let out = ''
  let i = 0
  while (true) {
    const at = fragment.indexOf('<', i)
    if (at < 0) return out + fragment.slice(i)
    const close = fragment.indexOf('>', at + 1)
    if (close < 0) return `${out}${fragment.slice(i, at)} `
    out += `${fragment.slice(i, at)} `
    i = close + 1
  }
}

function textOf(fragment: string): string {
  return decodeEntities(stripTags(fragment)).replace(/\s+/g, ' ').trim()
}

/** All values of an attribute on tags matching `tag`, in document order. */
function attrValues(html: string, tag: string, attr: string): string[] {
  const out: string[] = []
  const tags = openTags(html, tag)
  const attrRe = new RegExp(`\\b${attr}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s">]+))`, 'i')
  for (const t of tags) {
    const m = t.match(attrRe)
    if (m) out.push((m[2] ?? m[3] ?? m[4] ?? '').trim())
  }
  return out
}

/** Content of a `<meta name="x">` / `<meta property="x">`, first match wins. */
function metaContent(html: string, key: string): string | null {
  const tags = openTags(html, 'meta')
  for (const t of tags) {
    const nameM = t.match(/\b(?:name|property)\s*=\s*("([^"]*)"|'([^']*)'|([^\s">]+))/i)
    const name = (nameM?.[2] ?? nameM?.[3] ?? nameM?.[4] ?? '').trim().toLowerCase()
    if (name !== key.toLowerCase()) continue
    const cM = t.match(/\bcontent\s*=\s*("([^"]*)"|'([^']*)'|([^\s">]+))/i)
    const content = decodeEntities(cM?.[2] ?? cM?.[3] ?? cM?.[4] ?? '').trim()
    return content || null
  }
  return null
}

function headings(html: string, tag: 'h1' | 'h2'): string[] {
  const out: string[] = []
  const hay = html.toLowerCase()
  let i = 0
  while (out.length < 40) {
    const at = hay.indexOf(`<${tag}`, i)
    if (at < 0) break
    const nameEnd = at + tag.length + 1
    i = nameEnd
    if (isNameChar(hay.charCodeAt(nameEnd))) continue
    const open = hay.indexOf('>', nameEnd)
    if (open < 0) break
    const end = hay.indexOf(`</${tag}`, open + 1)
    if (end < 0) break
    i = end + 1
    const t = textOf(html.slice(open + 1, end))
    if (t) out.push(t.slice(0, 200))
  }
  return out
}

/** Flatten a JSON-LD payload (objects, arrays, @graph) into its nodes. */
function flattenJsonLd(value: unknown, into: JsonLdNode[], depth = 0): void {
  if (depth > 6 || into.length > 200 || value == null) return
  if (Array.isArray(value)) {
    for (const v of value) flattenJsonLd(v, into, depth + 1)
    return
  }
  if (typeof value !== 'object') return
  const node = value as JsonLdNode
  into.push(node)
  if ('@graph' in node) flattenJsonLd(node['@graph'], into, depth + 1)
}

function jsonLdNodes(html: string): JsonLdNode[] {
  const nodes: JsonLdNode[] = []
  const hay = html.toLowerCase()
  let i = 0
  let read = 0
  while (read < 50) {
    const at = hay.indexOf('<script', i)
    if (at < 0) break
    const nameEnd = at + '<script'.length
    i = nameEnd
    if (isNameChar(hay.charCodeAt(nameEnd))) continue
    const open = hay.indexOf('>', nameEnd)
    if (open < 0) break
    const end = hay.indexOf('</script', open + 1)
    if (end < 0) break
    i = end + 1
    if (!/type\s*=\s*["']?application\/ld\+json/i.test(hay.slice(nameEnd, open))) continue
    read += 1
    try {
      flattenJsonLd(JSON.parse(html.slice(open + 1, end).trim()), nodes)
    } catch {
      // A malformed block is simply not a signal; never fail the whole check.
    }
  }
  return nodes
}

function typesOf(nodes: JsonLdNode[]): string[] {
  const types = new Set<string>()
  for (const n of nodes) {
    const t = n['@type']
    if (typeof t === 'string') types.add(t)
    else if (Array.isArray(t)) for (const x of t) if (typeof x === 'string') types.add(x)
  }
  return [...types]
}

const ORGANIZATION_TYPES = new Set([
  'Organization', 'LocalBusiness', 'Store', 'OnlineStore', 'Corporation', 'Restaurant',
  'MedicalBusiness', 'ProfessionalService', 'Dentist', 'LegalService', 'HomeAndConstructionBusiness',
  'WebSite', 'Person',
])

/**
 * Platform fingerprints, most specific first. Each is a marker the platform
 * itself emits — an asset host, a generator meta, a global it defines — so a
 * match is evidence rather than a guess. WooCommerce is checked before
 * WordPress because every WooCommerce site is also a WordPress site and the
 * commerce answer is the more useful one.
 */
const PLATFORM_FINGERPRINTS: { name: string; patterns: RegExp[] }[] = [
  { name: 'Shopify', patterns: [/cdn\.shopify\.com/i, /Shopify\.theme/i, /myshopify\.com/i, /shopify-features/i] },
  { name: 'Wix', patterns: [/static\.wixstatic\.com/i, /wix-?code/i, /<meta[^>]{1,200}generator["'][^>]{0,200}Wix\.com/i] },
  { name: 'Squarespace', patterns: [/squarespace\.com/i, /Static\.SQUARESPACE_CONTEXT/i] },
  { name: 'Webflow', patterns: [/assets\.website-files\.com/i, /webflow\.js/i, /data-wf-page/i] },
  { name: 'WooCommerce', patterns: [/woocommerce[-.]/i, /wc-ajax/i, /generator["'][^>]{0,200}WooCommerce/i] },
  { name: 'Magento', patterns: [/\/static\/version\d+\/frontend\//i, /Magento_/i, /mage\/cookies/i] },
  { name: 'Duda', patterns: [/irp\.cdn-website\.com/i, /dmws\./i] },
  { name: 'Joomla', patterns: [/generator["'][^>]{0,200}Joomla/i, /\/media\/jui\//i] },
  { name: 'Drupal', patterns: [/generator["'][^>]{0,200}Drupal/i, /\/sites\/default\/files\//i, /drupal-settings-json/i] },
  { name: 'WordPress', patterns: [/wp-content\//i, /wp-includes\//i, /generator["'][^>]{0,200}WordPress/i, /wp-json/i] },
]

/**
 * The platform, read off the raw markup. Returns null rather than a low-
 * confidence guess: an empty answer is honest and the caller can fall back.
 */
export function detectPlatform(html: string): string | null {
  const head = html.slice(0, 400_000)
  for (const { name, patterns } of PLATFORM_FINGERPRINTS) {
    if (patterns.some((re) => re.test(head))) return name
  }
  return null
}

/** Flatten a JSON-LD PostalAddress into one line, in the order it reads. */
function addressLine(value: unknown): string | null {
  if (typeof value === 'string') return value.trim().slice(0, 200) || null
  if (!value || typeof value !== 'object') return null
  const a = value as Record<string, unknown>
  const parts = ['streetAddress', 'addressLocality', 'addressRegion', 'postalCode', 'addressCountry']
    .map((k) => (typeof a[k] === 'string' ? (a[k] as string).trim() : ''))
    .filter(Boolean)
  return parts.length ? parts.join(', ').slice(0, 200) : null
}

const CONTACT_TYPES = new Set([...ORGANIZATION_TYPES])

/**
 * Address and phone AS THE SITE STATES THEM in JSON-LD. Only structured data is
 * read — scraping a phone number out of body text produces fax numbers, order
 * hotlines and tracking IDs, and a wrong business phone is worse than none.
 */
function extractContact(nodes: JsonLdNode[]): { address: string | null; phone: string | null } {
  let address: string | null = null
  let phone: string | null = null
  for (const n of nodes) {
    const t = n['@type']
    const types = typeof t === 'string' ? [t] : Array.isArray(t) ? t.filter((x): x is string => typeof x === 'string') : []
    if (!types.some((x) => CONTACT_TYPES.has(x))) continue
    if (!address) address = addressLine(n.address)
    if (!phone && typeof n.telephone === 'string') phone = n.telephone.trim().slice(0, 40) || null
    if (address && phone) break
  }
  return { address, phone }
}

/** How many internal URLs a caller gets back — enough to seed, small enough to store. */
export const MAX_INTERNAL_LINK_URLS = 50

export function extractSiteSignals(
  html: string,
  finalUrl: string,
  extras: { robotsTxt: string | null; llmsTxt: boolean },
): SiteSignals {
  const clean = stripNoise(html)
  const head = clean.slice(0, 200_000)

  const titleInner = firstElement(head, 'title')
  const title = titleInner === null ? null : textOf(titleInner).slice(0, 300) || null

  const htmlTag = openTags(html, 'html')[0]
  const langM = htmlTag?.match(/\blang\s*=\s*("([^"]*)"|'([^']*)'|([^\s">]+))/i)
  const htmlLang = (langM?.[2] ?? langM?.[3] ?? langM?.[4] ?? '').trim().toLowerCase() || null

  const canonicalTag = openTags(head, 'link').find((t) => /\brel\s*=\s*["']?canonical/i.test(t))
  const canonHref = canonicalTag?.match(/\bhref\s*=\s*("([^"]*)"|'([^']*)'|([^\s">]+))/i)
  const canonical = (canonHref?.[2] ?? canonHref?.[3] ?? canonHref?.[4] ?? '').trim() || null

  const imgAlts = attrValues(clean, 'img', 'alt')
  const imgTotal = (clean.match(/<img\b/gi) ?? []).length
  const missingAlt = Math.max(0, imgTotal - imgAlts.filter((a) => a.trim().length > 0).length)

  const nodes = jsonLdNodes(html)
  const schemaTypes = typesOf(nodes)
  const hasFaqSchema = schemaTypes.some((t) => t === 'FAQPage' || t === 'QAPage')

  const h1 = headings(clean, 'h1')
  const h2 = headings(clean, 'h2')
  const questionHeadings = [...h1, ...h2].filter((t) => {
    const low = t.toLowerCase()
    return t.includes('?') || QUESTION_MARKERS.some((q) => low.includes(q))
  })

  let internalLinks = 0
  const internalLinkUrls = new Set<string>()
  const externalDomains = new Set<string>()
  let base: URL | null = null
  try { base = new URL(finalUrl) } catch { base = null }
  for (const href of attrValues(clean, 'a', 'href')) {
    if (!href || href.startsWith('#') || /^(mailto|tel|javascript):/i.test(href)) continue
    if (!base) continue
    try {
      const u = new URL(href, base)
      if (u.hostname === base.hostname) {
        internalLinks++
        if (internalLinkUrls.size < MAX_INTERNAL_LINK_URLS) {
          u.hash = ''
          internalLinkUrls.add(u.toString())
        }
      }
      else if (u.protocol === 'http:' || u.protocol === 'https:') externalDomains.add(u.hostname.replace(/^www\./, ''))
    } catch {
      // An unparseable href is not a link we can classify.
    }
  }

  const bodyInner = firstElement(clean, 'body')
  const text = textOf(bodyInner ?? clean).slice(0, 20_000)
  const wordCount = text ? text.split(/\s+/).filter(Boolean).length : 0

  return {
    finalUrl,
    htmlLang,
    title,
    metaDescription: metaContent(head, 'description'),
    canonical,
    h1,
    h2,
    images: { total: imgTotal, missingAlt },
    schemaTypes,
    hasOrganizationSchema: schemaTypes.some((t) => ORGANIZATION_TYPES.has(t)),
    hasFaqSchema,
    hasFaqSection: hasFaqSchema || questionHeadings.length >= 3,
    wordCount,
    text,
    internalLinks,
    internalLinkUrls: [...internalLinkUrls],
    externalDomains: [...externalDomains].slice(0, 30),
    contact: extractContact(nodes),
    platform: detectPlatform(html),
    viewportMeta: metaContent(head, 'viewport') !== null,
    openGraph: metaContent(head, 'og:title') !== null || metaContent(head, 'og:description') !== null,
    robotsTxt: extras.robotsTxt,
    llmsTxt: extras.llmsTxt,
  }
}

/** The AI crawlers whose access decides the "AI answer readiness" tile. */
export const AI_BOTS = ['gptbot', 'oai-searchbot', 'chatgpt-user', 'perplexitybot', 'claudebot', 'google-extended', 'bingbot']

export type RobotsVerdict = { blocksAiBots: boolean; blockedBots: string[]; blocksEveryone: boolean }

/**
 * Everything on a line before its first `#`.
 *
 * indexOf rather than `/#.*$/`: `.` stops at a CR or U+2028 while `$` wants the
 * end of the input, so on a line holding one of those the engine backtracks
 * from every `#` in turn — quadratic. Measured on the expression this replaced:
 * a 15 000-character line took 180 ms and 30 000 took 680 ms, and robots.txt is
 * fetched from the site under check, up to our 1.5 MB cap.
 */
export function stripLineComment(line: string): string {
  const at = line.indexOf('#')
  return at < 0 ? line : line.slice(0, at)
}

/**
 * Read robots.txt for AI-crawler access. Only a group that disallows the site
 * root (`Disallow: /`) counts as blocking — a path-level rule is normal hygiene,
 * not an AI-visibility problem.
 */
export function readRobots(robotsTxt: string | null): RobotsVerdict {
  if (!robotsTxt) return { blocksAiBots: false, blockedBots: [], blocksEveryone: false }
  const lines = robotsTxt.split(/\r?\n/).map((l) => stripLineComment(l).trim()).filter(Boolean)
  const groups: { agents: string[]; disallowRoot: boolean }[] = []
  let current: { agents: string[]; disallowRoot: boolean } | null = null
  let lastWasAgent = false
  for (const line of lines) {
    const [rawKey, ...rest] = line.split(':')
    const key = rawKey.trim().toLowerCase()
    const value = rest.join(':').trim()
    if (key === 'user-agent') {
      if (!current || !lastWasAgent) { current = { agents: [], disallowRoot: false }; groups.push(current) }
      current.agents.push(value.toLowerCase())
      lastWasAgent = true
      continue
    }
    lastWasAgent = false
    if (!current) continue
    if (key === 'disallow' && (value === '/' || value === '/*')) current.disallowRoot = true
    if (key === 'allow' && value === '/') current.disallowRoot = false
  }

  const blockedBots: string[] = []
  let blocksEveryone = false
  for (const g of groups) {
    if (!g.disallowRoot) continue
    for (const agent of g.agents) {
      if (agent === '*') blocksEveryone = true
      else if (AI_BOTS.some((b) => agent.includes(b))) blockedBots.push(agent)
    }
  }
  return { blocksAiBots: blockedBots.length > 0 || blocksEveryone, blockedBots, blocksEveryone }
}
