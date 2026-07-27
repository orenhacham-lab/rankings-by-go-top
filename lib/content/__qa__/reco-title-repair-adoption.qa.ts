/**
 * Title-derived keyword repair — adoption test (R1 + R2).
 *
 * DEFECT, proven in Production on the florist project:
 *   modelPrimaryKeyword  "טיפול בזר ורדים"                          <- clean 3-token search phrase
 *   finalPrimaryKeyword  "לשמור על זר ורדים רענן ורענן לאורך זמן"   <- what shipped
 * repairKeywordFromTitle rebuilt the keyword from the model's own TITLE, and the only
 * adoption test was ">= 2 tokens and different from the original". The replacement was
 * never checked against isSearchPhraseQuality or the truncation regex the ORIGINAL had
 * to satisfy. The 9-token title clause was then stripped of its "איך" opener downstream
 * to exactly 8 tokens — the acceptance gate's MAX_SEARCH_TOKENS + 1 tolerance — and
 * shipped, carrying the model's own duplicated word ("רענן ורענן").
 *
 * FIX: isAdoptableTitleRepair — the repair must clear the bar the FINAL keyword clears.
 *
 * WHY isTitleKeywordAligned IS NOT IN THE PREDICATE: a title-derived keyword passes
 * title<->keyword alignment BY CONSTRUCTION (the keyword is the title). That is exactly
 * why this degradation stayed invisible. Section E asserts the vacuity so no future
 * reader adds it believing it strengthens anything.
 *
 * WHY REFUSING IS NOT REJECTING: the caller returns ok:false, and validatePolished then
 * falls through to its BRIEF-anchored repair chain (aligned demand query, then brief
 * subject). Section F pins that call shape in the engine source.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { isAdoptableTitleRepair, validateIntentKeywordConsistency, validatePrimaryKeywordQuality, isTruncatedKeywordPhrase } from '../recommendations/opportunity-validation'
import { isSearchPhraseQuality, MAX_SEARCH_TOKENS } from '../recommendations/search-phrase'
import { isTitleKeywordAligned } from '../recommendations/coverage'
import { subjectTokens } from '../recommendations/link-role-mapper'
import { normalizePhrase } from '../recommendations/keyword-guard'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
const nTok = (s: string) => s.trim().split(/\s+/).filter(Boolean).length

/**
 * The rule this REPLACES, reimplemented EXACTLY — used for the monotonicity proof.
 * It must use the same tokenizer the real rule used (`subjectTokens` via the module's
 * local `toks`), NOT whitespace words: subjectTokens STEM-EXPANDS, so a single Hebrew
 * word can yield >= 2 tokens ("פרחים" -> ["פרחימ","פרח"]). Reimplementing this with a
 * whitespace count produced a false monotonicity violation on the first run — the test
 * was wrong, not the code.
 */
const OLD_RULE = (repaired: string, original: string) =>
  subjectTokens(repaired).length >= 2 && normalizePhrase(repaired) !== normalizePhrase(original)

