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
    `TITLE COMPOSITION: write NATURAL, editorial ${langLabel} titles with VARIED structure. Do NOT use one repeated skeleton across the set. In particular do NOT always start with the brand name and do NOT use the "[Brand]: [angle]" colon formula — the brand may appear at the start, middle, end, or only in the keyword when the title is clearer without it (e.g. prefer "איזה בושם של טום פורד מתאים לקיץ?" over "Tom Ford: מדריך לבחירת הניחוח").`,
    `BRAND FORM: on a ${langLabel} project prefer the Hebrew brand form when it is the natural/established term for the audience (טום פורד, אמואג׳, גרלן, נישאנה, אקס ניהילו); keep the English form only when it is the real search term or the Hebrew form is uncommon. Use ONE form per title — never redundant "Amouage אמואג׳".`,
    `Do NOT use generic/AI-cliché templates: "טעויות נפוצות וטיפים", "כל מה שצריך לדעת", "המדריך המלא", "גלו/לחשוף את סודות...", "המסע אל...", "הניחוחות ששינו את עולם הבישום", "הטרנד החם ביותר", "הטובים ביותר" (or their English equivalents). A bare brand name must NOT become "[Brand] — טעויות נפוצות וטיפים".`,
    `GROUNDING: do NOT invent or exaggerate — no limited editions, rare products, EDP vs EDT variants, ingredients, historical/origin/"changed the world" claims, "iconic/rarest/ultimate/best/hottest-trend" superlatives, seasonal suitability, or counterfeit claims unless the provided data supports them. If evidence is missing, produce a broader neutral grounded topic instead.`,
    `DIVERSITY: do not fill the list with many close variations of the SAME brand; after one or two strong ideas for an entity, move to different brands, categories, guides, comparisons and content gaps.`,
    `FRESHNESS: the current year is ${year}. Do NOT put a year in a title unless the keyword has real year-specific demand; if a year is justified use ${year}, NEVER a past year, and keep genuine historical years (eras, launch years, ranges) intact. Prefer evergreen titles.`,
    `LANGUAGE: write the title, reason and all output in ${langLabel}. The reason (suggestionReason) MUST be a natural ${langLabel} sentence — never an English sentence on a non-English project.`,
  ].join('\n')
}

/** Generic cliché title patterns that must not be auto-applied to an entity. */
export const GENERIC_TITLE_PATTERNS: RegExp[] = [
  /טעויות נפוצות/, /כל מה שצריך לדעת/, /סודות של/, /סודות ש[^ ]/, /הכל על/,
  /common mistakes/i, /everything you need to know/i, /\bsecrets? of\b/i, /all about/i,
]

/**
 * Repeated AI-editorial "formula" families — the phrasings the live Preview
 * over-used. Each entry maps a family key to its detectors, so the SET-level
 * detector can spot the SAME skeleton repeating across many titles.
 */
export const FORMULAIC_FAMILIES: { key: string; res: RegExp[] }[] = [
  { key: 'mistakes', res: [/טעויות נפוצות/, /common mistakes/i] },
  { key: 'secrets', res: [/גלו את סודות/, /לחשוף את סודות/, /סודות ה?בישום/, /\bsecrets?\b/i] },
  { key: 'journey', res: [/^המסע אל/, /המסע בעולם/, /\bthe journey\b/i] },
  { key: 'complete_guide', res: [/המדריך המלא/, /המדריך המקיף/, /complete guide/i, /ultimate guide/i] },
  { key: 'everything', res: [/כל מה שצריך לדעת/, /everything you need to know/i] },
  { key: 'changed_world', res: [/ששינ(ה|ו) את עולם/, /that changed the (world|industry)/i] },
  { key: 'hottest_trend', res: [/הטרנד ה?חם ביותר/, /הטרנדים ה?חמים/, /hottest trend/i] },
  { key: 'the_best', res: [/הטובים ביותר/, /הטוב ביותר/, /הכי טוב(ים)?/, /\bthe best\b/i] },
  { key: 'iconic_rare', res: [/אייקוני/, /נדיר(ים)?/, /האולטימטיב/, /iconic|legendary|rarest/i] },
  { key: 'all_about', res: [/^הכל על/, /all about/i] },
]

/** Domain-generic / filler words that don't make a title "specific" on their own. */
const INTENT_STOP = new Set([
  'בישום', 'בושם', 'בשמים', 'ניחוח', 'ניחוחות', 'המותג', 'מותג', 'טיפים',
  'perfume', 'perfumes', 'fragrance', 'fragrances', 'scent', 'brand', 'tips', 'guide',
])

