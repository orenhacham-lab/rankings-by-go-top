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
  llms_missing: 'minor',
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
  llms_missing: 'llms',
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
  // Plugin 2.1.0: only where provably safe (lib/site-fix/h1.ts), and llms.txt for the whole site.
  h1_multiple: 'h1_demote',
  llms_missing: 'llms_txt',
}

const SEVERITY_ORDER: Record<Severity, number> = { urgent: 0, important: 1, minor: 2 }

/** 100, less the points of every kind of problem found, never below 0. */
export function scoreOf(findings: readonly Pick<Finding, 'severity'>[]): number {
  const lost = findings.reduce((sum, f) => sum + SEVERITY_POINTS[f.severity], 0)
  return Math.max(0, Math.min(100, 100 - lost))
}

/**
 * The score with the fixes already applied (wave 9: "after fixing I don't see the score rise").
 * scoreOf counts each KIND of problem once, so fixing 3 of a kind's 12 pages changed nothing
 * until every page was fixed and the site checked again. Here each kind loses its points in
 * proportion to the pages still open: with nothing fixed it is exactly scoreOf; every applied
 * fix raises it at once, with no new scan and no call to anyone. A page counts as fixed only
 * when `isFixed` says so (the fix queue's applied or sent job for that page, or the owner's own
 * "I fixed it"); pages beyond the ones listed are never assumed fixed.
 */
export function scoreWithFixes<F extends Pick<Finding, 'severity' | 'total' | 'pages'>>(
  findings: readonly F[],
  isFixed: (finding: F, page: FindingPage) => boolean,
): { score: number; fixedPages: number; base: number } {
  let lost = 0
  let fixedPages = 0
  let all = 0
  for (const f of findings) {
    const total = Math.max(f.total || 0, f.pages.length, 1)
    const fixed = Math.min(total, f.pages.filter((p) => isFixed(f, p)).length)
    fixedPages += fixed
    lost += SEVERITY_POINTS[f.severity] * ((total - fixed) / total)
    all += SEVERITY_POINTS[f.severity]
  }
  const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)))
  // `base` is the same findings with nothing fixed: what the gain is measured from.
  return { score: clamp(100 - lost), fixedPages, base: clamp(100 - all) }
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
  if (site.homeReachable && site.llmsFound === false) add('llms_missing', home, null, null)

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


// ── Suggestions that may be offered (wave 8) ────────────────────────────────
//
// A suggestion is offered only when it passes its check: never the current value (compared
// trimmed and case-folded), a too-short or missing title 50–60 characters with the page's main
// keyword, any other title 30–60, a description 120–140. lib/site-fix/suggest.ts adds the model
// when none of the page's-own-words candidates passes; nothing that fails is ever offered.

const normText = (s: string | null | undefined) => String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim()
const hasMarkupText = (s: string) => /[<>]/.test(s)
/** Compared the way a merchant reads them: trimmed, whitespace collapsed, case folded. */
export const sameText = (a: string | null | undefined, b: string | null | undefined) => normText(a).toLocaleLowerCase() === normText(b).toLocaleLowerCase()
export type TitleKind = 'title_missing' | 'title_short' | 'title_long' | 'title_duplicate'
/** A too-short or missing title aims here; Google shows about 60 characters. */
export const TITLE_GOAL = { min: 50, max: 60 } as const
/** Any suggested title stays within this. */
export const TITLE_RANGE = { min: 30, max: 60 } as const

export function titleRangeFor(kind: string): { min: number; max: number } {
  return kind === 'title_short' || kind === 'title_missing' ? TITLE_GOAL : TITLE_RANGE
}

export interface TitleInput {
  kind: string
  current: string | null
  h1: string | null
  siteName: string | null
  /** The page's main keyword: the SEO plugin's focus keyphrase, else the page's main heading. */
  keyword: string | null
  path: string
  /** A few hundred characters of the page's own text, for the model. */
  text?: string
  /** The page's meta description, when it has one (a too-short title's last resort, lib/site-fix/suggest.ts). */
  description?: string | null
}