function main() {
  console.log('Title-derived repair adoption — isAdoptableTitleRepair\n')

  // ── A) THE 12-CASE SEPARATION MATRIX ────────────────────────────────────────
  console.log('A) separation matrix — degrading repairs refused, legitimate ones adopted')
  const MATRIX: { label: string; repaired: string; original: string; adopt: boolean }[] = [
    { label: 'florist PROVEN degradation (9t)', repaired: 'איך לשמור על זר ורדים רענן ורענן לאורך זמן', original: 'טיפול בזר ורדים', adopt: false },
    { label: 'long how-to headline (8t)', repaired: 'לבחור את זר הכלה המושלם לחתונת החורף שלכם', original: 'זר כלה', adopt: false },
    { label: 'listicle headline (8t)', repaired: 'שבע טעויות נפוצות בבחירת סידור פרחים לאירוע גדול', original: 'סידור פרחים', adopt: false },
    { label: 'exactly 8 tokens — the off-by-one', repaired: 'אחת שתיים שלוש ארבע חמש שש שבע שמונה', original: 'זר כלה', adopt: false },
    { label: 'exactly 7 tokens — the boundary', repaired: 'זר כלה קלאסי מול זר רומנטי מודרני', original: 'זר כלה', adopt: true },
    { label: 'comparison connector restored (5t)', repaired: 'זר כלה מול זר רומנטי', original: 'זר כלה פרימיום', adopt: true },
    { label: 'commercial drift stripped (4t)', repaired: 'ההבדל בין זרי כלה', original: 'זר כלה פרימיום', adopt: true },
    { label: 'local token restored (4t)', repaired: 'משלוח פרחים בתל אביב', original: 'משלוח פרחים', adopt: true },
    { label: 'short main clause (3t)', repaired: 'טיפוח צמחי בית', original: 'צמחים', adopt: true },
    { label: 'truncated tail', repaired: 'זר כלה קלאסי ואיך', original: 'זר כלה', adopt: false },
    { label: 'identical to the original', repaired: 'זר כלה', original: 'זר כלה', adopt: false },
    { label: 'genuinely single-token repair', repaired: 'זר', original: 'זר כלה', adopt: false },
    // PRE-EXISTING, OUT OF SCOPE, RECORDED: the ">= 2 tokens" condition (unchanged by
    // this commit) counts subjectTokens, which STEM-EXPANDS — "פרחים" -> ["פרחימ","פרח"].
    // So a single Hebrew word can satisfy a rule written to mean "multi-word". The OLD
    // rule adopted it too; this commit neither fixes nor worsens it. Asserted as the
    // CURRENT behaviour so the latent defect is visible rather than implied.
    { label: 'single Hebrew word whose stem expands (pre-existing, adopted by BOTH rules)', repaired: 'פרחים', original: 'זר כלה', adopt: true },
  ]
  for (const c of MATRIX) {
    check(`A. ${c.adopt ? 'ADOPT ' : 'REFUSE'} (${nTok(c.repaired)}t) ${c.label}`,
      isAdoptableTitleRepair(c.repaired, c.original) === c.adopt, JSON.stringify(c.repaired))
  }
  check('A13. every LEGITIMATE repair in the matrix is adopted (the gate still works)',
    MATRIX.filter((c) => c.adopt).every((c) => isAdoptableTitleRepair(c.repaired, c.original)))
  check('A14. every DEGRADING repair in the matrix is refused',
    MATRIX.filter((c) => !c.adopt).every((c) => !isAdoptableTitleRepair(c.repaired, c.original)))

  // ── B) MONOTONICITY — refuse-only; never adopts something new ────────────────
  console.log('\nB) MONOTONICITY — the predicate can only ever refuse, never newly adopt')
  {
    const corpus = [
      ...MATRIX.map((c) => [c.repaired, c.original] as const),
      ['זר כלה מול זר רומנטי', 'זר'] as const,
      ['מחיר זר כלה', 'זר כלה יוקרתי'] as const,
      ['a b c d e f g h i j', 'x y'] as const,
      ['', 'זר כלה'] as const,
      ['   ', 'זר כלה'] as const,
      ['זר כלה של', 'זר'] as const,
      ['כמה עולה זר כלה', 'זר כלה'] as const,
      ['זר כלה: המדריך המלא', 'זר'] as const,
    ]
    const violations = corpus.filter(([r, o]) => isAdoptableTitleRepair(r, o) && !OLD_RULE(r, o))
    check('B1. NOTHING the old rule refused is now adopted (strictly more restrictive)',
      violations.length === 0, JSON.stringify(violations))
    const narrowed = corpus.filter(([r, o]) => !isAdoptableTitleRepair(r, o) && OLD_RULE(r, o))
    check('B2. the change is not a no-op — it refuses cases the old rule adopted',
      narrowed.length > 0, `${narrowed.length} newly refused`)
    check('B3. every newly-refused case fails a NAMED new rule (truncation / search-phrase / length)',
      narrowed.every(([r]) => isTruncatedKeywordPhrase(r) || !isSearchPhraseQuality(r) || nTok(r) > MAX_SEARCH_TOKENS),
      JSON.stringify(narrowed.map(([r]) => r)))
  }

  // ── C) each rule is load-bearing — removing any one breaks the matrix ────────
  console.log('\nC) every rule in the conjunction is load-bearing')
  {
    const florist = 'איך לשמור על זר ורדים רענן ורענן לאורך זמן'
    const listicle = 'שבע טעויות נפוצות בבחירת סידור פרחים לאירוע גדול'
    check('C1. rule (4) isSearchPhraseQuality catches the 9-token florist repair',
      !isSearchPhraseQuality(florist))
    check('C2. rule (4) ALONE is NOT sufficient — the 8-token listicle passes it',
      isSearchPhraseQuality(listicle), 'this is why rule (5) exists')
    check('C3. rule (5) length <= MAX_SEARCH_TOKENS catches the listicle',
      nTok(listicle) > MAX_SEARCH_TOKENS && !isAdoptableTitleRepair(listicle, 'סידור פרחים'))
    check('C4. rule (3) truncation catches a dangling tail that IS a valid length',
      isTruncatedKeywordPhrase('זר כלה קלאסי ואיך') && !isAdoptableTitleRepair('זר כלה קלאסי ואיך', 'זר כלה'))
    check('C5. MAX_SEARCH_TOKENS is 7 while the acceptance gate admits 8 (the off-by-one)',
      MAX_SEARCH_TOKENS === 7 && isSearchPhraseQuality('אחת שתיים שלוש ארבע חמש שש שבע שמונה'))
  }

  // ── D) END-TO-END through the two REAL validators ───────────────────────────
  console.log('\nD) end-to-end through the real validators')
  {
    const TITLE = 'איך לשמור על זר ורדים רענן ורענן לאורך זמן'
    const c = validateIntentKeywordConsistency({ primaryKeyword: 'נעליים לחתן', title: TITLE, intent: 'informational' }, new Set(['נעלימ']))
    check('D1. R1: the florist-shaped title no longer yields a repairedKeyword',
      c.ok === false && c.repairedKeyword === undefined, JSON.stringify(c))
    check('D2. R1: it returns ok:false so the caller falls through to the brief chain',
      c.reason === 'intent_keyword_mismatch')
    const good = validateIntentKeywordConsistency({ primaryKeyword: 'נעליים לחתן', title: 'זר כלה מול זר רומנטי', intent: 'informational' }, new Set(['נעלימ']))
    check('D3. R1: a SHORT title clause still repairs (the gate still does its job)',
      good.ok === true && good.repairedKeyword === 'זר כלה מול זר רומנטי', JSON.stringify(good))
    const q = validatePrimaryKeywordQuality('זר ורדים ואיך', TITLE, new Set())
    check('D4. R2 truncated branch: a headline repair is refused',
      q.ok === false && q.reason === 'invalid_primary_keyword', JSON.stringify(q))
    const q2 = validatePrimaryKeywordQuality('זר ורדים ואיך', 'טיפוח צמחי בית', new Set())
    check('D5. R2 truncated branch: a SHORT title clause still repairs',
      q2.ok === true && q2.repairedKeyword === 'טיפוח צמחי בית', JSON.stringify(q2))
  }

  // ── E) the VACUITY of isTitleKeywordAligned for a title-derived value ───────
  console.log('\nE) isTitleKeywordAligned is vacuous here — documented, not an omission')
  {
    const TITLE = 'איך לשמור על זר ורדים רענן ורענן לאורך זמן'
    const derived = 'לשמור על זר ורדים רענן ורענן לאורך זמן'
    check('E1. the DEGRADED keyword passes title<->keyword alignment (proving vacuity)',
      isTitleKeywordAligned(derived, TITLE))
    check('E2. …so alignment could never have caught this defect',
      isTitleKeywordAligned(derived, TITLE) && !isAdoptableTitleRepair(TITLE, 'טיפול בזר ורדים'))
    const src = read('lib/content/recommendations/opportunity-validation.ts')
    check('E3. the vacuity is documented in the code', /isTitleKeywordAligned is VACUOUS/.test(src))
  }

  // ── F) SOURCE CONTRACT + the fallback shape in the engine ───────────────────
  console.log('\nF) source contract')
  {
    const ov = stripComments(read('lib/content/recommendations/opportunity-validation.ts'))
    const gfb = stripComments(read('lib/content/recommendations/generate-from-briefs.ts'))
    check('F1. the shared predicate is used at ALL title-derived repair sites',
      (ov.match(/isAdoptableTitleRepair\(repaired, /g) ?? []).length === 3,
      String((ov.match(/isAdoptableTitleRepair\(repaired, /g) ?? []).length))
    check('F2. no title-derived repair adopts on the OLD two-condition rule any more',
      !/toks\(repaired\)\.length >= 2 && normalizePhrase\(repaired\) !== normalizePhrase/.test(ov)
      && !/toks\(repaired\)\.length >= 2 && !TRUNCATED_KW_RE\.test\(repaired\)/.test(ov))
    check('F3. R2 keeps its OWN distinctive-token condition (branches not unified)',
      /rt\.some\(\(t\) => !GENERIC_TOKENS\.has\(t\) && !corpusTypeWords\.has\(t\)\) && isAdoptableTitleRepair/.test(ov))
    check('F4. repairKeywordFromTitle itself is UNCHANGED (still the title main clause, cap 10)',
      /const MAX_REPAIRED_KW_TOKENS = 10/.test(ov) && /if \(kept\.length > MAX_REPAIRED_KW_TOKENS\) return ''/.test(ov))
    // The FALLBACK: ok:false reaches the brief-anchored chain, not a bare rejection.
    check('F5. the engine falls through to the BRIEF-anchored repair on ok:false',
      /if \(!consistency\.ok\) \{ if \(!tryRepair\(\)\) return rej\('intent_keyword_mismatch'/.test(gfb)
      && /if \(!quality\.ok\) \{ if \(!tryRepair\(\)\) return rej\('invalid_primary_keyword'/.test(gfb))
    check('F6. the brief-anchored chain is still alignedDemandQuery → brief.subject',
      /const repairCandidates = \[brief\.alignedDemandQuery\?\.query, brief\.subject\]/.test(gfb))
    check('F7. no NEW rejection reason introduced (existing typed reasons only)',
      !/'title_repair_/.test(ov) && !/repair_not_adoptable/.test(ov))
  }

  // ── G) FROZEN ───────────────────────────────────────────────────────────────
  console.log('\nG) FROZEN — no gate reordering, no engine logic, no cost, no prompt')
  {
    const gfb = stripComments(read('lib/content/recommendations/generate-from-briefs.ts'))
    check('G1. no new model call', (gfb.match(/await generateRecommendationJSON\(/g) ?? []).length === 3)
    check('G2. gate order (1) → (2) → (2.5) unchanged',
      gfb.indexOf('const quality = validatePrimaryKeywordQuality(primaryKeyword') < gfb.indexOf('const consistency = validateIntentKeywordConsistency(')
      && gfb.indexOf('const consistency = validateIntentKeywordConsistency(') < gfb.indexOf('const sp = normalizeToSearchPhrase('))
    check('G3. the Step 1.5 title guards are still in place, still after the last repair',
      gfb.indexOf("'title_named_external_business'") > gfb.indexOf('const fixedTo = alignRepairs.find'))
    check('G4. the synthesis PROMPT is untouched (Step 2 not started)',
      /Do NOT generate brands, products, services, entities or subject areas that are absent from it\./.test(read('lib/content/recommendations/prompt-guidance.ts')))
    check('G5. deriveProjectFocus unchanged',
      /return \{ primaryProjectFocus: cats\[0\]/.test(read('lib/content/recommendations/prompt-guidance.ts')))
    check('G6. R3 (finalize-attempt salvage) deliberately NOT touched by this commit',
      /s\.primaryKeyword = salv\.keyword/.test(read('lib/content/recommendations/finalize-attempt.ts')))
    check('G7. no persistence/migration touched',
      !/isAdoptableTitleRepair/.test(read('lib/content/recommendations/topic-idea-store.ts')))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}
main()
