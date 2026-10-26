/**
 * Article text integrity QA — offline, pure.
 *
 * The owner reported a rare garbled word inside a published article. Three
 * text transforms could produce exactly that, each only on input the model
 * happens to write, which is why it was rare:
 *
 *   A. polishText's hyphenated definite-article strip had no left guard, so it
 *      ate the ה of a hyphenated Hebrew compound and welded the halves
 *      ("חברה-בת" → "חברבת").
 *   B. cleanMarkdown's "not mid-word" guards used \w, which is ASCII-only, so
 *      in Hebrew they guarded nothing and a word holding two underscores lost
 *      them and fused ("מילה_אחת_בלבד" → "מילהאחתבלבד").
 *   C. The internal-link insertion sites took an index from a lowercased copy
 *      and sliced the ORIGINAL with it. toLowerCase() is not length-preserving
 *      (U+0130 "İ" → the two-code-unit "i̇"), so one such character ahead of
 *      the anchor shifted every offset and the <a> landed inside a word.
 *
 * Each group ends with a MUTATION CONTROL: the pre-fix code, proving the guard
 * fails when the bug is put back.
 */
import { polishText, cleanMarkdown, stripUnrequestedYear } from '../gemini-article'
import { indexOfCaseInsensitive } from '@/lib/text/ci-index'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

/** The word-count of a string, as a reader would count it. */
const words = (s: string) => s.split(/\s+/).filter(Boolean)

