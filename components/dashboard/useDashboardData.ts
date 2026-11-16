'use client'

/**
 * The two reads the dashboard makes besides its keywords: the dashboard route
 * (articles, board, AI brief, setup facts, activity, account) and the seeding
 * scan. Both go through owner-checked routes; nothing here touches the database.
 *
 * Every read is bounded and ends as a state the widgets can show; a failure is
 * never a spinner and never takes the rest of the screen with it. The scan is
 * asked again while it runs, so stage B's steps appear in the feed as they
 * finish, and the asking stops the moment it is not running.
 */
import { useCallback, useEffect, useState } from 'react'
import type { DashboardOverview } from '@/lib/dashboard/overview'
import { seedStateFrom, seedStillRunning, type SeedState } from '@/lib/dashboard/seed'
import { readSeed, seedUrl as sharedSeedUrl } from '@/lib/client/seed-read'
import { takeSeed } from '@/lib/client/html-seed'
import { dashboardOverviewUrl as sharedOverviewUrl } from '@/lib/dashboard/urls'

const READ_DEADLINE_MS = 15_000
/** How often a running scan is asked again. */
export const SEED_POLL_MS = 8_000

async function getJson(url: string): Promise<{ status: number; body: unknown }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), READ_DEADLINE_MS)
  try {
    const res = await fetch(url, { cache: 'no-store', signal: controller.signal })
    return { status: res.status, body: await res.json().catch(() => null) }
  } catch {
    return { status: 0, body: null }
  } finally {
    clearTimeout(timer)
  }
}

export type OverviewState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; data: DashboardOverview }

/** Re-exported from lib/dashboard/urls.ts, which the SERVER can call too (the
 *  dashboard's layout seeds this answer keyed by this very URL), so there is one
 *  spelling of the path. */
export const dashboardOverviewUrl = sharedOverviewUrl

/** The answer as a state, from a status and a body, wherever they came from. */
function overviewFrom(status: number, body: unknown): OverviewState {
  const ok = status === 200 && !!body && (body as { ok?: unknown }).ok === true
  return ok ? { status: 'ready', data: body as DashboardOverview } : { status: 'error' }
}

export function useDashboardOverview(projectId: string): { overview: OverviewState; reload: () => void } {
  // THE ANSWER MAY ALREADY BE HERE. The dashboard's layout builds it in its own
  // region and writes it into the HTML (app/(dashboard)/dashboard/layout.tsx),
  // which a script puts on globalThis while the page is still being parsed. Read
  // during the FIRST render, not in an effect: an effect runs after this render
  // has already shown the skeleton, and after it would have started a request.
  // Nothing seeded - another project, a failed build, an older page - simply
  // means the request below, exactly as before.
  const [result, setResult] = useState<{ attempt: number; state: OverviewState } | null>(() => {
    const seeded = takeSeed(dashboardOverviewUrl(projectId))
    return seeded ? { attempt: 0, state: overviewFrom(seeded.status, seeded.body) } : null
  })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    // Already in hand for this attempt (the seed): no request.
    if (result && result.attempt === attempt) return
    let cancelled = false
    void getJson(dashboardOverviewUrl(projectId)).then(({ status, body }) => {
      if (cancelled) return
      setResult({ attempt, state: overviewFrom(status, body) })
    })
    return () => { cancelled = true }
    // `result` is what this effect SETS; depending on it would re-run the effect
    // on its own answer. It is read here only to skip a request already answered.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, attempt])

  const reload = useCallback(() => setAttempt((n) => n + 1), [])
  // An answer for an earlier attempt is not this one's: until it arrives, loading.
  return { overview: result && result.attempt === attempt ? result.state : { status: 'loading' }, reload }
}

/** Re-exported from the shared reader, so there is one spelling of this path. */
export const seedUrl = sharedSeedUrl

/** `refreshKey`: bumped to read the scan again (a mapping this screen started has just finished). */
export function useSeedState(projectId: string, refreshKey = 0): SeedState {
  const [state, setState] = useState<SeedState>({ kind: 'loading' })
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null
    // Shared with every other component reading the scan on this screen
    // (lib/client/seed-read.ts): one request, not one per widget.
    void readSeed(projectId).then(({ status, body }) => {
      if (cancelled) return
      const next = seedStateFrom(status, body)
      setState(next)
      if (seedStillRunning(next)) timer = setTimeout(() => setTick((n) => n + 1), SEED_POLL_MS)
    })
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [projectId, tick, refreshKey])

  return state
}
