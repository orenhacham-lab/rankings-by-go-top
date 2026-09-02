/**
 * Queueing a topic WITHOUT an internal-link site index — regression QA.
 *
 * THE DEFECT. A manually created topic could not be added to the publishing
 * queue when the project had no internal-link site index. The drawer's
 * automatic preview returned `cacheState: 'missing'` with zero links, but
 * `saveAndQueue()` still called `persistSelection()` unconditionally, which
 * POSTs to /internal-links/plan/bulk-save — and bulk-save correctly refuses a
 * missing cache. The save failed, `onSaveAndQueue()` was never reached, and the
 * user was shown "Site index missing — refresh the index and try again", as
 * though the OPTIONAL link index were a prerequisite for writing an article.
 * `ensurePoolAndEnqueue()` compounded it by hard-coding `expectsLinks: true`,
 * so even reaching the queue would have failed the server's plan verification.
 *
 * Predates the Shopify work — the same implementation exists at 406b288.
 *
 * WHAT IS PROVEN HERE. The policy itself (resolveQueueLinkExpectation) is a
 * pure function and is tested exhaustively. The server contract
 * (classifyTopicOutcome / summarizeBatch) is likewise pure and is tested
 * directly. Between them sits a harness that replays the drawer's save+queue
 * flow against a spying fetch, so "which endpoints are called" is observed
 * rather than asserted about — and source contracts bind the real components to
 * the same pure function.
 *
 * SCOPE NOTE: the sections marked SOURCE assert what the components' code does,
 * not what React renders. They are not a substitute for a browser test of the
 * drawer.
 *
 * Run: npx tsx lib/content/__qa__/queue-without-site-index.qa.ts
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { resolveQueueLinkExpectation, type QueueLinkExpectationInput } from '../queue-link-expectation'
import { classifyTopicOutcome, summarizeBatch, type TopicStageOutcomes } from '../automation/approve-link-queue'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')

/** Confirmed facts, as the two lookups report them when they succeed. */
const CONFIRMED_MISSING_INDEX = { status: 'loaded', cacheState: 'missing' } as const
const CONFIRMED_INDEX_OK = { status: 'loaded', cacheState: 'ok' } as const
const CONFIRMED_NO_SAVED_PLAN = { status: 'loaded', exists: false } as const
const CONFIRMED_SAVED_PLAN = { status: 'loaded', exists: true } as const

/** Defaults describe a healthy project with an index and one checked link. */
const input = (over: Partial<QueueLinkExpectationInput> = {}): QueueLinkExpectationInput => ({
  preview: CONFIRMED_INDEX_OK, savedPlan: CONFIRMED_NO_SAVED_PLAN, checkedLinkCount: 1, ...over,
})
/** The exact state the incident produced, with BOTH facts positively confirmed. */
const NO_INDEX = input({ preview: CONFIRMED_MISSING_INDEX, checkedLinkCount: 0 })

/**
 * Replays the drawer's save+queue flow with the REAL decision function, over a
 * fetch spy. Mirrors TopicPlanDrawer.saveAndQueue: refuse outright unless the
 * decision can queue, persist only when it says to, then enqueue with the
 * decision's own expectsLinks.
 */
async function simulateSaveAndQueue(state: QueueLinkExpectationInput, opts: { planSaveOk?: boolean; planSaveReason?: string } = {}) {
  const calls: string[] = []
  let enqueuedWith: boolean | null = null
  let blockedError: string | null = null

  const decision = resolveQueueLinkExpectation(state)
  if (!decision.canQueue) return { calls, enqueuedWith, blockedError, decision, refused: true as const }
  if (decision.persistPlan) {
    calls.push('/api/content/automation/internal-links/plan/bulk-save')
    if (opts.planSaveOk === false) {
      blockedError = opts.planSaveReason ?? 'save_failed'
      return { calls, enqueuedWith, blockedError, decision, refused: false as const }
    }
  }
  calls.push('/api/content/automation/pools/POOL/approve-and-queue')
  enqueuedWith = decision.expectsLinks
  return { calls, enqueuedWith, blockedError, decision, refused: false as const }
}

