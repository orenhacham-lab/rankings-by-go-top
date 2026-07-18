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
import { sharesSubjectHead, coversAllSubjectHeads, subjectTokensOf, isModifierToken } from './link-relevance'

// ACTION / NEED class — building/creating a thing answers a DIFFERENT need than
// promoting/marketing it. A shared commercial entity head ("חנות") does not make
// "הקמת חנות" (build a store) and "קידום חנות" (promote a store) the same need.
const BUILD_ACTIONS = new Set(['הקמת', 'הקמה', 'להקים', 'בניית', 'בנייה', 'לבנות', 'יצירת', 'יצירה', 'ליצור', 'פתיחת', 'לפתוח', 'build', 'create', 'setup'].map(canonicalToken).filter(Boolean))
const PROMOTE_ACTIONS = new Set(['קידום', 'לקדם', 'שיווק', 'לשווק', 'פרסום', 'לפרסם', 'seo', 'marketing', 'promotion', 'advertising'].map(canonicalToken).filter(Boolean))
function actionClassOf(text: string): 'build' | 'promote' | null {
  let build = false, promote = false
  for (const t of distinctiveTokensOf(text)) {
    const c = canonicalToken(t)
    if (BUILD_ACTIONS.has(c) || BUILD_ACTIONS.has(t)) build = true
    if (PROMOTE_ACTIONS.has(c) || PROMOTE_ACTIONS.has(t)) promote = true
  }
  if (build && !promote) return 'build'
  if (promote && !build) return 'promote'
  return null
}
/** True when two phrases carry INCOMPATIBLE action/need classes (build vs
 *  promote) — they answer different needs and cannot own/improve each other. */
export function incompatibleActionNeed(a: string, b: string): boolean {
  const ca = actionClassOf(a), cb = actionClassOf(b)
  return ca !== null && cb !== null && ca !== cb
}

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
export function isSameNeedDuplicate(a: TopicNeed, b: TopicNeed, typeWords?: Set<string>): boolean {
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
  if (!(shared >= 2 && shared / Math.min(subA.size, subB.size) >= 0.6)) return false
  // DISCRIMINATIVE-CORE gate (P0): when per-project domain/type words are known,
  // two topics overlapping ONLY on broad domain words (ציוד/כושר) but with
  // different concrete heads are NOT the same page — require a shared subject head
  // after those domain words are stripped.
  if (typeWords && typeWords.size) return sharesSubjectHead(`${a.primaryKeyword} ${a.title}`, `${b.primaryKeyword} ${b.title}`, typeWords)
  return true
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
  if (shared / kw.size < 0.6) return false
  // DISCRIMINATIVE-CORE gate (P0): a generic CONTAINER word ("חברה"→"משרד"
  // synonym fold) shared with the title must NOT, by itself, establish alignment
  // — otherwise a generic "מזכירות חברה" keyword aligns with any office/company
  // title. The keyword's real subject core (base generic/container/audience words
  // stripped — but per-project DOMAIN CONTENT words like "אופנה"/"כושר" KEPT,
  // since they are legitimate subject matter) must share a head with the title.
  // When the keyword has NO discriminative core (only generic words) the ratio
  // alone decides (nothing distinctive to gate).
  const kwCore = subjectTokensOf(primaryKeyword).filter((t) => !/^\d+$/.test(t))
  if (kwCore.length === 0) return true
  return sharesSubjectHead(primaryKeyword, title)
}

export type CoverageMatchType = 'exact' | 'owns_need' | 'improve' | 'distinct'
export interface CoverageMatch { existingTitle: string; url: string | null; matchType: CoverageMatchType; score: number; sharedNeed: string[]; unmatchedEntities?: string[]; basisPageType?: string | null }

const HEB_PROCLITICS = 'והבלמשכ'
/** Every canonical/morphological form of a token — final-letter + plural folded
 *  (canonicalVariants, applied recursively so "הוויטמינ"→"וויטמינ"→"ויטמינ"),
 *  each proclitic-stripped form (בכל→כל), and each synonym-folded — so a spelling
 *  / morphology / clitic variant collapses onto its canonical base. */