/** The formulaic family a title belongs to, or null when it is specific. */
export function formulaicFamily(title: string): string | null {
  const t = (title || '').trim()
  for (const f of FORMULAIC_FAMILIES) if (f.res.some((re) => re.test(t))) return f.key
  return null
}

/** True when a title is a generic template / repeated AI formula (not specific). */
export function isGenericTitle(title: string): boolean {
  const t = (title || '').trim()
  if (!t) return false
  return GENERIC_TITLE_PATTERNS.some((re) => re.test(t)) || formulaicFamily(t) !== null
}

/**
 * True when a title is ESSENTIALLY just an entity name + a generic/formulaic
 * phrase, with no specific, groundable content — irreparable → discard (not
 * merely penalise). "Tom Ford — טעויות נפוצות וטיפים" qualifies; "Tom Ford:
 * איזה בושם מתאים לקיץ" does not (it carries a concrete, specific angle).
 */
export function isPureGenericTitle(title: string): boolean {
  const t = (title || '').trim()
  if (!t) return false
  if (formulaicFamily(t) === null && !GENERIC_TITLE_PATTERNS.some((re) => re.test(t))) return false
  const isGenericSeg = (seg: string) => formulaicFamily(seg) !== null || GENERIC_TITLE_PATTERNS.some((re) => re.test(seg))
  const segs = t.split(SEPARATORS).map((s) => s.trim()).filter(Boolean)
  let brandBlock = true // leading short segments = the entity/brand (possibly dual-form)
  for (const seg of segs) {
    if (isGenericSeg(seg)) { brandBlock = false; continue }
    const sig = significantTokens(seg)
    if (brandBlock && sig.length <= 3) continue // brand name / transliteration block
    brandBlock = false
    // A segment with ≥2 specific (non-filler) content tokens = a real topic.
    if (sig.filter((w) => !INTENT_STOP.has(w)).length >= 2) return false
  }
  return true // nothing but entity + generic phrases remained
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
 * True when a year in the title is LEGITIMATE historical context (a decade, a
 * range, a launch/founding year, or an era marker) rather than a stale
 * "current/updated/trending" framing. Such titles must NOT be year-stripped.
 */
export function hasHistoricalYearContext(title: string): boolean {
  const t = title || ''
  return (
    /שנות ה[-'’]?\d0/.test(t) ||                          // "שנות ה-90"
    /(19|20)\d{2}\s*[ל–—-]+\s*(19|20)\d{2}/.test(t) ||    // a year range "2000 ל-2010"
    /בין\s*(19|20)\d{2}/.test(t) ||                        // "בין 2000 ..."
    /(הושק|הושקו|יצא|יצאו|נוסד|נוסדה|יוסד|החל מ|משנת|בשנת|עד שנת|מאז)/.test(t) ||
    /(היסטורי|היסטוריה|אייקוני|קלאסי|וינטג|לאורך השנים|בעבר)/.test(t) ||
    /\b(since|in the|founded in|launched in|history of)\b/i.test(t) ||
    /\b(19|20)\d0s\b/i.test(t)                            // "1990s"
  )
}

/**
 * Remove a STALE current/recommendation-framing year (older than the current
 * year) from a title. Legitimate historical years/ranges/eras are preserved.
 * Never injects a year. Strips a dangling "לשנת"/"for"/"in" left behind.
 */
export function repairStaleYear(title: string, currentYear: number): { title: string; changed: boolean; hadStaleYear: boolean } {
  const t = title || ''
  // Preserve genuine historical context — do not touch the year.
  if (hasHistoricalYearContext(t)) return { title: t, changed: false, hadStaleYear: false }
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
 * Deterministic per-idea repairs, applied to the engine's OWN suggestion object
 * before dedup/diversify: strip a stale (non-historical) year, force the reason
 * into the project language, and DISCARD an irreparable pure-generic title
 * (entity + cliché with no specific content) rather than keep it with a lower
 * score. A generic-but-specific title keeps a mild penalty. Returns { discard }.
 */
export function applyQualityRepairs(s: { title: string; suggestionReason?: string; suggestionScore?: number }, language: 'he' | 'en', year: number): { discard: boolean } {
  const yr = repairStaleYear(s.title, year)
  if (yr.changed) s.title = yr.title
  s.suggestionReason = repairReason(s.suggestionReason ?? '', language, s.title)
  if (isPureGenericTitle(s.title)) return { discard: true }
  if (isGenericTitle(s.title)) s.suggestionScore = (typeof s.suggestionScore === 'number' ? s.suggestionScore : 0.5) * 0.6
  return { discard: false }
}

export interface DiversifiableIdea {
  title: string
  primaryKeyword: string
  searchIntent?: string
  suggestionScore?: number
}

/** Strip common Hebrew inseparable prefixes so morphological variants overlap
 *  more (ו/ה/ב/כ/ל/מ/ש + final-letter normalisation). Coarse, not a stemmer. */
function heNormalize(w: string): string {
  let x = w
  x = x.replace(/ם$/, 'מ').replace(/ן$/, 'נ').replace(/ץ$/, 'צ').replace(/ף$/, 'פ').replace(/ך$/, 'כ')
  x = x.replace(/^(ו|ה|ב|כ|ל|מ|ש){1,2}/, '')
  return x
}
function significantTokens(s: string): string[] {
  return (s || '').split(/[\s—:\-–|.,!?]+/).map(normToken)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w) && !INTENT_STOP.has(w))
    .map((w) => (/[֐-׿]/.test(w) ? heNormalize(w) : w))
    .filter((w) => w.length >= 2)
}

/**
 * True when a candidate CANNIBALIZES an existing title — a near-duplicate or a
 * broadened paraphrase of the same core subject. Uses containment: the smaller
 * title's significant tokens are ≥ ratio contained in the larger, OR the subject
 * keys near-match. Catches "המסע בעולם הבישום: איך להתחיל…" vs an existing "איך
 * להתחיל את המסע בעולם הבישום", while leaving materially different angles.
 */
export function cannibalizes(candidateTitle: string, existingTitles: string[], ratio = 0.8): boolean {
  const cTok = new Set(significantTokens(candidateTitle))
  const cSubj = subjectKey(candidateTitle)
  if (cTok.size === 0) return false
  for (const ex of existingTitles || []) {
    if (subjectKey(ex) === cSubj) return true
    const eTok = new Set(significantTokens(ex))
    if (eTok.size === 0) continue
    const [small, large] = cTok.size <= eTok.size ? [cTok, eTok] : [eTok, cTok]
    let shared = 0
    for (const w of small) if (large.has(w)) shared++
    if (shared / small.size >= ratio && small.size >= 2) return true
  }
  return false
}

/** Function words that must NOT count as the "lead" of a colon skeleton. */
const NON_BRAND_LEAD = new Set(['השוואה', 'מדריך', 'איך', 'כיצד', 'ביקורת', 'סקירה', 'comparison', 'guide', 'review', 'how'])

/**
 * A structural signature for SET-LEVEL repetition control. A short leading
 * segment before a separator ("Brand: angle") → 'lead_sep'; a repeated AI
 * formula → 'formulaic:<family>'; otherwise 'specific'. When many titles share a
 * non-'specific' skeleton, only the strongest survives.
 */
export function titleSkeleton(title: string): string {
  const t = (title || '').trim()
  const parts = t.split(SEPARATORS)
  if (parts.length > 1) {
    const leadTokens = parts[0].split(/\s+/).map(normToken).filter(Boolean)
    if (leadTokens.length >= 1 && leadTokens.length <= 3 && !leadTokens.some((w) => NON_BRAND_LEAD.has(w))) return 'lead_sep'
  }
  const fam = formulaicFamily(t)
  if (fam) return `formulaic:${fam}`
  return 'specific'
}

/** Per-candidate outcome of the refine pipeline. */
export type CandidateOutcome =
  | 'keep' | 'repair_title' | 'repair_language' | 'repair_year'
  | 'discard_duplicate' | 'discard_cannibalization' | 'discard_unsupported' | 'discard_unrecoverable_generic'

/** Rarity / limited-edition / exclusivity claims that need product evidence — an
 *  invented one is discarded (not repaired into fabricated content). */
export const UNSUPPORTED_CLAIM_PATTERNS: RegExp[] = [
  /מהדור(ה|ות)\s*מוגבל/, /limited edition/i, /\bנדיר(ים|ה)?\b/, /\brare(st)?\b/i,
  /בלעדי(ת|ים)?/, /\bexclusive\b/i, /אספנ/, /\bcollector'?s?\b/i,
]
export function isUnsupportedClaim(title: string): boolean {
  const t = (title || '').trim()
  return UNSUPPORTED_CLAIM_PATTERNS.some((re) => re.test(t))
}

/** True when a valid-but-weak title should get ONE bounded title-repair pass. */
export function needsTitleRepair(title: string): boolean {
  const t = (title || '').trim()
  return isGenericTitle(t) || titleSkeleton(t) === 'lead_sep' || hasMixedBrandForm(t)
}

/** True when a title mixes an English brand form and its Hebrew form redundantly. */
export function hasMixedBrandForm(title: string): boolean {
  // e.g. "Amouage אמואג׳ …" — a Latin word immediately followed by a Hebrew word
  // pair at the very start (redundant transliteration), not "brand של product".
  return /^[A-Za-z][A-Za-z'’.-]*\s+[֐-׿]{2,}[֐-׿'’]*(\s|:|—|-|$)/.test((title || '').trim())
}

/**
 * Adaptive, deterministic full-set diversification (MMR / marginal-utility) —
 * NO brand blacklist, NO fixed per-brand cap:
 *   1. collapse exact near-identical ideas (same subject / entity+intent) to the
 *      strongest representative,
 *   2. greedily select by marginal utility = base score − entity-concentration
 *      pressure (grows per already-picked same-entity) − skeleton-repeat penalty
 *      (heavy for a repeated non-'specific' skeleton) − intent-repeat penalty.
 * Result: one/two strong ideas per entity survive; a sixth same-brand idea loses
 * to a reasonably strong idea from another entity, yet a repeated-brand idea with
 * a genuinely distinct need and NO comparable alternative still wins its slot.
 * Deterministic (stable tie-break by title). `limit` caps the returned count.
 */
export function selectDiverse<T extends DiversifiableIdea>(items: T[], limit = Infinity, opts: { entityWeight?: number } = {}): T[] {
  const entityWeight = opts.entityWeight ?? 0.6
  const decay = 0.82
  type F = { item: T; entity: string; intent: string; subj: string; skel: string; score: number }
  const feats: F[] = items.map((it) => ({
    item: it,
    entity: primaryEntityKey(it.title, it.primaryKeyword),
    intent: intentBucket(it.searchIntent, it.title, it.primaryKeyword),
    subj: subjectKey(it.title),
    skel: titleSkeleton(it.title),
    score: typeof it.suggestionScore === 'number' ? it.suggestionScore : 0.5,
  }))

  // 1) collapse near-identical (same subject, OR same entity+intent) → strongest.
  const byCluster = new Map<string, F>()
  const bySubject = new Map<string, string>()
  for (const f of feats) {
    let key = `${f.entity}::${f.intent}`
    if (bySubject.has(f.subj)) key = bySubject.get(f.subj)!
    else bySubject.set(f.subj, key)
    const cur = byCluster.get(key)
    if (!cur || f.score > cur.score || (f.score === cur.score && f.item.title < cur.item.title)) byCluster.set(key, f)
  }

  // 2) greedy marginal-utility selection — ADAPTIVE penalties only, NO fixed
  //    skeleton or per-entity cap. Repeated syntax/entity lowers marginal utility
  //    but never blocks an otherwise strong, distinct topic when it beats the best
  //    remaining alternative.
  const remaining = Array.from(byCluster.values()).sort((a, b) => b.score - a.score || (a.item.title < b.item.title ? -1 : 1))
  const selected: F[] = []
  const entC = new Map<string, number>()
  const skelC = new Map<string, number>()
  const intentC = new Map<string, number>()
  while (selected.length < limit && remaining.length) {
    let bestIdx = -1
    let bestU = -Infinity
    for (let i = 0; i < remaining.length; i++) {
      const f = remaining[i]
      const eK = entC.get(f.entity) ?? 0
      const sK = f.skel === 'specific' ? 0 : (skelC.get(f.skel) ?? 0)
      const iK = intentC.get(f.intent) ?? 0
      const entPenalty = entityWeight * (1 - Math.pow(decay, eK))                 // 0 for first, grows
      const skelPenalty = f.skel === 'specific' ? 0 : 0.12 * (1 + sK)             // grows per repeat, never a hard cap
      const intentPenalty = iK > 0 ? 0.04 * iK : 0
      const u = f.score - entPenalty - skelPenalty - intentPenalty
      if (bestIdx === -1 || u > bestU || (u === bestU && f.item.title < remaining[bestIdx].item.title)) { bestU = u; bestIdx = i }
    }
    const [f] = remaining.splice(bestIdx, 1)
    selected.push(f)
    entC.set(f.entity, (entC.get(f.entity) ?? 0) + 1)
    skelC.set(f.skel, (skelC.get(f.skel) ?? 0) + 1)
    intentC.set(f.intent, (intentC.get(f.intent) ?? 0) + 1)
  }
  return selected.map((f) => f.item)
}

/** Back-compat: full MMR ordering (no cap). */
export function diversifySuggestions<T extends DiversifiableIdea>(items: T[]): T[] {
  return selectDiverse(items)
}
