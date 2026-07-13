/**
 * Recommendation GROUNDING + ENTITY-VALIDATION — pure, deterministic helpers
 * (no network/DB) that decide whether a topic is backed by real corpus evidence
 * BEFORE a title is trusted, that supporting links belong to the SAME canonical
 * entity (not a partial-token coincidence), that superlative/audience claims are
 * supported, and that user-facing reasons never leak internal labels.
 *
 * Design: everything here works off an injected EVIDENCE package (indexed
 * entities + a keyword-backed flag + existing titles). The engine builds the real
 * package from the cached scan / keyword research; tests build fixtures. No brand
 * blacklists — canonical identity is always derived from the project's own
 * indexed entities.
 */

import { primaryEntityKey, intentBucket, subjectKey } from './quality'

// ── Tokenization / normalization ────────────────────────────────────────────

const HEBREW = /[֐-׿]/
/** Strip geresh/gershayim + normalize Hebrew final letters; lowercase latin. */
export function normEntityToken(w: string): string {
  return (w || '')
    .replace(/['’`׳״"]/g, '')
    .replace(/ם$/, 'מ').replace(/ן$/, 'נ').replace(/ץ$/, 'צ').replace(/ף$/, 'פ').replace(/ך$/, 'כ')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '')
}

const ENTITY_STOP_RAW = [
  'the', 'a', 'an', 'of', 'for', 'to', 'and', 'in', 'on', 'with', 'di', 'de', 'del', 'la', 'le',
  'full', 'complete', 'ultimate',
  'בשמי', 'בושם', 'בשמים', 'ניחוח', 'ניחוחות', 'של', 'עם', 'על', 'המדריך', 'מדריך', 'לבשמי',
  'מלא', 'המלא', 'די', 'ה', 'מדריכ',
  'perfume', 'perfumes', 'fragrance', 'fragrances', 'scent', 'guide', 'best',
]
// NORMALIZED (finals/geresh) so membership tests match entityTokens output.
const ENTITY_STOP = new Set(ENTITY_STOP_RAW.map((w) => w.replace(/['’`׳״"]/g, '').replace(/ם$/, 'מ').replace(/ן$/, 'נ').replace(/ץ$/, 'צ').replace(/ף$/, 'פ').replace(/ך$/, 'כ').toLowerCase()))

/** How-to / audience / framing words that are an INTENT, not a brand. */
const INTENT_ISH_RAW = [
  'איך', 'כיצד', 'לבחור', 'לפי', 'הטובים', 'הטוב', 'מומלצים', 'מומלץ', 'סקירה', 'ביקורת',
  'לגבר', 'לגברים', 'לאישה', 'לנשים', 'למתחילים', 'מתחילים', 'לקיץ', 'לחורף', 'לערב', 'ליום',
  'how', 'choose', 'top', 'review', 'guide', 'best',
]
/** Common domain DESCRIPTORS (categories / attributes / verbs) — never a brand, so
 *  they must not make an informational topic look "branded". Not a blacklist of
 *  topics: they are only excluded from BRAND detection, never from generation. */
const COMMON_HE_RAW = [
  'מזרחי', 'מזרחיים', 'מזרחית', 'נישה', 'יוקרתי', 'יוקרתיים', 'יוקרתית', 'אחסון', 'לאחסן', 'שמירה',
  'עונה', 'עונות', 'בית', 'בבית', 'טיפוח', 'שימוש', 'השוואה', 'בחירה', 'קלאסי', 'מודרני', 'עמיד',
  'עדין', 'מסע', 'המסע', 'ניחוח', 'ניחוחות', 'סוגי', 'סוג', 'חילוץ', 'הפקה',
]
// Sets are stored NORMALIZED (same transform as entityTokens) so final-letter and
// geresh variants match reliably ("למתחילים" ↔ its normalized form).
const INTENT_ISH = new Set(INTENT_ISH_RAW.map((w) => normEntityToken(w)))
const COMMON_HE = new Set(COMMON_HE_RAW.map((w) => normEntityToken(w)))

/** Content tokens of a string (drops generic filler + short tokens). */
export function entityTokens(s: string): string[] {
  return (s || '')
    .split(/[\s—:\-–|.,!?()]+/)
    .map(normEntityToken)
    .filter((t) => t.length >= 2 && !ENTITY_STOP.has(t))
}

// ── Canonical entity identity ───────────────────────────────────────────────

export interface EntityRecord {
  /** Stable indexed id (Shopify GID / URL / slug). NEVER exposed in the UI. */
  id: string
  type: 'product' | 'category' | 'brand' | 'article' | 'page'
  /** The indexed display name — the CANONICAL source of the brand's spelling. */
  title: string
  url?: string
}

const LATIN_TOKEN = /[A-Za-z][A-Za-z'’.\-]*/g
function firstSegment(title: string): string {
  return (title || '').split(/\s*[—:\-–|]\s*/)[0] || title || ''
}
function latinBrand(s: string): string[] {
  return (s.match(LATIN_TOKEN) || []).map(normEntityToken).filter((t) => t.length >= 2 && !ENTITY_STOP.has(t))
}

/**
 * The canonical BRAND phrase of a topic, as an ordered token list so a multi-word
 * brand ("acqua di parma") is compared as a PHRASE, not a single token. Prefers
 * LATIN brand tokens (the store indexes brands in Latin: Gucci / Acqua di Parma)
 * — first from the title lead, then from the keyword, so a Hebrew title with a
 * Latin keyword still bridges to the indexed entity. Falls back to significant
 * Hebrew tokens (dropping generic category + intent words). Empty for a pure
 * informational topic.
 */
export function brandTokens(title: string, keyword = ''): string[] {
  const lead = firstSegment(title)
  const latinLead = latinBrand(lead)
  if (latinLead.length) return latinLead.slice(0, 3)
  const latinKw = latinBrand(keyword || '')
  if (latinKw.length) return latinKw.slice(0, 3)
  const heb = entityTokens(lead).filter((t) => !INTENT_ISH.has(t) && !COMMON_HE.has(t))
  return heb.slice(0, 3)
}

/**
 * True when a topic is ABOUT a brand/entity (so its existence must be verified),
 * vs a generic informational topic. Branded = a Latin proper-noun token appears,
 * OR ≥2 significant non-generic Hebrew tokens remain (e.g. "קלווין קליין"). A
 * single common Hebrew word ("ערב") is NOT a brand.
 */
export function isBrandedTopic(title: string, keyword = ''): boolean {
  const lead = firstSegment(title)
  if (latinBrand(lead).length || latinBrand(keyword || '').length) return true
  return entityTokens(lead).filter((t) => !INTENT_ISH.has(t) && !COMMON_HE.has(t)).length >= 2
}

/** A stable canonical key for a brand phrase (order-preserving, normalized). */
export function canonicalBrandKey(tokensList: string[]): string {
  return tokensList.map(normEntityToken).filter(Boolean).join(' ')
}

/**
 * Does an indexed entity title belong to the topic's brand? Requires the topic's
 * FULL brand phrase to be contained (as a token set) in the entity title — so
 * "acqua di parma" (3 tokens) does NOT match "Profumum Roma Acqua Viva" (shares
 * only "acqua"). A single-token brand must appear as a standalone entity token.
 */
export function entityMatchesBrand(topicBrand: string[], entityTitle: string): boolean {
  const brand = topicBrand.map(normEntityToken).filter(Boolean)
  if (brand.length === 0) return false
  const bagTokens = entityTokens(entityTitle)
  const bag = new Set(bagTokens)
  // Skeletons of the entity's Hebrew tokens bridge transliteration variants
  // (topic "ברוז'" ↔ indexed "בורוג׳") without a brand list.
  const bagSkel = bagTokens.filter((t) => HEBREW.test(t) && brandSkeleton(t).length >= 3).map((t) => brandSkeleton(t))
  const matched = (t: string): boolean => {
    if (bag.has(t)) return true
    if (!HEBREW.test(t)) return false
    const s = brandSkeleton(t)
    if (s.length < 3) return false
    return bagSkel.some((bs) => bs === s || (Math.abs(bs.length - s.length) <= 1 && levenshtein(bs, s) <= 1))
  }
  let hit = 0
  for (const t of brand) if (matched(t)) hit++
  // Multi-token brand: require (almost) the whole phrase; single-token: exact/skeleton.
  if (brand.length >= 2) return hit >= Math.max(2, Math.ceil(brand.length * 0.8))
  return hit === 1
}

/** Indexed entities whose canonical brand matches the topic's brand phrase. */
export function matchingEntities(topicBrand: string[], entities: EntityRecord[]): EntityRecord[] {
  if (topicBrand.length === 0) return []
  return (entities || []).filter((e) => entityMatchesBrand(topicBrand, e.title))
}

// ── Supporting-link entity validation ───────────────────────────────────────

export interface EntityLink { url: string; anchor: string }

/**
 * Keep only supporting links whose target belongs to the topic's canonical
 * brand (or, for a non-branded topic, links are left untouched — they were
 * chosen by keyword relevance, not brand identity). Fixes the "Acqua di Parma →
 * Profumum Roma" partial-token mismatch. `linkTitleOf` resolves a link's indexed
 * title (anchor is the fallback).
 */
export function filterBrandLinks(
  topicBrand: string[], links: EntityLink[], linkTitleOf: (url: string) => string | undefined = () => undefined,
): { kept: EntityLink[]; dropped: EntityLink[] } {
  if (topicBrand.length === 0) return { kept: links.slice(), dropped: [] }
  const kept: EntityLink[] = []
  const dropped: EntityLink[] = []
  for (const l of links) {
    const title = linkTitleOf(l.url) || l.anchor || ''
    if (entityMatchesBrand(topicBrand, title)) kept.push(l)
    else dropped.push(l)
  }
  return { kept, dropped }
}

// ── Comparison validation ───────────────────────────────────────────────────

const COMPARE_SPLIT = /\s+(?:vs\.?|versus|מול|לעומת|או)\s+/i

/**
 * When a title is a two-product comparison ("X vs Y" / "X מול Y"), return the two
 * compared brand phrases; else null. A comparison is only valid when BOTH sides
 * resolve to indexed entities.
 */
export function comparisonSides(title: string): [string[], string[]] | null {
  const t = (title || '').trim()
  if (!COMPARE_SPLIT.test(t)) return null
  const [a, b] = t.split(COMPARE_SPLIT)
  const at = entityTokens(a).slice(-3)
  const bt = entityTokens(b).slice(0, 3)
  if (at.length === 0 || bt.length === 0) return null
  return [at, bt]
}

/** Both compared products must exist among the indexed entities. */
export function comparisonIsGrounded(title: string, entities: EntityRecord[]): boolean {
  const sides = comparisonSides(title)
  if (!sides) return true // not a comparison → not gated here
  return matchingEntities(sides[0], entities).length > 0 && matchingEntities(sides[1], entities).length > 0
}

// ── Claim grounding (superlatives / audiences / attributes) ─────────────────

/** Claims that require corpus evidence. Each maps a label to detector + the
 *  evidence tokens that would justify it. */
export const CLAIM_LEXICON: { label: string; res: RegExp; evidence: string[]; discard?: boolean }[] = [
  { label: 'iconic', res: /אייקוני(ת|ם|ים)?|\biconic\b|\blegendary\b/i, evidence: ['אייקון', 'iconic', 'legend'] },
  { label: 'trending', res: /טרנד(ים)?|מגמ(ה|ות)|\btrend(ing|s)?\b|\bhype\b/i, evidence: ['טרנד', 'trend'] },
  { label: 'best', res: /הטובים ביותר|הטוב ביותר|הכי טוב(ים)?|\bbest\b|most popular|הכי פופולר/i, evidence: ['מומלצ', 'best', 'top'] },
  { label: 'historical', res: /השפעה היסטורית|ההיסטוריה של|historical impact|history of/i, evidence: ['היסטורי', 'history', 'הושק', 'נוסד', 'founded'] },
  { label: 'luxurious', res: /יוקרתי(ים|ת)?|\bluxur(y|ious)\b/i, evidence: ['יוקרה', 'luxur', 'יוקרתי'] },
  { label: 'oriental', res: /מזרחי(ים|ת)?|\b(oriental|eastern)\b/i, evidence: ['מזרחי', 'oriental', 'eastern', 'oud', 'אוד'] },
  { label: 'long_lasting', res: /עמיד(ים|ות)?|נשאר(ים)? זמן רב|\blong[-\s]?lasting\b/i, evidence: ['עמידות', 'long', 'סילאז', 'sillage'] },
  { label: 'gentle', res: /עדין(ים|ה)?|\bgentle\b|\bmild\b/i, evidence: ['עדין', 'gentle'] },
  { label: 'unisex', res: /יוניסקס|\bunisex\b/i, evidence: ['יוניסקס', 'unisex'] },
  { label: 'modern', res: /מודרני(ים|ת)?|\bmodern\b/i, evidence: ['מודרני', 'modern'] },
  { label: 'season', res: /לקיץ|לחורף|קיצי(ים)?|חורפי(ים)?|for summer|for winter|summer|winter/i, evidence: ['קיץ', 'חורף', 'summer', 'winter', 'עונ', 'season'] },
  // Audience-SAFETY claims can never be inferred — discard, do not neutralize.
  { label: 'children', res: /לילד(ים|ות)|לתינוק(ות)?|בטוח לילדים|for (kids|children|toddlers)|child[-\s]?safe|kid[-\s]?friendly/i, evidence: ['ילד', 'תינוק', 'child', 'kid', 'baby'], discard: true },
]

/** The claims in a title that the evidence text does NOT support. */
export function unsupportedClaims(title: string, evidenceText: string): { label: string; discard: boolean }[] {
  const t = (title || '').trim()
  const ev = (evidenceText || '').toLowerCase()
  const out: { label: string; discard: boolean }[] = []
  for (const c of CLAIM_LEXICON) {
    if (!c.res.test(t)) continue
    const supported = c.evidence.some((e) => ev.includes(e.toLowerCase()))
    if (!supported) out.push({ label: c.label, discard: !!c.discard })
  }
  return out
}

/** True when the title makes an audience-safety claim that MUST be evidence-backed. */
export function claimsProtectedAudience(title: string): boolean {
  return CLAIM_LEXICON.filter((c) => c.discard).some((c) => c.res.test((title || '').trim()))
}

/**
 * Neutralize unsupported NON-safety claim adjectives (iconic/best/luxurious/
 * seasonal…) by removing the claim word and cleaning spacing/punctuation. Safety
 * claims are never neutralized (the topic is discarded instead). Conservative:
 * only strips the matched claim tokens, leaving the concrete subject intact.
 */
export function neutralizeClaims(title: string, evidenceText: string): { title: string; changed: boolean } {
  const before = (title || '').trim()
  const bad = unsupportedClaims(before, evidenceText).filter((c) => !c.discard).map((c) => c.label)
  if (bad.length === 0) return { title: before, changed: false }
  const badRes = CLAIM_LEXICON.filter((c) => bad.includes(c.label))
  // Remove the WHOLE word carrying an unsupported claim (including any attached
  // Hebrew prefix like ה/ו) so no dangling fragment ("ה", "וה") is left behind.
  const kept = before.split(/\s+/).filter((w) => {
    const bareRoot = w.replace(/^[והבכלמש]{1,2}/, '')
    return !badRes.some((c) => c.res.test(w) || c.res.test(bareRoot))
  })
  const t = kept.join(' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.!?:])/g, '$1')
    .replace(/\s*[-–—:|]\s*$/g, '')
    .replace(/^\s*[-–—:|]\s*/g, '')
    .replace(/(^|\s)ו(\s|$)/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
  return { title: t, changed: t !== before }
}

// ── User-facing reason cleanup ──────────────────────────────────────────────

/** Internal labels / cluster ids that must never surface in "why suggested". */
export const NON_EVIDENCE_REASON_PATTERNS: RegExp[] = [
  /cluster\s*\d+/i, /\bcluster\b/i,
  /מותגים פופולריים/, /מותגים מרובים/, /מותג פופולרי/,
  /פונה לקהל יעד חדש/, /לקהל יעד חדש/, /קהל יעד חדש/, /פונה לקהל יעד/, /קהל חדש/,
  /popular brands?/i, /multiple brands?/i, /new audience/i, /general (consumer )?interest/i,
  /נושא מעניין/, /נושא כללי/, /generally interesting/i,
]

/** True when a reason is ONLY a non-evidence label (no concrete corpus fact). */
export function isNonEvidenceReason(reason: string): boolean {
  const r = (reason || '').trim()
  if (!r) return true
  const stripped = sanitizeReason(r)
  return stripped.trim().length === 0
}

/**
 * Remove internal labels / cluster ids / non-evidence phrases from a reason,
 * returning what concrete text remains (may be empty). Also strips a trailing
 * "(מקור: cluster N)" provenance parenthetical.
 */
export function sanitizeReason(reason: string): string {
  let r = (reason || '').trim()
  // Drop a provenance parenthetical that carries only a cluster/internal label.
  r = r.replace(/[（(][^)）]*cluster\s*\d+[^)）]*[)）]/gi, ' ')
  for (const re of NON_EVIDENCE_REASON_PATTERNS) r = r.replace(new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g'), ' ')
  return r
    .replace(/[（(]\s*[)）]/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.!?:])/g, '$1')
    .replace(/^[\s,;:.\-–—]+|[\s,;:.\-–—]+$/g, '')
    .trim()
}

// ── Grounding assessment ────────────────────────────────────────────────────

export interface GroundingEvidence {
  /** Indexed brand/product/category/article entities (canonical identity source). */
  entities: EntityRecord[]
  /** True when keyword research supplied a real matching query for this topic. */
  keywordBacked: boolean
  /** Existing article/page titles (for the corpus-gap signal + evidence text). */
  existingTitles: string[]
}

export type GroundingDiscard =
  | 'ungrounded_entity'      // brand topic with no matching indexed entity
  | 'unsupported_claim'      // an audience-safety claim with no evidence
  | 'invalid_comparison'     // a comparison whose products don't both exist
  | 'non_evidence_reason'    // no entity/keyword backing and only a label reason

export interface GroundingResult {
  grounded: boolean
  kind: 'entity' | 'keyword' | 'informational' | 'none'
  canonicalEntityName?: string
  primaryEntityId?: string
  primaryEntityType?: EntityRecord['type']
  supportingEntityIds: string[]
  discardReason?: GroundingDiscard
}

/**
 * Decide whether a candidate is grounded, and carry canonical entity identity.
 * Rules (any ONE grounds a non-claim topic):
 *   1. brand topic → at least one indexed entity of the SAME canonical brand,
 *   2. keyword-backed → a real matching query exists,
 *   3. informational (no brand) → allowed through (claims/cannibalization still
 *      apply downstream); an audience-safety claim always needs evidence.
 * A brand topic with NO matching entity and NO keyword backing is discarded
 * (`ungrounded_entity`) — we never invent a brand article.
 */
export function assessGrounding(
  candidate: { title: string; primaryKeyword: string; suggestionReason?: string },
  ev: GroundingEvidence,
): GroundingResult {
  const brand = brandTokens(candidate.title, candidate.primaryKeyword)
  // Claim evidence is EXTERNAL only — the candidate's own title/keyword can never
  // "support" its own claim (a topic titled "…for children" must be backed by a
  // real child product/category, not by its own words).
  const evidenceText = [...ev.entities.map((e) => e.title), ...ev.existingTitles].join(' ')

  // Audience-safety claim → must be explicitly supported by product/content.
  if (claimsProtectedAudience(candidate.title)) {
    const bad = unsupportedClaims(candidate.title, evidenceText).some((c) => c.discard)
    if (bad) return { grounded: false, kind: 'none', supportingEntityIds: [], discardReason: 'unsupported_claim' }
  }

  // A comparison must have both products indexed.
  if (!comparisonIsGrounded(candidate.title, ev.entities)) {
    return { grounded: false, kind: 'none', supportingEntityIds: [], discardReason: 'invalid_comparison' }
  }

  // Entity match grounds the topic (incl. a single Hebrew brand token that only a
  // skeleton match resolves, e.g. "ברוז'" → indexed "בורוג׳") — this must run
  // even when the count-based isBrandedTopic heuristic says "not branded", so a
  // real indexed brand is never wrongly discarded.
  const matches = matchingEntities(brand, ev.entities)
  if (matches.length > 0) {
    const primary = matches.find((m) => m.type === 'category' || m.type === 'brand') || matches[0]
    return {
      grounded: true, kind: 'entity',
      canonicalEntityName: primary.title,
      primaryEntityId: primary.id, primaryEntityType: primary.type,
      supportingEntityIds: matches.map((m) => m.id),
    }
  }

  if (isBrandedTopic(candidate.title, candidate.primaryKeyword)) {
    if (ev.keywordBacked) return { grounded: true, kind: 'keyword', supportingEntityIds: [] }
    // Branded topic with no indexed entity and no query backing → not grounded.
    return { grounded: false, kind: 'none', supportingEntityIds: [], discardReason: 'ungrounded_entity' }
  }

  // Non-branded topic: keyword backing grounds it; otherwise allow as
  // informational UNLESS its only justification was a non-evidence label.
  if (ev.keywordBacked) return { grounded: true, kind: 'keyword', supportingEntityIds: [] }
  if (isNonEvidenceReason(candidate.suggestionReason ?? '') && !hasConcreteGap(candidate, ev)) {
    return { grounded: false, kind: 'none', supportingEntityIds: [], discardReason: 'non_evidence_reason' }
  }
  return { grounded: true, kind: 'informational', supportingEntityIds: [] }
}

/** A demonstrable, distinct content gap: the subject shares tokens with existing
 *  content (adjacent) but is not itself already covered. Coarse, deterministic. */
function hasConcreteGap(candidate: { title: string; primaryKeyword: string }, ev: GroundingEvidence): boolean {
  const subj = new Set(entityTokens(candidate.title))
  if (subj.size === 0) return false
  for (const ex of ev.existingTitles) {
    const bag = new Set(entityTokens(ex))
    let shared = 0
    for (const t of subj) if (bag.has(t)) shared++
    if (shared >= 1) return true
  }
  return false
}

// ── Stronger, answer-level cannibalization ──────────────────────────────────

/** A coarse "expected-answer" signature: entity + intent + subject core. Two
 *  candidates that share it answer the same query and cannibalize each other. */
export function answerSignature(title: string, keyword: string, searchIntent?: string): string {
  const entity = primaryEntityKey(title, keyword)
  const intent = intentBucket(searchIntent, title, keyword)
  const subj = subjectKey(title)
  return `${entity}::${intent}::${subj}`
}

/** Distinct angle markers that keep two same-entity topics from cannibalizing. */
const ANGLE_MARKERS: RegExp[] = [
  /חילוץ|הפקה|extraction/i, /סוגי|types?/i, /השווא|comparison|לעומת|vs\b/i,
  /נוט|notes?|מרכיב/i, /אחסון|storage|שמירה/i, /דגימ|sample|מיני/i,
]
function angleKey(title: string): string {
  const t = (title || '').trim()
  for (let i = 0; i < ANGLE_MARKERS.length; i++) if (ANGLE_MARKERS[i].test(t)) return `angle${i}`
  return ''
}

/**
 * Answer-level cannibalization: reject when a candidate shares the same entity +
 * intent + subject core as an existing title AND has no materially distinct
 * angle (extraction / types / comparison / notes / storage / samples). Catches a
 * vanilla-journey paraphrase; lets a vanilla-EXTRACTION angle survive.
 */
export function cannibalizesAnswer(
  candidate: { title: string; primaryKeyword: string; searchIntent?: string },
  existing: { title: string; primaryKeyword?: string; searchIntent?: string }[],
): boolean {
  const cIntent = intentBucket(candidate.searchIntent, candidate.title, candidate.primaryKeyword)
  const cSubjTok = new Set(entityTokens(candidate.title))
  const cAngle = angleKey(candidate.title)
  for (const ex of existing || []) {
    // Same expected answer = same intent + strong subject overlap + no distinct
    // angle. The entity is not gated explicitly: two DIFFERENT brands naturally
    // have low subject overlap (their proper-noun tokens differ), so this does
    // not collapse Tom Ford vs Gucci, while it DOES catch a vanilla paraphrase
    // whose leading "journey" word would otherwise mask the shared subject.
    const eIntent = intentBucket(ex.searchIntent, ex.title, ex.primaryKeyword || '')
    if (cIntent !== eIntent) continue
    const eTok = new Set(entityTokens(ex.title))
    if (cSubjTok.size === 0 || eTok.size === 0) continue
    let shared = 0
    for (const t of cSubjTok) if (eTok.has(t)) shared++
    const overlap = shared / Math.min(cSubjTok.size, eTok.size)
    if (overlap >= 0.6 && cAngle === angleKey(ex.title)) return true
  }
  return false
}

// ── Cross-source semantic identity (collapse duplicates across sources) ──────

/** Collapse candidates that share an answer signature across sources, keeping the
 *  strongest (highest score, then most supporting sources). Additive — does NOT
 *  reopen the frozen Hybrid ranking; runs on its already-merged output. */
export function collapseCrossSource<T extends { title: string; primaryKeyword: string; searchIntent?: string; suggestionScore: number; supportingSources?: unknown[] }>(items: T[]): T[] {
  const best = new Map<string, T>()
  for (const it of items) {
    const key = answerSignature(it.title, it.primaryKeyword, it.searchIntent)
    const cur = best.get(key)
    if (!cur) { best.set(key, it); continue }
    const better =
      it.suggestionScore > cur.suggestionScore ||
      (it.suggestionScore === cur.suggestionScore && (it.supportingSources?.length ?? 0) > (cur.supportingSources?.length ?? 0)) ||
      (it.suggestionScore === cur.suggestionScore && (it.supportingSources?.length ?? 0) === (cur.supportingSources?.length ?? 0) && it.title < cur.title)
    if (better) best.set(key, it)
  }
  // Preserve first-seen order of the surviving representatives.
  const kept = new Set(best.values())
  return items.filter((it) => kept.has(it))
}

// ── Canonical brand-language consistency ────────────────────────────────────

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length
  if (!m) return n
  if (!n) return m
  const dp = Array.from({ length: n + 1 }, (_, j) => j)
  for (let i = 1; i <= m; i++) {
    let prev = dp[0]
    dp[0] = i
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j]
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1))
      prev = tmp
    }
  }
  return dp[n]
}

