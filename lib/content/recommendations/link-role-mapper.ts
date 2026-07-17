/**
 * Internal-link role mapper (F) — PURE, domain-neutral. Runs AFTER an opportunity
 * survives worthiness. It SCORES → FILTERS → RANKS → CAPS candidates and returns only
 * the best final set (never "every passing link").
 *
 * Proven live defects this fixes:
 *   A. the relevant commercial page never became primary — because (i) Hebrew
 *      singular/plural did not match (עציצים↔עציץ) so the product scored 0, and
 *      (ii) one shared threshold gated commercial pages behind an informational bar.
 *      Now: plural-aware tokenization + ROLE-SPECIFIC selection — a commercial page
 *      sharing a distinctive subject token is a commercial target (primary/secondary),
 *      routed by page type so it is never demoted to informational support.
 *   B/C. hard per-role caps + a total cap, applied after ranking, so a topic can
 *      never receive 30 links. Fewer links beat weak links; slots are not filled.
 *   D. generic/type-word overlap alone never creates a link — a link requires a
 *      DISTINCTIVE shared subject token, where "distinctive" is data-derived
 *      (document frequency across the candidate corpus), not a hardcoded blacklist.
 *   E. supporting informational links require topical complementarity (a shared
 *      distinctive subject), with a typed reason.
 * The primary target is excluded from supporting links; URLs are de-duplicated.
 */

import { contentTokens } from './evidence-cluster'
import { GENERIC_TOKENS } from './opportunity'
import { normalizePhrase } from './keyword-guard'
import type { LinkPlan, LinkTarget, InternalLinkRole } from './types'

export type LinkRole = 'primary_commercial_target' | 'secondary_commercial_target' | 'supporting_informational_link' | 'source_reference' | 'unrelated'
export type EntityPageType = 'product' | 'category' | 'service' | 'page' | 'post' | 'article' | 'unknown'

export interface LinkCandidateEntity { url: string; title: string; type?: EntityPageType }
export interface RoleAssignment { url: string; title: string; pageType: EntityPageType; role: LinkRole; reason: string; score: number; distinctiveTokens: string[] }

const COMMERCIAL_TYPES = new Set<EntityPageType>(['product', 'category', 'service'])
const INFORMATIONAL_TYPES = new Set<EntityPageType>(['post', 'article', 'page'])
const urlKey = (u: string) => (u || '').trim().toLowerCase().replace(/\/+$/, '')

// Hard per-role caps + total cap (B). Fewer links beat weak links.
const CAPS = { primary_commercial_target: 1, secondary_commercial_target: 2, supporting_informational_link: 4, source_reference: 2 } as const
const TOTAL_CAP = 7
const TYPE_WORD_WEIGHT = 0.25

const HE = /[א-ת]/

/**
 * Boilerplate/utility pages (privacy policy, terms, checkout, account …) are NEVER
 * content-link candidates — a privacy-policy page was assigned as an internal link
 * for an employment-law article in live runs. These are universal site-plumbing
 * patterns (function pages), not industry/product words. Matched against BOTH the
 * candidate's title and its URL path.
 */
