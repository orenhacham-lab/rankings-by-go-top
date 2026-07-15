/**
 * Content-plan + live-regression QA (P0 C/G/H/I + J) — offline, domain-neutral. Covers
 * the batched-plan deterministic core (mode ceilings, diversity allocation, partial/
 * shortfall contract) and the proven live quality regressions J1–J7.
 */
import { planBudget, estimatePlanCost, planCostActuals, resolvePlanMode } from '../recommendations/plan-cost'
import { selectDiverse, DEFAULT_CAPS, type DiversityItem } from '../recommendations/diversity'
import { validatePrimaryKeywordQuality, computeDemandEvidence, finalizeReason, assessCommercialFit, deriveCorpusTypeWords } from '../recommendations/opportunity-validation'
import { mapLinkRoles, type LinkCandidateEntity } from '../recommendations/link-role-mapper'
import { buildBrandSafety, classifyKeywordEntity } from '../recommendations/brand-safety'
import { contentTokens } from '../recommendations/evidence-cluster'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const tokSet = (arr: string[]) => new Set(arr.flatMap((s) => contentTokens(s)))
const item = (o: Partial<DiversityItem> & { key: string; score: number; subjectTokens: string[] }): DiversityItem => ({ entityKey: null, intent: 'informational', opportunityType: 'informational', isSeasonal: false, ...o })

