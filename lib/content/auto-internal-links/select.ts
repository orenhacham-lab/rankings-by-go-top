/**
 * Automatic internal links (wave 8): at generation, 2 to 5 links from the new
 * article to the site's OWN live pages, chosen and placed with no approval step.
 *
 * WHY. The older flow (a per-topic link plan the customer approves, then an
 * apply step) barely delivered: on Production most approved links were never
 * inserted, a quarter of them had a relevance under 0.5, and most anchors were
 * the target's whole title. This one is deterministic and strict: a link that
 * is not clearly on-topic is not added at all. Fewer good links beat five
 * doubtful ones, so there is no quota to fill.
 *
 * CANDIDATES: the site's own pages, from the latest full-site mapping
 * (site_page_map, lib/content/existing-content): only pages the site itself
 * listed (its sitemaps or its WordPress REST lists) in a completed or partial
 * run, on the site's own host, content URLs only (no cart, tag, author, feed,
 * asset, query string), never the home page or a blog listing, never the
 * article's own address (its slug) or a page with its own title.
 *
 * RELEVANCE, from the target's title against the article's topic (its title,
 * primary and secondary keywords, and its H2/H3 section headings, FAQ
 * excluded):
 *   - the target's CORE tokens are its title's words minus function words,
 *     generic title words ("guide", "complete", "tips") and words most of the
 *     site's titles share (for a site about Japan, "Japan" says nothing);
 *   - at least half of the core tokens are in the article's topic, and either
 *     the rarest core token is in the topic or the anchor carries every core
 *     token;
 *   - a one-word subject that is only a modifier ("nature", "design") never
 *     qualifies on its own;
 *   - a page on exactly the article's own subject is not linked (that is
 *     cannibalization, not support).
 *
 * ANCHOR: words already in the article, never added or changed: the shortest
 * run of up to 6 words that carries the target's core tokens, widened to the
 * target title's words right beside it. So "Okinawa" links the page titled
 * "Okinawa" and "travel insurance to Japan" the page with that title.
 *
 * PLACEMENT: body paragraphs only (never a heading, list, table, quote, the
 * first or last paragraph, the introduction before the first H2, or the FAQ),
 * one link per paragraph, at least two paragraphs apart from every other
 * link, and the article's anchor-quality check (lib/content/anchors-check.ts)
 * must not get a new warning from it. No duplicate targets: one link per page,
 * and one page per subject when the site has two pages on the same subject.
 *
 * Pure: no I/O.
 */
import { canonicalVariants } from '@/lib/content/recommendations/semantic-dup'
import { isModifierToken } from '@/lib/content/recommendations/link-relevance'
import { isBlogListing, isContentUrl, pathSegments, titleFromUrl } from '@/lib/content/existing-content/classify'
import type { SiteMapEntry } from '@/lib/content/existing-content/model'
import { analyzeAnchorQuality } from '@/lib/content/anchors-check'
import { bodyParagraphs, linkTag, plainText, type BodyParagraph } from '@/lib/link-network/anchor'
import { isUrlAlreadyLinked } from '@/lib/content/internal-links'
import { type ContentLanguage } from '@/lib/content/language'
import { indexOfCaseInsensitive } from '@/lib/text/ci-index'

export const AUTO_LINK_LIMITS = { max: 5, maxAnchorWords: 6, minParagraphGap: 2, maxCandidates: 2000 } as const

export interface AutoLinkArticle {
  title: string
  slug: string | null
  primaryKeyword: string | null
  secondaryKeywords: string[]
  html: string
  language: ContentLanguage
}

export interface AutoLinkTarget { url: string; title: string }

export interface ChosenAutoLink { url: string; title: string; anchor: string; paragraph: number }

export interface AutoLinkSelection {
  html: string
  links: ChosenAutoLink[]
  /** Why each considered page was not linked (for the log and the guard). */
  skipped: { url: string; reason: 'not_relevant' | 'same_subject' | 'no_anchor' | 'duplicate' | 'quality' | 'limit' }[]
}

