/**
 * Brand-safety guard (P0) — PURE, domain-neutral, AUTOMATIC. No manual competitor list
 * and no hardcoded names: detection is driven entirely by the PROJECT'S OWN evidence
 * (business name + indexed pages + entities + existing content + focus). This is a
 * self-service product — customers never pre-enter competitors.
 *
 *   keywordEntityType: generic_query | own_brand | suspected_external_business
 *
 * A query shaped like "[our business type] + [proper name absent from our own
 * evidence]" (e.g. another flower shop "פרחי אביה") is a suspected external business:
 * it can never seed a title, keyword, secondary, reason, demand, link or article input.
 * The project's own brand is always allowed. Generic terms are allowed. A title→keyword
 * entity MUTATION into a name is blocked separately (detectUnsafeNamedEntityMutation).
 */

import { normalizePhrase } from './keyword-guard'
import { contentTokens } from './evidence-cluster'
import { GENERIC_TOKENS } from './opportunity'

export type KeywordEntityType = 'generic_query' | 'own_brand' | 'suspected_external_business'

const toks = (s: string) => contentTokens(s)

export interface BrandSafety {
  ownBrandTerms: string[][]  // business name (+ own site names) token lists
  ownBrandTokens: Set<string>
  /** Every token in the project's OWN evidence (entities + coverage + focus + tracked
   *  + brand). A token NOT here is "unknown" to this project. Built WITHOUT keyword
   *  research (which may itself surface external names). */
  ownVocab: Set<string>
  /** Business-TYPE tokens the project's own entities repeatedly use (e.g. פרחי/פרחים):
   *  the "[type] + [unknown name]" shape is what marks an external business. */
  typeVocab: Set<string>
  /** Owned NAME phrases (business + entity name token arrays, ≥2 tokens) — used
   *  to detect an external impersonation: a near-copy of an owned name with one
   *  token mutated (פרחי אביב → פרחי אביה). */
  namePhrases: string[][]
}

/** Build brand safety purely from project-owned evidence — no external input. */
export function buildBrandSafety(input: {
  businessName?: string | null
  ownSiteNames?: string[]
  entityNames?: string[]
  ownEvidence?: string[]
}): BrandSafety {
  const own = [input.businessName ?? '', ...(input.ownSiteNames ?? [])].filter((s) => s && s.trim())
  const ownBrandTerms = own.map(toks).filter((a) => a.length)
  const ownBrandTokens = new Set(ownBrandTerms.flat())
  const entityNames = input.entityNames ?? []
  const ownVocab = new Set<string>(ownBrandTokens)
  for (const s of [...entityNames, ...(input.ownEvidence ?? [])]) for (const t of toks(s)) ownVocab.add(t)
  // Type vocabulary: tokens used across >= 2 of the project's own entity names.
  const df = new Map<string, number>()
  for (const n of entityNames) for (const t of new Set(toks(n))) df.set(t, (df.get(t) ?? 0) + 1)
  const typeVocab = new Set<string>()
  for (const [t, d] of df) if (d >= 2 && !GENERIC_TOKENS.has(t)) typeVocab.add(t)
  const namePhrases = [...ownBrandTerms, ...entityNames.map(toks)].filter((a) => a.length >= 2)
  return { ownBrandTerms, ownBrandTokens, ownVocab, typeVocab, namePhrases }
}

function ownBrandPresent(textToks: Set<string>, bs: BrandSafety): boolean {
  // The distinctive own-brand tokens (not generic, not the shared type words) present.
  return bs.ownBrandTerms.some((term) => {
    const d = term.filter((t) => !GENERIC_TOKENS.has(t) && !bs.typeVocab.has(t))
    const pool = d.length ? d : term
    return pool.length > 0 && pool.every((t) => textToks.has(t))
  })
}

/** Tokens in the text that are UNKNOWN to the project (not generic, not in own vocab). */
function unknownTokens(textToks: Iterable<string>, bs: BrandSafety): string[] {
  const out: string[] = []
  for (const t of textToks) if (!GENERIC_TOKENS.has(t) && !bs.ownVocab.has(t) && t.length >= 3) out.push(t)
  return out
}

/**
 * Classify a keyword query BEFORE it can influence generation. own_brand (allowed);
 * suspected_external_business when the query pairs a project business-TYPE token with an
 * unknown proper token (a "[our type] [someone-else's name]" shape); else generic.
 */
