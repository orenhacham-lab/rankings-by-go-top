/**
 * Site health rules: from what the scan read to findings, a score, and the
 * suggested new value for a one-click fix. PURE (no network, no database), so
 * every rule is unit-tested (lib/site-health/__qa__/site-health.qa.ts).
 *
 * THRESHOLDS follow the free check (lib/free-check/findings.ts), so a merchant
 * who ran it before signing up is not told a different story here: a title of
 * 30-65 characters and a description of 70-165 are fine.
 *
 * THE SCORE is one sentence the screen prints as is: it starts at 100 and every
 * KIND of problem takes off a fixed amount by how serious it is, however many
 * pages have it. A merchant can predict what a fix is worth, and one broken
 * theme template repeated on 200 pages does not read as a dead site.
 *
 * WHAT CAN BE FIXED IN ONE CLICK is text we can write safely through the
 * connection the merchant already made: WordPress titles, meta descriptions,
 * image alt text in the page's own content, and a link to a page nothing links
 * to. Everything else is a step-by-step card, on every platform.
 */
import type { FixType } from '@/lib/site-fix/types'
import type {
  ConnectionState, Finding, FindingKind, FindingPage, FixField, GuideTopic, PageFacts, PageKind, Severity, SiteFacts,
  SitePlatform,
} from './types'

export const TITLE_MIN = 30
export const TITLE_MAX = 65
/** What a suggested title aims for: Google shows about this much. */
export const TITLE_TARGET = 60
export const DESCRIPTION_MIN = 70
export const DESCRIPTION_MAX = 165
export const DESCRIPTION_TARGET = 155
/** Below this share of images carrying alt text, a page is reported. */
export const ALT_TOLERANCE = 0.2
/** A finding lists this many pages; the rest are counted. */
export const MAX_PAGES_SHOWN = 10

export const SEVERITY_POINTS: Record<Severity, number> = { urgent: 15, important: 6, minor: 2 }

export const SEVERITY: Record<FindingKind, Severity> = {
  home_unreachable: 'urgent',
  robots_blocks_all: 'urgent',
  noindex: 'urgent',
  broken_links: 'urgent',
  title_missing: 'important',
  title_long: 'important',
  title_duplicate: 'important',
  description_missing: 'important',
  images_alt: 'important',
  h1_missing: 'important',
  robots_blocks_ai: 'important',
  sitemap_missing: 'important',
  title_short: 'minor',
  description_length: 'minor',
  description_duplicate: 'minor',
  h1_multiple: 'minor',
  orphan_page: 'minor',
  no_viewport: 'important',
  canonical_missing: 'minor',
  schema_missing: 'minor',
  faq_missing: 'minor',
}

/** The one-click field a finding is fixed with, where one exists at all. */
export const FIX_FIELD: Partial<Record<FindingKind, FixField>> = {
  title_missing: 'title',
  title_long: 'title',
  title_short: 'title',
  title_duplicate: 'title',
  description_missing: 'description',
  description_length: 'description',
  description_duplicate: 'description',
  images_alt: 'alt',
  orphan_page: 'link',
}

export const GUIDE: Record<FindingKind, GuideTopic> = {
  home_unreachable: 'unreachable',
  robots_blocks_all: 'robots',
  robots_blocks_ai: 'robots_ai',
  noindex: 'noindex',
  broken_links: 'broken',
  title_missing: 'title',
  title_long: 'title',
  title_short: 'title',
  title_duplicate: 'title',
  description_missing: 'description',
  description_length: 'description',
  description_duplicate: 'description',
  images_alt: 'alt',
  h1_missing: 'h1',
  h1_multiple: 'h1',
  sitemap_missing: 'sitemap',
  orphan_page: 'orphan',
  no_viewport: 'viewport',
  canonical_missing: 'canonical',
  schema_missing: 'schema',
  faq_missing: 'faq',
}

/**
 * The approved-fix type (lib/site-fix) for each finding that has one. Where the fix goes (the
 * plugin, the application password, the webhook) is decided per project by lib/site-fix/channel.ts.
 */
export const FIX_TYPE: Partial<Record<FindingKind, FixType>> = {
  title_missing: 'seo_title',
  title_long: 'seo_title',
  title_short: 'seo_title',
  title_duplicate: 'seo_title',
  description_missing: 'meta_description',
  description_length: 'meta_description',
  description_duplicate: 'meta_description',
  images_alt: 'image_alt',
  orphan_page: 'internal_link',
  broken_links: 'broken_link',
  canonical_missing: 'canonical',
  schema_missing: 'schema_jsonld',
  faq_missing: 'faq_block',
}

