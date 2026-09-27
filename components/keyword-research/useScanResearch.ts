'use client'

/**
 * The seeding scan's research, for the research tab.
 *
 * On opening, two reads go out together: the scan's latest run (the scan's own
 * GET /api/projects/[id]/seed) and its stored research (GET
 * /api/keyword-research/scan). Both read the database only: no Google Ads, Serper
 * or model call happens because the tab opened.
 *
 * While the research is still being found, the run is looked at again, lightly:
 * after 8 seconds, then backing off to 30, never while the tab is hidden. The
 * research is read again only when b2 or b3 has just finished (or the run ended),
 * and the look stops by itself once both are over. A look that fails is retried
 * later and changes nothing on screen.
 *
 * What the screen shows is decided in lib/keyword-research/scan-state.ts.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  pollDelayMs, readResearchAnswer, readSeedAnswer, researchChanged, researchRunning, scanView,
  type ResearchAnswer, type ScanRun, type ScanView, type SeedAnswer,
} from '@/lib/keyword-research/scan-state'

export interface ScanResearchState {
  view: ScanView
  /** Read the research again: the tracked keywords changed (keywords were added). */
  reloadTracked: () => void
  /** Read the run and its research again, after a failed read. */
  retry: () => void
}

export function seedRunUrl(projectId: string): string {
  return `/api/projects/${encodeURIComponent(projectId)}/seed`
}

export function scanResearchUrl(projectId: string): string {
  return `/api/keyword-research/scan?projectId=${encodeURIComponent(projectId)}`
}

async function read(url: string): Promise<{ status: number; body: unknown }> {
  try {
    const res = await fetch(url, { cache: 'no-store' })
    return { status: res.status, body: await res.json().catch(() => null) }
  } catch {
    // A network failure: status 0, which every reader treats as "no answer".
    return { status: 0, body: null }
  }
}

type Answer<T> = { projectId: string; value: T; at: number }

export function useScanResearch(projectId: string | null): ScanResearchState {
  const [seed, setSeed] = useState<Answer<SeedAnswer> | null>(null)
  const [research, setResearch] = useState<Answer<ResearchAnswer> | null>(null)
  const [attempt, setAttempt] = useState(0)
  const lastRun = useRef<ScanRun | null>(null)

  const readResearch = useCallback((id: string) => {
    read(scanResearchUrl(id)).then(({ status, body }) => {
      const value = readResearchAnswer(status, body)
      // A failed re-read keeps the research already on screen.
      setResearch((prev) => (value.kind === 'error' && prev?.projectId === id && prev.value.kind === 'ok' ? prev : { projectId: id, value, at: Date.now() }))
    })
  }, [])

  // The first look (and a retry): the run and its research, together.
  useEffect(() => {
    if (!projectId) return
    let cancelled = false
    read(seedRunUrl(projectId)).then(({ status, body }) => {
      if (cancelled) return
      const value = readSeedAnswer(status, body)
      lastRun.current = value.kind === 'run' ? value.run : null
      setSeed({ projectId, value, at: Date.now() })
    })
    read(scanResearchUrl(projectId)).then(({ status, body }) => {
      if (!cancelled) setResearch({ projectId, value: readResearchAnswer(status, body), at: Date.now() })
    })
    return () => { cancelled = true }
  }, [projectId, attempt])

  const current = seed && seed.projectId === projectId ? seed : null
  const polling = !!current && current.value.kind === 'run' && researchRunning(current.value.run, new Date(current.at))

  // While the research is still being found: look again, lightly, until it is over.
  useEffect(() => {
    if (!projectId || !polling) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null
    let n = 0
    const schedule = () => { timer = setTimeout(look, pollDelayMs(n++)) }
    const look = async () => {
      if (cancelled) return
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') { schedule(); return }
      const { status, body } = await read(seedRunUrl(projectId))
      if (cancelled) return
      const value = readSeedAnswer(status, body)
      // No readable run this time (a network blip): keep what is on screen and look again later.
      if (value.kind !== 'run') { schedule(); return }
      const now = new Date()
      const changed = researchChanged(lastRun.current, value.run, now)
      lastRun.current = value.run
      setSeed({ projectId, value, at: now.getTime() })
      if (changed) readResearch(projectId)
      if (researchRunning(value.run, now)) schedule()
    }
    schedule()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [projectId, polling, readResearch])

  const reloadTracked = useCallback(() => { if (projectId) readResearch(projectId) }, [projectId, readResearch])
  const retry = useCallback(() => setAttempt((n) => n + 1), [])

  const view = useMemo<ScanView>(() => {
    if (!projectId) return { kind: 'none' }
    const r = research && research.projectId === projectId ? research.value : null
    return scanView(current?.value ?? null, r, new Date(current?.at ?? 0))
  }, [projectId, current, research])

  return { view, reloadTracked, retry }
}
