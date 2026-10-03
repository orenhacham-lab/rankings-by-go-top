'use client'

/**
 * The competitive view's data: one GET of /api/keyword-research/competitive, owner
 * checked on the server. A reload (after a keyword or a competitor was added) keeps
 * the answer on screen until the next one arrives, so the view never blinks back
 * to its skeleton; a reload that fails is an error with a retry.
 */
import { useCallback, useEffect, useState } from 'react'
import type { CompetitiveResponse } from '@/lib/keyword-research/competitive-route'
import type { CompetitiveFetch } from './competitive-view'

const DEADLINE_MS = 20_000

export function competitiveUrl(projectId: string): string {
  return `/api/keyword-research/competitive?projectId=${encodeURIComponent(projectId)}`
}

async function read(projectId: string): Promise<CompetitiveResponse | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), DEADLINE_MS)
  try {
    const res = await fetch(competitiveUrl(projectId), { cache: 'no-store', signal: controller.signal })
    if (!res.ok) return null
    const body = await res.json().catch(() => null) as CompetitiveResponse | null
    return body && body.ok === true && body.model ? body : null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

export function useCompetitive(projectId: string): { view: CompetitiveFetch; reload: () => void } {
  const [answer, setAnswer] = useState<{ projectId: string; view: CompetitiveFetch } | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    void read(projectId).then((data) => {
      if (cancelled) return
      setAnswer({ projectId, view: data ? { state: 'ready', data } : { state: 'error' } })
    })
    return () => { cancelled = true }
  }, [projectId, attempt])

  // After an error the retry shows the skeleton; after an answer, the answer stays until the next.
  const reload = useCallback(() => {
    setAnswer((a) => (a && a.view.state === 'error' ? null : a))
    setAttempt((n) => n + 1)
  }, [])
  // Another project's answer is not this one's: until the new one arrives, loading.
  return { view: answer && answer.projectId === projectId ? answer.view : { state: 'loading' }, reload }
}
