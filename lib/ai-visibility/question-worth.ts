/**
 * Is a suggested AI question worth this business's time and quota?
 *
 * The owner's rule: suggest only questions the business can realistically win,
 * each with a plain reason, and never a generic or unrelated one. A question is
 * scored on three things and shown only at WORTH_THRESHOLD or above:
 *
 *   relevance   (0-50)  it names what the business is: a word of the business
 *                       itself (the scan niche or the owner's own words, the
 *                       category's offerings, the business name) is REQUIRED;
 *                       tracked keywords and the scan's audiences/seed
 *                       keywords add to it. No such word, no relevance, not
 *                       shown. Country words ("ישראל") do not count: every
 *                       Israeli question says them, a mortgage one too.
 *   value       (0-30)  what the asker is about to do: buy, choose, compare,
 *                       or only learn.
 *   winnability (0-20)  whether the site has a page that answers it (it can be
 *                       cited now), a topic planned for it, or a keyword it
 *                       tracks; a question about the business itself always.
 *
 * Pure and deterministic: no model call, no request. The reason is returned as
 * data (which keyword, which page), and the UI words it from the dictionary.
 * Checks never run on a suggestion by themselves: a question is checked only
 * after the owner adds it, and one below the threshold is not offered at all.
 */
import { categoryOfferings, type BusinessCategory, type PromptIntent } from './prompt-templates'

export const WORTH_THRESHOLD = 55

export type WorthPage = { title: string; url: string }

export type WorthContext = {
  businessName: string | null
  /** The scan niche or the owner's words (business-identity.ts label). */
  identityLabel: string | null
  category: BusinessCategory
  /** Tracked keywords. */
  keywords: readonly string[]
  /** The scan's audiences and seed keywords. */
  scanTerms?: readonly string[]
  /** Pages already on the site. */
  pages?: readonly WorthPage[]
  /** Topics already planned (their text). */
  plannedTopics?: readonly string[]
}

export type WorthRelevance =
  | { kind: 'brand' }
  | { kind: 'keyword'; term: string }
  | { kind: 'business'; term: string }
export type WorthValue = 'buy' | 'choose' | 'compare' | 'learn' | 'brand'
export type WorthWin = 'page' | 'planned' | 'tracked' | 'new'

export type QuestionWorth = {
  score: number
  relevance: number
  value: number
  winnability: number
  why: { relevance: WorthRelevance; value: WorthValue; win: WorthWin }
  /** A page on the site that already answers the question: improve it rather than write a new one. */
  answeringPage: WorthPage | null
}

