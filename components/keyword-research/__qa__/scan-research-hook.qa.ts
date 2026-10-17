/**
 * OPENING THE TAB ONLY READS, AND THE WAIT STOPS BY ITSELF — the research tab's
 * data hook (components/keyword-research/useScanResearch.ts), run for real.
 *
 * The hook runs under a minimal React hooks runtime (useState, useEffect, useRef,
 * useCallback, useMemo with React's dependency semantics) with fake timers and a
 * scripted server behind `fetch`, so its effects execute exactly as in the browser:
 *
 *  H1) opening makes exactly two requests, both GETs: the scan's run and its
 *      stored research; nothing with no project; the view goes loading → seeded;
 *  H2) a finished scan is not looked at again (no timer is left);
 *  H3) while b2/b3 run, only the light run GET repeats, at 8s, 12s, 18s, 27s, then
 *      every 30s; the research is read again only when b2 or b3 has just finished;
 *      once both are over the looking stops;
 *  H4) a hidden tab is not read (the loop waits); a failed look changes nothing on
 *      screen and is tried again later;
 *  H5) after tracking, only the research is read again; a retry reads both;
 *  H6) a failed re-read keeps the research on screen;
 *  H7) a stalled run older than a day is not waited for.
 *
 * Mutation controls: lib/keyword-research/__qa__/mutation-controls.mjs.
 *
 * Run: npx tsx components/keyword-research/__qa__/scan-research-hook.qa.ts
 */
/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */
const Module: any = require('module')

// ── A minimal hooks runtime (one component) ─────────────────────────────────
type Slot = { kind: string; value?: any; deps?: unknown[]; cleanup?: (() => void) | void }
const changed = (a: unknown[] | undefined, b: unknown[] | undefined) => !a || !b || a.length !== b.length || a.some((v, i) => !Object.is(v, b[i]))

function createRuntime<P, R>(hook: (props: P) => R) {
  const slots: Slot[] = []
  let cursor = 0
  let pending: { slot: Slot; fn: () => (() => void) | void }[] = []
  let dirty = false
  let props: P
  let last: R
  let unmounted = false
  const react = {
    useState(init: any) {
      const i = cursor++
      if (!slots[i]) slots[i] = { kind: 'state', value: typeof init === 'function' ? init() : init }
      const slot = slots[i]
      const set = (v: any) => {
        if (unmounted) return
        const next = typeof v === 'function' ? v(slot.value) : v
        if (!Object.is(next, slot.value)) { slot.value = next; dirty = true }
      }
      slot.deps = slot.deps ?? [set]
      return [slot.value, slot.deps[0]]
    },
    useRef(init: any) {
      const i = cursor++
      if (!slots[i]) slots[i] = { kind: 'ref', value: { current: init } }
      return slots[i].value
    },
    useMemo(factory: () => any, deps: unknown[]) {
      const i = cursor++
      if (!slots[i] || changed(slots[i].deps, deps)) slots[i] = { kind: 'memo', value: factory(), deps }
      return slots[i].value
    },
    useCallback(fn: any, deps: unknown[]) { return react.useMemo(() => fn, deps) },
    useEffect(fn: () => (() => void) | void, deps: unknown[]) {
      const i = cursor++
      if (!slots[i]) { slots[i] = { kind: 'effect', deps }; pending.push({ slot: slots[i], fn }); return }
      if (changed(slots[i].deps, deps)) { slots[i].deps = deps; pending.push({ slot: slots[i], fn }) }
    },
  }
  function commit() {
    for (let guard = 0; guard < 50; guard++) {
      cursor = 0
      dirty = false
      last = hook(props)
      const run = pending
      pending = []
      for (const { slot, fn } of run) {
        if (typeof slot.cleanup === 'function') slot.cleanup()
        slot.cleanup = fn()
      }
      if (!dirty) return
    }
    throw new Error('render loop')
  }
  return {
    react,
    mount(p: P) { props = p; commit(); return last },
    rerender(p?: P) { if (p !== undefined) props = p; commit(); return last },
    /** State set asynchronously (a fetch resolved): render again, as React would. */
    flushIfDirty() { if (dirty) commit(); return last },
    get current() { return last },
    unmount() { unmounted = true; for (const s of slots) if (s.kind === 'effect' && typeof s.cleanup === 'function') s.cleanup() },
  }
}

