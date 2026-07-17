/**
 * Acceptance-rule evaluator QA — each live-acceptance rule must CATCH its
 * defect class and PASS a clean run (the /reco-qa runner's automated core).
 */
import { evaluateRunAcceptance, type RunAcceptanceInput } from '../recommendations/qa-acceptance'
import { evaluateTitleDiversity, titleSkeleton, dedupeMegaGuideTitle } from '../recommendations/title-diversity'
import type { BriefRunDiagnostics } from '../recommendations/generate-from-briefs'
import type { TopicSuggestion } from '../recommendations/types'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

const goodTopic = (kw: string, title: string, extra: Partial<TopicSuggestion> = {}): TopicSuggestion => ({
  id: `opportunity:${kw}`, title, primaryKeyword: kw, secondaryKeywords: [], searchIntent: 'informational',
  recommendedWordCount: 1000, angle: '', suggestedInternalLinks: [], source: 'hybrid',
  suggestionReason: 'הנושא משלים פער תוכן בתחום שהעסק עוסק בו.', suggestionScore: 0.8, ...extra,
})

const cleanDiag = (over: Partial<BriefRunDiagnostics> = {}): BriefRunDiagnostics => ({
  engine: 'evidence_first_briefs',
  modelPath: { requestedTier: 'premium', requestedModel: 'gemini-2.5-pro', model: 'gemini-2.5-pro', tierUsed: 'pro', downgraded: false, downgradeReason: null },
  modelConfig: { model: 'gemini-2.5-pro', thinkingMode: 'budgeted', thinkingBudget: 1024, maxOutputTokens: 3384 },
  evidence_inventory: { project_focus_terms: 1, tracked_keywords: 1, keyword_research_cache_rows: 1, keyword_research_queries: 6, search_volume_values: 5, site_scan_entities: 0, shopify_entities: 6, existing_informational_coverage: 1, pending_topics: 0, generated_articles: 1, competitor_queries_filtered: 0, evidence_load_errors: [], ineligible_pages_excluded: 0, stale_index_excluded: false, kr_rows_loaded: 1, kr_rows_parsed: 1, kr_rows_skipped: 0, kr_items_skipped: 0, kr_skipped_example_keys: [], kr_live_fetched: 0 },
  brief_pool: { raw_query_candidates: 6, raw_theme_candidates: 0, raw_tracked_candidates: 1, total_raw_candidates: 7, rejected_by_reason: { subject_too_generic: 1 }, rejected_examples: [{ subject: 'מגנזיום', reason: 'subject_too_generic', evidenceKind: 'keyword_research' }], pool_size: 6, by_family: { informational: 6 }, with_demand: 5 },
  rounds: [{ round: 1, model: 'gemini-2.5-pro', briefs_sent: 6, provider_ok: true, provider_failed_briefs: 0, providerStatus: 'ok', providerErrorType: null, sanitizedProviderMessage: null, finishReason: 'STOP', textPresent: true, textLength: 1200, emitted: 6, polished: 5, skipped_by_model: 1, missing_from_response: 0, dropped_items: 0, accepted: 5, repaired: 0, rejected_by_reason: {}, marginal_yield: 0.833, synthesis_failure: null, synthesisResponse: null }],
  discovery: null,
  rejected_by_reason: {}, shadow_rejected_by_reason: {}, generated_opportunities: 5, finalCount: 5, model_calls: 1,
  stop_reason: 'true_pool_exhausted', insufficient_inventory: false, secondary_keywords_filtered: 0, target_role_mappings: [],
  brief_consumption: { effectivePoolSize: 6, consumedBriefs: 6, remainingBriefs: 0, callsRemaining: 1 },
  competitorLeakage: { researchRejected: [], discoveryRejected: [], briefRejected: [], acceptedTitle: [], acceptedPrimaryKeyword: [], acceptedSecondaryKeyword: [], acceptedLinkTarget: [], acceptedMatches: [] },
  cost: { totalCalls: 1, calls: [{ model: 'gemini-2.5-pro', source: 'brief_synthesis', callPurpose: 'primary', inputTokens: 1000, answerOutputTokens: 400, thinkingTokens: 1024, totalBillableOutputTokens: 1424, estimatedCostUsd: 0.02, success: true }], totalPaidCalls: 1, estimatedRunCostUsd: 0.02, estimatedRunCostIls: 0.074, costPerAcceptedTopic: 0.004, configuredCostCeilingUsd: 0.5, remainingBudgetUsd: 0.48, callsPreventedByBudget: 0, configuredMaxCalls: 6 },
  ...over,
})