const SEVERITY_ORDER: Record<Severity, number> = { urgent: 0, important: 1, minor: 2 }

/** 100, less the points of every kind of problem found, never below 0. */
export function scoreOf(findings: readonly Pick<Finding, 'severity'>[]): number {
  const lost = findings.reduce((sum, f) => sum + SEVERITY_POINTS[f.severity], 0)
  return Math.max(0, Math.min(100, 100 - lost))
}

export type ScoreBand = 'excellent' | 'good' | 'fair' | 'poor'
export function scoreBand(score: number): ScoreBand {
  if (score >= 90) return 'excellent'
  if (score >= 75) return 'good'
  if (score >= 50) return 'fair'
  return 'poor'
}

/** Page kinds WordPress holds as a post or page we can edit. The home page may be a theme template. */
const WP_EDITABLE: ReadonlySet<PageKind> = new Set(['article', 'page', 'other'])

/**
 * Whether "fix it for me" is offered for one page: WordPress, connected, a field we
 * write, and a page that is a post or a page (not the home page, not a product or a
 * category archive). The route still checks the page really is one before writing.
 */
export function canFix(field: FixField | null, page: Pick<PageFacts, 'kind'>, platform: SitePlatform, connections: ConnectionState): boolean {
  if (!field) return false
  if (platform !== 'wordpress' || !connections.wordpress) return false
  return WP_EDITABLE.has(page.kind)
}

export function pathOf(url: string): string {
  try {
    const u = new URL(url)
    let p = u.pathname
    try { p = decodeURI(p) } catch { /* keep */ }
    return p.replace(/\/+$/, '') || '/'
  } catch {
    return url
  }
}

const norm = (s: string | null | undefined) => String(s ?? '').replace(/\s+/g, ' ').trim()

interface BuildContext { platform: SitePlatform; connections: ConnectionState }

/**
 * The findings, most serious first; within one severity, the one with the most
 * pages first. A page that could not be read adds nothing but its absence (the
 * report says the scan was partial); the home page not answering at all is the
 * one exception, because then nothing else can be judged.
 */
export function buildFindings(site: SiteFacts, pages: readonly PageFacts[], ctx: BuildContext): Finding[] {
  const hits = new Map<FindingKind, FindingPage[]>()
  const add = (kind: FindingKind, page: Pick<PageFacts, 'url' | 'kind' | 'adminUrl'>, value: string | null, measure: number | null, from?: string) => {
    const field = FIX_FIELD[kind] ?? null
    const list = hits.get(kind) ?? []
    if (list.some((p) => p.url === page.url && (p.from ?? null) === (from ?? null))) return
    list.push({
      url: page.url, path: pathOf(page.url), kind: page.kind, value, measure,
      fixable: canFix(field, page, ctx.platform, ctx.connections), adminUrl: page.adminUrl,
      ...(from !== undefined ? { from } : {}),
    })
    hits.set(kind, list)
  }
  const home = { url: site.siteUrl, kind: 'home' as const, adminUrl: null }

  if (!site.homeReachable) add('home_unreachable', home, null, null)
  if (site.robots.blocksAll) add('robots_blocks_all', home, null, null)
  else if (site.robots.blocksAi) add('robots_blocks_ai', home, site.robots.blockedBots.slice(0, 4).join(', ') || null, null)
  if (site.sitemapFound === false) add('sitemap_missing', home, null, null)

  const read = pages.filter((p) => p.ok)
  const titles = new Map<string, PageFacts[]>()
  const descriptions = new Map<string, PageFacts[]>()
  for (const p of read) {
    const title = norm(p.title)
    const description = norm(p.description)
    if (p.noindex) add('noindex', p, null, null)
    if (!title) add('title_missing', p, null, null)
    else if (title.length > TITLE_MAX) add('title_long', p, title, title.length)
    else if (title.length < TITLE_MIN) add('title_short', p, title, title.length)
    if (title) titles.set(title.toLowerCase(), [...(titles.get(title.toLowerCase()) ?? []), p])
    if (!description) add('description_missing', p, null, null)
    else if (description.length < DESCRIPTION_MIN || description.length > DESCRIPTION_MAX) add('description_length', p, description, description.length)
    if (description) descriptions.set(description.toLowerCase(), [...(descriptions.get(description.toLowerCase()) ?? []), p])
    if (p.h1.length === 0) add('h1_missing', p, null, 0)
    else if (p.h1.length > 1) add('h1_multiple', p, null, p.h1.length)
    if (p.images.total > 0 && p.images.missingAlt / p.images.total > ALT_TOLERANCE) add('images_alt', p, null, p.images.missingAlt)
    if (!p.viewport) add('no_viewport', p, null, null)
    // Read only by scans since these were added (a cached report has no such facts: nothing is claimed).
    if (p.canonical === null) add('canonical_missing', p, null, null)
    if (Array.isArray(p.schemaTypes) && p.schemaTypes.length === 0 && (p.kind === 'home' || p.kind === 'article' || p.kind === 'page')) add('schema_missing', p, null, null)
    if (p.faq === false && (p.kind === 'home' || p.kind === 'article')) add('faq_missing', p, null, null)
  }
  for (const [, group] of titles) if (group.length > 1) for (const p of group) add('title_duplicate', p, norm(p.title), group.length)
  for (const [, group] of descriptions) if (group.length > 1) for (const p of group) add('description_duplicate', p, norm(p.description), group.length)

  for (const b of site.brokenLinks) add('broken_links', { url: b.url, kind: 'other', adminUrl: null }, null, null, b.from)
  for (const o of site.orphanPages) {
    const known = pages.find((p) => pathOf(p.url) === pathOf(o.url))
    add('orphan_page', { url: o.url, kind: known?.kind ?? 'article', adminUrl: null }, o.keyword || o.title || null, null)
  }

  const findings: Finding[] = []
  for (const [id, list] of hits) {
    const field = FIX_FIELD[id] ?? null
    findings.push({
      id, severity: SEVERITY[id], pages: list.slice(0, MAX_PAGES_SHOWN), total: list.length,
      field, guide: GUIDE[id], fixable: list.some((p) => p.fixable), fixType: FIX_TYPE[id] ?? null,
    })
  }
  return findings.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || b.total - a.total || a.id.localeCompare(b.id))
}

