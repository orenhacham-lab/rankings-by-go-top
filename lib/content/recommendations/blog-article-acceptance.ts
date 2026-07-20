/**
 * BLOG-ARTICLE acceptance — the deterministic PERSISTENCE-BOUNDARY gate that guarantees
 * every recommendation reaching persistence is a usable NEW blog article
 * (recommendedPageType='article'). The normal recommendation workflow generates blog
 * article topics ONLY; it never edits the homepage / about / service / category / product
 * / commercial-landing pages or existing articles.
 *
 * PURE (no model, no DB, no network). Applied by the production route AFTER the engine
 * finalized its batch — it NEVER runs inside the shared brief engine or the /reco-qa
 * comparison harness, so Stage-C / /reco-qa / blind-export behavior is unchanged.
 *
 * NON-AGGRESSIVE by construction — the decision follows this exact preference order and
 * rejects ONLY when none of the earlier, volume-preserving repairs is safe:
 *   1. remove only an invalid secondary keyword;
 *   2. deterministically repair a malformed primary keyword from existing evidence;
 *   3. reclassify a valid informational candidate to an article;
 *   4. keep a genuinely distinct candidate;
 *   5. reject only clear own-brand pitches, unsupported business-model expansions,
 *      semantic duplicates, existing-page edits, or non-article commercial pages.
 * It never raises relevance thresholds, never caps counts, never requires search volume,
 * and never rejects a good topic merely because all its secondary keywords were removed.
 */

import { normalizePhrase } from './keyword-guard'
import { topicSignature, isHighConfidenceDuplicate, canonicalVariants, type TopicSignature } from './semantic-dup'
import { classifyKeywordEntity, type BrandSafety } from './brand-safety'
import { isSearchPhraseQuality, conciseSubject } from './search-phrase'
import { filterSecondaryKeywords, type RecommendedPageType } from './opportunity-validation'
import type { SearchIntent } from './opportunity'

export type BlogAcceptanceOutcome =
  | 'keep'
  | 'keep_secondaries_removed'
  | 'reclassify_to_article'
  | 'repair_and_keep'
  | 'reject'

export type BlogRejectionReason =
  | 'primary_keyword_not_search_phrase'
  | 'own_brand_not_blog_topic'
  | 'unsupported_business_model_expansion'
  | 'pending_semantic_duplicate'
  | 'existing_page_improvement_not_blog'
  | 'commercial_page_not_blog'

export interface BlogCandidate {
  title: string
  primaryKeyword: string
  secondaryKeywords: string[]
  intent: SearchIntent
  recommendedPageType: RecommendedPageType
  /** Evidence-backed natural query used for DETERMINISTIC keyword repair (no model). */
  supportedQuery?: string | null
}

export interface BlogAcceptanceContext {
  brandSafety: BrandSafety
  /** Every token present in the project's OWN evidence (entities + focus + tracked + KR). */
  businessEvidenceTokens: Set<string>
  /** Domain TYPE words (lighting/room/etc.) — a candidate that only ADDS these over a
   *  pending topic is the same need, not a distinct article. */
  domainTypeWords: Set<string>
  /** Signatures of pending / generated / existing article subjects to dedupe against. */
  pendingSignatures: TopicSignature[]
}

export interface BlogAcceptanceDecision {
  outcome: BlogAcceptanceOutcome
  reason: BlogRejectionReason | null
  /** Final (possibly repaired) primary keyword. */
  primaryKeyword: string
  /** Final (possibly reduced) secondary keywords. */
  secondaryKeywords: string[]
  /** Always 'article' when the candidate is kept (else the original type). */
  recommendedPageType: RecommendedPageType
  /** Secondary keywords removed for incoherence, with typed reasons + primary subject. */
  removedSecondaries: { keyword: string; reason: string; primarySubject: string }[]
  /** The candidate's normalized primary subject (for diagnostics). */
  primarySubject: string
}

// ── keyword-as-search-phrase (beyond the engine's isSearchPhraseQuality) ──────
// Marketing SENTENCES the engine's structural check passes but that are not real
// queries: a leading infinitive verb ("לקניית …", "להרכיב …") and/or a coordinated
// adjective/adverb marketing tail ("… בבטחה ובסטייל", "… ומרגש לכל אירוע").
const MARKETING_QUALIFIER_RE = /(?:^|\s)(?:בבטחה|בסטייל|ובסטייל|ובבטחה|ומרגש|ומרגשת|המושלם|המושלמת|המושלמים|בקלות ובנוחות|לכל אירוע|לכל עסק|לכל בית|לכל חדר|לכל הזדמנות)(?:\s|$)/
const INFINITIVE_MARKETING_OPENER_RE = /^(?:לקניית|לרכישת|להרכבת|להרכיב|לבחירת|ליצירת|להשגת|לעיצוב)\b/

/** True when a keyword reads as a natural standalone search phrase — the engine's
 *  structural gate PLUS a marketing-sentence guard. */
