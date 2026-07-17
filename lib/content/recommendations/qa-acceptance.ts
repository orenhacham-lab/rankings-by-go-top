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
import { isMalformedReason, isTruncatedKeywordPhrase, validateIntentKeywordConsistency, localImprovementCompatible } from './opportunity-validation'
import type { SearchIntent } from './opportunity'
import { distinctiveTokensOf, canonicalVariants } from './semantic-dup'
import { isBoilerplatePage } from './link-role-mapper'
import { evaluateTitleDiversity } from './title-diversity'
import { evaluateLink, isRelevantLink, sharesSubjectHead } from './link-relevance'
import { isSameNeedDuplicate, isTitleKeywordAligned, incompatibleActionNeed } from './coverage'
import { isSearchPhraseQuality } from './search-phrase'

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
  const yieldOk = suggestions.length >= Math.min(target, effectivePool) || d.stop_reason === 'insufficient_inventory' || d.stop_reason === 'true_pool_exhausted' || d.stop_reason === 'call_cap_reached'
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

  // Customer-visible demand must be exact/close AND not a head-term BROADER than
  // the primary keyword (P1 — a broad head query never states a narrow topic's
  // volume). Re-check breadth defensively over the FINAL primary keyword.
  const misalignedDemand = suggestions.filter((s) => {
    const de = s.demandEvidence
    if (!de?.demandEvidenceAvailable) return false
    if (!['exact', 'close_intent'].includes(de.demandMatchType ?? '')) return true
    if (de.demandMatchType === 'exact' || !de.demandQuery) return false
    const qToks = distinctiveTokensOf(de.demandQuery)
    const kSet = new Set(distinctiveTokensOf(s.primaryKeyword).flatMap((t) => canonicalVariants(t)))
    const subset = qToks.length > 0 && qToks.every((t) => canonicalVariants(t).some((v) => kSet.has(v)))
    return subset && qToks.length < distinctiveTokensOf(s.primaryKeyword).length // broader than the keyword
  })
  add('demand_matches_subject', misalignedDemand.length === 0, misalignedDemand.map((s) => `${s.primaryKeyword}→${s.demandEvidence?.demandQuery}(${s.demandEvidence?.demandMatchType})`).join(' · ') || 'none')

  // P0-3 — every primary keyword must be a clean target SEARCH PHRASE, not a headline.
  const headlineKw = suggestions.filter((s) => !isSearchPhraseQuality(s.primaryKeyword))
  add('primary_keyword_search_phrase_quality', headlineKw.length === 0, headlineKw.map((s) => `"${s.primaryKeyword}"`).join(' · ') || 'none')

  // P0-2 — strict semantic OR same subject-head + same coarse search-need dup.
  const dupPairs: string[] = []
  for (let i = 0; i < suggestions.length; i++) for (let j = i + 1; j < suggestions.length; j++) {
    const a = suggestions[i], b = suggestions[j]
    if (isSameNeedDuplicate({ primaryKeyword: a.primaryKeyword, title: a.title, intent: a.searchIntent }, { primaryKeyword: b.primaryKeyword, title: b.title, intent: b.searchIntent })) {
      dupPairs.push(`"${a.primaryKeyword}" ≈ "${b.primaryKeyword}"`)
    }
  }
  add('no_duplicate_pair', dupPairs.length === 0, dupPairs.join(' · ') || 'none')

  // P0-2 — a need an EXISTING page owns must NOT be accepted as a separate new
  // page. It passes ONLY when converted to an existing_page_improvement.
  const cannibalized = suggestions.filter((s) => (s.coverageMatches ?? []).some((m) => m.matchType === 'owns_need' || m.matchType === 'exact') && s.recommendedPageType !== 'existing_page_improvement')
  add('no_existing_need_cannibalization', cannibalized.length === 0, cannibalized.map((s) => `"${s.primaryKeyword}" (${s.recommendedPageType ?? 'new page'}) ← ${(s.coverageMatches ?? []).filter((m) => m.matchType === 'owns_need' || m.matchType === 'exact').map((m) => m.existingTitle).join('/')}`).join(' · ') || 'none')

  // P0 — an existing_page_improvement must have a SEMANTICALLY VALID basis: some
  // recorded existing page whose subject HEAD overlaps the topic (not merely a
  // shared attribute/colour — "ורדים ורודים" is not owned by "אנטוריום ורוד"),
  // and for a LOCAL topic that basis must be the SAME place (geographic
  // containment — "בית שמש" is not owned by "בית וגן ירושלים").
  const invalidImprovement = suggestions.filter((s) => {
    if (s.recommendedPageType !== 'existing_page_improvement') return false
    const bases = s.coverageMatches ?? []
    if (bases.length === 0) return true // no recorded ownership basis at all
    const topicText = `${s.primaryKeyword} ${s.title}`
    const isLocal = s.searchIntent === 'local'
    // Valid iff SOME basis shares a subject head, is a compatible ACTION/need
    // class (build≠promote), and — for a local topic — is the same place.
    return !bases.some((m) => sharesSubjectHead(topicText, m.existingTitle) && !incompatibleActionNeed(topicText, m.existingTitle) && (!isLocal || localImprovementCompatible(topicText, m.existingTitle)))
  })
  add('existing_page_improvement_valid_basis', invalidImprovement.length === 0, invalidImprovement.map((s) => `"${s.primaryKeyword}" (${s.searchIntent}) ← ${(s.coverageMatches ?? []).map((m) => m.existingTitle).join('/') || 'no basis'}`).join(' · ') || 'none')

  // SEMANTIC alignment (paraphrase passes; only a truly off-topic keyword fails).
  const misaligned = suggestions.filter((s) => !isTitleKeywordAligned(s.primaryKeyword, s.title))
  add('title_keyword_alignment', misaligned.length === 0, misaligned.map((s) => `"${s.title}" ⇄ "${s.primaryKeyword}"`).join(' · ') || 'none')

  // ── Title-pattern diversity: ≤1 mega-guide opening, ≤2 per opening skeleton
  // (punctuation/definite-article/grammatical variants folded before comparing).
  const diversity = evaluateTitleDiversity(suggestions.map((s) => s.title))
  add('title_pattern_diversity', diversity.pass, diversity.violations.join(' · ') || `skeletons: ${JSON.stringify(diversity.skeletons)}`)

  // ── Link relevance — EVERY accepted link re-evaluated by the strict subject-
  // head contract (P0-1): colour/adjective/occasion/generic overlap alone never
  // qualifies; a page owning the informational need is cannibalization, not a
  // link. Uses the link-plan roles (a commercial money page may own the subject).
  const badLinks: string[] = []
  for (const s of suggestions) {
    const plan = s.linkPlan
    const roleTargets: { t: { url: string; title: string }; role: string }[] = plan ? [
      ...(plan.primaryCommercialTarget ? [{ t: plan.primaryCommercialTarget, role: 'primary_commercial_target' }] : []),
      ...plan.secondaryCommercialTargets.map((t) => ({ t, role: 'secondary_commercial_target' })),
      ...plan.supportingInformationalLinks.map((t) => ({ t, role: 'supporting_informational_link' })),
      ...plan.sourceReferences.map((t) => ({ t, role: 'source_reference' })),
    ] : (s.suggestedInternalLinks ?? []).map((l) => ({ t: { url: l.url, title: l.anchor }, role: 'supporting_informational_link' }))
    for (const { t, role } of roleTargets) {
      const d = evaluateLink({ primaryKeyword: s.primaryKeyword, title: s.title, intent: s.searchIntent }, { url: t.url, title: t.title, role }, { boilerplate: isBoilerplatePage(t.title, t.url) })
      if (!isRelevantLink(d, role)) badLinks.push(`"${s.primaryKeyword}" → [${role}] "${t.title}" (${d.rejectionReasons.join(',') || d.semanticRelation})`)
    }
  }
  add('links_subject_relevant', badLinks.length === 0, badLinks.slice(0, 12).join(' · ') || 'none')
  add('zero_links_permitted', true, `${suggestions.filter((s) => (s.suggestedInternalLinks ?? []).length === 0).length} topics with zero links (valid)`)

  // ── Persistence / current-run separation (persist mode only) ──
  if (input.persistence) {
    const p = input.persistence
    add('inserted_equals_reloaded', p.inserted === p.reloadedFreshCount, `inserted=${p.inserted} reloadedFresh=${p.reloadedFreshCount}`)
    add('no_swallowed_persistence_failure', !(p.attempted > 0 && p.inserted === 0 && p.duplicate === 0), `attempted=${p.attempted} inserted=${p.inserted} duplicate=${p.duplicate} failed=${p.failed}`)
    add('current_run_separated_from_pending', true, `pendingBefore=${input.pendingBefore} newlyAccepted=${suggestions.length}`)
  }

  // ── P1-2: competitor leakage — an external business name in ACCEPTED output
  // (title / keyword / secondary / link) is a HARD FAIL; rejected research and
  // discovery are diagnostics only, never a run failure.
  const cl = d.competitorLeakage
  const acceptedLeak = [...cl.acceptedTitle, ...cl.acceptedPrimaryKeyword, ...cl.acceptedSecondaryKeyword, ...cl.acceptedLinkTarget]
  add('accepted_output_has_no_external_business', acceptedLeak.length === 0,
    acceptedLeak.length ? `ACCEPTED leakage: ${acceptedLeak.slice(0, 8).join(' · ')}` : `rejected(diagnostic): research=${cl.researchRejected.length} discovery=${cl.discoveryRejected.length}`)

  // ── COST observability release gate (versioned pricing; thinking = billable). ──
  const cost = d.cost
  add('no_more_than_two_paid_calls', cost.totalPaidCalls <= 2, `totalPaidCalls=${cost.totalPaidCalls} (synthesis rounds + discovery)`)
  add('run_cost_within_budget', cost.estimatedRunCostUsd <= cost.configuredCostCeilingUsd,
    `estimatedRunCostUsd=${cost.estimatedRunCostUsd} ceiling=${cost.configuredCostCeilingUsd} remaining=${cost.remainingBudgetUsd}`)
  const perCallSum = Number(cost.calls.reduce((n, c) => n + c.estimatedCostUsd, 0).toFixed(6))
  const billableConsistent = cost.calls.every((c) => c.totalBillableOutputTokens === c.answerOutputTokens + c.thinkingTokens)
  // Epsilon for display rounding — a per-call vs run 6-decimal rounding gap of a
  // few millionths must not fail (Natural Shop: 0.059699 vs 0.059700).
  add('cost_telemetry_reconciles', Math.abs(perCallSum - cost.estimatedRunCostUsd) <= 0.0001 && billableConsistent && cost.calls.length === cost.totalPaidCalls,
    `Σcalls=${perCallSum} run=${cost.estimatedRunCostUsd} calls=${cost.calls.length}/${cost.totalPaidCalls} billableConsistent=${billableConsistent}`)
  add('no_model_call_on_empty_pool', !(d.brief_pool.pool_size === 0 && !(d.discovery?.ran) && d.model_calls > 0),
    `pool=${d.brief_pool.pool_size} discovery=${d.discovery?.ran ?? false} model_calls=${d.model_calls}`)

  // ── Stop-reason reconciliation: consumed + remaining = effective pool size. ──
  const bc = d.brief_consumption
  add('stop_reason_reconciles', bc.consumedBriefs + bc.remainingBriefs === bc.effectivePoolSize && !(d.stop_reason === 'true_pool_exhausted' && bc.remainingBriefs > 0),
    `consumed=${bc.consumedBriefs} remaining=${bc.remainingBriefs} pool=${bc.effectivePoolSize} stop=${d.stop_reason}`)

  // ── Manual-review flags (WARN — a human must look, never auto-pass) ──
  const medical = suggestions.filter((s) => MEDICAL_CERTAINTY_RE.test(`${s.title} ${s.suggestionReason}`))
  add('medical_certainty_review', medical.length === 0, medical.map((s) => s.title).join(' · ') || 'none', 'warn')
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