// ── Tokens ────────────────────────────────────────────────────────────────────

const FUNCTION_WORDS = new Set([
  'של', 'את', 'עם', 'על', 'אל', 'כי', 'גם', 'או', 'אבל', 'יש', 'אין', 'הכי', 'כל', 'כדי', 'בין', 'ללא', 'לכל', 'זה', 'זו', 'זאת',
  'הוא', 'היא', 'הם', 'הן', 'מה', 'מהו', 'מהי', 'מהם', 'איך', 'כיצד', 'למה', 'מדוע', 'מתי', 'איפה', 'היכן', 'האם', 'כמה', 'לפני',
  'אחרי', 'ועוד', 'עוד', 'יותר', 'ביותר', 'מול', 'אתם', 'לכם', 'שלכם', 'עבורך', 'עבורכם', 'הנה', 'ממש', 'אנחנו', 'שלנו', 'כך',
  'the', 'a', 'an', 'to', 'of', 'for', 'and', 'or', 'in', 'on', 'at', 'with', 'how', 'what', 'why', 'when', 'where', 'is', 'are',
  'your', 'you', 'our', 'we', 'vs', 'versus', 'from', 'by', 'about', 'this', 'that', 'it', 'its',
])
const TITLE_GENERIC = new Set([
  'מדריך', 'המדריך', 'מדריכים', 'המלא', 'מלא', 'השלם', 'שלם', 'טיפים', 'טיפ', 'הכירו', 'להכיר', 'לבחור', 'לבחירת', 'בחירת',
  'כדאי', 'שכדאי', 'מומלץ', 'מומלצים', 'המומלצים', 'המומלצות', 'מומלצות', 'חייבים', 'חשוב', 'דברים', 'רשימת', 'סקירה', 'השוואה',
  'guide', 'complete', 'ultimate', 'tips', 'best', 'top', 'things', 'know', 'list', 'review', 'overview', 'everything',
])

const EDGE = /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu
const HEBREW = /^[א-ת]+$/

export interface Tok { primary: string[]; all: string[] }

/** One surface word → its match forms: canonical (+ a feminine/plural fold) and, beside them, a de-prefixed form. */
export function tokenOf(surface: string): Tok | null {
  const w = surface.toLowerCase().normalize('NFKC').replace(EDGE, '')
  if (w.length < 2 || /^\d+$/.test(w)) return null
  const vs = canonicalVariants(w)
  const fold = (v: string): string[] => {
    const out = [v]
    if (HEBREW.test(v) && v.length >= 4 && v.endsWith('ה')) out.push(v.slice(0, -1))
    if (/^[a-z]+$/.test(v) && v.length >= 4 && v.endsWith('s')) out.push(v.slice(0, -1))
    return out
  }
  const primary = fold(vs[0])
  const all = Array.from(new Set(vs.flatMap(fold)))
  return { primary, all }
}

/**
 * Two words are the same word when one side's own form is among the other's
 * forms (a prefix is stripped on one side only: "ליפן" matches "יפן", but
 * "מלונות" never meets "בלונים" through a shared stripped stem).
 */
export function sameToken(a: Tok, b: Tok): boolean {
  return a.primary.some((p) => b.all.includes(p)) || b.primary.some((p) => a.all.includes(p))
}

const isFunctionWord = (surface: string) => {
  const w = surface.toLowerCase().replace(EDGE, '')
  return FUNCTION_WORDS.has(w) || TITLE_GENERIC.has(w) || TITLE_GENERIC.has(w.replace(/^[והבלמשכ]/, ''))
}

const wordsOf = (text: string) => text.split(/\s+/).map((w) => w.replace(EDGE, '')).filter(Boolean)

function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => { const c = Number(n); return c > 0 && c < 0x110000 ? String.fromCodePoint(c) : ' ' })
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => { const c = parseInt(n, 16); return c > 0 && c < 0x110000 ? String.fromCodePoint(c) : ' ' })
    .replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
}

