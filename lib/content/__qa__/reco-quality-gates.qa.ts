/**
 * QUALITY-GATE regressions (live report round 3) — pure, deterministic.
 * Every accepted-output defect the live /reco-qa PASS falsely allowed:
 *   P0-1 link relevance (colour/generic/container/coverage) — 6 live pairs;
 *   P0-2 cannibalization + synonym/need duplicates — Natural/Flowers/Matalon;
 *   P0-3 headline → search-phrase normalization — 5 live keywords.
 */
import { evaluateLink, isRelevantLink, sharesSubjectHead } from '../recommendations/link-relevance'
import { isSameNeedDuplicate, assessNeedCannibalization, incompatibleActionNeed } from '../recommendations/coverage'
import { normalizeToSearchPhrase, isSearchPhraseQuality } from '../recommendations/search-phrase'
import { assessExistingLocalOwnership, deriveCorpusTypeWords, localImprovementCompatible } from '../recommendations/opportunity-validation'

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
    // A clean short query is left unchanged.
    check('a clean short query passes unchanged', normalizeToSearchPhrase('חנות פרחים בירושלים', { subject: 'חנות פרחים בירושלים' }).changed === false)
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}
main()
