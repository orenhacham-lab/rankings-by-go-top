/**
 * Recommendation-quality PURE helpers (no network/DB) — used to post-process
 * Gemini topic ideas from every source (project_data / site_scan / keyword_*)
 * BEFORE they reach the Hybrid engine. Deterministic + unit-tested, so the same
 * input always yields the same clusters/ordering. Does NOT touch Hybrid
 * ranking/dedup/provenance — it only cleans and diversifies each source's own
 * output.
 *
 * Fixes: generic cliché titles, stale years, near-duplicates of existing
 * content, English reasons on Hebrew projects, and single-brand domination.
 */

/** The current year — passed to Gemini so it never invents a stale year. */
export function currentYear(): number { return new Date().getFullYear() }

/**
 * Shared reasoning rules injected into every topic-generation prompt: classify
 * the source entity first, pick an archetype that fits it, avoid generic clichés,
 * stay grounded, use the current year only when justified, and keep the reason in
 * the project language. One block so all sources reason consistently.
 */
export function qualityGuidance(langLabel: string, year: number): string {
  return [
    `FIRST classify each source as one of: product | brand | collection/category | article | informational page | generic keyword. THEN pick a topic archetype that fits that entity:`,
    `- brand/category → brand guide, comparison of relevant products, best products for a specific need, scent-family/audience guide (brand history ONLY if the source data supports it).`,
    `- product → usage, comparison with a REAL alternative, who it suits, performance/notes/season ONLY when the product data supports it.`,
    `- existing article → find a genuinely UNCOVERED angle; never paraphrase the same title/topic.`,
    `Do NOT use generic templates like "טעויות נפוצות וטיפים" / "common mistakes and tips", "כל מה שצריך לדעת" / "everything you need to know", "סודות ש..." / "secrets of..." — a bare brand/entity name must NOT become "[Entity] — טעויות נפוצות וטיפים".`,
    `GROUNDING: do NOT invent limited editions, rare products, EDP vs EDT variants, ingredients, historical/origin facts, seasonal suitability, or counterfeit claims unless the provided data supports them. If evidence is missing, produce a broader grounded topic instead.`,
    `DIVERSITY: do not fill the list with many close variations of the SAME brand + SAME intent; cover different brands, categories, guides, comparisons and gaps.`,
    `FRESHNESS: the current year is ${year}. Do NOT put a year in a title unless the keyword has real year-specific demand; if a year is justified use ${year}, and NEVER use a past year. Prefer evergreen titles.`,
    `LANGUAGE: write the title, reason and all output in ${langLabel} (a brand/product name may keep its original language). The reason must be in ${langLabel} — never an English sentence on a non-English project.`,
  ].join('\n')
}

/** Generic cliché title patterns that must not be auto-applied to an entity. */
export const GENERIC_TITLE_PATTERNS: RegExp[] = [
  /טעויות נפוצות/, /כל מה שצריך לדעת/, /סודות של/, /סודות ש[^ ]/, /הכל על/,
  /common mistakes/i, /everything you need to know/i, /\bsecrets? of\b/i, /all about/i,
]

/** True when a title is a generic template rather than a real, specific topic. */
export function isGenericTitle(title: string): boolean {
  const t = (title || '').trim()
  if (!t) return false
  return GENERIC_TITLE_PATTERNS.some((re) => re.test(t))
}

const SEPARATORS = /\s*[—:\-–|]\s*/
const ELABORATION_SUFFIX = [
  /סיפור מאחורי/, /המדריך המלא/, /כל מה שצריך/, /טעויות נפוצות/, /מדריך מלא/,
  /the story behind/i, /complete guide/i, /a deep dive/i, /explained/i,
]

/**
 * The comparable SUBJECT of a title: lowercased, with a trailing generic/
 * elaborative suffix (after — : |) removed so "X: the story behind it" compares
 * equal to "X". A DISTINCT sub-topic (different core words) keeps its own subject.
 */
export function subjectKey(title: string): string {
  const t = (title || '').trim()
  if (!t) return ''
  const parts = t.split(SEPARATORS)
  if (parts.length > 1) {
    const tail = parts[parts.length - 1]
    if (ELABORATION_SUFFIX.some((re) => re.test(tail))) {
      return parts.slice(0, -1).join(' ').trim().toLowerCase()
    }
  }
  return t.toLowerCase()
}

/**
 * Remove a stale (older-than-current) year from a title. Never injects a year.
 * Returns { title, changed, hadStaleYear }. Strips a dangling "לשנת"/"for"/"in"
 * left behind. The current year is kept as-is.
 */