async function main() {
  console.log('A) polishText never welds a hyphenated Hebrew compound')
  {
    // The compounds that were being mangled. Each must survive untouched.
    const compounds = ['חברה-בת', 'קבוצה-אם', 'שאלה-תשובה', 'תוכנה-חופשית', 'עלה-דשא', 'מערכת-על', 'עבודה-מהבית']
    for (const w of compounds) {
      check(`"${w}" survives polishText`, polishText(w, []) === w, `got "${polishText(w, [])}"`)
    }
    // And the transform still does the one job it exists for.
    check('"ה-Kingsmith" → "Kingsmith" (intended strip still fires)', polishText('ה-Kingsmith', []) === 'Kingsmith')
    check('"ה-הליכון" → "הליכון" (intended strip still fires)', polishText('ה-הליכון', []) === 'הליכון')
    check('mid-sentence "של ה-Kingsmith" still strips', polishText('של ה-Kingsmith כאן', []) === 'של Kingsmith כאן')
    check('attached definite article "המכשיר" untouched', polishText('המכשיר עובד', []) === 'המכשיר עובד')
    // A realistic sentence: the word count must not drop.
    const sent = 'חברה-בת של קבוצה-אם מציעה תוכנה-חופשית ללקוחות'
    check('no word is lost in a real sentence', words(polishText(sent, [])).length === words(sent).length)

    // MUTATION CONTROL — the pre-fix pattern (no left guard).
    const broken = (s: string) => s.replace(/ה-(?=[A-Za-zא-ת])/g, '')
    check('MUTATION: the unguarded pattern welds "חברה-בת" (guard is real)', broken('חברה-בת') === 'חברבת')
  }

  console.log('B) cleanMarkdown guards are Unicode-aware')
  {
    check('Hebrew word with two underscores is not fused', cleanMarkdown('המערכת מזהה מילה_אחת_בלבד בטקסט') === 'המערכת מזהה מילה_אחת_בלבד בטקסט')
    check('Hebrew word with two asterisks is not fused', cleanMarkdown('המערכת מזהה מילה*אחת*בלבד בטקסט') === 'המערכת מזהה מילה*אחת*בלבד בטקסט')
    // Real markdown emphasis, delimited by spaces, is still removed.
    check('real Hebrew emphasis *מאוד* is still stripped', cleanMarkdown('עולה *מאוד* בגוגל') === 'עולה מאוד בגוגל')
    check('real Hebrew emphasis _מאוד_ is still stripped', cleanMarkdown('עולה _מאוד_ בגוגל') === 'עולה מאוד בגוגל')
    check('real Latin emphasis *very* is still stripped', cleanMarkdown('rises *very* fast') === 'rises very fast')
    check('snake_case_word stays intact', cleanMarkdown('the snake_case_word here') === 'the snake_case_word here')

    // MUTATION CONTROL — the pre-fix patterns (ASCII \w, no u flag).
    const brokenMd = (t: string) => t
      .replace(/(?<![\w*])\*([^*\n]+)\*(?![\w*])/g, '$1')
      .replace(/(?<![\w_])_([^_\n]+)_(?![\w_])/g, '$1')
    check('MUTATION: the ASCII-only guards fuse the Hebrew word (guard is real)', brokenMd('מילה_אחת_בלבד') === 'מילהאחתבלבד')
  }

  console.log('C) case-insensitive search returns an offset valid in the original')
  {
    // The length-stable, ordinary case: behaves exactly like the old code.
    {
      const hay = 'קישור אל הליכון חשמלי כאן'
      const at = indexOfCaseInsensitive(hay, 'הליכון חשמלי')
      check('finds a Hebrew phrase at an offset that slices it exactly', at === hay.indexOf('הליכון חשמלי') && hay.slice(at, at + 'הליכון חשמלי'.length) === 'הליכון חשמלי')
    }
    check('is case-insensitive for Latin', indexOfCaseInsensitive('Buy a Walkingpad today', 'walkingPad') === 6)
    check('respects the from offset', indexOfCaseInsensitive('abc abc', 'abc', 1) === 4)
    check('reports a miss as -1', indexOfCaseInsensitive('nothing here', 'absent') === -1)
    check('an empty needle is a miss, never offset 0', indexOfCaseInsensitive('anything', '') === -1)

    // The corrupting case: a character whose lowercase is longer sits BEFORE
    // the anchor. The returned index must still slice the anchor exactly.
    const hay = 'ANA İSTANBUL ve walkingpad burada'
    const needle = 'walkingpad'
    const at = indexOfCaseInsensitive(hay, needle)
    check('İ ahead of the anchor: index is found', at >= 0)
    check('İ ahead of the anchor: the slice IS the anchor', hay.slice(at, at + needle.length) === needle, `got "${hay.slice(at, at + needle.length)}"`)

    // MUTATION CONTROL — the pre-fix expression.
    const brokenAt = hay.toLowerCase().indexOf(needle.toLowerCase())
    check('MUTATION: the lowercased index slices a shifted, broken span (guard is real)', hay.slice(brokenAt, brokenAt + needle.length) !== needle)
  }

  console.log('\nD) removing an unrequested year never leaves a title cut off')
  {
    // D. A production article was titled "… המדריך המלא לשנת" — the model wrote
    //    "לשנת 2026", the year was not requested so the digits were removed, and
    //    the word that introduced them was left hanging. The word goes with it.
    const none = new Set<string>()
    const cut = 'איך לבחור מנקה בתל אביב למשרד? המדריך המלא לשנת 2026'
    check('D1: the production title loses the year AND the word that introduced it',
      stripUnrequestedYear(cut, none) === 'איך לבחור מנקה בתל אביב למשרד? המדריך המלא',
      stripUnrequestedYear(cut, none))
    check('D2: mid-sentence too, with the punctuation closing up',
      stripUnrequestedYear('ניקיון משרדים בשנת 2026: מה חדש', none) === 'ניקיון משרדים: מה חדש',
      stripUnrequestedYear('ניקיון משרדים בשנת 2026: מה חדש', none))
    check('D3: a year the customer DID ask for keeps its introducing word',
      stripUnrequestedYear('המדריך המלא לשנת 2026', new Set(['2026'])) === 'המדריך המלא לשנת 2026')
    const langs: [string, string][] = [
      ['Office cleaning: the complete guide for 2026', 'Office cleaning: the complete guide'],
      ['Guía completa para el año 2026', 'Guía completa'],
      ['Guia completo para o ano 2026', 'Guia completo'],
      ["Le guide complet pour l'année 2026", 'Le guide complet'],
      ["La guida completa per l'anno 2026", 'La guida completa'],
    ]
    for (const [src, want] of langs) {
      check(`D4: ${src.split(' ')[0]} — the lead word goes too`, stripUnrequestedYear(src, none) === want, stripUnrequestedYear(src, none))
    }
    check('D5: a lead word INSIDE a longer word is untouched',
      stripUnrequestedYear('What changed within 2026 offices', none) === 'What changed within offices',
      stripUnrequestedYear('What changed within 2026 offices', none))
    check('D6: a slug keeps its shape', stripUnrequestedYear('office-cleaning-guide-2026', none) === 'office-cleaning-guide')
    check('D7: a year with no lead word before it is still removed on its own',
      stripUnrequestedYear('Top 2026 tools', none) === 'Top tools')
    check('D8: an allowed year and an unrequested one in the same string',
      stripUnrequestedYear('Top 2026 tools, 2025 pricing', new Set(['2025'])) === 'Top tools, 2025 pricing',
      stripUnrequestedYear('Top 2026 tools, 2025 pricing', new Set(['2025'])))

    // MUTATION CONTROL — the pre-fix expression: the digits alone.
    const digitsOnly = (text: string, allowed: Set<string>) => text.replace(/\b20\d{2}\b/g, (y) => (allowed.has(y) ? y : ''))
      .replace(/\s{2,}/g, ' ').replace(/\s+([,.:;!?])/g, '$1').trim()
    check('MUTATION: removing only the digits leaves the title cut off (so D1 would fail)',
      digitsOnly(cut, none).endsWith('לשנת'), digitsOnly(cut, none))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}
main()

export {}