const base = (over: Partial<RunAcceptanceInput> = {}): RunAcceptanceInput => ({
  tierRequested: 'premium',
  diagnostics: cleanDiag(),
  suggestions: [
    goodTopic('מגנזיום לילדים מינון', 'המדריך המלא: מינון מגנזיום לילדים'),
    goodTopic('אנזימי עיכול טבעיים', 'אנזימי עיכול טבעיים: מה חשוב לדעת'),
    goodTopic('ויטמין C לילדים', 'ויטמין C לילדים — כמה ומתי', { demandEvidence: { demandEvidenceAvailable: true, demandQuery: 'ויטמין C לילדים', avgMonthlySearches: 500, demandConfidence: 'high', demandMatchType: 'exact' }, suggestionReason: 'הנושא משלים פער תוכן בתחום שהעסק עוסק בו. לפי מחקר מילות מפתח, ל"ויטמין C לילדים" יש כ־500 חיפושים חודשיים.' }),
    goodTopic('יתרונות אומגה 3', 'יתרונות אומגה 3 לגוף'),
    goodTopic('חיזוק מערכת החיסון בחורף', 'איך לחזק את מערכת החיסון בחורף'),
  ],
  pendingBefore: 3,
  ...over,
})

async function main() {
  console.log('A) a clean premium run PASSES every rule')
  {
    const r = evaluateRunAcceptance(base())
    check('clean run passes with verdict PASS', r.passed && r.verdict === 'PASS', JSON.stringify(r.rules.filter((x) => !x.pass)))
    check('no warnings on a clean run', r.warnings === 0)
  }

  console.log('B) each defect class FAILS its rule')
  {
    const failsRule = (input: RunAcceptanceInput, ruleId: string): boolean => {
      const r = evaluateRunAcceptance(input)
      const rule = r.rules.find((x) => x.id === ruleId)
      return !!rule && !rule.pass && !r.passed
    }
    check('premium on Flash (downgrade) → premium_uses_real_pro FAILS', failsRule(base({ diagnostics: cleanDiag({ modelPath: { requestedTier: 'premium', requestedModel: 'gemini-2.5-pro', model: 'gemini-2.5-flash', tierUsed: 'flash', downgraded: true, downgradeReason: 'premium_model_unavailable' } }) }), 'premium_uses_real_pro'))
    check('3 calls → max_two_synthesis_calls FAILS', failsRule(base({ diagnostics: cleanDiag({ model_calls: 3 }) }), 'max_two_synthesis_calls'))
    check('broken round math → exact_reconciliation FAILS', failsRule(base({ diagnostics: cleanDiag({ rounds: [{ round: 1, model: 'x', briefs_sent: 6, provider_ok: true, provider_failed_briefs: 0, providerStatus: 'ok', providerErrorType: null, sanitizedProviderMessage: null, finishReason: 'STOP', textPresent: true, textLength: 900, emitted: 6, polished: 5, skipped_by_model: 0, missing_from_response: 0, dropped_items: 0, accepted: 3, rejected_by_reason: {}, repaired: 0, marginal_yield: 0.5, synthesis_failure: null, synthesisResponse: null }] }) }), 'exact_reconciliation'))
    check('truncated keyword → no_truncated_keyword FAILS', failsRule(base({ suggestions: [goodTopic('זר פרחים ואיך', 'זר פרחים ואיך לבחור')] , diagnostics: cleanDiag({ brief_pool: { ...cleanDiag().brief_pool, pool_size: 1 } })}), 'no_truncated_keyword'))
    check('malformed reason → no_malformed_reason FAILS', failsRule(base({ suggestions: [goodTopic('מגנזיום לילדים מינון', 'מדריך', { suggestionReason: 'נושא זה עונה על של' })], diagnostics: cleanDiag({ brief_pool: { ...cleanDiag().brief_pool, pool_size: 1 } }) }), 'no_malformed_reason'))
    check('invented demand → no_invented_demand FAILS', failsRule(base({ suggestions: [goodTopic('מותג דיור', 'מותג דיור מוביל', { suggestionReason: 'מותג דיור של אלפי חיפושים בחודש.' })], diagnostics: cleanDiag({ brief_pool: { ...cleanDiag().brief_pool, pool_size: 1 } }) }), 'no_invented_demand'))
    check('volume claim without own aligned query → no_invented_demand FAILS', failsRule(base({ suggestions: [goodTopic('נושא צר', 'נושא צר', { suggestionReason: 'לפי מחקר מילות מפתח, ל"שאילתה רחבה" יש כ־2000 חיפושים חודשיים.' })], diagnostics: cleanDiag({ brief_pool: { ...cleanDiag().brief_pool, pool_size: 1 } }) }), 'no_invented_demand'))
    check('duplicate pair → no_duplicate_pair FAILS', failsRule(base({ suggestions: [goodTopic('מגנזיום לילדים', 'מגנזיום לילדים'), goodTopic('מינון מגנזיום לילדים', 'מינון מגנזיום לילדים')] }), 'no_duplicate_pair'))
    check('shoes keyword on suit title → title_keyword_alignment FAILS', failsRule(base({ suggestions: [goodTopic('נעלים לחתן', 'איך לבחור חליפת חתן לחתונה')], diagnostics: cleanDiag({ brief_pool: { ...cleanDiag().brief_pool, pool_size: 1 } }) }), 'title_keyword_alignment'))
    check('boilerplate link → links_subject_relevant FAILS', failsRule(base({ suggestions: [goodTopic('מגנזיום לילדים מינון', 'מינון מגנזיום לילדים', { suggestedInternalLinks: [{ url: '/pages/privacy-policy', anchor: 'מדיניות פרטיות' }] })] }), 'links_subject_relevant'))
    check('off-subject link → links_subject_relevant FAILS', failsRule(base({ suggestions: [goodTopic('מגנזיום לילדים מינון', 'מינון מגנזיום לילדים', { suggestedInternalLinks: [{ url: '/b/pest', anchor: 'הדברה ירוקה לבית' }] })] }), 'links_subject_relevant'))
    check('filler on empty pool → no_filler_on_empty_pool FAILS', failsRule(base({ diagnostics: cleanDiag({ brief_pool: { ...cleanDiag().brief_pool, pool_size: 0 } }) }), 'no_filler_on_empty_pool'))
    check('inserted != reloaded → inserted_equals_reloaded FAILS', failsRule(base({ persistence: { attempted: 5, inserted: 5, duplicate: 0, failed: 0, reloadedFreshCount: 3 } }), 'inserted_equals_reloaded'))
    check('swallowed persistence failure → FAILS', failsRule(base({ persistence: { attempted: 5, inserted: 0, duplicate: 0, failed: 5, reloadedFreshCount: 0 } }), 'no_swallowed_persistence_failure'))
  }

  console.log('C) three-way verdicts — an empty pool is NEVER a green PASS')
  {
    // FULLY-EXPLAINED empty pool: accounting reconciles, every candidate typed,
    // loads clean → INSUFFICIENT_INVENTORY (amber), never PASS and never FAIL.
    const explainedEmptyPool = { raw_query_candidates: 6, raw_theme_candidates: 0, raw_tracked_candidates: 1, total_raw_candidates: 7, rejected_by_reason: { pending_exact_duplicate: 3, covered_by_existing_content: 2, subject_too_generic: 2 }, rejected_examples: [{ subject: 'א', reason: 'pending_exact_duplicate', evidenceKind: 'keyword_research' }], pool_size: 0, by_family: {}, with_demand: 0 }
    const r = evaluateRunAcceptance(base({ suggestions: [], diagnostics: cleanDiag({ brief_pool: explainedEmptyPool, rounds: [], model_calls: 0, stop_reason: 'insufficient_inventory', insufficient_inventory: true, generated_opportunities: 0, finalCount: 0 }) }))
    check('fully-explained empty pool → INSUFFICIENT_INVENTORY (not PASS, not FAIL)', r.verdict === 'INSUFFICIENT_INVENTORY' && !r.passed && r.rules.filter((x) => x.level === 'fail' && !x.pass).length === 0, JSON.stringify({ v: r.verdict, failed: r.rules.filter((x) => !x.pass).map((x) => x.id) }))

    // KR evidence exists but produced ZERO raw query candidates → FAIL (Natural-Shop class).
    const noRawPool = { ...explainedEmptyPool, raw_query_candidates: 0, total_raw_candidates: 1, rejected_by_reason: { subject_too_generic: 1 } }
    const rNoRaw = evaluateRunAcceptance(base({ suggestions: [], diagnostics: cleanDiag({ brief_pool: noRawPool, rounds: [], model_calls: 0, stop_reason: 'insufficient_inventory', insufficient_inventory: true, generated_opportunities: 0, finalCount: 0 }) }))
    check('kr evidence with ZERO raw query candidates → verdict FAIL', rNoRaw.verdict === 'FAIL' && rNoRaw.rules.find((x) => x.id === 'raw_query_candidates_expected')?.pass === false)

    // Raw candidates that do NOT reconcile → FAIL.
    const brokenPool = { ...explainedEmptyPool, total_raw_candidates: 12 }
    const rBroken = evaluateRunAcceptance(base({ suggestions: [], diagnostics: cleanDiag({ brief_pool: brokenPool, rounds: [], model_calls: 0, stop_reason: 'insufficient_inventory', insufficient_inventory: true, generated_opportunities: 0, finalCount: 0 }) }))
    check('non-reconciling pool accounting → verdict FAIL', rBroken.verdict === 'FAIL' && rBroken.rules.find((x) => x.id === 'pool_accounting_reconciles')?.pass === false)

    // Pool emptied MAINLY by the broad semantic rule → FAIL (review required).
    const semanticPool = { ...explainedEmptyPool, rejected_by_reason: { pending_semantic_duplicate: 5, subject_too_generic: 2 } }
    const rSem = evaluateRunAcceptance(base({ suggestions: [], diagnostics: cleanDiag({ brief_pool: semanticPool, rounds: [], model_calls: 0, stop_reason: 'insufficient_inventory', insufficient_inventory: true, generated_opportunities: 0, finalCount: 0 }) }))
    check('pool emptied mainly by semantic rule → verdict FAIL (reviewable)', rSem.verdict === 'FAIL' && rSem.rules.find((x) => x.id === 'empty_pool_not_semantic_emptied')?.pass === false)

    // Evidence load failure on an empty pool → FAIL.
    const rLoad = evaluateRunAcceptance(base({ suggestions: [], diagnostics: cleanDiag({ brief_pool: explainedEmptyPool, rounds: [], model_calls: 0, stop_reason: 'insufficient_inventory', insufficient_inventory: true, generated_opportunities: 0, finalCount: 0, evidence_inventory: { ...cleanDiag().evidence_inventory, evidence_load_errors: ['keyword_research_cache:timeout'] } }) }))
    check('evidence load failure on empty pool → verdict FAIL', rLoad.verdict === 'FAIL' && rLoad.rules.find((x) => x.id === 'empty_pool_loads_clean')?.pass === false)

    // Provider failure → FAIL with exact provider bucket accounting.
    const pfRound = { round: 1, model: 'gemini-2.5-pro', briefs_sent: 18, provider_ok: false, provider_failed_briefs: 18, providerStatus: 'error', providerErrorType: 'invalid_model_configuration', sanitizedProviderMessage: 'Budget 0 is invalid. This model only works in thinking mode.', finishReason: null, textPresent: false, textLength: 0, emitted: 0, polished: 0, skipped_by_model: 0, missing_from_response: 0, dropped_items: 0, accepted: 0, repaired: 0, rejected_by_reason: {}, marginal_yield: 0, synthesis_failure: null, synthesisResponse: null }
    const rPf = evaluateRunAcceptance(base({ suggestions: [], diagnostics: cleanDiag({ rounds: [pfRound], model_calls: 1, stop_reason: 'provider_failed', generated_opportunities: 0, finalCount: 0 }) }))
    check('provider failure → verdict FAIL, reconciliation INTACT via provider bucket', rPf.verdict === 'FAIL' && rPf.rules.find((x) => x.id === 'provider_no_failure')?.pass === false && rPf.rules.find((x) => x.id === 'exact_reconciliation')?.pass === true, JSON.stringify(rPf.rules.filter((x) => !x.pass).map((x) => x.id)))
    const warn = evaluateRunAcceptance(base({ suggestions: [goodTopic('ויטמין D', 'ויטמין D מונע מחלות קשות', { suggestionReason: 'הנושא משלים פער תוכן בתחום שהעסק עוסק בו.' })], diagnostics: cleanDiag({ brief_pool: { raw_query_candidates: 2, raw_theme_candidates: 0, raw_tracked_candidates: 0, total_raw_candidates: 2, rejected_by_reason: { subject_too_generic: 1 }, rejected_examples: [], pool_size: 1, by_family: { informational: 1 }, with_demand: 0 } }) }))
    check('medical certainty ("מונע מחלות") → WARN, not auto-fail', warn.passed && warn.warnings >= 1, JSON.stringify(warn.rules.filter((x) => !x.pass)))
  }

  console.log('D) title-pattern diversity (title_pattern_diversity)')
  {
    const failsRule = (input: RunAcceptanceInput, ruleId: string): boolean => {
      const r = evaluateRunAcceptance(input)
      const rule = r.rules.find((x) => x.id === ruleId)
      return !!rule && !rule.pass && !r.passed
    }
    const topicFor = (i: number, title: string) => goodTopic(`נושא בדיקה מספר ${i}`, title)

    // 7a — EIGHT titles on ONE repeated template must FAIL.
    const oneTemplate = Array.from({ length: 8 }, (_, i) => topicFor(i, `המדריך המלא: נושא בדיקה מספר ${i}`))
    check('8× "המדריך המלא: …" → title_pattern_diversity FAILS', failsRule(base({ suggestions: oneTemplate, diagnostics: cleanDiag({ brief_pool: { ...cleanDiag().brief_pool, pool_size: 8 } }) }), 'title_pattern_diversity'))

    // 7b — a NATURALLY VARIED eight-title batch must PASS the diversity rule
    // (distinct subjects, distinct structures — question/mistakes/myths/how-to-
    // choose/comparison/steps/why/one mega-guide).
    const varied = [
      ['מינון מגנזיום לילדים', 'המדריך המלא: מינון מגנזיום לילדים'],
      ['אבקת חלבון צמחית', 'אבקת חלבון צמחית: שאלות ותשובות'],
      ['אנזימי עיכול טבעיים', 'אנזימי עיכול טבעיים — טעויות נפוצות שכדאי להכיר'],
      ['יתרונות אומגה 3', 'יתרונות אומגה 3: מיתוסים ועובדות'],
      ['איך לבחור ויטמין C לילדים', 'איך לבחור ויטמין C לילדים'],
      ['הבדל בין ציטראט לביסגליצינט', 'מה ההבדל בין ציטראט לביסגליצינט'],
      ['חיזוק מערכת החיסון בחורף', 'חיזוק מערכת החיסון בחורף: צעד אחר צעד'],
      ['שמן קוקוס לעור', 'למה שמן קוקוס לעור עובד באמת'],
    ].map(([kw, t]) => goodTopic(kw, t))
    const rv = evaluateRunAcceptance(base({ suggestions: varied, diagnostics: cleanDiag({ brief_pool: { ...cleanDiag().brief_pool, pool_size: 8 } }) }))
    check('naturally varied 8-title batch → diversity PASSES', rv.rules.find((x) => x.id === 'title_pattern_diversity')?.pass === true, rv.rules.find((x) => x.id === 'title_pattern_diversity')?.detail)

    // 7c — HEBREW VARIANTS of one skeleton are still ONE skeleton (detected).
    check('skeleton folding: "איך לבחור" ≡ "כיצד בוחרים" ≡ "איך בוחרים"',
      titleSkeleton('איך לבחור זר כלה') === titleSkeleton('כיצד בוחרים זר לאירוע') && titleSkeleton('איך בוחרים עציץ למרפסת') === titleSkeleton('איך לבחור זר כלה'))
    check('skeleton folding: "המדריך המלא" ≡ "מדריך מלא" ≡ "כל מה שכדאי לדעת"',
      titleSkeleton('המדריך המלא: ורדים') === 'mega_guide' && titleSkeleton('מדריך מלא לגידול ורדים') === 'mega_guide' && titleSkeleton('כל מה שכדאי לדעת על ורדים') === 'mega_guide')
    check('skeleton folding: "מה ההבדל בין" ≡ "ההבדלים בין" (punctuation/article folded)',
      titleSkeleton('מה ההבדל בין סחלב לאנתוריום?') === titleSkeleton('ההבדלים בין מגנזיום ציטראט לביסגליצינט'))
    const variants3 = [
      topicFor(0, 'איך לבחור זר כלה לחתונה'),
      topicFor(1, 'כיצד בוחרים עציץ פורח למרפסת'),
      topicFor(2, 'איך בוחרים אגרטל מתאים לזר'),
    ]
    check('3 Hebrew variants of one skeleton → diversity FAILS', failsRule(base({ suggestions: variants3, diagnostics: cleanDiag({ brief_pool: { ...cleanDiag().brief_pool, pool_size: 3 } }) }), 'title_pattern_diversity'))

    // 7d — diverse wording with a title/keyword MISMATCH still fails alignment.
    const diverseButMisaligned = [
      goodTopic('נעלים לחתן', 'איך לבחור חליפת חתן לחתונה'),
      goodTopic('זר כלה קלאסי', 'זר כלה קלאסי: מיתוסים ועובדות'),
    ]
    const rm = evaluateRunAcceptance(base({ suggestions: diverseButMisaligned, diagnostics: cleanDiag({ brief_pool: { ...cleanDiag().brief_pool, pool_size: 2 } }) }))
    check('diverse wording + keyword mismatch → title_keyword_alignment still FAILS', rm.rules.find((x) => x.id === 'title_keyword_alignment')?.pass === false && rm.rules.find((x) => x.id === 'title_pattern_diversity')?.pass === true, JSON.stringify(rm.rules.filter((x) => !x.pass).map((x) => x.id)))

    // Rule 4 — de-templating is SAFE, never artificial.
    check('2nd mega-guide title is reduced to its standalone core (subject preserved)',
      dedupeMegaGuideTitle('המדריך המלא: מינון מגנזיום לילדים', ['המדריך המלא: ויטמין C לילדים']) === 'מינון מגנזיום לילדים')
    check('FIRST mega-guide title is left untouched', dedupeMegaGuideTitle('המדריך המלא: מינון מגנזיום לילדים', ['נושא אחר לגמרי']) === 'המדריך המלא: מינון מגנזיום לילדים')
    check('a short core is NOT stripped (no awkward 2-word titles)', dedupeMegaGuideTitle('המדריך המלא: זר כלה', ['המדריך המלא: אחר לגמרי כאן']) === 'המדריך המלא: זר כלה')
  }

  console.log('E) stop-reason + cost gates')
  {
    const failsRule = (input: RunAcceptanceInput, ruleId: string): boolean => {
      const r = evaluateRunAcceptance(input)
      const rule = r.rules.find((x) => x.id === ruleId)
      return !!rule && !rule.pass
    }
    // pool=80, sent=24, cap=2 → call_cap_reached (NOT pool_exhausted); reconciles.
    const callCap = evaluateRunAcceptance(base({ diagnostics: cleanDiag({ stop_reason: 'call_cap_reached', model_calls: 2, brief_consumption: { effectivePoolSize: 80, consumedBriefs: 24, remainingBriefs: 56, callsRemaining: 0 } }) }))
    check('call_cap_reached with remaining briefs PASSES stop_reason_reconciles', callCap.rules.find((x) => x.id === 'stop_reason_reconciles')?.pass === true, JSON.stringify(callCap.rules.filter((x) => !x.pass).map((x) => x.id)))
    check('call_cap_reached run overall PASS (not a failure)', callCap.verdict === 'PASS')
    // A FALSE true_pool_exhausted (remaining>0) must FAIL reconciliation.
    check('true_pool_exhausted with remaining briefs → stop_reason_reconciles FAILS', failsRule(base({ diagnostics: cleanDiag({ stop_reason: 'true_pool_exhausted', brief_consumption: { effectivePoolSize: 80, consumedBriefs: 24, remainingBriefs: 56, callsRemaining: 0 } }) }), 'stop_reason_reconciles'))
    // Cost gates.
    check('3 paid calls → no_more_than_two_paid_calls FAILS', failsRule(base({ diagnostics: cleanDiag({ cost: { ...cleanDiag().cost, totalPaidCalls: 3 } }) }), 'no_more_than_two_paid_calls'))
    check('over-budget → run_cost_within_budget FAILS', failsRule(base({ diagnostics: cleanDiag({ cost: { ...cleanDiag().cost, estimatedRunCostUsd: 0.9, configuredCostCeilingUsd: 0.5 } }) }), 'run_cost_within_budget'))
    check('per-call sum ≠ run cost → cost_telemetry_reconciles FAILS', failsRule(base({ diagnostics: cleanDiag({ cost: { ...cleanDiag().cost, estimatedRunCostUsd: 0.99 } }) }), 'cost_telemetry_reconciles'))
    check('thinking counted as billable output (telemetry reconciles clean)', evaluateRunAcceptance(base()).rules.find((x) => x.id === 'cost_telemetry_reconciles')?.pass === true)
    // Accepted external-business leakage → hard FAIL; rejected research is diagnostic.
    check('external business in ACCEPTED title → accepted_output_has_no_external_business FAILS', failsRule(base({ diagnostics: cleanDiag({ competitorLeakage: { ...cleanDiag().competitorLeakage, acceptedTitle: ['סוכנות מתחרה בע"מ'] } }) }), 'accepted_output_has_no_external_business'))
    check('competitor terms only in REJECTED research → still PASS (diagnostic)', evaluateRunAcceptance(base({ diagnostics: cleanDiag({ competitorLeakage: { ...cleanDiag().competitorLeakage, researchRejected: ['מתחרה א', 'מתחרה ב'] } }) })).rules.find((x) => x.id === 'accepted_output_has_no_external_business')?.pass === true)
    // Headline keyword + link/cannibalization rules.
    check('headline primary keyword → primary_keyword_search_phrase_quality FAILS', failsRule(base({ suggestions: [goodTopic('מהו מסמך אפיון ואיך הוא תורם להצלחת הפרויקט?', 'מהו מסמך אפיון')], diagnostics: cleanDiag({ brief_pool: { ...cleanDiag().brief_pool, pool_size: 1 } }) }), 'primary_keyword_search_phrase_quality'))
    check('colour-only link → links_subject_relevant FAILS', failsRule(base({ suggestions: [goodTopic('ורדים ורודים', 'איך לשמור על ורדים ורודים', { linkPlan: { primaryCommercialTarget: null, secondaryCommercialTargets: [{ url: '/p/orchid', title: 'סחלב ורוד מרהיב', pageType: 'product', role: 'secondary_commercial_target', score: 1, reason: 'x' }], supportingInformationalLinks: [], sourceReferences: [] }, suggestedInternalLinks: [{ url: '/p/orchid', anchor: 'סחלב ורוד מרהיב' }] })], diagnostics: cleanDiag({ brief_pool: { ...cleanDiag().brief_pool, pool_size: 1 } }) }), 'links_subject_relevant'))
    check('existing-need cannibalization → no_existing_need_cannibalization FAILS', failsRule(base({ suggestions: [goodTopic('תוספי מזון מומלצים', 'תוספי מזון מומלצים', { coverageMatches: [{ existingTitle: 'תוספי תזונה מומלצים', url: '/s', matchType: 'owns_need', score: 0.9, sharedNeed: ['תוספ'] }] })], diagnostics: cleanDiag({ brief_pool: { ...cleanDiag().brief_pool, pool_size: 1 } }) }), 'no_existing_need_cannibalization'))
    // ROUND-5 EXACT live pair: the wedding-floral pricing topic accepted as a
    // SEPARATE landing page while "כמה עולה עיצוב פרחוני לחתונה …" owns the need.
    const wfCoverage = [{ existingTitle: 'כמה עולה עיצוב פרחוני לחתונה? המדריך המלא לתקציב פרחים', url: '/wedding-floral-budget', matchType: 'owns_need' as const, score: 0.75, sharedNeed: ['פרח', 'חתונה'] }]
    const wfTopic = (over: Partial<TopicSuggestion> = {}) => goodTopic('מחיר סידור פרחים לחתונה', 'כמה עולה סידור פרחים לחתונה? פירוט מחירים וטיפים לחיסכון', { searchIntent: 'transactional', coverageMatches: wfCoverage, ...over })
    check('Flowers LIVE: owns_need topic as a NEW landing page → no_existing_need_cannibalization FAILS', failsRule(base({ suggestions: [wfTopic()], diagnostics: cleanDiag({ brief_pool: { ...cleanDiag().brief_pool, pool_size: 1 } }) }), 'no_existing_need_cannibalization'))
    check('Flowers LIVE: same topic CONVERTED to existing_page_improvement → rule PASSES', evaluateRunAcceptance(base({ suggestions: [wfTopic({ recommendedPageType: 'existing_page_improvement' })], diagnostics: cleanDiag({ brief_pool: { ...cleanDiag().brief_pool, pool_size: 1 } }) })).rules.find((x) => x.id === 'no_existing_need_cannibalization')?.pass === true)

    // ── LAST-MILE: existing_page_improvement must have a VALID semantic basis ──
    const onlyPool1 = cleanDiag({ brief_pool: { ...cleanDiag().brief_pool, pool_size: 1 } })
    // BUG1 — attribute-only (colour) ownership → invalid basis → FAILS.
    check('BUG1: improvement owned only by a shared COLOUR → existing_page_improvement_valid_basis FAILS',
      failsRule(base({ suggestions: [goodTopic('ורדים ורודים', 'ורדים ורודים', { recommendedPageType: 'existing_page_improvement', coverageMatches: [{ existingTitle: 'אנטוריום ורוד', url: null, matchType: 'owns_need', score: 0.67, sharedNeed: ['ורוד'] }] })], diagnostics: onlyPool1 }), 'existing_page_improvement_valid_basis'))
    // BUG2 — different-place local ownership (shared "בית" only) → invalid → FAILS.
    check('BUG2: local improvement owned by a DIFFERENT place → existing_page_improvement_valid_basis FAILS',
      failsRule(base({ suggestions: [goodTopic('משלוח פרחים בבית שמש', 'משלוח פרחים בבית שמש', { searchIntent: 'local', recommendedPageType: 'existing_page_improvement', coverageMatches: [{ existingTitle: 'בית וגן ירושלים', url: null, matchType: 'improve', score: 0.5, sharedNeed: [] }] })], diagnostics: onlyPool1 }), 'existing_page_improvement_valid_basis'))
    // An improvement with NO recorded basis is also invalid.
    check('improvement with NO coverage basis → existing_page_improvement_valid_basis FAILS',
      failsRule(base({ suggestions: [goodTopic('משלוח פרחים בבית שמש', 'משלוח פרחים בבית שמש', { searchIntent: 'local', recommendedPageType: 'existing_page_improvement', coverageMatches: [] })], diagnostics: onlyPool1 }), 'existing_page_improvement_valid_basis'))
    // VALID cases still PASS: head-overlap improvement (need) + same-place local improvement.
    check('VALID need improvement (shared head פרח/חתונה) → rule PASSES', evaluateRunAcceptance(base({ suggestions: [wfTopic({ recommendedPageType: 'existing_page_improvement' })], diagnostics: onlyPool1 })).rules.find((x) => x.id === 'existing_page_improvement_valid_basis')?.pass === true)
    check('VALID same-place local improvement (containment) → rule PASSES', evaluateRunAcceptance(base({ suggestions: [goodTopic('משלוח פרחים בבית שמש', 'משלוח פרחים בבית שמש', { searchIntent: 'local', recommendedPageType: 'existing_page_improvement', coverageMatches: [{ existingTitle: 'פרחים בית שמש', url: null, matchType: 'improve', score: 1, sharedNeed: [] }] })], diagnostics: onlyPool1 })).rules.find((x) => x.id === 'existing_page_improvement_valid_basis')?.pass === true)

    // ── FINAL precision: synonym/near-identical cannibalization + action-class ──
    // ISSUE 3A — synonym need (מזון≈תזונה) accepted as a new page → FAILS.
    check('Issue3A: "תוספי מזון" (new page) owned by "תוספי תזונה" → no_existing_need_cannibalization FAILS',
      failsRule(base({ suggestions: [goodTopic('תוספי מזון מומלצים', 'תוספי מזון מומלצים', { coverageMatches: [{ existingTitle: 'תוספי תזונה מומלצים', url: '/s', matchType: 'owns_need', score: 0.9, sharedNeed: ['תוספ'] }] })], diagnostics: onlyPool1 }), 'no_existing_need_cannibalization'))
    // ISSUE 3B — near-identical natural-products page accepted as a new page → FAILS.
    check('Issue3B: near-identical natural-products topic as a new page → no_existing_need_cannibalization FAILS',
      failsRule(base({ suggestions: [goodTopic('מוצרים וטיפולים טבעיים', 'לחזור לטבע: כיצד מוצרים וטיפולים טבעיים תורמים לבריאות הגוף והנפש', { coverageMatches: [{ existingTitle: 'לחזור לטבע: היתרונות הברורים של טיפולים ומוצרים טבעיים לגוף ולנפש', url: '/n', matchType: 'owns_need', score: 0.8, sharedNeed: ['טיפול', 'טבעי'] }] })], diagnostics: onlyPool1 }), 'no_existing_need_cannibalization'))
    // ISSUE 4 — build-vs-promote improvement (action-incompatible basis) → FAILS.
    check('Issue4: "הקמת חנות" improved-by "קידום חנות" (build≠promote) → existing_page_improvement_valid_basis FAILS',
      failsRule(base({ suggestions: [goodTopic('הקמת חנות אינטרנטית', 'הקמת חנות אינטרנטית', { searchIntent: 'transactional', recommendedPageType: 'existing_page_improvement', coverageMatches: [{ existingTitle: 'קידום חנות וירטואלית', url: '/c', matchType: 'improve', score: 0.6, sharedNeed: ['חנות'] }] })], diagnostics: onlyPool1 }), 'existing_page_improvement_valid_basis'))
    // ISSUE 5 — headline keyword with a "המדריך ל…" tail → search-phrase FAILS.
    check('Issue5: "ויטמין D המדריך להשוואת סוגים ומינונים" → primary_keyword_search_phrase_quality FAILS',
      failsRule(base({ suggestions: [goodTopic('ויטמין D המדריך להשוואת סוגים ומינונים', 'השוואת סוגי ויטמין D')], diagnostics: onlyPool1 }), 'primary_keyword_search_phrase_quality'))
    // NS-1 — a subjectless year residue must FAIL final_keyword_preserves_brief_subject.
    check('NS1: accepted keyword "שנת 2026" → final_keyword_preserves_brief_subject FAILS',
      failsRule(base({ suggestions: [goodTopic('שנת 2026', 'איך לבחור ויטמין D מומלץ? המדריך לשנת 2026')], diagnostics: onlyPool1 }), 'final_keyword_preserves_brief_subject'))
    check('NS1: a real subject keyword PASSES the rule', evaluateRunAcceptance(base({ suggestions: [goodTopic('ויטמין D מומלץ', 'איך לבחור ויטמין D מומלץ')], diagnostics: onlyPool1 })).rules.find((x) => x.id === 'final_keyword_preserves_brief_subject')?.pass === true)
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}
main()
