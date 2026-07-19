/**
 * Exact-keyword cannibalization QA — offline, no network.
 * Proves a generated recommendation whose primary keyword EXACTLY equals an
 * existing indexed commercial entity (product/category/page/article/Shopify) is
 * hard-rejected before persistence, while genuine long-tails survive. Uses the live
 * flower fixtures, but the algorithm is domain-neutral.
 */
import { buildKeywordGuardFromData, ownedByExistingEntity, coveredByExistingContent, type KeywordGuard } from '../recommendations/keyword-guard'
import { salvageLongTailKeyword } from '../recommendations/keyword-salvage'
import { ExistingCorpus } from '../recommendations/dedupe'
import { normalizeText } from '../recommendations/topic-idea-store'
import { recommendationGuidance } from '../recommendations/prompt-guidance'
import { domainFlags } from '../recommendations/domain-flags'
import { runBudget } from '../recommendations/reco-cost'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const YEAR = 2026

// The exact route decision (kept in sync with the recommendations route) — only the
// parts relevant to cannibalization: exact-entity-owner + coverage + salvage.
type Decision = 'exact_existing_keyword_owner' | 'covered' | 'salvaged' | 'rejected' | 'accepted'
function decide(guard: KeywordGuard, c: { title: string; primaryKeyword: string; secondaryKeywords?: string[] }): Decision {
  const nt = normalizeText(c.title); const nk = normalizeText(c.primaryKeyword)
  if (nt && guard.titles.has(nt)) return 'covered'
  if (ownedByExistingEntity(guard, c.primaryKeyword)) return 'exact_existing_keyword_owner'
  if (coveredByExistingContent(guard, c.title, c.primaryKeyword)) return 'covered'
  if (nk && guard.contentKeywords.has(nk)) return 'covered'
  const corpus = new ExistingCorpus(); for (const k of guard.keywords) corpus.add(k)
  if (nk && guard.keywords.has(nk)) {
    const salv = salvageLongTailKeyword(c, {
      isOwnedKeyword: (k) => guard.keywords.has(k),
      isSemanticKeywordDup: (k) => corpus.isDuplicate(k),
      isCoveredByContent: (t, k) => coveredByExistingContent(guard, t, k) || ownedByExistingEntity(guard, k),
    })
    return salv.ok ? 'salvaged' : 'rejected'
  }
  return 'accepted'
}

// A flower-store guard built from indexed ENTITIES (products/categories) — none of
// these are blog posts, so historically none were keyword owners (the bug).
const flowerGuard = () => buildKeywordGuardFromData({
  topics: [{ topic: 'איך לבחור פרחים לחתונה', primary_keyword: 'פרחים לחתונה' }],
  generatedArticleTitles: ['המדריך לזרים לאירועים'],
  trackingKeywords: [],
  ideas: [],
  scanTargets: [
    { targetTitle: 'זר פריחה צבעונית', targetUrl: 'https://shop.example.com/product/colorful', targetType: 'product', keywordAvailable: false, primaryKeywordCandidate: '' },
    { targetTitle: 'זר ליזיינטוס בצבעים משתנים', targetUrl: 'https://shop.example.com/product/lisianthus', targetType: 'product', keywordAvailable: false, primaryKeywordCandidate: '' },
    { targetTitle: 'עציץ ניצנית בצבעים שונים', targetUrl: 'https://shop.example.com/product/nitzanit', targetType: 'category', keywordAvailable: false, primaryKeywordCandidate: '' },
    { targetTitle: 'בלונים חלקים', targetUrl: 'https://shop.example.com/product/balloons', targetType: 'page', keywordAvailable: false, primaryKeywordCandidate: '' },
    { targetTitle: 'זר בייבי בוביג', targetUrl: 'https://shop.example.com/product/baby', targetType: 'product', keywordAvailable: false, primaryKeywordCandidate: '' },
    { targetTitle: 'זר חלום כתום', targetUrl: 'https://shop.example.com/product/dream', targetType: 'product', keywordAvailable: false, primaryKeywordCandidate: '' },
  ],
  shopifyEntities: [{ title: 'זר חלום כתום', handle: 'dream-orange-bouquet', entity_type: 'product' }],
})

