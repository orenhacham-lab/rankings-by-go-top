/**
 * The article quality check read a good Hebrew article as failing:
 *   - the keyword checks were exact substrings, so a keyword that carries a
 *     prefix ("בכיור") or the construct form ("תחזוקת") was "missing" from a
 *     text that has "הכיור" / "תחזוקה";
 *   - FAQ counted only the separate FAQ list, so an article whose questions
 *     live in the body ("<h2>שאלות נפוצות</h2><h3>…?</h3>") showed FAQ 0.
 *
 * WHAT IS PROVEN HERE
 *   A. prefix / construct matching, and the cases that must stay different;
 *   B. English matching is unchanged;
 *   C. body FAQ is found (sub-heading and paragraph styles) and counted by the
 *      real audit, while an explicit FAQ list still wins;
 *   D. every audit code has a Hebrew and an English label, and the Hebrew
 *      labels on the quality card carry no English jargon;
 *   MUT. mutation controls: the previous matcher and a source without the new
 *      branches both fail.
 *
 * Run: npx tsx lib/content/__qa__/article-audit-hebrew.qa.ts
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { includesKw, hebrewWordMatches, faqFromHtml, runArticleAudit, type AuditInput } from '../article-audit'
import { getDashboardDictionary } from '../../i18n/dashboard/getDashboardDictionary'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

/** The matcher before this fix, verbatim — the mutation control runs the same cases against it. */
function legacyIncludesKw(haystack: string, kw: string): boolean {
  const h = (haystack || '').toLowerCase(); const k = (kw || '').trim().toLowerCase()
  if (!k) return true
  if (h.includes(k)) return true
  const toks = k.split(/\s+/).filter((t) => t.length > 2)
  return toks.length > 0 && toks.every((t) => h.includes(t))
}

// Cases that are the SAME keyword in natural Hebrew.
const SAME: [string, string, string][] = [
  ['keyword prefix vs another prefix', 'סתימה בכיור', 'איך מנקים את הסיפון של הכיור ומונעים סתימה'],
  ['construct form vs free form', 'תחזוקת נעלי ריצה', 'מדריך תחזוקה לנעלי ריצה'],
  ['keyword with ו+ה prefixes', 'והמחירים', 'כל המחירים לשנה הזאת'],
  ['keyword with ש prefix', 'שהדוד', 'מתי להחליף דוד שמש'],
]
// Cases that must stay DIFFERENT.
const DIFFERENT: [string, string, string][] = [
  ['two different words sharing a 3-letter tail', 'שלום עולם', 'בלום עולם'],
  ['a short word is never stripped into another', 'מים חמים', 'ים חם'],
  ['a missing word still misses', 'פתיחת סתימה בכיור', 'איך מנקים כיור'],
]

const walkBody = '<p>סתימה בכיור היא אחת התקלות הנפוצות בבית.</p><h2>למה הכיור נסתם?</h2><p>שומן ושיער מצטברים בסיפון.</p><h2>שאלות נפוצות</h2><h3>האם מותר להשתמש באקונומיקה?</h3><p>לא. היא לא ממיסה שומן ופוגעת בצנרת.</p><h3>כמה זמן לוקח?</h3><p>בערך חמש דקות.</p>'
const paraFaq = '<h2>שאלות ותשובות</h2><p>האם אפשר לבד?</p><p>כן, ברוב המקרים.</p><p>מתי מזמינים אינסטלטור?</p><p>כשהמים עולים גם אצל השכנים.</p><h2>סיכום</h2><p>שאלה בסיכום?</p>'

const auditInput = (over: Partial<AuditInput>): AuditInput => ({
  language: 'he', desiredWordCount: 1000, primaryKeyword: 'סתימה בכיור', secondaryKeywords: [], ctaPreference: null,
  ctaDetails: { text: '', phone: '', whatsapp: '', url: '' } as AuditInput['ctaDetails'], includeBrandName: false, brandName: null, businessName: null,
  title: 'איך פותחים סתימה', metaTitle: null, metaDescription: null, slug: 'x', excerpt: null, contentHtml: walkBody, faq: [], anchors: [], ...over,
})

