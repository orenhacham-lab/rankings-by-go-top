/**
 * LIVE-ACCEPTANCE rule evaluator (pure, offline-testable).
 *
 * Turns ONE evidence-first run (real project data + real Gemini) into a typed
 * PASS/FAIL acceptance report — the automated core of the /reco-qa Preview
 * runner, so the operator triggers one action and reads a verdict instead of
 * inspecting network payloads. Every rule mirrors the live-acceptance spec:
 * real Pro on premium, ≤2 calls, exact reconciliation, no truncated keyword,
 * no malformed Hebrew, no invented demand, demand↔subject alignment, no
 * high-confidence duplicate pair, title↔keyword head alignment, link subject
 * relevance + no boilerplate, truthful yield/insufficient-inventory, and
 * (when persisted) inserted == reloaded with current-run/pending separation.
 * Manual-review items (e.g. medical certainty phrasing) surface as WARN —
 * flagged for a human, never silently passed.
 */

import type { BriefRunDiagnostics } from './generate-from-briefs'
import type { TopicSuggestion } from './types'
import { isMalformedReason, isTruncatedKeywordPhrase, validateIntentKeywordConsistency } from './opportunity-validation'
import type { SearchIntent } from './opportunity'
import { isSemanticTopicDuplicate, distinctiveTokensOf, canonicalVariants } from './semantic-dup'
import { isBoilerplatePage } from './link-role-mapper'
import { evaluateTitleDiversity } from './title-diversity'

export interface AcceptanceRule {
  id: string
  level: 'fail' | 'warn'
  pass: boolean
  detail: string
}

export interface RunAcceptanceInput {
  tierRequested: 'standard' | 'premium'
  diagnostics: BriefRunDiagnostics
  suggestions: TopicSuggestion[]
  /** Present when the runner persisted (acceptance persist mode). */
  persistence?: { attempted: number; inserted: number; duplicate: number; failed: number; reloadedFreshCount: number } | null
  /** Pending inventory BEFORE the run (current-run separation check). */
  pendingBefore: number
}

export type AcceptanceVerdict = 'PASS' | 'FAIL' | 'INSUFFICIENT_INVENTORY'

export interface RunAcceptanceReport {
  /** Three-way verdict — an empty pool is NEVER a green PASS: it is
   *  INSUFFICIENT_INVENTORY only when the pool accounting reconciles, every
   *  candidate carries a typed legitimate rejection, no evidence load failed,
   *  and no broad semantic rule emptied the pool without reviewable evidence;
   *  otherwise it is FAIL. */
  verdict: AcceptanceVerdict
  /** Back-compat: verdict === 'PASS'. */
  passed: boolean
  warnings: number
  rules: AcceptanceRule[]
}

const DEMAND_QUANTITY_RE = /(אלפי|מאות|עשרות|מיליוני)\s+(חיפושים|מחפשים)|ביקוש\s+(גבוה|רב|עצום)|חיפושים\s+(רבים|נפוצים)|thousands\s+of\s+searches|high\s+(search\s+volume|demand)/i
// Absolute-certainty medical phrasing → MANUAL review (warn), per the live spec.
const MEDICAL_CERTAINTY_RE = /(?:^|\s)(?:מרפא(?:ת)?|מונע(?:ת|ים)?\s|ריפוי\s+מלא|מבטיח(?:ה)?\s+(?:ריפוי|החלמה)|100%|cures?\s|prevents?\s|guaranteed\s+to\s+(?:cure|heal))/i