export function isNaturalSearchPhrase(keyword: string): boolean {
  const k = (keyword || '').trim()
  if (!k) return false
  if (!isSearchPhraseQuality(k)) return false
  if (MARKETING_QUALIFIER_RE.test(k)) return false
  const toks = k.split(/\s+/).filter(Boolean)
  if (INFINITIVE_MARKETING_OPENER_RE.test(k) && toks.length >= 5) return false
  return true
}

// ── article-angle title (reclassification signal) ────────────────────────────
// A genuinely informational article frame: a question, a how-to / selection / buying
// guide, a comparison, a "what to check / who is it for" angle. Used to RECLASSIFY a
// commercial-typed candidate whose search need is really informational.
const ARTICLE_ANGLE_RE = new RegExp([
  '(?:^|\\s)(?:מה|מהו|מהי|מהם|איך|כיצד|למה|מדוע|האם|מתי|אילו|כמה|למי)\\b',
  'מדריך', 'המדריך', 'איך לבחור', 'מה חשוב', 'מה כדאי', 'מה צריך', 'מה כולל',
  'למי מתאים', 'למי הן מתאימות', 'למי הוא מתאים', 'כל מה שצריך', 'כל מה שחשוב',
  'השוואה', 'ההבדל בין', 'ההבדלים בין', ' מול ', 'יתרונות', 'טיפים', 'לפני ש', 'איך ל',
].join('|'))

/** True when the title is a genuine informational article angle (question / how-to /
 *  comparison / selection guide), suitable for a blog article. */
export function isArticleAngleTitle(title: string): boolean {
  const t = (title || '').trim()
  if (!t) return false
  return ARTICLE_ANGLE_RE.test(t)
}

// ── unsupported business-model expansion ─────────────────────────────────────
// Used-goods and specialist-legal expansions that require EXPLICIT owned evidence.
// A topic that introduces a business MODEL absent from the project's own evidence is
// not a blog topic for this business (keyword volume alone is NOT business evidence).
const USED_GOODS_RE = /(?:^|\s)(?:יד\s?2|יד\s?שני[יה]ה|משומש(?:ת|ים|ות)?|second\s?hand)(?:\s|$)/i
// Deliberately NOT the bare token "יד" (present in "משקולות יד"/hand-weights) — the
// used-goods MODEL is evidenced only by "שנייה"/"משומש"/"יד2"/"second hand".
const USED_GOODS_EVIDENCE = ['שנייה', 'שניה', 'משומש', 'משומשת', 'יד2', 'secondhand']
const LEGAL_EXPANSION_RE = /(?:חוק\s?המכר|אחריות\s?קבלן|אכיפת|לאכוף|תביע(?:ה|ות)|זכויות\s?משפטיות|הליך\s?משפטי|כתב\s?תביעה|פיצויים\s?משפטיים)/
const LEGAL_EVIDENCE = ['עורך', 'דין', 'משפטי', 'משפטית', 'ייעוץ', 'עו״ד', 'עוד', 'חוק', 'תביעות', 'ליטיגציה']

function evidenceHasAny(ctx: BlogAcceptanceContext, tokens: string[]): boolean {
  for (const t of tokens) if (ctx.businessEvidenceTokens.has(normalizePhrase(t))) return true
  return false
}

/** A topic that introduces a used-goods or specialist-legal business model with NO
 *  explicit owned evidence for that model. Narrow by design — it fires only on explicit
 *  used/legal markers and only when the project's own evidence lacks the same model. */
export function isUnsupportedExpansion(primaryKeyword: string, title: string, ctx: BlogAcceptanceContext): boolean {
  const hay = `${primaryKeyword} ${title}`
  if (USED_GOODS_RE.test(hay) && !evidenceHasAny(ctx, USED_GOODS_EVIDENCE)) return true
  if (LEGAL_EXPANSION_RE.test(hay) && !evidenceHasAny(ctx, LEGAL_EVIDENCE)) return true
  return false
}

// ── semantic duplicate vs pending (blog-tuned) ───────────────────────────────
const tokenSetOf = (sig: TopicSignature): Set<string> => new Set([...(sig.head ? [sig.head] : []), ...sig.modifiers])

/**
 * Blog-tuned duplicate: the proven high-confidence signal, PLUS a containment rule —
 * a candidate that fully CONTAINS a pending topic and only ADDS domain-type/context
 * tokens (e.g. pending "קידום אורגני" vs candidate "קידום אתרים אורגני בגוגל") serves the
 * SAME user need. A candidate that adds a genuinely DISTINCT subject token is NOT a
 * duplicate (a broad pending never blocks a distinct supported long-tail).
 */
