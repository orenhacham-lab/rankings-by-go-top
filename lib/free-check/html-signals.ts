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

function stripNoise(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
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

function textOf(fragment: string): string {
  return decodeEntities(fragment.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim()
}

/** All values of an attribute on tags matching `tag`, in document order. */
function attrValues(html: string, tag: string, attr: string): string[] {
  const out: string[] = []
  const tags = html.match(new RegExp(`<${tag}\\b[^>]*>`, 'gi')) ?? []
  const attrRe = new RegExp(`\\b${attr}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s">]+))`, 'i')
  for (const t of tags) {
    const m = t.match(attrRe)
    if (m) out.push((m[2] ?? m[3] ?? m[4] ?? '').trim())
  }
  return out
}

/** Content of a `<meta name="x">` / `<meta property="x">`, first match wins. */
function metaContent(html: string, key: string): string | null {
  const tags = html.match(/<meta\b[^>]*>/gi) ?? []
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
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'gi')
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    const t = textOf(m[1])
    if (t) out.push(t.slice(0, 200))
    if (out.length >= 40) break
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
  const re = /<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    try {
      flattenJsonLd(JSON.parse(m[1].trim()), nodes)
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
  { name: 'Wix', patterns: [/static\.wixstatic\.com/i, /wix-?code/i, /<meta[^>]+generator["'][^>]*Wix\.com/i] },
  { name: 'Squarespace', patterns: [/squarespace\.com/i, /Static\.SQUARESPACE_CONTEXT/i] },
  { name: 'Webflow', patterns: [/assets\.website-files\.com/i, /webflow\.js/i, /data-wf-page/i] },
  { name: 'WooCommerce', patterns: [/woocommerce[-.]/i, /wc-ajax/i, /generator["'][^>]*WooCommerce/i] },
  { name: 'Magento', patterns: [/\/static\/version\d+\/frontend\//i, /Magento_/i, /mage\/cookies/i] },
  { name: 'Duda', patterns: [/irp\.cdn-website\.com/i, /dmws\./i] },
  { name: 'Joomla', patterns: [/generator["'][^>]*Joomla/i, /\/media\/jui\//i] },
  { name: 'Drupal', patterns: [/generator["'][^>]*Drupal/i, /\/sites\/default\/files\//i, /drupal-settings-json/i] },
  { name: 'WordPress', patterns: [/wp-content\//i, /wp-includes\//i, /generator["'][^>]*WordPress/i, /wp-json/i] },
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

  const titleM = head.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)
  const title = titleM ? textOf(titleM[1]).slice(0, 300) || null : null

  const htmlTagM = html.match(/<html\b[^>]*>/i)
  const langM = htmlTagM?.[0].match(/\blang\s*=\s*("([^"]*)"|'([^']*)'|([^\s">]+))/i)
  const htmlLang = (langM?.[2] ?? langM?.[3] ?? langM?.[4] ?? '').trim().toLowerCase() || null

  const canonicalTag = (head.match(/<link\b[^>]*>/gi) ?? []).find((t) => /\brel\s*=\s*["']?canonical/i.test(t))
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

  const bodyM = clean.match(/<body\b[^>]*>([\s\S]*)<\/body>/i)
  const text = textOf(bodyM ? bodyM[1] : clean).slice(0, 20_000)
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
 * Read robots.txt for AI-crawler access. Only a group that disallows the site
 * root (`Disallow: /`) counts as blocking — a path-level rule is normal hygiene,
 * not an AI-visibility problem.
 */
export function readRobots(robotsTxt: string | null): RobotsVerdict {
  if (!robotsTxt) return { blocksAiBots: false, blockedBots: [], blocksEveryone: false }
  const lines = robotsTxt.split(/\r?\n/).map((l) => l.replace(/#.*$/, '').trim()).filter(Boolean)
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
