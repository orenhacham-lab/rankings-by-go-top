/**
 * Acceptance-rule evaluator QA — each live-acceptance rule must CATCH its
 * defect class and PASS a clean run (the /reco-qa runner's automated core).
 */
import { evaluateRunAcceptance, type RunAcceptanceInput } from '../recommendations/qa-acceptance'
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
  evidence_inventory: { project_focus_terms: 1, tracked_keywords: 1, keyword_research_cache_rows: 1, keyword_research_queries: 6, search_volume_values: 5, site_scan_entities: 0, shopify_entities: 6, existing_informational_coverage: 1, pending_topics: 0, generated_articles: 1, competitor_queries_filtered: 0, evidence_load_errors: [], ineligible_pages_excluded: 0, stale_index_excluded: false },
  brief_pool: { raw_query_candidates: 6, raw_theme_candidates: 0, raw_tracked_candidates: 1, rejected_by_reason: {}, pool_size: 6, by_family: { informational: 6 }, with_demand: 5 },
  rounds: [{ round: 1, model: 'gemini-2.5-pro', briefs_sent: 6, provider_ok: true, emitted: 6, polished: 5, skipped_by_model: 1, missing_from_response: 0, dropped_items: 0, accepted: 5, repaired: 0, rejected_by_reason: {}, marginal_yield: 0.833 }],
  rejected_by_reason: {}, shadow_rejected_by_reason: {}, generated_opportunities: 5, finalCount: 5, model_calls: 1,
  stop_reason: 'pool_exhausted', insufficient_inventory: false, secondary_keywords_filtered: 0, target_role_mappings: [],
  cost: { estimatedRunCostUsd: 0.02, totalCalls: 1 },
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
    check('clean run passes', r.passed, JSON.stringify(r.rules.filter((x) => !x.pass)))
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
    check('broken round math → exact_reconciliation FAILS', failsRule(base({ diagnostics: cleanDiag({ rounds: [{ round: 1, model: 'x', briefs_sent: 6, provider_ok: true, emitted: 6, polished: 5, skipped_by_model: 0, missing_from_response: 0, dropped_items: 0, accepted: 3, rejected_by_reason: {}, repaired: 0, marginal_yield: 0.5 }] }) }), 'exact_reconciliation'))
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

  console.log('C) truthful insufficient inventory + warns')
  {
    const r = evaluateRunAcceptance(base({ suggestions: [], diagnostics: cleanDiag({ brief_pool: { ...cleanDiag().brief_pool, pool_size: 0 }, rounds: [], model_calls: 0, stop_reason: 'insufficient_inventory', insufficient_inventory: true, generated_opportunities: 0, finalCount: 0 }) }))
    check('empty pool with truthful stop PASSES (no filler demanded)', r.passed, JSON.stringify(r.rules.filter((x) => !x.pass)))
    const warn = evaluateRunAcceptance(base({ suggestions: [goodTopic('ויטמין D', 'ויטמין D מונע מחלות קשות', { suggestionReason: 'הנושא משלים פער תוכן בתחום שהעסק עוסק בו.' })], diagnostics: cleanDiag({ brief_pool: { ...cleanDiag().brief_pool, pool_size: 1 } }) }))
    check('medical certainty ("מונע מחלות") → WARN, not auto-fail', warn.passed && warn.warnings >= 1, JSON.stringify(warn.rules.filter((x) => !x.pass)))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}
main()