/** Why a title would not be offered, or null when it may be. */
export function titleProblem(candidate: string, input: Pick<TitleInput, 'kind' | 'current' | 'keyword'>): string | null {
  const v = normText(candidate)
  if (!v) return 'empty'
  if (hasMarkupText(v)) return 'markup'
  if (sameText(v, input.current)) return 'same_as_current'
  const r = titleRangeFor(input.kind)
  if (v.length < r.min || v.length > r.max) return 'length'
  if ((input.kind === 'title_short' || input.kind === 'title_missing') && normText(input.current).length >= v.length) return 'not_longer'
  const k = normText(input.keyword)
  if ((input.kind === 'title_short' || input.kind === 'title_missing') && k && !v.toLocaleLowerCase().includes(k.toLocaleLowerCase())) return 'no_keyword'
  if (/[\s|–—:,-]$/.test(v)) return 'dangling'
  return null
}

const containsText = (a: string, b: string) => !!b && a.toLocaleLowerCase().includes(b.toLocaleLowerCase())

/** Deterministic candidates from the page's own words, most natural first. */
export function titleCandidates(input: TitleInput): string[] {
  const current = normText(input.current)
  const h1 = normText(input.h1)
  const site = normText(input.siteName)
  const k = normText(input.keyword)
  const out: string[] = []
  const push = (s: string | null) => { const v = normText(s); if (v && !out.some((x) => sameText(x, v))) out.push(v) }
  const fit = (base: string, tail: string, max: number) => {
    const b = normText(base)
    if (!b) return null
    if (b.length + tail.length <= max) return `${b}${tail}`
    const cut = cutAtWord(b, max - tail.length)
    return cut.length >= 15 ? `${cut}${tail}` : null
  }
  if (input.kind === 'title_long') {
    const head = withoutSuffix(current)
    // A whole clause first ("About the studio – the full story of…"), then a cut at a word.
    push(cutAtClause(head, TITLE_RANGE.max, TITLE_RANGE.min))
    push(cutAtWord(head, TITLE_RANGE.max))
    push(cutAtWord(current, TITLE_RANGE.max))
    return out
  }
  const bases: string[] = []
  const addBase = (b: string | null) => { const v = normText(b); if (v && !bases.some((x) => sameText(x, v))) bases.push(v) }
  const coreCur = withoutSuffix(current)
  if (coreCur && h1 && !containsText(coreCur, h1) && !containsText(h1, coreCur)) addBase(`${h1} – ${coreCur}`)
  if (k && h1 && !containsText(h1, k)) addBase(`${k} – ${h1}`)
  if (k && coreCur && !containsText(coreCur, k)) addBase(`${k} – ${coreCur}`)
  addBase(h1)
  addBase(coreCur)
  if (k) addBase(k)
  const r = titleRangeFor(input.kind)
  for (const b of bases) {
    const tails = site && !containsText(b, site) ? [` | ${site}`, ''] : ['']
    for (const tail of tails) push(fit(b, tail, r.max))
  }
  if (input.kind === 'title_duplicate') {
    const words = input.path.split('/').filter(Boolean).pop() ?? ''
    let w = words
    try { w = decodeURIComponent(words) } catch { /* keep */ }
    w = w.replace(/[-_]+/g, ' ').trim()
    if (w) push(fit(`${coreCur} – ${w}`, '', TITLE_RANGE.max))
  }
  return out
}

/** What a suggested description aims for (the owner's rule): 120–140 characters. */
export const DESCRIPTION_GOAL = { min: 120, max: 140 } as const

export function descriptionProblem(candidate: string, current: string | null): string | null {
  const v = normText(candidate)
  if (!v) return 'empty'
  if (hasMarkupText(v)) return 'markup'
  if (sameText(v, current)) return 'same_as_current'
  if (v.length < DESCRIPTION_GOAL.min || v.length > DESCRIPTION_GOAL.max) return 'length'
  return null
}

