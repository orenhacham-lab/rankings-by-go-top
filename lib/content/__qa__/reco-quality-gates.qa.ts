/**
 * QUALITY-GATE regressions (live report round 3) — pure, deterministic.
 * Every accepted-output defect the live /reco-qa PASS falsely allowed:
 *   P0-1 link relevance (colour/generic/container/coverage) — 6 live pairs;
 *   P0-2 cannibalization + synonym/need duplicates — Natural/Flowers/Matalon;
 *   P0-3 headline → search-phrase normalization — 5 live keywords.
 */
import { evaluateLink, isRelevantLink } from '../recommendations/link-relevance'
import { isSameNeedDuplicate, assessNeedCannibalization } from '../recommendations/coverage'
import { normalizeToSearchPhrase, isSearchPhraseQuality } from '../recommendations/search-phrase'

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
    // LEGITIMATE links stay relevant.
    const rel = (kw: string, title: string, cand: string, role = 'supporting_informational_link') =>
      isRelevantLink(evaluateLink({ primaryKeyword: kw, title }, { url: '/p/x', title: cand, role }), role)
    check('roses → rose bouquet (subject head shared)', rel('ורדים ורודים', 'איך לשמור על ורדים ורודים', 'זר ורדים אדומים'))
    check('roses → rose care guide (subject head shared)', rel('ורדים ורודים', 'איך לשמור על ורדים ורודים', 'טיפוח ורדים בבית'))
    check('Vitamin D level → Vitamin D supplement (subject head)', rel('רמה מומלצת ויטמין D בדם', 'רמה מומלצת של ויטמין D בדם', 'תוסף ויטמין D 1000'))
    check('spec-document article → spec-writing SERVICE (commercial owns subject)', rel('מסמך אפיון', 'מהו מסמך אפיון', 'שירותי כתיבת מסמך אפיון', 'primary_commercial_target'))
    // A page that owns the informational need is NOT a supporting link.
    const cov = evaluateLink({ primaryKeyword: 'מסמך אפיון', title: 'מהו מסמך אפיון' }, { url: '/b/x', title: 'מסמך אפיון: מדריך מלא', role: 'supporting_informational_link' })
    check('page owning the need → coverage signal, not a supporting link', cov.coverageOwned && !isRelevantLink(cov, 'supporting_informational_link'))
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
    check('distinct topic NOT cannibalized',
      assessNeedCannibalization({ primaryKeyword: 'טיפוח ורדים בבית', title: 'איך לטפח ורדים בבית', intent: 'informational' },
        [{ title: 'משלוח פרחים בירושלים', url: '/d' }]).matchType === 'distinct')
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
    // A clean short query is left unchanged.
    check('a clean short query passes unchanged', normalizeToSearchPhrase('חנות פרחים בירושלים', { subject: 'חנות פרחים בירושלים' }).changed === false)
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}
main()
