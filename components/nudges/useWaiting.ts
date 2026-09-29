'use client'

/**
 * What waits for the owner of the active project: the one read behind the dashboard's
 * "waiting for you" card AND the sidebar's count pills, so the two always agree.
 *
 * Owner-checked route (GET /api/projects/[id]/waiting); nothing here touches the database.
 * Answers are shared between the card and the rail for a short time (one request, not two),
 * asked again when the screen changes or the tab is focused again, and any failure is
 * "nothing waiting": a nudge never becomes an error, a spinner or a toast.
 */
import { useEffect, useRef, useState } from 'react'
import type { WaitingAnswer } from '@/lib/nudges/waiting'
import { safeFixCountFromScan } from '@/lib/nudges/rows'

const FRESH_MS = 20_000
const DEADLINE_MS = 8_000

type Entry = { at: number; value: WaitingAnswer | null; inflight: Promise<WaitingAnswer | null> | null }
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

function read(projectId: string, force: boolean): Promise<WaitingAnswer | null> {
  const hit = cache.get(projectId)
  if (hit?.inflight) return hit.inflight
  if (hit && !force && Date.now() - hit.at < FRESH_MS) return Promise.resolve(hit.value)
  const entry: Entry = { at: hit?.at ?? 0, value: hit?.value ?? null, inflight: null }
  entry.inflight = load(projectId).then((value) => {
    cache.set(projectId, { at: Date.now(), value, inflight: null })
    return value
  })
  cache.set(projectId, entry)
  return entry.inflight
}

/** The safe fixes the last scan of this project found, from this browser (a lower bound). */
export function readSafeFixes(projectId: string): number {
  try { return safeFixCountFromScan(window.localStorage.getItem(`site-health:v1:${projectId}`)) } catch { return 0 }
}

export interface WaitingState { waiting: WaitingAnswer | null; safeFixes: number; loaded: boolean }

/** `refreshKey`: a value that changes when the screen changes (the rail passes the pathname). */
export function useWaiting(projectId: string | null, refreshKey = ''): WaitingState {
  const [state, setState] = useState<{ key: string; waiting: WaitingAnswer | null; safeFixes: number } | null>(null)
  const firstKey = useRef(refreshKey)

  useEffect(() => {
    if (!projectId) return
    let live = true
    const run = (force: boolean) => {
      void read(projectId, force).then((waiting) => {
        if (live) setState({ key: projectId, waiting, safeFixes: readSafeFixes(projectId) })
      })
    }
    // The first read may reuse a fresh answer; a change of screen asks again (something may have been approved).
    run(refreshKey !== firstKey.current)
    const onFocus = () => run(true)
    window.addEventListener('focus', onFocus)
    return () => { live = false; window.removeEventListener('focus', onFocus) }
  }, [projectId, refreshKey])

  // An answer for another project is not this one's.
  if (!projectId || !state || state.key !== projectId) return { waiting: null, safeFixes: 0, loaded: false }
  return { waiting: state.waiting, safeFixes: state.safeFixes, loaded: true }
}
