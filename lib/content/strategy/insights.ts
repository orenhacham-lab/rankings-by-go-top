/**
 * What the research already knows about a topic, said next to it: how many people
 * search for its keyword, what they are looking for, which of the site's audiences it
 * speaks to, and which competitors already chase it. Shared by the research tab (its
 * "who searches for you" and "who you are up against" sections) and the content
 * strategy tab (the "why this topic" facts, the pillars, the month plan).
 *
 * PURE and CHEAP: no I/O, no model, no provider. Everything here is computed from rows
 * the screens already read (the scan's research, the project's audiences, the board's
 * cards), so opening a tab still costs nothing.
 *
 * HONEST BY CONSTRUCTION: a fact that cannot be derived is null and the screen shows
 * nothing, never a guess dressed as data. An audience is matched to a keyword only on
 * a word that is distinctive to that one audience (a word every audience shares, such
 * as the niche itself, says nothing about who is searching).
 */

// ── Words ───────────────────────────────────────────────────────────────────

/** Words that carry no subject: Hebrew and English function words, and the generic words of a title. */
const STOPWORDS = new Set([
  // Hebrew
  'של', 'על', 'עם', 'את', 'או', 'גם', 'כל', 'לא', 'כן', 'זה', 'זו', 'הם', 'הן', 'הוא', 'היא', 'אני', 'אתם', 'אתה', 'לכם', 'שלכם', 'שלך', 'שלי',
  'מה', 'מי', 'איך', 'למה', 'כמה', 'איפה', 'מתי', 'יש', 'אין', 'הכי', 'יותר', 'פחות', 'בין', 'אל', 'עד', 'אחרי', 'לפני', 'כדי', 'אשר',
  'מדריך', 'המדריך', 'המלא', 'מלא', 'דברים', 'טיפים', 'באמת', 'צריך', 'לדעת', 'חשוב', 'שכל', 'שצריך', 'כיצד', 'ומה', 'מהם', 'מהן',
  'שמחפשים', 'שמחפשות', 'המחפשים', 'המחפשות', 'מחפשים', 'מחפשות', 'שרוצים', 'שרוצות', 'אנשים', 'לקוחות',
  // English
  'the', 'and', 'for', 'with', 'you', 'your', 'how', 'what', 'why', 'who', 'are', 'that', 'this', 'from', 'guide', 'best', 'into', 'about', 'people', 'looking',
])

/** Hebrew prefix letters (ו, ה, ב, ל, מ, ש, כ) a word may carry: "לנשים" is "נשים" too. */
const HEB_PREFIX = /^[והבלמשכ]/

export function normalizeText(s: string | null | undefined): string {
  return (s ?? '').toLowerCase().normalize('NFKC').replace(/[\p{P}\p{S}]+/gu, ' ').replace(/\s+/g, ' ').trim()
}

/** The subject words of a text, each with its prefix-less form when it has a Hebrew prefix. */
export function subjectWords(s: string | null | undefined): string[] {
  const out: string[] = []
  for (const w of normalizeText(s).split(' ')) {
    if (w.length < 3 || STOPWORDS.has(w)) continue
    out.push(w)
    if (w.length >= 5 && HEB_PREFIX.test(w)) {
      const bare = w.slice(1)
      if (!STOPWORDS.has(bare)) out.push(bare)
    }
  }
  return out
}

/** The same keyword written a little differently ("נעלי ריצה נשים" / "נעלי ריצה לנשים"): one key. */
export function variantKey(keyword: string): string {
  const words = normalizeText(keyword).split(' ').filter((w) => w.length > 1 && !STOPWORDS.has(w))
    .map((w) => (w.length >= 5 && HEB_PREFIX.test(w) ? w.slice(1) : w))
  return [...new Set(words)].sort().join(' ')
}

// ── What people are looking for ─────────────────────────────────────────────

/**
 * The search need behind a keyword, by the same cue words as the recommendation
 * engine's own classifier (lib/content/recommendations/coverage.ts searchNeedOf; its
 * module reads the database, so the screens cannot import it). A QA guard keeps the
 * two in step.
 */
export type SearchIntent = 'cost' | 'compare' | 'local' | 'selection' | 'howto' | 'info'
export const SEARCH_INTENTS: readonly SearchIntent[] = ['cost', 'compare', 'selection', 'local', 'howto', 'info']