export function isBlogDuplicate(candSig: TopicSignature, pendSig: TopicSignature, ctx: BlogAcceptanceContext): boolean {
  if (isHighConfidenceDuplicate(candSig, pendSig)) return true
  if (candSig.intentCluster !== pendSig.intentCluster) return false
  if (!candSig.head || !pendSig.head || candSig.head !== pendSig.head) return false
  const cand = tokenSetOf(candSig)
  const pend = tokenSetOf(pendSig)
  if (pend.size < 2) return false // a bare one-token head must not block a long-tail
  const inSet = (set: Set<string>, tok: string) => canonicalVariants(tok).some((v) => set.has(v)) || set.has(tok)
  // pending fully contained in the candidate (proclitic-tolerant)?
  for (const t of pend) if (!inSet(cand, t)) return false
  // every EXTRA candidate token is a domain/context word (no distinct new subject).
  for (const t of cand) {
    if (inSet(pend, t)) continue
    if (!inSet(ctx.domainTypeWords, t)) return false
  }
  return true
}

// ── main decision ────────────────────────────────────────────────────────────
const COMMERCIAL_PAGE_TYPES = new Set<RecommendedPageType>(['commercial_landing_page', 'category_page', 'service_page', 'product_page_improvement'])

/**
 * Decide the blog-article outcome for ONE finalized candidate. Applies the non-aggressive
 * preference order and returns the transformed keyword/secondaries/page-type. In
 * production the caller drops a 'reject' and persists everything else with
 * recommendedPageType='article'.
 */
export function decideBlogArticle(cand: BlogCandidate, ctx: BlogAcceptanceContext): BlogAcceptanceDecision {
  const primarySubject = normalizePhrase(cand.primaryKeyword)
  const base = { removedSecondaries: [] as { keyword: string; reason: string; primarySubject: string }[], primarySubject }
  const reject = (reason: BlogRejectionReason): BlogAcceptanceDecision =>
    ({ outcome: 'reject', reason, primaryKeyword: cand.primaryKeyword, secondaryKeywords: cand.secondaryKeywords, recommendedPageType: cand.recommendedPageType, ...base })

  // (1) MALFORMED primary keyword → deterministic repair from evidence, else reject.
  let primaryKeyword = cand.primaryKeyword
  let repaired = false
  if (!isNaturalSearchPhrase(primaryKeyword)) {
    const candidates = [cand.supportedQuery, conciseSubject(cand.title)].filter((x): x is string => !!x && !!x.trim())
    const fixedTo = candidates.find((c) => isNaturalSearchPhrase(c))
    if (!fixedTo) return reject('primary_keyword_not_search_phrase')
    primaryKeyword = fixedTo.trim()
    repaired = true
  }

  // (2) OWN-BRAND / brand-pitch: an own-brand query (or an own-brand promotional title)
  //     is never a blog topic (this workflow does not edit the homepage/About page).
  if (classifyKeywordEntity(primaryKeyword, ctx.brandSafety) === 'own_brand') return reject('own_brand_not_blog_topic')
  if (classifyKeywordEntity(cand.title, ctx.brandSafety) === 'own_brand') return reject('own_brand_not_blog_topic')

  // (3) UNSUPPORTED business-model expansion (used-goods / specialist-legal) with no
  //     explicit owned evidence — keyword volume is not business evidence.
  if (isUnsupportedExpansion(primaryKeyword, cand.title, ctx)) return reject('unsupported_business_model_expansion')

  // (4) SEMANTIC DUPLICATE of a pending/generated/existing article (before persistence,
  //     never relying on the DB unique constraint).
  const sig = topicSignature(primaryKeyword, cand.intent)
  if (ctx.pendingSignatures.some((ps) => isBlogDuplicate(sig, ps, ctx))) return reject('pending_semantic_duplicate')

  // (5) SECONDARY KEYWORD coherence — remove only proven-incoherent secondaries; an
  //     empty secondary array is valid (never rejects the topic for that).
  const sec = filterSecondaryKeywords(primaryKeyword, cand.title, cand.secondaryKeywords, cand.intent, ctx.domainTypeWords)
  const removedSecondaries = sec.rejected.map((r) => ({ keyword: r.keyword, reason: r.reason, primarySubject }))

  // (6) ARTICLE-ONLY page type. article → keep; existing-page edit → reject; a commercial
  //     type → reclassify to article ONLY when the title is a genuine informational angle,
  //     else reject (a real commercial page is not a blog topic).
  let recommendedPageType = cand.recommendedPageType
  let reclassified = false
  if (recommendedPageType !== 'article') {
    if (recommendedPageType === 'existing_page_improvement') return reject('existing_page_improvement_not_blog')
    if (COMMERCIAL_PAGE_TYPES.has(recommendedPageType)) {
      if (!isArticleAngleTitle(cand.title)) return reject('commercial_page_not_blog')
      recommendedPageType = 'article'
      reclassified = true
    }
  }

  const outcome: BlogAcceptanceOutcome = reclassified ? 'reclassify_to_article'
    : repaired ? 'repair_and_keep'
    : removedSecondaries.length > 0 ? 'keep_secondaries_removed'
    : 'keep'
  return { outcome, reason: null, primaryKeyword, secondaryKeywords: sec.kept, recommendedPageType, removedSecondaries, primarySubject }
}
