/**
 * STRICT internal-link relevance (P0-1) — pure, domain-neutral.
 *
 * Live-proven false-passes: pink-roses → pink-anthurium/orchid (COLOUR only),
 * B12 → Vitamin-C (quality word "recommended" only), chuppah-DESIGN →
 * home-interior-DESIGN (generic "design" only), digital-agency → office-services
 * (generic container "office" only), Vitamin-D-level → sciatica (no overlap).
 *
 * Contract: a link qualifies ONLY when it shares the opportunity's distinctive
 * SUBJECT HEAD (the search target's own subject noun) OR ≥2 distinctive subject
 * tokens (a verified multi-token relationship). Colour / adjective / occasion /
 * generic type-word / container-word overlap ALONE never qualifies. A page whose
 * subject already OWNS the opportunity's need is a coverage/cannibalization
 * signal, not a supporting link. Every evaluation yields a typed diagnostic so
 * the acceptance rule can re-check EVERY accepted link, not just token presence.
 */

import { distinctiveTokensOf, canonicalToken, canonicalVariants } from './semantic-dup'
import { GENERIC_TOKENS } from './opportunity'
import type { LinkPlan, LinkTarget } from './types'

/** Domain-NEUTRAL attribute + container lexicon (colours, sizes, quality words,
 *  generic design/type/container nouns) — never a subject on its own. Not
 *  industry/product content; grammar-level modifiers, like GENERIC_TOKENS. */
const ATTRIBUTE_LEXICON_RAW = [
  // colours
  'לבן', 'שחור', 'אדום', 'כחול', 'ירוק', 'צהוב', 'כתום', 'סגול', 'ורוד', 'חום', 'אפור',
  'זהב', 'זהוב', 'כסף', 'כסוף', 'בז', 'תכלת', 'בורדו', 'קרם', 'שמנת', 'צבעוני', 'צבעונית',
  'white', 'black', 'red', 'blue', 'green', 'yellow', 'pink', 'purple', 'orange', 'gold',
  // sizes / dimensions
  'קטן', 'גדול', 'בינוני', 'ענק', 'זעיר', 'רחב', 'צר', 'ארוך', 'קצר', 'small', 'large', 'big',
  // quality / recommendation modifiers
  'מומלץ', 'מומלצת', 'איכותי', 'איכותית', 'מושלם', 'מושלמת', 'הטוב', 'הטובה', 'מוביל', 'מובילה',
  'פופולרי', 'נפוץ', 'קלאסי', 'מודרני', 'יוקרתי', 'זול', 'רומנטי', 'מיוחד', 'ייחודי', 'best', 'top',
  // generic design / type / collection nouns
  'עיצוב', 'סגנון', 'מבחר', 'אוסף', 'קולקציה', 'דגם', 'סוג', 'סוגי', 'פריט', 'מוצר', 'מוצרי',
  'פתרון', 'פתרונות', 'רעיון', 'רעיונות', 'טיפ', 'טיפים', 'design', 'style', 'type',
  // generic business containers
  'משרד', 'חברה', 'עסק', 'עסקי', 'שירות', 'שירותי', 'שירותים', 'מערכת', 'תחום', 'company', 'service',
  // ubiquitous relational / level words
  'רמה', 'רמת', 'רשימה', 'מדריך', 'סקירה', 'מידע', 'כללי',
]
const ATTRIBUTE_LEXICON = new Set(ATTRIBUTE_LEXICON_RAW.map((w) => canonicalToken(w)).filter(Boolean))

/** Is a canonical token a modifier (generic OR attribute/container) — never a
 *  standalone subject? Extra caller-derived type/attribute words are folded in. */
export function isModifierToken(tok: string, extraTypeWords?: Set<string>): boolean {
  return GENERIC_TOKENS.has(tok) || ATTRIBUTE_LEXICON.has(tok) || (extraTypeWords?.has(tok) ?? false)
}

/** Distinctive SUBJECT tokens (canonical) of a phrase, minus generic + attribute
 *  + caller type words. */
