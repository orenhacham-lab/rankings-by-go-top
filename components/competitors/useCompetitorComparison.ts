'use client'

/**
 * The data behind "you vs. your competitors": the project's tracked competitors
 * and the positions the rank scan recorded for them, paired with the keyword
 * checks a screen already shows (lib/competitors/comparison.ts does the math).
 *
 * Every read is bounded and every failure is a state the screen can show and
 * retry, never an endless spinner and never a thrown error. A reload keeps the
 * last answer on screen until the next one arrives, so a rescan does not blank
 * the summary or the competitor lines in the table; if the next one cannot be
 * read, that is an error with a retry (competitorViewStatus).
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { withDeadline } from '@/lib/active-project/useProjectRow'
import {
  buildCompetitorComparison, trackedCompetitorsFrom,
  type CompetitorComparison, type CompetitorPositionRow, type OwnCheck, type TrackedCompetitor,
} from '@/lib/competitors/comparison'

/** Keywords per positions read: with at most one check each, the rows stay far under PostgREST's page. */
const TARGETS_PER_READ = 10
const COMPETITOR_LIST_DEADLINE_MS = 15_000

export type CompetitorViewStatus = 'loading' | 'no_competitors' | 'error' | 'ready'

export interface CompetitorView {
  status: CompetitorViewStatus
  competitors: TrackedCompetitor[]
  comparison: CompetitorComparison | null
  /** Where competitors are managed today, or null when that screen is not available. */
  manageHref: string | null
  retry: () => void
}

type ListOutcome = { status: 'ok'; competitors: TrackedCompetitor[] } | { status: 'unavailable' } | { status: 'error' }

