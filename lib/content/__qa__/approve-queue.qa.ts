/**
 * Manual-topic approve-and-queue QA — offline, no DB/network.
 * Proves the exact defect fix: a manual topic (source='manual', status='suggested')
 * is promoted to 'approved' before enqueue, ONLY manual+suggested topics are ever
 * promoted (the queue endpoint stays strict for genuinely non-approved topics), the
 * pool is reused, repeat clicks are idempotent, and non-manual/auto topics are
 * unaffected.
 */
import { selectManualTopicsToApprove, approvedTopicIds, partitionForQueue, isQueueSuccess, type TopicStatusRow } from '../automation/approve-queue'
import { readFileSync } from 'fs'
import { join } from 'path'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const read = (rel: string) => readFileSync(join(__dirname, rel), 'utf8')

async function main() {
  console.log('A) promotion selects ONLY manual + suggested topics')
  {
    const rows: TopicStatusRow[] = [
      { id: 'm1', status: 'suggested', source: 'manual' },        // the defect case → promote
      { id: 'a1', status: 'suggested', source: 'recommendation' }, // auto suggested → NEVER promote
      { id: 'm2', status: 'approved', source: 'manual' },          // already approved → skip
      { id: 'a2', status: 'approved', source: 'site_scan' },       // auto approved → enqueue only
      { id: 'm3', status: 'rejected', source: 'manual' },          // manual but rejected → not promoted
    ]
    const toApprove = selectManualTopicsToApprove(rows)
    check('1/2. manual+suggested is selected for approval', toApprove.includes('m1'))
    check('10. a non-manual suggested topic is NEVER auto-approved', !toApprove.includes('a1'))
    check('D. an already-approved manual topic is skipped (idempotent)', !toApprove.includes('m2'))
    check('a rejected manual topic is not promoted', !toApprove.includes('m3'))
    check('exactly one topic promoted here', toApprove.length === 1)

    const approved = approvedTopicIds(rows, toApprove)
    check('approved set = newly promoted ∪ already approved', approved.has('m1') && approved.has('m2') && approved.has('a2'))
    check('9. a non-manual suggested topic stays OUT of the approved set', !approved.has('a1'))
  }

  console.log('B) partition into queue / already-queued / not-approved')
  {
    const requested = ['m1', 'a1', 'm2', 'dup', 'dup']
    const approved = new Set(['m1', 'm2', 'dup'])
    const alreadyQueued = new Set(['m2'])
    const p = partitionForQueue(requested, approved, alreadyQueued)
    check('5. approved + not-queued → toQueue', p.toQueue.includes('m1') && p.toQueue.includes('dup'))
    check('C. approved + already-in-pool → alreadyQueued', p.alreadyQueued.includes('m2'))
    check('10. not-approved (non-manual suggested) → notApproved', p.notApproved.includes('a1'))
    check('7/8. duplicate requested id is de-duplicated (no double queue)', p.toQueue.filter((x) => x === 'dup').length === 1)
    // Idempotent success semantics.
    check('C. a repeat click (all already queued) is a SUCCESS', isQueueSuccess(0, 2) === true)
    check('nothing queued and nothing already-queued → not success', isQueueSuccess(0, 0) === false)
    check('added > 0 → success', isQueueSuccess(1, 0) === true)
  }

  console.log('C) the exact live topic 7b9dafda flows through to queued')
  {
    // The proven live row: source=manual, status=suggested → promoted, then queued.
    const rows: TopicStatusRow[] = [{ id: '7b9dafda-f2fd-460e-a93d-c3e088069c2e', status: 'suggested', source: 'manual' }]
    const toApprove = selectManualTopicsToApprove(rows)
    const approved = approvedTopicIds(rows, toApprove)
    const p = partitionForQueue(['7b9dafda-f2fd-460e-a93d-c3e088069c2e'], approved, new Set())
    check('live manual topic is promoted', toApprove.length === 1)
    check('live manual topic is queued (not notApproved)', p.toQueue.length === 1 && p.notApproved.length === 0)
  }

  console.log('D) server route + client wiring (static)')
  {
    const routeSrc = read('../../../app/api/content/automation/pools/[id]/approve-and-queue/route.ts')
    // 3/4. server-authoritative: promote via a guarded update, then verify approved.
    check('3. update guards source=manual AND status=suggested (never a non-manual topic)', /\.eq\('source', 'manual'\)[\s\S]{0,80}\.eq\('status', 'suggested'\)/.test(routeSrc))
    check('4. verifies the returned row is approved before enqueue', /toApprove\.every\(\(tid\) => nowApproved\.has\(tid\)\)/.test(routeSrc))
    check('11. status-only update preserves the manual brief (no other fields set)', /\.update\(\{ status: 'approved', updated_at: /.test(routeSrc) && !/brief_notes|primary_keyword|tone_of_voice/.test(routeSrc.split('.update(')[1].split(')')[0]))
    check('typed errors present', /manual_topic_not_found/.test(routeSrc) && /manual_topic_ownership_failed/.test(routeSrc) && /manual_topic_approval_failed/.test(routeSrc) && /queue_insert_failed/.test(routeSrc))
    check('diagnosticId + stage in the failure log', /\[approve-and-queue\] failed/.test(routeSrc) && /diagnosticId/.test(routeSrc) && /stage/.test(routeSrc))
    check('log exposes no secrets/SQL/content (poolId + stage + error only)', !/creds|password|content_html|article body|token/i.test(routeSrc))
    check('8. reuses the EXISTING pool (no pool creation here)', !/from\('article_pools'\).*insert/i.test(routeSrc) && /article_pool_items/.test(routeSrc))
    check('7. does not create a second topic (no article_topics insert)', !/from\('article_topics'\)[\s\S]{0,40}\.insert/.test(routeSrc))
    check('does not mark topic used at enqueue time', !/status:\s*'used'/.test(routeSrc) && !/\.update\(\{[^}]*'used'/.test(routeSrc))

    const hubSrc = read('../../../components/content/ContentHub.tsx')
    check('client review-panel enqueue now calls approve-and-queue', /pools\/\$\{poolId\}\/approve-and-queue/.test(hubSrc))
    check('client still treats added>0 OR alreadyQueued as success', /added <= 0 && alreadyQueued <= 0\) return false/.test(hubSrc))

    // 10. the plain items route is UNCHANGED (still strict — rejects non-approved).
    const itemsSrc = read('../../../app/api/content/automation/pools/[id]/items/route.ts')
    check('10. plain items route still rejects non-approved (unchanged strict validation)', /if \(!approved\.has\(topicId\)\) \{ notApproved\.push/.test(itemsSrc))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}
main()