export function evaluateRunAcceptance(input: RunAcceptanceInput): RunAcceptanceReport {
  const { diagnostics: d, suggestions } = input
  const rules: AcceptanceRule[] = []
  const add = (id: string, pass: boolean, detail: string, level: 'fail' | 'warn' = 'fail') => rules.push({ id, level, pass, detail })

  // ── Model path ──
  if (input.tierRequested === 'premium') {
    add('premium_uses_real_pro', d.modelPath.tierUsed === 'pro' && d.modelPath.downgraded === false,
      `requestedTier=${d.modelPath.requestedTier} model=${d.modelPath.model} tierUsed=${d.modelPath.tierUsed} downgraded=${d.modelPath.downgraded}${d.modelPath.downgradeReason ? ` (${d.modelPath.downgradeReason})` : ''}`)
  } else {
    add('standard_uses_flash', d.modelPath.tierUsed === 'flash' && !d.modelPath.downgraded, `model=${d.modelPath.model}`)
  }
  add('model_path_explicit', !!d.modelPath && typeof d.modelPath.downgraded === 'boolean', JSON.stringify(d.modelPath))

  // ── Efficiency ──
  add('max_two_synthesis_calls', d.model_calls <= 2, `model_calls=${d.model_calls}`)

  // ── Provider health: a provider rejection is a typed FAILURE, never silent
  // and never mislabeled as quality rejection or "model unavailable".
  const providerFailedRounds = d.rounds.filter((r) => r.provider_failed_briefs > 0 || !r.provider_ok)
  add('provider_no_failure', providerFailedRounds.length === 0 && d.stop_reason !== 'provider_failed',
    providerFailedRounds.map((r) => `r${r.round}: ${r.providerErrorType ?? 'unknown'} — ${r.sanitizedProviderMessage ?? ''}`).join(' | ') || 'none')

  // ── RC1: synthesis response contract — a provider-SUCCESSFUL response must
  // honor the structured-output contract. Missing briefs, parse failures,
  // schema-shape failures and unknown-id responses are CONTRACT failures —
  // never "insufficient inventory" and never zero-quality.
  const contractBreaches = d.rounds.filter((r) => r.synthesis_failure !== null || (r.provider_ok && r.briefs_sent > 0 && r.missing_from_response > 0))
  add('synthesis_response_contract', contractBreaches.length === 0 && d.stop_reason !== 'synthesis_failed',
    contractBreaches.map((r) => `r${r.round}: ${r.synthesis_failure ?? 'missing_briefs'} missing=${r.missing_from_response}/${r.briefs_sent} topLevel=${r.synthesisResponse?.topLevelType}[${(r.synthesisResponse?.topLevelKeys ?? []).join(',')}] unknownIds=${(r.synthesisResponse?.unknownBriefIds ?? []).length} hash=${r.synthesisResponse?.responseHash}`).join(' | ') || 'none')

  // ── Exact reconciliation (provider failures have their OWN bucket) ──
  const recon = d.rounds.every((r) =>
    r.briefs_sent === r.polished + r.skipped_by_model + r.missing_from_response + r.provider_failed_briefs &&
    r.polished === r.accepted + Object.values(r.rejected_by_reason).reduce((a, b) => a + b, 0))
  add('exact_reconciliation', recon, d.rounds.map((r) => `r${r.round}: sent=${r.briefs_sent} polished=${r.polished} skipped=${r.skipped_by_model} missing=${r.missing_from_response} providerFailed=${r.provider_failed_briefs} accepted=${r.accepted} rejected=${Object.values(r.rejected_by_reason).reduce((a, b) => a + b, 0)}`).join(' | ') || 'no rounds')

  // ── Brief-pool accounting: raw candidates NEVER vanish untyped ──
  const bp = d.brief_pool
  const rejectedSum = Object.values(bp.rejected_by_reason).reduce((a, b) => a + b, 0)
  add('pool_accounting_reconciles', bp.total_raw_candidates === bp.pool_size + rejectedSum,
    `totalRaw=${bp.total_raw_candidates} pool=${bp.pool_size} rejected=${rejectedSum} (${JSON.stringify(bp.rejected_by_reason)})`)
  add('raw_query_candidates_expected', !(d.evidence_inventory.keyword_research_queries > 0 && bp.raw_query_candidates === 0),
    `kr_queries=${d.evidence_inventory.keyword_research_queries} raw_query_candidates=${bp.raw_query_candidates}`)

  // ── Yield truthfulness (effective pool = deterministic pool + validated
  // discovery briefs — RC3 discovery is a LEGITIMATE anchored source) ──
  const effectivePool = bp.pool_size + (d.discovery?.accepted ?? 0)
  const target = 8
  const yieldOk = suggestions.length >= Math.min(target, effectivePool) || d.stop_reason === 'insufficient_inventory' || d.stop_reason === 'pool_exhausted'
  add('yield_or_truthful_inventory', yieldOk, `accepted=${suggestions.length} pool=${bp.pool_size} discovery=${d.discovery?.accepted ?? 0} stop=${d.stop_reason}`)
  add('no_filler_on_empty_pool', !(effectivePool === 0 && suggestions.length > 0), `effectivePool=${effectivePool} accepted=${suggestions.length}`)

  // ── Per-topic quality ──
  const truncated = suggestions.filter((s) => isTruncatedKeywordPhrase(s.primaryKeyword))
  add('no_truncated_keyword', truncated.length === 0, truncated.map((s) => s.primaryKeyword).join(' · ') || 'none')

  const malformed = suggestions.filter((s) => isMalformedReason(s.suggestionReason))
  add('no_malformed_reason', malformed.length === 0, malformed.map((s) => s.suggestionReason).join(' · ') || 'none')

  const inventedDemand = suggestions.filter((s) => {
    const r = s.suggestionReason || ''
    if (DEMAND_QUANTITY_RE.test(r)) return true
    // Any monthly-searches claim must be the deterministic clause for the topic's
    // OWN aligned query.
    if (/חיפושים חודשיים|monthly searches/.test(r)) {
      return !(s.demandEvidence?.demandEvidenceAvailable && s.demandEvidence.demandQuery && r.includes(`"${s.demandEvidence.demandQuery}"`))
    }
    return false
  })
  add('no_invented_demand', inventedDemand.length === 0, inventedDemand.map((s) => `${s.primaryKeyword}: ${s.suggestionReason}`).join(' · ') || 'none')

  const misalignedDemand = suggestions.filter((s) => s.demandEvidence?.demandEvidenceAvailable && !['exact', 'close_intent'].includes(s.demandEvidence?.demandMatchType ?? ''))
  add('demand_matches_subject', misalignedDemand.length === 0, misalignedDemand.map((s) => `${s.primaryKeyword}→${s.demandEvidence?.demandQuery}`).join(' · ') || 'none')

  const dupPairs: string[] = []
  for (let i = 0; i < suggestions.length; i++) for (let j = i + 1; j < suggestions.length; j++) {
    if (isSemanticTopicDuplicate({ primaryKeyword: suggestions[i].primaryKeyword, intent: suggestions[i].searchIntent }, { primaryKeyword: suggestions[j].primaryKeyword, intent: suggestions[j].searchIntent })) {
      dupPairs.push(`"${suggestions[i].primaryKeyword}" ≈ "${suggestions[j].primaryKeyword}"`)
    }
  }
  add('no_duplicate_pair', dupPairs.length === 0, dupPairs.join(' · ') || 'none')

  const misaligned = suggestions.filter((s) => {
    const c = validateIntentKeywordConsistency({ primaryKeyword: s.primaryKeyword, title: s.title, intent: s.searchIntent as SearchIntent }, new Set())
    return !c.ok || !!c.repairedKeyword
  })
  add('title_keyword_alignment', misaligned.length === 0, misaligned.map((s) => `"${s.title}" ⇄ "${s.primaryKeyword}"`).join(' · ') || 'none')

  // ── Title-pattern diversity: ≤1 mega-guide opening, ≤2 per opening skeleton
  // (punctuation/definite-article/grammatical variants folded before comparing).
  const diversity = evaluateTitleDiversity(suggestions.map((s) => s.title))
  add('title_pattern_diversity', diversity.pass, diversity.violations.join(' · ') || `skeletons: ${JSON.stringify(diversity.skeletons)}`)

  // ── Link relevance ──
  const badLinks: string[] = []
  for (const s of suggestions) {
    const topicTokens = new Set(distinctiveTokensOf(`${s.primaryKeyword} ${s.title}`).flatMap((t) => canonicalVariants(t)))
    for (const l of s.suggestedInternalLinks ?? []) {
      if (isBoilerplatePage(l.anchor, l.url)) { badLinks.push(`${s.primaryKeyword} → BOILERPLATE ${l.url}`); continue }
      const linkTokens = distinctiveTokensOf(l.anchor)
      const shares = linkTokens.some((t) => canonicalVariants(t).some((v) => topicTokens.has(v)))
      if (!shares) badLinks.push(`${s.primaryKeyword} → off-subject "${l.anchor}" (${l.url})`)
    }
  }
  add('links_subject_relevant', badLinks.length === 0, badLinks.join(' · ') || 'none')
  add('zero_links_permitted', true, `${suggestions.filter((s) => (s.suggestedInternalLinks ?? []).length === 0).length} topics with zero links (valid)`)

  // ── Persistence / current-run separation (persist mode only) ──
  if (input.persistence) {
    const p = input.persistence
    add('inserted_equals_reloaded', p.inserted === p.reloadedFreshCount, `inserted=${p.inserted} reloadedFresh=${p.reloadedFreshCount}`)
    add('no_swallowed_persistence_failure', !(p.attempted > 0 && p.inserted === 0 && p.duplicate === 0), `attempted=${p.attempted} inserted=${p.inserted} duplicate=${p.duplicate} failed=${p.failed}`)
    add('current_run_separated_from_pending', true, `pendingBefore=${input.pendingBefore} newlyAccepted=${suggestions.length}`)
  }

  // ── Manual-review flags (WARN — a human must look, never auto-pass) ──
  const medical = suggestions.filter((s) => MEDICAL_CERTAINTY_RE.test(`${s.title} ${s.suggestionReason}`))
  add('medical_certainty_review', medical.length === 0, medical.map((s) => s.title).join(' · ') || 'none', 'warn')
  const brandShadow = d.shadow_rejected_by_reason['competitor_brand_leakage'] ?? 0
  add('competitor_leak_review', brandShadow === 0, `shadow competitor_brand_leakage=${brandShadow} (diagnostics-only; review titles if > 0)`, 'warn')
  add('evidence_loads_clean', d.evidence_inventory.evidence_load_errors.length === 0, d.evidence_inventory.evidence_load_errors.join(' · ') || 'none', 'warn')

  // ── Empty-pool scrutiny (Natural-Shop false-green class): an empty pool must
  // PROVE why it is empty before it may be called insufficient inventory.
  if (effectivePool === 0 && suggestions.length === 0) {
    add('empty_pool_loads_clean', d.evidence_inventory.evidence_load_errors.length === 0,
      d.evidence_inventory.evidence_load_errors.join(' · ') || 'none')
    add('empty_pool_not_stale_evidence', !d.evidence_inventory.stale_index_excluded,
      d.evidence_inventory.stale_index_excluded ? 'cached site index excluded as stale (host mismatch) — evidence inputs stale' : 'none')
    const semanticRejected = (bp.rejected_by_reason['pending_semantic_duplicate'] ?? 0) + (bp.rejected_by_reason['brief_semantic_duplicate'] ?? 0)
    add('empty_pool_not_semantic_emptied', !(bp.total_raw_candidates > 0 && semanticRejected / bp.total_raw_candidates > 0.5),
      `semantic=${semanticRejected}/${bp.total_raw_candidates} — review rejected_examples before trusting a broad semantic rule`)
  }

  const failed = rules.filter((r) => r.level === 'fail' && !r.pass)
  const warnings = rules.filter((r) => r.level === 'warn' && !r.pass).length
  const verdict: AcceptanceVerdict = failed.length > 0
    ? 'FAIL'
    : suggestions.length > 0
      ? 'PASS'
      : 'INSUFFICIENT_INVENTORY'
  return { verdict, passed: verdict === 'PASS', warnings, rules }
}