// ── Suggested values ────────────────────────────────────────────────────────
//
// Deterministic, from the page's own words: no model is called. The merchant sees
// the suggestion in the before/after preview and can change it before approving.

const SEPARATORS = [' | ', ' - ', ' – ', ' — ', ' · ', ' :: ', ' » ']

/** Cut at the last whole word that fits in `max` characters. Never mid-word, never an ellipsis. */
export function cutAtWord(text: string, max: number): string {
  const t = norm(text)
  if (t.length <= max) return t
  const slice = t.slice(0, max + 1)
  const space = slice.lastIndexOf(' ')
  let out = (space > max * 0.5 ? slice.slice(0, space) : t.slice(0, max)).replace(/[\s,;:–—|·-]+$/u, '')
  // Never end on a joining word ("…began and", "…של ה"): drop it while enough is left.
  for (let i = 0; i < 3; i++) {
    const m = out.match(/\s(\S+)$/u)
    if (!m || !DANGLING.has(m[1].toLowerCase()) || out.length - m[0].length < max * 0.5) break
    out = out.slice(0, -m[0].length).replace(/[\s,;:–—|·-]+$/u, '')
  }
  return out
}

const DANGLING = new Set([
  'and', 'or', 'of', 'the', 'a', 'an', 'to', 'for', 'with', 'in', 'on', 'at', 'by', 'from', 'but', 'is', 'are',
  'של', 'עם', 'על', 'את', 'או', 'גם', 'כי', 'אם', 'אל', 'מן', 'בין',
])

/**
 * A long text cut at its last clause break (a comma, a dash, a colon) that still
 * leaves at least `min` characters: a whole thought reads better than a sentence
 * stopped mid-way. null when there is no such break.
 */
function cutAtClause(text: string, max: number, min: number): string | null {
  const t = norm(text)
  if (t.length <= max) return t
  const window = t.slice(0, max + 1)
  let best = -1
  for (const m of window.matchAll(/\s*(?:,|;|:|\s[–—-]\s)\s*/gu)) {
    if ((m.index ?? 0) >= min) best = m.index ?? -1
  }
  return best >= min ? t.slice(0, best).trim() : null
}

/** "Title | Site name" → "Title" (the last segment after a separator), when what is left still says something. */
function withoutSuffix(title: string): string {
  for (const sep of SEPARATORS) {
    const i = title.lastIndexOf(sep)
    if (i > 0) {
      const head = title.slice(0, i).trim()
      if (head.length >= 15) return head
    }
  }
  return title
}

export interface TitleContext {
  kind: FindingKind
  current: string | null
  h1: string | null
  siteName: string | null
  path: string
}

function humanizePath(path: string): string {
  const last = path.split('/').filter(Boolean).pop() ?? ''
  let s = last
  try { s = decodeURIComponent(last) } catch { /* keep */ }
  return s.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim()
}