// The hook imports 'react': serve it the runtime of the test that is running.
let activeReact: any = null
const origLoad = Module._load
Module._load = function (request: string, parent: any, isMain: boolean) {
  if (request === 'react' && parent?.filename?.includes('useScanResearch')) return new Proxy({}, { get: (_t, k) => activeReact?.[k] })
  return origLoad.call(this, request, parent, isMain)
}

// ── Fake timers and a scripted server ───────────────────────────────────────
let clock = 0
let timers: { id: number; at: number; fn: () => void }[] = []
let nextId = 1
;(globalThis as any).setTimeout = (fn: () => void, ms: number) => { const id = nextId++; timers.push({ id, at: clock + (ms ?? 0), fn }); return id }
;(globalThis as any).clearTimeout = (id: number) => { timers = timers.filter((t) => t.id !== id) }

type Reply = { status: number; body: unknown } | 'network'
const server: { seed: Reply; scan: Reply; requests: { at: number; method: string; url: string }[] } = { seed: { status: 404, body: {} }, scan: { status: 404, body: {} }, requests: [] }
;(globalThis as any).fetch = async (url: string, init?: { method?: string }) => {
  server.requests.push({ at: clock, method: init?.method ?? 'GET', url })
  const reply = url.startsWith('/api/projects/') ? server.seed : url.startsWith('/api/keyword-research/scan') ? server.scan : null
  if (!reply) throw new Error(`unexpected request ${url}`)
  if (reply === 'network') throw new TypeError('Failed to fetch')
  return { status: reply.status, json: async () => reply.body }
}

const settle = async () => { for (let i = 0; i < 20; i++) await Promise.resolve() }
const { useScanResearch } = require('../useScanResearch') as typeof import('../useScanResearch')
const { pollDelayMs } = require('../../../lib/keyword-research/scan-state') as typeof import('../../../lib/keyword-research/scan-state')

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const show = (v: unknown) => JSON.stringify(v)

// ── Fixtures ────────────────────────────────────────────────────────────────
const P = 'a1111111-2222-3333-4444-555555555555'
const P2 = 'b1111111-2222-3333-4444-555555555555'
const START = Date.parse('2026-09-27T12:00:00Z')
const runBody = (b2: string, b3: string, over: Record<string, unknown> = {}) => ({
  ok: true,
  run: {
    id: 'run-1', stage: 'b', status: b2 !== 'running' && b2 !== 'pending' && b3 !== 'running' && b3 !== 'pending' ? 'done' : 'running', stalled: false,
    startedAt: new Date(START).toISOString(),
    steps: [{ step: 'b1', status: 'done' }, { step: 'b2', status: b2 }, { step: 'b3', status: b3 }],
    summary: { domain: 'runshop.co.il', seedKeywords: ['נעלי ריצה', 'נעלי שטח', 'גרבי ריצה', 'נעלי ריצה לנשים', 'נעלי טיולים'] },
    ...over,
  },
})
const research = (keywords: string[]) => ({
  ok: true, market: { country: 'IL', language: 'he' }, fetchedAt: '2026-09-27T12:01:00Z', truncated: false, tracked: [],
  keywords: keywords.map((k) => ({ keyword: k, avgMonthlySearches: 100, competition: 'LOW', competitionIndex: 10, lowTopOfPageBid: 1, highTopOfPageBid: 2, currency: 'ILS', origins: ['site'], competitors: [], relevant: true })),
})

