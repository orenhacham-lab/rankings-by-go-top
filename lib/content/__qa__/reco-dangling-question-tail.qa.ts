/**
 * Dangling terminal question-word QA (DANGLING_TAIL_RE).
 *
 * DEFECT: normalizeToSearchPhrase strips a headline's opener and can return a mid-clause
 * fragment. HEADLINE_TAIL_RE catches a coordinating question clause only MID-phrase (its
 * `ו?איך\s.*` / `ו?כיצד\s.*` branches require whitespace AND more text after the word), and
 * DANGLING_TAIL_RE listed only bare connectives — so a phrase whose LAST token was that
 * question word matched neither. Live consequence: the headline
 *   "מדוע נשים בוחרות בשמים מתוקים ואיך למצוא את הניחוח המדויק עבורך?"
 * was stripped to "נשים בוחרות בשמים מתוקים ואיך", which PASSED isSearchPhraseQuality
 * (5 tokens, opener removed) and was ACCEPTED as a primary keyword — a fragment nobody
 * searches, so the published article targeted nothing. The repair produced garbage to
 * satisfy the very gate it was repairing for.
 *
 * FIX: one alternation added to DANGLING_TAIL_RE (a REJECTION regex), so the predicate
 * becomes strictly MORE restrictive and cannot accept anything it previously rejected.
 *
 * The list is TWO words by measurement, not by omission: across 1,068 real Hebrew phrases
 * from the project corpora, terminal `איך` occurred twice (both fragments) and terminal
 * `כיצד`/`מה`/`למה`/`מדוע`/`האם` occurred ZERO times. Section D asserts the four omitted
 * words are NOT matched, so a future reader knows the narrowing was deliberate.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { isSearchPhraseQuality, normalizeToSearchPhrase } from '../recommendations/search-phrase'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

function main() {
  console.log('Dangling terminal question-word — DANGLING_TAIL_RE\n')

  // ── A) the production defect ──────────────────────────────────────────────────
  console.log('A) the fragment that reached Production is now rejected')
  {
    check('A1. "נשים בוחרות בשמים מתוקים ואיך" (the ACCEPTED keyword) → rejected',
      !isSearchPhraseQuality('נשים בוחרות בשמים מתוקים ואיך'))
    check('A2. "זר פרחים ואיך" → rejected', !isSearchPhraseQuality('זר פרחים ואיך'))
    check('A3. the original headline was ALREADY rejected (6 tokens + opener) — unchanged',
      !isSearchPhraseQuality('מדוע נשים בוחרות בשמים מתוקים ואיך'))
    // SECOND-ORDER BENEFIT (measured, not designed): stripHeadlineFraming applies
    // DANGLING_TAIL_RE as its final cleanup step, so widening that regex means the
    // normalizer now TRIMS the dangling tail instead of emitting it. The candidate keeps a
    // valid on-subject keyword rather than being rejected — strictly better than the
    // rejection this fix was scoped to produce. normalizeToSearchPhrase itself is untouched.
    const sp = normalizeToSearchPhrase('מדוע נשים בוחרות בשמים מתוקים ואיך', { subject: 'בשמים מתוקים', alignedQuery: null })
    check('A4. the normalizer now TRIMS the dangling tail (no ואיך in the output)',
      !/ואיך$/.test(sp.keyword), JSON.stringify(sp))
    check('A5. …and the trimmed keyword is a VALID search phrase (accept with a good keyword)',
      isSearchPhraseQuality(sp.keyword), JSON.stringify(sp))
    check('A5b. specifically: "נשים בוחרות בשמים מתוקים"', sp.keyword === 'נשים בוחרות בשמים מתוקים', sp.keyword)
    check('A6. bare terminal איך (no vav) also rejected', !isSearchPhraseQuality('בשמים מתוקים איך'))
    check('A7. terminal כיצד rejected', !isSearchPhraseQuality('בשמים מתוקים וכיצד'))
    check('A8. a trailing question mark does not evade the rule', !isSearchPhraseQuality('זר פרחים ואיך?'))
  }

  // ── B) legitimate phrases still pass ──────────────────────────────────────────
  console.log('\nB) legitimate phrases are untouched')
  {
    const ok = [
      'איך לשמור על זר פרחים',      // opener-led — the word is FIRST, not last
      'כיצד לבחור בושם',
      'מה ההבדל בין בשמים',
      'בושם לאישה מה מתאים',        // מה mid-phrase
      'משלוח פרחים לחתונה',
      'סידורי פרחים לאירוע',
      'בשמים מתוקים לנשים',
    ]
    for (const p of ok) check(`B. passes: ${p}`, isSearchPhraseQuality(p))
  }

  // ── C) MONOTONICITY — the change can only reject more, never accept more ──────
  console.log('\nC) monotonicity — strictly more restrictive')
  {
    // Re-implement the PREVIOUS rule and prove the new predicate rejects a superset.
    const OLD_DANGLING = /\s+(?:של|עם|או|ו|כי|עבור|לפי|על|אל|את|כדי|and|or|of|for|with|to)\s*$/i
    const NEW_TERMINAL = /\s+ו?(?:איך|כיצד)[?!]?\s*$/i
    const corpus = [
      'נשים בוחרות בשמים מתוקים ואיך', 'זר פרחים ואיך', 'בשמים מתוקים וכיצד',
      'איך לשמור על זר פרחים', 'כיצד לבחור בושם', 'מה ההבדל בין בשמים',
      'בושם לאישה מה מתאים', 'כמה עולה בושם', 'זר פרחים ומה עוד',
      'משלוח פרחים לחתונה', 'זר פרחים של', 'בושם עם', 'סידורי פרחים לאירוע',
    ]
    // Anything the OLD dangling rule matched must STILL be rejected.
    const oldMatched = corpus.filter((p) => OLD_DANGLING.test(p))
    check('C1. every phrase the OLD dangling rule caught is still rejected',
      oldMatched.length > 0 && oldMatched.every((p) => !isSearchPhraseQuality(p)),
      JSON.stringify(oldMatched))
    // The ONLY newly-rejected phrases are ones matching the new terminal branch.
    // Phrases rejected on main for reasons UNRELATED to this change (HOW_MUCH_RE,
    // HEADLINE_TAIL_RE, the opener cap). Measured against main — they must stay rejected,
    // and they are NOT evidence of a regression from this change.
    const preExistingRejects = ['כמה עולה בושם', 'זר פרחים ומה עוד', 'מדוע נשים בוחרות בשמים מתוקים ואיך']
    check('C2. phrases already rejected on main (unrelated rules) are still rejected',
      preExistingRejects.every((p) => !isSearchPhraseQuality(p)))
    check('C2b. the ONLY phrases newly rejected carry a terminal question word',
      corpus.filter((p) => !isSearchPhraseQuality(p) && !OLD_DANGLING.test(p) && !preExistingRejects.includes(p))
            .every((p) => NEW_TERMINAL.test(p)),
      JSON.stringify(corpus.filter((p) => !isSearchPhraseQuality(p) && !OLD_DANGLING.test(p) && !preExistingRejects.includes(p))))
    check('C3. every phrase without a terminal question word and without an old connective still passes',
      corpus.filter((p) => !NEW_TERMINAL.test(p) && !OLD_DANGLING.test(p) && !preExistingRejects.includes(p))
            .every((p) => isSearchPhraseQuality(p)))
    // Structural: the change only ADDED an alternation to a rejection regex.
    const src = stripComments(read('lib/content/recommendations/search-phrase.ts'))
    check('C4. DANGLING_TAIL_RE retains every original connective',
      ['של', 'עם', 'או', 'כי', 'עבור', 'לפי', 'על', 'אל', 'את', 'כדי', 'and', 'or', 'of', 'for', 'with', 'to']
        .every((w) => new RegExp(`\\|${w}\\||\\(\\?:${w}\\|`).test(src) || src.includes(`|${w}|`)))
    check('C5. the new branch is inside DANGLING_TAIL_RE (a rejection regex), not a new accept path',
      /const DANGLING_TAIL_RE = \/.*ו\?\(\?:איך\|כיצד\)\[\?!\]\?.*\/i/.test(src))
  }

  // ── D) the narrowing is DELIBERATE and measured ───────────────────────────────
  console.log('\nD) the omitted question words are deliberately NOT matched')
  {
    // Terminal מה / למה / מדוע / האם occurred ZERO times in 1,068 real corpus phrases.
    // Adding them would be dead weight; assert they do not fire so the omission is explicit.
    const notMatched: [string, string][] = [
      ['מה', 'בושם לאישה ומה'],
      ['למה', 'בושם לאישה ולמה'],
      ['מדוע', 'בושם לאישה ומדוע'],
      ['האם', 'בושם לאישה והאם'],
    ]
    for (const [w, phrase] of notMatched) {
      check(`D. terminal ${w} is NOT matched by the dangling rule (measured: 0 real occurrences)`,
        isSearchPhraseQuality(phrase), phrase)
    }
    check('D5. the regex source lists exactly two question words',
      /ו\?\(\?:איך\|כיצד\)/.test(stripComments(read('lib/content/recommendations/search-phrase.ts'))))
  }

  // ── E) the repair chain still runs — a fragment does not silently vanish ──────
  console.log('\nE) the repair chain is intact')
  {
    const gfb = stripComments(read('lib/content/recommendations/generate-from-briefs.ts'))
    check('E1. the search-phrase gate still rejects with the SAME typed reason',
      /if \(!isSearchPhraseQuality\(primaryKeyword\)\) return rej\('primary_keyword_not_search_phrase', 'search_phrase_quality'\)/.test(gfb))
    check('E2. repair candidates are still alignedDemandQuery → brief.subject',
      /const repairCandidates = \[brief\.alignedDemandQuery\?\.query, brief\.subject\]/.test(gfb))
    check('E3. normalizeToSearchPhrase is still called with the brief context (untouched)',
      /normalizeToSearchPhrase\(primaryKeyword, \{ subject: brief\.subject, alignedQuery: brief\.alignedDemandQuery\?\.query \?\? null \}\)/.test(gfb))
    check('E4. subject-preservation repair path unchanged',
      /keywordPreservesSubject\(primaryKeyword, brief\.subject, alignedQ\)/.test(gfb))
    const sp = stripComments(read('lib/content/recommendations/search-phrase.ts'))
    check('E5. normalizeToSearchPhrase body untouched — still prefers aligned query then brief subject',
      /method: 'aligned_query'/.test(sp) && /method: 'brief_subject'/.test(sp) && /method: 'stripped_headline'/.test(sp))
    check('E6. HEADLINE_TAIL_RE unchanged (mid-phrase clauses still handled there)',
      /ו\?איך\\s\.\*\|ו\?כיצד\\s\.\*/.test(sp))
    check('E7. MAX_SEARCH_TOKENS and the opener cap unchanged',
      /const MAX_SEARCH_TOKENS = 7\b/.test(sp) && /if \(toks\.length > 5\) return false/.test(sp))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}
main()
