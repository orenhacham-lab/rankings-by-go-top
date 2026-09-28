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

export function dashboardOverviewUrl(projectId: string): string {
  return `/api/projects/${encodeURIComponent(projectId)}/dashboard`
}

export function useDashboardOverview(projectId: string): { overview: OverviewState; reload: () => void } {
  const [result, setResult] = useState<{ attempt: number; state: OverviewState } | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    void getJson(dashboardOverviewUrl(projectId)).then(({ status, body }) => {
      if (cancelled) return
      const ok = status === 200 && !!body && (body as { ok?: unknown }).ok === true
      setResult({ attempt, state: ok ? { status: 'ready', data: body as DashboardOverview } : { status: 'error' } })
    })
    return () => { cancelled = true }
  }, [projectId, attempt])

  const reload = useCallback(() => setAttempt((n) => n + 1), [])
  // An answer for an earlier attempt is not this one's: until it arrives, loading.
  return { overview: result && result.attempt === attempt ? result.state : { status: 'loading' }, reload }
}

export function seedUrl(projectId: string): string {
  return `/api/projects/${encodeURIComponent(projectId)}/seed`
}

/** `refreshKey`: bumped to read the scan again (a mapping this screen started has just finished). */
export function useSeedState(projectId: string, refreshKey = 0): SeedState {
  const [state, setState] = useState<SeedState>({ kind: 'loading' })
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null
    void getJson(seedUrl(projectId)).then(({ status, body }) => {
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
