'use client'

/**
 * Reads the project's monthly reports: one GET, read-only, no model and no third
 * party, so opening the Reports screen or the dashboard costs a single row read
 * per month. `generate` is the owner's "create last month's report now".
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
    fetch(monthlyUrl(projectId, month), { cache: 'no-store' })
      .then(async (res) => {
        const body = (await res.json().catch(() => null)) as MonthlyGetResponse | null
        if (mine !== request.current) return
        if (!res.ok || !body || body.ok !== true) { setState({ key, projectId, status: 'error' }); return }
        if (!body.available) { setState({ key, projectId, status: 'unavailable' }); return }
        setState({ key, projectId, status: 'ready', body })
        setLastReady({ projectId, body })
      })
      .catch(() => { if (mine === request.current) setState({ key, projectId, status: 'error' }) })
  }, [projectId, month, key])

  const [forProject, setForProject] = useState(projectId)
  if (forProject !== projectId) {
    // A new project starts from its latest report.
    setForProject(projectId)
    setMonth(null)
    setGenerating('idle')
  }

  const reload = useCallback(() => setTick((n) => n + 1), [])

  const generate = useCallback(async () => {
    if (!projectId) return
    setGenerating('busy')
    try {
      const res = await fetch('/api/reports/monthly/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ projectId }),
      })
      const body = await res.json().catch(() => null) as { ok?: boolean; month?: string } | null
      if (!res.ok || !body?.ok) { setGenerating('failed'); return }
      setGenerating('idle')
      setMonth(body.month ?? null)
      setTick((n) => n + 1)
    } catch {
      setGenerating('failed')
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