/** The project's competitors, through the route that manages them (it checks ownership). */
async function fetchTrackedCompetitors(projectId: string): Promise<ListOutcome> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), COMPETITOR_LIST_DEADLINE_MS)
  try {
    const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/ai-visibility/competitors`, {
      signal: controller.signal, cache: 'no-store',
    })
    // 404: the feature is switched off (or the project is gone); 403: not the
    // owner. Either way there is nothing to compare, which is not an error.
    if (res.status === 404 || res.status === 403) return { status: 'unavailable' }
    if (!res.ok) return { status: 'error' }
    const body = await res.json().catch(() => null) as { competitors?: unknown } | null
    const rows = Array.isArray(body?.competitors) ? body.competitors as Array<Record<string, unknown>> : null
    return rows ? { status: 'ok', competitors: trackedCompetitorsFrom(rows) } : { status: 'error' }
  } catch {
    return { status: 'error' }
  } finally {
    clearTimeout(timer)
  }
}

/** The recorded rows for exactly these checks; null when any read fails. */
async function fetchCompetitorRows(
  checks: readonly OwnCheck[],
  domains: readonly string[],
): Promise<CompetitorPositionRow[] | null> {
  const wanted = checks.filter((c) => c.engine === 'google_search' && c.checkedAt)
  if (wanted.length === 0 || domains.length === 0) return []
  const supabase = createClient()
  const reads: Array<Promise<CompetitorPositionRow[] | null>> = []
  for (let i = 0; i < wanted.length; i += TARGETS_PER_READ) {
    const chunk = wanted.slice(i, i + TARGETS_PER_READ)
    reads.push(withDeadline(
      supabase
        .from('keyword_competitor_positions')
        .select('tracking_target_id, competitor_domain, position, url, checked_at')
        .in('tracking_target_id', chunk.map((c) => c.targetId))
        .in('checked_at', [...new Set(chunk.map((c) => c.checkedAt as string))])
        .in('competitor_domain', [...domains])
        .limit(1000),
    ).then((res) => (!res || res.error ? null : (res.data ?? []) as CompetitorPositionRow[])))
  }
  const parts = await Promise.all(reads)
  return parts.some((p) => p === null) ? null : parts.flat() as CompetitorPositionRow[]
}

function manageHref(): string | null {
  return process.env.NEXT_PUBLIC_ENABLE_AI_VISIBILITY === 'true' ? '/ai-visibility?tab=competitors' : null
}

/**
 * The state the screens show. A comparison read for EARLIER checks (before a
 * rescan, an edit, a keyword added) stays on screen only while the read for the
 * checks now on screen is on its way. Once that read has failed, keeping it
 * would put the previous check's competitors under the new positions, and a
 * keyword added since would show its loading line forever: that is an error,
 * with a retry.
 */
export function competitorViewStatus(s: {
  list: ListOutcome | null
  competitorCount: number
  hasComparison: boolean
  /** The comparison on screen was read for the checks on screen now. */
  comparisonCurrent: boolean
  rowsFailed: boolean
}): CompetitorViewStatus {
  if (!s.list) return 'loading'
  if (s.list.status === 'error') return 'error'
  if (s.list.status === 'unavailable' || s.competitorCount === 0) return 'no_competitors'
  if (s.rowsFailed && !(s.hasComparison && s.comparisonCurrent)) return 'error'
  return s.hasComparison ? 'ready' : 'loading'
}

/**
 * For a screen that already holds the keywords and their latest checks (the
 * keywords tab). `checksReady` is false while those are still loading.
 */
export function useCompetitorComparison(projectId: string, checks: readonly OwnCheck[], checksReady: boolean): CompetitorView {
  const [list, setList] = useState<ListOutcome | null>(null)
  const [listAttempt, setListAttempt] = useState(0)
  const [snapshot, setSnapshot] = useState<{ checks: readonly OwnCheck[]; rows: CompetitorPositionRow[] } | null>(null)
  const [rowsFailed, setRowsFailed] = useState(false)
  const [rowsAttempt, setRowsAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    void fetchTrackedCompetitors(projectId).then((outcome) => { if (!cancelled) setList(outcome) })
    return () => { cancelled = true }
  }, [projectId, listAttempt])

  const competitors = useMemo(() => (list?.status === 'ok' ? list.competitors : []), [list])

  // Re-read whenever the checks on screen change (a rescan, an edit). The rows
  // are kept together with the checks they were read for, so the table never
  // pairs a new check with rows read for the previous one.
  useEffect(() => {
    if (!checksReady || competitors.length === 0) return
    let cancelled = false
    void fetchCompetitorRows(checks, competitors.map((c) => c.domain)).then((rows) => {
      if (cancelled) return
      if (rows === null) { setRowsFailed(true); return }
      setRowsFailed(false)
      setSnapshot({ checks, rows })
    })
    return () => { cancelled = true }
  }, [checks, competitors, checksReady, rowsAttempt])

  const comparison = useMemo(
    () => (snapshot ? buildCompetitorComparison({ competitors, checks: snapshot.checks, rows: snapshot.rows }) : null),
    [competitors, snapshot],
  )

  const retry = useCallback(() => {
    setRowsFailed(false)
    if (list?.status === 'error') { setList(null); setListAttempt((n) => n + 1) }
    else setRowsAttempt((n) => n + 1)
  }, [list?.status])

  const status = competitorViewStatus({
    list, competitorCount: competitors.length, hasComparison: comparison !== null,
    comparisonCurrent: snapshot?.checks === checks, rowsFailed,
  })

  return { status, competitors, comparison, manageHref: manageHref(), retry }
}

/**
 * For a screen that does not hold the keywords (the dashboard): reads the
 * project's keywords and their latest checks itself, the way the keywords tab
 * does, then compares the same way.
 */
export function useProjectCompetitorComparison(projectId: string): CompetitorView {
  const [checks, setChecks] = useState<OwnCheck[]>([])
  const [checksReady, setChecksReady] = useState(false)
  const [checksFailed, setChecksFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const supabase = createClient()
      const targetsRes = await withDeadline(
        supabase.from('tracking_targets').select('id, engine_type').eq('project_id', projectId))
      if (cancelled) return
      if (!targetsRes || targetsRes.error) { setChecksFailed(true); return }
      const targets = (targetsRes.data ?? []) as Array<{ id: string; engine_type: string }>
      const latest = new Map<string, { found: boolean; position: number | null; checked_at: string }>()
      if (targets.length > 0) {
        const resultsRes = await withDeadline(
          supabase
            .from('scan_results')
            .select('tracking_target_id, found, position, checked_at')
            .in('tracking_target_id', targets.map((t) => t.id))
            .order('checked_at', { ascending: false }))
        if (cancelled) return
        if (!resultsRes || resultsRes.error) { setChecksFailed(true); return }
        for (const r of (resultsRes.data ?? []) as Array<{ tracking_target_id: string; found: boolean; position: number | null; checked_at: string }>) {
          if (!latest.has(r.tracking_target_id)) latest.set(r.tracking_target_id, r)
        }
      }
      setChecks(targets.map((t) => {
        const r = latest.get(t.id)
        return { targetId: t.id, engine: t.engine_type, checkedAt: r?.checked_at ?? null, found: !!r?.found, position: r?.position ?? null }
      }))
      setChecksFailed(false)
      setChecksReady(true)
    })()
    return () => { cancelled = true }
  }, [projectId, attempt])

  const view = useCompetitorComparison(projectId, checks, checksReady)
  const { retry: retryView } = view
  const retry = useCallback(() => {
    if (checksFailed) { setChecksFailed(false); setAttempt((n) => n + 1) }
    retryView()
  }, [checksFailed, retryView])

  // A keyword read that failed only matters when there are competitors to compare.
  if (checksFailed && view.status !== 'no_competitors') return { ...view, status: 'error', retry }
  return { ...view, retry }
}