function expandForms(t: string): Set<string> {
  const forms = new Set<string>([t])
  for (let pass = 0; pass < 2; pass++) for (const f of [...forms]) { forms.add(canonicalToken(f)); for (const v of canonicalVariants(f)) forms.add(v) }
  for (const f of [...forms]) { let s = f; while (s.length >= 3 && HEB_PROCLITICS.includes(s[0])) { s = s.slice(1); forms.add(s) } }
  const out = new Set<string>()
  for (const f of forms) { if (!f) continue; out.add(f); out.add(synonymFold(canonicalToken(f))) }
  return out
}
/** Cluster keys ≥3 chars (the comparable subject forms). */
function clusterKeys(t: string): string[] { return [...expandForms(t)].filter((k) => k.length >= 3 && !/^\d+$/.test(k)) }
/** A token is grammar (modifier/framing/quantifier/verb) if ANY of its forms is. */
function isGrammarToken(t: string): boolean { for (const f of expandForms(t)) if (isModifierToken(f)) return true; return false }
// AUDIENCE / RECIPIENT words — "לילדים", "למבוגרים", "לנשים" qualify WHO the
// subject is for; a shared audience alone ("ויטמין C לילדים" vs "מינון מגנזיום
// לילדים") is NOT a shared subject and must not establish ownership. They stay
// distinctive for coversAllSubjectHeads (kids-magnesium ≠ sleep-magnesium), so
// they are excluded ONLY from the shared-head gate. Domain-neutral.
const AUDIENCE_TYPEWORDS = (() => {
  const base = ['ילד', 'ילדים', 'ילדות', 'תינוק', 'תינוקות', 'פעוט', 'פעוטות', 'מבוגר', 'מבוגרים', 'נשים', 'אישה', 'גבר', 'גברים', 'נוער', 'בנים', 'בנות', 'קשיש', 'קשישים',
    'kids', 'children', 'child', 'adults', 'adult', 'women', 'woman', 'men', 'man', 'baby', 'babies', 'teens']
  const out = new Set<string>()
  for (const w of base) { const c = canonicalToken(w); if (c) out.add(c); for (const p of 'להבומש') { const pc = canonicalToken(p + w); if (pc) out.add(pc) } } // + proclitic forms (לילד, הילד…)
  return out
})()
/** Two subject tokens belong to the same content cluster when equal or sharing a
 *  ≥3-char stem (Hebrew stems are prefix-ish: פרח↔פרחוני, גוף↔גופני). */
function stemMatch(a: string, b: string): boolean {
  if (a === b) return true
  return a.length >= 3 && b.length >= 3 && a.slice(0, 3) === b.slice(0, 3) && Math.abs(a.length - b.length) <= 3
}
/**
 * DIAGNOSTIC: distinctive entities in the EXISTING doc that the topic does NOT
 * share and that PROJECT EVIDENCE does not corroborate — a candidate FOREIGN
 * vertical (e.g. "סוסים" on a health-supplement project). Same-cluster proof =
 * a stem match against the topic's own subject OR the project's evidence
 * vocabulary. Returns [] when no project vocabulary is supplied.
 *
 * PRODUCT LIMITATION (documented, not a bug): this is EXPOSED as a diagnostic but
 * NOT used to auto-reject ownership. Separating a genuinely foreign vertical
 * ("סוסים") from an on-domain extra CONCEPT ("body & soul" on a wellness page)
 * cannot be done by token overlap without a hardcoded word list or a
 * fixture-tuned count threshold — both of which the multi-domain generalization
 * contract forbids. Auto-blocking on it regresses legitimate near-identical
 * ownership (a wellness page whose extra words are "benefits/body/soul"). The
 * distinction requires a semantic signal, so the unmatched entities are surfaced
 * for the acceptance runner / operator review instead of silently deciding.
 */
export function unmatchedDocEntities(docText: string, topicText: string, projectVocab?: Set<string>): string[] {
  if (!projectVocab || projectVocab.size === 0) return []
  const refKeys = new Set<string>()
  const addRef = (t: string) => { for (const k of clusterKeys(t)) refKeys.add(k) }
  for (const t of subjectTokensOf(topicText)) addRef(t)
  for (const v of projectVocab) addRef(v)
  const out = new Set<string>()
  for (const raw of subjectTokensOf(docText)) {
    // Drop generic/price/attribute/framing/quantifier/verb words (grammar, not entities).
    if (isGrammarToken(raw)) continue
    const keys = clusterKeys(raw)
    if (keys.length === 0) continue
    // A real FOREIGN entity: no morphological cluster key stem-matches the topic
    // subject OR the project's evidence vocabulary.
    const matched = keys.some((k) => { for (const r of refKeys) if (stemMatch(k, r)) return true; return false })
    if (!matched) out.add(keys.reduce((a, b) => (b.length < a.length ? b : a))) // canonical (shortest) form
  }
  return Array.from(out)
}

export interface ExistingCoverageDoc { title: string; url?: string | null; focusKeyword?: string | null; slug?: string | null; type?: string | null; sourceKey?: string | null }

/** Vocabulary tokens corroborated by at least one source OTHER than `excludeSource`
 *  — provenance-aware so a coverage document can never corroborate its OWN unmatched
 *  entity (a horse article can't place "סוסים" in the vocab and then prove it). */
function vocabExcludingSource(provenance: Map<string, Set<string>>, excludeSource: string): Set<string> {
  const out = new Set<string>()
  for (const [tok, sources] of provenance) { for (const s of sources) if (s !== excludeSource) { out.add(tok); break } }
  return out
}

/**
 * Assess whether existing content already owns the topic's need. Compares the
 * topic against each existing doc's title / focus keyword / slug with synonym
 * folding: full subject coverage + same need = owns_need; partial = improve.
 */
