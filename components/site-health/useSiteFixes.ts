'use client'

/**
 * The auto-fix state of one project, as the screen needs it: where an approved fix
 * would go (the Go Top plugin, the WordPress application password, the webhook,
 * or nowhere), the plugin's pairing, and the fix queue. Read from
 * GET /api/site-health/fixes; while the queue tables are missing (the migration is
 * not applied) `capabilities.available` is false and the screen keeps its
 * existing behaviour, untouched.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { FixCapabilities, FixErrorCode, FixJobView } from '@/lib/site-fix/types'
import { announceWaitingChanged } from '@/lib/nudges/events'

export type FixAnswer<T> = ({ ok: true } & T) | { ok: false; code: FixErrorCode }

/** POST to one of the auto-fix routes; a network failure reads as our own "unreachable". */
export async function postFix<T>(path: '/api/site-health/fixes' | '/api/site-health/plugin', body: Record<string, unknown>): Promise<FixAnswer<T>> {
  try {
    const res = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    const json = (await res.json().catch(() => null)) as FixAnswer<T> | null
    if (json && typeof json === 'object' && 'ok' in json) return json
    return { ok: false, code: 'store_failed' }
  } catch {
    return { ok: false, code: 'plugin_unreachable' }
  }
}

type Loaded = { capabilities: FixCapabilities | null; jobs: FixJobView[] }

/** The project's auto-fix state; `capabilities: null` on any failure (the screen keeps its older behaviour). */
async function fetchFixes(projectId: string): Promise<Loaded> {
  try {
    const res = await fetch(`/api/site-health/fixes?projectId=${encodeURIComponent(projectId)}`, { cache: 'no-store' })
    const json = (await res.json().catch(() => null)) as { ok?: boolean; capabilities?: FixCapabilities; jobs?: FixJobView[] } | null
    if (json?.ok && json.capabilities) return { capabilities: json.capabilities, jobs: Array.isArray(json.jobs) ? json.jobs : [] }
  } catch { /* the network: treated as unavailable */ }
  return { capabilities: null, jobs: [] }
}

export function useSiteFixes(projectId: string) {
  const [capabilities, setCapabilities] = useState<FixCapabilities | null>(null)
  const [jobs, setJobs] = useState<FixJobView[]>([])
  const alive = useRef(true)

  const apply = useCallback((got: Loaded) => {
    if (!alive.current) return
    setCapabilities(got.capabilities)
    setJobs(got.jobs)
  }, [])

  // After every re-read of the queue (a fix or a batch applied, undone, cancelled) the dashboard card and
  // the sidebar badge read their own count again, so they never keep counting work that is done.
  const reload = useCallback(async () => { apply(await fetchFixes(projectId)); announceWaitingChanged() }, [projectId, apply])

  useEffect(() => {
    alive.current = true
    fetchFixes(projectId).then(apply, () => {})
    return () => { alive.current = false }
  }, [projectId, apply])

  /** One job changed (approved, undone, cancelled, retried): put it first or in place. */
  const upsertJob = useCallback((job: FixJobView | null | undefined) => {
    if (!job) return
    setJobs((list) => {
      const i = list.findIndex((j) => j.id === job.id)
      if (i < 0) return [job, ...list]
      const next = list.slice()
      next[i] = job
      return next
    })
  }, [])

  /** The queue is live for this project: tables present and not a Shopify store. */
  const active = !!capabilities && capabilities.available && !capabilities.readOnly

  return { capabilities, jobs, active, reload, upsertJob }
}