export function subjectTokensOf(phrase: string, extraTypeWords?: Set<string>): string[] {
  return distinctiveTokensOf(phrase).filter((t) => !isModifierToken(t, extraTypeWords))
}

export type LinkRejectionReason =
  | 'no_subject_overlap'
  | 'attribute_or_generic_overlap_only'
  | 'single_non_head_token_only'
  | 'boilerplate_page'
  | 'coverage_owns_need'
export type SemanticRelation = 'subject_head_shared' | 'multi_subject_shared' | 'none'

export interface LinkRelevanceDiagnostic {
  targetUrl: string
  targetTitle: string
  role: string
  sharedDistinctiveTokens: string[]
  semanticRelation: SemanticRelation
  rejectionReasons: LinkRejectionReason[]
  acceptedBecause: string | null
  isHomepage: boolean
  /** The candidate page already OWNS the opportunity's need (coverage signal). */
  coverageOwned: boolean
}

const urlKey = (u: string) => (u || '').trim().toLowerCase().replace(/\/+$/, '')
function isHomepageUrl(url: string): boolean {
  const k = urlKey(url)
  if (k === '' || k === '/') return true
  try { const u = new URL(k.includes('://') ? k : `https://x/${k.replace(/^\//, '')}`); return u.pathname === '' || u.pathname === '/' } catch { return /^https?:\/\/[^/]+$/.test(k) }
}

export interface OpportunitySubject {
  primaryKeyword: string
  title: string
  intent?: string
}

/**
 * Evaluate ONE candidate link against an opportunity. Relevant iff it shares the
 * opportunity's SUBJECT HEAD (a distinctive keyword-subject token) or ≥2
 * distinctive subject tokens. coverageOwned = the candidate's subject set covers
 * the opportunity's full distinctive subject (it owns the need — not a support).
 */
export function evaluateLink(
  opp: OpportunitySubject,
  candidate: { url: string; title: string; role?: string },
  opts?: { typeWords?: Set<string>; boilerplate?: boolean },
): LinkRelevanceDiagnostic {
  const tw = opts?.typeWords
  // The SEARCH TARGET's own subject head = distinctive tokens of the KEYWORD.
  const headTokens = new Set(subjectTokensOf(opp.primaryKeyword, tw).flatMap((t) => canonicalVariants(t)))
  const oppSubject = new Set(subjectTokensOf(`${opp.primaryKeyword} ${opp.title}`, tw).flatMap((t) => canonicalVariants(t)))
  const candSubjectRaw = subjectTokensOf(candidate.title, tw)
  const candSubject = new Set(candSubjectRaw.flatMap((t) => canonicalVariants(t)))

  const sharedSubject = Array.from(new Set(candSubjectRaw.filter((t) => canonicalVariants(t).some((v) => oppSubject.has(v)))))
  const sharedHead = sharedSubject.filter((t) => canonicalVariants(t).some((v) => headTokens.has(v)))

  const diag: LinkRelevanceDiagnostic = {
    targetUrl: candidate.url, targetTitle: candidate.title, role: candidate.role ?? 'unknown',
    sharedDistinctiveTokens: sharedSubject, semanticRelation: 'none', rejectionReasons: [],
    acceptedBecause: null, isHomepage: isHomepageUrl(candidate.url), coverageOwned: false,
  }

  if (opts?.boilerplate) { diag.rejectionReasons.push('boilerplate_page'); return diag }

  // Coverage: the candidate's subject covers the opportunity's ENTIRE distinctive
  // subject → it OWNS the need. For an INFORMATIONAL link this is a
  // coverage/cannibalization signal (not a support); for a COMMERCIAL target it
  // is the money page (kept). isRelevantLink decides by role.
  if (oppSubject.size >= 2 && Array.from(oppSubject).every((t) => candSubject.has(t))) {
    diag.coverageOwned = true
    diag.rejectionReasons.push('coverage_owns_need')
  }

  if (sharedHead.length >= 1) {
    diag.semanticRelation = 'subject_head_shared'
    diag.acceptedBecause = `shares subject head: ${sharedHead.join(', ')}`
    return diag
  }
  if (sharedSubject.length >= 2) {
    diag.semanticRelation = 'multi_subject_shared'
    diag.acceptedBecause = `shares ≥2 distinctive subject tokens: ${sharedSubject.join(', ')}`
    return diag
  }
  // Not relevant — classify why.
  if (sharedSubject.length === 1) diag.rejectionReasons.push('single_non_head_token_only')
  else {
    // Any shared token was attribute/generic, or there was no overlap at all.
    const candAll = new Set(distinctiveTokensOf(candidate.title).flatMap((t) => canonicalVariants(t)))
    const oppAll = new Set(distinctiveTokensOf(`${opp.primaryKeyword} ${opp.title}`).flatMap((t) => canonicalVariants(t)))
    const sharedAny = Array.from(oppAll).some((t) => candAll.has(t))
    diag.rejectionReasons.push(sharedAny ? 'attribute_or_generic_overlap_only' : 'no_subject_overlap')
  }
  return diag
}