const COST_RE = /(?:^|\s)(?:כמה\s+עולה|מחיר|מחירים|עלות|עלויות|תמחור|price|cost)(?:\s|$)/i
const HOWTO_RE = /(?:^|\s)(?:איך|כיצד|מדריך|טיפול|טיפוח|how\s+to|guide)(?:\s|$)/i
const COMPARE_RE = /(?:^|\s)(?:לעומת|מול|הבדל|השוואה|vs\.?|versus)(?:\s|$)/i
const SELECT_RE = /(?:^|\s)(?:לבחור|בחירת|איזה|איזו|מומלץ|הטוב|best|choose)(?:\s|$)/i
const LOCAL_RE = /(?:^|\s)(?:חנות|חנויות|משלוח|באזור|ליד|בעיר|shop|store|near)(?:\s|$)/i

export function searchIntent(keyword: string | null | undefined, title = ''): SearchIntent {
  const hay = `${keyword ?? ''} ${title}`
  if (COST_RE.test(hay)) return 'cost'
  if (COMPARE_RE.test(hay)) return 'compare'
  if (LOCAL_RE.test(hay)) return 'local'
  if (SELECT_RE.test(hay)) return 'selection'
  if (HOWTO_RE.test(hay)) return 'howto'
  return 'info'
}

export type IntentShare = { intent: SearchIntent; keywords: number; searches: number }

/** How the research's demand splits by what people are looking for, largest first (empty intents left out). */
export function intentMix(keywords: readonly { keyword: string; avgMonthlySearches: number | null }[]): IntentShare[] {
  const by = new Map<SearchIntent, IntentShare>()
  for (const k of keywords) {
    const intent = searchIntent(k.keyword)
    const e = by.get(intent) ?? { intent, keywords: 0, searches: 0 }
    e.keywords++
    e.searches += k.avgMonthlySearches ?? 0
    by.set(intent, e)
  }
  return [...by.values()].sort((a, b) => b.searches - a.searches || b.keywords - a.keywords || SEARCH_INTENTS.indexOf(a.intent) - SEARCH_INTENTS.indexOf(b.intent))
}

// ── Audiences ───────────────────────────────────────────────────────────────

export type AudienceIndex = { labels: string[]; words: Map<string, number[]> }

/** Each audience's subject words, and which audiences use each word. */
export function audienceIndex(labels: readonly string[]): AudienceIndex {
  const clean = labels.map((l) => l.trim()).filter(Boolean)
  const words = new Map<string, number[]>()
  clean.forEach((label, i) => {
    for (const w of new Set(subjectWords(label))) words.set(w, [...(words.get(w) ?? []), i])
  })
  return { labels: clean, words }
}

/**
 * The one audience a text speaks to: the audience that shares the most words with it
 * that NO other audience uses. Null when no such word is shared (a keyword that only
 * repeats the niche belongs to everyone, so to no one in particular).
 */
export function matchAudience(text: string, index: AudienceIndex): number | null {
  if (index.labels.length === 0) return null
  const score = new Map<number, number>()
  for (const w of new Set(subjectWords(text))) {
    const users = index.words.get(w)
    if (!users || users.length !== 1) continue
    score.set(users[0], (score.get(users[0]) ?? 0) + 1)
  }
  let best: number | null = null
  let bestScore = 0
  for (const [i, s] of [...score.entries()].sort(([a], [b]) => a - b)) {
    if (s > bestScore) { best = i; bestScore = s }
  }
  return best
}

export type AudienceKeywords = {
  label: string
  keywords: { keyword: string; volume: number | null }[]
  searches: number
}

/** Every keyword to at most one audience; each audience's keywords, most searched first. */
export function keywordsByAudience(
  labels: readonly string[],
  keywords: readonly { keyword: string; avgMonthlySearches: number | null }[],
): AudienceKeywords[] {
  const index = audienceIndex(labels)
  const out: AudienceKeywords[] = index.labels.map((label) => ({ label, keywords: [], searches: 0 }))
  for (const k of keywords) {
    const i = matchAudience(k.keyword, index)
    if (i === null) continue
    out[i].keywords.push({ keyword: k.keyword, volume: k.avgMonthlySearches })
    out[i].searches += k.avgMonthlySearches ?? 0
  }
  for (const a of out) a.keywords.sort((x, y) => (y.volume ?? -1) - (x.volume ?? -1))
  return out
}

// ── One topic's facts ───────────────────────────────────────────────────────

/** What the research holds for one keyword (the scan's merged row). */
export type ResearchFact = {
  keyword: string
  avgMonthlySearches: number | null
  competition: 'LOW' | 'MEDIUM' | 'HIGH' | null
  competitors?: readonly string[]
}

