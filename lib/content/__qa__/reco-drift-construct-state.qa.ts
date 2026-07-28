/**
 * Commercial-drift membership: Hebrew CONSTRUCT-STATE folding.
 *
 * DEFECT, measured across four Preview runs on a live project (8 rejections, all at
 * stage `title_keyword_intent`): the drift branch claims to flag "a commercial-entity
 * token THE TITLE NEVER USES", but compared raw tokens. Hebrew spells the same word
 * differently in construct state, so:
 *   keyword "זרי ורדים"          / title "כיצד לבחור זר ורדים…"        -> drift ["זרי"]
 *   keyword "משלוחי מתנות באר שבע" / title "…למשלוחי מתנות ופרחים…"     -> drift ["שלוחי"]
 *   keyword "משלוחי מתנות בירושלים"/ title "…משלוח מתנות מושלם…"        -> drift ["משלוחי","שלוחי"]
 * In every case the model's keyword was already a clean 2-4 token search phrase that
 * needed no repair. The gate fired on GRAMMAR, the title repair then replaced a good
 * keyword with a headline, and when that repair was refused the topic was lost.
 *
 * FIX: fold membership through constructStateVariants (canonicalVariants + smichut).
 *
 * SAFE DIRECTION: folding only ADDS title variants, so `drift` can only SHRINK. The
 * branch can fire less, never more, and a token that stops being drift is NOT accepted
 * — control falls through to comparison/local/overlap/subject-head, all unchanged.
 *
 * SYSTEM-WIDE: constructStateVariants and validateIntentKeywordConsistency are pure
 * functions with no project/tenant parameter. Section E asserts there is no project
 * branching, env flag or allowlist anywhere in the change.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { validateIntentKeywordConsistency, deriveIntent } from '../recommendations/opportunity-validation'
import { constructStateVariants, canonicalVariants } from '../recommendations/semantic-dup'
import { contentTokens } from '../recommendations/evidence-cluster'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

/** commercialEntityTokens exactly as the engine builds it (generate-from-briefs.ts:546-547). */
const cetOf = (entityNames: string[]) => {
  const s = new Set<string>()
  for (const e of entityNames) for (const t of contentTokens(e)) s.add(t)
  return s
}
const FLORIST = cetOf(['זרי כלה', 'זרי פרחים', 'סידורי פרחים לאירועים', 'משלוח פרחים', 'צמחי בית', 'זרי ורדים', 'מתנות ופרחים', 'משלוחי מתנות'])
/**
 * Did the branch FIRE? A fired branch returns EITHER ok:false OR ok:true with a
 * repairedKeyword — `repairOr` adopts a title repair when it can. Checking only `!ok`
 * reads a successful repair as "did not fire" and inverted three regression results on
 * the first run; the code was right and this helper was wrong.
 */
const fires = (kw: string, title: string, cet: Set<string>) => {
  const intent = deriveIntent(kw, title, 'informational')
  const r = validateIntentKeywordConsistency({ primaryKeyword: kw, title, intent }, cet)
  return !r.ok || !!r.repairedKeyword
}