/** A fuzzy transliteration skeleton for a Hebrew brand token: drop geresh, matres
 *  lectionis (א/ו/י) and normalize finals, so spelling variants of a romanized
 *  brand collapse to a near-identical skeleton. */
export function brandSkeleton(word: string): string {
  return normEntityToken(word).replace(/[אוי]/g, '')
}

/**
 * Rewrite brand-name spelling variants in a text to the CANONICAL indexed form.
 * The canonical spelling always comes from the project's indexed entities — never
 * model improvisation — so "ברוז'/בורז'/בורוג׳" all render as the one indexed
 * form. Matches per-word by skeleton equality or Levenshtein ≤ 1 on the skeleton.
 */
export function canonicalizeBrandForms(text: string, entities: EntityRecord[]): string {
  const canon: { display: string; skel: string }[] = []
  const seen = new Set<string>()
  for (const e of entities) {
    for (const w of (e.title || '').split(/\s+/)) {
      if (!HEBREW.test(w)) continue
      const skel = brandSkeleton(w)
      if (skel.length < 3 || seen.has(skel)) continue
      seen.add(skel)
      canon.push({ display: w.replace(/[,.!?]+$/, ''), skel })
    }
  }
  if (canon.length === 0) return text
  return (text || '').split(/(\s+)/).map((piece) => {
    if (!HEBREW.test(piece)) return piece
    const skel = brandSkeleton(piece)
    if (skel.length < 3) return piece
    for (const c of canon) {
      if (c.skel === skel) return normEntityToken(piece) === normEntityToken(c.display) ? piece : c.display
      if (Math.abs(c.skel.length - skel.length) <= 1 && levenshtein(c.skel, skel) <= 1) return c.display
    }
    return piece
  }).join('')
}