export type TopicInsight = {
  /** Searches a month for its keyword; null when the research does not have the keyword. */
  volume: number | null
  competition: 'LOW' | 'MEDIUM' | 'HIGH' | null
  intent: SearchIntent
  /** The audience it speaks to, when one is distinctly named in it. */
  audience: string | null
  /** Competitor domains whose research found the keyword (they already chase it). */
  rivals: string[]
}

export type InsightContext = { research: Map<string, ResearchFact>; audiences: AudienceIndex }

export function researchKey(keyword: string): string {
  return keyword.normalize('NFC').trim().toLowerCase().replace(/\s+/g, ' ')
}

export function insightContext(research: readonly ResearchFact[], audiences: readonly string[]): InsightContext {
  return { research: new Map(research.map((r) => [researchKey(r.keyword), r])), audiences: audienceIndex(audiences) }
}

export function topicInsight(topic: { keyword: string | null; title: string }, ctx: InsightContext): TopicInsight {
  const fact = topic.keyword ? ctx.research.get(researchKey(topic.keyword)) ?? null : null
  const audience = matchAudience(`${topic.keyword ?? ''} ${topic.title}`, ctx.audiences)
  return {
    volume: fact?.avgMonthlySearches ?? null,
    competition: fact?.competition ?? null,
    intent: searchIntent(topic.keyword, topic.title),
    audience: audience === null ? null : ctx.audiences.labels[audience],
    rivals: [...(fact?.competitors ?? [])].slice(0, 3),
  }
}

// ── Pillars ─────────────────────────────────────────────────────────────────

export type ClusterItem = { key: string; keyword: string | null; title: string; volume: number | null; column: string }
export type TopicCluster = { name: string; items: ClusterItem[]; searches: number }

/** A cluster needs this many topics; a phrase in more than half of the plan (5 topics or more) is the niche itself, not a pillar. */
export const MIN_CLUSTER = 2
const NICHE_SHARE = 0.5

function phrasesOf(item: ClusterItem): { unigrams: Set<string>; bigrams: Set<string>; first: string | null } {
  const text = item.keyword || item.title
  const words = normalizeText(text).split(' ').filter((w) => w.length >= 2 && !STOPWORDS.has(w))
  const bare = (w: string) => (w.length >= 5 && HEB_PREFIX.test(w) ? w.slice(1) : w)
  const unigrams = new Set(words.filter((w) => w.length >= 3).map(bare))
  const bigrams = new Set<string>()
  for (let i = 0; i + 1 < words.length; i++) bigrams.add(`${bare(words[i])} ${bare(words[i + 1])}`)
  return { unigrams, bigrams, first: words.length >= 2 ? `${bare(words[0])} ${bare(words[1])}` : null }
}

/**
 * A pillar's name: its two shared words as the topics write them ("נעלי שטח"), or, for a
 * one-word subject, the shortest keyword that carries it (one word alone says too little).
 */
function clusterName(phrase: string, two: boolean, items: readonly ClusterItem[]): string {
  const texts = items.map((it) => it.keyword || it.title).sort((a, b) => a.split(' ').length - b.split(' ').length || a.length - b.length)
  if (two) {
    const bare = (w: string) => (w.length >= 5 && HEB_PREFIX.test(w) ? w.slice(1) : w)
    for (const t of texts) {
      const words = normalizeText(t).split(' ').filter((w) => w.length >= 2 && !STOPWORDS.has(w))
      for (let i = 0; i + 1 < words.length; i++) if (`${bare(words[i])} ${bare(words[i + 1])}` === phrase) return `${words[i]} ${words[i + 1]}`
    }
  }
  return texts[0]
}

/**
 * Topics grouped around the subject they share (a pillar and its supporting articles),
 * greedily: the phrase that the most remaining topics share wins; at a tie, the one the
 * topics start with (the head of the subject: "גרבי ריצה" over "ריצה לנשים"), then two
 * words before one, then the most searched. Its topics leave the pool, and so on. A
 * phrase in more than half of the whole plan is the niche, not a pillar, and stays out
 * even after other groups take some of its topics. One word needs three topics; two
 * words, two. Named by clusterName.
 */
