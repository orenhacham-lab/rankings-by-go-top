/**
 * The icon a site declares for itself, read off the home page a1 already
 * fetched: `<link rel="icon">`, `rel="shortcut icon"`, `rel="apple-touch-icon"`.
 * Nothing is fetched here, and nothing ever fetches the result on our side: it
 * is stored in the run's summary and only the owner's browser loads it
 * (lib/site-icon.ts says where, and what is accepted).
 *
 * The page is the site's, so reading it costs linear time whatever it holds:
 * tags are found with indexOf, only a bounded slice of one tag is ever matched
 * with a pattern, and nothing past SCAN_LIMIT characters is looked at (the same
 * care as lib/free-check/html-signals.ts, which this does not touch).
 *
 * Where the icon is looked for: the <head> first. A page builder that prints
 * its <link rel="icon"> after a stray </head> (or a page whose head holds
 * hundreds of kilobytes of inline script before it) is read on to SCAN_LIMIT,
 * and an icon found there is taken only when the head had none. Relative hrefs
 * resolve against the page's own <base href> when it declares one.
 */
import { safeSiteIcon } from '@/lib/site-icon'

/** Nothing past this many characters is looked at (the fetcher's own cap, lib/free-check/site-fetch.ts MAX_BYTES). */
const SCAN_LIMIT = 1_500_000
/** A <link> tag longer than this is not read. */
const TAG_LIMIT = 2_000

/** Higher is better: an explicit icon, then the legacy name, then the touch icon. */
function rank(rel: string[]): number {
  if (rel.includes('icon') && !rel.includes('shortcut') && !rel.includes('mask-icon')) return 3
  if (rel.includes('icon')) return 2
  if (rel.includes('apple-touch-icon') || rel.includes('apple-touch-icon-precomposed')) return 1
  return 0
}

function attrs(tag: string): Map<string, string> {
  const out = new Map<string, string>()
  // Bounded input (TAG_LIMIT): one pass over at most 2 000 characters.
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g
  let m: RegExpExecArray | null
  while ((m = re.exec(tag)) !== null) {
    const name = m[1].toLowerCase()
    if (!out.has(name)) out.set(name, m[2] ?? m[3] ?? m[4] ?? '')
  }
  return out
}

/** The entities an href carries in practice: &amp; and numeric ones (&#47; &#x2F;). */
const decode = (s: string) =>
  s
    .replace(/&#(\d{1,7});/g, (_, n: string) => safeChar(Number(n)))
    .replace(/&#x([0-9a-f]{1,6});/gi, (_, n: string) => safeChar(parseInt(n, 16)))
    .replace(/&amp;/gi, '&')
    .trim()
const safeChar = (code: number) => (code > 0x1f && code < 0x10ffff ? String.fromCodePoint(code) : '')

/**
 * The best icon the page declares, as an absolute https URL on the site itself
 * or its platform's CDN (safeSiteIcon), or null. `pageUrl` is where the page was
 * read (after redirects); relative and protocol-relative hrefs resolve against
 * it, or against the page's <base href>.
 */
export function siteIconFromHtml(html: string, pageUrl: string): string | null {
  if (typeof html !== 'string' || !html) return null
  let page: URL
  try {
    page = new URL(pageUrl)
  } catch {
    return null
  }
  // ASCII-only lowercasing keeps every index equal to the original's.
  const lower = html.slice(0, SCAN_LIMIT).replace(/[A-Z]/g, (c) => c.toLowerCase())
  const headEnd = lower.indexOf('</head')
  const base = baseHref(html, lower, headEnd >= 0 ? headEnd : lower.length, page)
  const inHead = pickIcon(html, lower, 0, headEnd >= 0 ? headEnd : lower.length, base, page.hostname)
  if (inHead || headEnd < 0) return inHead
  return pickIcon(html, lower, headEnd, lower.length, base, page.hostname)
}

/** The page's <base href> (the first one, as browsers read it), resolved; the page URL without one. */
function baseHref(html: string, lower: string, end: number, page: URL): URL {
  let i = 0
  while (i < end) {
    const at = lower.indexOf('<base', i)
    if (at < 0 || at >= end) break
    const close = lower.indexOf('>', at)
    if (close < 0) break
    i = close + 1
    const next = lower.charCodeAt(at + 5)
    // "<basefont" is not <base>.
    if (!(next === 32 || next === 9 || next === 10 || next === 13 || next === 47 || next === 62)) continue
    if (close - at > TAG_LIMIT) continue
    const href = attrs(html.slice(at + 5, close)).get('href')
    if (!href) continue
    try {
      return new URL(decode(href), page)
    } catch {
      return page
    }
  }
  return page
}

function pickIcon(html: string, lower: string, from: number, end: number, base: URL, siteHostname: string): string | null {
  let best: { rank: number; url: string } | null = null
  let i = from
  while (i < end) {
    const at = lower.indexOf('<link', i)
    if (at < 0 || at >= end) break
    const close = lower.indexOf('>', at)
    if (close < 0) break
    i = close + 1
    if (close - at > TAG_LIMIT) continue
    const a = attrs(html.slice(at + 5, close))
    const r = rank((a.get('rel') ?? '').toLowerCase().split(/\s+/).filter(Boolean))
    const href = a.get('href')
    if (r === 0 || !href || (best && best.rank >= r)) continue
    let resolved: string
    try {
      resolved = new URL(decode(href), base).toString()
    } catch {
      continue
    }
    const safe = safeSiteIcon(resolved, siteHostname)
    if (safe) best = { rank: r, url: safe }
    if (best?.rank === 3) break
  }
  return best?.url ?? null
}
