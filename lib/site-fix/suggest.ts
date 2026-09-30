/**
 * Suggested values the merchant sees before approving a fix, and the checks each one must pass
 * BEFORE it is offered. Server-side only (the model call); the checks themselves are pure.
 *
 *   seo_title         never the current title (compared trimmed, case-folded); a too-short or
 *                     missing title gets 50–60 characters that contain the page's main keyword; a
 *                     long or duplicated one 30–60. Deterministic candidates from the page's own
 *                     words first, then the model is asked for three, each checked again. None
 *                     valid → no automatic fix is offered (`no_valid_suggestion`).
 *   meta_description  120–140 characters, never the current description: whole sentences of the
 *                     page first, then the model (facts of the page only), then the page's own
 *                     words cut at a word. None valid → no automatic fix.
 *   faq_block         3–5 questions and answers written ONLY from the page's own text, in the
 *                     page's language. Every answer is checked against the page (its words and
 *                     every number must be there); an answer that is not is dropped. A page with too
 *                     little text gets `thin_content`: we say so instead of inventing.
 *   llms_txt          the site's name, one line about it and its key pages with one line each,
 *                     from the site's own pages (site_page_map, or the home page's links) and their
 *                     own descriptions. Nothing is invented.
 *
 * The model is injected (`Generate`), so every rule here runs under test without a network, and a
 * missing key or a failed call only means "no model help": the deterministic path still runs.
 */
import {
  cutAtWord, DESCRIPTION_GOAL, descriptionFromSentences, descriptionProblem, sameText, textOf, titleCandidates, titleProblem,
  titleRangeFor, type TitleInput,
} from '@/lib/site-health/rules'
import { llmsTextOk } from './whitelist'
import type { FaqItem } from './types'

export type Generate = (prompt: string) => Promise<string>

// ── Shared ──────────────────────────────────────────────────────────────────

const norm = (s: string | null | undefined) => String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim()
const hasMarkup = (s: string) => /[<>]/.test(s)

/** The page's language, as far as its letters tell: Hebrew or not. */
export function pageLanguage(text: string): 'he' | 'en' {
  const letters = (text.match(/\p{L}/gu) ?? []).length
  const hebrew = (text.match(/\p{Script=Hebrew}/gu) ?? []).length
  return letters > 0 && hebrew / letters >= 0.3 ? 'he' : 'en'
}
const langName = (l: 'he' | 'en') => (l === 'he' ? 'Hebrew' : 'the same language as the page text')

