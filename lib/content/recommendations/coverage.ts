/**
 * Existing-content cannibalization + need-based duplicate detection (P0-2) — pure.
 *
 * Live-proven false-passes:
 *   - "תוספי מזון מומלצים" accepted while a "תוספי תזונה מומלצים" page exists
 *     (SYNONYM: מזון≈תזונה, identical need);
 *   - "כמה עולה סידור פרחים לחתונה" accepted while a wedding-floral-cost page
 *     already owns that need;
 *   - two batch topics "כמה עולה לבנות דף נחיתה … פירוט מחירים" and "… המדריך
 *     המלא למחירים" — SAME subject + SAME price need, one tagged transactional
 *     the other informational, so the intent-cluster dedupe missed them.
 *
 * Mechanism: compare NORMALIZED subject head + SEARCH NEED (coarser than the
 * buy/info intent cluster — a price question is one need regardless of label),
 * with a small domain-neutral synonym map folded in. Cannibalization compares
 * against existing page titles / focus keywords / slugs.
 */

import { distinctiveTokensOf, canonicalToken, canonicalVariants, topicSignature, isHighConfidenceDuplicate } from './semantic-dup'
import { normalizePhrase } from './keyword-guard'

/** Domain-neutral synonym groups (equivalent search intent). Each token maps to
 *  its group representative before comparison. Curated, small, grammar-level. */
const SYNONYM_GROUPS: string[][] = [
  ['מזון', 'תזונה', 'תזונתי', 'תזונתית'],
  ['מחיר', 'עלות', 'מחירים', 'עלויות'],
  ['סוכנות', 'משרד', 'חברת', 'חברה'],
  ['רכב', 'מכונית', 'אוטו'],
  ['רופא', 'דוקטור'],
  ['תמונה', 'תמונות', 'צילום', 'צילומים'],
  ['בית', 'ביתי', 'ביתית'],
  ['ילד', 'ילדים', 'ילדות'],
]
const SYNONYM_REP = new Map<string, string>()
for (const g of SYNONYM_GROUPS) { const rep = canonicalToken(g[0]); for (const w of g) SYNONYM_REP.set(canonicalToken(w), rep) }

/** Fold a canonical token to its synonym-group representative (or itself). */
export function synonymFold(tok: string): string {
  return SYNONYM_REP.get(tok) ?? tok
}

// PRICE / question-framing tokens — captured by the coarse NEED, never part of
// the SUBJECT (a price question is 'cost'; "כמה עולה"/"מחיר"/"תקציב" must not be
// the shared distinctive tokens that make two pages "the same subject").
const PRICE_FRAMING = new Set(
  ['כמה', 'עולה', 'עולות', 'עולים', 'מחיר', 'מחירים', 'עלות', 'עלויות', 'תקציב', 'תמחור', 'מדריך', 'מלא',
   'price', 'cost', 'budget', 'much'].map((t) => canonicalToken(t)).filter(Boolean),
)
/** Distinctive tokens with synonym folding, MINUS price/question-framing words —
 *  so מזון≈תזונה and "מחיר סידור פרחים לחתונה" vs "כמה עולה עיצוב פרחוני לחתונה"
 *  compare on the real subject (floral/wedding), not the price framing. */
function synonymTokens(phrase: string): Set<string> {
  const out = new Set<string>()
  for (const t of distinctiveTokensOf(phrase)) {
    if (PRICE_FRAMING.has(t)) continue
    out.add(synonymFold(t)); for (const v of canonicalVariants(t)) if (!PRICE_FRAMING.has(v)) out.add(synonymFold(v))
  }
  return out
}

export type SearchNeed = 'cost' | 'howto' | 'compare' | 'selection' | 'local' | 'info'

const COST_RE = /(?:^|\s)(?:כמה\s+עולה|מחיר|מחירים|עלות|עלויות|תמחור|price|cost)(?:\s|$)/i
const HOWTO_RE = /(?:^|\s)(?:איך|כיצד|מדריך|טיפול|טיפוח|how\s+to|guide)(?:\s|$)/i
const COMPARE_RE = /(?:^|\s)(?:לעומת|מול|הבדל|השוואה|vs\.?|versus)(?:\s|$)/i
const SELECT_RE = /(?:^|\s)(?:לבחור|בחירת|איזה|איזו|מומלץ|הטוב|best|choose)(?:\s|$)/i
const LOCAL_RE = /(?:^|\s)(?:חנות|חנויות|משלוח|באזור|ליד|בעיר|shop|store|near)(?:\s|$)/i

/** The coarse SEARCH NEED — a price question is 'cost' whether the model labeled
 *  it transactional or informational (that mislabel let two price pages pass). */
export function searchNeedOf(keyword: string, title: string, _intent?: string): SearchNeed {
  const hay = `${keyword} ${title}`
  if (COST_RE.test(hay)) return 'cost'
  if (COMPARE_RE.test(hay)) return 'compare'
  if (LOCAL_RE.test(hay)) return 'local'
  if (SELECT_RE.test(hay)) return 'selection'
  if (HOWTO_RE.test(hay)) return 'howto'
  return 'info'
}

export interface TopicNeed { primaryKeyword: string; title: string; intent?: string }

/** Same underlying need: shared distinctive SUBJECT HEAD (synonym-folded) AND the
 *  SAME coarse search need — catches the transactional/informational price-page
 *  pair the intent-cluster dedupe missed. Falls back to the strict semantic
 *  duplicate for non-cost needs. */
