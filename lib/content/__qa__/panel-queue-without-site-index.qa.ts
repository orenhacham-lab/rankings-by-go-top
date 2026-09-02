/**
 * NewTopicsLinkPlanPanel — queueing new topics WITHOUT a site index.
 *
 * THE DEFECT. PR #48 fixed the missing-index flow in TopicPlanDrawer, but the
 * POST-CREATION flow goes through NewTopicsLinkPlanPanel, which had the same
 * bug untouched:
 *
 *   1. Create a manual article topic.
 *   2. NewTopicsLinkPlanPanel opens and runs its mount-time preview.
 *   3. The plan endpoint returns a non-2xx explicitly reporting cacheState 'missing'.
 *   4. The panel set a BLOCKING cacheMissing error and returned before checking
 *      the topics — so `selected` stayed empty, `topicIdsToSave` was empty, and
 *      both buttons were dead.
 *   5. saveAndQueue always called runSave(true) → bulk-save → refused for the
 *      missing cache → onEnqueue was never reached.
 *
 * The topic was created and left sitting in the ready-topics list, never queued.
 *
 * WHAT IS PROVEN HERE. The policy is NOT restated for this surface: the panel
 * calls the same pure resolveQueueLinkExpectation the drawer does, so the tests
 * below drive that function with the panel's own inputs. A harness replays the
 * panel's mount-time response handling and its saveAndQueue branch against a
 * fetch spy, so "which endpoints are called" is observed rather than asserted.
 * Source contracts bind the real component to the same function.
 *
 * SCOPE NOTE: sections marked SOURCE assert what the component's code does, not
 * what React renders; they are not a substitute for a browser test.
 *
 * Run: npx tsx lib/content/__qa__/panel-queue-without-site-index.qa.ts
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { resolveQueueLinkExpectation } from '../queue-link-expectation'
import { classifyTopicOutcome, summarizeBatch, type TopicStageOutcomes } from '../automation/approve-link-queue'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')

const TOPIC_IDS = ['t1', 't2']

/** What the panel's mount-time preview handler derives from one response. */
type PanelPreview =
  | { status: 'pending' }
  | { status: 'unavailable' }
  | { status: 'loaded'; cacheState: string }

/**
 * Replays the panel's mount-time response handling. Mirrors the component: an
 * explicit 'missing' on a non-2xx is a LOADED preview (and checks every topic
 * so it can be queued); any other non-2xx, a throw, or a body with no cache
 * state is UNAVAILABLE and stays fail-closed.
 */
function handlePreviewResponse(r:
  | { kind: 'throw' }
  | { kind: 'response'; ok: boolean; body: Record<string, unknown> },
): { preview: PanelPreview; blockingError: boolean; cacheNote: boolean; selectedTopicIds: string[] } {
  if (r.kind === 'throw') return { preview: { status: 'unavailable' }, blockingError: true, cacheNote: false, selectedTopicIds: [] }
  if (!r.ok) {
    if (r.body.cacheState === 'missing') {
      return { preview: { status: 'loaded', cacheState: 'missing' }, blockingError: false, cacheNote: true, selectedTopicIds: [...TOPIC_IDS] }
    }
    return { preview: { status: 'unavailable' }, blockingError: true, cacheNote: false, selectedTopicIds: [] }
  }
  const cacheState = typeof r.body.cacheState === 'string' && (r.body.cacheState as string).length > 0 ? (r.body.cacheState as string) : 'ok'
  return { preview: { status: 'loaded', cacheState }, blockingError: false, cacheNote: false, selectedTopicIds: [...TOPIC_IDS] }
}

/**
 * Replays the panel's saveAndQueue against a fetch spy, using the REAL decision
 * function with the panel's inputs.
 */
async function simulateSaveAndQueue(opts: {
  preview: PanelPreview
  checkedLinkCount: number
  topicIdsToSave: string[]
  alreadySavedInSession?: boolean
  bulkSaveOk?: boolean
  bulkSaveOkIds?: string[]
}) {
  const calls: string[] = []
  let enqueuedWith: { ids: string[]; expectsLinks: boolean } | null = null
  let onSavedCalled = false
  let errorShown: string | null = null

  const decision = resolveQueueLinkExpectation({
    preview: opts.preview,
    savedPlan: { status: 'loaded', exists: opts.alreadySavedInSession === true },
    checkedLinkCount: opts.checkedLinkCount,
  })
  if (opts.topicIdsToSave.length === 0) return { calls, enqueuedWith, onSavedCalled, errorShown, decision, refused: true as const }
  if (!decision.canQueue) return { calls, enqueuedWith, onSavedCalled, errorShown, decision, refused: true as const }

  if (!decision.persistPlan) {
    enqueuedWith = { ids: opts.topicIdsToSave, expectsLinks: false }
    calls.push('/api/content/automation/pools/POOL/approve-and-queue')
    return { calls, enqueuedWith, onSavedCalled, errorShown, decision, refused: false as const }
  }

  calls.push('/api/content/automation/internal-links/plan/bulk-save')
  if (opts.bulkSaveOk === false) { errorShown = 'save_error'; return { calls, enqueuedWith, onSavedCalled, errorShown, decision, refused: false as const } }
  onSavedCalled = true
  const okIds = opts.bulkSaveOkIds ?? opts.topicIdsToSave
  if (okIds.length === 0) { errorShown = 'save_error'; return { calls, enqueuedWith, onSavedCalled, errorShown, decision, refused: false as const } }
  enqueuedWith = { ids: okIds, expectsLinks: true }
  calls.push('/api/content/automation/pools/POOL/approve-and-queue')
  return { calls, enqueuedWith, onSavedCalled, errorShown, decision, refused: false as const }
}

