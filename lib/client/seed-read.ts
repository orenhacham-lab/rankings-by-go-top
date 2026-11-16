'use client'

/**
 * ONE READ OF THE SEEDING SCAN PER SCREEN, instead of one per component.
 *
 * `GET /api/projects/[id]/seed` is read by four independent hooks — the
 * dashboard's own seed state, the AI-visibility overview, the settings rescan
 * poller and the onboarding run reader. Several of them mount on the same
 * screen, each with `cache: 'no-store'`, and nothing tied them together: a
 * dashboard load measured in production on 2026-11-14 fetched that one route
 * TWICE, 590ms and 588ms, for the same answer. The route is not cheap — it
 * authenticates and reads the run and its rows, and the database is a region
 * away from the functions — so the second call is pure waiting.
 *
 * This module is the shared layer. Readers that want the CURRENT state call
 * `readSeed`, and calls that overlap, or follow within COALESCE_MS, share one
 * HTTP request and one answer.
 *
 * THREE THINGS IT DELIBERATELY DOES NOT DO:
 *
 * 1. It does not cache for longer than COALESCE_MS. Every caller here is a
 *    poller watching a scan progress (3s, 8s), so a longer memory would hide
 *    the state change they exist to notice. The window is short enough that no
 *    poll interval can be served from it, and long enough to collapse the
 *    components of one render.
 * 2. It does not pass a caller's AbortSignal to the shared request. A shared
 *    fetch aborted by whichever caller unmounted first would fail the others.
 *    An aborting caller stops waiting (`aborted` comes back); the request
 *    itself finishes and still serves everyone else.
 * 3. It never throws and never rejects. A transport failure is `{ status: 0,
 *    body: null }`, which is what each caller's own parser already treats as
 *    "could not read" — the behaviour they had before this existed.
 *
 * A caller that has just STARTED something and must not see the state from a
 * moment ago passes `{ fresh: true }`, which bypasses the window and starts a
 * request of its own.
 */

import { takeSeed } from '@/lib/client/html-seed'
import { seedRunUrl as sharedSeedRunUrl } from '@/lib/seed-scan/urls'

/** How long an answer may be shared with a caller that arrives after it. */
export const SEED_COALESCE_MS = 750

export type SeedReadResult = {
  /** The HTTP status, or 0 when the request itself failed. */
  status: number
  /** The parsed JSON body, or null when there was none. */
  body: unknown
  /** True when this caller stopped waiting; `status` is then 0. */
  aborted?: true
}

/** The route's path. Spelled in lib/seed-scan/urls.ts, which the dashboard
 *  layout also reads, so a seeded answer lands under the URL read here. */
export const seedUrl = sharedSeedRunUrl

type Entry = { promise: Promise<SeedReadResult>; startedAt: number; settledAt: number | null }

/**
 * THE REGISTRY LIVES ON `globalThis`, NOT IN THIS MODULE'S SCOPE.
 *
 * Module scope is per module INSTANCE, and a client module imported from two
 * route segments can be emitted into two chunks, which is two instances and
 * two maps — each one correctly coalescing its own callers and neither seeing
 * the other.
 *
 * WHAT WAS ACTUALLY MEASURED, so the next reader is not misled: a dashboard
 * load on 2026-11-15 still fetched `GET /api/projects/[id]/seed` twice, both
 * requests starting in the same tick. The cause found in the code was a reader
 * that never reached this module at all — components/mapping/useMapping.ts
 * fetched the route itself — and converting it is what removed the duplicate.
 * A split bundle was the other candidate and was NOT the proven cause here.
 * The registry is keyed off `globalThis` anyway, because the split is real,
 * costs nothing to defend against, and would be invisible in every test that
 * imports this module once.
 *
 * Keying the map off `globalThis` gives every copy of this module one shared
 * registry, so the coalescing holds however the bundler splits it.
 */
