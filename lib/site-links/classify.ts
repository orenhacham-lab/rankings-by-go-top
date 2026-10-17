/**
 * Which sites that already show up for a project's searches are worth asking
 * for a link, and why. TRANSPARENT RULES, no model, no request: every verdict
 * carries the rule that produced it, and the screen says it in words.
 *
 * WHAT THIS IS NOT. It never suggests placing, exchanging or buying links
 * between the app's own customers. Google calls that a link scheme
 * (https://developers.google.com/search/docs/essentials/spam-policies#link-spam)
 * and it can hurt every site in it. What is classified here is the open web:
 * directories a business can list itself in, "best of" articles a business can
 * pitch, associations it can join, and media it can offer a story to.
 *
 * Categories, in the order a page is tested (the first that matches wins):
 *   directory     a known business directory, review or local index (by domain)
 *   listicle      the page itself is a "best / top N / המומלצים" list (title or address)
 *   association   an industry association, chamber or union (domain or title words)
 *   media         a known news or magazine site (by domain), or a news-shaped domain
 *   directory     a directory-shaped domain ("directory", "yellowpages", …)
 * Anything else is not an opportunity and is not shown.
 *
 * Never an opportunity: the project's own site, social networks, video, search
 * engines and app stores, marketplaces and delivery apps, encyclopedias. A
 * competitor is NEVER hidden or disguised: it keeps its category and is marked
 * `isCompetitor`, and the screen says so.
 *
 * Pure: no React, no I/O. Guarded by lib/site-links/__qa__/site-links.qa.ts.
 */

export type OpportunityCategory = 'directory' | 'listicle' | 'association' | 'media'

/** The rule that classified a page, shown to the owner as the reason. */
export type ClassifyReason =
  | 'known_directory'
  | 'directory_pattern'
  | 'best_of_title'
  | 'best_of_address'
  | 'top_n_title'
  | 'association_pattern'
  | 'known_media'
  | 'media_pattern'

export type Verdict =
  | { kind: 'opportunity'; category: OpportunityCategory; reason: ClassifyReason }
  | { kind: 'excluded'; why: 'self' | 'platform' }
  | { kind: 'none' }

