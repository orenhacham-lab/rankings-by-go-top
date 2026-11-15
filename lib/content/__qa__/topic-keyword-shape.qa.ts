/**
 * A TOPIC'S TARGET KEYWORD IS A PHRASE, NEVER A TITLE.
 *
 * `article_topics.primary_keyword` is the article generator's focus keyword, the
 * WordPress/Yoast focus keyword and the FIRST anchor candidate for every internal
 * link into that article. Measured in Production on 15 November 2026: of 934 rows,
 * 37 across 17 projects held a title or a multi-clause headline there. The proven
 * write-side source was topic-topup.ts, which stored the idea's own TITLE whenever
 * the idea carried no keyword.
 *
 * Sections:
 *   A  topicKeywordFrom — the stored value, from real Production strings
 *   B  usableTargetKeyword / isUsableTargetKeyword — the read-side judgement
 *   C  source guard: topic-topup stores the derived keyword, not the title
 *   D  anchors are capped at MAX_ANCHOR_WORDS from EVERY source, keyword included
 */
import { readFileSync } from 'fs'
import { join } from 'path'

import { topicKeywordFrom, usableTargetKeyword, isUsableTargetKeyword } from '../keyword-shape'
import { manualAnchorShapeValid, MAX_ANCHOR_WORDS } from '../internal-links'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const read = (p: string) => readFileSync(join(__dirname, p), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

// Real values measured in Production on 15 November 2026 (article_topics).
const PROD_TITLE_AS_KEYWORD = 'אילו אביזרי יוגה חיוניים למתרגלים מתחילים ומתקדמים?'
const PROD_GUIDE_TITLE = 'מדריך לבחירת חנות פרחים ברמת השרון'
const PROD_GOOD_KEYWORD = 'משלוח פרחים בתל אביב'

function sectionA() {
  console.log('A) topicKeywordFrom — what gets STORED')

  check('A1. a real phrase of the idea\'s own is kept unchanged',
    topicKeywordFrom(PROD_GOOD_KEYWORD, 'איך לבחור משלוח פרחים לאירוע') === PROD_GOOD_KEYWORD)

  check('A2. no keyword + a guide title → the title\'s SUBJECT, not the title',
    topicKeywordFrom(null, PROD_GUIDE_TITLE) === 'בחירת חנות פרחים ברמת השרון')

  check('A3. an empty keyword is treated as absent', topicKeywordFrom('   ', PROD_GUIDE_TITLE) === 'בחירת חנות פרחים ברמת השרון')

  // THE DEFECT ITSELF: the old code returned the title here.
  const q = topicKeywordFrom(null, PROD_TITLE_AS_KEYWORD)
  check('A4. a title that is not a phrase even after stripping → null, never the title',
    q === null, `got ${JSON.stringify(q)}`)

  check('A5. a two-clause title → null', topicKeywordFrom(null, 'מה הופך אתר ל"מורכב" ומתי תצטרכו פרילנסר מומחה?') === null)

  check('A6. no keyword and no title → null', topicKeywordFrom(null, '') === null)

  // A4-MUT — the control: the OLD rule (keyword || title) on the same input
  // returns the title, so A4 fails against the code this change replaced.
  const oldRule = (kw: string | null, title: string) => (kw ?? '').trim() || title
  check('A4-MUT. control: the replaced rule returns the title for A4\'s input',
    oldRule(null, PROD_TITLE_AS_KEYWORD) === PROD_TITLE_AS_KEYWORD)
}

function sectionB() {
  console.log('B) the read-side judgement')

  check('B1. a phrase is usable', isUsableTargetKeyword(PROD_GOOD_KEYWORD) && usableTargetKeyword(PROD_GOOD_KEYWORD) === PROD_GOOD_KEYWORD)
  check('B2. a two-clause headline is not usable', !isUsableTargetKeyword('ספורט בגיל השלישי מה מותר? כללי בטיחות והמלצות'))
  check('B3. empty and null are not usable', !isUsableTargetKeyword(null) && !isUsableTargetKeyword('') && usableTargetKeyword(undefined) === null)
  check('B4. usableTargetKeyword trims', usableTargetKeyword(`  ${PROD_GOOD_KEYWORD}  `) === PROD_GOOD_KEYWORD)
}

function sectionC() {
  console.log('C) source guard — topic-topup stores the derived keyword')

  const src = strip(read('../automation/topic-topup.ts'))
  check('C1. the insert uses topicKeywordFrom', /primary_keyword:\s*topicKeywordFrom\(idea\.primary_keyword,\s*idea\.title\)/.test(src))
  check('C2. the title fallback is gone from the insert', !/primary_keyword:\s*\(idea\.primary_keyword[^)]*\)\.trim\(\)\s*\|\|\s*idea\.title/.test(src))

  // C-MUT — the control: restore the old expression and C1/C2 both fail.
  const mutant = src.replace(
    /primary_keyword:\s*topicKeywordFrom\(idea\.primary_keyword,\s*idea\.title\)/,
    "primary_keyword: (idea.primary_keyword ?? '').trim() || idea.title",
  )
  check('C-MUT. control: the guards fail on the pre-fix expression',
    mutant !== src
    && !/primary_keyword:\s*topicKeywordFrom\(idea\.primary_keyword,\s*idea\.title\)/.test(mutant)
    && /primary_keyword:\s*\(idea\.primary_keyword[^)]*\)\.trim\(\)\s*\|\|\s*idea\.title/.test(mutant))
}

function sectionD() {
  console.log('D) an anchor is a phrase, from every source')

  // suggestInternalLinks runs in the browser (it needs DOMParser), so the rule is
  // proven here on its pure parts plus a source guard on the loop that applies it.
  const sentence = 'אילו אביזרי יוגה חיוניים למתרגלים מתחילים ומתקדמים'
  const phrase = 'אביזרי יוגה למתחילים'

  check('D1. one limit, shared by the hand-typed anchor rule', MAX_ANCHOR_WORDS === 6)
  check('D2. a sentence fails the shape rule, a 3-word phrase passes',
    !manualAnchorShapeValid(sentence) && manualAnchorShapeValid(phrase))
  check('D3. a 6-word phrase is still allowed (the cap is not stricter than it was)',
    manualAnchorShapeValid('אביזרי יוגה למתחילים ומתקדמים בתל אביב'))

  const src = strip(read('../internal-links.ts'))
  check('D4. every anchor candidate, the defined keyword included, passes the cap',
    /for \(const r of raw\) \{[\s\S]*?if \(wordCount\(r\.text\) > MAX_ANCHOR_WORDS\) \{[\s\S]*?continue/.test(src))
  check('D5. the refusal carries a reason, so it is visible in the anchor debug',
    /reason: 'too-long-for-anchor'/.test(src))
  check('D6. the cap is not keyed on the source (it applies to the keyword too)',
    !/wordCount\(r\.text\) > MAX_ANCHOR_WORDS && r\.source/.test(src))

  // D-MUT — the control: with the cap removed, D4 and D5 both fail.
  const mutant = src.replace(/if \(wordCount\(r\.text\) > MAX_ANCHOR_WORDS\) \{[\s\S]*?\n      \}/, '')
  check('D-MUT. control: the guards fail once the cap is taken out',
    mutant !== src
    && !/if \(wordCount\(r\.text\) > MAX_ANCHOR_WORDS\)/.test(mutant)
    && !/reason: 'too-long-for-anchor'/.test(mutant))
}

function main() {
  sectionA()
  sectionB()
  sectionC()
  sectionD()
  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}
main()

export {}