const BOILERPLATE_TITLE_RE = /(?:מדיניות\s+פרטיות|תנאי\s+(?:שימוש|תקנון)|תקנון|הצהרת\s+נגישות|נגישות|צור\s+קשר|יצירת\s+קשר|אודות(?:ינו)?|מי\s+אנחנו|סל\s+קניות|עגלת\s+קניות|קופה|תשלום\s+מאובטח|התחברות|הרשמה|אזור\s+אישי|החשבון\s+שלי|מעקב\s+הזמנ|מדיניות\s+(?:משלוחים|החזרות|ביטולים)|שאלות\s+נפוצות|מפת\s+האתר|privacy\s+policy|terms(?:\s+of\s+(?:use|service))?|accessibility(?:\s+statement)?|contact(?:\s+us)?|about(?:\s+us)?|shopping\s+cart|checkout|my\s+account|log\s*in|sign\s*up|order\s+tracking|shipping\s+policy|refund\s+policy|return\s+policy|faq|sitemap)/i
const BOILERPLATE_URL_RE = /\/(?:privacy|privacy-policy|terms|terms-of-(?:use|service)|tos|accessibility|contact(?:-us)?|about(?:-us)?|cart|checkout|basket|account|my-account|login|signin|signup|register|wishlist|compare|faq|sitemap|refund|returns?|shipping|policies|policy|legal|thank-you|search)(?:\/|\.|\?|#|$)/i
export function isBoilerplatePage(title: string, url: string): boolean {
  return BOILERPLATE_TITLE_RE.test((title || '').trim()) || BOILERPLATE_URL_RE.test((url || '').trim().toLowerCase())
}

/** Safe Hebrew plural base (masc. ־ים / fem. ־ות, final-form already normalized so
 *  ־ים surfaces as "…ימ"). Only emitted when a real base remains (len >= 2). */
function pluralBase(t: string): string | null {
  if (t.length >= 4 && (t.endsWith('ימ') || t.endsWith('ות'))) { const b = t.slice(0, -2); if (b.length >= 2 && HE.test(b[0])) return b }
  return null
}
/** Subject tokens: the shared cluster tokenizer (proclitic-aware) PLUS singular/plural
 *  bases so "עציצים" matches "עציץ". Adds joins only, never merges. Exported so the
 *  intent/consistency validators tokenize identically to link matching. */
export function subjectTokens(s: string): string[] {
  const base = contentTokens(s)
  const out = new Set(base)
  for (const t of base) { const b = pluralBase(t); if (b) out.add(b) }
  return Array.from(out)
}
const linkToks = subjectTokens

/** Attribute tokens across candidate token lists (pure): a token spread across MANY
 *  candidates (>= 4, but <= half of them) co-occurring with >= 6 DISTINCT other
 *  tokens modifies many different heads — a colour/size/quality/condition-class
 *  word, never subject evidence on its own. Calibration: a specific subject (one
 *  flower variety across its product+category+guide) has low count/spread and is
 *  NOT flagged; corpora under 8 candidates skip derivation entirely (too small to
 *  distinguish an attribute from the topic's own subject). */
function deriveCandidateAttributeTokens(tokenLists: string[][]): Set<string> {
  const N = tokenLists.length
  if (N < 8) return new Set()
  const count = new Map<string, number>()
  const coOcc = new Map<string, Set<string>>()
  for (const list of tokenLists) {
    const ts = Array.from(new Set(list))
    for (const t of ts) {
      count.set(t, (count.get(t) ?? 0) + 1)
      const s = coOcc.get(t) ?? new Set<string>()
      for (const u of ts) if (u !== t) s.add(u)
      coOcc.set(t, s)
    }
  }
  const out = new Set<string>()
  for (const [t, c] of count) if (c >= 4 && c / N <= 0.5 && (coOcc.get(t)?.size ?? 0) >= 6) out.add(t)
  return out
}

/**
 * Map candidates to roles for one opportunity. Returns the ranked, capped assignments
 * (primary first) + a debug list of every scored candidate for the diagnostics trace.
 */
export function mapLinkRoles(
  opportunityKeyword: string,
  opportunityTitle: string,
  candidates: LinkCandidateEntity[],
  opts?: { corpusTypeWords?: Set<string>; intent?: string },
): { primaryTarget: RoleAssignment | null; assignments: RoleAssignment[]; debug: RoleAssignment[] } {
  const oppToks = new Set(linkToks(`${opportunityKeyword} ${opportunityTitle}`))
  // Project-derived domain type/descriptor words (colours, sizes, ubiquitous product
  // types) computed from ALL entity names upstream — broader + more reliable than the
  // per-call candidate DF, so a shared colour/type token alone never qualifies a link.
  const corpusTypeWords = opts?.corpusTypeWords ?? new Set<string>()
  // Local intent: a commercial target must align with the LOCAL/service need (share the
  // article's subject head), not merely be a product sharing an attribute token.
  const localIntent = opts?.intent === 'local' || opts?.intent === 'transactional'

  // J.3 — a topic must never be its own supporting link. Exclude an INFORMATIONAL page
  // (post/article/page — the article itself) whose title matches the opportunity. A
  // COMMERCIAL page (product/category) with the same name is a legitimate target, not a
  // self-link, so it is NOT excluded here.
  const selfKeys = new Set([normalizePhrase(opportunityKeyword), normalizePhrase(opportunityTitle)].filter(Boolean))
  const seen = new Set<string>()
  const prepared: { c: LinkCandidateEntity; toks: string[] }[] = []
  for (const c of candidates) {
    const k = urlKey(c.url)
    if (!k || seen.has(k)) continue
    if (INFORMATIONAL_TYPES.has(c.type ?? 'unknown') && selfKeys.has(normalizePhrase(c.title))) continue // self-link
    if (isBoilerplatePage(c.title, c.url)) continue // utility pages are never content links
    seen.add(k)
    prepared.push({ c, toks: linkToks(c.title) })
  }

  // Document frequency across candidate titles → ubiquitous product-TYPE words
  // (data-derived, domain-neutral): in >= 4 candidates AND >= 60% of them. These are
  // container words (e.g. a dominant bouquet/flower/city token), down-weighted so
  // they can never, alone, qualify a link.
  const df = new Map<string, number>()
  for (const { toks } of prepared) for (const t of new Set(toks)) df.set(t, (df.get(t) ?? 0) + 1)
  const N = prepared.length
  // ATTRIBUTE tokens derived from the CANDIDATE corpus itself (a colour/size/quality
  // modifier co-occurs with many DISTINCT heads across candidate titles). Live defect:
  // a shared colour ("ורוד") alone qualified an unrelated product as a link target
  // when the caller's corpus set missed it — attributes are never subject evidence.
  const candidateAttributes = deriveCandidateAttributeTokens(prepared.map((p) => p.toks))
  const isTypeWord = (t: string) => corpusTypeWords.has(t) || candidateAttributes.has(t) || (() => { const d = df.get(t) ?? 0; return d >= 4 && d / Math.max(1, N) >= 0.6 })()
  const weight = (t: string) => (GENERIC_TOKENS.has(t) ? 0 : isTypeWord(t) ? TYPE_WORD_WEIGHT : 1)

  // Opportunity SUBJECT head: distinctive tokens of the primary KEYWORD (not the full
  // title), preferring tokens that repeat (the article's core subject). A SUPPORTING
  // informational link must share this head (answer-level complementarity, I) — sharing
  // only a peripheral title modifier (e.g. a color that also appears in a place name
  // like "מעלה אדומים") is not enough. Commercial targets are not gated by the head.
  const kwCounts = new Map<string, number>()
  for (const w of opportunityKeyword.split(/\s+/)) for (const t of linkToks(w)) kwCounts.set(t, (kwCounts.get(t) ?? 0) + 1)
  const kwDistinct = Array.from(kwCounts.keys()).filter((t) => weight(t) >= 1)
  const repeated = kwDistinct.filter((t) => (kwCounts.get(t) ?? 0) > 1)
  const kwHead = new Set(repeated.length ? repeated : kwDistinct)

  // Score + provisionally classify every candidate.
  const commercial: RoleAssignment[] = []
  const supporting: RoleAssignment[] = []
  const sources: RoleAssignment[] = []
  const debug: RoleAssignment[] = []
  for (const { c, toks } of prepared) {
    const pageType = c.type ?? 'unknown'
    const shared = toks.filter((t) => oppToks.has(t))
    const distinctive = Array.from(new Set(shared.filter((t) => weight(t) >= 1)))
    const score = Number(shared.reduce((s, t) => s + weight(t), 0).toFixed(3))
    const isCommercial = COMMERCIAL_TYPES.has(pageType)
    const isInformational = INFORMATIONAL_TYPES.has(pageType)
    const sharesHead = distinctive.some((t) => kwHead.has(t))

    let a: RoleAssignment
    if (distinctive.length === 0) {
      // Shares only attribute/type words (colour/size/generic type) or nothing.
      const reason = shared.some((t) => isTypeWord(t)) ? 'attribute_only_match' : shared.length ? 'generic_or_type_word_only' : 'no_topical_overlap'
      a = { url: c.url, title: c.title, pageType, role: 'unrelated', reason, score, distinctiveTokens: [] }
    } else if (isCommercial && !sharesHead) {
      // SUBJECT-HEAD gate for EVERY commercial target (was local-only). Live defect:
      // for non-local intents one shared non-head token (a colour, a peripheral
      // modifier, a co-occurring clinical term) qualified an unrelated product —
      // roses → pink orchid, immunity → pest control. A commercial target must share
      // the article's SUBJECT, not merely any distinctive token.
      a = { url: c.url, title: c.title, pageType, role: 'unrelated', reason: localIntent ? 'local_intent_target_mismatch' : 'commercial_target_subject_mismatch', score, distinctiveTokens: distinctive }
    } else if (isCommercial) {
      // Role-specific: a distinctive commercial match is a target regardless of the
      // informational bar. Final primary/secondary decided after ranking.
      a = { url: c.url, title: c.title, pageType, role: 'secondary_commercial_target', reason: 'distinctive_commercial_subject_match', score, distinctiveTokens: distinctive }
      commercial.push(a)
    } else if (isInformational && sharesHead && (distinctive.length >= 2 || (df.get(distinctive[0]) ?? 0) <= 3)) {
      // Complementarity (E/I): shares the article's SUBJECT head — and a SINGLE
      // shared token qualifies only when it is RARE among candidates (df <= 3).
      // Live defect: one corpus-frequent condition-class word ("דלקת") linked a
      // thyroid article to urinary-infection/gingivitis articles; a class word
      // shared by many candidates is category noise, not subject alignment.
      a = { url: c.url, title: c.title, pageType, role: 'supporting_informational_link', reason: 'complements_subject_head', score, distinctiveTokens: distinctive }
      supporting.push(a)
    } else if (isInformational && sharesHead) {
      a = { url: c.url, title: c.title, pageType, role: 'unrelated', reason: 'single_frequent_token_only', score, distinctiveTokens: distinctive }
    } else if (isInformational) {
      a = { url: c.url, title: c.title, pageType, role: 'unrelated', reason: 'shares_only_peripheral_modifier', score, distinctiveTokens: distinctive }
    } else if (sharesHead) {
      a = { url: c.url, title: c.title, pageType, role: 'source_reference', reason: 'distinctive_match_unknown_type', score, distinctiveTokens: distinctive }
      sources.push(a)
    } else {
      a = { url: c.url, title: c.title, pageType, role: 'unrelated', reason: 'shares_only_peripheral_modifier', score, distinctiveTokens: distinctive }
    }
    debug.push(a)
  }

  // Rank each role list, then apply per-role caps + a total cap in priority order.
  const byScore = (x: RoleAssignment, y: RoleAssignment) => y.score - x.score || (urlKey(x.url) < urlKey(y.url) ? -1 : 1)
  commercial.sort(byScore); supporting.sort(byScore); sources.sort(byScore)

  let primaryTarget: RoleAssignment | null = null
  const out: RoleAssignment[] = []
  if (commercial.length) {
    primaryTarget = { ...commercial[0], role: 'primary_commercial_target', reason: 'best_commercial_match' }
    out.push(primaryTarget)
    for (const a of commercial.slice(1, 1 + CAPS.secondary_commercial_target)) out.push({ ...a, role: 'secondary_commercial_target' })
  }
  // Supporting links: cap + light diversity (no two with the same distinctive set).
  const seenSig = new Set<string>()
  for (const a of supporting) {
    if (out.filter((x) => x.role === 'supporting_informational_link').length >= CAPS.supporting_informational_link) break
    const sig = a.distinctiveTokens.slice().sort().join('|')
    if (seenSig.has(sig)) continue
    seenSig.add(sig)
    out.push(a)
  }
  for (const a of sources.slice(0, CAPS.source_reference)) out.push(a)

  const rolePriority: Record<LinkRole, number> = { primary_commercial_target: 0, secondary_commercial_target: 1, supporting_informational_link: 2, source_reference: 3, unrelated: 4 }
  const assignments = out
    .sort((a, b) => rolePriority[a.role] - rolePriority[b.role] || b.score - a.score)
    .slice(0, TOTAL_CAP) // total cap trims the lowest-priority links last
  return { primaryTarget, assignments, debug }
}

/** Build the CANONICAL role-aware LinkPlan from a mapping result. This is the ONE
 *  structure persisted + reloaded + rendered — roles are never re-inferred later. */
export function buildLinkPlan(mapped: ReturnType<typeof mapLinkRoles>): LinkPlan {
  const toTarget = (a: RoleAssignment, role: InternalLinkRole): LinkTarget => ({ url: a.url, title: a.title, pageType: a.pageType, role, score: a.score, reason: a.reason })
  const primaryUrl = mapped.primaryTarget ? mapped.primaryTarget.url.trim().toLowerCase().replace(/\/+$/, '') : null
  return {
    primaryCommercialTarget: mapped.primaryTarget ? toTarget(mapped.primaryTarget, 'primary_commercial_target') : null,
    secondaryCommercialTargets: mapped.assignments.filter((a) => a.role === 'secondary_commercial_target').map((a) => toTarget(a, 'secondary_commercial_target')),
    // Supporting/source EXCLUDE the primary URL (never duplicated under support).
    supportingInformationalLinks: mapped.assignments.filter((a) => a.role === 'supporting_informational_link' && a.url.trim().toLowerCase().replace(/\/+$/, '') !== primaryUrl).map((a) => toTarget(a, 'supporting_informational_link')),
    sourceReferences: mapped.assignments.filter((a) => a.role === 'source_reference' && a.url.trim().toLowerCase().replace(/\/+$/, '') !== primaryUrl).map((a) => toTarget(a, 'source_reference')),
  }
}

/** Flatten a LinkPlan to the legacy ordered {url,anchor} list (primary first) for
 *  backward-compatible consumers. Roles live in the LinkPlan, not here. */
export function linkPlanToOrdered(plan: LinkPlan): { url: string; anchor: string }[] {
  const out: { url: string; anchor: string }[] = []
  const seen = new Set<string>()
  const push = (t: LinkTarget) => { const k = t.url.trim().toLowerCase().replace(/\/+$/, ''); if (!k || seen.has(k)) return; seen.add(k); out.push({ url: t.url, anchor: t.title }) }
  if (plan.primaryCommercialTarget) push(plan.primaryCommercialTarget)
  for (const t of plan.secondaryCommercialTargets) push(t)
  for (const t of plan.supportingInformationalLinks) push(t)
  for (const t of plan.sourceReferences) push(t)
  return out
}

/** Ordered link list for an opportunity: primary target first, then supporting
 *  links EXCLUDING the primary URL, de-duplicated. Bounded by the total cap. */
export function orderedLinksForOpportunity(mapped: ReturnType<typeof mapLinkRoles>): { url: string; anchor: string; role: LinkRole }[] {
  const out: { url: string; anchor: string; role: LinkRole }[] = []
  const seen = new Set<string>()
  const push = (a: RoleAssignment) => { const k = urlKey(a.url); if (!k || seen.has(k)) return; seen.add(k); out.push({ url: a.url, anchor: a.title, role: a.role }) }
  if (mapped.primaryTarget) push(mapped.primaryTarget)
  for (const a of mapped.assignments) {
    if (a.role === 'primary_commercial_target') continue // already added (never a supporting dup)
    push(a)
  }
  return out.slice(0, TOTAL_CAP)
}
