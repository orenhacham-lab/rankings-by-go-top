/**
 * QUALITY-GATE regressions (live report round 3) — pure, deterministic.
 * Every accepted-output defect the live /reco-qa PASS falsely allowed:
 *   P0-1 link relevance (colour/generic/container/coverage) — 6 live pairs;
 *   P0-2 cannibalization + synonym/need duplicates — Natural/Flowers/Matalon;
 *   P0-3 headline → search-phrase normalization — 5 live keywords.
 */
import { evaluateLink, isRelevantLink, sharesSubjectHead } from '../recommendations/link-relevance'
import { isSameNeedDuplicate, assessNeedCannibalization, incompatibleActionNeed, unmatchedDocEntities, isTitleKeywordAligned } from '../recommendations/coverage'
import { contentTokens } from '../recommendations/evidence-cluster'
import { normalizeToSearchPhrase, isSearchPhraseQuality, keywordHasRealSubject, keywordPreservesSubject } from '../recommendations/search-phrase'
import { assessExistingLocalOwnership, deriveCorpusTypeWords, localImprovementCompatible, desiredOpportunityRole, basisRoleOf, isImprovementBasisCompatible } from '../recommendations/opportunity-validation'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

async function main() {
  console.log('P0-1) link relevance — every live false-pass is now IRRELEVANT')
  {
    const irr = (kw: string, title: string, cand: string, role = 'supporting_informational_link') =>
      !isRelevantLink(evaluateLink({ primaryKeyword: kw, title }, { url: '/p/x', title: cand, role }), role)
    check('B12 → Vitamin C (quality-word "מומלץ" only)', irr('B12 מומלץ', 'B12 מומלץ למבוגרים', 'ויטמין C מומלץ'))
    check('Vitamin-D level → sciatica article (no subject overlap)', irr('רמה מומלצת ויטמין D בדם', 'רמה מומלצת של ויטמין D בדם', 'טיפול טבעי בכאבי גב תחתון'))
    check('pink roses → pink orchid (COLOUR only)', irr('ורדים ורודים', 'איך לשמור על ורדים ורודים', 'סחלב ורוד מרהיב'))
    check('pink roses → pink anthurium (COLOUR only)', irr('ורדים ורודים', 'איך לשמור על ורדים ורודים', 'אנתוריום ורוד'))
    check('chuppah design → home interior (generic "עיצוב" only)', irr('עיצוב חופה', 'עיצוב חופה לחתונה', 'עיצוב פנים לבית'))
    check('digital office → office services (container "משרד" only)', irr('משרד דיגיטל', 'שירותי משרד דיגיטל', 'שירותי משרד לפרילנסרים'))
    check('spec document → SEO profit (no overlap)', irr('מסמך אפיון', 'מהו מסמך אפיון', 'רווחיות SEO לעסקים'))
    check('spec document → branding (no overlap)', irr('מסמך אפיון', 'מהו מסמך אפיון', 'מיתוג עסקי מקצועי'))
    // ROUND-4 single-token tightening — one generic/stemmed token never qualifies.
    check('guide/structural words only (מדריך/מלא/בחירת) → irrelevant', irr('בחירת ויטמין D', 'המדריך המלא לבחירת ויטמין D', 'איך לבחור מזרן מומלץ'))
    check('Vitamin C fruits → Vitamin D fruits (category "פירות"; C≠D)', irr('ויטמין C בפירות', 'ויטמין C בפירות', 'ויטמין D בפירות'))
    check('B12 injections → weight-loss injections (form "זריקות"; no B12)', irr('B12 זריקות', 'זריקות B12 למבוגרים', 'זריקות להרזיה'))
    check('portfolio → freelancer article (verb "לעבוד" only)', irr('תיק עבודות', 'איך לבנות תיק עבודות', 'איך לעבוד כפרילנסר'))
    check('landing page → homepage "דף הבית" (structural "דף" only)', !isRelevantLink(evaluateLink({ primaryKeyword: 'דף נחיתה', title: 'בניית דף נחיתה' }, { url: '/', title: 'דף הבית', role: 'supporting_informational_link' }), 'supporting_informational_link'))
    check('multi vitamin → male multi vitamin ("מולטי" alone, informational)', irr('מולטי ויטמין', 'מולטי ויטמין יומי', 'מולטי ויטמין לגברים'))
    // ISSUE 2 (live) — evaluative/framing/action words never establish a link.
    check('Natural: supplements → pilates (framing "חשוב"/"בריאות" only)', irr('תוספי תזונה לבריאות הגבר', 'תוספי תזונה לבריאות הגבר', 'למה חשוב מאוד לבריאות לעשות פילאטיס'))
    check('Matalon: ad-agency → secretary (comparison "עדיף" + "חברת" only)', irr('חברת פרסום בגוגל מול מנהל קמפיינים פרילנסר', 'חברת פרסום בגוגל מול מנהל קמפיינים פרילנסר', 'עדיף חברת מזכירות או מזכירה פרילנסרית'))
    check('Matalon: landing page → content (action noun "יצירת" only)', irr('יצירת דף נחיתה', 'יצירת דף נחיתה', 'יצירת תוכן לפרילנסרים'))

    // LEGITIMATE links stay relevant (proper roles: products = commercial).
    const rel = (kw: string, title: string, cand: string, role = 'supporting_informational_link') =>
      isRelevantLink(evaluateLink({ primaryKeyword: kw, title }, { url: '/p/x', title: cand, role }), role)
    check('roses article → rose bouquet PRODUCT (commercial single head)', rel('ורדים ורודים', 'איך לשמור על ורדים ורודים', 'זר ורדים אדומים', 'primary_commercial_target'))
    check('Vitamin D level → Vitamin D supplement PRODUCT (commercial, D shared)', rel('רמה מומלצת ויטמין D בדם', 'רמה מומלצת של ויטמין D בדם', 'תוסף ויטמין D 1000', 'primary_commercial_target'))
    check('flower-arrangement article → arrangement guide (≥2 subject: סידור+פרח)', rel('סידור פרחים לחתונה', 'סידור פרחים לחתונה', 'סידורי פרחים לאירועים'))
    check('spec-document article → spec-writing SERVICE (commercial owns subject)', rel('מסמך אפיון', 'מהו מסמך אפיון', 'שירותי כתיבת מסמך אפיון', 'primary_commercial_target'))
    // A page that owns the informational need is NOT a supporting link.
    const cov = evaluateLink({ primaryKeyword: 'מסמך אפיון', title: 'מהו מסמך אפיון' }, { url: '/b/x', title: 'מסמך אפיון: מדריך מלא', role: 'supporting_informational_link' })
    check('page owning the need → coverage signal, not a supporting link', cov.coverageOwned && !isRelevantLink(cov, 'supporting_informational_link'))
  }

  console.log('R4) strict external-business (generic phrases never fail; real names do)')
  {
    const { buildBrandSafety, hasNamedExternalBusiness } = await import('../recommendations/brand-safety')
    const bs = buildBrandSafety({ businessName: 'פרחי אביב', entityNames: ['פרחי אביב זר כלה', 'פרחי אביב ורדים אדומים', 'פרחי אביב גיבסניות'], ownEvidence: ['משלוח פרחים'] })
    for (const g of ['ורדים ורודים', 'גיבסניות לבנות', 'מסמך אפיון', 'עיצוב חופה', 'ויטמין D', 'תוספי תזונה', 'תיק עבודות', 'דף נחיתה']) {
      check(`generic "${g}" is NOT an external business`, !hasNamedExternalBusiness(g, bs).hit)
    }
    check('"פרחי אביה" (mutation of own פרחי אביב) IS external', hasNamedExternalBusiness('פרחי אביה ירושלים', bs).hit)
    check('a legal-suffix name (בע"מ) IS external', hasNamedExternalBusiness('משלוחי פרחים בע"מ', bs).hit)
    // ISSUE 1 (live) — generic "חברת/קבוצת/רשת X" is NOT a named external business.
    check('generic "חברת פרסום בגוגל …" is NOT an external business', !hasNamedExternalBusiness('חברת פרסום בגוגל מול מנהל קמפיינים פרילנסר', bs).hit)
    check('generic "חברת מזכירות …" is NOT an external business', !hasNamedExternalBusiness('עדיף חברת מזכירות או מזכירה פרילנסרית', bs).hit)
    check('generic "קבוצת פרסום" / "רשת חנויות" are NOT external businesses', !hasNamedExternalBusiness('קבוצת פרסום דיגיטלי', bs).hit && !hasNamedExternalBusiness('רשת חנויות פרחים', bs).hit)
    check('a real "… group" named brand IS external', hasNamedExternalBusiness('Campaign Masters group', bs).hit)
    const { isTitleKeywordAligned } = await import('../recommendations/coverage')
    check('semantic paraphrase title/keyword PASSES alignment', isTitleKeywordAligned('מחיר סידור פרחים לחתונה', 'כמה עולה סידור פרחים לחתונה? פירוט מחירים'))
    check('truly off-topic keyword/title FAILS alignment', !isTitleKeywordAligned('נעלים לחתן', 'איך לבחור חליפת חתן לחתונה'))
  }

  console.log('P0-2) cannibalization + need duplicates')
  {
    check('Matalon: two price landing-page topics = duplicate (transactional vs informational)', isSameNeedDuplicate(
      { primaryKeyword: 'מחיר בניית דף נחיתה', title: 'כמה עולה לבנות דף נחיתה ב-2026? פירוט מחירים', intent: 'transactional' },
      { primaryKeyword: 'מחיר בניית דף נחיתה', title: 'כמה עולה לבנות דף נחיתה ב-2026? המדריך המלא למחירים', intent: 'informational' }))
    check('distinct price vs how-to NOT duplicate', !isSameNeedDuplicate(
      { primaryKeyword: 'מחיר דף נחיתה', title: 'כמה עולה דף נחיתה', intent: 'transactional' },
      { primaryKeyword: 'בניית דף נחיתה', title: 'איך לבנות דף נחיתה', intent: 'informational' }))
    check('Natural Shop: "תוספי מזון" owns-need vs existing "תוספי תזונה" (SYNONYM)',
      assessNeedCannibalization({ primaryKeyword: 'תוספי מזון מומלצים', title: 'תוספי מזון מומלצים', intent: 'informational' },
        [{ title: 'תוספי תזונה מומלצים', url: '/s', focusKeyword: 'תוספי תזונה מומלצים' }]).matchType === 'owns_need')
    const wf = assessNeedCannibalization({ primaryKeyword: 'מחיר סידור פרחים לחתונה', title: 'כמה עולה סידור פרחים לחתונה', intent: 'transactional' },
      [{ title: 'עלות עיצוב פרחים לחתונה', url: '/wedding-floral-design-cost', slug: 'wedding-floral-design-cost' }])
    check('Flowers: wedding-cost topic vs existing cost page = owns/improve', wf.matchType === 'owns_need' || wf.matchType === 'improve')
    // ROUND-5 EXACT live false-pass: the accepted new topic "מחיר סידור פרחים
    // לחתונה" (headline "כמה עולה … פירוט מחירים וטיפים לחיסכון") vs the existing
    // page "כמה עולה עיצוב פרחוני לחתונה? המדריך המלא לתקציב פרחים". The need
    // (wedding-floral pricing) is the SAME; only the arrangement/design synonym
    // (סידור vs עיצוב פרחוני) differs, and the marketing tail must not dilute it.
    const wfLive = assessNeedCannibalization(
      { primaryKeyword: 'מחיר סידור פרחים לחתונה', title: 'כמה עולה סידור פרחים לחתונה? פירוט מחירים וטיפים לחיסכון', intent: 'transactional' },
      [{ title: 'כמה עולה עיצוב פרחוני לחתונה? המדריך המלא לתקציב פרחים', url: '/wedding-floral-budget', focusKeyword: 'עיצוב פרחוני לחתונה', slug: 'wedding-floral-budget' }])
    check('Flowers LIVE: סידור-פרחים pricing owns_need vs existing עיצוב-פרחוני pricing page (need, not wording)', wfLive.matchType === 'owns_need')
    check('Flowers LIVE: owns_need match carries the existing URL for the improvement', wfLive.matches.some((m) => m.url === '/wedding-floral-budget' && m.matchType === 'owns_need'))
    // A candidate whose ONLY overlap with the topic is price-question framing
    // (כמה/עולה/מחיר) is NEVER a relevant support link.
    check('price-question-only overlap → link IRRELEVANT (no distinctive subject)',
      !isRelevantLink(evaluateLink({ primaryKeyword: 'מחיר סידור פרחים לחתונה', title: 'כמה עולה סידור פרחים לחתונה? פירוט מחירים' }, { url: '/x', title: 'כמה עולה ביטוח רכב? מדריך מחירים מלא', role: 'supporting_informational_link' }), 'supporting_informational_link'))
    check('distinct topic NOT cannibalized',
      assessNeedCannibalization({ primaryKeyword: 'טיפוח ורדים בבית', title: 'איך לטפח ורדים בבית', intent: 'informational' },
        [{ title: 'משלוח פרחים בירושלים', url: '/d' }]).matchType === 'distinct')

    // ── LAST-MILE precision (live) — two false existing_page_improvement causes ──
    // BUG 1: attribute-only (colour) overlap must NOT own the head entity.
    check('BUG1: "ורדים ורודים" NOT owned by pink orchid/anthurium (colour ורוד only)',
      assessNeedCannibalization({ primaryKeyword: 'ורדים ורודים', title: 'ורדים ורודים', intent: 'informational' },
        [{ title: 'אנטוריום ורוד' }, { title: 'סחלב ורוד 2 ענפים' }]).matchType === 'distinct')
    check('BUG1: a shared colour alone shares NO subject head', !sharesSubjectHead('ורדים ורודים', 'אנטוריום ורוד'))
    check('BUG1: same head entity still shares (ורדים ⇄ זר ורדים)', sharesSubjectHead('ורדים ורודים', 'זר ורדים אדומים'))
    // BUG 2: weak location-token overlap ("בית") across DIFFERENT places must NOT own.
    const flowerCorpus = deriveCorpusTypeWords(['משלוח פרחים בית וגן ירושלים', 'משלוח פרחים נחלאות ירושלים', 'משלוח פרחים גילה ירושלים', 'משלוח פרחים מרכז העיר ירושלים', 'משלוח פרחים מושבה גרמנית ירושלים', 'משלוח זר פרחים ירושלים'])
    const bs = assessExistingLocalOwnership('משלוח פרחים בבית שמש', 'משלוח פרחים בבית שמש', ['בית וגן ירושלים', 'נחלאות', 'גילה', 'מרכז העיר ירושלים', 'מושבה גרמנית'], flowerCorpus)
    check('BUG2: "בית שמש" NOT owned by Jerusalem neighbourhoods sharing only "בית"', bs.outcome === 'distinct')
    check('BUG2: "בית שמש" (city) vs "בית וגן ירושלים" (neighbourhood) are geographically INcompatible', !localImprovementCompatible('משלוח פרחים בבית שמש', 'בית וגן ירושלים'))
    check('BUG2: the SAME place is still compatible (containment: "פרחים בית שמש")', localImprovementCompatible('משלוח פרחים בבית שמש', 'פרחים בית שמש'))
    check('BUG2: a legitimate same-place existing page is still owned/improved',
      assessExistingLocalOwnership('משלוח פרחים בבית שמש', 'משלוח פרחים בבית שמש', ['פרחים בית שמש'], flowerCorpus).outcome !== 'distinct')

    // ISSUE 3 (live) — synonym + near-identical need ownership.
    check('Issue3A: "תוספי מזון" owns-need vs existing "תוספי תזונה" (מזון≈תזונה)',
      assessNeedCannibalization({ primaryKeyword: 'תוספי מזון מומלצים', title: 'תוספי מזון מומלצים', intent: 'informational' }, [{ title: 'תוספי תזונה מומלצים' }]).matchType === 'owns_need')
    check('Issue3B: near-identical natural-products page owns the need (coarse howto/info noise ignored)',
      assessNeedCannibalization({ primaryKeyword: 'מוצרים וטיפולים טבעיים', title: 'לחזור לטבע: כיצד מוצרים וטיפולים טבעיים תורמים לבריאות הגוף והנפש', intent: 'informational' },
        [{ title: 'לחזור לטבע: היתרונות הברורים של טיפולים ומוצרים טבעיים לגוף ולנפש' }]).matchType === 'owns_need')
    // ISSUE 4 (live) — build vs promote are INCOMPATIBLE needs; shared "חנות" alone insufficient.
    check('Issue4: "הקמת חנות אינטרנטית" NOT owned/improved by "קידום חנות וירטואלית" (build≠promote)',
      assessNeedCannibalization({ primaryKeyword: 'הקמת חנות אינטרנטית', title: 'הקמת חנות אינטרנטית', intent: 'transactional' }, [{ title: 'קידום חנות וירטואלית' }]).matchType === 'distinct')
    check('Issue4: even with strong entity overlap, build vs promote stays distinct',
      assessNeedCannibalization({ primaryKeyword: 'הקמת חנות אינטרנטית מקצועית', title: 'הקמת חנות אינטרנטית מקצועית', intent: 'transactional' }, [{ title: 'קידום חנות אינטרנטית מקצועית' }]).matchType === 'distinct')
    check('Issue4: incompatibleActionNeed(build, promote) is true; (build, build) is false',
      incompatibleActionNeed('הקמת חנות', 'קידום חנות') && !incompatibleActionNeed('הקמת חנות', 'בניית חנות'))

    // NS-2 (live) — synonym/near-identical ownership over a PENDING-style doc.
    check('NS2a: "תוספי מזון" owned by a "תוספי תזונה" doc (מזון≈תזונה, pending or link)',
      assessNeedCannibalization({ primaryKeyword: 'תוספי מזון מומלצים', title: 'תוספי מזון מומלצים', intent: 'informational' }, [{ title: 'תוספי תזונה מומלצים', focusKeyword: 'תוספי תזונה מומלצים' }]).matchType === 'owns_need')
    check('NS2b: "לחזור לטבע…" support-page owns the need (near-identical, not merely a link)',
      assessNeedCannibalization({ primaryKeyword: 'מוצרים וטיפולים טבעיים', title: 'לחזור לטבע: איך לשלב מוצרים וטיפולים טבעיים בשגרת היום יום', intent: 'informational' }, [{ title: 'לחזור לטבע: היתרונות הברורים של טיפולים ומוצרים טבעיים לגוף ולנפש' }]).matchType === 'owns_need')

    // NS-3 (live, DOCUMENTED LIMITATION) — a foreign vertical entity ("סוסים") is
    // SURFACED as an unmatched entity when project evidence does not corroborate it,
    // and is NOT surfaced when it does (a horse project). Auto-blocking is a
    // documented semantic limitation; the diagnostic drives operator/acceptance review.
    const healthVocab = new Set<string>(['מגנזיום ביסגליצינט', 'ויטמין C טבעי', 'אומגה 3', 'תוספי תזונה טבעיים', 'בריאות הגוף והנפש'].flatMap((w) => contentTokens(w)))
    const horseVocab = new Set<string>(['אילוף סוסים', 'חוות סוסים', 'טיפול בסוסים', 'רכיבה טיפולית'].flatMap((w) => contentTokens(w)))
    const d3topic = 'אורח חיים טבעי ובריא'
    const d3doc = 'איך לשמור על אורח חיים טבעי ובריא לצד פעילות גופנית וטיפול בסוסים'
    check('NS3: "סוסים" is surfaced as a FOREIGN entity for a health project', unmatchedDocEntities(d3doc, d3topic, healthVocab).some((e) => /סוס/.test(e)))
    check('NS3: "סוסים" is NOT foreign for a horse project (same-cluster proof)', !unmatchedDocEntities(d3doc, d3topic, horseVocab).some((e) => /סוס/.test(e)))
    check('NS3: no project vocab → no unmatched diagnostic (cannot judge)', unmatchedDocEntities(d3doc, d3topic).length === 0)
    // NS-3c (live) — PROVENANCE: a coverage doc may not corroborate its OWN entity.
    {
      const horse = 'איך לשמור על אורח חיים טבעי ובריא לצד פעילות גופנית וטיפול בסוסים'
      const prov = (pairs: [string, string][]) => { const m = new Map<string, Set<string>>(); for (const [text, src] of pairs) for (const t of contentTokens(text)) { let s = m.get(t); if (!s) m.set(t, s = new Set()); s.add(src) } return m }
      const foreignOf = (p: Map<string, Set<string>>, docSrc: string) => {
        const r = assessNeedCannibalization({ primaryKeyword: 'אורח חיים טבעי ובריא', title: 'איך לאמץ אורח חיים טבעי ובריא יותר', intent: 'informational' },
          [{ title: horse, url: '/b/h', type: 'post', sourceKey: docSrc }], new Set(p.keys()), p)
        return r.matches[0]?.unmatchedEntities ?? []
      }
      // (1) health project — the ONLY source of "סוסים" is the horse article itself → WARN on סוס.
      const health = prov([['מגנזיום ביסגליצינט', 'entity:mag'], ['תוספי תזונה טבעיים', 'tracked'], [horse, 'entity:horse']])
      check('NS3c: a doc cannot self-corroborate → "סוס" IS foreign for a health project', foreignOf(health, 'entity:horse').some((e) => /סוס/.test(e)))
      // (2) real horse business — "סוסים" corroborated by INDEPENDENT product + tracked → no warning.
      const horseBiz = prov([['אוכף לסוסים', 'entity:saddle'], ['אילוף סוסים', 'tracked'], [horse, 'entity:horse']])
      check('NS3c: independent evidence corroborates → "סוס" is NOT foreign for a horse business', !foreignOf(horseBiz, 'entity:horse').some((e) => /סוס/.test(e)))
      // (3) presence in entities must not let a doc suppress its OWN warning.
      check('NS3c: a doc present in entities cannot suppress its own warning', foreignOf(prov([[horse, 'entity:horse'], ['ויטמין C', 'entity:vitc']]), 'entity:horse').some((e) => /סוס/.test(e)))
    }
    // NS3b (live) — morphology/framing must NOT be reported as foreign entities.
    const feHealth = new Set<string>(['מגנזיום', 'ויטמין C טבעי', 'אומגה 3', 'תוספי תזונה טבעיים', 'ויטמינים לשיער', 'נשירת שיער'].flatMap((w) => contentTokens(w)))
    const feDoc = 'מתמודדים עם נשירת שיער? אלו הוויטמינים ותוספי התזונה שכדאי להכיר בכל גיל'
    const feOut = unmatchedDocEntities(feDoc, 'קניית מוצרים לנשירת שיער', feHealth)
    check('NS3b: none of {וויטמינ, כדאי, הכיר, חיוני, בכל, גיל} is reported as foreign', !feOut.some((e) => /ויטמ|דאי|כיר|חיונ|בכל|גיל/.test(e)), JSON.stringify(feOut))
    check('NS3b: an on-domain health article basis produces NO foreign entity at all', feOut.length === 0, JSON.stringify(feOut))

    // NS-7 (live) — a strong buy/category need must NOT be flipped to informational
    // by a subtitle "המדריך"/"איך לבחור"/"טיפים"; role precedence is keyword → main
    // clause → subtitle. The exact live commercial topic must derive commercial.
    check('NS7: EXACT live "קניית מוצרים לנשירת שיער: המדריך …" → commercial',
      desiredOpportunityRole('מוצרים לנשירת שיער', 'קניית מוצרים לנשירת שיער: המדריך לבחירת הטיפול היעיל ביותר', 'commercial') === 'commercial')
    check('NS7: subtitle "איך לבחור"/"טיפים" does NOT override a buy keyword',
      desiredOpportunityRole('מוצרים לנשירת שיער', 'קניית מוצרים לנשירת שיער: איך לבחור', 'commercial') === 'commercial' &&
      desiredOpportunityRole('קניית שמפו', 'קניית שמפו: טיפים לבחירה', 'commercial') === 'commercial')
    check('NS7: the EXACT commercial topic is NOT compatible with an informational article basis',
      !isImprovementBasisCompatible(desiredOpportunityRole('מוצרים לנשירת שיער', 'קניית מוצרים לנשירת שיער: המדריך לבחירת הטיפול היעיל ביותר', 'commercial'), basisRoleOf('article', true)))
    check('NS7 preserve: price guide "מחיר סידור פרחים לחתונה: המדריך לתקציב" → informational',
      desiredOpportunityRole('מחיר סידור פרחים לחתונה', 'מחיר סידור פרחים לחתונה: המדריך לתקציב', 'transactional') === 'informational')
    check('NS7 preserve: "איך לבחור ויטמין D" → informational', desiredOpportunityRole('בחירת ויטמין D', 'איך לבחור ויטמין D', 'informational') === 'informational')
    check('NS7 preserve: editorial "מדריך לקניית מחשב" → informational (buying GUIDE, not a category page)',
      desiredOpportunityRole('מדריך לקניית מחשב', 'מדריך לקניית מחשב', 'informational') === 'informational')
    check('NS7 preserve: informational subject "מוצרים וטיפולים טבעיים" → informational (bare "מוצרים" is not a buy need)',
      desiredOpportunityRole('מוצרים וטיפולים טבעיים', 'לחזור לטבע: איך לשלב מוצרים וטיפולים טבעיים', 'informational') === 'informational')

    // ── NS-9 (live): generic THEMATIC overlap cannot establish ownership OR a link ──
    // (1) natural-lifestyle topic vs strong-teeth page → distinct (only "בריא" shared).
    check('NS9-1: "לחיות טבעי ובריא" NOT an improvement of a dental page (thematic-only overlap)',
      assessNeedCannibalization({ primaryKeyword: 'לחיות טבעי ובריא', title: 'לחיות טבעי ובריא', intent: 'informational' }, [{ title: 'שיניים חזקות ובריאות' }, { title: '5 טיפים לשיניים חזקות ובריאות' }, { title: 'מוצרי טבע ובריאות' }]).matchType === 'distinct')
    // (2) natural-products topic vs natural-teeth-whitening page sharing only אמת/באמת/טבעי → no link.
    check('NS9-2: framing-only overlap ("אמת"/"באמת"/"טבעי") → link IRRELEVANT',
      !isRelevantLink(evaluateLink({ primaryKeyword: 'מוצרי בריאות טבעיים', title: 'מה הופך מוצרי בריאות לטבעיים ויעילים באמת?' }, { url: '/x', title: 'הלבנת שיניים טבעית: פייק או אמת – גלו מה באמת עובד?', role: 'supporting_informational_link' }), 'supporting_informational_link'))
    // (3) hair-loss topic vs hair-loss article → still relevant (concrete נשיר/שיער shared).
    check('NS9-3: hair-loss topic → hair-loss article stays RELEVANT (concrete subject)',
      isRelevantLink(evaluateLink({ primaryKeyword: 'נשירת שיער', title: 'נשירת שיער גורמים' }, { url: '/b', title: 'טיפול בנשירת שיער: המדריך המלא', role: 'supporting_informational_link' }), 'supporting_informational_link'))
    // (4) wedding-floral pricing vs existing wedding-floral pricing → still ownership.
    check('NS9-4: wedding-floral pricing still owns/improves the existing pricing page',
      ['owns_need', 'improve'].includes(assessNeedCannibalization({ primaryKeyword: 'מחיר סידור פרחים לחתונה', title: 'כמה עולה סידור פרחים לחתונה', intent: 'transactional' }, [{ title: 'כמה עולה עיצוב פרחוני לחתונה' }]).matchType))
    // (5) same-location service improvement remains valid.
    check('NS9-5: same-place service ownership still valid (concrete location, not thematic)',
      localImprovementCompatible('משלוח פרחים בבית שמש', 'שירות משלוחי פרחים בבית שמש'))

    // ── P0 (cross-domain matrix): A GENERIC DOMAIN HEAD CANNOT OWN A SPECIFIC ──
    // SUBJECT. The per-project corpus-derived domain/type/container words are
    // stripped before the ownership/link head gate, so a broad domain word alone
    // ("כושר"/"משרד"/"בגד") can never own a specific subject. Derived from real
    // corpus evidence (deriveCorpusTypeWords) — NOT an industry blacklist.
    const fitnessTW = deriveCorpusTypeWords(['ציוד כושר ביתי', 'ציוד כושר מקצועי', 'ציוד כושר לסטודיו', 'ציוד כושר משקולות', 'ציוד כושר רצועות', 'ציוד כושר אופניים', 'ציוד כושר מסלולים', 'ציוד כושר ספות'])
    const officeTW = deriveCorpusTypeWords(['שירותי משרד', 'ציוד משרד', 'ריהוט משרד', 'ניהול משרד', 'אחזקת משרד', 'ניקיון משרד'])
    const fashionTW = deriveCorpusTypeWords(['בגד נשים', 'בגד ערב', 'בגד גוף', 'בגד ים', 'בגד עבודה', 'בגד ספורט', 'בגד חורף'])
    const flowerTW = deriveCorpusTypeWords(['סידור פרחים', 'זר פרחים', 'עציץ פרחים', 'משלוח פרחים', 'פרחים לחתונה', 'פרחים לאירוע'])
    // (a) SPORTS ecommerce — a shared domain head ("כושר") is NOT a shared subject.
    check('P0-sports: "רצועות כושר" shares NO subject head with "מאמן כושר" (only domain "כושר")', !sharesSubjectHead('רצועות כושר', 'איך לבחור מאמן כושר אישי', fitnessTW))
    check('P0-sports: "משקולות כושר" vs "רצועות כושר" are distinct concrete heads', !sharesSubjectHead('משקולות כושר', 'רצועות כושר לאימון', fitnessTW))
    check('P0-sports: a BARE domain word ("כושר") does NOT own "ציוד כושר"', !sharesSubjectHead('כושר', 'ציוד כושר מקצועי', fitnessTW))
    check('P0-sports: second-hand "ספת כושר יד 2" vs "אופני כושר יד 2" — the condition/quantity does NOT bridge', !sharesSubjectHead('ספת כושר יד 2', 'אופני כושר יד 2', fitnessTW))
    check('P0-sports: "רצועות כושר" topic NOT owned/improved by a "מאמן כושר" service page',
      assessNeedCannibalization({ primaryKeyword: 'רצועות כושר', title: 'רצועות כושר לאימון', intent: 'transactional' }, [{ title: 'מאמן כושר אישי', url: '/coach', type: 'service' }], undefined, undefined, fitnessTW).matchType === 'distinct')
    // (b) OFFICE cleaning — a shared container ("משרד") is NOT a shared subject.
    check('P0-office: "ניהול משרד" shares NO subject head with "ניקיון משרדים" (only container "משרד")', !sharesSubjectHead('ניהול משרד', 'ניקיון משרדים בתל אביב', officeTW))
    check('P0-office: "ריהוט משרדי" topic NOT owned by a "ניקיון משרדים" page',
      assessNeedCannibalization({ primaryKeyword: 'ריהוט משרדי', title: 'ריהוט משרדי ארגונומי', intent: 'transactional' }, [{ title: 'שירותי ניקיון משרדים בתל אביב', url: '/clean', type: 'service' }], undefined, undefined, officeTW).matchType === 'distinct')
    // (c) FASHION / second-hand retail — condition "יד שנייה" is not a subject.
    check('P0-fashion: "בגד גוף יד שנייה" vs "חצאית יד שנייה" are distinct concrete heads', !sharesSubjectHead('בגד גוף יד שנייה', 'חצאית מיני יד שנייה', fashionTW))
    check('P0-fashion: a BARE domain word ("בגד") does NOT own "בגד ערב"', !sharesSubjectHead('בגד', 'בגד ערב אלגנטי', fashionTW))
    // (d) SAME concrete head STILL owns (the discriminative core is present) —
    // true same-subject ownership when the basis is an actionable page.
    check('P0-preserve: "רצועות כושר" DOES own an actionable "רצועות כושר" product page (shared concrete head)',
      ['owns_need', 'improve', 'exact'].includes(assessNeedCannibalization({ primaryKeyword: 'רצועות כושר', title: 'רצועות כושר להתנגדות', intent: 'transactional' }, [{ title: 'רצועות כושר להתנגדות', url: '/p/straps', type: 'product', focusKeyword: 'רצועות כושר' }], undefined, undefined, fitnessTW).matchType))
    // (e) PRESERVE with typeWords: wedding-floral pricing still owns/improves,
    // hair-loss stays relevant, singular/plural morphology still shares.
    check('P0-preserve: wedding-floral pricing still owns/improves even with flower domain words stripped',
      ['owns_need', 'improve'].includes(assessNeedCannibalization({ primaryKeyword: 'מחיר סידור פרחים לחתונה', title: 'כמה עולה סידור פרחים לחתונה', intent: 'transactional' }, [{ title: 'כמה עולה עיצוב פרחוני לחתונה', url: '/wf', focusKeyword: 'עיצוב פרחוני לחתונה' }], undefined, undefined, flowerTW).matchType))
    check('P0-preserve: singular/plural "סידור פרחים" ⇄ "סידורי פרחים" still share a head (morphology)', sharesSubjectHead('סידור פרחים', 'סידורי פרחים מעוצבים', flowerTW))
    check('P0-preserve: hair-loss topic → hair-loss article stays RELEVANT (no domain words for a general shop)',
      sharesSubjectHead('נשירת שיער', 'טיפול בנשירת שיער', new Set()))

    // ── P0 (2): title↔keyword alignment uses the SAME discriminative core —
    // a generic business/container word ("חברה") can NOT align an off-subject
    // demand to a title; domain CONTENT words and real subjects still align.
    check('P0-align: generic "מזכירות חברה" does NOT align with an off-subject office-cleaning title',
      !isTitleKeywordAligned('מזכירות חברה', 'שירותי ניקיון משרדים לעסקים בתל אביב'))
    check('P0-align: generic "ניהול חברה" does NOT align with a cleaning guide title',
      !isTitleKeywordAligned('ניהול חברה', 'מדריך ניקיון משרדים יסודי'))
    check('P0-align preserve: "מיכל הדחה" aligns with a fault-repair title (concrete subject shared)',
      isTitleKeywordAligned('מיכל הדחה', 'מיכל הדחה דולף? כך מתקנים תקלה נפוצה'))
    check('P0-align preserve: "אופנה לנשים" aligns with a women\'s-fashion title (domain content is legitimate subject)',
      isTitleKeywordAligned('אופנה לנשים', 'טרנדים חמים באופנה לנשים לעונת החורף'))
    check('P0-align preserve: floral paraphrase still aligns', isTitleKeywordAligned('מחיר סידור פרחים לחתונה', 'כמה עולה סידור פרחים לחתונה? פירוט מחירים'))

    // ── P0 (3): same-domain, different concrete heads are NOT a same-need dup;
    // a genuine same-need pair still is.
    check('P0-dup: two products sharing only the domain words ("ציוד כושר") are NOT a same-need duplicate',
      !isSameNeedDuplicate({ primaryKeyword: 'ציוד כושר משקולות', title: 'ציוד כושר משקולות', intent: 'transactional' }, { primaryKeyword: 'ציוד כושר רצועות', title: 'ציוד כושר רצועות', intent: 'transactional' }, fitnessTW))
    check('P0-dup preserve: a genuine same-need price pair is STILL a duplicate',
      isSameNeedDuplicate({ primaryKeyword: 'מחיר בניית דף נחיתה', title: 'כמה עולה לבנות דף נחיתה', intent: 'transactional' }, { primaryKeyword: 'מחיר בניית דף נחיתה', title: 'כמה עולה לבנות דף נחיתה? המדריך המלא', intent: 'informational' }, new Set()))
  }

  console.log('P0-3) primary keyword → clean search phrase (headlines rejected)')
  {
    const cases: { inp: string; subj: string; aligned?: string }[] = [
      { inp: 'מהי הרמה המומלצת של ויטמין D בדם ואיך מגיעים אליה?', subj: 'רמה מומלצת של ויטמין D בדם' },
      { inp: 'מחפשים חנות פרחים בירושלים? כך תמצאו את הזר המושלם', subj: 'חנות פרחים בירושלים', aligned: 'חנות פרחים בירושלים' },
      { inp: 'כמה עולה סידור פרחים לחתונה? פירוט מחירים וטיפים לחיסכון', subj: 'סידור פרחים לחתונה' },
      { inp: 'מהו מסמך אפיון ואיך הוא תורם להצלחת הפרויקט הדיגיטלי שלכם?', subj: 'מסמך אפיון' },
      { inp: 'מהם מוצרי הבריאות מהטבע שכדאי להכיר?', subj: 'מוצרי בריאות מהטבע' },
    ]
    for (const c of cases) {
      const r = normalizeToSearchPhrase(c.inp, { subject: c.subj, alignedQuery: c.aligned ?? null })
      check(`headline INPUT is rejected by the quality gate: "${c.inp.slice(0, 26)}…"`, !isSearchPhraseQuality(c.inp))
      check(`NORMALIZED output is a clean search phrase: "${r.keyword}"`, isSearchPhraseQuality(r.keyword) && r.keyword.length > 0 && r.keyword.split(/\s+/).length <= 7)
    }
    // The specific price-intent rewrite.
    check('"כמה עולה X" → price phrase "מחיר X"', normalizeToSearchPhrase('כמה עולה סידור פרחים לחתונה? פירוט מחירים', { subject: 'סידור פרחים לחתונה' }).keyword.startsWith('מחיר'))
    // ISSUE 5 (live) — mid/tail "המדריך ל…" guide framing must not survive.
    check('Issue5: "ויטמין D המדריך להשוואת סוגים ומינונים" FAILS the quality gate', !isSearchPhraseQuality('ויטמין D המדריך להשוואת סוגים ומינונים'))
    {
      const r5 = normalizeToSearchPhrase('ויטמין D המדריך להשוואת סוגים ומינונים', { subject: 'השוואת סוגי ויטמין D', alignedQuery: 'השוואת סוגי ויטמין D' })
      check('Issue5: normalized output is clean and drops "המדריך"', isSearchPhraseQuality(r5.keyword) && !/מדריך/.test(r5.keyword) && r5.changed)
      check('Issue5: normalized output is NOT the over-broad residue "ויטמין D" and keeps comparison/type intent', r5.keyword !== 'ויטמין D' && /השוואת|סוג/.test(r5.keyword))
    }
    // NS-1 (live) — a "המדריך לשנת 2026" tail must not leave the year as the keyword.
    check('NS1: "שנת 2026" has NO real subject token; "ויטמין D" has one', !keywordHasRealSubject('שנת 2026') && keywordHasRealSubject('ויטמין D'))
    check('NS1: keyword collapsed to a year does NOT preserve the brief subject', !keywordPreservesSubject('שנת 2026', 'ויטמין D מומלץ', 'ויטמין D מומלץ'))
    {
      const rns = normalizeToSearchPhrase('המדריך לשנת 2026', { subject: 'ויטמין D מומלץ', alignedQuery: 'ויטמין D מומלץ' })
      check('NS1: normalize repairs "המדריך לשנת 2026" back to the real subject (not "שנת 2026")', rns.keyword !== 'שנת 2026' && keywordHasRealSubject(rns.keyword) && /ויטמין/.test(rns.keyword))
    }
    // A clean short query is left unchanged.
    check('a clean short query passes unchanged', normalizeToSearchPhrase('חנות פרחים בירושלים', { subject: 'חנות פרחים בירושלים' }).changed === false)
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}
main()