export function isSameNeedDuplicate(a: TopicNeed, b: TopicNeed): boolean {
  if (isHighConfidenceDuplicate(topicSignature(a.primaryKeyword, a.intent), topicSignature(b.primaryKeyword, b.intent))) return true
  const needA = searchNeedOf(a.primaryKeyword, a.title, a.intent)
  const needB = searchNeedOf(b.primaryKeyword, b.title, b.intent)
  if (needA !== needB) return false
  const subA = synonymTokens(`${a.primaryKeyword} ${a.title}`)
  const subB = synonymTokens(`${b.primaryKeyword} ${b.title}`)
  if (subA.size === 0 || subB.size === 0) return false
  let shared = 0
  for (const t of subA) if (subB.has(t)) shared++
  // A distinctive-subject overlap covering the majority of the smaller topic +
  // the same coarse need = the same page (price/how-to/… of the same subject).
  return shared >= 2 && shared / Math.min(subA.size, subB.size) >= 0.6
}

/**
 * SEMANTIC title–keyword alignment (P0-2 fix): a keyword is aligned when its
 * distinctive subject tokens are (mostly) present in the title — synonym/fold
 * tolerant, so a paraphrase passes ("מחיר סידור פרחים לחתונה" ⇄ "כמה עולה סידור
 * פרחים לחתונה? …") while a truly off-topic pair fails (shoes keyword under a
 * suit title). NOT literal wording.
 */
export function isTitleKeywordAligned(primaryKeyword: string, title: string): boolean {
  const kw = synonymTokens(primaryKeyword)
  if (kw.size === 0) return true // no distinctive subject to contradict
  const ti = synonymTokens(title)
  let shared = 0
  for (const t of kw) if (ti.has(t)) shared++
  return shared / kw.size >= 0.6
}

export type CoverageMatchType = 'exact' | 'owns_need' | 'improve' | 'distinct'
export interface CoverageMatch { existingTitle: string; url: string | null; matchType: CoverageMatchType; score: number; sharedNeed: string[] }

export interface ExistingCoverageDoc { title: string; url?: string | null; focusKeyword?: string | null; slug?: string | null }

/**
 * Assess whether existing content already owns the topic's need. Compares the
 * topic against each existing doc's title / focus keyword / slug with synonym
 * folding: full subject coverage + same need = owns_need; partial = improve.
 */
export function assessNeedCannibalization(topic: TopicNeed, existing: ExistingCoverageDoc[]): { matchType: CoverageMatchType; matches: CoverageMatch[] } {
  // Compare on the underlying NEED = the normalized primary keyword's distinctive
  // subject. A headline title carries marketing tail ("פירוט מחירים וטיפים
  // לחיסכון") that is NOT part of the need and must not dilute coverage — that
  // dilution let "מחיר סידור פרחים לחתונה" slip past a "כמה עולה עיצוב פרחוני
  // לחתונה" page that already owns the wedding-floral pricing need. Fall back to
  // keyword+title only when the keyword alone has no usable distinctive subject.
  const topicCore = synonymTokens(topic.primaryKeyword)
  const topicSub = topicCore.size >= 2 ? topicCore : synonymTokens(`${topic.primaryKeyword} ${topic.title}`)
  const topicNeed = searchNeedOf(topic.primaryKeyword, topic.title, topic.intent)
  const topicNorm = normalizePhrase(topic.primaryKeyword)
  const matches: CoverageMatch[] = []
  let best: CoverageMatchType = 'distinct'
  const rank: Record<CoverageMatchType, number> = { distinct: 0, improve: 1, owns_need: 2, exact: 3 }

  for (const doc of existing) {
    const docText = [doc.title, doc.focusKeyword, (doc.slug || '').replace(/[-_]+/g, ' ')].filter(Boolean).join(' ')
    if (!docText.trim()) continue
    const docSub = synonymTokens(docText)
    if (docSub.size === 0) continue
    let shared = 0
    for (const t of topicSub) if (docSub.has(t)) shared++
    if (shared === 0) continue
    const covTopic = shared / topicSub.size
    const covDoc = shared / docSub.size
    const docNeed = searchNeedOf(doc.title || '', doc.focusKeyword || '', undefined)
    const sameNeed = docNeed === topicNeed
    const shared2 = Array.from(topicSub).filter((t) => docSub.has(t))

    const uncovered = topicSub.size - shared
    let mt: CoverageMatchType = 'distinct'
    if (normalizePhrase(doc.focusKeyword || doc.title || '') === topicNorm) mt = 'exact'
    // Existing doc covers the topic's subject AND same need → it owns the need
    // (covTopic keys on the TOPIC so an existing page with extra tokens/slug
    // words still counts; shared>=2 stops a broad page owning a long-tail).
    else if (covTopic >= 0.75 && sameNeed && shared >= 2) mt = 'owns_need'
    // Same NEED + subject overlap with AT MOST ONE uncovered token — the pages
    // answer the same underlying question (wedding-floral pricing), differing only
    // in an arrangement/design synonym (סידור vs עיצוב). NEED comparison, not
    // exact wording.
    else if (sameNeed && shared >= 2 && covTopic >= 0.6 && uncovered <= 1) mt = 'owns_need'
    // Strong-but-partial overlap of the same need → improve the existing page.
    else if (covTopic >= 0.5 && covDoc >= 0.3 && sameNeed && shared >= 2) mt = 'improve'
    if (mt !== 'distinct') {
      matches.push({ existingTitle: doc.title || (doc.focusKeyword ?? ''), url: doc.url ?? null, matchType: mt, score: Number(Math.max(covTopic, covDoc).toFixed(2)), sharedNeed: shared2.slice(0, 6) })
      if (rank[mt] > rank[best]) best = mt
    }
  }
  matches.sort((a, b) => rank[b.matchType] - rank[a.matchType] || b.score - a.score)
  return { matchType: best, matches: matches.slice(0, 6) }
}
