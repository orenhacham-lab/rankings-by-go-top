/**
 * Batched validator QA (P0 A/C/H) — offline. The validator is ADDITIVE, not a global
 * kill switch: a valid reject removes only that candidate; accept keeps it; a repair is
 * re-validated through every deterministic gate (kept only if it passes, else the
 * ORIGINAL safe candidate is kept); a missing/malformed verdict KEEPS the candidate; an
 * entire failed/unparsable call degrades gracefully (keeps the batch, sets
 * validator_degraded). A non-empty safe set can NEVER become empty because the
 * validator failed. Metrics are real, never mirrored.
 */
import { parseValidatorResponse, validatorBatches, applyValidatorVerdicts, buildValidatorPrompt, type ValidatorVerdict } from '../recommendations/plan-validator'
import type { TopicSuggestion } from '../recommendations/types'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const sug = (id: string, kw: string): TopicSuggestion => ({ id, title: kw, primaryKeyword: kw, secondaryKeywords: [], searchIntent: 'informational', recommendedWordCount: 1000, angle: '', suggestedInternalLinks: [], source: 'hybrid', suggestionReason: 'r', suggestionScore: 0.7 })
const verdict = (o: Partial<ValidatorVerdict> & { candidate_id: string; decision: ValidatorVerdict['decision'] }): ValidatorVerdict => ({ typed_reason: o.decision, confidence: 0.8, ...o })

async function main() {
  console.log('A) defensive parse + batching + compact prompt')
  {
    const good = JSON.stringify({ verdicts: [{ candidate_id: 'a', decision: 'accept', confidence: 0.9 }, { candidate_id: 'b', decision: 'repair', repaired_primary_keyword: 'x y', confidence: 0.6 }, { candidate_id: 'c' /* no decision */ }] })
    const m = parseValidatorResponse(good)
    check('parse keeps only verdicts with a valid decision', m.size === 2 && m.get('a')?.decision === 'accept')
    check('parse extracts JSON from noise, never throws', parseValidatorResponse('junk ' + good).size === 2 && parseValidatorResponse('not json').size === 0)
    check('batching splits into ~25-sized batches', validatorBatches(Array.from({ length: 60 }, (_, i) => i), 25).length === 3)
    check('prompt is compact + structured (no raw dump)', /accept\|reject\|repair/.test(buildValidatorPrompt([sug('a', 'kw a')], 'Hebrew')) && buildValidatorPrompt([sug('a', 'kw a')], 'Hebrew').length < 4000)
  }

  console.log('B) additive accept / reject / repair + real metrics')
  {
    const pool = [sug('a', 'kw a'), sug('b', 'kw b'), sug('c', 'kw c'), sug('d', 'kw d')]
    const verdicts = new Map<string, ValidatorVerdict>([
      ['a', verdict({ candidate_id: 'a', decision: 'accept' })],
      ['b', verdict({ candidate_id: 'b', decision: 'reject' })],
      ['c', verdict({ candidate_id: 'c', decision: 'repair', repaired_primary_keyword: 'kw c repaired' })],
      // 'd' has NO verdict → KEEP it (additive).
    ])
    const revalidate = (rep: { primaryKeyword: string }, src: TopicSuggestion): TopicSuggestion | null => rep.primaryKeyword.includes('repaired') ? { ...src, primaryKeyword: rep.primaryKeyword } : null
    const r = applyValidatorVerdicts([pool], [verdicts], revalidate)
    check('C. accept keeps the candidate', r.accepted.some((s) => s.id === 'a'))
    check('C. a valid reject removes ONLY that candidate', !r.accepted.some((s) => s.id === 'b'))
    check('C. a passing repair is kept with its repaired keyword', r.accepted.some((s) => s.primaryKeyword === 'kw c repaired'))
    check('C. a MISSING verdict KEEPS the candidate (not dropped)', r.accepted.some((s) => s.id === 'd'))
    check('C. real metrics: 1 accept, 1 reject, 1 repair, 1 missing, 1 call', r.metrics.validator_accept_count === 1 && r.metrics.validator_reject_count === 1 && r.metrics.validator_repair_count === 1 && r.metrics.validator_missing_verdict_count === 1 && r.metrics.validator_call_count === 1)
  }

  console.log('C) validator cannot revive a bad repair; whole-call failure degrades gracefully')
  {
    // A repair whose new fields FAIL a deterministic gate → keep the ORIGINAL safe one.
    const pool = [sug('a', 'good kw a')]
    const v = new Map<string, ValidatorVerdict>([['a', verdict({ candidate_id: 'a', decision: 'repair', repaired_primary_keyword: 'bad brand name' })]])
    const r = applyValidatorVerdicts([pool], [v], () => null) // revalidate rejects the repair
    check('a failed repair keeps the ORIGINAL safe candidate (never the bad repair)', r.accepted.length === 1 && r.accepted[0].primaryKeyword === 'good kw a' && r.metrics.validator_repair_count === 0)

    // Whole-call failure (empty verdicts) → DEGRADE: keep the whole batch, do not zero.
    const big = Array.from({ length: 28 }, (_, i) => sug(`t${i}`, `kw ${i}`))
    const deg = applyValidatorVerdicts([big], [new Map()], () => null)
    check('H. a failed/unparsable validator call NEVER zeroes a non-empty safe set', deg.accepted.length === 28)
    check('H. validator_degraded + parse_failure recorded; all counted missing (kept)', deg.metrics.validator_degraded === true && deg.metrics.validator_parse_failure_count === 1 && deg.metrics.validator_missing_verdict_count === 28)
  }

  console.log('D) partial response + unvalidated remainder are preserved')
  {
    const pool = [sug('a', 'kw a'), sug('b', 'kw b')]
    // Only 'a' has a verdict (reject); 'b' has none → 'b' kept.
    const r = applyValidatorVerdicts([pool], [new Map([['a', verdict({ candidate_id: 'a', decision: 'reject' })]])], () => null, [sug('z', 'kw z')])
    check('partial response preserves candidates with missing verdicts (b kept)', r.accepted.some((s) => s.id === 'b') && !r.accepted.some((s) => s.id === 'a'))
    check('unvalidated survivors past the call budget are kept', r.accepted.some((s) => s.id === 'z'))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}
main()