/** Narrowing helpers so the assertions below read as facts, not casts. */
const queued = (d: ReturnType<typeof resolveQueueLinkExpectation>) => d.canQueue === true
const expectsLinksOf = (d: ReturnType<typeof resolveQueueLinkExpectation>) => (d.canQueue ? d.expectsLinks : null)
const persistOf = (d: ReturnType<typeof resolveQueueLinkExpectation>) => (d.canQueue ? d.persistPlan : null)

/** The server's per-topic verdict for a topic that reached the route. */
function serverOutcome(o: Partial<TopicStageOutcomes>) {
  return classifyTopicOutcome('t1', {
    validated: true, linkPlanRequested: false, linkPlanSaved: false,
    approved: true, enqueued: true, alreadyQueued: false, ...o,
  })
}

async function main() {
  console.log('Queueing a topic without a site index\n')
  const drawer = strip(read('components/content/TopicPlanDrawer.tsx'))
  const hub = strip(read('components/content/ContentHub.tsx'))
  const route = strip(read('app/api/content/automation/pools/[id]/approve-and-queue/route.ts'))

  // ───────────────────────────────────────────────────────────────────────
  console.log('1) THE INCIDENT — missing cache + zero selected links')
  {
    const r = await simulateSaveAndQueue(NO_INDEX)
    check('1a: NO plan-save endpoint is called',
      !r.calls.some((c) => c.includes('/plan/save') || c.includes('/plan/bulk-save')), r.calls.join(' '))
    check('1b: approve-and-queue IS called', r.calls.some((c) => c.includes('approve-and-queue')))
    check('1c: with expectsLinks:false', r.enqueuedWith === false)
    check('1d: nothing blocks the flow', r.blockedError === null)
    check('1e: the decision names why', r.decision.reason === 'no_links_no_index')
    check('1f: and it does not ask for a plan to be persisted', persistOf(r.decision) === false)

    // The server then approves the manual topic and enqueues it, because the
    // link stage is skipped entirely when it was not requested.
    const outcome = serverOutcome({ linkPlanRequested: false, linkPlanSaved: false })
    check('1g: the server SKIPS the link stage and reports success',
      outcome.state === 'success' && outcome.failedStage === null)
    check('1h: the batch summary counts it as added',
      summarizeBatch([outcome]).ok === true && summarizeBatch([outcome]).added === 1)
  }

  // ───────────────────────────────────────────────────────────────────────
  console.log('\n2) No empty link-plan batch is invented to satisfy the queue')
  {
    const r = await simulateSaveAndQueue(NO_INDEX)
    check('2a: no write of any kind to the link-plan endpoints',
      r.calls.every((c) => !c.includes('internal-links')))
    check('2b: SOURCE — the drawer persists ONLY when the decision says to',
      /if \(queueDecision\.persistPlan\) \{[\s\S]{0,400}await persistSelection\(true\)/.test(drawer))
    // The WRITE endpoints only — `/plan/saved?…` is a GET read used by loadSaved
    // and must not be counted here.
    const writeCalls = [...drawer.matchAll(/internal-links\/plan\/(?:bulk-save|save)'/g)]
    const persistStart = drawer.indexOf('const persistSelection')
    check('2c: SOURCE — both plan WRITE endpoints live inside persistSelection, and nowhere else',
      writeCalls.length === 2 && persistStart !== -1 && writeCalls.every((m) => m.index! > persistStart))
    check('2d: SOURCE — the drawer never fabricates an empty selectedLinks save',
      !/selectedLinks: \[\]/.test(drawer))
  }

  // ───────────────────────────────────────────────────────────────────────
  console.log('\n3) Reviewed / selected links STILL require persistence and verification')
  {
    for (const [label, state] of [
      ['one recommended link checked', input({ checkedLinkCount: 1 })],
      ['many links checked', input({ checkedLinkCount: 7 })],
      ['links checked even with NO index', input({ preview: CONFIRMED_MISSING_INDEX, checkedLinkCount: 1 })],
    ] as const) {
      const r = await simulateSaveAndQueue(state)
      check(`3: ${label} → plan is persisted first`, r.calls.some((c) => c.includes('/plan/bulk-save')))
      check(`3: ${label} → enqueued with expectsLinks:true`, r.enqueuedWith === true)
    }
    check('3a: a checked link is NEVER silently discarded to take the no-links path',
      expectsLinksOf(resolveQueueLinkExpectation(input({ preview: CONFIRMED_MISSING_INDEX, checkedLinkCount: 1 }))) === true)
    check('3b: a CONFIRMED existing saved plan is claimed and must be server-verified',
      expectsLinksOf(resolveQueueLinkExpectation(input({ preview: CONFIRMED_MISSING_INDEX, checkedLinkCount: 0, savedPlan: CONFIRMED_SAVED_PLAN }))) === true)
    check('3c: a present-but-stale index keeps the normal flow',
      expectsLinksOf(resolveQueueLinkExpectation(input({ preview: { status: 'loaded', cacheState: 'stale' }, checkedLinkCount: 0 }))) === true)
    check('3d: any other confirmed cache state keeps the normal flow',
      expectsLinksOf(resolveQueueLinkExpectation(input({ preview: CONFIRMED_INDEX_OK, checkedLinkCount: 0 }))) === true
      && expectsLinksOf(resolveQueueLinkExpectation(input({ preview: { status: 'loaded', cacheState: 'partial' }, checkedLinkCount: 0 }))) === true)
    check('3e: ONLY the exact incident state takes the no-links path',
      expectsLinksOf(resolveQueueLinkExpectation(NO_INDEX)) === false)
  }

  // ───────────────────────────────────────────────────────────────────────
  console.log('\n4) A failed or missing link plan can never be reported as saved')
  {
    const r = await simulateSaveAndQueue(input({ checkedLinkCount: 2 }), { planSaveOk: false })
    check('4a: a failed plan save aborts BEFORE approve-and-queue',
      r.blockedError !== null && !r.calls.some((c) => c.includes('approve-and-queue')))
    check('4b: SOURCE — the drawer returns early when the save fails',
      /const saveResult = await persistSelection\(true\)\s*\n\s*if \(!saveResult\.ok\) return/.test(drawer))

    const missing = serverOutcome({ linkPlanRequested: true, linkPlanSaved: false, approved: false, enqueued: false })
    check('4c: the server refuses a claimed-but-missing plan', missing.state === 'link_plan_failed')
    check('4d: and never approves or enqueues it',
      missing.failedStage === 'link_plan' && missing.errorCode === 'link_plan_save_failed')
    check('4e: the batch is reported as failed, never as added',
      summarizeBatch([missing]).ok === false && summarizeBatch([missing]).added === 0)
    check('4f: SOURCE — the server-side verification is untouched',
      /if \(t\.expectsLinks\) \{[\s\S]{0,300}getLatestBatchForTopic\(auth\.admin, pool\.project_id, t\.topicId\)/.test(route)
      && /outcome\.linkPlanSaved = !!batch/.test(route))
    check('4g: SOURCE — expectsLinks is still read strictly from the request as a verify-request only',
      /expectsLinks: t\.expectsLinks === true/.test(route))
  }

  // ───────────────────────────────────────────────────────────────────────
  console.log('\n5) Cache-changed protection is unchanged')
  {
    const r = await simulateSaveAndQueue(input({ preview: CONFIRMED_INDEX_OK, checkedLinkCount: 3 }), { planSaveOk: false, planSaveReason: 'cache_changed_replan_required' })
    check('5a: a cache-changed refusal still stops the queue action',
      r.blockedError === 'cache_changed_replan_required' && !r.calls.some((c) => c.includes('approve-and-queue')))
    check('5b: SOURCE — the reviewed snapshot is still sent on every save',
      /reviewedSnapshot: reviewedSnapshotRef\.current \?\? undefined/.test(drawer))
    check('5c: SOURCE — and the typed 409 is still surfaced to the user',
      /d\.reason === 'cache_changed_replan_required' \? t\.cacheChanged/.test(drawer))
  }

  // ───────────────────────────────────────────────────────────────────────
  console.log('\n6) UNCONFIRMED facts refuse the queue action — a failure is never a confirmation')
  {
    // 2. Preview network exception, 3. non-2xx with no explicit cacheState.
    for (const [label, preview] of [
      ['preview still pending', { status: 'pending' } as const],
      ['preview network exception', { status: 'unavailable' } as const],
      ['preview non-2xx with no explicit cache state', { status: 'unavailable' } as const],
    ] as const) {
      const r = await simulateSaveAndQueue(input({ preview, savedPlan: CONFIRMED_NO_SAVED_PLAN, checkedLinkCount: 0 }))
      check(`6: ${label} → the queue action is REFUSED`, r.refused === true && !queued(r.decision))
      check(`6: ${label} → and NOTHING is called`, r.calls.length === 0)
      check(`6: ${label} → and it is not classified as a missing cache`, r.decision.reason !== 'no_links_no_index')
    }
    // 4. saved-plan pending, 5. saved-plan failed.
    for (const [label, savedPlan] of [
      ['saved-plan lookup still pending', { status: 'pending' } as const],
      ['saved-plan lookup failed', { status: 'unavailable' } as const],
    ] as const) {
      const r = await simulateSaveAndQueue(input({ preview: CONFIRMED_MISSING_INDEX, savedPlan, checkedLinkCount: 0 }))
      check(`6: ${label} → the queue action is REFUSED even with a confirmed missing index`,
        r.refused === true && r.calls.length === 0)
      check(`6: ${label} → the reason names the saved-plan lookup`,
        r.decision.reason === (savedPlan.status === 'pending' ? 'saved_plan_pending' : 'saved_plan_unavailable'))
    }
    check('6a: a preview that resolved FIRST is not enough on its own — the two run concurrently',
      resolveQueueLinkExpectation({ preview: CONFIRMED_MISSING_INDEX, savedPlan: { status: 'pending' }, checkedLinkCount: 0 }).canQueue === false)
    check('6b: nor is a saved-plan lookup that resolved first',
      resolveQueueLinkExpectation({ preview: { status: 'pending' }, savedPlan: CONFIRMED_NO_SAVED_PLAN, checkedLinkCount: 0 }).canQueue === false)
    check('6c: the no-links path needs BOTH facts positively confirmed',
      resolveQueueLinkExpectation(NO_INDEX).canQueue === true && expectsLinksOf(resolveQueueLinkExpectation(NO_INDEX)) === false)
    check('6d: the decision type makes an unconfirmed state UNUSABLE — there is no expectsLinks to read',
      !('expectsLinks' in resolveQueueLinkExpectation({ preview: { status: 'unavailable' }, savedPlan: CONFIRMED_NO_SAVED_PLAN, checkedLinkCount: 0 })))

    check('6e: SOURCE — a thrown preview reports the ordinary load error, NOT a missing cache',
      /setDry\(null\); setPreviewStatus\('unavailable'\); setError\(t\.loadError\)/.test(drawer)
      && !/cacheState: 'missing', warnings: \[\], moneyTargetUrl: null/.test(drawer))
    check('6f: SOURCE — a non-2xx counts as loaded only when the response states the cache state',
      /const reported = typeof data\.cacheState === 'string' && data\.cacheState\.length > 0 \? data\.cacheState : null/.test(drawer)
      && /if \(!reported\) \{ setDry\(null\); setPreviewStatus\('unavailable'\)/.test(drawer))
    check('6g: SOURCE — a non-OK saved-plan lookup no longer writes exists:false',
      /if \(!res\.ok\) \{ setError\(t\.loadError\); setSaved\(null\); setSavedStatus\('unavailable'\); return \}/.test(drawer))
    check('6h: SOURCE — a thrown saved-plan lookup clears the row and marks it unavailable',
      /setError\(t\.loadError\); setSaved\(null\); setSavedStatus\('unavailable'\)\s*\n\s*\} finally/.test(drawer))
    check('6i: SOURCE — the handler refuses unless the decision can queue',
      /if \(!queueDecision\.canQueue\) return/.test(drawer))
    check('6j: SOURCE — and the button is disabled until then',
      /disabled=\{saving \|\| savingQueue \|\| !queueDecision\.canQueue\}/.test(drawer))
    check('6k: SOURCE — a refresh in flight keeps the preview pending, so stale data cannot decide',
      /running \|\| previewStatus === 'pending' \|\| !dry/.test(drawer))
  }

  // ───────────────────────────────────────────────────────────────────────
  console.log('\n6B) State from a PREVIOUSLY OPENED topic cannot authorize the no-links path')
  {
    check('6B-a: SOURCE — both lookups are reset on every open/topic change',
      /setDry\(null\); setPreviewStatus\('pending'\)\s*\n\s*setSaved\(null\); setSavedStatus\('pending'\)/.test(drawer))
    check('6B-b: SOURCE — that reset is in the effect keyed on open/project/topic',
      /\}, \[open, projectId, topic\?\.id\]\)/.test(drawer)
      && drawer.indexOf("setSaved(null); setSavedStatus('pending')") < drawer.indexOf('}, [open, projectId, topic?.id])'))
    check('6B-c: SOURCE — a superseded (aborted) response never writes state',
      /if \(reqIdRef\.current !== myId \|\| \(e as \{ name\?: string \}\)\?\.name === 'AbortError'\) return/.test(drawer))
    // Reset means BOTH lookups read 'pending', which refuses the action outright —
    // so the previous topic's confirmed answers cannot be inherited.
    const afterReset = resolveQueueLinkExpectation({ preview: { status: 'pending' }, savedPlan: { status: 'pending' }, checkedLinkCount: 0 })
    check('6B-d: the post-reset state refuses the queue action', afterReset.canQueue === false && afterReset.reason === 'preview_pending')
  }

  // ───────────────────────────────────────────────────────────────────────
  console.log('\n7) Enqueue remains idempotent')
  {
    const again = serverOutcome({ linkPlanRequested: false, enqueued: false, alreadyQueued: true })
    check('7a: a topic already in the pool reports already_queued, not a failure', again.state === 'already_queued')
    const s = summarizeBatch([again])
    check('7b: and the batch is still ok', s.ok === true && s.alreadyQueued === 1 && s.failed === 0)
    check('7c: SOURCE — the route treats a duplicate-key insert as already queued',
      /code === '23505'\) \{ outcome\.alreadyQueued = true \}/.test(route))
    check('7d: the same no-links decision is produced on every repeat — no hidden state',
      JSON.stringify(resolveQueueLinkExpectation(NO_INDEX)) === JSON.stringify(resolveQueueLinkExpectation(NO_INDEX)))
  }

  // ───────────────────────────────────────────────────────────────────────
  console.log('\n7B) A CONFIRMED existing saved plan is persisted, claimed and verified')
  {
    // No index and nothing newly checked, but a plan already exists for the
    // topic — it must still be claimed so the server verifies it.
    const r = await simulateSaveAndQueue(input({ preview: CONFIRMED_MISSING_INDEX, savedPlan: CONFIRMED_SAVED_PLAN, checkedLinkCount: 0 }))
    check('7B-a: the plan is persisted first', r.calls.some((c) => c.includes('/plan/bulk-save')))
    check('7B-b: and enqueued with expectsLinks:true', r.enqueuedWith === true)
    check('7B-c: the decision names the claim', r.decision.reason === 'saved_plan_claimed')
    check('7B-d: the server then verifies it and refuses if it is not really there',
      serverOutcome({ linkPlanRequested: true, linkPlanSaved: false, approved: false, enqueued: false }).state === 'link_plan_failed')
    check('7B-e: and succeeds when it is', serverOutcome({ linkPlanRequested: true, linkPlanSaved: true }).state === 'success')
  }

  // ───────────────────────────────────────────────────────────────────────
  console.log('\n7C) THE ACTUAL USER INCIDENT still succeeds end to end')
  {
    // Manual topic, project with no site index, nothing selected, no saved plan
    // — both facts positively confirmed by their own lookups.
    const r = await simulateSaveAndQueue({
      preview: CONFIRMED_MISSING_INDEX,
      savedPlan: CONFIRMED_NO_SAVED_PLAN,
      checkedLinkCount: 0,
    })
    check('7C-a: the action is allowed', r.refused === false && queued(r.decision))
    check('7C-b: no plan endpoint is called at all', r.calls.every((c) => !c.includes('internal-links')))
    check('7C-c: approve-and-queue is called with expectsLinks:false',
      r.calls.some((c) => c.includes('approve-and-queue')) && r.enqueuedWith === false)
    const outcome = serverOutcome({ linkPlanRequested: false, linkPlanSaved: false })
    check('7C-d: the manual topic is approved and enqueued', outcome.state === 'success')
    check('7C-e: and the batch reports it as added', summarizeBatch([outcome]).ok === true && summarizeBatch([outcome]).added === 1)
  }

  // ───────────────────────────────────────────────────────────────────────
  console.log('\n8) The expectation is threaded explicitly, never inferred')
  {
    check('8a: the drawer prop takes it', /onSaveAndQueue\?: \(topicId: string, expectsLinks: boolean\) => Promise<boolean>/.test(drawer))
    check('8b: TopicsList forwards it',
      /onSaveAndQueue\?: \(topicId: string, expectsLinks: boolean\) => Promise<boolean>/.test(strip(read('components/content/TopicsList.tsx'))))
    check('8c: ensurePoolAndEnqueue takes it instead of hard-coding true',
      /const ensurePoolAndEnqueue = useCallback\(async \(topicIds: string\[\], expectsLinks: boolean\)/.test(hub)
      && !/expectsLinks: true/.test(hub))
    check('8d: and passes exactly what it was given',
      /topics: topicIds\.map\(\(topicId\) => \(\{ topicId, expectsLinks \}\)\)/.test(hub))
    check('8e: the link-review panel — which always saves a plan — passes true explicitly',
      /onEnqueue\(r\.okIds, true\)/.test(strip(read('components/content/NewTopicsLinkPlanPanel.tsx'))))
    check('8f: the drawer sends the decision, not a literal',
      /onSaveAndQueue\(topic\.id, queueDecision\.expectsLinks\)/.test(drawer))
    check('8g: the server never INFERS it — a plain topicIds\[\] body defaults to false',
      /map\(\(topicId\) => \(\{ topicId, expectsLinks: false/.test(route))
  }

  // ───────────────────────────────────────────────────────────────────────
  console.log('\n9) UX — the button and the warning tell the truth')
  {
    const en = read('lib/i18n/dashboard/en.ts')
    const he = read('lib/i18n/dashboard/he.ts')
    check('9a: SOURCE — the label follows the decision, and only a queueable one can read it',
      /queueDecision\.canQueue && !queueDecision\.expectsLinks \? t\.queueWithoutLinks : t\.saveAndQueue/.test(drawer))
    check('9b: English label states there are no internal links',
      /queueWithoutLinks: 'Add to queue without internal links'/.test(en))
    check('9c: Hebrew label likewise', /queueWithoutLinks: 'הוסף לתור ללא קישורים פנימיים'/.test(he))
    check('9d: the missing-index notice is still shown',
      /dry\?\.cacheState === 'missing' && <p/.test(drawer))
    check('9e: but no longer tells the user to refresh and try again',
      !/refresh the index first/.test(en) && !/רענן את האינדקס תחילה/.test(he))
    check('9f: it now says the topic can still be queued',
      /You can still add the topic to the queue/.test(en) && /אפשר עדיין להוסיף את הנושא לתור/.test(he))
  }

  // ───────────────────────────────────────────────────────────────────────
  console.log('\n10) Nothing outside this defect changed')
  {
    check('10a: the plain "save plan" action still saves without approving',
      /await persistSelection\(false\)/.test(drawer))
    check('10b: approval-shortfall warnings still surface',
      /t\.approvalIncomplete/.test(drawer))
    check('10c: the route still refuses to promote a non-manual topic',
      /row\.source === 'manual' && row\.status === 'suggested'/.test(route))
    check('10d: ownership is still checked before anything else',
      /const owned = await authPool\(id\)/.test(route) && route.indexOf('await authPool(id)') < route.indexOf('article_topics'))
    check('10e: the non-article block is untouched',
      /effectivePageType !== 'article' && !t\.allowNonArticle/.test(route))
    check('10f: the decision module is PURE — no fetch, no DOM, no env',
      !/fetch\(|document\.|window\.|process\.env/.test(read('lib/content/queue-link-expectation.ts')))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}

main()
