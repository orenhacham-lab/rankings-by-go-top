/**
 * AutomationIdeas one-click "approve + add to publishing queue" — truthful persistence + queue.
 *
 * Proves the rewired primary flow: checked links are saved through the reviewed-snapshot
 * bulk-save contract and a topic is queued ONLY when its checked links fully persisted +
 * approved. Behavioral coverage of the pure decision core (evaluateLinkSave / partition /
 * buildQueueTopics) for every scenario A–H, plus source guards (I/J) proving the component
 * calls plan → bulk-save → approve-and-queue and NO LONGER calls /pools/:id/items.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { partitionByCheckedLinks, evaluateLinkSave, buildQueueTopics } from '../automation/one-click-queue'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const read = (p: string) => readFileSync(join(__dirname, p), 'utf8')
const L = (url: string, anchor: string) => ({ url, anchor })
const okRes = (topicId: string, n = 1) => ({ topicId, ok: true, linkCount: n, approvedCount: n, approvalWarning: false, droppedLinks: [] as unknown[] })

async function main() {
  console.log('FLOW) truthful link-save → queue decision (pure core used by AutomationIdeas)')

  // A — new topic + one checked valid link → saved+approved → queued with expectsLinks:true.
  {
    const checked = { t1: [L('https://x/a', 'a')] }
    const { withLinks, noLinks } = partitionByCheckedLinks(['t1'], checked)
    const ev = evaluateLinkSave(withLinks, checked, { ok: true, results: [okRes('t1')] })
    const queue = buildQueueTopics(noLinks, ev.okIds, { t1: 'article' })
    check('A. new topic + 1 checked link → link saved, topic queued (expectsLinks:true)',
      ev.okIds.length === 1 && ev.failures.length === 0 && queue.length === 1 && queue[0]!.expectsLinks === true)
  }

  // B — an EXISTING resolved topic behaves identically (the decision is by topicId).
  {
    const checked = { existing1: [L('https://x/b', 'b')] }
    const ev = evaluateLinkSave(['existing1'], checked, { ok: true, results: [okRes('existing1')] })
    const queue = buildQueueTopics([], ev.okIds, { existing1: 'article' })
    check('B. existing resolved topic + 1 checked link → link persists + topic queues', ev.okIds[0] === 'existing1' && queue[0]!.expectsLinks === true)
  }

  // C — TTL-stale but the SAME reviewed snapshot: bulk-save still returns ok results → queued.
  //     (The stale-but-saveable behavior is enforced by the bulk-save gate; here the flow
  //     treats a successful save as success.)
  {
    const checked = { t1: [L('https://x/a', 'a')] }
    const ev = evaluateLinkSave(['t1'], checked, { ok: true, results: [okRes('t1')] })
    check('C. same reviewed snapshot (stale) saved → topic queued, no failure', ev.okIds.length === 1 && ev.failures.length === 0)
  }

  // D — a checked link is DROPPED during server revalidation → topic NOT queued, typed reason.
  {
    const checked = { t1: [L('https://x/a', 'a')] }
    const ev = evaluateLinkSave(['t1'], checked, { ok: true, results: [{ topicId: 't1', ok: true, linkCount: 0, approvedCount: 0, droppedLinks: [{ targetUrl: 'https://x/a', reason: 'not_in_plan' }] }] })
    const queue = buildQueueTopics([], ev.okIds, {})
    check('D. dropped checked link → NOT queued, reason dropped_link', ev.okIds.length === 0 && ev.failures[0]?.reason === 'dropped_link' && queue.length === 0)
  }

  // E — bulk-save returns cache_changed_replan_required → NO checked-link topic queued.
  {
    const checked = { t1: [L('https://x/a', 'a')], t2: [L('https://y/a', 'a')] }
    const ev = evaluateLinkSave(['t1', 't2'], checked, { ok: false, hardReason: 'cache_changed_replan_required' })
    const queue = buildQueueTopics([], ev.okIds, {})
    check('E. cache_changed_replan_required → no checked-link topic queued', ev.okIds.length === 0 && ev.failures.length === 2 && ev.failures.every((f) => f.reason === 'cache_changed_replan_required') && queue.length === 0)
  }

  // F — approval shortfall (saved but not all approved) → topic NOT queued.
  {
    const checked = { t1: [L('https://x/a', 'a')] }
    const ev = evaluateLinkSave(['t1'], checked, { ok: true, results: [{ topicId: 't1', ok: true, linkCount: 1, approvedCount: 0, approvalWarning: true, droppedLinks: [] }] })
    check('F. approval shortfall → NOT queued, reason approval_shortfall', ev.okIds.length === 0 && ev.failures[0]?.reason === 'approval_shortfall')
  }

  // G — a topic with ZERO checked links → expectsLinks:false, queues normally.
  {
    const { withLinks, noLinks } = partitionByCheckedLinks(['t1'], {})
    const queue = buildQueueTopics(noLinks, [], { t1: 'article' })
    check('G. zero checked links → expectsLinks:false, may queue', withLinks.length === 0 && noLinks[0] === 't1' && queue[0]!.expectsLinks === false)
  }

  // H — mixed batch: the saved topic queues; the dropped-link topic does NOT; exact split.
  {
    const checked = { t1: [L('https://x/a', 'a')], t2: [L('https://y/a', 'a')], t3: [] as { url: string; anchor: string }[] }
    const { withLinks, noLinks } = partitionByCheckedLinks(['t1', 't2', 't3'], checked)
    const ev = evaluateLinkSave(withLinks, checked, { ok: true, results: [okRes('t1'), { topicId: 't2', ok: true, linkCount: 0, approvedCount: 0, droppedLinks: [{ x: 1 }] }] })
    const queue = buildQueueTopics(noLinks, ev.okIds, { t1: 'article', t3: 'article' })
    const queuedIds = queue.map((q) => q.topicId).sort()
    check('H. mixed → t1 (links) + t3 (no links) queued, t2 (dropped) excluded',
      ev.okIds.length === 1 && ev.okIds[0] === 't1' && ev.failures[0]?.topicId === 't2' && queuedIds.join(',') === 't1,t3' && queue.find((q) => q.topicId === 't1')!.expectsLinks === true && queue.find((q) => q.topicId === 't3')!.expectsLinks === false)
  }

  console.log('GUARD) primary AutomationIdeas flow uses the authoritative routes only')
  {
    const src = read('../../../components/content/AutomationIdeas.tsx')
    // I — no longer POSTs the non-authoritative /pools/:id/items.
    check('I. primary flow no longer calls /pools/:id/items', !/pools\/\$\{[^}]+\}\/items/.test(src))
    // J — calls plan → bulk-save → approve-and-queue.
    check('J. flow calls GET plan + reviewed-snapshot bulk-save + approve-and-queue',
      /internal-links\/plan\?projectId/.test(src) && /internal-links\/plan\/bulk-save/.test(src) && /reviewedSnapshot/.test(src) && /approve-and-queue/.test(src))
    check('bulk-save from AutomationIdeas sends approve:true + reviewedSnapshot (no force)', /approve: true, selectedLinks, reviewedSnapshot/.test(src) && !/force:\s*true/.test(src))
    check('a checked-but-unsaved topic is excluded from the queue payload (buildQueueTopics on okIds)', /buildQueueTopics\(noLinksIds, \[\.\.\.save\.okIds\]/.test(src))
    check('truthful UI: partial counts + all-failed error keys wired', /t\.queuePartial\b/.test(src) && /t\.linkSaveAllFailed\b/.test(src))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}
main()
