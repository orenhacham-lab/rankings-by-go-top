'use client'

/**
 * What the content strategy tab knows about each topic beyond its title: the research's
 * figures for its keyword (GET /api/keyword-research/scan, the same cache-only read the
 * research tab makes: no Google Ads, Serper or model call) and the project's audiences
 * (project_audiences under the owner's session, or the scan's own list). Read once per
 * project; until it answers, or when it cannot be read, the board simply shows no facts.
 */
import { useEffect, useMemo, useState } from 'react'
import { insightContext, type InsightContext, type ResearchFact } from '@/lib/content/strategy/insights'
import { useProjectAudiences } from '@/components/keyword-research/useProjectAudiences'

export const INSIGHTS_ENDPOINT = (projectId: string) => `/api/keyword-research/scan?projectId=${encodeURIComponent(projectId)}`

/** The route's answer → the facts the tab uses; anything unreadable is left out. */
export function readResearchFacts(ok: boolean, body: unknown): ResearchFact[] {
  if (!ok || !body || typeof body !== 'object' || (body as { ok?: unknown }).ok !== true) return []
  const list = (body as { keywords?: unknown }).keywords
  if (!Array.isArray(list)) return []
  const out: ResearchFact[] = []
  for (const k of list) {
    if (!k || typeof k !== 'object') continue
    const r = k as Record<string, unknown>
    if (typeof r.keyword !== 'string' || !r.keyword.trim() || r.relevant === false) continue
    const v = typeof r.avgMonthlySearches === 'number' && Number.isFinite(r.avgMonthlySearches) && r.avgMonthlySearches >= 0 ? r.avgMonthlySearches : null
    const c = r.competition === 'LOW' || r.competition === 'MEDIUM' || r.competition === 'HIGH' ? r.competition : null
    const competitors = Array.isArray(r.competitors) ? r.competitors.filter((d): d is string => typeof d === 'string' && d.length <= 253).slice(0, 10) : []
    out.push({ keyword: r.keyword.trim(), avgMonthlySearches: v, competition: c, competitors })
  }
  return out
}

export function useStrategyInsights(projectId: string, scanAudiences: readonly string[] | undefined): { ctx: InsightContext | null; research: ResearchFact[] } {
  const [state, setState] = useState<{ projectId: string; research: ResearchFact[] } | null>(null)
  const ownAudiences = useProjectAudiences(projectId || null)

  useEffect(() => {
    if (!projectId) return
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch(INSIGHTS_ENDPOINT(projectId), { cache: 'no-store' })
        const body = await res.json().catch(() => null)
        if (!cancelled) setState({ projectId, research: readResearchFacts(res.ok, body) })
      } catch {
        if (!cancelled) setState({ projectId, research: [] })
      }
    })()
    return () => { cancelled = true }
  }, [projectId])

  const research = useMemo(() => (state && state.projectId === projectId ? state.research : []), [state, projectId])
  const labels = ownAudiences && ownAudiences.length > 0 ? ownAudiences : scanAudiences ?? []
  const labelsKey = labels.join('\n')
  const ctx = useMemo(
    () => (state && state.projectId === projectId ? insightContext(research, labelsKey ? labelsKey.split('\n') : []) : null),
    [state, projectId, research, labelsKey],
  )
  return { ctx, research }
}
