'use client'

/**
 * The Search Console data the widgets read, asked for once per screen.
 *
 * Several widgets of one screen need the same status (the dashboard's clicks tile
 * and top pages, the keywords table's line and cells), so a response is shared for
 * a few seconds by URL: the widgets mount together and ask one question. A later
 * visit asks again, so a connection made in settings shows as soon as the merchant
 * comes back. Every read goes through the owner-checked /api/gsc routes; nothing
 * here touches the database.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useActiveProject } from '@/lib/active-project/ActiveProjectProvider'
import { gscStatusView, type GscSetupState, type GscStatusView } from '@/lib/gsc/widget-state'
import { useGscEnabled } from './GscFeature'

export interface GscResponse { status: number; body: unknown }

const SHARE_MS = 10_000
const shared = new Map<string, { at: number; promise: Promise<GscResponse>; value?: GscResponse }>()

function request(url: string, fresh: boolean): Promise<GscResponse> {
  const hit = shared.get(url)
  if (!fresh && hit && Date.now() - hit.at < SHARE_MS) return hit.promise
  const entry: { at: number; promise: Promise<GscResponse>; value?: GscResponse } = { at: Date.now(), promise: Promise.resolve({ status: 0, body: null }) }
  entry.promise = fetch(url, { cache: 'no-store' })
    .then(async (res) => ({ status: res.status, body: await res.json().catch(() => null) }))
    // A network failure is status 0: an error state, never "not connected".
    .catch(() => ({ status: 0, body: null }))
    .then((response) => { entry.value = response; return response })
  shared.set(url, entry)
  return entry.promise
}

/** The shared read, for code that is not a hook (the settings panel's own refresh).
 *  `fresh` asks again past the sharing window. */
export function readGscResponse(url: string, fresh = false): Promise<GscResponse> {
  return request(url, fresh)
}

/** The answer already in hand for `url`, if a widget of this screen read it moments ago. */
export function peekGscResponse(url: string | null): GscResponse | undefined {
  return peek(url)
}

function peek(url: string | null): GscResponse | undefined {
  if (!url) return undefined
  const hit = shared.get(url)
  return hit && Date.now() - hit.at < SHARE_MS ? hit.value : undefined
}

/** A response already in hand (a server render, a recorded fixture), served as if it had
 *  just been fetched, so the first render can show it. */
export function primeGscResponse(url: string, response: GscResponse): void {
  shared.set(url, { at: Date.now(), promise: Promise.resolve(response), value: response })
}

export function gscStatusUrl(projectId: string): string {
  return `/api/gsc/status?projectId=${encodeURIComponent(projectId)}`
}

export type GscMetricsView = 'pages' | 'keywords' | 'trend'
export function gscMetricsUrl(projectId: string, view: GscMetricsView): string {
  return `/api/gsc/metrics?projectId=${encodeURIComponent(projectId)}&window=28&view=${view}`
}

/** One GET, shared by URL. `reload` asks again, past the sharing window. */
export function useGscResponse(url: string | null): { response: GscResponse | null; reload: () => void } {
  const [result, setResult] = useState<{ url: string; response: GscResponse } | null>(() => {
    const primed = peek(url)
    return url && primed ? { url, response: primed } : null
  })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!url) return
    let cancelled = false
    request(url, attempt > 0).then((response) => { if (!cancelled) setResult({ url, response }) })
    return () => { cancelled = true }
  }, [url, attempt])

  const reload = useCallback(() => {
    setResult(null)
    setAttempt((n) => n + 1)
  }, [])

  // A response for another project is not this one's: until the new one arrives, loading.
  return { response: result && result.url === url ? result.response : null, reload }
}

/**
 * What the Search Console widgets of a project can show. Without a project there is
 * nothing to connect a property to, which a merchant reads as "not connected"; while
 * the project list is still resolving, it is loading, never a setup prompt.
 */
export function useGscStatus(projectId: string | null | undefined): { view: GscStatusView; reload: () => void } {
  const { isResolved } = useActiveProject()
  // Switched off on the server (the layout says so): nothing to ask, and nothing shown.
  const off = useGscEnabled() === false
  const { response, reload } = useGscResponse(projectId && !off ? gscStatusUrl(projectId) : null)
  const view = useMemo<GscStatusView>(() => {
    if (off) return { state: 'disabled' }
    if (!projectId) return isResolved ? { state: 'not_connected' } : { state: 'loading' }
    if (!response) return { state: 'loading' }
    return gscStatusView(response.status, response.body)
  }, [off, projectId, isResolved, response])
  return { view, reload }
}

/** A widget's data: the status's answer until it is ready, then the view's own. */
export type GscData<T> =
  | { state: 'loading' }
  | { state: 'error' }
  | { state: 'disabled' }
  | { state: GscSetupState }
  | { state: 'ready'; data: T }

/**
 * One metrics view of the latest 28-day sync, read only once the status says there is
 * one. A view that finds no sync (a race with a deletion) says so as "never synced";
 * a failed read is an error, never a setup prompt.
 */
export function useGscMetrics<T>(
  projectId: string | null | undefined,
  status: GscStatusView,
  view: GscMetricsView,
  pick: (body: Record<string, unknown>) => T,
): { data: GscData<T>; reload: () => void } {
  const ready = status.state === 'ready' && !!projectId
  const { response, reload } = useGscResponse(ready && projectId ? gscMetricsUrl(projectId, view) : null)
  const data = useMemo<GscData<T>>(() => {
    if (status.state !== 'ready') return status
    if (!response) return { state: 'loading' }
    const body = (response.body ?? {}) as Record<string, unknown>
    if (response.status < 200 || response.status >= 300 || body.ok !== true) return { state: 'error' }
    if (view !== 'trend' && body.run === null) return { state: 'never_synced' }
    return { state: 'ready', data: pick(body) }
    // `pick` is a pure reader of the body; a new function identity must not refetch or recompute.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, response, view])
  return { data, reload }
}