async function main() {
  console.log('H) mode-specific cost ceilings (maximums, not fixed prices)')
  {
    check('quick ceiling <= $0.15', planBudget('quick').maxCostUsd <= 0.15)
    check('plan_25 ceiling <= $0.30 and requests 25', planBudget('plan_25').maxCostUsd <= 0.30 && planBudget('plan_25').requestedTopicCount === 25)
    check('full_calendar_50 ceiling <= $0.50 and requests 50', planBudget('full_calendar_50').maxCostUsd <= 0.50 && planBudget('full_calendar_50').requestedTopicCount === 50)
    check('full_calendar uses batched calls, not one-per-topic', planBudget('full_calendar_50').maxSynthesisCalls <= 3 && planBudget('full_calendar_50').candidatePoolTarget >= 70)
    check('resolvePlanMode maps a 50-count request to full_calendar', resolvePlanMode({ requestedCount: 50 }) === 'full_calendar_50' && resolvePlanMode({ mode: 'plan' }) === 'plan_25')
    const est = estimatePlanCost('full_calendar_50')
    check('estimate exposes calls/max-cost/requested BEFORE execution', est.estimated_max_cost === 0.5 && est.requested_topic_count === 50 && est.estimated_calls >= 1)
    const act = planCostActuals(4, 0.32, 40)
    check('actuals expose cost per ACCEPTED topic', act.cost_per_accepted_topic === Number((0.32 / 40).toFixed(4)) && act.accepted_topic_count === 40)
  }

  console.log('G/I) diversity allocation + partial (shortfall) contract')
  {
    // 6 DISTINCT-need items but 4 share the dominant subject "ורד"; diversity caps it.
    const items: DiversityItem[] = [
      item({ key: 'a', score: 0.9, subjectTokens: ['ורד', 'בחירה'], opportunityType: 'informational' }),
      item({ key: 'b', score: 0.85, subjectTokens: ['ורד', 'השוואה'], intent: 'comparison', opportunityType: 'comparison' }),
      item({ key: 'c', score: 0.8, subjectTokens: ['ורד', 'טיפוח'], opportunityType: 'informational' }),
      item({ key: 'd', score: 0.75, subjectTokens: ['ורד', 'משלוח'], intent: 'local', opportunityType: 'commercial' }),
      item({ key: 'e', score: 0.7, subjectTokens: ['סחלב'], intent: 'commercial', opportunityType: 'commercial' }),
      item({ key: 'f', score: 0.6, subjectTokens: ['עציץ'], intent: 'local', opportunityType: 'commercial' }),
    ]
    const r = selectDiverse(items, 4, { ...DEFAULT_CAPS, maxPerSubject: 2 })
    const roseCount = r.selected.filter((s) => s.subjectTokens[0] === 'ורד').length
    check('G. repeated primary subject is capped (<= 2 roses in a 4-topic plan)', roseCount <= 2 && r.selected.length === 4)
    check('G. distinct subjects (סחלב, עציץ) are included for diversity', r.selected.some((s) => s.subjectTokens[0] === 'סחלב') && r.selected.some((s) => s.subjectTokens[0] === 'עציץ'))
    check('G. distribution diagnostics are returned', Object.keys(r.distribution_by_intent).length >= 1 && Object.keys(r.distribution_by_opportunity_type).length >= 1)
    // Same user-need dedup: two identical (intent+subject) items collapse to one.
    const dup = selectDiverse([item({ key: 'x', score: 0.9, subjectTokens: ['ורד', 'לבן'] }), item({ key: 'y', score: 0.8, subjectTokens: ['לבן', 'ורד'] })], 10)
    check('G. two topics answering the same user need collapse to one', dup.selected.length === 1 && dup.duplicate_clusters_removed === 1)
    // I — request 50 but only 6 safe items exist → return 6, shortfall 44, no padding.
    const partial = selectDiverse(items, 50)
    check('I. partial result returns all safe items, never fabricates weak ones', partial.selected.length === 6)
  }

  console.log('J) proven live quality regressions')
  {
    const typeWords = deriveCorpusTypeWords(['בושם מתוק', 'בושם גברים', 'בושם נשים', 'ניאגרה נמוכה', 'אסלה תלויה'], { minDocs: 2, minFraction: 0.3 })
    // J1 — truncated primary keyword is repaired from the title or rejected.
    const trunc = validatePrimaryKeywordQuality('מדוע נשים בוחרות בשמים מתוקים ואיך', 'בשמים מתוקים לנשים: מדריך בחירה', typeWords)
    check('J1. truncated keyword ("… ואיך") is repaired or rejected', (trunc.ok && !!trunc.repairedKeyword) || !trunc.ok)
    // J2 — a men's-fragrance product must not support a women's-sweet-fragrance topic.
    const j2 = mapLinkRoles('בושם מתוק לנשים', 'בושם מתוק לנשים לערב', [{ url: '/p/men', title: 'בושם גברים קלאסי', type: 'product' }], { corpusTypeWords: typeWords, intent: 'informational' })
    check('J2. gender/intent-inverted product is NOT a target (shares only the type word)', j2.primaryTarget === null && !j2.assignments.some((a) => a.url === '/p/men'))
    // J3 — a topic is never its own supporting link.
    const j3 = mapLinkRoles('טיפוח ורדים בבית', 'טיפוח ורדים בבית', [{ url: '/blog/self', title: 'טיפוח ורדים בבית', type: 'post' }, { url: '/p/rose', title: 'זר ורדים בצבעים', type: 'product' }])
    check('J3. the topic itself is never offered as its own supporting link', !j3.assignments.some((a) => a.url === '/blog/self') && !j3.debug.some((d) => d.url === '/blog/self'))
    // J4 — model demand hype never survives.
    const j4 = finalizeReason('המאמר עונה על ביקוש חיפוש גבוה מאוד ומספק ערך רב', { demandEvidenceAvailable: false, demandQuery: null, avgMonthlySearches: null, demandConfidence: 'none', demandMatchType: 'none' }, 'he')
    check('J4. "ביקוש חיפוש גבוה מאוד" hype is stripped', !/גבוה מאוד|ביקוש/.test(j4))
    // J5 — a topic outside the project's business focus is rejected.
    const j5 = assessCommercialFit('קורס תכנות לילדים', 'איך ללמד ילדים תכנות', tokSet(['בושם מתוק', 'זר ורדים']), tokSet(['בשמים', 'פרחים']), typeWords)
    check('J5. cross-project topic (programming course for a perfume/flower shop) → unsupported_commercial_fit', !j5.ok && j5.reason === 'unsupported_commercial_fit')
    // J6 — broad product-volume must not justify a narrower service/type topic.
    const j6a = computeDemandEvidence('תיקון אסלות סמויות', [], [{ query: 'אסלות סמויות', volume: 1000 }], typeWords)
    check('J6. product volume ("אסלות סמויות") does NOT justify the repair topic (no aligned intent)', !j6a.demandEvidenceAvailable && j6a.demandMatchType !== 'exact')
    const j6b = computeDemandEvidence('סוגי ניאגרות נמוכות', [], [{ query: 'ניאגרות', volume: 500 }], typeWords)
    check('J6. broad "ניאגרות" volume is not attributed to the narrower topic', !j6b.demandEvidenceAvailable)
    // J7 — external-business queries blocked automatically (no manual list).
    const bs = buildBrandSafety({ businessName: 'הבשמים של דנה', entityNames: ['בושם מתוק לנשים', 'בושם גברים', 'בושם ערב'], ownEvidence: ['מדריך בשמים'] })
    check('J7. an external business ("בושם כהן") is blocked automatically', classifyKeywordEntity('בושם כהן תל אביב', bs) === 'suspected_external_business')
    check('J7. the shop\'s own generic subject is allowed', classifyKeywordEntity('בושם מתוק לנשים', bs) === 'generic_query' || classifyKeywordEntity('בושם מתוק לנשים', bs) === 'own_brand')
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}
main()
