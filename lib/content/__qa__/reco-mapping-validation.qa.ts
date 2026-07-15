/**
 * Mapping + validation QA (P0 Parts A–G) — offline, domain-neutral, uses the exact
 * live-defect shapes (Hebrew flower project) plus generic industries. Proves:
 *  A. the distinctive commercial page becomes the primary/secondary target (not the
 *     generic type-word bouquets), even with a long Hebrew title;
 *  B. a generic product-TYPE-word-only match is rejected (no arbitrary link filling);
 *  C. title/keyword/intent consistency — commercial-drifted comparison keyword is
 *     repaired, otherwise rejected intent_keyword_mismatch;
 *  D. recommended page type + non-article is never auto-enqueued as an article;
 *  E. demand claims only when real volume backs them (else neutral/none);
 *  F. weak/generic/off-topic secondary keywords are dropped;
 *  G. a topic disconnected from all business evidence is low_business_relevance.
 */
import { mapLinkRoles, orderedLinksForOpportunity, type LinkCandidateEntity } from '../recommendations/link-role-mapper'
import { validateIntentKeywordConsistency, validatePrimaryKeywordQuality, classifyRecommendedPageType, computeDemandEvidence, sanitizeDemandLanguage, filterSecondaryKeywords, assessBusinessRelevance, deriveCorpusTypeWords } from '../recommendations/opportunity-validation'
import { contentTokens } from '../recommendations/evidence-cluster'
import { blockedNonArticle, classifyTopicOutcome, summarizeBatch, type TopicStageOutcomes } from '../automation/approve-link-queue'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const tokSet = (arr: string[]) => new Set(arr.flatMap((s) => contentTokens(s)))

