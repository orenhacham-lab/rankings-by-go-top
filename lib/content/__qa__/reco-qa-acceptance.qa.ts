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

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}
main()