const STOP = new Set([
  // Hebrew question and filler words
  'איך', 'מה', 'מי', 'איפה', 'כמה', 'איזה', 'איזו', 'אילו', 'למה', 'מתי', 'האם', 'הכי', 'יותר', 'טוב', 'טובה', 'טובים', 'טובות',
  'מומלץ', 'מומלצת', 'מומלצים', 'מומלצות', 'כדאי', 'חשוב', 'לבדוק', 'לפני', 'אחרי', 'עם', 'על', 'של', 'את', 'או', 'גם', 'זה', 'זו', 'יש',
  'אפשר', 'ניתן', 'ביותר', 'בין', 'עבור', 'לגבי', 'בוחרים', 'לבחור', 'בחירה', 'עולה', 'עולים', 'מחיר', 'עלות', 'הם', 'היא', 'הוא',
  'אני', 'אנחנו', 'שלי', 'כל', 'רק', 'עוד', 'מאוד', 'לא', 'כן', 'אם', 'כי', 'אבל', 'דרך', 'סוג', 'סוגי', 'חוות', 'דעת', 'ממליצים',
  'ישראל', 'ישראלים', 'ישראלי', 'ישראלית', 'בארץ', 'הארץ', 'שווה', 'נחשב', 'מוביל', 'המוביל',
  // English
  'the', 'a', 'an', 'of', 'for', 'to', 'in', 'on', 'best', 'how', 'what', 'which', 'who', 'where', 'when', 'is', 'are', 'do', 'does',
  'can', 'should', 'with', 'and', 'or', 'my', 'your', 'much', 'cost', 'price', 'good', 'top', 'recommended', 'vs', 'about', 'reviews',
  'review', 'israel', 'israeli', 'near', 'me',
])
const HE_PREFIX = /^[והבלמשכ]/
/** A word reduced to a comparable stem: one Hebrew prefix letter, a plural or final-he suffix, an English plural s. */
export function stem(word: string): string {
  let w = word.toLowerCase().replace(/[״"׳'`]/g, '')
  if (/^[a-z0-9]+$/.test(w)) return w.length > 3 ? w.replace(/(ies|s)$/, (m) => (m === 'ies' ? 'y' : '')) : w
  if (w.length >= 4 && HE_PREFIX.test(w)) w = w.slice(1)
  if (w.length >= 4 && HE_PREFIX.test(w) && /^ה/.test(w)) w = w.slice(1)
  if (w.length >= 5 && /(ים|ות)$/.test(w)) w = w.slice(0, -2)
  if (w.length >= 4 && /[הת]$/.test(w)) w = w.slice(0, -1)
  return w
}
function stems(text: string): string[] {
  const out: string[] = []
  for (const raw of text.split(/[^\p{L}\p{N}״"׳']+/u)) {
    const w = raw.trim()
    if (w.length < 2 || STOP.has(w.toLowerCase())) continue
    const s = stem(w)
    if (s.length >= 2 && !STOP.has(s)) out.push(s)
  }
  return out
}
const same = (a: string, b: string) => a === b || (a.length >= 3 && b.length >= 3 && (a.startsWith(b) || b.startsWith(a)) && Math.abs(a.length - b.length) <= 2)
const hits = (q: readonly string[], terms: readonly string[]) => q.filter((s) => terms.some((t) => same(s, t)))

const VALUE: Record<PromptIntent, { points: number; kind: WorthValue }> = {
  commercial: { points: 30, kind: 'buy' },
  transactional: { points: 28, kind: 'buy' },
  gift: { points: 26, kind: 'buy' },
  recommendation: { points: 26, kind: 'choose' },
  local: { points: 24, kind: 'choose' },
  pre_purchase: { points: 24, kind: 'choose' },
  comparison: { points: 25, kind: 'compare' },
  alternatives: { points: 22, kind: 'compare' },
  brand: { points: 18, kind: 'brand' },
  informational: { points: 14, kind: 'learn' },
}
const BUY_CUES = /(כמה עול|מחיר|להזמין|לקנות|לרכוש|הזמנת|how much|price|cost|book|buy)/i
const CHOOSE_CUES = /(מומלץ|מומלצ|הכי טוב|איזה .* כדאי|best|recommend)/i

export function scoreQuestion(prompt: string, intent: PromptIntent | string, ctx: WorthContext): QuestionWorth {
  const q = stems(prompt)
  const name = (ctx.businessName ?? '').trim()
  const namesBusiness = name.length >= 2 && prompt.toLowerCase().includes(name.toLowerCase())

  const core = stems([ctx.identityLabel ?? '', ...(ctx.category === 'generic' ? [] : categoryOfferings(ctx.category))].join(' '))
  const coreHits = hits(q, core)
  const kwTerms = ctx.keywords.map((k) => ({ k, s: stems(k) }))
  // The tracked keyword that shares the most words with the question names the reason.
  let kwHit: { k: string; s: string[] } | null = null
  let kwBest = 0
  for (const kw of kwTerms) {
    const n = hits(q, kw.s).length
    if (n > kwBest) { kwBest = n; kwHit = kw }
  }
  const kwHitCount = new Set(kwTerms.flatMap(({ s }) => hits(q, s))).size
  const scanHitCount = hits(q, stems((ctx.scanTerms ?? []).join(' '))).length

  let relevance = 0
  let relevanceWhy: WorthRelevance = { kind: 'business', term: ctx.identityLabel ?? '' }
  if (namesBusiness) {
    relevance = 40
    relevanceWhy = { kind: 'brand' }
  } else if (coreHits.length > 0) {
    relevance = Math.min(50, 26 + 8 * (coreHits.length - 1) + 6 * kwHitCount + 4 * Math.min(scanHitCount, 2))
    relevanceWhy = kwHit ? { kind: 'keyword', term: kwHit.k } : { kind: 'business', term: ctx.identityLabel ?? '' }
  }

  const v = VALUE[intent as PromptIntent] ?? { points: 16, kind: 'learn' as WorthValue }
  let value = v.points
  let valueKind = v.kind
  if (valueKind === 'learn' && BUY_CUES.test(prompt)) { value = 24; valueKind = 'buy' }
  else if (valueKind === 'learn' && CHOOSE_CUES.test(prompt)) { value = 22; valueKind = 'choose' }

  // The page whose title shares the most words with the question (two, or all of a short question).
  let answeringPage: WorthPage | null = null
  let best = 0
  for (const page of ctx.pages ?? []) {
    const n = hits(q, stems(page.title)).length
    if (n > best) { best = n; answeringPage = page }
  }
  const need = Math.min(2, Math.max(1, q.length))
  if (best < need) answeringPage = null

  const planned = (ctx.plannedTopics ?? []).some((t) => hits(q, stems(t)).length >= need)
  let winnability = 8
  let win: WorthWin = 'new'
  if (namesBusiness || answeringPage) { winnability = 20; win = namesBusiness ? 'tracked' : 'page' }
  else if (planned) { winnability = 16; win = 'planned' }
  else if (kwHit) { winnability = 14; win = 'tracked' }
  if (namesBusiness && answeringPage) win = 'page'

  const score = relevance === 0 ? 0 : relevance + value + winnability
  return { score, relevance, value, winnability, why: { relevance: relevanceWhy, value: valueKind, win }, answeringPage }
}

/**
 * The suggestions worth showing, best first, each carrying its worth. Questions
 * below WORTH_THRESHOLD are dropped, whatever produced them (templates, the
 * cache, the model).
 */
export function rankByWorth<T extends { prompt: string; intent: PromptIntent | string }>(
  list: readonly T[],
  ctx: WorthContext,
  threshold: number = WORTH_THRESHOLD,
): Array<T & { worth: QuestionWorth }> {
  return list
    .map((s) => ({ ...s, worth: scoreQuestion(s.prompt, s.intent, ctx) }))
    .filter((s) => s.worth.score >= threshold)
    .sort((a, b) => b.worth.score - a.worth.score)
}
