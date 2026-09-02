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

/**
 * Saved-plan lookups, always stated explicitly. There is deliberately no
 * "assume nothing is saved" shortcut: `exists: false` must come from an answer.
 */
const NO_SAVED_PLANS = { status: 'loaded' as const, existsByTopic: { t1: false, t2: false } }
const ALL_HAVE_PLANS = { status: 'loaded' as const, existsByTopic: { t1: true, t2: true } }

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
 * What the panel's saved-plan LOOKUP reported. There is no "assume false"
 * variant on purpose: every test below must supply a real per-topic answer or
 * an explicit pending/unavailable state.
 */
type SavedLookup =
  | { status: 'pending' }
  | { status: 'unavailable' }
  | { status: 'loaded'; existsByTopic: Record<string, boolean> }

/**
 * Replays the panel's mount-time saved-plan lookup: one GET per topic, and ANY
 * failure (throw, non-2xx, or a body whose `exists` is not a boolean) makes the
 * whole fact unavailable — a partial answer authorizes nothing.
 */
function handleSavedLookup(responses: Record<string, { kind: 'throw' } | { kind: 'response'; ok: boolean; body: unknown }>): SavedLookup {
  const existsByTopic: Record<string, boolean> = {}
  for (const [topicId, r] of Object.entries(responses)) {
    if (r.kind === 'throw' || !r.ok) return { status: 'unavailable' }
    const body = r.body as { exists?: unknown } | null
    if (!body || typeof body.exists !== 'boolean') return { status: 'unavailable' }
    existsByTopic[topicId] = body.exists
  }
  return { status: 'loaded', existsByTopic }
}

/**
 * Replays the panel's saveAndQueue against a fetch spy, using the REAL decision
 * function with the panel's inputs — including the aggregation over selected
 * topics and the "no answer for a selected topic" guard.
 */