export function repairStaleYear(title: string, currentYear: number): { title: string; changed: boolean; hadStaleYear: boolean } {
  const t = title || ''
  let hadStale = false
  let out = t.replace(/\b(19|20)\d{2}\b/g, (m) => {
    const y = Number(m)
    if (y < currentYear) { hadStale = true; return '' }
    return m
  })
  if (!hadStale) return { title: t, changed: false, hadStaleYear: false }
  // Clean dangling connectors + doubled spaces/punctuation left by the removal.
  // (Hebrew has no ASCII \b, so match the connector words directly.)
  out = out
    .replace(/לשנת\s*/g, ' ')
    .replace(/לשנה\s*/g, ' ')
    .replace(/\b(for|in|of)\s+(?=$|[^A-Za-z])/gi, ' ')
    .replace(/\b(for|in|of)\s*$/gi, '')
    .replace(/\s*[-–—:]\s*$/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.!?])/g, '$1')
    .trim()
  return { title: out, changed: out !== t, hadStaleYear: true }
}

const HEBREW_RE = /[֐-׿]/
const LATIN_WORD_RE = /[A-Za-z]{2,}/g

/**
 * True when a piece of text reads as ENGLISH prose (not just an embedded brand
 * name). Heuristic: has ≥3 latin words AND no Hebrew letters, OR latin letters
 * strongly outnumber Hebrew ones.
 */
export function looksEnglish(text: string): boolean {
  const t = (text || '').trim()
  if (!t) return false
  const latinWords = (t.match(LATIN_WORD_RE) || []).length
  const hasHebrew = HEBREW_RE.test(t)
  if (!hasHebrew && latinWords >= 3) return true
  const latin = (t.match(/[A-Za-z]/g) || []).length
  const hebrew = (t.match(/[֐-׿]/g) || []).length
  return latin > hebrew * 2 && latinWords >= 4
}

/** A deterministic, grounded Hebrew reason derived from the title (no model). */
export function hebrewFallbackReason(title: string): string {
  const t = (title || '').trim()
  return t ? `נושא ממוקד שממלא פער תוכן רלוונטי עבור: ${t}` : 'נושא ממוקד שממלא פער תוכן רלוונטי.'
}

/**
 * Repair a suggestion reason's language. On a Hebrew project an English reason
 * is replaced with a grounded Hebrew fallback; brand names inside a Hebrew
 * reason are fine. English projects are left unchanged.
 */
export function repairReason(reason: string, language: 'he' | 'en', title: string): string {
  const r = (reason || '').trim()
  if (language !== 'he') return r
  if (!r || looksEnglish(r)) return hebrewFallbackReason(title)
  return r
}

const STOPWORDS = new Set([
  'the', 'a', 'an', 'of', 'for', 'to', 'and', 'in', 'on', 'with', 'best', 'top', 'guide', 'how',
  'של', 'עם', 'על', 'לפי', 'איך', 'כיצד', 'הכי', 'מדריך', 'ל', 'ב', 'ה', 'את', 'מה',
])

function normToken(s: string): string {
  return s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
}

/** Words that signal an INTENT (not part of the entity), so the entity key stops. */
const INTENT_TOKEN = new Set([
  'מתנה', 'מתנות', 'מחיר', 'מזויף', 'מקורי', 'אמיתי', 'זיהוי', 'קיץ', 'חורף', 'אחסון', 'שמירה',
  'היסטוריה', 'סיפור', 'מדריך', 'השוואה', 'מומלצים', 'מומלץ', 'לקיץ', 'לחורף', 'לנשים', 'לגברים',
  'gift', 'price', 'best', 'guide', 'history', 'fake', 'authentic', 'summer', 'winter', 'storage',
])

/**
 * The primary ENTITY/brand key of an idea: the LEADING brand token(s) of the
 * title's first segment — collect significant tokens until an intent word marks
 * the topic, so "Amouage מתנה" and "Amouage מחיר" share entity "amouage" while a
 * two-word brand ("tom ford מדריך") still resolves to "tom ford". Deterministic,
 * project-derived — no brand lists.
 */
export function primaryEntityKey(title: string, keyword: string): string {
  const lead = (title || '').split(SEPARATORS)[0] || title || keyword || ''
  const raw = lead.split(/\s+/)
  const brand: string[] = []
  for (const w of raw) {
    const n = normToken(w)
    if (!n || n.length < 2 || STOPWORDS.has(n)) continue
    if (INTENT_TOKEN.has(n)) break            // intent word → entity ends here
    brand.push(n)
    if (brand.length >= 2) break              // brands are ≤ 2 tokens here
  }
  if (brand.length) return brand.join(' ')
  const kt = (keyword || '').split(/\s+/).map(normToken).filter((w) => w.length >= 2 && !STOPWORDS.has(w) && !INTENT_TOKEN.has(w))
  return kt.slice(0, 1).join(' ')
}

