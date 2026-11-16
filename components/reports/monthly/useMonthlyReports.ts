'use client'

/**
 * Reads the project's monthly reports: one GET, read-only, no model and no third
 * party, so opening the Reports screen or the dashboard costs a single row read
 * per month. `generate` is the owner's "create last month's report now".
 *
 * THE READ IS SHARED BY URL, AND CAN BE STARTED EARLY. The dashboard's teaser
 * only mounts once the dashboard's own route has answered, so this GET used to
 * start in the fourth wave of a dashboard load although all it needs is the
 * project id, which the screen has from its first render. The screen now warms
 * this read as it mounts (prefetchMonthlyReports) and the teaser, mounting later,
 * finds the answer already in hand. The cache lives on `globalThis` for the
 * reason lib/client/seed-read.ts gives: a 'use client' module imported from two
 * route segments can be emitted into two chunks, and two module instances mean
 * two caches that never see each other.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { MonthlyGetResponse } from '@/lib/reports/monthly/http'

export type MonthlyLoad =
  | { status: 'loading' }
  | { status: 'error' }
  /** The report tables are not there yet: the feature shows nothing. */
  | { status: 'unavailable' }
  | { status: 'ready'; body: MonthlyGetResponse }

export function monthlyUrl(projectId: string, month?: string | null): string {
  const q = new URLSearchParams({ projectId })
  if (month) q.set('month', month)
  return `/api/reports/monthly?${q.toString()}`
}

/** What one GET answered: the body, and whether the response itself was a success. */
type Answer = { ok: boolean; body: MonthlyGetResponse | null }

const SHARE_MS = 15_000
const CACHE_KEY = '__goTopMonthlyCache__'
type CacheHost = typeof globalThis & { [CACHE_KEY]?: Map<string, { at: number; promise: Promise<Answer> }> }

function cacheMap(): Map<string, { at: number; promise: Promise<Answer> }> {
  const host = globalThis as CacheHost
  const existing = host[CACHE_KEY]
  if (existing) return existing
  const created = new Map<string, { at: number; promise: Promise<Answer> }>()
  host[CACHE_KEY] = created
  return created
}

/** One GET per URL for a few seconds. `fresh` asks again, past that window. */
function readMonthly(url: string, fresh: boolean): Promise<Answer> {
  const cache = cacheMap()
  const hit = cache.get(url)
  if (!fresh && hit && Date.now() - hit.at < SHARE_MS) return hit.promise
  const promise = fetch(url, { cache: 'no-store' })
    .then(async (res) => ({ ok: res.ok, body: (await res.json().catch(() => null)) as MonthlyGetResponse | null }))
    .catch(() => ({ ok: false, body: null }))
  cache.set(url, { at: Date.now(), promise })
  return promise
}

/**
 * Starts the project's latest-report read now, for a screen that will show the
 * teaser later. Nothing is returned and nothing throws: the hook reads the same
 * shared answer when it mounts.
 */
export function prefetchMonthlyReports(projectId: string | null | undefined): void {
  if (!projectId) return
  void readMonthly(monthlyUrl(projectId), false).catch(() => {})
}

type Tagged = MonthlyLoad & { key: string; projectId: string }

export function useMonthlyReports(projectId: string | null) {
  const [month, setMonth] = useState<string | null>(null)
  const [state, setState] = useState<Tagged>({ key: '', projectId: '', status: 'loading' })
  // The last answer that had reports in it, per project: switching month keeps
  // the list and the current report on screen until the next one lands, so the
  // section never flashes a loading state in between.
  const [lastReady, setLastReady] = useState<{ projectId: string; body: MonthlyGetResponse } | null>(null)
  const [tick, setTick] = useState(0)
  const [generating, setGenerating] = useState<'idle' | 'busy' | 'failed'>('idle')
  const request = useRef(0)
  const key = `${projectId ?? ''}|${month ?? ''}|${tick}`

  useEffect(() => {
    if (!projectId) return
    const mine = ++request.current
    // A reload (`tick`) must not be served the answer it is replacing.
    readMonthly(monthlyUrl(projectId, month), tick > 0)
      .then(({ ok, body }) => {
        if (mine !== request.current) return
        if (!ok || !body || body.ok !== true) { setState({ key, projectId, status: 'error' }); return }
        if (!body.available) { setState({ key, projectId, status: 'unavailable' }); return }
        setState({ key, projectId, status: 'ready', body })
        setLastReady({ projectId, body })
      })
      .catch(() => { if (mine === request.current) setState({ key, projectId, status: 'error' }) })
  }, [projectId, month, key, tick])

  const [forProject, setForProject] = useState(projectId)
  if (forProject !== projectId) {
    // A new project starts from its latest report.
    setForProject(projectId)
    setMonth(null)
    setGenerating('idle')
  }

  const reload = useCallback(() => setTick((n) => n + 1), [])

  /** Resolves true when the report was made, false when it was not. */
  const generate = useCallback(async (): Promise<boolean> => {
    if (!projectId) return false
    setGenerating('busy')
    try {
      const res = await fetch('/api/reports/monthly/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ projectId }),
      })
      const body = await res.json().catch(() => null) as { ok?: boolean; month?: string } | null
      if (!res.ok || !body?.ok) { setGenerating('failed'); return false }
      setGenerating('idle')
      setMonth(body.month ?? null)
      setTick((n) => n + 1)
      return true
    } catch {
      setGenerating('failed')
      return false
    }
  }, [projectId])

  const fresh = state.key === key
  const load: MonthlyLoad = fresh
    ? state
    : lastReady && lastReady.projectId === projectId
      ? { status: 'ready', body: lastReady.body }
      : { status: 'loading' }
  return { load, switching: !fresh && load.status === 'ready', month, setMonth, reload, generate, generating }
}