function reset() {
  clock = 0
  timers = []
  server.requests = []
  delete (globalThis as any).document
}
function mount(projectId: string | null) {
  const rt = createRuntime((p: { projectId: string | null }) => useScanResearch(p.projectId))
  activeReact = rt.react
  rt.mount({ projectId })
  return rt
}
/** Let time pass: timers fire in order; every resolved fetch renders again. */
async function advance(rt: ReturnType<typeof mount>, ms: number) {
  const until = clock + ms
  for (;;) {
    await settle()
    rt.flushIfDirty()
    timers.sort((a, b) => a.at - b.at || a.id - b.id)
    const next = timers[0]
    if (!next || next.at > until) break
    timers.shift()
    clock = next.at
    next.fn()
  }
  clock = until
  await settle()
  rt.flushIfDirty()
}
/** The view's kind now (read afresh: the hook renders again between two reads). */
const kindOf = (rt: { current: { view: { kind: string } } }): string => rt.current.view.kind
const seedReads = () => server.requests.filter((r) => r.url.includes('/seed'))
const scanReads = () => server.requests.filter((r) => r.url.includes('/keyword-research/scan'))

async function main() {
  console.log('The research tab\'s data hook: two reads on opening, a light wait that stops by itself')
  const realNow = Date.now
  Date.now = () => START + clock

  console.log('\nH) opening')
  {
    reset()
    server.seed = { status: 200, body: runBody('done', 'done') }
    server.scan = { status: 200, body: research(['נעלי ריצה', 'נעלי שטח']) }
    const rt = mount(P)
    const first: string = rt.current.view.kind
    await advance(rt, 0)
    const requests = server.requests.map((r) => `${r.method} ${r.url}`)
    check('H1: opening reads the run and the stored research, two GETs and nothing else; the view goes from loading to seeded',
      show(requests) === show([`GET /api/projects/${P}/seed`, `GET /api/keyword-research/scan?projectId=${P}`])
      && first === 'loading' && kindOf(rt) === 'seeded',
      show({ requests, first, now: rt.current.view.kind }))
    await advance(rt, 10 * 60_000)
    const quiet = server.requests.length === 2 && timers.length === 0
    rt.unmount()
    reset()
    const none = mount(null)
    await advance(none, 60_000)
    check('H2: a finished scan is not looked at again (no timer left, ten minutes on); with no project nothing is read',
      quiet && server.requests.length === 0 && none.current.view.kind === 'none', show({ quiet, requests: server.requests }))
    none.unmount()
  }

  console.log('\nH) while the research is being found')
  {
    reset()
    server.seed = { status: 200, body: runBody('running', 'pending') }
    server.scan = { status: 200, body: research([]) }
    const rt = mount(P)
    await advance(rt, 0)
    const running = rt.current.view.kind
    // Looks at 8s, 20s (8+12), 38s (+18), 65s (+27), then every 30s.
    await advance(rt, 64_000)
    const early = seedReads().map((r) => r.at)
    await advance(rt, 1_000)
    const at65 = seedReads().map((r) => r.at)
    // b2 finishes with keywords: the research is read once more, the view fills in, and the wait goes on for b3.
    server.seed = { status: 200, body: runBody('done', 'running') }
    server.scan = { status: 200, body: research(['נעלי ריצה', 'נעלי שטח', 'גרבי ריצה']) }
    await advance(rt, 30_000)
    const afterB2 = { scan: scanReads().length, kind: rt.current.view.kind, running: (rt.current.view as any).running }
    await advance(rt, 60_000)
    const scanWhileB3 = scanReads().length
    // b3 fails (a partial run): terminal too. One last research read, then no more looking.
    server.seed = { status: 200, body: runBody('done', 'failed', { status: 'partial' }) }
    await advance(rt, 30_000)
    const afterEnd = { seed: seedReads().length, scan: scanReads().length, timers: timers.length, running: (rt.current.view as any).running }
    await advance(rt, 30 * 60_000)
    const later = { seed: seedReads().length, scan: scanReads().length }
    const methods = [...new Set(server.requests.map((r) => r.method))]
    check('H3: only the light run GET repeats (8s, 12s, 18s, 27s, then 30s); the research is read again only when b2 or b3 finishes; once both are over, the looking stops',
      running === 'running'
      && show(early) === show([0, 8_000, 20_000, 38_000]) && show(at65) === show([0, 8_000, 20_000, 38_000, 65_000])
      && afterB2.scan === 2 && afterB2.kind === 'seeded' && afterB2.running === true
      && scanWhileB3 === 2
      && afterEnd.scan === 3 && afterEnd.timers === 0 && afterEnd.running === false
      && later.seed === afterEnd.seed && later.scan === afterEnd.scan && show(methods) === show(['GET'])
      && show([0, 1, 2, 3, 4, 5].map((n) => pollDelayMs(n))) === show([8000, 12000, 18000, 27000, 30000, 30000]),
      show({ running, early, at65, afterB2, scanWhileB3, afterEnd, later, methods }))
    rt.unmount()
  }

  console.log('\nH) a hidden tab, a failed look')
  {
    reset()
    server.seed = { status: 200, body: runBody('running', 'pending') }
    server.scan = { status: 200, body: research([]) }
    const rt = mount(P)
    await advance(rt, 0)
    ;(globalThis as any).document = { visibilityState: 'hidden' }
    await advance(rt, 5 * 60_000)
    const hiddenReads = seedReads().length
    const stillWaiting = timers.length === 1
    delete (globalThis as any).document
    server.seed = 'network'
    await advance(rt, 30_000)
    const blipView = rt.current.view.kind
    const blipReads = seedReads().length
    server.seed = { status: 500, body: { ok: false, error: 'boom' } }
    await advance(rt, 30_000)
    const errorView = rt.current.view.kind
    server.seed = { status: 200, body: runBody('done', 'done') }
    server.scan = { status: 200, body: research(['נעלי ריצה']) }
    await advance(rt, 30_000)
    check('H4: a hidden tab is not read (the wait goes on); a failed look keeps the screen and is tried again, and the run\'s end still lands',
      hiddenReads === 1 && stillWaiting && blipReads === 2 && blipView === 'running' && errorView === 'running'
      && kindOf(rt) === 'seeded' && timers.length === 0,
      show({ hiddenReads, stillWaiting, blipReads, blipView, errorView, end: rt.current.view.kind }))
    rt.unmount()
  }

  console.log('\nH) after tracking, a retry, a failed re-read')
  {
    reset()
    server.seed = { status: 200, body: runBody('done', 'done') }
    server.scan = { status: 200, body: research(['נעלי ריצה']) }
    const rt = mount(P)
    await advance(rt, 0)
    rt.current.reloadTracked()
    await advance(rt, 0)
    const afterTrack = { seed: seedReads().length, scan: scanReads().length }
    rt.current.retry()
    rt.rerender()
    await advance(rt, 0)
    const afterRetry = { seed: seedReads().length, scan: scanReads().length }
    check('H5: tracking a keyword reads the research again (only it); a retry reads the run and the research',
      show(afterTrack) === show({ seed: 1, scan: 2 }) && show(afterRetry) === show({ seed: 2, scan: 3 }), show({ afterTrack, afterRetry }))
    server.scan = { status: 500, body: { ok: false, code: 'internal' } }
    rt.current.reloadTracked()
    await advance(rt, 0)
    const kept = rt.current.view.kind === 'seeded' && (rt.current.view as any).research.keywords.length === 1
    server.scan = 'network'
    rt.current.reloadTracked()
    await advance(rt, 0)
    check('H6: a failed re-read (500, network) keeps the research on screen', kept && rt.current.view.kind === 'seeded', rt.current.view.kind)
    rt.rerender({ projectId: P2 })
    const switched = rt.current.view.kind
    await advance(rt, 0)
    check('H6b: another project shows nothing of the previous one: loading until its own reads answer',
      switched === 'loading' && server.requests.slice(-2).every((r) => r.url.includes(P2)), show({ switched, last: server.requests.slice(-2) }))
    rt.unmount()
  }

  console.log('\nH) a stalled run')
  {
    reset()
    server.seed = { status: 200, body: runBody('running', 'pending', { stalled: true, startedAt: new Date(START - 25 * 3_600_000).toISOString() }) }
    server.scan = { status: 200, body: research([]) }
    const rt = mount(P)
    await advance(rt, 10 * 60_000)
    const view = rt.current.view as any
    check('H7: a run stalled for more than a day is not waited for: no polling, an empty state with the form',
      seedReads().length === 1 && timers.length === 0 && view.kind === 'empty', show({ reads: seedReads().length, kind: view.kind }))
    rt.unmount()
  }

  Date.now = realNow
  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}
main().catch((err) => { console.error(err); process.exit(1) })

export {}