/** Whole sentences of the page that land in 120–140 characters, or null. */
export function descriptionFromSentences(pageText: string, avoid: string | null = null): string | null {
  const text = normText(pageText)
  const sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? []
  // Any run of consecutive sentences, from the page's opening first.
  for (let start = 0; start < Math.min(sentences.length, 12); start++) {
    let out = ''
    for (let i = start; i < sentences.length; i++) {
      const next = normText(`${out} ${sentences[i]}`)
      if (next.length > DESCRIPTION_GOAL.max) break
      out = next
      // Never the page's current description: the next run of sentences is tried instead.
      if (out.length >= DESCRIPTION_GOAL.min) { if (!sameText(out, avoid)) return out; break }
    }
  }
  return null
}


export interface TitleContext {
  kind: FindingKind
  current: string | null
  h1: string | null
  siteName: string | null
  path: string
}

/**
 * The first title from the page's own words that passes titleProblem (never the current title; a
 * short or missing one 50–60 characters with the page's main heading as its keyword; any other
 * 30–60). An empty string when none passes: no automatic title is offered, the merchant writes it.
 */
export function suggestTitle(ctx: TitleContext): string {
  const input: TitleInput = { kind: ctx.kind, current: ctx.current, h1: ctx.h1, siteName: ctx.siteName, keyword: ctx.h1, path: ctx.path }
  for (const c of titleCandidates(input)) if (!titleProblem(c, input)) return c
  // The heading may be too long to fit whole: the keyword rule then asks only for the title's own words.
  const loose = { ...input, keyword: null }
  for (const c of titleCandidates(loose)) if (!titleProblem(c, loose)) return c
  return ''
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
 * A description of 120–140 characters from the page's own words: whole sentences when a run of
 * them lands there, else the page's words cut at a word, else the current description shortened.
 * Never the current description. Null when nothing passes: the merchant then writes it.
 */
export function suggestDescription(current: string | null, pageText: string): string | null {
  const fromPage = descriptionFromSentences(pageText)
  if (fromPage && !descriptionProblem(fromPage, current)) return fromPage
  const cut = cutAtWord(norm(pageText), DESCRIPTION_GOAL.max)
  if (!descriptionProblem(cut, current)) return cut
  const own = cutAtWord(norm(current), DESCRIPTION_GOAL.max)
  return !descriptionProblem(own, current) ? own : null
}

/** A file name that says nothing: a camera's counter, a hash, a date, a number. */
const JUNK_NAME = /^(?:img|image|dsc|dscn|photo|pic|screenshot|screen shot|whatsapp image|untitled|scaled|\d+|[a-f0-9]{8,})(?:[\s_-]*\d+)*$/i

/**
 * The words of an image's file name, when they are words ("red-running-shoes-1024x768.jpg" →
 * "red running shoes") in the page's own script; null for a camera counter, a hash, a date or a
 * number. Null is exactly when suggestAlt falls back to the page title, so a caller can tell the
 * two apart (automatic fixes allow the title for one image per page only).
 */
export function altFromFileName(src: string, pageTitle = ''): string | null {
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
  return words && letters >= 3 && !JUNK_NAME.test(words) && sameScript ? cutAtWord(words, 120) : null
}

/**
 * Alt text for one image: the words of its file name when they are words
 * (altFromFileName), otherwise the page's title, which is at least what the image
 * is there for.
 */
export function suggestAlt(src: string, pageTitle: string): string {
  return altFromFileName(src, pageTitle) ?? cutAtWord(norm(pageTitle), 120)
}

/** An alt value the merchant typed: plain text, one line, without markup characters. */
export function cleanAlt(v: unknown): string {
  return norm(String(v ?? '')).replace(/[<>"]/g, '').slice(0, 150)
}

/** A title or description the merchant approved: plain text, one line, bounded. */
export function cleanText(v: unknown, max: number): string {
  return norm(String(v ?? '')).replace(/[<>]/g, '').slice(0, max)
}