async function ask(generate: Generate | undefined, prompt: string): Promise<unknown> {
  if (!generate) return null
  try {
    const raw = await generate(prompt)
    const trimmed = String(raw ?? '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '')
    return JSON.parse(trimmed) as unknown
  } catch {
    return null
  }
}
const strings = (v: unknown, key: string): string[] => {
  const list = (v && typeof v === 'object' ? (v as Record<string, unknown>)[key] : null)
  return Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string').map(norm) : []
}

// ── Titles ──────────────────────────────────────────────────────────────────
// The checks and the page's-own-words candidates live in lib/site-health/rules.ts (pure, shared
// with the older preview); here the model is asked when none of them passes.

export { DESCRIPTION_GOAL, TITLE_GOAL, TITLE_RANGE, descriptionProblem, sameText, titleProblem, titleRangeFor } from '@/lib/site-health/rules'
export type { TitleInput }

function titlePrompt(input: TitleInput, lang: 'he' | 'en'): string {
  const r = titleRangeFor(input.kind)
  return [
    `Write 5 different SEO titles (the <title> Google shows) in ${langName(lang)} for one page of ${input.siteName ? `the website "${input.siteName}"` : 'a website'}.`,
    `Current title: ${norm(input.current) || '(none)'}`,
    `Main heading: ${norm(input.h1) || '(none)'}`,
    input.keyword ? `Each title MUST contain this exact keyword: ${norm(input.keyword)}` : '',
    input.text ? `Page text (the only source of facts): ${norm(input.text).slice(0, 1200)}` : '',
    `Rules: each title between ${r.min} and ${r.max} characters (aim for ${Math.round((r.min + r.max) / 2)}), counting spaces. Different from the current title. Describe what the page offers; you may end with " | ${norm(input.siteName) || 'brand'}" when it fits.`,
    'No quotes, no emoji, no ALL CAPS, no invented claims, prices or dates.',
    'Return JSON: {"titles": ["…", "…", "…", "…", "…"]}',
  ].filter(Boolean).join('\n')
}

const SUFFIX_SEPARATORS = [' | ', ' - ', ' – ', ' — ', ' · ']
const trimDangling = (s: string) => norm(s).replace(/[\s|–—:,;·-]+$/u, '')

/**
 * A model title a few characters off the window, brought into it WITHOUT new words (wave 9: a
 * "title too short" page was never fixed because the model rarely lands exactly on 50–60
 * characters in Hebrew, and every near miss was thrown away). Too long: its " | brand" tail
 * dropped, else cut at a word. Too short: the site's name added as a tail. Each result is
 * checked again by titleProblem, so nothing outside the rules is ever offered.
 */
export function titleFits(candidate: string, input: Pick<TitleInput, 'kind' | 'siteName'>): string[] {
  const r = titleRangeFor(input.kind)
  const v = norm(candidate)
  const out = [v]
  const site = norm(input.siteName)
  if (v.length > r.max) {
    for (const sep of SUFFIX_SEPARATORS) {
      const i = v.lastIndexOf(sep)
      if (i >= r.min) out.push(v.slice(0, i).trim())
    }
    out.push(trimDangling(cutAtWord(v, r.max)))
  } else if (v.length < r.min && site && !v.toLocaleLowerCase().includes(site.toLocaleLowerCase())) {
    out.push(`${v} | ${site}`)
  }
  return out
}

/**
 * The last resort for a too-short or missing title, from the page's own words only: its main
 * keyword (or heading) with the first sentence of its description or of its text, cut at a word.
 */
export function titlesFromPage(input: TitleInput): string[] {
  if (input.kind !== 'title_short' && input.kind !== 'title_missing') return []
  const lead = norm(input.keyword) || norm(input.h1)
  const source = norm(input.description) || norm(input.text)
  if (!lead || !source) return []
  const first = (source.split(/(?<=[.!?])\s/u)[0] ?? '').replace(/[.!?]+$/u, '').trim()
  if (!first) return []
  const r = titleRangeFor(input.kind)
  const body = first.toLocaleLowerCase().includes(lead.toLocaleLowerCase()) ? first : `${lead} – ${first}`
  return [trimDangling(cutAtWord(body, r.max)), ...titleFits(trimDangling(cutAtWord(body, r.max - 12)), input)]
}

/** The first title that passes titleProblem: the page's own words, then the model (near misses fitted), then the page's text. */
export async function suggestSeoTitle(input: TitleInput, generate?: Generate): Promise<string | null> {
  for (const c of titleCandidates(input)) if (!titleProblem(c, input)) return c
  const lang = pageLanguage(`${norm(input.h1)} ${norm(input.current)} ${norm(input.text)}`)
  for (let attempt = 0; attempt < 2; attempt++) {
    const answer = await ask(generate, titlePrompt(input, lang))
    for (const raw of strings(answer, 'titles')) for (const c of titleFits(raw, input)) if (!titleProblem(c, input)) return c
  }
  for (const c of titlesFromPage(input)) if (!titleProblem(c, input)) return c
  return null
}

// ── Descriptions ────────────────────────────────────────────────────────────

function descriptionPrompt(text: string, title: string, lang: 'he' | 'en'): string {
  return [
    `Write 3 different meta descriptions in ${langName(lang)} for this web page.`,
    `Page title: ${norm(title) || '(none)'}`,
    `Page text (the ONLY source of facts; do not add anything that is not in it): ${norm(text).slice(0, 2500)}`,
    `Rules: each between ${DESCRIPTION_GOAL.min} and ${DESCRIPTION_GOAL.max} characters counting spaces, one or two complete sentences, what the page offers and why to click.`,
    'No quotes, no emoji, no prices, dates, phone numbers or promises that are not in the text.',
    'Return JSON: {"descriptions": ["…", "…", "…"]}',
  ].join('\n')
}

export async function suggestMetaDescription(input: { current: string | null; text: string; title: string }, generate?: Generate): Promise<string | null> {
  const text = norm(input.text)
  const fromPage = descriptionFromSentences(text, input.current)
  if (fromPage && !descriptionProblem(fromPage, input.current)) return fromPage
  if (text.length >= 80) {
    const lang = pageLanguage(`${input.title} ${text}`)
    for (let attempt = 0; attempt < 2; attempt++) {
      const answer = await ask(generate, descriptionPrompt(text, input.title, lang))
      for (const c of strings(answer, 'descriptions')) if (!descriptionProblem(c, input.current)) return c
    }
  }
  const cut = cutAtWord(text, DESCRIPTION_GOAL.max)
  return !descriptionProblem(cut, input.current) ? cut : null
}

// ── FAQ from the page ───────────────────────────────────────────────────────

/** Below this the page has too little of its own to answer questions from. */
export const FAQ_MIN_CHARS = 500
export const FAQ_MIN_WORDS = 80
export const FAQ_ITEMS = { min: 2, max: 5 } as const
/** Share of an answer's words that must be the page's own. */
export const FAQ_GROUNDING = 0.75

const HEBREW_PREFIX = /^[והבלמשכ]{1,2}(?=\p{Script=Hebrew}{3,})/u
/** Hebrew plural and feminine endings (טיסות/טיסה, מסלולים/מסלול), so a sentence that says the page's words in another form still counts as the page's. */
const HEBREW_SUFFIX = /(?:ים|ות|ה|ת)$/u
function variants(token: string): string[] {
  const t = token.toLocaleLowerCase()
  const out = [t]
  const bare = t.replace(HEBREW_PREFIX, '')
  if (bare !== t) out.push(bare)
  for (const w of [t, bare]) {
    if (/\p{Script=Hebrew}{4,}$/u.test(w) && HEBREW_SUFFIX.test(w)) out.push(w.replace(HEBREW_SUFFIX, ''))
  }
  if (t.length > 4 && /s$/.test(t)) out.push(t.slice(0, -1))
  return out
}
const wordsOf = (s: string) => (s.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? []).filter((w) => w.length >= 3 || /\d/.test(w))
/** Numbers as written, thousands separators dropped (1,500 and 1500 are the same number). */
const numbersOf = (s: string) => (s.match(/\d+(?:[.,]\d+)*/g) ?? []).map((n) => n.replace(/,(?=\d{3}\b)/g, ''))

/** Whether an answer says only what the page says: its words are the page's, and every number is. */
export function grounded(answer: string, pageText: string, share = FAQ_GROUNDING): boolean {
  const page = new Set<string>()
  for (const w of wordsOf(pageText)) for (const v of variants(w)) page.add(v)
  const words = wordsOf(answer)
  if (words.length === 0) return false
  const hit = words.filter((w) => variants(w).some((v) => page.has(v))).length
  if (hit / words.length < share) return false
  const pageNumbers = new Set(numbersOf(pageText))
  return numbersOf(answer).every((n) => pageNumbers.has(n))
}

export function thinContent(text: string): boolean {
  const t = norm(text)
  return t.length < FAQ_MIN_CHARS || wordsOf(t).length < FAQ_MIN_WORDS
}

function faqPrompt(text: string, title: string, lang: 'he' | 'en'): string {
  return [
    `Write frequently asked questions with answers, in ${langName(lang)}, for the web page below.`,
    `Page title: ${norm(title) || '(none)'}`,
    'Page text (the ONLY source; every answer must be stated in it, using its own words where possible):',
    norm(text).slice(0, 6000),
    `Rules: ${FAQ_ITEMS.min + 1} to ${FAQ_ITEMS.max} pairs. Questions a real customer would ask, each ending with a question mark. Answers of 1 to 3 short sentences, taken only from the page text.`,
    'Never add a fact, number, price, date, name or promise that is not in the text. If the text cannot answer a question, leave that question out. If it cannot answer any, return an empty list.',
    'Plain text only, no markdown, no HTML.',
    'Return JSON: {"items": [{"q": "…", "a": "…"}]}',
  ].join('\n')
}

export type FaqSuggestion =
  | { ok: true; heading: string; items: FaqItem[]; language: 'he' | 'en' }
  | { ok: false; code: 'thin_content' | 'no_valid_suggestion'; heading: string; language: 'he' | 'en' }

export const FAQ_HEADING = { he: 'שאלות נפוצות', en: 'Frequently asked questions' } as const

/** Questions and answers from the page's own text, each checked against it. */
export async function suggestFaq(input: { text: string; title: string }, generate?: Generate): Promise<FaqSuggestion> {
  const text = norm(input.text)
  const language = pageLanguage(`${input.title} ${text}`)
  const heading = FAQ_HEADING[language]
  if (thinContent(text)) return { ok: false, code: 'thin_content', heading, language }
  // Asked twice at most, like titles: one answer whose pairs fail the page check is not the last word.
  let items: FaqItem[] = []
  for (let attempt = 0; attempt < 2 && items.length < FAQ_ITEMS.min; attempt++) {
    items = checkedFaq(await ask(generate, faqPrompt(text, input.title, language)), text)
  }
  if (items.length < FAQ_ITEMS.min) return { ok: false, code: 'no_valid_suggestion', heading, language }
  return { ok: true, heading, items, language }
}

/** The pairs of one model answer that pass every check against the page. */
function checkedFaq(answer: unknown, text: string): FaqItem[] {
  const raw = answer && typeof answer === 'object' ? (answer as { items?: unknown }).items : null
  const items: FaqItem[] = []
  for (const x of Array.isArray(raw) ? raw : []) {
    const q = norm((x as { q?: unknown })?.q as string)
    const a = norm((x as { a?: unknown })?.a as string)
    if (!q || !a || hasMarkup(q) || hasMarkup(a)) continue
    if (q.length < 5 || q.length > 200 || a.length < 10 || a.length > 600) continue
    if (!/[?？]$/.test(q)) continue
    if (items.some((i) => sameText(i.q, q))) continue
    if (!grounded(a, text)) continue
    items.push({ q, a })
    if (items.length >= FAQ_ITEMS.max) break
  }
  return items
}

// ── llms.txt ────────────────────────────────────────────────────────────────

export interface LlmsPage { url: string; title: string; summary: string | null; group: 'page' | 'article' | 'product' | 'category' }

const LLMS_GROUPS: Record<'he' | 'en', Record<LlmsPage['group'], string>> = {
  he: { page: 'עמודים עיקריים', category: 'קטגוריות', product: 'מוצרים', article: 'מאמרים ומדריכים' },
  en: { page: 'Key pages', category: 'Categories', product: 'Products', article: 'Articles and guides' },
}
/** At most this many pages in the file, and this many per group. */
export const LLMS_MAX_PAGES = 20
const LLMS_PER_GROUP: Record<LlmsPage['group'], number> = { page: 8, category: 5, product: 6, article: 8 }

const line = (s: string | null | undefined) => norm(s).replace(/[<>]/g, '').replace(/\[/g, '(').replace(/\]/g, ')')

/** The llms.txt text (https://llmstxt.org): a name, one line about the site, its key pages. */
export function buildLlmsTxt(site: { name: string; description: string | null; language: 'he' | 'en' }, pages: readonly LlmsPage[]): string | null {
  const name = line(site.name)
  if (!name) return null
  const parts: string[] = [`# ${name}`, '']
  const about = site.description ? cutAtWord(line(site.description), 200) : ''
  if (about) parts.push(`> ${about}`, '')
  let total = 0
  for (const group of ['page', 'category', 'product', 'article'] as const) {
    const list = pages.filter((p) => p.group === group).slice(0, LLMS_PER_GROUP[group])
    if (list.length === 0 || total >= LLMS_MAX_PAGES) continue
    parts.push(`## ${LLMS_GROUPS[site.language][group]}`, '')
    for (const p of list) {
      if (total >= LLMS_MAX_PAGES) break
      const title = cutAtWord(line(p.title), 90) || p.url
      const summary = p.summary ? cutAtWord(line(p.summary), 140) : ''
      if (!/^https?:\/\/[^\s()<>]+$/.test(p.url)) continue
      parts.push(`- [${title}](${p.url})${summary ? `: ${summary}` : ''}`)
      total++
    }
    parts.push('')
  }
  if (total === 0) return null
  return llmsTextOk(parts.join('\n'))
}

/** The page's visible text, for the prompts (a helper the preview shares). */
export const pageTextOf = (html: string) => textOf(html)