export function topicClusters(items: readonly ClusterItem[]): { clusters: TopicCluster[]; loose: number } {
  const phrases = new Map(items.map((it) => [it.key, phrasesOf(it)]))
  const coverOf = (list: readonly ClusterItem[]) => {
    const cover = new Map<string, { items: ClusterItem[]; two: boolean; leading: number }>()
    for (const it of list) {
      const p = phrases.get(it.key)!
      for (const b of p.bigrams) { const e = cover.get(b) ?? { items: [], two: true, leading: 0 }; e.items.push(it); if (p.first === b) e.leading++; cover.set(b, e) }
      for (const u of p.unigrams) { const e = cover.get(u) ?? { items: [], two: false, leading: 0 }; e.items.push(it); cover.set(u, e) }
    }
    return cover
  }
  const limit = items.length >= 5 ? Math.floor(items.length * NICHE_SHARE) : items.length
  const niche = new Set([...coverOf(items).entries()].filter(([, e]) => e.items.length > limit).map(([phrase]) => phrase))
  let pool = [...items]
  const clusters: TopicCluster[] = []
  for (;;) {
    let best: { phrase: string; items: ClusterItem[]; two: boolean; leading: number; searches: number } | null = null
    for (const [phrase, e] of [...coverOf(pool).entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
      const need = e.two ? MIN_CLUSTER : MIN_CLUSTER + 1
      if (e.items.length < need || niche.has(phrase)) continue
      const searches = e.items.reduce((s, it) => s + (it.volume ?? 0), 0)
      const better = !best || e.items.length > best.items.length || (e.items.length === best.items.length && (
        e.leading > best.leading || (e.leading === best.leading && ((e.two && !best.two) || (e.two === best.two && searches > best.searches)))))
      if (better) best = { phrase, items: e.items, two: e.two, leading: e.leading, searches }
    }
    if (!best) break
    const taken = new Set(best.items.map((it) => it.key))
    clusters.push({ name: clusterName(best.phrase, best.two, best.items), items: best.items, searches: best.searches })
    pool = pool.filter((it) => !taken.has(it.key))
  }
  return { clusters, loose: pool.length }
}

/** Show pillars only when the data carries them: two groups, or one group of three or more. */
export function clustersWorthShowing(clusters: readonly TopicCluster[]): boolean {
  return clusters.length >= 2 || clusters.some((c) => c.items.length >= 3)
}

// ── The board's cards ───────────────────────────────────────────────────────

type CardLike = { key: string; keyword: string | null; title: string; origin: string; column: string }

/** A card's keyword: its own, or, for a ranking idea, the tracked keyword that is its title. */
export function cardKeyword(card: CardLike): string | null {
  return card.keyword ?? (card.origin === 'ranking' ? card.title : null)
}

/**
 * The facts of every card that has at least one the research holds (a volume, an
 * audience, a competitor); a card with none gets no facts line rather than a lone guess.
 */
export function cardInsights(cards: readonly CardLike[], ctx: InsightContext | null): Map<string, TopicInsight> {
  const out = new Map<string, TopicInsight>()
  if (!ctx) return out
  for (const c of cards) {
    const i = topicInsight({ keyword: cardKeyword(c), title: c.title }, ctx)
    if (i.volume !== null || i.audience !== null || i.rivals.length > 0) out.set(c.key, i)
  }
  return out
}

/** The monthly searches of the plan's keywords, each keyword (and its close variants) once; null when none is known. */
export function planSearches(cards: readonly CardLike[], ctx: InsightContext | null): number | null {
  if (!ctx) return null
  const by = new Map<string, number>()
  for (const c of cards) {
    const k = cardKeyword(c)
    const v = k ? ctx.research.get(researchKey(k))?.avgMonthlySearches ?? null : null
    if (k === null || v === null) continue
    const key = variantKey(k) || researchKey(k)
    by.set(key, Math.max(by.get(key) ?? 0, v))
  }
  return by.size === 0 ? null : [...by.values()].reduce((s, v) => s + v, 0)
}

/** What kinds of content the plan is made of (by each card's search need), largest first. */
export function planIntentMix(cards: readonly CardLike[]): { intent: SearchIntent; count: number }[] {
  const by = new Map<SearchIntent, number>()
  for (const c of cards) {
    const i = searchIntent(cardKeyword(c), c.title)
    by.set(i, (by.get(i) ?? 0) + 1)
  }
  return [...by.entries()].map(([intent, count]) => ({ intent, count }))
    .sort((a, b) => b.count - a.count || SEARCH_INTENTS.indexOf(a.intent) - SEARCH_INTENTS.indexOf(b.intent))
}