/** The subject part of a title: before its first ":" / " – " / " | " (when that part names something). */
function headOf(title: string): string {
  const head = title.split(/\s[–—-]\s|:|\|/)[0]?.trim() ?? ''
  return wordsOf(head).some((w) => !isFunctionWord(w)) ? head : title
}

// ── Candidates ────────────────────────────────────────────────────────────────

const hostOf = (u: string) => { try { return new URL(u).hostname.toLowerCase().replace(/^www\./, '') } catch { return '' } }

/** Its path as a comparable key: decoded, lowercase, no trailing slash. */
const pathKey = (u: string) => (pathSegments(u) ?? []).join('/')

/**
 * The site's own pages that may be linked: from the mapping's entries, on the
 * site's host, content pages only, with a readable title, never the home page,
 * a blog listing, or the article itself.
 */
export function autoLinkCandidates(
  entries: readonly SiteMapEntry[] | null | undefined,
  site: { host: string },
  article: { title: string; slug: string | null },
): AutoLinkTarget[] {
  const host = site.host.toLowerCase().replace(/^www\./, '')
  const slug = decodeSlug(article.slug)
  const ownTitle = normTitle(article.title)
  const seen = new Set<string>()
  const out: AutoLinkTarget[] = []
  for (const e of entries ?? []) {
    if (out.length >= AUTO_LINK_LIMITS.maxCandidates) break
    if (!e || typeof e.u !== 'string') continue
    const url = e.u.trim()
    if (!/^https:\/\//i.test(url) || hostOf(url) !== host) continue
    if (!isContentUrl(url) || isBlogListing(url)) continue
    const segs = pathSegments(url) ?? []
    if (segs.length === 0) continue
    const key = segs.join('/')
    if (seen.has(key)) continue
    if (slug && segs[segs.length - 1] === slug) continue
    const title = decodeEntities(String(e.t ?? '')).replace(/\s+/g, ' ').trim() || titleFromUrl(url)
    if (!title || /[<>]/.test(title)) continue
    if (ownTitle && normTitle(title) === ownTitle) continue
    seen.add(key)
    out.push({ url, title })
  }
  return out
}

function decodeSlug(slug: string | null): string {
  if (!slug) return ''
  try { return decodeURIComponent(slug).toLowerCase().replace(/^\/+|\/+$/g, '') } catch { return slug.toLowerCase() }
}
const normTitle = (s: string) => s.toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()

// ── Relevance ─────────────────────────────────────────────────────────────────

interface CoreTok { tok: Tok; df: number }
interface Target extends AutoLinkTarget { core: CoreTok[]; title_toks: Tok[]; head_all: Tok[] }

const inList = (t: Tok, list: readonly Tok[]) => list.some((x) => sameToken(t, x))

function prepareTargets(targets: readonly AutoLinkTarget[]): { targets: Target[]; siteWideTok: (tok: Tok) => boolean; rare: (d: number) => boolean } {
  const titleToks = targets.map((t) => wordsOf(headOf(t.title)).filter((w) => !isFunctionWord(w)).map(tokenOf).filter((x): x is Tok => !!x))
  const n = targets.length
  const df = (tok: Tok) => titleToks.reduce((k, toks) => k + (toks.some((x) => sameToken(tok, x)) ? 1 : 0), 0)
  // A word most of the site's titles share names the site, not the page.
  const siteWide = (d: number) => n >= 8 && d >= 3 && d / n > 0.2
  // A page named by ONE word is linked only when that word names few pages ("Kyoto", not "trip").
  const rare = (d: number) => n < 8 || d <= 2 || d / n <= 0.1
  const prepared = targets.map((t, i) => {
    const toks = titleToks[i]
    const core: CoreTok[] = []
    for (const tok of toks) {
      if (core.some((c) => sameToken(c.tok, tok))) continue
      const d = df(tok)
      if (!siteWide(d)) core.push({ tok, df: d })
    }
    const headAll = wordsOf(headOf(t.title)).map(tokenOf).filter((x): x is Tok => !!x)
    return { ...t, core, title_toks: toks, head_all: headAll }
  })
  return { targets: prepared, siteWideTok: (tok) => siteWide(df(tok)), rare }
}

// ── The article ───────────────────────────────────────────────────────────────

interface Para extends BodyParagraph { words: { surface: string; tok: Tok | null }[] }

const FAQ_HEADING = /^(?:שאלות\s+(?:ו)?תשובות|שאלות\s+נפוצות|faq|frequently asked questions)\b/i

/** Headings of the body (not the FAQ), and where the first H2 and the FAQ start. */
function articleShape(html: string): { headings: string[]; firstH2: number; faqAt: number } {
  const headings: string[] = []
  let firstH2 = -1
  let faqAt = -1
  const re = /<h([23])(\s[^>]*)?>([\s\S]*?)<\/h\1\s*>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    const text = plainText(m[3])
    const isFaq = m[1] === '2' && (FAQ_HEADING.test(text) || /\bid=["']faq["']/i.test(m[2] ?? ''))
    if (isFaq && faqAt < 0) faqAt = m.index
    if (m[1] === '2' && firstH2 < 0) firstH2 = m.index
    if (faqAt < 0) headings.push(text)
  }
  return { headings, firstH2, faqAt }
}

function eligibleParagraphs(html: string): Para[] {
  const { firstH2, faqAt } = articleShape(html)
  if (firstH2 < 0) return []
  return bodyParagraphs(html)
    .filter((p) => p.innerStart > firstH2 && (faqAt < 0 || p.innerStart < faqAt))
    .map((p) => ({ ...p, words: p.text.split(/\s+/).filter(Boolean).map((surface) => ({ surface, tok: tokenOf(surface) })) }))
}

/** Paragraph indexes (among all <p>) that already hold a link. */
function linkedParagraphs(html: string): number[] {
  const out: number[] = []
  const re = /<p(\s[^>]*)?>([\s\S]*?)<\/p\s*>/gi
  let m: RegExpExecArray | null
  let i = 0
  while ((m = re.exec(html))) {
    if (/<a[\s>]/i.test(m[2])) out.push(i)
    i++
  }
  return out
}

// ── Anchor ────────────────────────────────────────────────────────────────────

/**
 * The anchor for this target in this paragraph: the shortest run of words that
 * carries the required core tokens (at most maxAnchorWords), widened to the
 * target title's own words right beside it. Null when the paragraph has none.
 */
function anchorIn(p: Para, target: Target, required: Tok[], ownKeyword: Tok[]): string | null {
  const w = p.words
  const spans: [number, number][] = []
  for (let i = 0; i < w.length; i++) {
    if (!w[i].tok || !required.some((r) => sameToken(r, w[i].tok!))) continue
    let j = i
    const left = required.filter((r) => !sameToken(r, w[i].tok!))
    while (left.length && j + 1 < w.length && j + 1 - i < AUTO_LINK_LIMITS.maxAnchorWords) {
      j++
      const t = w[j].tok
      if (!t) continue
      const k = left.findIndex((r) => sameToken(r, t))
      if (k >= 0) left.splice(k, 1)
    }
    if (!left.length) spans.push([i, j])
  }
  spans.sort((a, b) => (a[1] - a[0]) - (b[1] - b[0]) || a[0] - b[0])
  const titleWord = (k: number) => !!w[k]?.tok && inList(w[k].tok!, target.title_toks)
  // A word that ends in punctuation closes the phrase.
  const closes = (k: number) => /[^\p{L}\p{N}]$/u.test(w[k].surface)
  for (const span of spans) {
    let [s, e] = span
    const headWord = (k: number) => !!w[k]?.tok && inList(w[k].tok!, target.head_all)
    for (;;) {
      if (e + 1 < w.length && e - s + 1 < AUTO_LINK_LIMITS.maxAnchorWords && !closes(e) && titleWord(e + 1)) { e++; continue }
      // "איתור נזילות ללא הרס": a small word of the title's own phrase, then the title's next word.
      if (e + 2 < w.length && e - s + 2 < AUTO_LINK_LIMITS.maxAnchorWords && !closes(e) && !closes(e + 1) && headWord(e + 1) && titleWord(e + 2)) { e += 2; continue }
      break
    }
    while (s > 0 && e - s + 1 < AUTO_LINK_LIMITS.maxAnchorWords && !closes(s - 1) && titleWord(s - 1)) s--
    // Never across a sentence, a list comma, a dash or a bracket.
    let crosses = false
    for (let k = s; k < e; k++) if (/[.,!?;:()[\]"״–—]$/u.test(w[k].surface)) crosses = true
    if (crosses) continue
    // A phrase, not a stretch of text: at most one word inside it that is not the target's own.
    let foreign = 0
    for (let k = s + 1; k < e; k++) if (!titleWord(k)) foreign++
    if (foreign > 1) continue
    // The article's own keyword stays with the article: it never links away.
    const inAnchor = w.slice(s, e + 1).map((x) => x.tok).filter((x): x is Tok => !!x)
    if (ownKeyword.length && ownKeyword.every((k) => inList(k, inAnchor))) continue
    const phrase = w.slice(s, e + 1).map((x) => x.surface).join(' ').replace(EDGE, '')
    if (phrase.length < 2 || phrase.length > 80 || /[<>"&]/.test(phrase)) continue
    if (isFunctionWord(phrase)) continue
    return phrase
  }
  return null
}

const escText = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const LETTER = /[\p{L}\p{N}]/u

/**
 * Wrap the anchor's words, where they stand as text in this paragraph, in one
 * plain link (no class, no rel: the site's own page). Whole words only, never
 * inside a tag. Null when they are not there as plain text.
 */
export function wrapAnchor(html: string, p: BodyParagraph, anchor: string, url: string): string | null {
  const inner = html.slice(p.innerStart, p.innerEnd)
  if (/<a[\s>]/i.test(inner)) return null
  const needle = escText(anchor)
  const seg = /(^|>)([^<]+)/g
  let m: RegExpExecArray | null
  while ((m = seg.exec(inner))) {
    const text = m[2]
    const segStart = m.index + m[1].length
    let from = 0
    for (;;) {
      const k = indexOfCaseInsensitive(text, needle, from)
      if (k < 0) break
      from = k + 1
      const before = text[k - 1] ?? ''
      const after = text[k + needle.length] ?? ''
      if ((before && LETTER.test(before)) || (after && LETTER.test(after))) continue
      const at = p.innerStart + segStart + k
      return `${html.slice(0, at)}${linkTag(url, 'follow')}${html.slice(at, at + needle.length)}</a>${html.slice(at + needle.length)}`
    }
  }
  return null
}

// ── Selection ─────────────────────────────────────────────────────────────────

/** Choose and place the links. Returns the new body and what was added. */
export function selectAutoLinks(article: AutoLinkArticle, targets: readonly AutoLinkTarget[]): AutoLinkSelection {
  const skipped: AutoLinkSelection['skipped'] = []
  const { targets: prepared, siteWideTok, rare } = prepareTargets(targets)
  const shape = articleShape(article.html)
  const topicText = [article.title, article.primaryKeyword ?? '', ...article.secondaryKeywords, ...shape.headings].join(' ')
  const topic = wordsOf(topicText).map(tokenOf).filter((x): x is Tok => !!x)
  const strong = wordsOf([article.title, article.primaryKeyword ?? '', ...article.secondaryKeywords].join(' ')).map(tokenOf).filter((x): x is Tok => !!x)
  // The article's own subject, without the words the whole site shares.
  const primaryToks = wordsOf(article.primaryKeyword ?? '').filter((w) => !isFunctionWord(w)).map(tokenOf).filter((x): x is Tok => !!x && !siteWideTok(x))

  type Scored = { t: Target; score: number; required: Tok[] }
  const scored: Scored[] = []
  for (const t of prepared) {
    if (t.core.length === 0) { skipped.push({ url: t.url, reason: 'not_relevant' }); continue }
    const core = t.core.map((c) => c.tok)
    if (t.core.length === 1 && (isModifierToken(core[0].primary[0]) || !rare(t.core[0].df))) { skipped.push({ url: t.url, reason: 'not_relevant' }); continue }
    const inTopic = core.filter((c) => inList(c, topic))
    if (inTopic.length < Math.ceil(core.length / 2)) { skipped.push({ url: t.url, reason: 'not_relevant' }); continue }
    // The article's own subject: every core token of the page is in the article's primary keyword, and back.
    if (primaryToks.length && core.every((c) => inList(c, primaryToks)) && primaryToks.every((pk) => inList(pk, core))) {
      skipped.push({ url: t.url, reason: 'same_subject' }); continue
    }
    const rarest = [...t.core].sort((a, b) => a.df - b.df)[0].tok
    const rarestInTopic = inList(rarest, topic)
    // Required in the anchor: all core tokens up to two; with more, two thirds including the rarest.
    const need = core.length <= 2 ? core : [rarest, ...core.filter((c) => c !== rarest)].slice(0, Math.ceil((core.length * 2) / 3))
    const required = rarestInTopic ? need : core
    const score = inTopic.length / core.length * 2 + (rarestInTopic ? 1 : 0) + (inList(rarest, strong) ? 1 : 0) + Math.min(core.length, 3) * 0.1
    scored.push({ t, score, required })
  }
  scored.sort((a, b) => b.score - a.score || a.t.core.length - b.t.core.length || a.t.url.localeCompare(b.t.url))

  let html = article.html
  const baseWarnings = new Set(analyzeAnchorQuality(html, article.language).warnings)
  const used = new Set<number>(linkedParagraphs(html))
  const links: ChosenAutoLink[] = []
  const subjects: Tok[][] = []
  for (const s of scored) {
    const t = s.t
    if (links.length >= AUTO_LINK_LIMITS.max) { skipped.push({ url: t.url, reason: 'limit' }); continue }
    if (isUrlAlreadyLinked(html, t.url) || links.some((l) => pathKey(l.url) === pathKey(t.url))) { skipped.push({ url: t.url, reason: 'duplicate' }); continue }
    const core = t.core.map((c) => c.tok)
    // Two pages on one subject (the same core words): link only the first.
    if (subjects.some((sub) => sub.length === core.length && sub.every((x) => inList(x, core)))) { skipped.push({ url: t.url, reason: 'duplicate' }); continue }
    let placed = false
    let sawAnchor = false
    for (const p of eligibleParagraphs(html)) {
      if ([...used].some((u) => Math.abs(u - p.index) < AUTO_LINK_LIMITS.minParagraphGap)) continue
      const anchor = anchorIn(p, t, s.required, primaryToks)
      if (!anchor) continue
      sawAnchor = true
      const next = wrapAnchor(html, p, anchor, t.url)
      if (!next) continue
      const warnings = analyzeAnchorQuality(next, article.language).warnings
      if (warnings.some((w) => !baseWarnings.has(w))) continue
      html = next
      used.add(p.index)
      links.push({ url: t.url, title: t.title, anchor, paragraph: p.index })
      subjects.push(core)
      placed = true
      break
    }
    if (!placed) skipped.push({ url: t.url, reason: sawAnchor ? 'quality' : 'no_anchor' })
  }
  return { html, links, skipped }
}

export { pathKey as autoLinkPathKey, hostOf as autoLinkHost }