const REGISTRY_KEY = '__goTopSeedReadEntries__'

type RegistryHost = typeof globalThis & { [REGISTRY_KEY]?: Map<string, Entry> }

function registry(): Map<string, Entry> {
  const host = globalThis as RegistryHost
  const existing = host[REGISTRY_KEY]
  if (existing) return existing
  const created = new Map<string, Entry>()
  host[REGISTRY_KEY] = created
  return created
}

/** Injectable only for the QA suite; production always reads the real clock. */
let nowMs: () => number = () => Date.now()
let fetchImpl: typeof fetch | null = null

/** QA only. Replaces the clock and the transport, and clears what is in flight. */
export function __setSeedReadTestHooks(hooks: { now?: () => number; fetch?: typeof fetch } | null): void {
  registry().clear()
  nowMs = hooks?.now ?? (() => Date.now())
  fetchImpl = hooks?.fetch ?? null
}

function usable(entry: Entry | undefined, now: number): boolean {
  if (!entry) return false
  // Still in flight: always share it, however long it has taken.
  if (entry.settledAt === null) return true
  return now - entry.settledAt < SEED_COALESCE_MS
}

/**
 * THE ANSWER THE PAGE ARRIVED WITH, ADOPTED AS IF THIS MODULE HAD FETCHED IT.
 *
 * The dashboard layout answers this read in its own region and writes the
 * answer into the HTML (lib/client/html-seed.ts), so the first reader of the
 * screen takes it instead of starting a round trip. It is taken ONCE and only
 * while fresh — `takeSeed` enforces both — and only for a caller that has not
 * asked for `fresh`, because such a caller has just started something and must
 * not be handed the state from page load.
 *
 * It is entered as an entry that has already settled, so the COALESCE_MS window
 * applies to it exactly as it would to a real answer: the pollers that share
 * this module keep polling on their own schedule.
 */
function adoptSeed(projectId: string, entries: Map<string, Entry>, now: number): void {
  if (entries.has(projectId)) return
  const seeded = takeSeed(seedUrl(projectId))
  if (!seeded) return
  entries.set(projectId, {
    promise: Promise.resolve({ status: seeded.status, body: seeded.body }),
    startedAt: now,
    settledAt: now,
  })
}

async function request(projectId: string): Promise<SeedReadResult> {
  const doFetch = fetchImpl ?? fetch
  try {
    const res = await doFetch(seedUrl(projectId), { cache: 'no-store' })
    const body = await res.json().catch(() => null)
    return { status: res.status, body }
  } catch {
    return { status: 0, body: null }
  }
}

/**
 * Read the seeding scan, sharing one request with anything else reading it at
 * the same moment.
 *
 * `signal` only stops THIS caller waiting; it never cancels the shared request.
 */
export function readSeed(
  projectId: string,
  opts?: { signal?: AbortSignal; fresh?: boolean },
): Promise<SeedReadResult> {
  const now = nowMs()
  const entries = registry()
  if (!opts?.fresh) adoptSeed(projectId, entries, now)
  const existing = entries.get(projectId)
  let entry: Entry
  if (!opts?.fresh && usable(existing, now)) {
    entry = existing!
  } else {
    entry = { promise: Promise.resolve({ status: 0, body: null }), startedAt: now, settledAt: null }
    entry.promise = request(projectId).then((r) => {
      entry.settledAt = nowMs()
      return r
    })
    entries.set(projectId, entry)
  }

  const signal = opts?.signal
  if (!signal) return entry.promise
  if (signal.aborted) return Promise.resolve({ status: 0, body: null, aborted: true })
  return new Promise<SeedReadResult>((resolve) => {
    const onAbort = () => resolve({ status: 0, body: null, aborted: true })
    signal.addEventListener('abort', onAbort, { once: true })
    void entry.promise.then((r) => {
      signal.removeEventListener('abort', onAbort)
      resolve(r)
    })
  })
}
