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
  // ubiquitous relational / level / structural words
  'רמה', 'רמת', 'רשימה', 'מדריך', 'סקירה', 'מידע', 'כללי', 'שלם', 'שלמה', 'מקיף', 'מקיפה',
  'דף', 'עמוד', 'מולטי', 'multi', 'page',
  // PRICE / question-framing words — never a distinctive SUBJECT (the need, not
  // the subject). "כמה עולה X" and "מחיר X" must not link via כמה/עולה/מחיר.
  'כמה', 'עולה', 'עולות', 'מחיר', 'מחירים', 'עלות', 'עלויות', 'תקציב', 'תמחור', 'עולים',
  'price', 'cost', 'budget', 'much',
]
const ATTRIBUTE_LEXICON = new Set(ATTRIBUTE_LEXICON_RAW.map((w) => canonicalToken(w)).filter(Boolean))

/** Is a canonical token a modifier (generic OR attribute/container) — never a
 *  standalone subject? Extra caller-derived type/attribute words are folded in. */
export function isModifierToken(tok: string, extraTypeWords?: Set<string>): boolean {
  return GENERIC_TOKENS.has(tok) || ATTRIBUTE_LEXICON.has(tok) || (extraTypeWords?.has(tok) ?? false)
}

/** Distinctive SUBJECT tokens of a phrase, minus generic/attribute/type words,
 *  but KEEPING single latin letters + digit-bearing tokens (a vitamin letter
 *  "C"/"D", "B12", "K2", "1000") — these are the SPECIFIC differentiators the
 *  base tokenizer drops, and losing them let Vitamin-C→Vitamin-D match. */