export function classifyKeywordEntity(query: string, bs: BrandSafety): KeywordEntityType {
  const tt = new Set(toks(query))
  if (ownBrandPresent(tt, bs)) return 'own_brand'
  const unknown = unknownTokens(tt, bs)
  const hasType = [...tt].some((t) => bs.typeVocab.has(t))
  if (unknown.length > 0 && hasType) return 'suspected_external_business'
  return 'generic_query'
}

/** True if the text looks like an external business (for the final whole-suggestion
 *  scan). Any hit rejects the entire opportunity — never a partial clean. */
export function containsExternalBusiness(text: string, bs: BrandSafety): boolean {
  if (!text) return false
  return classifyKeywordEntity(text, bs) === 'suspected_external_business'
}

// Explicit business/legal markers — a genuine named-entity signal (not a
// descriptor). A LEGAL SUFFIX (בע"מ / Ltd / Inc / LLC / Corp / group) is real
// evidence of a named company. The grammatical words "חברת"/"קבוצת"/"רשת"
// ("company of"/"group of"/"chain of") are NOT — "חברת פרסום"/"חברת מזכירות"
// are generic service descriptions, not named external businesses. Domain-
// neutral grammar, not industry content.
const BUSINESS_SUFFIX_RE = /(?:^|\s)(?:בע["״׳']?מ|ltd\.?|inc\.?|llc|corp\.?|גרופ|group)(?:\s|$)/i

// Domain-neutral DESCRIPTORS (colours/sizes/quality) — a common word one edit
// from an owned token is a descriptor coincidence (roses↔pink), NOT a business
// name. These are exempt from the named-entity-mutation signal.
const DESCRIPTOR_TOKENS = new Set(
  ['לבן', 'לבנה', 'לבנים', 'לבנות', 'שחור', 'אדום', 'אדומים', 'כחול', 'ירוק', 'צהוב', 'כתום', 'סגול',
   'ורוד', 'ורודה', 'ורודים', 'ורודות', 'חום', 'אפור', 'זהב', 'כסף', 'בז', 'קטן', 'גדול', 'בינוני',
   'ענק', 'רחב', 'צר', 'ארוך', 'קצר', 'חדש', 'ישן', 'טבעי', 'טבעית'].map((t) => toks(t)[0]).filter(Boolean),
)

/**
 * STRICT named-external-business detection for ACCEPTED output (hard-fail gate).
 * The broad classifier flags any "[own type] + [unknown word]" shape, so a
 * colour/descriptor ("ורדים ורודים") looks like a business — catastrophically
 * false-positive on generic titles. A HARD failure requires a genuine
 * proper-name signal backed by evidence:
 *   (a) an explicit business/legal suffix (בע"מ / Ltd / group / חברת …), OR
 *   (b) a NAMED-ENTITY MUTATION of an own-brand/type token (the live אביב→אביה
 *       shape — an unknown token one edit from an owned name).
 * A generic multi-word phrase, product, vitamin, flower, service or search
 * phrase never qualifies. Returns the matched token + source evidence.
 */
export function hasNamedExternalBusiness(text: string, bs: BrandSafety): { hit: boolean; token: string | null; evidence: string } {
  if (!text) return { hit: false, token: null, evidence: '' }
  const suffix = text.match(BUSINESS_SUFFIX_RE)
  if (suffix) return { hit: true, token: suffix[0].trim(), evidence: 'business_legal_suffix' }
  // IMPERSONATION: a window of text tokens matches an owned NAME phrase in all
  // positions but one, where that one differs by a single edit (פרחי אביב →
  // פרחי אביה). Phrase-level so it never fires on a coincidental 1-edit of a
  // single generic/type token (ורדים↔ורודים).
  const tt = toks(text)
  for (const phrase of bs.namePhrases) {
    const n = phrase.length
    for (let i = 0; i + n <= tt.length; i++) {
      const win = tt.slice(i, i + n)
      let diffs = 0, mutatedTo = '', mutatedFrom = ''
      for (let k = 0; k < n; k++) {
        if (win[k] === phrase[k]) continue
        diffs++
        if (diffs > 1) break
        if (Math.abs(win[k].length - phrase[k].length) <= 1 && editDistance(win[k], phrase[k]) === 1 && !DESCRIPTOR_TOKENS.has(win[k]) && !bs.ownVocab.has(win[k])) { mutatedTo = win[k]; mutatedFrom = phrase[k] }
        else { diffs = 2; break }
      }
      if (diffs === 1 && mutatedTo) return { hit: true, token: mutatedTo, evidence: `named_entity_mutation_of:${mutatedFrom}` }
    }
  }
  return { hit: false, token: null, evidence: '' }
}

/** A latin-script token: the shape a foreign brand takes on a Hebrew-language site. */
const LATIN_TOKEN_RE = /^[a-z][a-z0-9'.-]*$/

/**
 * The script the PROJECT'S OWN content is written in. The unknown-latin-token rule
 * below is only meaningful when latin is FOREIGN to that content, so every caller
 * must say which case it is in; nothing about this is inferable from the text alone.
 */
export type ContentScript = 'hebrew' | 'latin'

/** Map a project's language code to the script its content is written in. Mirrors
 *  the engine's own `language` derivation (anything starting 'en' is English). */
export function scriptOfContentLanguage(language: string | null | undefined): ContentScript {
  return String(language || '').toLowerCase().startsWith('en') ? 'latin' : 'hebrew'
}

/**
 * UNKNOWN-LATIN-TOKEN detection for model-authored output — the STRUCTURAL form of
 * the per-brief prompt rule "NEVER mention a business, brand or product name that is
 * not in that brief's entities". Prose can be ignored; this cannot.
 *
 * A latin token that appears in NEITHER the project's own vocabulary NOR the caller's
 * allow-set (the brief's own subject + related entity names) was introduced by the
 * model itself — the "Tom Ford in a florist title" shape. Precision comes from
 * `unknownTokens`, which already excludes GENERIC_TOKENS, everything in ownVocab, and
 * tokens shorter than 3 chars; a project whose legitimate vocabulary IS latin
 * (WordPress / SEO / Core Web Vitals) carries those tokens in ownVocab and is
 * unaffected, and a retailer that genuinely sells Dior has "dior" as an entity name.
 *
 * The allow-set must NOT include a brief's aligned demand query. ownVocab is built
 * deliberately WITHOUT keyword research (see BrandSafety.ownVocab) because research
 * may itself surface a competitor's name; letting a research-derived query authorise
 * a latin token would re-open exactly that hole.
 *
 * CONTENT SCRIPT — THE RULE'S PRECONDITION, NOT A DETAIL. Everything above holds
 * because latin is FOREIGN to the prose: on a Hebrew-language project a latin token
 * stands out, so "unknown to the project" is real evidence that the model introduced
 * a name. On a LATIN-SCRIPT project (an English-language store) nothing stands out —
 * every ordinary word of every legitimate title is a latin token, and "unknown to the
 * project" only means the word is absent from a vocabulary built from the business
 * name, entity titles and existing coverage. A polished English headline adds ordinary
 * English words by design, so the rule flags them and the project's ENTIRE output is
 * rejected. That is not a theoretical risk: it is the measured Afrodite failure —
 * 17 candidates generated, 17 rejected as `title_unknown_latin_token`, 0 ideas left,
 * with no other gate involved (lib/content/__qa__/reco-english-project.qa.ts).
 * The rule therefore applies ONLY when contentScript is 'hebrew'; on a latin-script
 * project it has NO SIGNAL and returns nothing. Callers must pass the project's own
 * script — the default stays 'hebrew' so every existing caller is byte-identical.
 *
 * LIMITATION — DELIBERATE AND UNCLOSED. This detects the LATIN-SCRIPT case only. A
 * foreign brand written in HEBREW letters, with no legal suffix (BUSINESS_SUFFIX_RE)
 * and no single-edit relationship to an owned name, is NOT detected here and is
 * REJECTED BY NOTHING in this pipeline. "בשמים מתוקים לנשים בהשראת שאנל" is accepted.
 * On a LATIN-SCRIPT project the SAME already-accepted limitation applies to a latin
 * brand: containment there rests on hasNamedExternalBusiness (legal suffix / owned-name
 * mutation), which stays fully active. Widening it would need a name gazetteer or a
 * model call — the same cost that left the Hebrew case open — and rejecting every
 * unknown English word is not a substitute for it: it rejects the language, not a brand.
 *
 * It may still be OBSERVED, inconsistently: the broad classifier
 * (classifyKeywordEntity / scanSuggestionBrandSafety) flags such a title WHEN the
 * title happens to retain one of the project's own type tokens — measured true for
 * a perfume title keeping "בשמים", and false for a florist title that dropped
 * "פרחים". That path is SHADOW-ONLY by an earlier deliberate decision (its false
 * positives — "ורדים ורודים" reads as a business to it — are why it was demoted),
 * and this change does not revisit it. So the Hebrew-script case is at best counted
 * in shadow_rejected_by_reason, never blocked.
 *
 * Closing it properly would need a name gazetteer or a model call, both of which
 * cost more than the defect. Containment is therefore PARTIAL: do not read a passing
 * title as proof that no external brand is present.
 */
export function unknownLatinTokens(
  text: string,
  bs: BrandSafety,
  allowed?: Iterable<string>,
  contentScript: ContentScript = 'hebrew',
): string[] {
  if (!text) return []
  // PRECONDITION (see above): a latin token only carries a foreign-name signal when
  // the surrounding content is NOT latin. On a latin-script project it is ordinary
  // prose, so the rule is inert — never "relaxed", simply inapplicable.
  if (contentScript === 'latin') return []
  const allow = new Set(allowed ?? [])
  return unknownTokens(toks(text), bs).filter((t) => LATIN_TOKEN_RE.test(t) && !allow.has(t))
}

// ── unsafe named-entity mutation ──────────────────────────────────────────────
function editDistance(a: string, b: string): number {
  const m = a.length, n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = 0; i <= m; i++) dp[i][0] = i
  for (let j = 0; j <= n; j++) dp[0][j] = j
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
  return dp[m][n]
}

/**
 * True when the keyword introduces a NAMED-ENTITY token that (a) is absent from the
 * title, (b) is unknown to the project, and (c) is a tiny edit of a title token —
 * a generic word mutated into a possible business name (title "פרחי אביב" → keyword
 * "פרחי אביה"). The caller must NOT auto-repair; it rejects the opportunity.
 */
const HEB_PROCLITICS = 'והבלמשכ'
/** Is `k` merely a proclitic-stripped FRAGMENT of a token that is present (e.g.
 *  "שוואת" from the title's "השוואת"/"להשוואת")? The tokenizer emits such
 *  fragments; they are the SAME word, not a foreign named entity, and must never
 *  count as a mutation (they differ from the full form by exactly one leading
 *  proclitic letter — a length change, unlike the same-length אביב→אביה swap). */
function isProcliticFragmentOf(k: string, toksList: string[]): boolean {
  return toksList.some((s) => (s.length === k.length + 1 && HEB_PROCLITICS.includes(s[0]) && s.slice(1) === k)
    || (k.length === s.length + 1 && HEB_PROCLITICS.includes(k[0]) && k.slice(1) === s))
}

export function detectUnsafeNamedEntityMutation(title: string, primaryKeyword: string, bs: BrandSafety): boolean {
  const titleToks = toks(title)
  const titleSet = new Set(titleToks)
  for (const k of toks(primaryKeyword)) {
    if (titleSet.has(k) || bs.ownVocab.has(k) || GENERIC_TOKENS.has(k) || k.length < 3) continue
    if (isProcliticFragmentOf(k, titleToks)) continue
    for (const s of titleToks) {
      // A proclitic length-change (השוואת→שוואת) is a tokenizer fragment, not a
      // named-entity mutation — require a SAME-LENGTH single-letter swap (the
      // proven אביב→אביה shape).
      if (s.length >= 3 && s.length === k.length && editDistance(s, k) === 1) return true
    }
  }
  return false
}

// ── final output brand-safety scan ────────────────────────────────────────────
export interface BrandScanResult { safe: boolean; reason?: 'competitor_brand_leakage'; field?: string }

/** Scan the COMPLETE user-visible suggestion for any suspected external business.
 *  Any hit rejects the whole opportunity (never a partial clean). */
export function scanSuggestionBrandSafety(
  s: { title?: string; primaryKeyword?: string; secondaryKeywords?: string[]; suggestionReason?: string; anchors?: string[]; targetTitles?: string[] },
  bs: BrandSafety,
): BrandScanResult {
  const fields: [string, string | undefined][] = [
    ['title', s.title], ['primaryKeyword', s.primaryKeyword], ['reason', s.suggestionReason],
    ...(s.secondaryKeywords ?? []).map((k, i): [string, string] => [`secondary[${i}]`, k]),
    ...(s.anchors ?? []).map((a, i): [string, string] => [`anchor[${i}]`, a]),
    ...(s.targetTitles ?? []).map((t, i): [string, string] => [`targetTitle[${i}]`, t]),
  ]
  for (const [field, val] of fields) if (val && containsExternalBusiness(val, bs)) return { safe: false, reason: 'competitor_brand_leakage', field }
  return { safe: true }
}