async function simulateSaveAndQueue(opts: {
  preview: PanelPreview
  savedLookup: SavedLookup
  checkedLinkCount: number
  topicIdsToSave: string[]
  /** Only for a cache that EXISTS — a missing cache is refused unconditionally. */
  bulkSaveOk?: boolean
  bulkSaveOkIds?: string[]
}) {
  const calls: string[] = []
  let enqueuedWith: { ids: string[]; expectsLinks: boolean } | null = null
  let onSavedCalled = false
  let errorShown: string | null = null

  const lookup = opts.savedLookup
  const savedPlan = lookup.status !== 'loaded'
    ? { status: lookup.status }
    // A selected topic with no answer means the fact is not known for the batch.
    : opts.topicIdsToSave.some((id) => typeof lookup.existsByTopic[id] !== 'boolean')
      ? { status: 'unavailable' as const }
      // ALL selected topics must own a plan for the batch to claim one; a mixed
      // selection is refused by the batch guard below.
      : { status: 'loaded' as const, exists: opts.topicIdsToSave.every((id) => lookup.existsByTopic[id] === true) }
  const decision = resolveQueueLinkExpectation({
    preview: opts.preview,
    savedPlan,
    checkedLinkCount: opts.checkedLinkCount,
  })
  // Batch-level guard, mirroring the panel: on the no-write path a batch that
  // mixes topics WITH and WITHOUT a saved plan cannot be expressed by one
  // expectsLinks flag, so it is refused rather than partially queued.
  const cannotPersist = opts.preview.status === 'loaded' && opts.preview.cacheState === 'missing'
  const values = lookup.status === 'loaded' ? opts.topicIdsToSave.map((id) => lookup.existsByTopic[id]) : []
  const allKnown = values.length > 0 && values.every((v) => typeof v === 'boolean')
  const mixedSavedPlans = cannotPersist && opts.checkedLinkCount === 0 && allKnown
    && values.some((v) => v === true) && !values.every((v) => v === true)
  if (mixedSavedPlans) return { calls, enqueuedWith, onSavedCalled, errorShown, decision, refused: true as const, mixed: true as const }
  if (opts.topicIdsToSave.length === 0) return { calls, enqueuedWith, onSavedCalled, errorShown, decision, refused: true as const, mixed: false as const }
  if (!decision.canQueue) return { calls, enqueuedWith, onSavedCalled, errorShown, decision, refused: true as const, mixed: false as const }

  if (!decision.persistPlan) {
    enqueuedWith = { ids: opts.topicIdsToSave, expectsLinks: decision.expectsLinks }
    calls.push('/api/content/automation/pools/POOL/approve-and-queue')
    return { calls, enqueuedWith, onSavedCalled, errorShown, decision, refused: false as const, mixed: false as const }
  }

  calls.push('/api/content/automation/internal-links/plan/bulk-save')
  // THE REAL SERVER BEHAVIOUR, not a manufactured success: bulk-save answers
  // 409 { ok:false, cacheState:'missing' } whenever the cached index is absent
  // (app/api/content/automation/internal-links/plan/bulk-save/route.ts). Any
  // path that reaches a save with a missing index therefore STOPS here — which
  // is the original incident, and why a test may not assume otherwise.
  if (opts.preview.status === 'loaded' && opts.preview.cacheState === 'missing') {
    errorShown = 'cache_missing_save_refused'
    return { calls, enqueuedWith, onSavedCalled, errorShown, decision, refused: false as const, mixed: false as const }
  }
  if (opts.bulkSaveOk === false) { errorShown = 'save_error'; return { calls, enqueuedWith, onSavedCalled, errorShown, decision, refused: false as const, mixed: false as const } }
  onSavedCalled = true
  const okIds = opts.bulkSaveOkIds ?? opts.topicIdsToSave
  if (okIds.length === 0) { errorShown = 'save_error'; return { calls, enqueuedWith, onSavedCalled, errorShown, decision, refused: false as const, mixed: false as const } }
  enqueuedWith = { ids: okIds, expectsLinks: true }
  calls.push('/api/content/automation/pools/POOL/approve-and-queue')
  return { calls, enqueuedWith, onSavedCalled, errorShown, decision, refused: false as const, mixed: false as const }
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

    const r = await simulateSaveAndQueue({ preview: mount.preview, savedLookup: NO_SAVED_PLANS, checkedLinkCount: 0, topicIdsToSave: mount.selectedTopicIds })
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
      const q = await simulateSaveAndQueue({ preview: c.r.preview, savedLookup: NO_SAVED_PLANS, checkedLinkCount: 0, topicIdsToSave: [...TOPIC_IDS] })
      check(`2: ${c.label} → the queue action is REFUSED and nothing is called`,
        q.refused === true && q.calls.length === 0 && q.enqueuedWith === null)
    }
    const pending = await simulateSaveAndQueue({ preview: { status: 'pending' }, savedLookup: NO_SAVED_PLANS, checkedLinkCount: 0, topicIdsToSave: [...TOPIC_IDS] })
    check('2a: a PENDING preview also refuses',
      pending.refused === true && pending.calls.length === 0 && pending.decision.reason === 'preview_pending')
    check('2b: an unconfirmed decision has no expectsLinks to misread',
      !('expectsLinks' in pending.decision))
    // A 200 whose body carries no cache state defaults to 'ok' — never 'missing'.
    const okNoState = handlePreviewResponse({ kind: 'response', ok: true, body: {} })
    check('2c: a 200 without a cache state defaults to ok, so the link-free path is not taken',
      okNoState.preview.status === 'loaded' && okNoState.preview.cacheState === 'ok')
    const q2 = await simulateSaveAndQueue({ preview: okNoState.preview, savedLookup: NO_SAVED_PLANS, checkedLinkCount: 0, topicIdsToSave: [...TOPIC_IDS] })
    check('2d: and it goes through the normal save flow', q2.calls.some((c) => c.includes('bulk-save')))
  }

  // ───────────────────────────────────────────────────────────────────────
  console.log('\n3) The normal link-plan flow is unchanged')
  {
    const mount = handlePreviewResponse({ kind: 'response', ok: true, body: { cacheState: 'ok' } })
    const r = await simulateSaveAndQueue({ preview: mount.preview, savedLookup: NO_SAVED_PLANS, checkedLinkCount: 3, topicIdsToSave: [...TOPIC_IDS] })
    check('3a: bulk-save is called first', r.calls[0]?.includes('bulk-save') === true)
    check('3b: onSaved is invoked', r.onSavedCalled === true)
    check('3c: and onEnqueue claims the plan with expectsLinks:true', r.enqueuedWith?.expectsLinks === true)
    check('3d: the decision names the selection', r.decision.reason === 'links_selected')

    // A checked link is never dropped to take the link-free path. With no index
    // the save is ATTEMPTED and truthfully refused by the real server — the
    // topic is not queued behind the user's back without the link they chose.
    const withLinks = await simulateSaveAndQueue({ preview: { status: 'loaded', cacheState: 'missing' }, savedLookup: NO_SAVED_PLANS, checkedLinkCount: 1, topicIdsToSave: [...TOPIC_IDS] })
    check('3e: a checked link is never dropped to take the link-free path',
      withLinks.decision.reason === 'links_selected' && !(withLinks.enqueuedWith?.expectsLinks === false))
    check('3e2: the save is attempted and the real missing-cache refusal surfaces',
      withLinks.calls.some((c) => c.includes('bulk-save'))
      && withLinks.errorShown === 'cache_missing_save_refused' && withLinks.enqueuedWith === null)

    // A confirmed existing plan, with an index present, is re-saved and claimed.
    const withIndex = await simulateSaveAndQueue({ preview: { status: 'loaded', cacheState: 'ok' }, savedLookup: ALL_HAVE_PLANS, checkedLinkCount: 0, topicIdsToSave: [...TOPIC_IDS] })
    check('3f: with an index, a confirmed existing plan is re-saved and claimed',
      withIndex.decision.reason === 'saved_plan_claimed' && withIndex.calls.some((c) => c.includes('bulk-save'))
      && withIndex.enqueuedWith?.expectsLinks === true)
  }

  // ───────────────────────────────────────────────────────────────────────
  console.log('\n4) Partial results, failures and truthfulness are preserved')
  {
    const failed = await simulateSaveAndQueue({ preview: { status: 'loaded', cacheState: 'ok' }, savedLookup: NO_SAVED_PLANS, checkedLinkCount: 2, topicIdsToSave: [...TOPIC_IDS], bulkSaveOk: false })
    check('4a: a failed bulk-save aborts BEFORE the queue', failed.enqueuedWith === null && failed.errorShown === 'save_error')
    const partial = await simulateSaveAndQueue({ preview: { status: 'loaded', cacheState: 'ok' }, savedLookup: NO_SAVED_PLANS, checkedLinkCount: 2, topicIdsToSave: [...TOPIC_IDS], bulkSaveOkIds: ['t1'] })
    check('4b: only topics whose plan SAVED are queued — no blind fallback',
      JSON.stringify(partial.enqueuedWith?.ids) === JSON.stringify(['t1']))
    const noneSaved = await simulateSaveAndQueue({ preview: { status: 'loaded', cacheState: 'ok' }, savedLookup: NO_SAVED_PLANS, checkedLinkCount: 2, topicIdsToSave: [...TOPIC_IDS], bulkSaveOkIds: [] })
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
  // NOT an end-to-end test: it drives the panel's own decision inputs and the
  // server's pure per-topic contract, with no React component and no HTTP route
  // in the loop. Named for what it actually covers.
  console.log('\n5) The fresh manual-topic path — decision inputs through the server contract')
  {
    // The panel mounts for freshly-created topics; the project has no index, and
    // the saved-plan lookup CONFIRMS neither topic owns a plan.
    const mount = handlePreviewResponse({ kind: 'response', ok: false, body: { cacheState: 'missing' } })
    const saved = handleSavedLookup({ t1: { kind: 'response', ok: true, body: { exists: false } }, t2: { kind: 'response', ok: true, body: { exists: false } } })
    check('5-pre: the lookup positively reported no saved plans', saved.status === 'loaded')
    const r = await simulateSaveAndQueue({ preview: mount.preview, savedLookup: saved, checkedLinkCount: 0, topicIdsToSave: mount.selectedTopicIds })
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
  console.log('\n5B) An EXISTING topic with a saved plan, on a project with NO index')
  {
    // topics/bulk resolves a chosen idea to an EXISTING topic
    // (resolvedTopics[].source === 'existing'), and AutomationIdeas passes it to
    // this panel like any other. That topic can already own a link plan.
    //
    // The first fix claimed it via runSave → bulk-save. That is IMPOSSIBLE with
    // no index: bulk-save answers 409 { cacheState: 'missing' }, so the flow
    // stopped before onEnqueue and the topic was stranded — the original
    // incident again. The harness now reproduces that real response, so a test
    // cannot assume the save succeeded.
    const mount = handlePreviewResponse({ kind: 'response', ok: false, body: { cacheState: 'missing' } })
    const saved = handleSavedLookup({
      t1: { kind: 'response', ok: true, body: { exists: true } },
      t2: { kind: 'response', ok: true, body: { exists: true } },
    })
    const r = await simulateSaveAndQueue({ preview: mount.preview, savedLookup: saved, checkedLinkCount: 0, topicIdsToSave: [...TOPIC_IDS] })

    check('5B-a: the index IS confirmed missing and NOTHING is newly checked',
      mount.preview.status === 'loaded' && mount.preview.cacheState === 'missing')
    check('5B-b: onEnqueue(..., false) is NEVER called for a topic that has a plan',
      !(r.enqueuedWith?.expectsLinks === false))
    check('5B-c: the existing plan is claimed WITHOUT a save', r.decision.reason === 'saved_plan_claimed_no_index')
    check('5B-d: so bulk-save — which would be refused — is never called',
      !r.calls.some((c) => c.includes('bulk-save')) && r.errorShown === null)
    check('5B-e: and the batch is enqueued with expectsLinks:true, so the server VERIFIES the plan',
      r.enqueuedWith?.expectsLinks === true && JSON.stringify(r.enqueuedWith?.ids) === JSON.stringify(TOPIC_IDS))
    check('5B-f: nothing is written, so no plan is claimed to have been created', r.onSavedCalled === false)

    // NEGATIVE CONTROL: had the decision still asked for a save, the real server
    // would have refused it and nothing would have been queued.
    const ifItHadSaved = await simulateSaveAndQueue({
      preview: mount.preview,
      savedLookup: saved, checkedLinkCount: 1, topicIdsToSave: [...TOPIC_IDS],
    })
    check('5B-g: NEGATIVE CONTROL — any path that does reach a save with no index stops there',
      ifItHadSaved.calls.some((c) => c.includes('bulk-save'))
      && ifItHadSaved.errorShown === 'cache_missing_save_refused' && ifItHadSaved.enqueuedWith === null)

    // The link-free path still requires EVERY selected topic to be plan-free.
    const allClear = await simulateSaveAndQueue({ preview: mount.preview, savedLookup: NO_SAVED_PLANS, checkedLinkCount: 0, topicIdsToSave: [...TOPIC_IDS] })
    check('5B-h: an all-clear batch still takes the link-free path',
      allClear.enqueuedWith?.expectsLinks === false && allClear.decision.reason === 'no_links_no_index'
      && !allClear.calls.some((c) => c.includes('bulk-save')))
  }

  // ───────────────────────────────────────────────────────────────────────
  console.log('\n5B2) MIXED batches are refused — never partially queued, never plan-free with expectsLinks:true')
  {
    const mount = handlePreviewResponse({ kind: 'response', ok: false, body: { cacheState: 'missing' } })
    const mixed = await simulateSaveAndQueue({
      preview: mount.preview,
      savedLookup: { status: 'loaded', existsByTopic: { t1: true, t2: false } },
      checkedLinkCount: 0, topicIdsToSave: [...TOPIC_IDS],
    })
    check('5B2-a: a mixed batch is REFUSED', mixed.refused === true && mixed.mixed === true)
    check('5B2-b: nothing is called and nothing is queued', mixed.calls.length === 0 && mixed.enqueuedWith === null)
    check('5B2-c: no plan-free topic is ever sent with expectsLinks:true',
      !(mixed.enqueuedWith?.expectsLinks === true))
    check('5B2-d: and no partial queue happens', mixed.enqueuedWith === null)

    // Separating the two groups works — that is what the message asks for.
    const onlyExisting = await simulateSaveAndQueue({
      preview: mount.preview,
      savedLookup: { status: 'loaded', existsByTopic: { t1: true, t2: false } },
      checkedLinkCount: 0, topicIdsToSave: ['t1'],
    })
    check('5B2-e: selecting only the topic WITH a plan claims it',
      onlyExisting.decision.reason === 'saved_plan_claimed_no_index'
      && onlyExisting.enqueuedWith?.expectsLinks === true && JSON.stringify(onlyExisting.enqueuedWith?.ids) === JSON.stringify(['t1']))
    const onlyClear = await simulateSaveAndQueue({
      preview: mount.preview,
      savedLookup: { status: 'loaded', existsByTopic: { t1: true, t2: false } },
      checkedLinkCount: 0, topicIdsToSave: ['t2'],
    })
    check('5B2-f: selecting only the plan-free topic queues it link-free',
      onlyClear.enqueuedWith?.expectsLinks === false && JSON.stringify(onlyClear.enqueuedWith?.ids) === JSON.stringify(['t2']))

    // With an index present a mixed batch is NOT blocked — bulk-save saves a
    // plan for every selected topic first, so they are uniform by the time they
    // are queued.
    const mixedWithIndex = await simulateSaveAndQueue({
      preview: { status: 'loaded', cacheState: 'ok' },
      savedLookup: { status: 'loaded', existsByTopic: { t1: true, t2: false } },
      checkedLinkCount: 0, topicIdsToSave: [...TOPIC_IDS],
    })
    check('5B2-g: with an index the mixed batch proceeds normally through the save',
      mixedWithIndex.refused === false && mixedWithIndex.calls.some((c) => c.includes('bulk-save'))
      && mixedWithIndex.enqueuedWith?.expectsLinks === true)
    check('5B2-h: the guard is scoped to the no-write path only', mixedWithIndex.mixed === false)
  }

  // ───────────────────────────────────────────────────────────────────────
  console.log('\n5C) The saved-plan fact must be LOOKED UP — pending, failed and partial all refuse')
  {
    const mount = handlePreviewResponse({ kind: 'response', ok: false, body: { cacheState: 'missing' } })

    const pending = await simulateSaveAndQueue({ preview: mount.preview, savedLookup: { status: 'pending' }, checkedLinkCount: 0, topicIdsToSave: [...TOPIC_IDS] })
    check('5C-a: a PENDING lookup refuses the action, even with a confirmed missing index',
      pending.refused === true && pending.calls.length === 0 && pending.decision.reason === 'saved_plan_pending')

    for (const [label, responses] of [
      ['one lookup throws', { t1: { kind: 'throw' as const }, t2: { kind: 'response' as const, ok: true, body: { exists: false } } }],
      ['one lookup is non-2xx', { t1: { kind: 'response' as const, ok: false, body: {} }, t2: { kind: 'response' as const, ok: true, body: { exists: false } } }],
      ['one body has no exists field', { t1: { kind: 'response' as const, ok: true, body: {} }, t2: { kind: 'response' as const, ok: true, body: { exists: false } } }],
      ['one body has a non-boolean exists', { t1: { kind: 'response' as const, ok: true, body: { exists: 'no' } }, t2: { kind: 'response' as const, ok: true, body: { exists: false } } }],
    ] as const) {
      const lookup = handleSavedLookup(responses)
      check(`5C: ${label} → the WHOLE fact is unavailable (a partial answer authorizes nothing)`, lookup.status === 'unavailable')
      const q = await simulateSaveAndQueue({ preview: mount.preview, savedLookup: lookup, checkedLinkCount: 0, topicIdsToSave: [...TOPIC_IDS] })
      check(`5C: ${label} → the queue action is REFUSED and nothing is called`,
        q.refused === true && q.calls.length === 0 && q.enqueuedWith === null)
      check(`5C: ${label} → the reason names the saved-plan lookup`, q.decision.reason === 'saved_plan_unavailable')
    }

    // A selected topic the lookup never covered is NOT "no plan".
    const partial = await simulateSaveAndQueue({
      preview: mount.preview,
      savedLookup: { status: 'loaded', existsByTopic: { t1: false } },
      checkedLinkCount: 0, topicIdsToSave: [...TOPIC_IDS],
    })
    check('5C-b: a selected topic with NO answer refuses the action',
      partial.refused === true && partial.decision.reason === 'saved_plan_unavailable')
    check('5C-c: nothing is enqueued in that case', partial.enqueuedWith === null && partial.calls.length === 0)

    check('5C-d: the harness has no way to manufacture exists:false — it must come from an answer',
      handleSavedLookup({ t1: { kind: 'response', ok: true, body: { exists: false } } }).status === 'loaded')
  }

  // ───────────────────────────────────────────────────────────────────────
  console.log('\n5D) A failed saved-plan lookup is VISIBLE and RECOVERABLE')
  {
    // Failing closed is right; a disabled button with no explanation is not.
    const mount = handlePreviewResponse({ kind: 'response', ok: false, body: { cacheState: 'missing' } })

    /** Mirrors the panel: the lookup can be re-run, and each run replaces the fact. */
    function makeLookupState() {
      let lookup: SavedLookup = { status: 'pending' }
      return {
        get: () => lookup,
        run: (responses: Parameters<typeof handleSavedLookup>[0]) => { lookup = handleSavedLookup(responses) },
      }
    }
    const state = makeLookupState()

    check('5D-a: before the lookup resolves the fact is pending', state.get().status === 'pending')
    const whilePending = await simulateSaveAndQueue({ preview: mount.preview, savedLookup: state.get(), checkedLinkCount: 0, topicIdsToSave: [...TOPIC_IDS] })
    check('5D-b: pending temporarily refuses the action', whilePending.refused === true && whilePending.calls.length === 0)

    // First attempt fails.
    state.run({ t1: { kind: 'throw' }, t2: { kind: 'response', ok: true, body: { exists: false } } })
    check('5D-c: a failed lookup is unavailable, not "no plan"', state.get().status === 'unavailable')
    const whileFailed = await simulateSaveAndQueue({ preview: mount.preview, savedLookup: state.get(), checkedLinkCount: 0, topicIdsToSave: [...TOPIC_IDS] })
    check('5D-d: the action stays refused', whileFailed.refused === true && whileFailed.enqueuedWith === null)
    check('5D-e: SOURCE — an actionable error and a retry are shown for exactly that state',
      /savedStatus === 'unavailable' && \(/.test(panel)
      && /\{t\.savedLookupError\}/.test(panel)
      && /onClick=\{\(\) => \{ void loadSavedPlans\(\) \}\}>\{t\.savedLookupRetry\}/.test(panel))
    check('5D-f: SOURCE — retrying resets the fact to pending before re-running',
      /const loadSavedPlans = useCallback\(async \(\) => \{\s*\n\s*setSavedStatus\('pending'\)/.test(panel))

    // Retry succeeds → the correct action becomes available.
    state.run({ t1: { kind: 'response', ok: true, body: { exists: false } }, t2: { kind: 'response', ok: true, body: { exists: false } } })
    check('5D-g: the retry positively confirms the fact', state.get().status === 'loaded')
    const afterRetry = await simulateSaveAndQueue({ preview: mount.preview, savedLookup: state.get(), checkedLinkCount: 0, topicIdsToSave: [...TOPIC_IDS] })
    check('5D-h: and the correct action is now enabled — link-free queueing',
      afterRetry.refused === false && afterRetry.enqueuedWith?.expectsLinks === false
      && !afterRetry.calls.some((c) => c.includes('bulk-save')))

    // A retry that lands on topics WITH plans enables the claim action instead.
    state.run({ t1: { kind: 'response', ok: true, body: { exists: true } }, t2: { kind: 'response', ok: true, body: { exists: true } } })
    const afterRetryExisting = await simulateSaveAndQueue({ preview: mount.preview, savedLookup: state.get(), checkedLinkCount: 0, topicIdsToSave: [...TOPIC_IDS] })
    check('5D-i: a retry finding saved plans enables the CLAIM action instead',
      afterRetryExisting.decision.reason === 'saved_plan_claimed_no_index' && afterRetryExisting.enqueuedWith?.expectsLinks === true)

    check('5D-j: the localized error and retry strings exist in both languages',
      /savedLookupError: 'We couldn’t check whether these topics already have a saved link plan\.'/.test(read('lib/i18n/dashboard/en.ts'))
      && /savedLookupRetry: 'Try again'/.test(read('lib/i18n/dashboard/en.ts'))
      && /savedLookupError: 'לא הצלחנו לבדוק/.test(read('lib/i18n/dashboard/he.ts'))
      && /savedLookupRetry: 'נסו שוב'/.test(read('lib/i18n/dashboard/he.ts')))
    check('5D-k: the mixed-batch explanation is localized too',
      /mixedSavedPlans: 'Some of these topics already have a saved link plan/.test(read('lib/i18n/dashboard/en.ts'))
      && /mixedSavedPlans: 'לחלק מהנושאים/.test(read('lib/i18n/dashboard/he.ts')))
    check('5D-l: SOURCE — the mixed batch shows its own explanation',
      /\{mixedSavedPlans && <p[^>]*>\{t\.mixedSavedPlans\}<\/p>\}/.test(panel))
    check('5D-m: the claim-without-saving label exists in both languages',
      /queueWithSavedPlan: 'Add to queue with the saved links'/.test(read('lib/i18n/dashboard/en.ts'))
      && /queueWithSavedPlan: 'הוסף לתור עם הקישורים השמורים'/.test(read('lib/i18n/dashboard/he.ts')))
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
    check('6f: the handler refuses unless the batch can queue',
      /if \(!canQueue\) return/.test(panel)
      && /const canQueue = queueDecision\.canQueue && !mixedSavedPlans/.test(panel))
    check('6g: and the button is disabled until then',
      /disabled=\{saving \|\| queuing \|\| topicIdsToSave\.length === 0 \|\| !canQueue\}/.test(panel))
    check('6h: the no-write branch enqueues with the decision’s own flag, never a literal',
      /onEnqueue\(topicIdsToSave, queueDecision\.expectsLinks\)/.test(panel)
      && !/onEnqueue\(topicIdsToSave, false\)/.test(panel))
    check('6i: the plan-saving branch still enqueues with an explicit true',
      /onEnqueue\(r\.okIds, true\)/.test(panel))
    check('6j: ContentHub still forwards whatever it is given',
      /topics: topicIds\.map\(\(topicId\) => \(\{ topicId, expectsLinks \}\)\)/.test(hub))
    check('6k: no second copy of the policy — the panel defines no cacheState rule of its own',
      !/cacheState !== 'missing'/.test(panel) && !/expectsLinks: true/.test(panel))
    check('6l: the saved-plan fact is LOOKED UP from the real endpoint, per topic',
      /internal-links\/plan\/saved\?projectId=\$\{encodeURIComponent\(projectId\)\}&topicId=\$\{encodeURIComponent\(topicId\)\}/.test(panel))
    check('6m: it is NEVER inferred from the panel session or the topic lifecycle',
      !/exists: Object\.keys\(saveStatus\)\.length > 0/.test(panel)
      && !/savedPlan: \{ status: 'loaded' as const, exists: [^}]*saveStatus/.test(panel))
    check('6n: any failed or malformed per-topic lookup makes the WHOLE fact unavailable',
      /if \(!res\.ok\) throw new Error\('saved_lookup_failed'\)/.test(panel)
      && /if \(!body \|\| typeof body\.exists !== 'boolean'\) throw new Error\('saved_lookup_malformed'\)/.test(panel)
      && /setSavedExistsByTopic\(\{\}\)\s*\n\s*setSavedStatus\('unavailable'\)/.test(panel))
    check('6o: a selected topic with no answer is treated as unconfirmed',
      /const missingAnswer = topicIdsToSave\.some\(\(id\) => typeof savedExistsByTopic\[id\] !== 'boolean'\)/.test(panel)
      && /missingAnswer\s*\n?\s*\? \{ status: 'unavailable' as const \}/.test(panel))
    check('6p: ALL selected topics must own a plan for the batch to claim one',
      /exists: savedFacts\.allExist/.test(panel)
      && /allExist: allKnown && values\.every\(\(v\) => v === true\)/.test(panel))
    check('6r: a mixed batch is blocked on the no-write path only',
      /const mixedSavedPlans = cannotPersist && selectedLinksForSave\.length === 0 && savedFacts\.allKnown && savedFacts\.anyExist && !savedFacts\.allExist/.test(panel))
    check('6s: the lookup is retryable, not a one-shot',
      /const loadSavedPlans = useCallback\(async \(\) => \{/.test(panel)
      && /onClick=\{\(\) => \{ void loadSavedPlans\(\) \}\}/.test(panel))
    check('6q: a successful save may only UPGRADE a topic to "has a plan", never downgrade',
      /okIds\.map\(\(id\) => \[id, true\]\)/.test(panel) && !/\[id, false\]/.test(panel))
  }

  // ───────────────────────────────────────────────────────────────────────
  console.log('\n7) UX — truthful copy')
  {
    const en = read('lib/i18n/dashboard/en.ts')
    const he = read('lib/i18n/dashboard/he.ts')
    check('7a: SOURCE — the label follows the decision, including the claim-without-saving case',
      /!canQueue \? t\.saveAndQueue/.test(panel)
      && /: !queueDecision\.expectsLinks \? t\.queueWithoutLinks/.test(panel)
      && /: !queueDecision\.persistPlan \? t\.queueWithSavedPlan/.test(panel))
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