export function subjectTokensOf(phrase: string, extraTypeWords?: Set<string>): string[] {
  const out: string[] = []
  for (const w of (phrase || '').toLowerCase().replace(/[?!.,:;"'“”׳״()\-–—/|]/g, ' ').split(/\s+/).filter(Boolean)) {
    if (/^[a-z]$/.test(w) || /\d/.test(w)) { out.push(w); continue } // keep C / D / B12 / 1000
    for (const t of distinctiveTokensOf(w)) if (!isModifierToken(t, extraTypeWords)) out.push(t)
  }
  return Array.from(new Set(out))
}

/** The SPECIFIC differentiator of a subject: a digit/short-latin token only
 *  (B12, C, D, K2, 1000). Returns null for a purely-Hebrew subject — there the
 *  head/≥2-token rules decide, and a required-specific check must NOT apply
 *  (it wrongly rejected סידור פרחים ↔ סידורי פרחים / roses↔rose-bouquet). */
export function specificToken(subjectTokens: string[]): string | null {
  return subjectTokens.find((t) => /\d/.test(t) || /^[a-z]{1,3}$/.test(t)) ?? null
}

const LINK_PROCLITICS = 'והבלמשכ'
/** Link-matching key: proclitic strip + construct/feminine ־י/־ה fold, so
 *  סידור/סידורי and חתונה/חתונ compare equal without changing the global
 *  semantic-dup normalizer. */
function lk(t: string): string {
  let s = t
  if (/^[א-ת]/.test(s) && s.length >= 4 && LINK_PROCLITICS.includes(s[0])) s = s.slice(1)
  if (/^[א-ת]+$/.test(s) && s.length >= 4) s = s.replace(/[יה]$/, '')
  return s
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
const COMMERCIAL_ROLES = new Set(['primary_commercial_target', 'secondary_commercial_target'])

export function evaluateLink(
  opp: OpportunitySubject,
  candidate: { url: string; title: string; role?: string },
  opts?: { typeWords?: Set<string>; boilerplate?: boolean },
): LinkRelevanceDiagnostic {
  const tw = opts?.typeWords
  const role = candidate.role ?? 'unknown'
  const isCommercial = COMMERCIAL_ROLES.has(role)
  // The SEARCH TARGET's own subject head = distinctive tokens of the KEYWORD
  // (single latin/digit differentiators kept).
  const headRaw = subjectTokensOf(opp.primaryKeyword, tw)
  const headKeys = new Set(headRaw.map(lk))
  const oppSubjectRaw = subjectTokensOf(`${opp.primaryKeyword} ${opp.title}`, tw)
  const oppSubject = new Set(oppSubjectRaw.map(lk))
  const candSubjectRaw = subjectTokensOf(candidate.title, tw)
  const candKeys = new Set(candSubjectRaw.map(lk))

  const sharedSubject = Array.from(new Set(candSubjectRaw.filter((t) => oppSubject.has(lk(t)))))
  const sharedHead = sharedSubject.filter((t) => headKeys.has(lk(t)))
  // The opportunity's SPECIFIC differentiator (a vitamin letter / code) MUST be
  // shared when present — separates Vitamin-C from Vitamin-D, B12 from weight-loss.
  const spec = specificToken(headRaw.length ? headRaw : oppSubjectRaw)
  const specOk = spec == null || candKeys.has(lk(spec))

  const diag: LinkRelevanceDiagnostic = {
    targetUrl: candidate.url, targetTitle: candidate.title, role,
    sharedDistinctiveTokens: sharedSubject, semanticRelation: 'none', rejectionReasons: [],
    acceptedBecause: null, isHomepage: isHomepageUrl(candidate.url), coverageOwned: false,
  }

  if (opts?.boilerplate) { diag.rejectionReasons.push('boilerplate_page'); return diag }

  // Coverage: the candidate's subject covers the opportunity's ENTIRE distinctive
  // subject → it OWNS the need. For an INFORMATIONAL link this is cannibalization;
  // for a COMMERCIAL target it is the money page (kept).
  if (oppSubject.size >= 2 && Array.from(oppSubject).every((t) => candKeys.has(t))) {
    diag.coverageOwned = true
    diag.rejectionReasons.push('coverage_owns_need')
  }

  // COMMERCIAL target: a single shared HEAD token qualifies ONLY when the
  // opportunity's specific differentiator (if any) is also shared (an exact owned
  // product/category head), OR ≥2 shared, OR it owns the subject.
  if (isCommercial) {
    if (diag.coverageOwned) { diag.semanticRelation = 'subject_head_shared'; diag.acceptedBecause = 'commercial page owns the subject'; return diag }
    if (sharedHead.length >= 1 && specOk) { diag.semanticRelation = 'subject_head_shared'; diag.acceptedBecause = `commercial: owned head${spec ? ` + specific (${spec})` : ''}`; return diag }
    if (sharedSubject.length >= 2 && specOk) { diag.semanticRelation = 'multi_subject_shared'; diag.acceptedBecause = `commercial: ≥2 subject tokens${spec ? ` incl. specific (${spec})` : ''}`; return diag }
  } else {
    // INFORMATIONAL / source: require TWO meaningful distinctive subject tokens
    // AND (when present) the specific differentiator — a single stemmed/generic
    // token never qualifies (המדריך/מלא/דף/פירות/זריקות/לעבוד/מולטי alone rejected).
    if (sharedSubject.length >= 2 && specOk) {
      diag.semanticRelation = 'multi_subject_shared'
      diag.acceptedBecause = `≥2 distinctive subject tokens${spec ? ` incl. specific (${spec})` : ''}: ${sharedSubject.join(', ')}`
      return diag
    }
  }

  // Not relevant — classify why.
  if (spec != null && !specOk && sharedSubject.length >= 1) diag.rejectionReasons.push('single_non_head_token_only')
  else if (sharedSubject.length >= 1) diag.rejectionReasons.push('single_non_head_token_only')
  else {
    const candAll = new Set(distinctiveTokensOf(candidate.title).flatMap((t) => canonicalVariants(t)))
    const oppAll = new Set(distinctiveTokensOf(`${opp.primaryKeyword} ${opp.title}`).flatMap((t) => canonicalVariants(t)))
    const sharedAny = Array.from(oppAll).some((t) => candAll.has(t))
    diag.rejectionReasons.push(sharedAny ? 'attribute_or_generic_overlap_only' : 'no_subject_overlap')
  }
  return diag
}

/** Role-aware relevance verdict (the acceptedBecause/rejectionReasons already
 *  encode the decision; a homepage that shares nothing meaningful is rejected). */
export function isRelevantLink(diag: LinkRelevanceDiagnostic, role?: string): boolean {
  const r = role ?? diag.role
  if (diag.coverageOwned) return COMMERCIAL_ROLES.has(r) && diag.semanticRelation !== 'none'
  return diag.semanticRelation !== 'none' && !diag.rejectionReasons.some((x) => x === 'boilerplate_page')
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
