/**
 * Atomic approve + link-plan + enqueue result-contract QA (Part L) — offline.
 * Proves a topic is 'success' ONLY when links saved + approved + enqueued, so a
 * link-plan failure is never reported as fully added, and a batch reports partial
 * failure truthfully. Idempotent already-queued is a success-equivalent state.
 */
import { classifyTopicOutcome, summarizeBatch, type TopicStageOutcomes } from '../automation/approve-link-queue'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const base: TopicStageOutcomes = { validated: true, linkPlanRequested: true, linkPlanSaved: true, approved: true, enqueued: true, alreadyQueued: false }
const o = (p: Partial<TopicStageOutcomes>): TopicStageOutcomes => ({ ...base, ...p })

async function main() {
  console.log('A) per-topic states (L)')
  {
    check('23. full success (validated+links+approved+enqueued) → success', classifyTopicOutcome('t1', base).state === 'success')
    // 24 — the reported defect: links did NOT save → NOT success, stops before enqueue.
    const lp = classifyTopicOutcome('t2', o({ linkPlanSaved: false }))
    check('24. link plan failed → link_plan_failed (NOT success)', lp.state === 'link_plan_failed' && lp.failedStage === 'link_plan')
    check('24. link_plan_failed is retryable + typed error code', lp.retryable && lp.errorCode === 'link_plan_save_failed')
    check('validation failed → validation_failed (non-retryable)', classifyTopicOutcome('t', o({ validated: false })).state === 'validation_failed')
    check('approval failed → approval_failed', classifyTopicOutcome('t', o({ approved: false })).state === 'approval_failed')
    check('enqueue failed → enqueue_failed', classifyTopicOutcome('t', o({ enqueued: false })).state === 'enqueue_failed')
    check('already queued (idempotent) → already_queued success-equivalent', classifyTopicOutcome('t', o({ enqueued: false, alreadyQueued: true })).state === 'already_queued')
    check('no link plan requested → link stage skipped, still success', classifyTopicOutcome('t', o({ linkPlanRequested: false, linkPlanSaved: false })).state === 'success')
    // Order: a link failure is reported BEFORE approval/enqueue are even considered.
    check('link failure short-circuits before enqueue', classifyTopicOutcome('t', o({ linkPlanSaved: false, approved: false, enqueued: false })).failedStage === 'link_plan')
  }

  console.log('B) batch is truthful about partial success (L)')
  {
    const results = [
      classifyTopicOutcome('a', base),                          // success
      classifyTopicOutcome('b', o({ linkPlanSaved: false })),   // link_plan_failed
      classifyTopicOutcome('c', o({ enqueued: false, alreadyQueued: true })), // already_queued
    ]
    const s = summarizeBatch(results)
    check('batch with a link failure is NOT ok (no false "all added")', s.ok === false && s.failed === 1)
    check('batch counts success + already_queued as added/queued', s.added === 1 && s.alreadyQueued === 1)
    check('byState breakdown is exposed', s.byState.link_plan_failed === 1 && s.byState.success === 1)
    const allGood = summarizeBatch([classifyTopicOutcome('a', base), classifyTopicOutcome('b', o({ enqueued: false, alreadyQueued: true }))])
    check('an all-success/already-queued batch is ok', allGood.ok === true && allGood.failed === 0)
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}
main()
