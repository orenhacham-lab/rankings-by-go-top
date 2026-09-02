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

/** Defaults describe a healthy project with an index and one checked link. */
const input = (over: Partial<QueueLinkExpectationInput> = {}): QueueLinkExpectationInput => ({
  previewLoaded: true, previewRunning: false, cacheState: 'ok',
  checkedLinkCount: 1, savedPlanExists: false, ...over,
})
/** The exact state the incident produced: index missing, nothing selected, no saved plan. */
const NO_INDEX = input({ cacheState: 'missing', checkedLinkCount: 0 })

/**
 * Replays the drawer's save+queue flow with the REAL decision function, over a
 * fetch spy. Mirrors TopicPlanDrawer.saveAndQueue: persist only when the
 * decision says to, then enqueue with the decision's own expectsLinks.
 */
async function simulateSaveAndQueue(state: QueueLinkExpectationInput, opts: { planSaveOk?: boolean; planSaveReason?: string } = {}) {
  const calls: string[] = []
  let enqueuedWith: boolean | null = null
  let blockedError: string | null = null

  const decision = resolveQueueLinkExpectation(state)
  if (decision.persistPlan) {
    calls.push('/api/content/automation/internal-links/plan/bulk-save')
    if (opts.planSaveOk === false) {
      blockedError = opts.planSaveReason ?? 'save_failed'
      return { calls, enqueuedWith, blockedError, decision }
    }
  }
  calls.push('/api/content/automation/pools/POOL/approve-and-queue')
  enqueuedWith = decision.expectsLinks
  return { calls, enqueuedWith, blockedError, decision }
}

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
    check('1f: and it does not ask for a plan to be persisted', r.decision.persistPlan === false)

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
      ['links checked even with NO index', input({ cacheState: 'missing', checkedLinkCount: 1 })],
    ] as const) {
      const r = await simulateSaveAndQueue(state)
      check(`3: ${label} → plan is persisted first`, r.calls.some((c) => c.includes('/plan/bulk-save')))
      check(`3: ${label} → enqueued with expectsLinks:true`, r.enqueuedWith === true)
    }
    check('3a: a checked link is NEVER silently discarded to take the no-links path',
      resolveQueueLinkExpectation(input({ cacheState: 'missing', checkedLinkCount: 1 })).expectsLinks === true)
    check('3b: an existing saved plan is claimed and must be server-verified',
      resolveQueueLinkExpectation(input({ cacheState: 'missing', checkedLinkCount: 0, savedPlanExists: true })).expectsLinks === true)
    check('3c: a present-but-stale index keeps the normal flow',
      resolveQueueLinkExpectation(input({ cacheState: 'stale', checkedLinkCount: 0 })).expectsLinks === true)
    check('3d: an unknown cache state keeps the normal flow',
      resolveQueueLinkExpectation(input({ cacheState: 'ok', checkedLinkCount: 0 })).expectsLinks === true
      && resolveQueueLinkExpectation(input({ cacheState: null, checkedLinkCount: 0 })).expectsLinks === true)
    check('3e: ONLY the exact incident state takes the no-links path',
      resolveQueueLinkExpectation(NO_INDEX).expectsLinks === false)
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
    const r = await simulateSaveAndQueue(input({ cacheState: 'ok', checkedLinkCount: 3 }), { planSaveOk: false, planSaveReason: 'cache_changed_replan_required' })
    check('5a: a cache-changed refusal still stops the queue action',
      r.blockedError === 'cache_changed_replan_required' && !r.calls.some((c) => c.includes('approve-and-queue')))
    check('5b: SOURCE — the reviewed snapshot is still sent on every save',
      /reviewedSnapshot: reviewedSnapshotRef\.current \?\? undefined/.test(drawer))
    check('5c: SOURCE — and the typed 409 is still surfaced to the user',
      /d\.reason === 'cache_changed_replan_required' \? t\.cacheChanged/.test(drawer))
  }

  // ───────────────────────────────────────────────────────────────────────
  console.log('\n6) A race while the preview is still loading cannot bypass verification')
  {
    for (const [label, state] of [
      ['preview not loaded at all', input({ previewLoaded: false, cacheState: null, checkedLinkCount: 0 })],
      ['preview still running', input({ previewRunning: true, cacheState: 'missing', checkedLinkCount: 0 })],
      ['not loaded AND running', input({ previewLoaded: false, previewRunning: true, cacheState: null, checkedLinkCount: 0 })],
    ] as const) {
      const d = resolveQueueLinkExpectation(state)
      check(`6: ${label} → still expectsLinks:true`, d.expectsLinks === true && d.reason === 'preview_pending')
    }
    check('6a: SOURCE — the drawer refuses to act before the preview resolves',
      /if \(!dry \|\| running\) return/.test(drawer))
    check('6b: SOURCE — and the button is disabled until then',
      /disabled=\{saving \|\| savingQueue \|\| running \|\| !dry\}/.test(drawer))
    check('6c: SOURCE — a thrown preview still resolves to a state, so the button cannot strand',
      /\} catch \{[\s\S]{0,400}setDry\(\{ selected: \[\], rejected: \[\], summary: '', cacheState: 'missing'/.test(drawer))
    check('6d: the pure default is the SAFE direction — unknown state never skips verification',
      resolveQueueLinkExpectation({ previewLoaded: false, previewRunning: false, cacheState: null, checkedLinkCount: 0, savedPlanExists: false }).persistPlan === true)
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
    check('9a: SOURCE — the label follows the decision',
      /queueDecision\.expectsLinks \? t\.saveAndQueue : t\.queueWithoutLinks/.test(drawer))
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