/** "https://www.Example.co.il/a?b" → "example.co.il". Empty when it is not a host name. */
export function bareDomain(input: string | null | undefined): string {
  let s = String(input ?? '').trim().toLowerCase()
  if (!s) return ''
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, '').replace(/^\/\//, '')
  s = s.split(/[/?#]/)[0] ?? ''
  s = s.replace(/:\d+$/, '').replace(/^www\./, '').replace(/\.$/, '')
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(s) ? s : ''
}

/** Exact domain or a subdomain of it — never a substring ("notd.co.il" ≠ "d.co.il"). */
export function sameOrSubdomain(domain: string, of: string): boolean {
  if (!domain || !of) return false
  return domain === of || domain.endsWith(`.${of}`)
}

const matchesAny = (domain: string, list: readonly string[]) => list.some((d) => sameOrSubdomain(domain, d))

/** Sites that list businesses: directories, review sites, local indexes. */
export const KNOWN_DIRECTORIES: readonly string[] = [
  // Israel
  'd.co.il', 'b144.co.il', 'easy.co.il', 'zap.co.il', 'zips.co.il', 'midrag.co.il', 'pro.co.il', 't.co.il',
  'rest.co.il', '2eat.co.il', 'kolboyom.co.il', 'myofer.co.il', 'bizmap.co.il', 'dapeizahav.co.il',
  // global
  'yelp.com', 'tripadvisor.com', 'tripadvisor.co.il', 'tripadvisor.co.uk', 'foursquare.com', 'wanderlog.com',
  'yellowpages.com', 'bbb.org', 'trustpilot.com', 'clutch.co', 'goodfirms.co', 'thumbtack.com', 'angi.com',
  'houzz.com', 'manta.com', 'crunchbase.com', 'g2.com', 'capterra.com',
]

/** News and magazine sites. */
export const KNOWN_MEDIA: readonly string[] = [
  // Israel
  'ynet.co.il', 'mako.co.il', 'walla.co.il', 'haaretz.co.il', 'themarker.com', 'globes.co.il', 'calcalist.co.il',
  'maariv.co.il', 'israelhayom.co.il', 'n12.co.il', 'kan.org.il', 'bizportal.co.il', 'timeout.co.il', 'atmag.co.il',
  'xnet.co.il', 'onlife.co.il', 'sport5.co.il', 'one.co.il', 'geektime.co.il', 'ice.co.il', 'kikar.co.il',
  'srugim.co.il', 'bhol.co.il', 'mynet.co.il', 'news1.co.il', 'funder.co.il', 'finder.co.il', 'lametayel.co.il',
  // global
  'nytimes.com', 'theguardian.com', 'bbc.com', 'bbc.co.uk', 'forbes.com', 'businessinsider.com', 'cnn.com',
  'techcrunch.com', 'wired.com', 'theverge.com', 'timeout.com', 'buzzfeed.com', 'usatoday.com', 'washingtonpost.com',
]

/** Never an opportunity: platforms where a "link" is a profile or an ad, not an editorial mention. */
export const PLATFORMS: readonly string[] = [
  'facebook.com', 'instagram.com', 'twitter.com', 'x.com', 'linkedin.com', 'pinterest.com', 'tiktok.com',
  'reddit.com', 'quora.com', 'threads.net', 'snapchat.com', 'whatsapp.com', 't.me', 'telegram.org',
  'youtube.com', 'youtu.be', 'vimeo.com', 'twitch.tv',
  'wikipedia.org', 'wikimedia.org', 'wikihow.com', 'fandom.com',
  'bing.com', 'bingapis.com', 'yahoo.com', 'duckduckgo.com', 'yandex.com', 'baidu.com', 'apple.com',
  'amazon.com', 'ebay.com', 'aliexpress.com', 'etsy.com', 'wolt.com', '10bis.co.il', 'yad2.co.il', 'waze.com',
]

/** google.com, google.co.il, maps.google.de, play.google.com … */
const GOOGLE = /(^|\.)google\.[a-z]{2,3}(\.[a-z]{2})?$/

/** A directory-shaped domain label. */
const DIRECTORY_DOMAIN = /(directory|yellowpages|bizdir|businesslist|madrich|listings)/
/** An association: domain words or title words. */
const ASSOCIATION_DOMAIN = /(^|[.-])(igud|lishka|hitachdut|association|federation|chamber|guild)([.-]|$)/
const ASSOCIATION_TITLE = /(איגוד|לשכת|התאחדות|הסתדרות|\bassociation\b|\bfederation\b|chamber of commerce|\bguild\b)/i
/** A news-shaped domain label. */
const MEDIA_DOMAIN = /(^|[.-])(news|magazine|journal|mag)([.-]|$)/

/** "best", "top 10", "הכי טובים", "המומלצים" … in a title. */
const BEST_OF_EN = /\b(best|top[\s-]?\d{1,2}|\d{1,2}\s+best|most\s+recommended)\b/i
const BEST_OF_HE = /(הכי\s+טובים|הכי\s+טובות|הטובים\s+ביותר|הטובות\s+ביותר|המומלצים|המומלצות|מומלצים|מומלצות|המובילים|המובילות)/
/**
 * "10 חנויות …", "סקירת 7 הליכונים": a number followed by a plural noun. Units
 * and how-to words are not a list of places to be in ("24 שעות", "ב-7 שלבים",
 * "5 טיפים"). English needs "best" or "top" (above): "24 hours" is not a list.
 */
const TOP_N_HE = /(?:^|[\s:(|–-])(?:[3-9]|[1-4]\d|50)\s+([א-ת"'׳]+(?:ים|ות))(?=$|[\s,.:!?)|–-])/g
const NOT_A_LIST = new Set([
  'שעות', 'דקות', 'ימים', 'שנים', 'שנות', 'חודשים', 'שבועות', 'שקלים', 'אחוזים', 'חדרים', 'מטרים', 'קילומטרים',
  'כוכבים', 'שלבים', 'טיפים', 'דרכים', 'סיבות', 'שאלות', 'טעויות', 'צעדים', 'דברים', 'עובדות', 'תרגילים',
])
function topNHebrew(title: string): boolean {
  for (const m of title.matchAll(TOP_N_HE)) if (!NOT_A_LIST.has(m[1])) return true
  return false
}

function decodedAddress(url: string | null | undefined): string {
  const raw = String(url ?? '')
  let s = raw
  try { s = decodeURIComponent(raw) } catch { /* keep the raw form */ }
  // Only the path and query: "best" in a host name is not a list.
  return s.replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]*/i, '').replace(/[-_+/]+/g, ' ')
}

export interface PageFacts {
  domain: string
  url?: string | null
  title?: string | null
}

/**
 * One page (or a bare domain, from a search result that kept only the domain).
 * `selfDomains` are the project's own domain and aliases.
 */
export function classifyPage(page: PageFacts, selfDomains: readonly string[]): Verdict {
  const domain = bareDomain(page.domain)
  if (!domain) return { kind: 'none' }
  if (selfDomains.some((s) => s && (sameOrSubdomain(domain, s) || sameOrSubdomain(s, domain)))) return { kind: 'excluded', why: 'self' }
  if (matchesAny(domain, PLATFORMS) || GOOGLE.test(domain)) return { kind: 'excluded', why: 'platform' }

  if (matchesAny(domain, KNOWN_DIRECTORIES)) return { kind: 'opportunity', category: 'directory', reason: 'known_directory' }

  const title = String(page.title ?? '').replace(/\s+/g, ' ').trim()
  const address = decodedAddress(page.url)
  if (title && (BEST_OF_EN.test(title) || BEST_OF_HE.test(title))) return { kind: 'opportunity', category: 'listicle', reason: 'best_of_title' }
  if (title && topNHebrew(title)) return { kind: 'opportunity', category: 'listicle', reason: 'top_n_title' }
  if (address && (BEST_OF_EN.test(address) || BEST_OF_HE.test(address))) return { kind: 'opportunity', category: 'listicle', reason: 'best_of_address' }

  if (ASSOCIATION_DOMAIN.test(domain) || (title && ASSOCIATION_TITLE.test(title))) return { kind: 'opportunity', category: 'association', reason: 'association_pattern' }
  if (matchesAny(domain, KNOWN_MEDIA)) return { kind: 'opportunity', category: 'media', reason: 'known_media' }
  if (MEDIA_DOMAIN.test(domain)) return { kind: 'opportunity', category: 'media', reason: 'media_pattern' }
  if (DIRECTORY_DOMAIN.test(domain)) return { kind: 'opportunity', category: 'directory', reason: 'directory_pattern' }
  return { kind: 'none' }
}

/** Whether a domain is one of the project's competitors (either way round: sub.x.com ~ x.com). */
export function isCompetitorDomain(domain: string, competitors: readonly string[]): boolean {
  const d = bareDomain(domain)
  return !!d && competitors.some((c) => {
    const x = bareDomain(c)
    return !!x && (sameOrSubdomain(d, x) || sameOrSubdomain(x, d))
  })
}

/**
 * The words a page must mention to count as local: the project's city as the
 * owner typed it, before the first comma ("New York, NY" → "new york").
 */
export function cityNeedle(city: string | null | undefined): string | null {
  const first = String(city ?? '').split(',')[0]?.replace(/\s+/g, ' ').trim().toLowerCase() ?? ''
  return first.length >= 2 ? first : null
}

export function mentionsCity(page: PageFacts, needle: string | null): boolean {
  if (!needle) return false
  const hay = `${String(page.title ?? '')} ${decodedAddress(page.url)}`.toLowerCase().replace(/\s+/g, ' ')
  return hay.includes(needle)
}

/** Precedence of categories when one domain has several pages. */
export const CATEGORY_ORDER: readonly OpportunityCategory[] = ['directory', 'listicle', 'association', 'media']