const INTENT_LEXICON: { bucket: string; res: RegExp[] }[] = [
  { bucket: 'comparison', res: [/השווא/, /לעומת/, /מול\b/, /\bvs\b/i, /compar/i] },
  { bucket: 'price', res: [/מחיר/, /כמה עולה/, /עלות/, /price/i, /cost/i] },
  { bucket: 'gift', res: [/מתנה/, /מתנות/, /gift/i] },
  { bucket: 'best', res: [/הכי טוב/, /מומלצ/, /\bbest\b/i, /\btop\b/i] },
  { bucket: 'fake', res: [/מזויף/, /זיוף/, /מקורי/, /אמיתי/, /fake/i, /counterfeit/i, /authentic/i] },
  { bucket: 'care', res: [/אחסון/, /שמירה/, /טיפוח/, /שמור/, /storage/i, /\bcare\b/i, /how to store/i] },
  { bucket: 'season', res: [/קיץ/, /חורף/, /עונ/, /summer/i, /winter/i, /season/i] },
  { bucket: 'history', res: [/היסטורי/, /סיפור/, /מסע/, /history/i, /story/i, /journey/i] },
  { bucket: 'ingredients', res: [/מרכיב/, /רכיב/, /נוט/, /ingredient/i, /\bnotes?\b/i] },
  { bucket: 'audience', res: [/לנשים/, /לגברים/, /למתחילים/, /for (women|men|beginners)/i] },
  { bucket: 'howto', res: [/איך לבחור/, /כיצד/, /מדריך/, /how to (choose|pick)/i, /buying guide/i] },
]

/** A coarse search-intent bucket for clustering (keyword/title lexicon + hint). */
export function intentBucket(searchIntent: string | undefined, title: string, keyword: string): string {
  const hay = `${title || ''} ${keyword || ''}`
  for (const { bucket, res } of INTENT_LEXICON) if (res.some((re) => re.test(hay))) return bucket
  const si = (searchIntent || '').toLowerCase()
  if (si === 'comparison') return 'comparison'
  if (si === 'transactional' || si === 'commercial') return 'commercial'
  return 'informational'
}

/**
 * Deterministic per-idea repairs applied to every generated suggestion before
 * dedup/diversify: strip a stale year from the title, force the reason into the
 * project language, and softly penalise a generic-template title so it can't
 * outrank a real, specific topic. Mutates the idea in place.
 */
export function applyQualityRepairs(s: { title: string; suggestionReason?: string; suggestionScore?: number }, language: 'he' | 'en', year: number): void {
  const yr = repairStaleYear(s.title, year)
  if (yr.changed) s.title = yr.title
  s.suggestionReason = repairReason(s.suggestionReason ?? '', language, s.title)
  if (isGenericTitle(s.title)) s.suggestionScore = (typeof s.suggestionScore === 'number' ? s.suggestionScore : 0.5) * 0.5
}

export interface DiversifiableIdea {
  title: string
  primaryKeyword: string
  searchIntent?: string
  suggestionScore?: number
}

/**
 * Deterministic semantic diversification (NO brand blacklist, NO fixed per-brand
 * cap):
 *   1. collapse near-identical ideas — same (entity + intent) or same subject —
 *      to the single strongest representative,
 *   2. apply a SOFT concentration penalty so each additional idea of an
 *      already-represented entity is ranked lower (0.82^k), letting genuinely
 *      distinct intents survive without one brand dominating the top,
 *   3. return a stable order (penalized score desc, then subject asc).
 * Multi-intent ideas for one brand remain; pure repeats do not.
 */
export function diversifySuggestions<T extends DiversifiableIdea>(items: T[], opts: { concentrationDecay?: number } = {}): T[] {
  const decay = opts.concentrationDecay ?? 0.82
  const byCluster = new Map<string, { item: T; score: number }>()
  const bySubject = new Map<string, string>() // subjectKey → cluster key (collapse subject repeats)

  for (const it of items) {
    const entity = primaryEntityKey(it.title, it.primaryKeyword)
    const intent = intentBucket(it.searchIntent, it.title, it.primaryKeyword)
    const subj = subjectKey(it.title)
    const score = typeof it.suggestionScore === 'number' ? it.suggestionScore : 0.5
    let clusterKey = `${entity}::${intent}`
    // A repeated SUBJECT (different intent label but same core) folds into the
    // cluster that first claimed that subject.
    if (bySubject.has(subj)) clusterKey = bySubject.get(subj)!
    else bySubject.set(subj, clusterKey)
    const cur = byCluster.get(clusterKey)
    if (!cur || score > cur.score || (score === cur.score && it.title < cur.item.title)) {
      byCluster.set(clusterKey, { item: it, score })
    }
  }

  // Soft concentration penalty across surviving representatives, per entity.
  const reps = Array.from(byCluster.values())
  const entityCount = new Map<string, number>()
  // Rank entities' items by score first so the STRONGEST of a brand is penalized least.
  reps.sort((a, b) => b.score - a.score || (a.item.title < b.item.title ? -1 : 1))
  const scored = reps.map((r) => {
    const entity = primaryEntityKey(r.item.title, r.item.primaryKeyword)
    const k = entityCount.get(entity) ?? 0
    entityCount.set(entity, k + 1)
    return { item: r.item, eff: r.score * Math.pow(decay, k), subj: subjectKey(r.item.title) }
  })
  scored.sort((a, b) => b.eff - a.eff || (a.subj < b.subj ? -1 : 1))
  return scored.map((s) => s.item)
}
