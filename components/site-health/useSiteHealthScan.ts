'use client'

/**
 * The screen's state: the last report of this project (kept in this browser, a
 * convenience only — the screen works without it), a scan in progress with its
 * progress, and the fixes approved in this session.
 *
 * The scan is POST /api/site-health/scan, read as NDJSON: progress lines while
 * the pages are read, then the report. Nothing is stored on the server.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ScanStreamLine, SiteHealthErrorCode, SiteHealthReport } from '@/lib/site-health/types'

export type ScanProgress = { stage: 'pages' | 'links' | 'site'; done: number; total: number }

interface Cached { v: 1; report: SiteHealthReport; fixed: string[] }

const keyOf = (projectId: string) => `site-health:v1:${projectId}`

function readCache(projectId: string): Cached | null {
  try {
    const raw = window.localStorage.getItem(keyOf(projectId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as Cached
    return parsed && parsed.v === 1 && parsed.report && Array.isArray(parsed.report.findings) ? parsed : null
  } catch {
    return null
  }
}

function writeCache(projectId: string, value: Cached | null) {
  try {
    if (value) window.localStorage.setItem(keyOf(projectId), JSON.stringify(value))
    else window.localStorage.removeItem(keyOf(projectId))
  } catch {
    /* private window, blocked storage: the screen simply starts empty next time */
  }
}

/** One fixed page of one finding. */
export const fixKey = (kind: string, url: string) => `${kind}|${url}`

export function useSiteHealthScan(projectId: string) {
  const [report, setReport] = useState<SiteHealthReport | null>(null)
  const [fixed, setFixed] = useState<Set<string>>(new Set())
  const [loaded, setLoaded] = useState(false)
  const [progress, setProgress] = useState<ScanProgress | null>(null)
  const [error, setError] = useState<SiteHealthErrorCode | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    const cached = readCache(projectId)
    // Hydrating from browser storage after the first render (never during it):
    // the server render and the first client render must agree.
    setReport(cached?.report ?? null)
    setFixed(new Set(cached?.fixed ?? []))
    setLoaded(true)
    return () => abortRef.current?.abort()
  }, [projectId])

  const scan = useCallback(async () => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setError(null)
    setProgress({ stage: 'pages', done: 0, total: 1 })
    let got: SiteHealthReport | null = null
    let failed: SiteHealthErrorCode | null = null
    try {
      const res = await fetch('/api/site-health/scan', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ projectId }),
        signal: controller.signal,
      })
      if (!res.body) throw new Error('no body')
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      for (;;) {
        const { done, value } = await reader.read()
        if (value) buffer += decoder.decode(value, { stream: true })
        let nl = buffer.indexOf('\n')
        while (nl >= 0) {
          const line = buffer.slice(0, nl).trim()
          buffer = buffer.slice(nl + 1)
          nl = buffer.indexOf('\n')
          if (!line) continue
          let parsed: ScanStreamLine
          try { parsed = JSON.parse(line) as ScanStreamLine } catch { continue }
          if (parsed.type === 'progress') setProgress({ stage: parsed.stage, done: parsed.done, total: Math.max(parsed.total, 1) })
          else if (parsed.type === 'report') got = parsed.report
          else if (parsed.type === 'error') failed = parsed.code
        }
        if (done) break
      }
    } catch {
      if (controller.signal.aborted) return
      failed = 'scan_failed'
    }
    if (controller.signal.aborted) return
    setProgress(null)
    if (got) {
      setReport(got)
      setFixed(new Set())
      writeCache(projectId, { v: 1, report: got, fixed: [] })
    } else {
      setError(failed ?? 'scan_failed')
    }
  }, [projectId])

  const fixedRef = useRef(fixed)
  const reportRef = useRef(report)
  useEffect(() => { fixedRef.current = fixed; reportRef.current = report }, [fixed, report])

  const markFixed = useCallback((key: string, on: boolean) => {
    const next = new Set(fixedRef.current)
    if (on) next.add(key)
    else next.delete(key)
    fixedRef.current = next
    setFixed(next)
    if (reportRef.current) writeCache(projectId, { v: 1, report: reportRef.current, fixed: [...next] })
  }, [projectId])

  return { report, fixed, loaded, progress, error, scan, markFixed }
}
