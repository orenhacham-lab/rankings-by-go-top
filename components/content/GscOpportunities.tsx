'use client'

/**
 * Stage E2A — read-only "Search Console ideas" surface (RTL, Hebrew-first).
 *
 * Diagnostic/observability ONLY. It displays deterministic opportunity intelligence derived
 * from the latest succeeded GSC sync run. There are NO action buttons in Stage E2A — no
 * create-topic / approve / reject / queue / generate / publish / edit. It never mutates any
 * content item and never calls the recommendation engine.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Lightbulb, AlertTriangle } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'

type WindowDays = 28 | 90
const WINDOWS: WindowDays[] = [28, 90]
const PAGE_SIZE = 25

type OpportunityType = 'improve_existing_page' | 'improve_title_meta_ctr' | 'supporting_content_candidate' | 'internal_link_support_candidate' | 'multi_page_signal'
interface ReasonCode { code: string; detail: string; value?: number }
interface ContentMatch { source: string; matchType: string; confidence: number; reference: string; matchedUrl: string | null }
interface Opportunity {
  id: string; primaryQuery: string; relatedQueries: string[]; page: string; pageType: string; queryIntent: string
  clicks: number; impressions: number; ctr: number; averagePosition: number; distinctPageCount: number
  opportunityType: OpportunityType; opportunityScore: number; reasons: ReasonCode[]; existingContentMatch: ContentMatch | null
}
interface ApiResponse {
  ok: boolean; state?: 'not_connected' | 'no_property' | 'never_synced' | 'ok'; error?: string
  window?: number; run?: { syncRunId: string; dateStart: string | null; dateEnd: string | null }
  total?: number; page?: number; pageSize?: number; typeCounts?: Record<string, number>; opportunities?: Opportunity[]
}

type Dict = ReturnType<typeof getDashboardDictionary>['projectDetail']['contentSection']['gscOpportunities']

const fmtInt = (n: number) => Math.round(n).toLocaleString()
const fmtCtr = (n: number) => `${(n * 100).toFixed(2)}%`
const fmtPos = (n: number) => (n > 0 ? n.toFixed(1) : '—')

export default function GscOpportunities({ projectId }: { projectId: string }) {
  const { language } = useDashboardLanguage()
  const t: Dict = useMemo(() => getDashboardDictionary(language).projectDetail.contentSection.gscOpportunities, [language])

  const [activeWindow, setActiveWindow] = useState<WindowDays>(28)
  const [typeFilter, setTypeFilter] = useState<OpportunityType | null>(null)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<ApiResponse | null>(null)
  const [errored, setErrored] = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setErrored(false)
    try {
      const params = new URLSearchParams({ projectId, window: String(activeWindow), page: String(page), pageSize: String(PAGE_SIZE) })
      if (typeFilter) params.set('type', typeFilter)
      const res = await fetch(`/api/gsc/opportunities?${params.toString()}`)
      if (res.status === 404) { setData(null); setErrored(true); return }
      const json = (await res.json()) as ApiResponse
      if (!json.ok) { setErrored(true); setData(null) } else { setData(json) }
    } catch { setErrored(true); setData(null) } finally { setLoading(false) }
  }, [projectId, activeWindow, typeFilter, page])

  useEffect(() => { load() }, [load])
  // Reset pagination when the window or the type filter changes.
  useEffect(() => { setPage(0) }, [activeWindow, typeFilter])

  const reasonText = (r: ReasonCode) => (t.reasons as Record<string, string>)[r.code] ?? r.detail
  const typeLabel = (ty: string) => (t.types as Record<string, string>)[ty] ?? ty
  const intentLabel = (i: string) => (t.intents as Record<string, string>)[i] ?? i
  const pageTypeLabel = (p: string) => (t.pageTypes as Record<string, string>)[p] ?? p

  const state = data?.state
  const opportunities = data?.opportunities ?? []
  const total = data?.total ?? 0
  const typeCounts = data?.typeCounts ?? {}
  const allTypes: OpportunityType[] = ['improve_existing_page', 'improve_title_meta_ctr', 'supporting_content_candidate', 'internal_link_support_candidate', 'multi_page_signal']

  const scoreBadgeVariant = (s: number): 'success' | 'info' | 'neutral' => (s >= 66 ? 'success' : s >= 33 ? 'info' : 'neutral')

  return (
    <Card className="hover:translate-y-0">
      <div className="flex items-center gap-2 mb-1">
        <Lightbulb size={18} className="text-amber-500 dark:text-amber-400" />
        <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">{t.title}</h3>
      </div>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">{t.subtitle}</p>

      {/* Window toggle */}
      <div className="flex gap-2 mb-3">
        {WINDOWS.map((w) => (
          <button key={w} type="button" onClick={() => setActiveWindow(w)}
            className={`text-xs px-3 py-1.5 rounded-lg border ${activeWindow === w ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'}`}>
            {w === 28 ? t.window28 : t.window90}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 py-6">
          <span className="inline-block w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          {t.loading}
        </div>
      ) : errored ? (
        <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-3 py-2 text-sm text-red-700 dark:text-red-300">{t.apiError}</div>
      ) : state === 'not_connected' ? (
        <div className="text-sm text-slate-500 dark:text-slate-400 py-4">{t.notConnected}</div>
      ) : state === 'no_property' ? (
        <div className="text-sm text-slate-500 dark:text-slate-400 py-4">{t.noProperty}</div>
      ) : state === 'never_synced' ? (
        <div className="text-sm text-slate-500 dark:text-slate-400 py-4">{t.neverSynced}</div>
      ) : (
        <div className="space-y-3">
          {/* Type filter chips (with counts) */}
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setTypeFilter(null)}
              className={`text-xs px-2.5 py-1 rounded-full border ${typeFilter === null ? 'bg-slate-800 text-white border-slate-800 dark:bg-slate-100 dark:text-slate-900' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'}`}>
              {t.filterAll}
            </button>
            {allTypes.filter((ty) => (typeCounts[ty] ?? 0) > 0 || typeFilter === ty).map((ty) => (
              <button key={ty} type="button" onClick={() => setTypeFilter(ty)}
                className={`text-xs px-2.5 py-1 rounded-full border ${typeFilter === ty ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'}`}>
                {typeLabel(ty)}{typeCounts[ty] ? ` (${typeCounts[ty]})` : ''}
              </button>
            ))}
          </div>

          {opportunities.length === 0 ? (
            <div className="text-sm text-slate-500 dark:text-slate-400 py-4">{t.noRows}</div>
          ) : (
            <ul className="space-y-3">
              {opportunities.map((o) => (
                <li key={o.id} className="rounded-lg border border-slate-200 dark:border-slate-700 p-3">
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <Badge variant={scoreBadgeVariant(o.opportunityScore)}>{t.scoreLabel}: {o.opportunityScore}</Badge>
                    <Badge variant="info">{typeLabel(o.opportunityType)}</Badge>
                    <Badge variant="neutral">{intentLabel(o.queryIntent)}</Badge>
                    <Badge variant="neutral">{pageTypeLabel(o.pageType)}</Badge>
                    {o.distinctPageCount > 1 && <Badge variant="warning">{t.distinctPages}: {o.distinctPageCount}</Badge>}
                  </div>

                  <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">{o.primaryQuery}</div>
                  {o.relatedQueries.length > 0 && (
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{t.colRelated}: {o.relatedQueries.join(' · ')}</div>
                  )}
                  <div className="text-xs font-mono text-slate-500 dark:text-slate-400 mt-1 truncate" dir="ltr">{o.page}</div>

                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-300 mt-2">
                    <span>{t.colClicks}: <span className="tabular-nums font-medium">{fmtInt(o.clicks)}</span></span>
                    <span>{t.colImpressions}: <span className="tabular-nums font-medium">{fmtInt(o.impressions)}</span></span>
                    <span>{t.colCtr}: <span className="tabular-nums font-medium">{fmtCtr(o.ctr)}</span></span>
                    <span>{t.colPosition}: <span className="tabular-nums font-medium">{fmtPos(o.averagePosition)}</span></span>
                  </div>

                  {/* Why identified — explanation, not just a number */}
                  <div className="mt-2">
                    <div className="text-xs font-medium text-slate-500 dark:text-slate-400">{t.whyLabel}</div>
                    <ul className="mt-1 flex flex-wrap gap-1.5">
                      {o.reasons.map((r, i) => (
                        <li key={`${o.id}-${r.code}-${i}`} className="text-[11px] px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                          {reasonText(r)}
                        </li>
                      ))}
                    </ul>
                    {o.opportunityType === 'multi_page_signal' && (
                      <div className="mt-1 text-[11px] text-amber-600 dark:text-amber-400 inline-flex items-center gap-1"><AlertTriangle size={11} />{t.multiPageNote}</div>
                    )}
                  </div>

                  {/* Existing-content match */}
                  <div className="mt-2 text-xs">
                    {o.existingContentMatch ? (
                      <span className="text-emerald-700 dark:text-emerald-400">{t.matchLabel}: <span className="font-medium">{o.existingContentMatch.reference}</span></span>
                    ) : (
                      <span className="text-slate-400 dark:text-slate-500">{t.noMatch}</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}

          <p className="text-[11px] text-slate-400 dark:text-slate-500">{t.scoreExplained}</p>

          {/* Pagination */}
          {total > PAGE_SIZE && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-slate-500 dark:text-slate-400">{t.pageOf(page * PAGE_SIZE + 1, Math.min((page + 1) * PAGE_SIZE, total), total)}</span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={page === 0 || loading} onClick={() => setPage((p) => Math.max(0, p - 1))}>{t.prevPage}</Button>
                <Button size="sm" variant="outline" disabled={(page + 1) * PAGE_SIZE >= total || loading} onClick={() => setPage((p) => p + 1)}>{t.nextPage}</Button>
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  )
}
