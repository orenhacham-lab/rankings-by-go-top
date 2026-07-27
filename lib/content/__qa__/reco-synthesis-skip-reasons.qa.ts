/**
 * Synthesis skip-reason observability (Step 1) — summarizeSkipReasons + the single
 * diagnostics call site.
 *
 * GAP: reconcileSynthesis already builds { briefId, why } for EVERY brief the model
 * skips, but generate-from-briefs reduced it to `rd.skipped_by_model = rec.skipped.length`
 * and discarded the reasons. The model skips 60-100% of briefs on some projects — the
 * largest single loss in the pipeline — and the only surviving trace was a 300-char
 * `sanitizedExcerpt` of the raw response, which is an accident of RC1 diagnostics, not
 * a channel. Nothing could attribute the loss.
 *
 * CHANGE: an ADDITIVE, OPTIONAL `skipped_reasons` on BriefRoundDiagnostics carrying a
 * bounded (<=30), subject-resolved sample of the SAME skips. Zero behaviour change:
 * the count is untouched, no gate reads it, no call is made, nothing is persisted.
 *
 * The count and the sample must NEVER be conflated — the sample is capped, the count
 * is not. Section B pins that: with 41 skips the count stays 41 while the sample is 30.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  summarizeSkipReasons,
  MAX_SKIP_REASON_DETAILS,
  reconcileSynthesis,
  type SkippedBrief,
} from '../recommendations/brief-synthesis'
import type { OpportunityBrief } from '../recommendations/opportunity-brief'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

const brief = (id: string, subject: string): OpportunityBrief => ({
  opportunityId: id, subject, searchNeed: 'question', family: 'informational',
  sourceEvidence: [{ kind: 'site_scan', text: subject }], alignedDemandQuery: null,
  demandVolumeSource: null, intendedIntent: 'informational', intendedPageType: 'article',
  existingContentGap: true, relatedEntities: [], publishedCoverage: [],
  confidence: 0.5, briefScore: 0.3,
} as OpportunityBrief)

function main() {
  console.log('Synthesis skip reasons — summarizeSkipReasons\n')

  // ── A) subject resolution — the whole point of the change ────────────────────
  console.log('A) each skip resolves to its brief SUBJECT')
  {
    const briefs = [brief('b1', 'נורות לד לסלון'), brief('b2', 'אילוף גור חתולים')]
    const skipped: SkippedBrief[] = [
      { briefId: 'b2', why: 'הנושא אינו תואם את תחומי ההתמחות של הפרויקט' },
      { briefId: 'b1', why: 'off domain' },
    ]
    const out = summarizeSkipReasons(skipped, briefs)
    check('A1. one detail per skip, order preserved', out.length === 2 && out[0].briefId === 'b2' && out[1].briefId === 'b1')
    check('A2. subject resolved from the brief batch', out[0].subject === 'אילוף גור חתולים' && out[1].subject === 'נורות לד לסלון')
    check('A3. the model\'s own reason is carried verbatim', out[0].why === 'הנושא אינו תואם את תחומי ההתמחות של הפרויקט')
    check('A4. empty skip list → empty array (never null/undefined)', Array.isArray(summarizeSkipReasons([], briefs)) && summarizeSkipReasons([], briefs).length === 0)
  }

  // ── B) COUNT vs SAMPLE — the invariant that must never be violated ───────────
  console.log('\nB) the bounded sample never becomes the count')
  {
    const briefs = Array.from({ length: 41 }, (_, i) => brief(`b${i}`, `נושא ${i}`))
    const skipped: SkippedBrief[] = briefs.map((b) => ({ briefId: b.opportunityId, why: 'x' }))
    const out = summarizeSkipReasons(skipped, briefs)
    check(`B1. sample is capped at MAX_SKIP_REASON_DETAILS (${MAX_SKIP_REASON_DETAILS})`, out.length === MAX_SKIP_REASON_DETAILS, String(out.length))
    check('B2. the underlying skip count is UNCHANGED by summarizing', skipped.length === 41)
    check('B3. sample length <= skip count, always', out.length <= skipped.length)
    check('B4. the cap is a parameter, not a hidden constant', summarizeSkipReasons(skipped, briefs, 5).length === 5)
    check('B5. under the cap, the sample is COMPLETE (no silent truncation)',
      summarizeSkipReasons(skipped.slice(0, 7), briefs).length === 7)
  }

  // ── C) robustness — a sample must never lose a skip or throw ─────────────────
  console.log('\nC) robustness: no drop, no throw')
  {
    const briefs = [brief('b1', 'נושא')]
    const out = summarizeSkipReasons([{ briefId: 'ghost', why: 'r' }, { briefId: 'b1', why: 'r2' }], briefs)
    check('C1. an UNKNOWN briefId is kept with subject=null (never dropped)',
      out.length === 2 && out[0].briefId === 'ghost' && out[0].subject === null, JSON.stringify(out))
    check('C2. an empty why becomes an empty string, not undefined',
      summarizeSkipReasons([{ briefId: 'b1', why: '' }], briefs)[0].why === '')
    const messy = summarizeSkipReasons([{ briefId: 'b1', why: '  a\n\n  b\t c  ' }], briefs)[0].why
    check('C3. model text is whitespace-collapsed and trimmed', messy === 'a b c', JSON.stringify(messy))
    const long = summarizeSkipReasons([{ briefId: 'b1', why: 'x'.repeat(500) }], briefs)[0].why
    check('C4. model text is length-bounded (<=120)', long.length === 120)
    check('C5. no briefs at all → every subject null, nothing thrown',
      summarizeSkipReasons([{ briefId: 'b1', why: 'r' }], []).every((d) => d.subject === null))
  }

  // ── D) PURITY — observability may not mutate the pipeline's data ─────────────
  console.log('\nD) pure: inputs are not mutated')
  {
    const briefs = [brief('b1', 'נושא')]
    const skipped: SkippedBrief[] = [{ briefId: 'b1', why: '  spaced  ' }]
    const beforeSkipped = JSON.stringify(skipped)
    const beforeBriefs = JSON.stringify(briefs)
    summarizeSkipReasons(skipped, briefs)
    check('D1. the skipped array is unmodified', JSON.stringify(skipped) === beforeSkipped)
    check('D2. the brief batch is unmodified', JSON.stringify(briefs) === beforeBriefs)
  }

  // ── E) END-TO-END through the REAL reconciler ────────────────────────────────
  console.log('\nE) real reconcileSynthesis output feeds the summarizer')
  {
    const briefs = [brief('b1', 'זר כלה קלאסי'), brief('b2', 'משלוח פרחים לחתונה'), brief('b3', 'צמחי בית')]
    const response = JSON.stringify({ topics: [
      { briefId: 'b1', skip: false, title: 'איך לבחור זר כלה קלאסי', primaryKeyword: 'זר כלה קלאסי', secondaryKeywords: [], intent: 'informational' },
      { briefId: 'b2', skip: true, why: 'כבר מכוסה בתוכן קיים' },
      { briefId: 'b3', skip: true, why: 'לא תואם לתחום' },
    ] })
    const rec = reconcileSynthesis(response, briefs)
    check('E1. reconciler reports 2 skips', rec.skipped.length === 2)
    const out = summarizeSkipReasons(rec.skipped, briefs)
    check('E2. both skips summarized with subjects', out.length === 2 && out[0].subject === 'משלוח פרחים לחתונה' && out[1].subject === 'צמחי בית')
    check('E3. E-reconciliation still holds: sent = polished + skipped + missing',
      briefs.length === rec.polished.length + rec.skipped.length + rec.missing.length)
    check('E4. summarizing did not change the reconciliation', rec.skipped.length === 2 && rec.polished.length === 1)
  }

  // ── F) SOURCE CONTRACT — additive, optional, one call site, count untouched ──
  console.log('\nF) source contract')
  {
    const gfb = stripComments(read('lib/content/recommendations/generate-from-briefs.ts'))
    const bs = stripComments(read('lib/content/recommendations/brief-synthesis.ts'))
    check('F1. the count assignment is byte-identical to main',
      /rd\.skipped_by_model = rec\.skipped\.length/.test(gfb))
    check('F2. the new field is OPTIONAL on BriefRoundDiagnostics',
      /skipped_reasons\?: SkippedBriefDetail\[\]/.test(gfb))
    check('F3. exactly ONE population site',
      (gfb.match(/rd\.skipped_reasons = /g) ?? []).length === 1)
    check('F4. population is guarded on a non-empty skip list',
      /if \(rec\.skipped\.length > 0\) rd\.skipped_reasons = summarizeSkipReasons\(rec\.skipped, batch\)/.test(gfb))
    check('F5. NO gate, filter, sort or control flow reads skipped_reasons',
      !/skipped_reasons[^?:]*(?:\.length\s*[><=]|\.filter|\.some|\.every|\.map|\.sort)/.test(gfb))
    check('F6. the summarizer is PURE — no admin/fetch/await inside it',
      !/export function summarizeSkipReasons[\s\S]*?\n}/.exec(bs)?.[0].match(/await|admin\.|fetch\(|process\.env/))
    check('F7. the cap is exported as a named constant',
      /export const MAX_SKIP_REASON_DETAILS = 30/.test(bs))
  }

  // ── G) FROZEN — nothing else moved ───────────────────────────────────────────
  console.log('\nG) FROZEN — no engine, gate, cost or persistence change')
  {
    const gfb = stripComments(read('lib/content/recommendations/generate-from-briefs.ts'))
    check('G1. the E-reconciliation contract comment/equation is intact',
      /briefs_sent = polished \+ skipped_by_model \+ missing_from_response/.test(read('lib/content/recommendations/generate-from-briefs.ts')))
    check('G2. PAID_CALL_CAP / call accounting untouched (no new generateRecommendationJSON)',
      (gfb.match(/await generateRecommendationJSON\(/g) ?? []).length === 3, String((gfb.match(/await generateRecommendationJSON\(/g) ?? []).length))
    check('G3. validatePolished is still the sole acceptance path',
      /const r = validatePolished\(polishedT, pair\.brief\)/.test(gfb) && /validatePolished\(/.test(gfb))
    // The fallback's response contract has NO skip field (reconcileFallback returns
    // pairs/emitted/invalidItems only), so its round must never carry skip reasons.
    // Positional, not a greedy span match: the sole assignment must sit AFTER the
    // synthesis reconciler, and the fallback's own `rd` literal must not mention it.
    const iDecl = gfb.indexOf('const runLowYieldFallback = async')
    const iSynth = gfb.indexOf('const rec = reconcileSynthesis(')
    const iAssign = gfb.indexOf('rd.skipped_reasons =')
    check('G4a. the sole assignment belongs to the SYNTHESIS round (after its reconciler)',
      iDecl >= 0 && iSynth >= 0 && iAssign > iSynth && iSynth > iDecl,
      JSON.stringify({ iDecl, iSynth, iAssign }))
    const fallbackRdLiteral = gfb.slice(iDecl, iSynth).match(/const rd: BriefRoundDiagnostics = \{[^}]*\}/)?.[0] ?? ''
    check('G4b. the fallback round\'s own diagnostics literal has no skipped_reasons',
      fallbackRdLiteral.length > 0 && !fallbackRdLiteral.includes('skipped_reasons'),
      String(fallbackRdLiteral.length))
    check('G5. no persistence/migration touched by this change',
      !/skipped_reasons/.test(read('lib/content/recommendations/topic-idea-store.ts')))
    check('G6. skipped_reasons is NOT surfaced outside briefDiagnostics',
      !/skipped_reasons/.test(read('app/api/content/automation/recommendations/route.ts')))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}
main()
