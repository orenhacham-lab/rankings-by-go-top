'use client'

/**
 * What waits for the owner of the active project: the one read behind the dashboard's
 * "waiting for you" card AND the sidebar's count pills, so the two always agree.
 *
 * Owner-checked route (GET /api/projects/[id]/waiting); nothing here touches the database.
 * The safe-fix count also reads the fix queue (GET /api/site-health/fixes, the same call the health
 * screen makes) and counts with the button's own rule; a failed read of the queue is `null`: no fixes
 * row and no badge, never a guess. The health screen announces every change of its queue
 * (WAITING_REFRESH_EVENT), so the card and the badge follow a batch that was just applied.
 * Answers are shared between the card and the rail for a short time (one request, not two),
 * asked again when the screen changes or the tab is focused again, and any failure is
 * "nothing waiting": a nudge never becomes an error, a spinner or a toast.
 */
import { useEffect, useRef, useState } from 'react'
import type { WaitingAnswer } from '@/lib/nudges/waiting'
import { safeFixCountFromScan, type FixesRead } from '@/lib/nudges/rows'
import { WAITING_REFRESH_EVENT } from '@/lib/nudges/events'

const FRESH_MS = 20_000
const DEADLINE_MS = 8_000

type Read = { waiting: WaitingAnswer | null; fixes: FixesRead | null }
type Entry = { at: number; value: Read; inflight: Promise<Read> | null }
const cache = new Map<string, Entry>()

export const waitingUrl = (projectId: string) => `/api/projects/${encodeURIComponent(projectId)}/waiting`

async function load(projectId: string): Promise<WaitingAnswer | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), DEADLINE_MS)
  try {
    const res = await fetch(waitingUrl(projectId), { cache: 'no-store', signal: controller.signal })
    const body = await res.json().catch(() => null) as WaitingAnswer | null
    return res.ok && body && body.ok === true ? body : null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

export const fixesUrl = (projectId: string) => `/api/site-health/fixes?projectId=${encodeURIComponent(projectId)}`

/** The fix queue and where fixes would go, as the health screen reads them; null on any failure. */
async function loadFixes(projectId: string): Promise<FixesRead | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), DEADLINE_MS)
  try {
    const res = await fetch(fixesUrl(projectId), { cache: 'no-store', signal: controller.signal })
    const body = await res.json().catch(() => null) as { ok?: boolean; capabilities?: FixesRead['capabilities']; jobs?: FixesRead['jobs'] } | null
    return res.ok && body?.ok === true && body.capabilities ? { capabilities: body.capabilities, jobs: Array.isArray(body.jobs) ? body.jobs : [] } : null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

function read(projectId: string, force: boolean): Promise<Read> {
  const hit = cache.get(projectId)
  if (hit?.inflight) return hit.inflight
  if (hit && !force && Date.now() - hit.at < FRESH_MS) return Promise.resolve(hit.value)
  const entry: Entry = { at: hit?.at ?? 0, value: hit?.value ?? { waiting: null, fixes: null }, inflight: null }
  // The queue is only worth reading when the plugin is paired: the fixes row needs it.
  entry.inflight = load(projectId).then(async (waiting) => {
    const fixes = waiting?.pluginConnected ? await loadFixes(projectId) : null
    return { waiting, fixes }
  }).then((value) => {
    cache.set(projectId, { at: Date.now(), value, inflight: null })
    return value
  })
  cache.set(projectId, entry)
  return entry.inflight
}

/**
 * The safe fixes ready for this project: the scan kept in this browser and the fix queue, with the
 * health screen's own rule. Null when the queue could not be read (the caller shows nothing).
 * Without the paired plugin there is nothing to fix through it: 0.
 */
export function readSafeFixes(projectId: string, waiting: WaitingAnswer | null, fixes: FixesRead | null): number | null {
  if (!waiting?.pluginConnected) return 0
  try { return safeFixCountFromScan(window.localStorage.getItem(`site-health:v1:${projectId}`), fixes) } catch { return safeFixCountFromScan(null, fixes) }
}

export interface WaitingState { waiting: WaitingAnswer | null; safeFixes: number | null; loaded: boolean }

/** `refreshKey`: a value that changes when the screen changes (the rail passes the pathname). */
export function useWaiting(projectId: string | null, refreshKey = ''): WaitingState {
  const [state, setState] = useState<{ key: string; waiting: WaitingAnswer | null; safeFixes: number | null } | null>(null)
  const firstKey = useRef(refreshKey)

  useEffect(() => {
    if (!projectId) return
    let live = true
    const run = (force: boolean) => {
      void read(projectId, force).then(({ waiting, fixes }) => {
        if (live) setState({ key: projectId, waiting, safeFixes: readSafeFixes(projectId, waiting, fixes) })
      })
    }
    // The first read may reuse a fresh answer; a change of screen asks again (something may have been approved).
    run(refreshKey !== firstKey.current)
    const onFocus = () => run(true)
    window.addEventListener('focus', onFocus)
    // The health screen changed its fix queue (a batch or a single fix was applied, undone or cancelled).
    window.addEventListener(WAITING_REFRESH_EVENT, onFocus)
    return () => { live = false; window.removeEventListener('focus', onFocus); window.removeEventListener(WAITING_REFRESH_EVENT, onFocus) }
  }, [projectId, refreshKey])

  // An answer for another project is not this one's.
  if (!projectId || !state || state.key !== projectId) return { waiting: null, safeFixes: null, loaded: false }
  return { waiting: state.waiting, safeFixes: state.safeFixes, loaded: true }
}