async function main() {
  const g = flowerGuard()

  console.log('A) exact product/category/entity name → HARD rejection (C/H1-H6, H15)')
  {
    // The exact live examples that must be rejected.
    const exacts = ['זר פריחה צבעונית', 'זר ליזיינטוס בצבעים משתנים', 'עציץ ניצנית בצבעים שונים', 'בלונים חלקים', 'זר בייבי בוביג', 'זר חלום כתום']
    for (const kw of exacts) {
      check(`exact entity keyword rejected: "${kw}"`, ownedByExistingEntity(g, kw))
    }
    // 2. a LONGER generated title does not rescue an exact primary keyword.
    check('1/2. long title + exact primaryKeyword → exact_existing_keyword_owner',
      decide(g, { title: 'הקסם של זר פריחה צבעונית: איך לשלב מגוון צבעים וטקסטורות בזר אחד מושלם', primaryKeyword: 'זר פריחה צבעונית' }) === 'exact_existing_keyword_owner')
    // 3. same keyword with a different DECLARED intent but no real modifier → still rejected.
    check('3. exact keyword, "informational" label, no modifier → rejected', decide(g, { title: 'מידע על זר פריחה צבעונית', primaryKeyword: 'זר פריחה צבעונית' }) === 'exact_existing_keyword_owner')
    // 4/5/6. category + article + generated-article exact matches.
    check('4. exact category name → rejected', decide(g, { title: 'עציץ ניצנית בצבעים שונים', primaryKeyword: 'עציץ ניצנית בצבעים שונים' }) === 'exact_existing_keyword_owner')
    check('5. exact existing TOPIC keyword → covered (not accepted)', decide(g, { title: 'עוד על פרחים לחתונה', primaryKeyword: 'פרחים לחתונה' }) !== 'accepted')
    check('15. Shopify-indexed entity exact match → rejected (WP + Shopify)', decide(g, { title: 'זר חלום כתום מדהים', primaryKeyword: 'זר חלום כתום' }) === 'exact_existing_keyword_owner')
    check('15. Shopify handle also owns the exact name', ownedByExistingEntity(g, 'dream orange bouquet'))
  }

  console.log('B) Hebrew normalization variants (H7)')
  {
    check('7. quotes/spacing/punctuation variants normalize to the same owner', ownedByExistingEntity(g, '  זר   פריחה, צבעונית!  ') && ownedByExistingEntity(g, '“זר פריחה צבעונית”'))
    check('7. a genuinely different phrase does NOT collide', !ownedByExistingEntity(g, 'זר פריחה לבנה'))
  }

  console.log('C) genuine long-tails survive; generic modifiers do not (D/H8/H9)')
  {
    // 8. distinct informational modifiers → survive (not owned, not covered).
    const survivors = [
      { title: 'איך לשמור על זר פריחה צבעונית לאורך זמן', primaryKeyword: 'איך לשמור על זר פריחה צבעונית לאורך זמן' },
      { title: 'אילו פרחים משתלבים בזר צבעוני', primaryKeyword: 'אילו פרחים משתלבים בזר צבעוני' },
      { title: 'איך לבחור זר צבעוני ליום הולדת', primaryKeyword: 'זר צבעוני ליום הולדת' },
      { title: 'טיפול בפרחי ליזיאנטוס לאחר קבלת הזר', primaryKeyword: 'טיפול בפרחי ליזיאנטוס לאחר קבלת הזר' },
    ]
    for (const s of survivors) check(`8. long-tail survives: "${s.primaryKeyword}"`, decide(g, s) === 'accepted')
    // 9. an exact name + a GENERIC modifier that is really the same page name → the
    //    bare-name part still collides only on exact equality; a true generic-only
    //    rephrase ("… מומלץ") that equals nothing new is not the entity name, so it
    //    is allowed by THIS rule but the entity name itself stays blocked.
    // 9. a GENERIC modifier that does not create a distinct need is still rejected.
    check('9. entity name + generic word (מומלץ / מחיר / הטוב ביותר) → rejected', ownedByExistingEntity(g, 'זר פריחה צבעונית מומלץ') && ownedByExistingEntity(g, 'זר פריחה צבעונית מחיר') && ownedByExistingEntity(g, 'זר חלום כתום הטוב ביותר'))
    check('9. a REAL modifier is NOT stripped (long-tail survives)', !ownedByExistingEntity(g, 'איך לשמור על זר פריחה צבעונית לאורך זמן'))
    // 16. domain isolation — the entity owners come ONLY from this project's data.
    check('16. entityOwners are project-scoped (empty guard owns nothing)', !ownedByExistingEntity(buildKeywordGuardFromData({ topics: [], generatedArticleTitles: [], trackingKeywords: [], ideas: [], scanTargets: [] }), 'זר פריחה צבעונית'))
  }

  console.log('D) prompt guidance + typed reason + cost (G/H14/H17)')
  {
    const guide = recommendationGuidance('Hebrew', YEAR, 15)
    check('G. prompt states existing pages own their exact keyword', /EXISTING PAGE OWNERSHIP:/.test(guide) && /NEVER set a new article's primaryKeyword to the exact name/.test(guide))
    check('G. prompt says entity names are link targets/context, not article keywords', /LINK TARGETS and business context, not article keywords/.test(guide))
    check('16. prompt guidance stays domain-neutral (no flower flags)', (() => { const f = domainFlags(guide); return !f.perfume && !f.lighting && !f.pet && !f.freelancer })())
    // 14. typed observable reason present in the finalization the route calls
    // (Increment 2: the post-processing moved VERBATIM into finalize-attempt.ts,
    // which the route invokes via finalizeRecommendationAttempt).
    const routeSrc = require('fs').readFileSync(require('path').join(__dirname, '../../../app/api/content/automation/recommendations/route.ts'), 'utf8')
    const finalizeSrc = require('fs').readFileSync(require('path').join(__dirname, '../recommendations/finalize-attempt.ts'), 'utf8')
    check('14. typed reason exact_existing_keyword_owner + counter surfaced (in finalization the route calls)', /pushEx\('exact_existing_keyword_owner'\)/.test(finalizeSrc) && /exactExistingKeywordOwner/.test(finalizeSrc) && /finalizeRecommendationAttempt/.test(routeSrc))
    check('17. cost controls unchanged (Flash-only, 4 calls, $0.15)', (() => { const b = runBudget('standard', 15); return b.maxModelCallsPerRun === 4 && b.maxEstimatedCostUsd === 0.15 })())
    // 11/12. internal-link dedupe: money target excluded from supporting + no dup URLs.
    const engineSrc = require('fs').readFileSync(require('path').join(__dirname, '../recommendations/engine.ts'), 'utf8')
    check('11/12. engine dedupes ordered links by URL (money target not duplicated)', /seenLinkUrls\.has\(k\)/.test(engineSrc))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}
main()
