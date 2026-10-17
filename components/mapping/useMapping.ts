'use client'

/**
 * A project's mapping, for any screen that offers it (lib/project-mapping/state.ts).
 *
 * One read of GET /api/projects/[id]/seed on opening — a database read that
 * starts nothing — and, while the mapping runs, another every few seconds so
 * its four steps move without a refresh. "Run the mapping" is the settings
 * screen's own rescan: POST { action: 'start' } to the same route, with every
 * check that route makes (the flag or an administrator, the entitlement, the
 * 24-hour rule, the daily caps). A rescan only fills fields that are still
 * empty or were filled by an earlier scan; what the owner wrote stays theirs
 * (lib/seed-scan/__qa__/seed-rescan-owner-data.qa.ts). Every answer becomes one
 * notice in our own words (lib/project-settings/view.ts rescanNotice).
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Locale } from '@/lib/i18n/locales'
import { MAPPING_LOADING, mappingFrom, mappingRunning, type Mapping } from '@/lib/project-mapping/state'
import { rescanNotice, retryAfterFrom, type RescanNotice } from '@/lib/project-settings/view'

/** How often a running mapping is read again. */
export const MAPPING_POLL_MS = 4_000
/** Stage A takes about a minute; after ten the screen stops asking and says it is slow. */
export const MAPPING_MAX_POLLS = 150
const READ_DEADLINE_MS = 10_000

export function mappingUrl(projectId: string): string {
  return `/api/projects/${encodeURIComponent(projectId)}/seed`
}

async function readMapping(projectId: string): Promise<Mapping | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), READ_DEADLINE_MS)
  try {
    const res = await fetch(mappingUrl(projectId), { cache: 'no-store', signal: controller.signal })
    const body = await res.json().catch(() => null)
    // A 5xx or a network blip is no answer at all, not "the scan is off".
    if (res.status >= 500) return null
    return mappingFrom(res.status, body, new Date())
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

export type MappingControl = {
  mapping: Mapping
  /** Starting the mapping: the POST has not answered yet. */
  starting: boolean
  /** What the last start (or the run it followed) came to, as one notice; null when there is nothing to say. */
  notice: RescanNotice | null
  /** How a run this screen watched ended; set once, when it ends. */
  finished: 'done' | 'failed' | null
  start: () => Promise<void>
  dismiss: () => void
}

/** `projectId` null (no project in view yet): nothing is read, and the mapping is not offered. */
export function useMapping(projectId: string | null, locale: Locale, onFinished?: () => void): MappingControl {
  const [mapping, setMapping] = useState<Mapping>(MAPPING_LOADING)
  const [starting, setStarting] = useState(false)
  const [notice, setNotice] = useState<RescanNotice | null>(null)
  const [finished, setFinished] = useState<'done' | 'failed' | null>(null)
  const [pollTick, setPollTick] = useState(0)
  const polls = useRef(0)
  const finishedRef = useRef(onFinished)
  useEffect(() => {
    finishedRef.current = onFinished
  })
  // Whether this screen saw the mapping running, so its end is news worth a toast.
  const sawRunning = useRef(false)

  const take = useCallback((next: Mapping | null) => {
    if (!next) return
    setMapping((prev) => {
      // A later read that finds the route unavailable keeps what was known (a blip after a 200).
      if (next.available === false && prev.available === true) return prev
      return next
    })
    if (mappingRunning(next)) sawRunning.current = true
    else if (sawRunning.current && next.available === true && (next.state === 'done' || next.state === 'failed')) {
      sawRunning.current = false
      setFinished(next.state)
      setNotice(next.state === 'done' ? { kind: 'finished' } : null)
      finishedRef.current?.()
    }
  }, [])

  // The first read, and every poll while the mapping runs.
  useEffect(() => {
    if (!projectId) return
    let cancelled = false
    void readMapping(projectId).then((next) => { if (!cancelled) take(next) })
    return () => { cancelled = true }
  }, [projectId, pollTick, take])

  const running = mappingRunning(mapping)
  useEffect(() => {
    if (!running) return
    const timer = setTimeout(() => {
      // Ten minutes of asking: stop, and say it is slow instead.
      if (polls.current >= MAPPING_MAX_POLLS) {
        setNotice({ kind: 'slow' })
        return
      }
      polls.current++
      setPollTick((n) => n + 1)
    }, MAPPING_POLL_MS)
    return () => clearTimeout(timer)
  }, [running, pollTick])

  const start = useCallback(async () => {
    if (!projectId || starting || mapping.available !== true || mapping.state === 'running') return
    setStarting(true)
    setNotice(null)
    setFinished(null)
    let status = 0
    let code: unknown = null
    let retryAfter: number | null = null
    try {
      const res = await fetch(mappingUrl(projectId), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start', locale }),
      })
      status = res.status
      const body = (await res.json().catch(() => null)) as { code?: unknown } | null
      code = body?.code
      retryAfter = retryAfterFrom(res.headers.get('Retry-After'), body)
    } catch {
      // No answer at all reads as "could not start", with a retry.
    }
    const next = rescanNotice(status, code, retryAfter)
    setStarting(false)
    if (next.kind === 'started' || next.kind === 'in_progress') {
      // Running at once, so the banner turns into its progress without waiting for the first poll.
      sawRunning.current = true
      polls.current = 0
      setMapping((prev) => prev.available === true
        ? { ...prev, state: 'running', steps: prev.steps.map((s, i) => ({ step: s.step, state: i === 0 ? 'running' : 'pending' })) }
        : prev)
      setNotice(null)
      setPollTick((n) => n + 1)
    } else {
      setNotice(next)
    }
  }, [starting, mapping, projectId, locale])

  const dismiss = useCallback(() => {
    setNotice(null)
    setFinished(null)
  }, [])

  return { mapping, starting, notice, finished, start, dismiss }
}