export function suggestTitle(ctx: TitleContext): string {
  const current = norm(ctx.current)
  const h1 = norm(ctx.h1)
  const site = norm(ctx.siteName)
  if (!current) return cutAtWord(h1 || site, TITLE_TARGET)
  if (ctx.kind === 'title_long' || current.length > TITLE_MAX) {
    const head = withoutSuffix(current)
    return cutAtClause(head, TITLE_TARGET, TITLE_MIN) ?? cutAtWord(head, TITLE_TARGET)
  }
  if (ctx.kind === 'title_short' || current.length < TITLE_MIN) {
    const extra = h1 && h1.toLowerCase() !== current.toLowerCase() && !current.toLowerCase().includes(h1.toLowerCase()) ? h1 : site
    if (extra && !current.toLowerCase().includes(extra.toLowerCase())) {
      const joined = `${current} | ${extra}`
      if (joined.length <= TITLE_TARGET) return joined
    }
    return current
  }
  // Duplicate: the page's own main heading tells it apart; otherwise its address does.
  if (h1 && h1.toLowerCase() !== current.toLowerCase()) return cutAtWord(h1, TITLE_TARGET)
  const words = humanizePath(ctx.path)
  return words ? cutAtWord(`${withoutSuffix(current)} – ${words}`, TITLE_TARGET) : current
}

/** Visible text of an HTML fragment: tags, scripts and entities out, whitespace collapsed. */
export function textOf(html: string): string {
  return String(html ?? '')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|figure|figcaption|table|nav|h[1-6])\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;/gi, "'")
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * A description from the page's own opening words: whole sentences while they fit
 * DESCRIPTION_TARGET, else whole words. Null when the page has too little text to
 * say anything honest; the merchant then writes it in the preview.
 */
export function suggestDescription(current: string | null, pageText: string): string | null {
  const cur = norm(current)
  if (cur.length > DESCRIPTION_MAX) return cutAtWord(cur, DESCRIPTION_TARGET)
  const text = norm(pageText)
  if (text.length < DESCRIPTION_MIN) return cur.length >= DESCRIPTION_MIN ? cur : null
  const sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [text]
  let out = ''
  for (const s of sentences) {
    const next = norm(`${out} ${s}`)
    if (next.length > DESCRIPTION_TARGET) break
    out = next
  }
  if (out.length < DESCRIPTION_MIN) out = cutAtWord(text, DESCRIPTION_TARGET)
  return out.length >= DESCRIPTION_MIN ? out : null
}

/** A file name that says nothing: a camera's counter, a hash, a date, a number. */
const JUNK_NAME = /^(?:img|image|dsc|dscn|photo|pic|screenshot|screen shot|whatsapp image|untitled|scaled|\d+|[a-f0-9]{8,})(?:[\s_-]*\d+)*$/i

/**
 * Alt text for one image: the words of its file name when they are words
 * ("red-running-shoes-1024x768.jpg" → "red running shoes"), otherwise the page's
 * title, which is at least what the image is there for.
 */
export function suggestAlt(src: string, pageTitle: string): string {
  let name = ''
  try {
    const u = new URL(src, 'https://x.invalid')
    name = u.pathname.split('/').pop() ?? ''
    try { name = decodeURIComponent(name) } catch { /* keep */ }
  } catch {
    name = String(src).split('/').pop() ?? ''
  }
  const words = name
    .replace(/\.[a-z0-9]{2,5}$/i, '')
    .replace(/-(?:\d{2,5}x\d{2,5}|scaled|e\d{10,})$/i, '')
    .replace(/[-_.+]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const letters = (words.match(/\p{L}/gu) ?? []).length
  // A Hebrew (or other non-Latin) page keeps its alt text in its own language: file
  // names are nearly always Latin, so there the page title is the better start.
  const title = norm(pageTitle)
  const latinOnly = (v: string) => !/[^\p{Script=Latin}\d\s\p{P}]/u.test(v)
  const sameScript = !title || !latinOnly(words) || latinOnly(title)
  if (words && letters >= 3 && !JUNK_NAME.test(words) && sameScript) return cutAtWord(words, 120)
  return cutAtWord(title, 120)
}

/** An alt value the merchant typed: plain text, one line, without markup characters. */
export function cleanAlt(v: unknown): string {
  return norm(String(v ?? '')).replace(/[<>"]/g, '').slice(0, 150)
}

/** A title or description the merchant approved: plain text, one line, bounded. */
export function cleanText(v: unknown, max: number): string {
  return norm(String(v ?? '')).replace(/[<>]/g, '').slice(0, max)
}