async function main() {
  console.log('A/B) primary commercial target — distinctive match beats generic type word (Hebrew)')
  {
    // The live cala opportunity: a long Hebrew title; the RELEVANT product shares the
    // distinctive term (קאלות); the generic bouquets share only the type word (זר).
    const candidates: LinkCandidateEntity[] = [
      { url: '/p/calla-colors', title: 'קאלות בצבעים משתנים', type: 'product' },
      { url: '/p/champagne', title: 'זר שמפנייה', type: 'product' },
      { url: '/p/rustic2', title: 'זר כפרי 2', type: 'product' },
      { url: '/p/fuchsia', title: 'זר פוקסיה', type: 'product' },
      { url: '/p/zioni', title: 'זר ציוני', type: 'product' },
    ]
    const mapped = mapLinkRoles('זר קאלות לכלה', 'איך לבחור ולהתאים זר קאלות לכלה בירושלים', candidates)
    check('A. the distinctive cala product becomes the PRIMARY commercial target', mapped.primaryTarget?.url === '/p/calla-colors', mapped.primaryTarget?.url ?? 'null')
    check('B. generic type-word-only bouquets are NOT attached as links', !mapped.assignments.some((a) => a.url === '/p/champagne' || a.url === '/p/fuchsia'))
    check('B. every assignment carries a typed reason + numeric score', mapped.assignments.every((a) => !!a.reason && typeof a.score === 'number'))
    check('B. zero unrelated links is preferred (no arbitrary filling)', orderedLinksForOpportunity(mapped).every((l) => l.url === '/p/calla-colors'))
  }

  console.log('A) several relevant products become secondary targets; Hebrew matching')
  {
    const candidates: LinkCandidateEntity[] = [
      { url: '/p/pot-nitzanit', title: 'עציץ ניצנית בצבעים שונים', type: 'product' },
      { url: '/p/pot-calla', title: 'עציץ קאלות בצבעים שונים', type: 'product' },
      { url: '/p/rose-bouquet', title: 'זר ורדים בצבעים שונים', type: 'product' },
    ]
    const mapped = mapLinkRoles('משלוח עציצים בירושלים', 'משלוח עציצים בירושלים למשרד ולבית', candidates)
    const urls = mapped.assignments.map((a) => a.url)
    check('A. plural opp (עציצים) matches singular product (עציץ) → a pot product is PRIMARY', mapped.primaryTarget !== null && (mapped.primaryTarget.url === '/p/pot-nitzanit' || mapped.primaryTarget.url === '/p/pot-calla'))
    check('A. the second pot product becomes a SECONDARY commercial target', mapped.assignments.some((a) => a.role === 'secondary_commercial_target' && (a.url === '/p/pot-nitzanit' || a.url === '/p/pot-calla')))
    check('A. an unrelated rose bouquet is not forced in when it shares no subject token', !urls.includes('/p/rose-bouquet'))
  }

  console.log('C) title/keyword/intent consistency — comparison keyword repair')
  {
    const commercialTokens = tokSet(['זר ורדים בצבעים שונים', 'זר שמפנייה'])
    const r = validateIntentKeywordConsistency({ primaryKeyword: 'זר ורדים לבנים', title: 'ורדים לבנים מול ורדים אדומים: איך לבחור את הזר המתאים ביותר', intent: 'comparison' }, commercialTokens)
    check('C. commercial-drifted comparison keyword is REPAIRED from the title', r.ok && !!r.repairedKeyword && !contentTokens(r.repairedKeyword!).includes('זר'), r.repairedKeyword)
    check('C. the repaired keyword keeps the comparison (both colors present)', !!r.repairedKeyword && r.repairedKeyword!.includes('לבנים') && r.repairedKeyword!.includes('אדומים'))
    // An informational keyword that already matches its title is consistent.
    const ok = validateIntentKeywordConsistency({ primaryKeyword: 'how to care for calla lilies', title: 'how to care for calla lilies at home', intent: 'informational' }, tokSet(['calla lily bouquet']))
    check('C. a consistent informational keyword passes unchanged', ok.ok && !ok.repairedKeyword)
    // A keyword fully disjoint from its title and unrepairable → mismatch.
    const bad = validateIntentKeywordConsistency({ primaryKeyword: 'x', title: 'y', intent: 'comparison' }, new Set())
    check('C. unrepairable inconsistency → intent_keyword_mismatch', !bad.ok && bad.reason === 'intent_keyword_mismatch')
    check('C. does NOT commercialize a valid informational topic (no drift → unchanged)', validateIntentKeywordConsistency({ primaryKeyword: 'watering schedule for indoor plants', title: 'watering schedule for indoor plants guide', intent: 'informational' }, tokSet(['indoor plant pot'])).repairedKeyword === undefined)
  }

  console.log('D) recommended page type + non-article never auto-enqueued')
  {
    check('D. informational → article', classifyRecommendedPageType({ intent: 'informational' }, { primaryTargetType: null, keywordEqualsProduct: false }) === 'article')
    check('D. local commercial with a category target → category_page', classifyRecommendedPageType({ intent: 'local' }, { primaryTargetType: 'category', keywordEqualsProduct: false }) === 'category_page')
    check('D. transactional, no target → commercial_landing_page', classifyRecommendedPageType({ intent: 'transactional' }, { primaryTargetType: null, keywordEqualsProduct: false }) === 'commercial_landing_page')
    check('D. exact product need → product_page_improvement', classifyRecommendedPageType({ intent: 'commercial' }, { primaryTargetType: 'product', keywordEqualsProduct: true }) === 'product_page_improvement')
    // Endpoint enforcement: a non-article is blocked (not a failure), article enqueues.
    const base: TopicStageOutcomes = { validated: true, linkPlanRequested: false, linkPlanSaved: false, approved: true, enqueued: true, alreadyQueued: false }
    const batch = summarizeBatch([classifyTopicOutcome('a', base), blockedNonArticle('b')])
    check('D. non-article recommendation is blocked_non_article, NOT enqueued', batch.byState.blocked_non_article === 1 && batch.blockedNonArticle === 1)
    check('D. a blocked non-article does not make the batch fail', batch.ok === true && batch.added === 1 && batch.failed === 0)
  }

  console.log('E) demand-claim integrity (verified volume only)')
  {
    const kr = [{ query: 'משלוח פרחים בירושלים', volume: 880 }, { query: 'עציץ קאלות', volume: null }]
    const withVol = computeDemandEvidence('משלוח פרחים בירושלים', [], kr)
    check('E. verified volume is exposed with the exact query + confidence', withVol.demandEvidenceAvailable && withVol.avgMonthlySearches === 880 && withVol.demandConfidence === 'high')
    const noVol = computeDemandEvidence('שזירת פרחים לאירועים', [], kr)
    check('E. no matching demand → demandConfidence none, no fabricated volume', !noVol.demandEvidenceAvailable && noVol.avgMonthlySearches === null && noVol.demandConfidence === 'none')
    const nullVol = computeDemandEvidence('עציץ קאלות', [], kr)
    check('E. a matching query with null volume is NOT claimed as demand', nullVol.demandConfidence === 'none')
  }

  console.log('F) secondary-keyword quality')
  {
    const r = filterSecondaryKeywords('שזירת פרחים לחתונה', 'מדריך שזירת פרחים לחתונה', ['שזירת פרחים מקצועית', 'יפה', 'שזירת פרחים לחתונה', 'טיפים לבחירת רכב'])
    check('F. specific on-topic secondary is kept', r.kept.includes('שזירת פרחים מקצועית'))
    check('F. single-token secondary dropped (too_short)', r.rejected.some((x) => x.keyword === 'יפה' && x.reason === 'too_short'))
    check('F. exact duplicate of the primary keyword dropped', r.rejected.some((x) => x.keyword === 'שזירת פרחים לחתונה' && (x.reason === 'duplicate_of_primary' || x.reason === 'subset_of_primary')))
    check('F. off-topic secondary dropped', r.rejected.some((x) => x.keyword === 'טיפים לבחירת רכב' && x.reason === 'off_topic'))
  }

  console.log('G) business relevance')
  {
    const evidence = tokSet(['זר ורדים בצבעים שונים', 'עציץ קאלות', 'משלוח פרחים'])
    const typeWords = deriveCorpusTypeWords(['זר ורדים', 'זר קאלות', 'זר שמפנייה', 'זר כפרי', 'עציץ ניצנית'])
    const good = assessBusinessRelevance({ primaryKeyword: 'איך לשמור על ורדים לאורך זמן', title: 'מדריך שמירה על ורדים' }, evidence, typeWords, [{ name: 'זר ורדים בצבעים שונים' }])
    check('G. an informational topic sharing the business subject is relevant', good.ok && good.score > 0 && good.relatedCommercialEntities.length >= 1)
    const bad = assessBusinessRelevance({ primaryKeyword: 'קישוט רכב לחתונה', title: 'רעיונות לקישוט רכב לחתונה' }, evidence, typeWords, [])
    check('G. a topic disconnected from all business evidence → low_business_relevance', !bad.ok && bad.reason === 'low_business_relevance')
  }

  console.log('B/C/D-links) hard caps + rank-then-select + generic bulk suppression')
  {
    // A local delivery topic against a corpus of many "משלוח … בירושלים" articles: the
    // shared tokens are all generic/ubiquitous (משלוח, פרחים, ירושלים) → NO links, not
    // 30. Distinctive pot products (עציץ) still become targets.
    const deliveryArticles: LinkCandidateEntity[] = Array.from({ length: 12 }, (_, i) => ({ url: `/blog/delivery-${i}`, title: `משלוח פרחים בירושלים שכונה ${i}`, type: 'post' as const }))
    const potProduct: LinkCandidateEntity = { url: '/p/pot', title: 'עציץ ניצנית בצבעים שונים', type: 'product' }
    const mapped = mapLinkRoles('משלוח עציצים בירושלים', 'משלוח עציצים בירושלים למשרד ולבית', [...deliveryArticles, potProduct])
    check('D. generic Jerusalem-delivery articles are NOT bulk-added (generic-only overlap)', !mapped.assignments.some((a) => a.url.startsWith('/blog/delivery-')))
    check('A. the distinctive pot product still becomes the primary target', mapped.primaryTarget?.url === '/p/pot')

    // A comparison article against a big pile of loosely-related informational pages
    // that share only a generic/type word → capped hard at <= 7 total, and generic-only
    // ones excluded.
    const noise: LinkCandidateEntity[] = Array.from({ length: 30 }, (_, i) => ({ url: `/blog/noise-${i}`, title: `פרחים במשרד נושא ${i}`, type: 'post' as const }))
    const roseGuide: LinkCandidateEntity[] = Array.from({ length: 8 }, (_, i) => ({ url: `/blog/rose-${i}`, title: `טיפוח ורדים לבנים מדריך ${i}`, type: 'post' as const }))
    const capped = mapLinkRoles('שושן צחור לעומת סחלב לבן', 'שושן צחור לעומת סחלב לבן: השוואה', [...noise, ...roseGuide])
    check('B. total automatically suggested links never exceeds 7', capped.assignments.length <= 7)
    check('B. per-role cap: at most 1 primary, 2 secondary, 4 supporting', capped.assignments.filter((a) => a.role === 'primary_commercial_target').length <= 1 && capped.assignments.filter((a) => a.role === 'secondary_commercial_target').length <= 2 && capped.assignments.filter((a) => a.role === 'supporting_informational_link').length <= 4)
    check('D. generic office-flower noise (shares only פרחים) is excluded', !capped.assignments.some((a) => a.url.startsWith('/blog/noise-')))
  }

  console.log('F-links) commercial not demoted to support; role-specific selection')
  {
    // A commercial product and an informational page both match; the product must be a
    // commercial target, never demoted into the supporting list.
    const candidates: LinkCandidateEntity[] = [
      { url: '/p/calla', title: 'קאלות בצבעים משתנים', type: 'product' },
      { url: '/blog/calla-care', title: 'טיפוח קאלות מדריך', type: 'post' },
    ]
    const mapped = mapLinkRoles('זר קאלות לכלה', 'זר קאלות לכלה בירושלים', candidates)
    check('F. the commercial product is a commercial target (primary), not supporting', mapped.primaryTarget?.url === '/p/calla')
    check('F. the informational care page is supporting (complementary), typed reason', mapped.assignments.some((a) => a.url === '/blog/calla-care' && a.role === 'supporting_informational_link' && a.reason === 'complements_subject_head'))
    check('F. the commercial page never appears as a supporting link', !mapped.assignments.some((a) => a.url === '/p/calla' && a.role === 'supporting_informational_link'))
  }

  console.log('G-links) comparison + local keyword repair; H intent-conflicting secondary')
  {
    const commercialTokens = tokSet(['שושן צחור', 'סחלב לבן', 'עציץ קאלות'])
    // Comparison title, one-sided generic keyword → repaired to the title comparison.
    const cmp = validateIntentKeywordConsistency({ primaryKeyword: 'פרח בצבע לבן', title: 'שושן צחור לעומת סחלב לבן: איזה לבחור', intent: 'comparison' }, commercialTokens)
    check('G. comparison keyword repaired to carry the comparison', cmp.ok && !!cmp.repairedKeyword && cmp.repairedKeyword!.includes('לעומת'))
    // Local title, keyword dropped the location → repaired to retain Jerusalem + delivery.
    const loc = validateIntentKeywordConsistency({ primaryKeyword: 'משלוח עציץ', title: 'משלוח עציצים בירושלים למשרד ולבית', intent: 'local' }, commercialTokens)
    check('G. local keyword repaired to RETAIN the location (ירושלים)', loc.ok && !!loc.repairedKeyword && loc.repairedKeyword!.includes('ירושלים'))
    check('G. local repair keeps the delivery intent word (משלוח)', !!loc.repairedKeyword && loc.repairedKeyword!.includes('משלוח'))
    // H — an informational comparison must drop a commercial "בזול" secondary.
    const sec = filterSecondaryKeywords('ורדים לבנים מול ורדים אדומים', 'ורדים לבנים מול ורדים אדומים', ['ורדים בזול', 'הבדל בין ורדים לבנים לאדומים'], 'comparison')
    check('H. intent-conflicting commercial secondary (בזול) removed from informational topic', sec.rejected.some((x) => x.keyword === 'ורדים בזול' && x.reason === 'intent_conflicting'))
    check('H. a genuinely complementary comparison secondary is kept', sec.kept.includes('הבדל בין ורדים לבנים לאדומים'))
  }

  console.log('G-quality) final primary-keyword quality gate; H demand language')
  {
    const typeWords = deriveCorpusTypeWords(['זר ורדים', 'זר קאלות', 'זר שמפנייה', 'זר כפרי', 'פרח יפה'])
    // "זר פרח" is only generic type words → repair to the title's distinctive subject.
    const bad = validatePrimaryKeywordQuality('זר פרח', 'שושן צחור: המשמעות, המקור והשימושים בזרים מעוצבים', typeWords)
    check('G. generic type-word-only primary ("זר פרח") repaired to the title subject', bad.ok && !!bad.repairedKeyword && bad.repairedKeyword!.includes('שושן צחור'))
    const good = validatePrimaryKeywordQuality('שושן צחור לבן', 'שושן צחור: מדריך גידול', typeWords)
    check('G. a keyword carrying the distinctive subject passes unchanged', good.ok && !good.repairedKeyword)
    // H — verified volume → factual wording; none → strip unsupported demand claims.
    const withVol = sanitizeDemandLanguage('זר קאלות נהנה מביקוש גבוה מאוד של מחפשים ומתאים לחתונות', { demandEvidenceAvailable: true, demandQuery: 'זר קאלות', avgMonthlySearches: 480, demandConfidence: 'high' }, 'he')
    check('H. verified volume → factual monthly-searches wording added', withVol.includes('480') && withVol.includes('חיפושים חודשיים'))
    const noVol = sanitizeDemandLanguage('הנושא נהנה מביקוש גבוה מאוד וגם חיפושים נפוצים ומתאים לעונה', { demandEvidenceAvailable: false, demandQuery: null, avgMonthlySearches: null, demandConfidence: 'none' }, 'he')
    check('H. no verified volume → unsupported demand claims stripped', !/ביקוש גבוה|חיפושים נפוצים/.test(noVol) && noVol.includes('מתאים לעונה'))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}
main()
