/**
 * A TOPIC'S TARGET KEYWORD IS A PHRASE, NEVER A TITLE.
 *
 * `article_topics.primary_keyword` is the article generator's focus keyword, the
 * WordPress/Yoast focus keyphrase and the FIRST anchor candidate for every internal
 * link into that article. MEASURED in Production on 15 November 2026: of 934 rows,
 * 37 across 17 projects held a title or a welded-together headline there, in 17
 * different projects; 28 had already become articles and 22 of those are published.
 *
 * Sections:
 *   A  the acceptance gate now rejects an embedded clause boundary — and NOTHING else
 *   B  topicKeywordFrom / usableTargetKeyword — what is stored, what is handed on
 *   C  the stored idea keyword loses a trailing "?" and nothing more
 *   D  source guards: the write side and the two read sides
 *
 * The corpus behind every count here is
 * `/mnt/project-files/topics-accuracy/keyword-corpus-2026-11-15.tsv` — 2,497
 * distinct primary keywords read out of Production that day.
 */
import { readFileSync } from 'fs'
import { join } from 'path'

import { topicKeywordFrom, usableTargetKeyword, isUsableTargetKeyword, normalizedIdeaKeyword } from '../keyword-shape'
import { isSearchPhraseQuality } from '../recommendations/search-phrase'
import { manualAnchorShapeValid, MAX_ANCHOR_WORDS } from '../internal-links'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const read = (p: string) => readFileSync(join(__dirname, p), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

// Real stored values, measured in Production on 15 November 2026.
const PROD_WELDED = 'חברה לבניית אתרים ומה הצעת המחיר צריכה לכלול'
const PROD_WELDED_2 = 'תקלות נפוצות במדיח וחלקי החילוף שניתן להחליף לבד'
const PROD_GOOD = 'משלוח פרחים בתל אביב'

function sectionA() {
  console.log('A) the gate rejects a clause welded mid-phrase — and nothing else')

  check('A1. "…ומה הצעת המחיר צריכה לכלול" is refused', !isSearchPhraseQuality(PROD_WELDED))
  check('A2. "…שניתן להחליף לבד" is refused', !isSearchPhraseQuality(PROD_WELDED_2))
  check('A3. the other four measured welded headlines are refused',
    !isSearchPhraseQuality('סוגי הפרחים הנפוצים בזרי פרחים ומה הם מסמלים')
    && !isSearchPhraseQuality('פרפיום (Parfum) ומדוע הוא נחשב ליוקרתי')
    && !isSearchPhraseQuality('תרגילי האירובי היעילים שניתן לבצע בכל מקום')
    && !isSearchPhraseQuality('מה הופך אתר ל"מורכב" ומתי תצטרכו פרילנסר מומחה?'))

  // A4 — THE OTHER HALF OF THE RULE, and the reason it is this short. Each line
  // below is a shape a wider rule would have caught, with the measured cost of
  // catching it. They must all stay ACCEPTED, or the next person to widen the
  // rule has reintroduced the false rejects.
  check('A4-i. ש as a root letter is untouched (an open ש rule costs 451 phrases)',
    isSearchPhraseQuality('בדיקת איכות בגדי יד שנייה לנשים') && isSearchPhraseQuality('שיפוצים בתל אביב'))
  check('A4-ii. a comparison with מול / לעומת stays (126 phrases)',
    isSearchPhraseQuality('אופניים נייחים מול אופני כושר')
    && isSearchPhraseQuality('מכונת צמר גפן מתוק ביתית מול מכונת פופקורן'))
  check('A4-iii. a leading אילו / איזה stays (10 phrases, half of them real queries)',
    isSearchPhraseQuality('איזה סוג מגנזיום מומלץ') && isSearchPhraseQuality('אילו פרחים מתאימים לזר יום הולדת'))
  check('A4-iv. a leading bare question word stays (38 phrases, ~87% real queries)',
    isSearchPhraseQuality('מה ללבוש ליוגה') && isSearchPhraseQuality('מתי כדאי לנסוע ליפן'))
  check('A4-v. a long phrase is not a headline (322 phrases, mostly real)',
    isSearchPhraseQuality('ההבדל בין או דה פרפיום לאו דה טואלט')
    && isSearchPhraseQuality('המינון היומי המומלץ של ויטמין D למבוגרים וילדים'))
  check('A4-vi. a coordinating ו before an ordinary word stays',
    isSearchPhraseQuality('בגדי יוגה נוחים ונושמים') && isSearchPhraseQuality('מתנות מגניבות וטכנולוגיות לילדים'))

  // A-MUT — the control: with the rule's own alternation removed, A1 and A2 pass
  // again, which is exactly the state the 37 rows were written in.
  const src = strip(read('../recommendations/search-phrase.ts'))
  check('A-MUT. the gate really carries the rule A1/A2 depend on', (() => {
    const mutant = src.replace(/\n\s*if \(EMBEDDED_CLAUSE_RE\.test\(k\)\) return false/, '')
    return mutant !== src && /EMBEDDED_CLAUSE_RE\.test\(k\)/.test(src) && !/EMBEDDED_CLAUSE_RE\.test\(k\)/.test(mutant)
  })())
}

function sectionB() {
  console.log('B) what is stored, and what is handed on')

  check('B1. a real phrase is kept', topicKeywordFrom(PROD_GOOD) === PROD_GOOD && usableTargetKeyword(PROD_GOOD) === PROD_GOOD)
  check('B2. a welded headline is NOT stored', topicKeywordFrom(PROD_WELDED) === null && topicKeywordFrom(PROD_WELDED_2) === null)
  check('B3. a two-clause headline is not usable', !isUsableTargetKeyword('ספורט בגיל השלישי מה מותר? כללי בטיחות והמלצות'))
  check('B4. nothing in means nothing out', topicKeywordFrom(null) === null && topicKeywordFrom('   ') === null && usableTargetKeyword(undefined) === null)
  check('B5. the value is trimmed, never otherwise rewritten', usableTargetKeyword(`  ${PROD_GOOD}  `) === PROD_GOOD)

  // B6 — the title is NOT a source. Measured: all 2,476 ideas in Production carry
  // a keyword, so the old `|| idea.title` branch had never run; and stripping a
  // title leaves a sentence in all but 4 of 2,497 real values, so deriving one
  // would have stored a sentence while looking like a fix.
  check('B6. topicKeywordFrom takes only the keyword — there is no title to fall back to',
    topicKeywordFrom.length === 1)
}

function sectionC() {
  console.log('C) the stored idea keyword')

  check('C1. a trailing question mark is dropped',
    normalizedIdeaKeyword('אילו פרחים מתאימים לזר יום הולדת?') === 'אילו פרחים מתאימים לזר יום הולדת')
  check('C2. an empty value stays empty', normalizedIdeaKeyword('') === null && normalizedIdeaKeyword(null) === null && normalizedIdeaKeyword('  ?  ') === null)

  // C3 — the measured boundary: this must NOT run the headline stripper, which
  // rewrote 156 of 2,432 real keywords and damaged most of what it touched.
  check('C3. the model\'s own phrasing is otherwise untouched',
    normalizedIdeaKeyword('איך לבחור בושם במתנה') === 'איך לבחור בושם במתנה'
    && normalizedIdeaKeyword('איך לאחסן בושם') === 'איך לאחסן בושם'
    && normalizedIdeaKeyword('Guerlain - גרלן מדריך') === 'Guerlain - גרלן מדריך')
}

function sectionD() {
  console.log('D) source guards')

  const topup = strip(read('../automation/topic-topup.ts'))
  check('D1. the topic insert stores the judged keyword', /primary_keyword:\s*topicKeywordFrom\(idea\.primary_keyword\)/.test(topup))
  check('D2. the title fallback is gone from the insert', !/primary_keyword:[^\n]*\|\|\s*idea\.title/.test(topup))
  check('D1-MUT. control: the guards fail on the pre-fix expression', (() => {
    const mutant = topup.replace(/primary_keyword:\s*topicKeywordFrom\(idea\.primary_keyword\)/, "primary_keyword: (idea.primary_keyword ?? '').trim() || idea.title")
    return mutant !== topup && !/primary_keyword:\s*topicKeywordFrom\(idea\.primary_keyword\)/.test(mutant) && /primary_keyword:[^\n]*\|\|\s*idea\.title/.test(mutant)
  })())
  // The subject gate deliberately keeps judging keyword-or-title: it needs text to
  // measure relevance against the site's vocabulary.
  check('D2-i. the subject gate still has text to judge', /researchKeywordIssue\(\(idea\.primary_keyword \?\? ''\)\.trim\(\) \|\| idea\.title/.test(topup))

  const store = strip(read('../recommendations/topic-idea-store.ts'))
  check('D3. a new idea stores the normalized keyword', /primary_keyword:\s*normalizedIdeaKeyword\(s\.primaryKeyword\)/.test(store))
  check('D3-MUT. control', (() => {
    const mutant = store.replace(/primary_keyword:\s*normalizedIdeaKeyword\(s\.primaryKeyword\)/, 'primary_keyword: s.primaryKeyword || null')
    return mutant !== store && !/normalizedIdeaKeyword\(s\.primaryKeyword\)/.test(mutant)
  })())
  check('D3-i. the dedupe fingerprint stays on the raw value', /topicIdeaFingerprint\(s\.primaryKeyword, s\.title\)/.test(store))

  const seo = strip(read('../seo-publish.ts'))
  check('D4. the WordPress focus keyphrase is only ever a real phrase', /return usableTargetKeyword\(kw\)/.test(seo))
  check('D4-MUT. control', (() => {
    const mutant = seo.replace(/return usableTargetKeyword\(kw\)/, 'return kw ? String(kw) : null')
    return mutant !== seo && !/usableTargetKeyword\(kw\)/.test(mutant)
  })())

  const links = strip(read('../internal-links.ts'))
  check('D5. every anchor candidate, the defined keyword included, passes the word cap',
    /for \(const r of raw\) \{[\s\S]*?if \(wordCount\(r\.text\) > MAX_ANCHOR_WORDS\) \{[\s\S]*?continue/.test(links)
    && /reason: 'too-long-for-anchor'/.test(links))
  check('D5-i. the cap is not keyed on the source', !/wordCount\(r\.text\) > MAX_ANCHOR_WORDS && r\.source/.test(links))
  check('D5-ii. one limit, shared with the hand-typed anchor rule',
    MAX_ANCHOR_WORDS === 6
    && !manualAnchorShapeValid('אילו אביזרי יוגה חיוניים למתרגלים מתחילים ומתקדמים')
    && manualAnchorShapeValid('אביזרי יוגה למתחילים')
    && manualAnchorShapeValid('אביזרי יוגה למתחילים ומתקדמים בתל אביב'))
  check('D5-MUT. control', (() => {
    const mutant = links.replace(/if \(wordCount\(r\.text\) > MAX_ANCHOR_WORDS\) \{[\s\S]*?\n      \}/, '')
    return mutant !== links && !/reason: 'too-long-for-anchor'/.test(mutant)
  })())
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