const COMMERCIAL_ROLES = new Set(['primary_commercial_target', 'secondary_commercial_target'])

/** Role-aware relevance. A commercial (money) target that OWNS the subject is
 *  valid; an informational/support link that owns the need is cannibalization. */
export function isRelevantLink(diag: LinkRelevanceDiagnostic, role?: string): boolean {
  if (diag.semanticRelation === 'none') return false
  if (diag.rejectionReasons.some((r) => r === 'boilerplate_page')) return false
  if (diag.coverageOwned) return COMMERCIAL_ROLES.has(role ?? diag.role)
  return diag.rejectionReasons.length === 0
}

/**
 * Filter a role-typed LinkPlan to only subject-relevant targets + emit per-link
 * diagnostics for EVERY evaluated target. A homepage survives only when it
 * shares the subject head AND at least one non-homepage relevant target does not
 * already exist (it must not make an unrelated topic look supported).
 */
export function filterLinkPlan(
  plan: LinkPlan,
  opp: OpportunitySubject,
  opts?: { typeWords?: Set<string>; isBoilerplate?: (title: string, url: string) => boolean },
): { plan: LinkPlan; diagnostics: LinkRelevanceDiagnostic[]; coverageOwned: LinkRelevanceDiagnostic[] } {
  const diagnostics: LinkRelevanceDiagnostic[] = []
  const coverageOwned: LinkRelevanceDiagnostic[] = []
  const keep = (t: LinkTarget, role: string): boolean => {
    const d = evaluateLink(opp, { url: t.url, title: t.title, role }, { typeWords: opts?.typeWords, boilerplate: opts?.isBoilerplate?.(t.title, t.url) })
    diagnostics.push(d)
    if (d.coverageOwned) coverageOwned.push(d)
    return isRelevantLink(d)
  }
  const primary = plan.primaryCommercialTarget && keep(plan.primaryCommercialTarget, 'primary_commercial_target') ? plan.primaryCommercialTarget : null
  const secondary = plan.secondaryCommercialTargets.filter((t) => keep(t, 'secondary_commercial_target'))
  const supporting = plan.supportingInformationalLinks.filter((t) => keep(t, 'supporting_informational_link'))
  const sources = plan.sourceReferences.filter((t) => keep(t, 'source_reference'))
  const hasNonHomepage = [primary, ...secondary, ...supporting, ...sources].filter((t): t is LinkTarget => !!t).some((t) => !isHomepageUrl(t.url))
  const dropHomepageIfRedundant = (t: LinkTarget) => !(isHomepageUrl(t.url) && hasNonHomepage)
  return {
    plan: {
      primaryCommercialTarget: primary && dropHomepageIfRedundant(primary) ? primary : null,
      secondaryCommercialTargets: secondary.filter(dropHomepageIfRedundant),
      supportingInformationalLinks: supporting.filter(dropHomepageIfRedundant),
      sourceReferences: sources.filter(dropHomepageIfRedundant),
    },
    diagnostics,
    coverageOwned,
  }
}
