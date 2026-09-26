'use client'

/**
 * The CURRENT project's own row, for a screen that needs more than its id and
 * name: the domain, the country, the scan settings.
 *
 * Every per-project screen used to get this from the project page, which loaded
 * it once for all of its sections. Those sections are tabs now, so each tab loads
 * the row through this one hook, with the rules that page had earned:
 *
 *  - every call is bounded, so a hanging request ends in an error, never in a
 *    spinner that does not end;
 *  - a failure is a TERMINAL state the screen can offer a retry for;
 *  - a row that does not come back (deleted, or not yours: RLS answers both the
 *    same way) is `missing`, which is a different fact from `error`;
 *  - a reload of the row already on screen keeps it on screen while it refetches,
 *    so saving a form does not blank the page it sits on.
 *
 * Authorization is never derived from this: RLS scopes the read, and every route
 * a screen calls keeps its own ownership check.
 */
import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Project } from '@/lib/supabase/types'

/** Long enough that a healthy-but-busy request still succeeds, short enough that
 *  a person is told something is wrong instead of watching a spinner. */
export const PROJECT_ROW_DEADLINE_MS = 15000

/** Resolves to the work's result, or to null when it fails or outlives `ms`. */
export function withDeadline<T>(work: PromiseLike<T>, ms = PROJECT_ROW_DEADLINE_MS): Promise<T | null> {
  return Promise.race([
    Promise.resolve(work).catch(() => null),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ])
}

export type ProjectRowStatus = 'loading' | 'ready' | 'missing' | 'error'

/** What the last finished read of a project said, and which attempt it answered. */
export interface RowRead {
  projectId: string
  attempt: number
  row: Project | null
  failed: boolean
}

export function useProjectRow(projectId: string | null) {
  const [read, setRead] = useState<RowRead | null>(null)
  const [attempt, setAttempt] = useState(0)

  // State is written only when a read finishes; everything a screen sees is
  // derived below from the last read and the project it is for.
  useEffect(() => {
    if (!projectId) return
    let cancelled = false
    void withDeadline(createClient().from('projects').select('*').eq('id', projectId).maybeSingle())
      .then((res) => {
        if (cancelled) return
        if (!res || res.error) {
          // A failed REFRESH keeps the row that is already on screen; only a read
          // with nothing to show ends in the error state.
          setRead((prev) => (prev && prev.projectId === projectId && prev.row
            ? { ...prev, attempt }
            : { projectId, attempt, row: null, failed: true }))
          return
        }
        setRead({ projectId, attempt, row: (res.data as Project | null) ?? null, failed: false })
      })
    return () => { cancelled = true }
  }, [projectId, attempt])

  const reload = useCallback(() => setAttempt((n) => n + 1), [])

  return { ...deriveRow(projectId, read, attempt), reload }
}

/**
 * What a screen is shown. Never the PREVIOUS project's row during the render in
 * which the switcher has already moved on, and a retry after a failure reads as
 * loading again rather than as the same failure.
 */
export function deriveRow(projectId: string | null, read: RowRead | null, attempt: number): { project: Project | null; status: ProjectRowStatus } {
  if (!projectId) return { project: null, status: 'missing' }
  if (!read || read.projectId !== projectId) return { project: null, status: 'loading' }
  if (read.failed) return { project: null, status: read.attempt === attempt ? 'error' : 'loading' }
  if (!read.row) return { project: null, status: read.attempt === attempt ? 'missing' : 'loading' }
  return { project: read.row, status: 'ready' }
}