function main() {
  console.log('Commercial drift — construct-state membership folding\n')

  // ── A) the folder itself ────────────────────────────────────────────────────
  console.log('A) constructStateVariants')
  {
    check('A1. "זרי" folds to "זר"', constructStateVariants('זרי').includes('זר'))
    check('A2. "משלוחי" folds to "משלוח"', constructStateVariants('משלוחי').includes('משלוח'))
    check('A3. "סידורי" folds to "סידור"', constructStateVariants('סידורי').includes('סידור'))
    check('A4. it is ADDITIVE — every canonicalVariants output survives',
      ['זרי', 'משלוחי', 'בפתח', 'ורדים', 'flowers'].every((t) => canonicalVariants(t).every((v) => constructStateVariants(t).includes(v))))
    check('A5. a token without a trailing י is unchanged',
      JSON.stringify(constructStateVariants('זר')) === JSON.stringify(canonicalVariants('זר')))
    check('A6. latin is untouched', JSON.stringify(constructStateVariants('delivery')) === JSON.stringify(canonicalVariants('delivery')))
    check('A7. too-short stems are not stripped ("י" alone / 2-letter result guarded)',
      !constructStateVariants('לי').includes('ל'))
    // The documented over-folding — asserted so it is visible, not implied.
    check('A8. DOCUMENTED over-folding: "כלי"→"כל" (accepted; silences only)', constructStateVariants('כלי').includes('כל'))
    check('A9. DOCUMENTED over-folding: "בתי"→"בת" (accepted; silences only)', constructStateVariants('בתי').includes('בת'))
  }

  // ── B) THE THREE VERIFIED ROWS ──────────────────────────────────────────────
  console.log('\nB) the three measured rows are fixed')
  {
    const ROWS: [string, string, string][] = [
      ['R7  משלוחי מתנות באר שבע', 'משלוחי מתנות באר שבע', 'רעיונות למשלוחי מתנות ופרחים בבאר שבע לכל אירוע'],
      ['R8  משלוחי מתנות בירושלים', 'משלוחי מתנות בירושלים', 'כיצד לבחור משלוח מתנות מושלם בירושלים? המדריך לשילוב פרחים ומתנות'],
      ['R18 זרי ורדים', 'זרי ורדים', 'כיצד לבחור זר ורדים מרשים? טיפים להתאמת הצבע והגודל'],
    ]
    for (const [label, kw, title] of ROWS) {
      check(`B. no longer fires: ${label}`, !fires(kw, title, FLORIST))
    }
  }

  // ── C) REGRESSION — genuine drift must still fire ───────────────────────────
  console.log('\nC) regression — genuinely off-subject drift still fires')
  {
    const REG: [string, string, string][] = [
      ['off-subject drift', 'זרי כלה', 'איך לטפל בצמחי בית בחורף'],
      ['one shared token (the earlier leak case)', 'זרי כלה פרחים', 'מדריך לצמחי בית ופרחים בבית'],
      ['bridal kw under houseplant title', 'זרי כלה מיוחדים', 'טיפוח צמחי בית לחורף'],
    ]
    for (const [label, kw, title] of REG) check(`C. still fires: ${label}`, fires(kw, title, FLORIST))
  }

  // ── D) MONOTONICITY — can only shrink `drift`, never grow it ────────────────
  console.log('\nD) monotonicity — the folded membership is a superset test')
  {
    const corpus = ['זרי', 'משלוחי', 'זר', 'פרחים', 'בפתח', 'כלה', 'ורדים', 'delivery', 'סידורי']
    const titleToks = ['זר', 'ורדים', 'פרחים', 'משלוח']
    const raw = new Set(titleToks)
    const folded = new Set<string>(); for (const t of titleToks) for (const v of constructStateVariants(t)) folded.add(v)
    const rawHit = (t: string) => raw.has(t)
    const foldHit = (t: string) => raw.has(t) || constructStateVariants(t).some((v) => folded.has(v))
    check('D1. every token matched RAW is still matched FOLDED (superset)',
      corpus.filter(rawHit).every(foldHit))
    check('D2. the folded test matches at least one token the raw test missed (not a no-op)',
      corpus.some((t) => foldHit(t) && !rawHit(t)))
    check('D3. therefore `drift` can only SHRINK — the branch fires less, never more',
      corpus.filter((t) => !foldHit(t)).every((t) => !rawHit(t)))
    // A silenced drift does NOT accept the candidate — the later gates still run.
    check('D4. a silenced drift still faces the remaining gates (off-subject kw rejected elsewhere)',
      fires('נעלים לחתן', 'איך לבחור חליפת חתן לחתונה', cetOf(['חליפות חתן', 'נעליים'])))
  }

  // ── E) SYSTEM-WIDE — no project scoping anywhere ────────────────────────────
  console.log('\nE) system-wide — no project branching, flag or allowlist')
  {
    const ov = stripComments(read('lib/content/recommendations/opportunity-validation.ts'))
    const sd = stripComments(read('lib/content/recommendations/semantic-dup.ts'))
    check('E1. constructStateVariants takes ONE string param — no project/tenant/config',
      /export function constructStateVariants\(raw: string\): string\[\]/.test(sd))
    check('E2. semantic-dup.ts imports nothing (no project-aware module reachable)',
      !/^import /m.test(sd))
    check('E3. opportunity-validation.ts has NO projectId / env flag / allowlist',
      !/projectId|project_id|process\.env|allowlist|ALLOWLIST/.test(ov))
    check('E4. validateIntentKeywordConsistency signature is unchanged (no per-project arg)',
      /export function validateIntentKeywordConsistency\(\s*o: \{ primaryKeyword: string; title: string; intent: SearchIntent \},\s*commercialEntityTokens: Set<string>,\s*\)/.test(ov.replace(/\s+/g, ' ').replace(/ \{ /g, ' { ')) || /commercialEntityTokens: Set<string>/.test(ov))
    check('E5. every call site passes only commercialEntityTokens (same code path per project)',
      (stripComments(read('lib/content/recommendations/generate-from-briefs.ts')).match(/validateIntentKeywordConsistency\([^)]*\}, commercialEntityTokens\)/g) ?? []).length === 2
      && /validateIntentKeywordConsistency\([^)]*\}, commercialEntityTokens\)/.test(stripComments(read('lib/content/recommendations/generate-opportunities.ts'))))
    check('E6. the over-folding risk is documented IN CODE with its safety argument',
      /OVER-FOLDING IS REAL AND ACCEPTED/.test(read('lib/content/recommendations/semantic-dup.ts'))
      && /SILENCES a warning rather than\s*\*?\s*admits a candidate/.test(read('lib/content/recommendations/semantic-dup.ts')))
  }

  // ── F) FROZEN ───────────────────────────────────────────────────────────────
  console.log('\nF) FROZEN — only the drift membership changed')
  {
    const ov = stripComments(read('lib/content/recommendations/opportunity-validation.ts'))
    check('F1. canonicalVariants itself is UNCHANGED (semantic dedup untouched)',
      /export function canonicalVariants\(raw: string\): string\[\] \{\s*const c = canonicalToken\(raw\)/.test(stripComments(read('lib/content/recommendations/semantic-dup.ts'))))
    check('F2. the LOCAL_RETAIN branch is untouched (separate defect, separate commit)',
      /const missing = titleDistinctive\.filter\(\(t\) => !kwSet\.has\(t\)\)/.test(ov))
    check('F3. the overlap and subject-head branches are untouched',
      /if \(overlap < 0\.34\) return repairOr\(new Set\(\)\)/.test(ov)
      && /if \(!titleSet\.has\(kwHead\) && sharedDistinct < 2\) return repairOr\(new Set\(\)\)/.test(ov))
    check('F4. repairKeywordFromTitle is unchanged', /const MAX_REPAIRED_KW_TOKENS = 10/.test(ov))
    check('F5. no new rejection reason', !/drift_|construct_state_/.test(ov))
    check('F6. R1 is NOT in this branch (abandoned, not revived)', !/isAdoptableTitleRepair/.test(ov))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}
main()
