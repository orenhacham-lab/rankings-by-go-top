'use client'

/**
 * The tracked keywords the site already ranks 4 to 20 for, as ideas for the board
 * (lib/content/strategy/board.ts rankingIdeas). They need no scan, so a project
 * older than the scan has ideas from its own data too (part B of the UX review).
 *
 * Two reads through the owner's own session, so row-level security scopes them to
 * the owner, exactly like the dashboard's rankings: the project's tracked keywords,
 * then their checks. Nothing is written and nothing outside the database is asked.
 * A read that fails or stalls is no ideas, never an error on the tab.
 */
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { withDeadline } from '@/lib/active-project/useProjectRow'
import { rankingIdeas, type RankingResultRow, type RankingTargetRow, type StrategyRanking } from '@/lib/content/strategy/board'

/** Checks read per project: the newest ones, enough for every tracked keyword's last check. */
export const RANKING_RESULTS_READ = 1000
const NONE: StrategyRanking[] = []

async function readRankingIdeas(projectId: string): Promise<StrategyRanking[]> {
  const db = createClient()
  const targets = await withDeadline(
    db.from('tracking_targets').select('id, keyword, is_active, engine_type').eq('project_id', projectId),
  )
  if (!targets || targets.error || !Array.isArray(targets.data) || targets.data.length === 0) return NONE
  const rows = targets.data as RankingTargetRow[]
  const results = await withDeadline(
    db.from('scan_results')
      .select('tracking_target_id, position, found, checked_at')
      .in('tracking_target_id', rows.map((t) => t.id))
      .order('checked_at', { ascending: false })
      .limit(RANKING_RESULTS_READ),
  )
  if (!results || results.error || !Array.isArray(results.data)) return NONE
  return rankingIdeas(rows, results.data as RankingResultRow[])
}

export function useRankingIdeas(projectId: string): StrategyRanking[] {
  // Tagged with its project, so another project's ideas are never shown under this one.
  const [state, setState] = useState<{ projectId: string; ideas: StrategyRanking[] }>({ projectId: '', ideas: NONE })
  useEffect(() => {
    if (!projectId) return
    let cancelled = false
    void readRankingIdeas(projectId)
      .catch(() => NONE)
      .then((ideas) => { if (!cancelled) setState({ projectId, ideas }) })
    return () => { cancelled = true }
  }, [projectId])
  return state.projectId === projectId ? state.ideas : NONE
}
