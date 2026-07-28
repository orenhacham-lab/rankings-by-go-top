/**
 * A1 — isTitleKeywordAligned: SOURCE-token ratio + morphology folding.
 * A2 — isSearchPhraseQuality: the opener cap matches the general cap.
 *
 * A1 DEFECT, measured on nagler's two GSC candidates (stage
 * final_title_keyword_alignment, sharesSubjectHead TRUE in both):
 *   kw "איך להוציא אלכוהול מהגוף" / title "איך הגוף מפרק אלכוהול והאם ניתן לזרז…"
 *     expanded kwSet=5, shared=2 -> 0.40 REJECT  |  source tokens 2/3 -> 0.67 ALIGN
 * The ratio expanded the KEYWORD into variants and divided by the expanded set, so
 * folding inflated the denominator as fast as the numerator. Counting each source
 * token ONCE, matched through constructStateVariants, is the fix. Proclitic folding
 * was already sufficient for these two pairs — the denominator was the defect.
 *
 * A1 IS NOT PURELY PERMISSIVE. sharesSubjectHead is unchanged and still gates, but the
 * ratio now measures a different quantity, so a keyword whose tokens are mostly ABSENT
 * from the title is rejected where the expanded set previously found incidental variant
 * overlap. Section C pins that class.
 *
 * A2 DEFECT: an opener-led query got 5 tokens while every other query got
 * MAX_SEARCH_TOKENS + 1, so identical phrases passed or failed on their first word.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { isTitleKeywordAligned } from '../recommendations/coverage'
import { isSearchPhraseQuality } from '../recommendations/search-phrase'

let pass = 0, fail = 0
function check(n: string, c: boolean, d?: string) { if (c) { pass++; console.log(`  ✓ ${n}`) } else { fail++; console.log(`  ✗ ${n}${d?` — ${d}`:''}`) } }
const ROOT = join(__dirname, '..', '..', '..')
const read = (r: string) => readFileSync(join(ROOT, r), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

function main() {
  console.log('A1 title alignment + A2 opener cap\n')

  console.log('A) THE REAL nagler GSC pairs (stage final_title_keyword_alignment)')
  check('A1. "איך להוציא אלכוהול מהגוף" now aligns with its real title',
    isTitleKeywordAligned('איך להוציא אלכוהול מהגוף', 'איך הגוף מפרק אלכוהול והאם ניתן לזרז את התהליך?'))
  check('A2. "איך אלכוהול משפיע על הגוף" now aligns with its real title',
    isTitleKeywordAligned('איך אלכוהול משפיע על הגוף', 'מה קורה לגוף ששותים אלכוהול? ההשפעות המיידיות וארוכות הטווח'))

  console.log('\nB) previously false-rejected morphology pairs')
  for (const [l, k, t] of [
    ['construct state זרי/זר', 'זרי ורדים', 'כיצד לבחור זר ורדים מרשים לאירוע'],
    ['plural/singular נעלי/נעל', 'נעלי ריצה', 'איך לבחור נעל ריצה מתאימה'],
    ['construct state משלוחי/משלוח', 'משלוחי מתנות', 'רעיונות למשלוח מתנות לכל אירוע'],
    ['proclitic בפתח/פתח', 'זר פרחים פתח תקווה', 'מחפשים זר פרחים בפתח תקווה? טיפים'],
    ['plain control (unchanged)', 'זר כלה קלאסי', 'איך לבחור זר כלה קלאסי לחתונה'],
  ] as [string,string,string][]) check(`B. aligns: ${l}`, isTitleKeywordAligned(k, t))

  console.log('\nC) the guard HOLDS — off-subject pairs still rejected')
  for (const [l, k, t] of [
    ['D5 groom shoes / suit title', 'נעליים לחתן', 'איך לבחור חליפת חתן לחתונה'],
    ['unrelated subject', 'זר כלה ורדים לבנים', 'טיפוח צמחי בית בחורף'],
    ['different product', 'מדיח כלים', 'איך לבחור מקרר גדול למשפחה'],
    ['most of the keyword absent', 'זר כלה ורדים אדומים יוקרתי', 'טיפוח צמחי בית'],
    ['unrelated service', 'אלכוהול והכבד', 'איך לבחור חברת הובלות'],
    ['no real overlap', 'אלכוהול בהריון', 'טיפים לבחירת נורות לד'],
  ] as [string,string,string][]) check(`C. still rejects: ${l}`, !isTitleKeywordAligned(k, t))
  // The DELIBERATE tightening — a pair that ALIGNED before this change.
  check('C-TIGHTEN. same head, incompatible subtype: "שמלת כלה" vs an evening-dress title',
    !isTitleKeywordAligned('שמלת כלה', 'איך לבחור שמלת ערב לאירוע'))

  console.log('\nD) A2 — opener-led queries get the same budget')
  for (const [l, k] of [
    ['6 tokens', 'איך לשמור על זר פרחים טרי'],
    ['7 tokens', 'איך לשמור על זר פרחים טרי בבית'],
    ['7 tokens, different opener', 'איך לבחור זר כלה מתאים לחתונה בקיץ'],
    ['5 tokens (passed before too)', 'איך לשמור על זר פרחים'],
  ] as [string,string][]) check(`D. passes: ${l} ${JSON.stringify(k)}`, isSearchPhraseQuality(k))
  check('D5. the opener-less twin still passes (the asymmetry is gone)',
    isSearchPhraseQuality('שמירה על זר פרחים טרי') && isSearchPhraseQuality('איך לשמור על זר פרחים טרי'))
  console.log('   headlines still rejected:')
  for (const [l, k] of [
    ['two clauses', 'זר כלה מושלם? כל מה שצריך לדעת'],
    ['colon subtitle', 'זר כלה: המדריך המלא'],
    ['dangling connective', 'זר כלה של'],
    ['opener over the cap (9t)', 'איך לבחור זר כלה מתאים במיוחד לחתונה גדולה בקיץ'],
  ] as [string,string][]) check(`D. rejects: ${l}`, !isSearchPhraseQuality(k))

  console.log('\nE) source contract')
  const cov = strip(read('lib/content/recommendations/coverage.ts'))
  const sp = strip(read('lib/content/recommendations/search-phrase.ts'))
  check('E1. the ratio counts SOURCE tokens, not the expanded set',
    /const matched = kwSource\.filter\(\(t\) => constructStateVariants\(t\)\.some\(\(v\) => titleVariants\.has\(v\)\)\)\.length/.test(cov)
    && /matched \/ kwSource\.length < 0\.6/.test(cov))
  check('E2. the 0.6 threshold itself is UNCHANGED', /< 0\.6/.test(cov))
  check('E3. sharesSubjectHead remains the second, independent guard',
    /return sharesSubjectHead\(primaryKeyword, title\)/.test(cov))
  check('E4. A2 uses MAX_SEARCH_TOKENS, not a literal 5',
    /if \(toks\.length > MAX_SEARCH_TOKENS\) return false/.test(sp) && !/if \(toks\.length > 5\) return false/.test(sp))
  check('E5. the general cap is untouched', /if \(toks\.length > MAX_SEARCH_TOKENS \+ 1\) return false/.test(sp))
  check('E6. neither function takes project state (system-wide, no per-project branching)',
    /export function isTitleKeywordAligned\(primaryKeyword: string, title: string\): boolean/.test(cov)
    && /export function isSearchPhraseQuality\(keyword: string\): boolean/.test(sp))

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}
main()
