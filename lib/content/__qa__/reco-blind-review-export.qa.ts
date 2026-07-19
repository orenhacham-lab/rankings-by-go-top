/**
 * BLIND QUALITY-REVIEW EXPORT QA (Stage B, Increment 5) — pure, offline.
 *
 * Proves the export a human reviewer sees carries NO model-identifying information,
 * that the id→model mapping is a SEPARATE object that still round-trips, that batch ids
 * and order never reveal the model (content-independent + seeded shuffle), and that the
 * programmatic leakage scan catches an injected leak.
 */
import { buildBlindReview, scanBlindExportForLeakage, MODEL_IDENTITY_PATTERNS, type AttemptForReview } from '../recommendations/blind-review-export'
import type { TopicSuggestion } from '../recommendations/types'

let pass = 0, fail = 0
const check = (n: string, c: boolean, d?: string) => { if (c) { pass++; console.log(`  ✓ ${n}`) } else { fail++; console.log(`  ✗ ${n}${d ? ` — ${d}` : ''}`) } }

// A suggestion whose model-identifying fields are DELIBERATELY populated, so the test
// proves projection strips them (they must never reach the blind export).
const sug = (title: string, kw: string, model: string): TopicSuggestion => ({
  id: `opportunity:${title}`, title, primaryKeyword: kw, secondaryKeywords: ['ביטוי משני'],
  searchIntent: 'informational', recommendedWordCount: 1000, angle: '',
  suggestedInternalLinks: [{ url: 'https://shop.example.com/product/x', anchor: 'עוגן פנימי' }],
  source: 'hybrid', suggestionReason: 'הנושא משלים פער תוכן בתחום שהעסק עוסק בו.', suggestionScore: 0.8,
  modelUsed: model, requestedTier: model.includes('pro') ? 'premium' : 'standard', improvedWithPro: model.includes('pro'),
  recommendedPageType: 'article',
})

