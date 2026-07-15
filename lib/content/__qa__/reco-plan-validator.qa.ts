/**
 * Batched validator QA (P0 A/E) — offline. Proves the REAL validator decision logic:
 * accept/reject/repair with real (never mirrored) metrics; a repair is re-validated
 * through every deterministic gate and dropped if it fails (a validator can never
 * revive a hard-rejected candidate); a missing/malformed verdict safely rejects;
 * deterministic survivors past the call budget are kept but not counted as accepts;
 * defensive parsing; and the batch/call ceilings.
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
  console.log('A) defensive parse + batching')
  {
    const good = JSON.stringify({ verdicts: [{ candidate_id: 'a', decision: 'accept', confidence: 0.9 }, { candidate_id: 'b', decision: 'repair', repaired_primary_keyword: 'x y', confidence: 0.6 }, { candidate_id: 'c' /* no decision */ }] })
    const m = parseValidatorResponse(good)
    check('parse keeps only verdicts with a valid decision', m.size === 2 && m.get('a')?.decision === 'accept' && m.get('b')?.decision === 'repair')
    check('parse extracts JSON from noise, never throws', parseValidatorResponse('junk ' + good + ' tail').size === 2 && parseValidatorResponse('not json').size === 0)
    check('batching splits into ~25-sized batches', validatorBatches(Array.from({ length: 60 }, (_, i) => i), 25).length === 3)
  }

  console.log('B) real accept / reject / repair + metrics')
  {
    const pool = [sug('a', 'kw a'), sug('b', 'kw b'), sug('c', 'kw c'), sug('d', 'kw d')]
    const verdicts = new Map<string, ValidatorVerdict>([
      ['a', verdict({ candidate_id: 'a', decision: 'accept' })],
      ['b', verdict({ candidate_id: 'b', decision: 'reject' })],
      ['c', verdict({ candidate_id: 'c', decision: 'repair', repaired_primary_keyword: 'kw c repaired' })],
      // 'd' has NO verdict → malformed/missing → safe reject (failure)
    ])
    // revalidate: a repair passes only if its keyword contains "repaired".
    const revalidate = (rep: { primaryKeyword: string }, src: TopicSuggestion): TopicSuggestion | null => rep.primaryKeyword.includes('repaired') ? { ...src, primaryKeyword: rep.primaryKeyword } : null
    const r = applyValidatorVerdicts([pool], [verdicts], revalidate)
    check('E. accept keeps the candidate', r.accepted.some((s) => s.id === 'a'))
    check('E. reject drops the candidate', !r.accepted.some((s) => s.id === 'b'))
    check('E. a passing repair is kept with its repaired keyword', r.accepted.some((s) => s.primaryKeyword === 'kw c repaired'))
    check('E. a missing verdict safely rejects (not kept)', !r.accepted.some((s) => s.id === 'd'))
    check('E. REAL metrics (not mirrored): 1 accept, 1 reject, 1 repair, 1 failure, 1 call', r.metrics.validator_accept_count === 1 && r.metrics.validator_reject_count === 1 && r.metrics.validator_repair_count === 1 && r.metrics.validator_failure_count === 1 && r.metrics.validator_call_count === 1)
  }

  console.log('C) validator cannot revive a hard-rejected candidate')
  {
    const pool = [sug('a', 'kw a')]
    const verdicts = new Map<string, ValidatorVerdict>([['a', verdict({ candidate_id: 'a', decision: 'repair', repaired_primary_keyword: 'competitor brand name' })]])
    // revalidate returns null → a deterministic gate rejected the repair.
    const r = applyValidatorVerdicts([pool], [verdicts], () => null)
    check('a repair that fails a deterministic gate is NOT kept (no revival)', r.accepted.length === 0 && r.metrics.validator_repair_count === 0 && r.metrics.validator_failure_count === 1)
  }

  console.log('D) unvalidated survivors kept but not counted as accepts; malformed batch')
  {
    const pool = [sug('a', 'kw a'), sug('b', 'kw b')]
    // A whole-batch failure (empty verdicts map, e.g. the model call failed).
    const r = applyValidatorVerdicts([pool], [new Map()], () => null, [sug('z', 'kw z')])
    check('a malformed/empty batch safely rejects every candidate in it', !r.accepted.some((s) => s.id === 'a' || s.id === 'b') && r.metrics.validator_failure_count === 2)
    check('unvalidated deterministic survivors are kept but not counted as accepts', r.accepted.some((s) => s.id === 'z') && r.metrics.validator_accept_count === 0)
  }

  console.log('E) prompt uses compact evidence only (no raw dump)')
  {
    const prompt = buildValidatorPrompt([sug('a', 'kw a')], 'Hebrew')
    check('validator prompt is compact + structured (asks accept/reject/repair)', /accept\|reject\|repair/.test(prompt) && /candidate_id/.test(prompt) && prompt.length < 4000)
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}
main()
