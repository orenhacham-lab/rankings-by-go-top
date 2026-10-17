'use client'

/**
 * The project's audiences as the owner keeps them (project_audiences: the scan fills
 * them, the owner edits them in the project settings), in their order. One read, under
 * the owner's own session (RLS), with the project named in the filter; no route, no
 * model. `null` until it answers, and also when it cannot be read: the screens then use
 * the audiences the scan's summary carries.
 */
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { withDeadline } from '@/lib/active-project/useProjectRow'

export const MAX_AUDIENCES = 10

export function readAudienceRows(rows: unknown): string[] {
  if (!Array.isArray(rows)) return []
  return rows
    .filter((r): r is { label: string; position?: unknown } => !!r && typeof r === 'object' && typeof (r as { label?: unknown }).label === 'string')
    .sort((a, b) => (Number(a.position) || 0) - (Number(b.position) || 0))
    .map((r) => r.label.trim())
    .filter(Boolean)
    .slice(0, MAX_AUDIENCES)
}

export function useProjectAudiences(projectId: string | null): string[] | null {
  const [state, setState] = useState<{ projectId: string; labels: string[] | null } | null>(null)
  useEffect(() => {
    if (!projectId) return
    let cancelled = false
    void (async () => {
      try {
        const res = await withDeadline(
          createClient().from('project_audiences').select('label, position').eq('project_id', projectId).order('position', { ascending: true }).limit(MAX_AUDIENCES),
        )
        if (cancelled) return
        setState({ projectId, labels: !res || res.error ? null : readAudienceRows(res.data) })
      } catch {
        if (!cancelled) setState({ projectId, labels: null })
      }
    })()
    return () => { cancelled = true }
  }, [projectId])
  return state && state.projectId === projectId ? state.labels : null
}