function main() {
  const flash: AttemptForReview = { role: 'flash', model: 'gemini-2.5-flash', attemptIndex: 0, suggestions: [sug('נושא ראשון', 'ביטוי ראשון', 'gemini-2.5-flash'), sug('נושא שני', 'ביטוי שני', 'gemini-2.5-flash')] }
  const pro: AttemptForReview = { role: 'pro', model: 'gemini-2.5-pro', attemptIndex: 0, suggestions: [sug('נושא ראשון', 'ביטוי ראשון', 'gemini-2.5-pro'), sug('נושא שלישי', 'ביטוי שלישי', 'gemini-2.5-pro'), sug('נושא רביעי', 'ביטוי רביעי', 'gemini-2.5-pro')] }

  console.log('BLIND) the export carries no model-identifying info')
  {
    const { export: exp } = buildBlindReview([flash, pro], 12345)
    check('B1. two anonymous batches emitted', exp.batches.length === 2 && exp.batches.every((b) => /^batch_[a-z0-9]+$/.test(b.batchId)), JSON.stringify(exp.batches.map((b) => b.batchId)))
    check('B2. suggestions keep review content but DROP modelUsed/tier/improved/id/score', exp.batches.every((b) => b.suggestions.every((s) => !('modelUsed' in s) && !('requestedTier' in s) && !('improvedWithPro' in s) && !('id' in s) && !('suggestionScore' in s) && typeof (s as { title: string }).title === 'string')))
    const leak = scanBlindExportForLeakage(exp)
    check('B3. programmatic leakage scan is CLEAN (no gemini/flash/pro/tier tokens)', leak.clean, JSON.stringify(leak.hits.slice(0, 3)))
    check('B4. the raw export JSON contains none of the model ids', !/gemini/i.test(JSON.stringify(exp)) && !/\bpremium\b/i.test(JSON.stringify(exp)))
  }

  console.log('BLIND) the mapping is SEPARATE and still round-trips')
  {
    const { export: exp, mapping } = buildBlindReview([flash, pro], 777)
    check('B5. mapping is a distinct object, not embedded in the export', !('mapping' in exp) && Object.keys(mapping).length === 2)
    check('B6. every export batchId is resolvable in the mapping and vice-versa', exp.batches.every((b) => mapping[b.batchId]) && Object.keys(mapping).every((id) => exp.batches.some((b) => b.batchId === id)))
    // Recover the Pro batch via the mapping and confirm it holds the Pro-only titles.
    const proId = Object.entries(mapping).find(([, v]) => v.role === 'pro')![0]
    const proBatch = exp.batches.find((b) => b.batchId === proId)!
    check('B7. un-blinding via mapping recovers the correct (Pro) batch', proBatch.suggestions.length === 3 && proBatch.suggestions.some((s) => s.title === 'נושא רביעי'))
    check('B8. mapping records role + model for both sides', new Set(Object.values(mapping).map((v) => v.role)).size === 2 && Object.values(mapping).some((v) => v.model === 'gemini-2.5-pro'))
  }

  console.log('BLIND) ids/order never reveal the model; determinism holds')
  {
    // Identical content on both sides — ids must STILL differ (content-independent).
    const twin: AttemptForReview = { ...flash, role: 'pro', model: 'gemini-2.5-pro', suggestions: flash.suggestions }
    const { export: exp } = buildBlindReview([flash, twin], 42)
    check('B9. two identical-content batches still get DISTINCT ids', exp.batches[0].batchId !== exp.batches[1].batchId)
    // Determinism: same seed → identical export.
    const a = JSON.stringify(buildBlindReview([flash, pro], 999).export)
    const b = JSON.stringify(buildBlindReview([flash, pro], 999).export)
    check('B10. same seed → byte-identical export (reproducible)', a === b)
    // Different seed can reorder → position is not a model tell.
    const s1 = buildBlindReview([flash, pro], 1).export.batches.map((b) => b.suggestions.length).join(',')
    const s2 = buildBlindReview([flash, pro], 2).export.batches.map((b) => b.suggestions.length).join(',')
    const s3 = buildBlindReview([flash, pro], 3).export.batches.map((b) => b.suggestions.length).join(',')
    check('B11. batch order varies with the seed (flash not pinned to position 0)', new Set([s1, s2, s3]).size >= 2, JSON.stringify([s1, s2, s3]))
  }

  console.log('BLIND) the leakage scan actually CATCHES a leak (negative control)')
  {
    const { export: exp } = buildBlindReview([flash, pro], 5)
    // Inject a model id into review content and confirm the scan flags it.
    exp.batches[0].suggestions[0].suggestionReason += ' (produced by gemini-2.5-pro)'
    const leak = scanBlindExportForLeakage(exp)
    check('B12. an injected "gemini-2.5-pro" leak is detected (scan fails)', !leak.clean && leak.hits.some((h) => /gemini/i.test(h.token)), JSON.stringify(leak.hits.slice(0, 2)))
    // A batchId leak is caught too.
    const exp2 = buildBlindReview([flash, pro], 6).export
    exp2.batches[1].batchId = 'batch_pro_winner'
    const leak2 = scanBlindExportForLeakage(exp2)
    check('B13. a model-identifying batchId is detected', !leak2.clean && leak2.hits.some((h) => h.path === 'batchId'))
  }

  console.log('BLIND) denylist word-boundaries do not false-positive on real content')
  {
    // "/product/…" contains "pro" but must NOT flag (\bpro\b), Hebrew reason is clean.
    const clean: AttemptForReview = { role: 'flash', model: 'gemini-2.5-flash', attemptIndex: 1, suggestions: [sug('מוצר לדוגמה', 'מילת מפתח', 'gemini-2.5-flash')] }
    const { export: exp } = buildBlindReview([clean], 8)
    check('B14. project URL "/product/x" does not false-trigger the \\bpro\\b rule', scanBlindExportForLeakage(exp).clean, JSON.stringify(scanBlindExportForLeakage(exp).hits))
    check('B15. denylist covers the core model families', MODEL_IDENTITY_PATTERNS.some((p) => p.test('gemini')) && MODEL_IDENTITY_PATTERNS.some((p) => p.test('pro')) && MODEL_IDENTITY_PATTERNS.some((p) => p.test('claude')))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}
main()
