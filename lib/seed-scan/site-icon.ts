/**
 * The icon a site declares for itself, read off the home page a1 already
 * fetched: `<link rel="icon">`, `rel="shortcut icon"`, `rel="apple-touch-icon"`.
 * Nothing is fetched here, and nothing ever fetches the result on our side: it
 * is stored in the run's summary and only the owner's browser loads it
 * (lib/site-icon.ts says where, and what is accepted).
 *
 * The page is the site's, so reading it costs linear time whatever it holds:
 * tags are found with indexOf, only a bounded slice of one tag is ever matched
 * with a pattern, and the scan stops at </head> or after HEAD_LIMIT characters
 * (the same care as lib/free-check/html-signals.ts, which this does not touch).
 */
import { safeSiteIcon } from '@/lib/site-icon'

/** Icons are declared in <head>; nothing past this many characters is looked at. */
const HEAD_LIMIT = 300_000
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

const decode = (s: string) => s.replace(/&amp;/gi, '&').trim()

/**
 * The best icon the page declares, as an absolute https URL on the site itself
 * (safeSiteIcon), or null. `pageUrl` is where the page was read (after
 * redirects); relative and protocol-relative hrefs resolve against it.
 */
export function siteIconFromHtml(html: string, pageUrl: string): string | null {
  if (typeof html !== 'string' || !html) return null
  let base: URL
  try {
    base = new URL(pageUrl)
  } catch {
    return null
  }
  // ASCII-only lowercasing keeps every index equal to the original's.
  const lower = html.slice(0, HEAD_LIMIT).replace(/[A-Z]/g, (c) => c.toLowerCase())
  const headEnd = lower.indexOf('</head')
  const end = headEnd >= 0 ? headEnd : lower.length
  let best: { rank: number; url: string } | null = null
  let i = 0
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
    const safe = safeSiteIcon(resolved, base.hostname)
    if (safe) best = { rank: r, url: safe }
    if (best?.rank === 3) break
  }
  return best?.url ?? null
}