export function assessNeedCannibalization(topic: TopicNeed, existing: ExistingCoverageDoc[], projectVocab?: Set<string>, provenance?: Map<string, Set<string>>, typeWords?: Set<string>): { matchType: CoverageMatchType; matches: CoverageMatch[] } {
  // DISCRIMINATIVE SUBJECT CORE (P0): fold the per-project corpus-derived
  // domain/type/container words (domainTypeWords) into the head gates so a broad
  // domain word alone ("כושר"/"משרד") can never own a specific subject
  // ("רצועות כושר"). The shared-head gate also excludes audience words; the
  // covers-all-heads gate keeps audience distinctive (see AUDIENCE_TYPEWORDS).
  const shareHeadTypeWords = typeWords && typeWords.size ? new Set([...AUDIENCE_TYPEWORDS, ...typeWords]) : AUDIENCE_TYPEWORDS
  const coverHeadTypeWords = typeWords && typeWords.size ? typeWords : undefined
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
    // ATTRIBUTE-ONLY guard (P0): ownership/improve requires a shared HEAD ENTITY,
    // not merely a shared colour/size/occasion/generic modifier. "ורדים ורודים"
    // and "אנטוריום ורוד" overlap only on the colour ורוד — the heads (ורד vs
    // אנטוריום/סחלב) differ, so the orchid/anthurium page does NOT own roses. The
    // exact-keyword match below is unaffected (it is identity, not overlap).
    // The shared head must be a REAL subject, not merely a shared audience/recipient
    // ("לילדים") — a kids-vitamin-C page does not own a kids-magnesium page.
    const shareHead = sharesSubjectHead(`${topic.primaryKeyword} ${topic.title}`, docText, shareHeadTypeWords)
    // The existing page covers the topic's ENTIRE distinctive subject head → it
    // owns the need regardless of the coarse-need label (a near-identical page
    // whose title only adds "כיצד"/framing flips howto↔info but answers the same
    // need — "לחזור לטבע…" ⇄ "לחזור לטבע…"). Keyed on the primary keyword's heads.
    const coversHeads = coversAllSubjectHeads(topic.primaryKeyword, docText, coverHeadTypeWords)
    let mt: CoverageMatchType = 'distinct'
    if (normalizePhrase(doc.focusKeyword || doc.title || '') === topicNorm) mt = 'exact'
    else if (!shareHead) mt = 'distinct'
    // Existing doc covers the topic's subject AND same need → it owns the need
    // (covTopic keys on the TOPIC so an existing page with extra tokens/slug
    // words still counts; shared>=2 stops a broad page owning a long-tail).
    else if (covTopic >= 0.75 && sameNeed && shared >= 2) mt = 'owns_need'
    // Near-identical: existing page covers the topic's WHOLE subject head → owns
    // the need even if the coarse need label differs (howto vs info noise).
    else if (coversHeads && shared >= 2) mt = 'owns_need'
    // Same NEED + subject overlap with AT MOST ONE uncovered token — the pages
    // answer the same underlying question (wedding-floral pricing), differing only
    // in an arrangement/design synonym (סידור vs עיצוב). NEED comparison, not
    // exact wording.
    else if (sameNeed && shared >= 2 && covTopic >= 0.6 && uncovered <= 1) mt = 'owns_need'
    // Strong-but-partial overlap of the same need → improve the existing page.
    else if (covTopic >= 0.5 && covDoc >= 0.3 && sameNeed && shared >= 2) mt = 'improve'
    // ACTION/NEED incompatibility (P0): build/create vs promote/market answer
    // different needs — a shared commercial entity head ("חנות") cannot make
    // "הקמת חנות" owned/improved by "קידום חנות". Downgrade to distinct.
    if ((mt === 'owns_need' || mt === 'improve') && incompatibleActionNeed(`${topic.primaryKeyword} ${topic.title}`, docText)) mt = 'distinct'
    // FOREIGN-ENTITY DIAGNOSTIC (P0): surface distinctive entities the existing doc
    // carries from a possibly-unrelated vertical ("סוסים") that project evidence
    // does not corroborate. Exposed for the acceptance runner / operator — NOT used
    // to silently reject (see unmatchedDocEntities: the vertical-vs-concept
    // distinction is a documented semantic limitation).
    // PROVENANCE-aware corroboration: exclude THIS doc's own contribution so it
    // cannot self-corroborate its unmatched entity ("סוסים" from a horse article).
    const docVocab = provenance ? vocabExcludingSource(provenance, doc.sourceKey ?? '') : projectVocab
    const foreign = unmatchedDocEntities(docText, `${topic.primaryKeyword} ${topic.title}`, docVocab)
    if (mt !== 'distinct') {
      matches.push({ existingTitle: doc.title || (doc.focusKeyword ?? ''), url: doc.url ?? null, matchType: mt, score: Number(Math.max(covTopic, covDoc).toFixed(2)), sharedNeed: shared2.slice(0, 6), basisPageType: doc.type ?? null, ...(foreign.length ? { unmatchedEntities: foreign.slice(0, 6) } : {}) })
      if (rank[mt] > rank[best]) best = mt
    }
  }
  matches.sort((a, b) => rank[b.matchType] - rank[a.matchType] || b.score - a.score)
  return { matchType: best, matches: matches.slice(0, 6) }
}