function main() {
  console.log('A) Hebrew prefixes and construct forms')
  for (const [name, kw, hay] of SAME) check(`A-same: ${name}`, includesKw(hay, kw), `${kw} / ${hay}`)
  for (const [name, kw, hay] of DIFFERENT) check(`A-diff: ${name}`, !includesKw(hay, kw), `${kw} / ${hay}`)
  check('A-word: "בכיור" ~ "הכיור", both stripped to a 4-letter core', hebrewWordMatches('הכיור', 'בכיור'))
  check('A-word: "שלום" !~ "בלום" (3-letter core after stripping both)', !hebrewWordMatches('בלום', 'שלום'))

  console.log('\nB) English is unchanged')
  check('B1: all tokens present matches', includesKw('the best running shoes of the year', 'running shoes best'))
  check('B2: a missing token still misses', !includesKw('running shoes guide', 'best running shoes'))
  for (const [hay, kw] of [['running shoes guide', 'best running shoes'], ['shoe care', 'running shoes'], ['Running Shoes', 'running shoes']] as const) {
    check(`B3: same answer as before for "${kw}" in "${hay}"`, includesKw(hay, kw) === legacyIncludesKw(hay, kw))
  }

  console.log('\nC) FAQ written in the body is counted')
  const fromBody = faqFromHtml(walkBody)
  check('C1: sub-heading FAQ → two questions with their answers',
    fromBody.length === 2 && fromBody[0].question.includes('אקונומיקה') && fromBody[0].answer.includes('ממיסה') && fromBody[1].answer.includes('חמש'), JSON.stringify(fromBody))
  const fromParas = faqFromHtml(paraFaq)
  check('C2: paragraph FAQ → two questions, and stops at the next section', fromParas.length === 2 && fromParas[1].answer.includes('השכנים'), JSON.stringify(fromParas))
  check('C3: no FAQ heading → none', faqFromHtml('<h2>למה</h2><h3>מה?</h3><p>כך.</p>').length === 0)
  check('C4: the real audit counts body FAQ when the list is empty', runArticleAudit(auditInput({})).counts.faq === 2)
  check('C5: an explicit FAQ list still wins',
    runArticleAudit(auditInput({ faq: [{ question: 'א?', answer: 'ב' }, { question: 'ג?', answer: 'ד' }, { question: 'ה?', answer: 'ו' }] })).counts.faq === 3)
  check('C6: the real audit finds the prefixed keyword in the H2 ("הכיור" for "סתימה בכיור" needs both words)',
    !runArticleAudit(auditInput({ contentHtml: walkBody.replace('<h2>למה הכיור נסתם?</h2>', '<h2>למה יש סתימה בצנרת של הכיור?</h2>') })).warnings.includes('primary_keyword_in_h2'))

  console.log('\nD) labels')
  const auditSrc = readFileSync(join(ROOT, 'lib/content/article-audit.ts'), 'utf8')
  const codes = [...new Set([...strip(auditSrc).matchAll(/add\('([a-z0-9_]+)'/g)].map((m) => m[1]))]
  for (const lang of ['he', 'en'] as const) {
    const labels = getDashboardDictionary(lang).contentHub.editor.auditCodes as Record<string, string>
    const missing = codes.filter((c) => !labels[c])
    check(`D1[${lang}]: every audit code has a label`, missing.length === 0, missing.join(', '))
  }
  const he = getDashboardDictionary('he').contentHub.editor as unknown as Record<string, unknown>
  const heCard = [he.auditTitle, he.auditH2, he.auditH3, he.auditFaq, he.tocReady, he.tocNotReady, he.auditBlockers, he.auditBlockersPublished, he.auditWarnings,
    he.slug, he.metaTitle, he.metaDescription, he.faqTitle, ...Object.values(he.auditCodes as Record<string, string>)] as string[]
  const latin = heCard.filter((s) => typeof s !== 'string' || /[A-Za-z]{2,}/.test(s))
  check('D2: the Hebrew quality card and field labels have no English jargon (SEO, H2, FAQ, CTA, Meta…)', latin.length === 0, latin.join(' | '))

  console.log('\nMUT) mutation controls')
  const legacySame = SAME.filter(([, kw, hay]) => legacyIncludesKw(hay, kw)).length
  check('MUT1: the previous matcher misses the Hebrew cases, so A-same would fail', legacySame < SAME.length, `${legacySame}/${SAME.length}`)
  check('MUT2: the previous FAQ count (list only) is 0 for the walk body, so C4 would fail', auditInput({}).faq.length === 0 && faqFromHtml(walkBody).length > 0)
  const sourceHasBranches = (src: string) => {
    const s = strip(src)
    return /hayWords\.some\(\(w\) => hebrewWordMatches\(w, tw\)\)/.test(s) && /const faqItems = input\.faq\.length > 0 \? input\.faq : faqFromHtml\(html\)/.test(s)
  }
  check('MUT3: SOURCE — the audit uses both new branches', sourceHasBranches(auditSrc))
  const noHebrew = auditSrc.replace('return hayWords.some((w) => hebrewWordMatches(w, tw))', 'return h.includes(t)')
  check('MUT4: dropping the Hebrew branch fails MUT3', noHebrew !== auditSrc && !sourceHasBranches(noHebrew))
  const listOnly = auditSrc.replace('const faqItems = input.faq.length > 0 ? input.faq : faqFromHtml(html)', 'const faqItems = input.faq')
  check('MUT5: counting the FAQ list only fails MUT3', listOnly !== auditSrc && !sourceHasBranches(listOnly))

  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
}

main()

export {}