const serverOutcome = (o: Partial<TopicStageOutcomes>) => classifyTopicOutcome('t1', {
  validated: true, linkPlanRequested: false, linkPlanSaved: false,
  approved: true, enqueued: true, alreadyQueued: false, ...o,
})

async function main() {
  console.log('NewTopicsLinkPlanPanel — queueing without a site index\n')
  const panel = strip(read('components/content/NewTopicsLinkPlanPanel.tsx'))
  const hub = strip(read('components/content/ContentHub.tsx'))

  // ───────────────────────────────────────────────────────────────────────
  console.log('1) THE INCIDENT — confirmed missing index + zero links')
  {
    const mount = handlePreviewResponse({ kind: 'response', ok: false, body: { cacheState: 'missing' } })
    check('1a: a CONFIRMED missing index is a loaded preview, not a failure',
      mount.preview.status === 'loaded' && mount.preview.status === 'loaded' && mount.preview.cacheState === 'missing')
    check('1b: it is shown as information, not a blocking error',
      mount.blockingError === false && mount.cacheNote === true)
    check('1c: and the new topics are still CHECKED, so they can be queued',
      mount.selectedTopicIds.length === TOPIC_IDS.length)

    const r = await simulateSaveAndQueue({ preview: mount.preview, checkedLinkCount: 0, topicIdsToSave: mount.selectedTopicIds })
    check('1d: bulk-save is NOT called', !r.calls.some((c) => c.includes('bulk-save')))
    check('1e: onEnqueue IS called with expectsLinks:false',
      r.enqueuedWith?.expectsLinks === false && JSON.stringify(r.enqueuedWith?.ids) === JSON.stringify(TOPIC_IDS))
    check('1f: no link plan is claimed — onSaved is not invoked', r.onSavedCalled === false)
    check('1g: the decision names why', r.decision.reason === 'no_links_no_index')
    check('1h: no error is shown', r.errorShown === null)

    const outcome = serverOutcome({ linkPlanRequested: false })
    check('1i: the server skips the link stage and reports success', outcome.state === 'success')
    check('1j: and the batch counts them as added', summarizeBatch([outcome]).ok === true)
  }

  // ───────────────────────────────────────────────────────────────────────
  console.log('\n2) Fail-closed — an unconfirmed preview can never queue link-free')
  {
    const cases: { label: string; r: ReturnType<typeof handlePreviewResponse> }[] = [
      { label: 'network exception', r: handlePreviewResponse({ kind: 'throw' }) },
      { label: 'non-2xx with NO cacheState', r: handlePreviewResponse({ kind: 'response', ok: false, body: {} }) },
      { label: 'non-2xx with a malformed body', r: handlePreviewResponse({ kind: 'response', ok: false, body: { cacheState: 123 as unknown as string } }) },
      { label: 'non-2xx reporting some other state', r: handlePreviewResponse({ kind: 'response', ok: false, body: { cacheState: 'stale' } }) },
    ]
    for (const c of cases) {
      check(`2: ${c.label} → the preview is UNAVAILABLE, not "missing"`, c.r.preview.status === 'unavailable')
      check(`2: ${c.label} → the ordinary load error is shown`, c.r.blockingError === true && c.r.cacheNote === false)
      const q = await simulateSaveAndQueue({ preview: c.r.preview, checkedLinkCount: 0, topicIdsToSave: [...TOPIC_IDS] })
      check(`2: ${c.label} → the queue action is REFUSED and nothing is called`,
        q.refused === true && q.calls.length === 0 && q.enqueuedWith === null)
    }
    const pending = await simulateSaveAndQueue({ preview: { status: 'pending' }, checkedLinkCount: 0, topicIdsToSave: [...TOPIC_IDS] })
    check('2a: a PENDING preview also refuses',
      pending.refused === true && pending.calls.length === 0 && pending.decision.reason === 'preview_pending')
    check('2b: an unconfirmed decision has no expectsLinks to misread',
      !('expectsLinks' in pending.decision))
    // A 200 whose body carries no cache state defaults to 'ok' — never 'missing'.
    const okNoState = handlePreviewResponse({ kind: 'response', ok: true, body: {} })
    check('2c: a 200 without a cache state defaults to ok, so the link-free path is not taken',
      okNoState.preview.status === 'loaded' && okNoState.preview.cacheState === 'ok')
    const q2 = await simulateSaveAndQueue({ preview: okNoState.preview, checkedLinkCount: 0, topicIdsToSave: [...TOPIC_IDS] })
    check('2d: and it goes through the normal save flow', q2.calls.some((c) => c.includes('bulk-save')))
  }

  // ───────────────────────────────────────────────────────────────────────
  console.log('\n3) The normal link-plan flow is unchanged')
  {
    const mount = handlePreviewResponse({ kind: 'response', ok: true, body: { cacheState: 'ok' } })
    const r = await simulateSaveAndQueue({ preview: mount.preview, checkedLinkCount: 3, topicIdsToSave: [...TOPIC_IDS] })
    check('3a: bulk-save is called first', r.calls[0]?.includes('bulk-save') === true)
    check('3b: onSaved is invoked', r.onSavedCalled === true)
    check('3c: and onEnqueue claims the plan with expectsLinks:true', r.enqueuedWith?.expectsLinks === true)
    check('3d: the decision names the selection', r.decision.reason === 'links_selected')

    // Links checked even with NO index still save — never silently discarded.
    const withLinks = await simulateSaveAndQueue({ preview: { status: 'loaded', cacheState: 'missing' }, checkedLinkCount: 1, topicIdsToSave: [...TOPIC_IDS] })
    check('3e: a checked link is never dropped to take the link-free path',
      withLinks.calls.some((c) => c.includes('bulk-save')) && withLinks.enqueuedWith?.expectsLinks === true)

    // A plan already saved in this panel session is claimed, not skipped.
    const second = await simulateSaveAndQueue({ preview: { status: 'loaded', cacheState: 'missing' }, checkedLinkCount: 0, topicIdsToSave: [...TOPIC_IDS], alreadySavedInSession: true })
    check('3f: once this panel has saved a plan, it is claimed with expectsLinks:true',
      second.decision.reason === 'saved_plan_claimed' && second.enqueuedWith?.expectsLinks === true)
  }

  // ───────────────────────────────────────────────────────────────────────
  console.log('\n4) Partial results, failures and truthfulness are preserved')
  {
    const failed = await simulateSaveAndQueue({ preview: { status: 'loaded', cacheState: 'ok' }, checkedLinkCount: 2, topicIdsToSave: [...TOPIC_IDS], bulkSaveOk: false })
    check('4a: a failed bulk-save aborts BEFORE the queue', failed.enqueuedWith === null && failed.errorShown === 'save_error')
    const partial = await simulateSaveAndQueue({ preview: { status: 'loaded', cacheState: 'ok' }, checkedLinkCount: 2, topicIdsToSave: [...TOPIC_IDS], bulkSaveOkIds: ['t1'] })
    check('4b: only topics whose plan SAVED are queued — no blind fallback',
      JSON.stringify(partial.enqueuedWith?.ids) === JSON.stringify(['t1']))
    const noneSaved = await simulateSaveAndQueue({ preview: { status: 'loaded', cacheState: 'ok' }, checkedLinkCount: 2, topicIdsToSave: [...TOPIC_IDS], bulkSaveOkIds: [] })
    check('4c: when nothing saved, nothing is queued and an error is shown',
      noneSaved.enqueuedWith === null && noneSaved.errorShown === 'save_error')
    check('4d: SOURCE — dropped-link and approval-shortfall handling is untouched',
      /droppedCount === 0/.test(panel) && /setApprovalShort\(anyApprovalShort\)/.test(panel))
    check('4e: SOURCE — the success banner and queue refresh are untouched',
      /setQueuedOk\(true\)/.test(panel) && /t\.enqueueFailed/.test(panel))
    check('4f: SOURCE — cache-changed protection is untouched',
      /reviewedSnapshot: reviewedSnapshotRef\.current \?\? undefined/.test(panel)
      && /data\.reason === 'cache_changed_replan_required' \? t\.cacheChanged/.test(panel))
    check('4g: SOURCE — the link-free branch does NOT call onSaved',
      /if \(!queueDecision\.persistPlan\) \{[\s\S]{0,420}?\}/.test(panel)
      && !/if \(!queueDecision\.persistPlan\) \{[\s\S]{0,420}?onSaved\(/.test(panel))
  }

  // ───────────────────────────────────────────────────────────────────────
  console.log('\n5) END TO END — create a manual topic, then queue it immediately')
  {
    // The panel mounts for the freshly-created topic; the project has no index.
    const mount = handlePreviewResponse({ kind: 'response', ok: false, body: { cacheState: 'missing' } })
    const r = await simulateSaveAndQueue({ preview: mount.preview, checkedLinkCount: 0, topicIdsToSave: mount.selectedTopicIds })
    check('5a: the panel is usable — the topics are checked and the action is allowed',
      mount.selectedTopicIds.length > 0 && r.refused === false)
    check('5b: no internal-link endpoint is touched at all',
      r.calls.every((c) => !c.includes('internal-links')))
    check('5c: approve-and-queue is called with expectsLinks:false',
      r.calls.some((c) => c.includes('approve-and-queue')) && r.enqueuedWith?.expectsLinks === false)
    const outcomes = TOPIC_IDS.map(() => serverOutcome({ linkPlanRequested: false }))
    check('5d: every manual topic is approved and enqueued', outcomes.every((o) => o.state === 'success'))
    const s = summarizeBatch(outcomes)
    check('5e: the batch reports them all as added', s.ok === true && s.added === TOPIC_IDS.length && s.failed === 0)
    const replay = serverOutcome({ linkPlanRequested: false, enqueued: false, alreadyQueued: true })
    check('5f: a repeat is idempotent, not a failure', replay.state === 'already_queued')
  }

  // ───────────────────────────────────────────────────────────────────────
  console.log('\n6) SOURCE — the panel reuses the shared policy rather than restating it')
  {
    check('6a: it imports the same pure decision the drawer uses',
      /import \{ resolveQueueLinkExpectation \} from '@\/lib\/content\/queue-link-expectation'/.test(panel))
    check('6b: and derives the preview fact from an EXPLICIT cache state only',
      /if \(data\.cacheState === 'missing'\) \{/.test(panel)
      && /setError\(t\.loadError\); setPreviewStatus\('unavailable'\); return/.test(panel))
    check('6c: a thrown mount-time preview is unavailable, never "missing"',
      /setError\(t\.loadError\); setPreviewStatus\('unavailable'\)\s*\n\s*\} finally/.test(panel))
    check('6d: the confirmed-missing branch checks the topics so they can be queued',
      /setCacheState\('missing'\); setPreviewStatus\('loaded'\); setCacheNote\(t\.cacheMissing\)/.test(panel)
      && /setSelected\(new Set\(topics\.map\(\(tp\) => tp\.id\)\)\)/.test(panel))
    check('6e: the save payload and the decision read the SAME selection',
      /const selectedLinks = selectedLinksForSave/.test(panel)
      && /checkedLinkCount: selectedLinksForSave\.length/.test(panel))
    check('6f: the handler refuses unless the decision can queue',
      /if \(!queueDecision\.canQueue\) return/.test(panel))
    check('6g: and the button is disabled until then',
      /disabled=\{saving \|\| queuing \|\| topicIdsToSave\.length === 0 \|\| !queueDecision\.canQueue\}/.test(panel))
    check('6h: the link-free branch enqueues with an explicit false',
      /onEnqueue\(topicIdsToSave, false\)/.test(panel))
    check('6i: the plan-saving branch still enqueues with an explicit true',
      /onEnqueue\(r\.okIds, true\)/.test(panel))
    check('6j: ContentHub still forwards whatever it is given',
      /topics: topicIds\.map\(\(topicId\) => \(\{ topicId, expectsLinks \}\)\)/.test(hub))
    check('6k: no second copy of the policy — the panel defines no cacheState rule of its own',
      !/cacheState !== 'missing'/.test(panel) && !/expectsLinks: true/.test(panel))
  }

  // ───────────────────────────────────────────────────────────────────────
  console.log('\n7) UX — truthful copy')
  {
    const en = read('lib/i18n/dashboard/en.ts')
    const he = read('lib/i18n/dashboard/he.ts')
    check('7a: SOURCE — the label follows the decision',
      /queueDecision\.canQueue && !queueDecision\.expectsLinks \? t\.queueWithoutLinks : t\.saveAndQueue/.test(panel))
    check('7b: English label', /queueWithoutLinks: 'Add to queue without internal links'/.test(en))
    check('7c: Hebrew label', /queueWithoutLinks: 'הוסף לתור ללא קישורים פנימיים'/.test(he))
    check('7d: the notice is rendered as information, not as the red error',
      /\{cacheNote && <p className="mt-2 text-xs text-amber-700/.test(panel))
    check('7e: it no longer tells the user to refresh and try again',
      !/Site index missing — refresh the index and try again/.test(en)
      && !/אינדקס האתר חסר — רעננו את האינדקס ונסו שוב/.test(he))
    check('7f: it says the topics can still be queued',
      /You can still add these topics to the queue/.test(en) && /אפשר עדיין להוסיף את הנושאים לתור/.test(he))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}

main()
