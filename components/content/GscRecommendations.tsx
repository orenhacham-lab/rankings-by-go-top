'use client'

/**
 * Stage E2C — client-facing Search Console RECOMMENDATIONS (RTL, Hebrew-first).
 *
 * A small, bounded, plain-language set of page-level recommendations (categories A–D). No raw
 * queries, no numeric scores, no internal terminology, and NO topic creation — GSC new content
 * flows exclusively through the normal topic generator (E3A). The only writes are grouped
 * handled/hide decisions (gated behind NEXT_PUBLIC_GSC_ACTIONS_ENABLED; the route re-checks the
 * authoritative server flag). Each decision applies to every underlying opportunity of the card.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Card } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'

type WindowDays = 28 | 90
const WINDOWS: WindowDays[] = [28, 90]
const ACTIONS_ENABLED = process.env.NEXT_PUBLIC_GSC_ACTIONS_ENABLED === 'true'

type Category = 'improve_ctr' | 'improve_page' | 'internal_links' | 'page_overlap'
type Priority = 'high' | 'good' | 'review'
type ReasonKey = 'high_search_demand' | 'ranks_striking_distance' | 'low_ctr_for_position' | 'has_relevant_page' | 'impressions_split_across_pages'
interface NeedGroup { representativeQuery: string; relatedQueries: string[]; opportunityIds: string[] }
interface InvolvedPage { url: string; impressions: number; clicks: number; isPrimary: boolean }
interface Recommendation {
  id: string; category: Category; priority: Priority; window: number
  affectedPage: string | null; pageLabel: string | null; isHomepage?: boolean
  metrics: { impressions: number; clicks: number; ctr: number; averagePosition: number }
  needGroups: NeedGroup[]; relatedOpportunityIds: string[]
  involvedPages?: InvolvedPage[]; hasClearPrimary?: boolean; reasonKeys: ReasonKey[]
}
interface ApiResponse {
  ok: boolean; state?: 'not_connected' | 'no_property' | 'never_synced' | 'ok'; error?: string
  window?: number; summary?: { actionable: number; affectedPages: number }; recommendations?: Recommendation[]
}
type Dict = ReturnType<typeof getDashboardDictionary>['projectDetail']['contentSection']['gscRecommendations']

const fmtInt = (n: number) => Math.round(n).toLocaleString()
const fmtCtr = (n: number) => `${(n * 100).toFixed(1)}%`
const fmtPos = (n: number) => (n > 0 ? n.toFixed(1) : '—')
const safeDecode = (u: string) => { try { return decodeURI(u) } catch { return u } }
const CATEGORIES: Category[] = ['improve_ctr', 'improve_page', 'internal_links', 'page_overlap']
const OVERLAP_INITIAL = 3

export default function GscRecommendations({ projectId, onToast }: {
  projectId: string; onToast?: (kind: 'success' | 'error', text: string) => void
}) {
  const { language } = useDashboardLanguage()
  const t: Dict = useMemo(() => getDashboardDictionary(language).projectDetail.contentSection.gscRecommendations, [language])

  const [activeWindow, setActiveWindow] = useState<WindowDays>(28)
  const [categoryFilter, setCategoryFilter] = useState<Category | null>(null)
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<ApiResponse | null>(null)
  const [errored, setErrored] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [showAllPages, setShowAllPages] = useState<Record<string, boolean>>({})

  const load = useCallback(async () => {
    setLoading(true); setErrored(false)
    try {
      const res = await fetch(`/api/gsc/recommendations?projectId=${encodeURIComponent(projectId)}&window=${activeWindow}`)
      if (res.status === 404) { setData(null); setErrored(true); return }
      const json = (await res.json()) as ApiResponse
      if (!json.ok) { setErrored(true); setData(null) } else { setData(json) }
    } catch { setErrored(true); setData(null) } finally { setLoading(false) }
  }, [projectId, activeWindow])

  useEffect(() => { load() }, [load])

  async function decide(rec: Recommendation, decision: 'already_covered' | 'irrelevant') {
    setBusyId(rec.id)
    try {
      const res = await fetch('/api/gsc/recommendations/decision', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, window: activeWindow, recommendationId: rec.id, decision }),
      })
      const d = await res.json().catch(() => ({}))
      if (res.ok && d.ok) {
        setData((prev) => prev ? { ...prev, recommendations: (prev.recommendations ?? []).filter((r) => r.id !== rec.id) } : prev)
        onToast?.('success', decision === 'already_covered' ? t.toastHandled : t.toastHidden)
      } else {
        onToast?.('error', (d.counts && d.counts.failed > 0) ? t.toastPartial : t.toastError)
      }
    } catch { onToast?.('error', t.toastError) } finally { setBusyId(null) }
  }

  const state = data?.state
  const recommendations = data?.recommendations ?? []
  const filtered = categoryFilter ? recommendations.filter((r) => r.category === categoryFilter) : recommendations
  const gscHref = `/projects/${projectId}#gsc-section`

  const stateMessage = state === 'not_connected' ? t.stateNotConnected : state === 'no_property' ? t.stateNoProperty : state === 'never_synced' ? t.stateNeverSynced : null
  const stateCta = state === 'not_connected' ? t.ctaConnect : state === 'no_property' ? t.ctaSelectProperty : state === 'never_synced' ? t.ctaSync : null

  const priorityVariant = (p: Priority): 'success' | 'info' | 'neutral' => (p === 'high' ? 'success' : p === 'good' ? 'info' : 'neutral')
  // Deterministic display label: homepage → localized "Homepage"; otherwise the decoded slug label.
  const displayLabel = (r: Recommendation) => (r.isHomepage ? t.homepageLabel : (r.pageLabel ?? t.homepageLabel))
  const cardTitle = (r: Recommendation) => r.category === 'page_overlap' ? t.titles.page_overlap() : t.titles[r.category](displayLabel(r))
  const cardSummary = (r: Recommendation) => r.category === 'improve_ctr' ? t.summaries.improve_ctr(fmtPos(r.metrics.averagePosition), fmtCtr(r.metrics.ctr))
    : r.category === 'improve_page' ? t.summaries.improve_page(fmtPos(r.metrics.averagePosition))
      : r.category === 'internal_links' ? t.summaries.internal_links(fmtPos(r.metrics.averagePosition))
        : t.summaries.page_overlap(r.involvedPages?.length ?? 0)

  return (
    <div dir="rtl">
      <div className="mb-4">
        <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">{t.title}</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{t.subtitle}</p>
      </div>

      {/* Window toggle */}
      <div className="flex items-center gap-2 mb-3">
        {WINDOWS.map((w) => (
          <button key={w} onClick={() => setActiveWindow(w)}
            className={`px-3 h-8 rounded-lg text-xs font-medium transition ${activeWindow === w ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'}`}>
            {w === 28 ? t.window28 : t.window90}
          </button>
        ))}
      </div>

      {loading ? (
        <Card className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">{t.loading}</Card>
      ) : errored ? (
        <Card className="p-6 text-sm text-slate-500 dark:text-slate-400">{t.genericError}</Card>
      ) : stateMessage && stateCta ? (
        <Card className="p-6">
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">{stateMessage}</p>
          <Link href={gscHref} className="inline-flex items-center justify-center h-8 px-3 rounded-lg text-xs font-medium bg-indigo-600 text-white hover:bg-indigo-700 transition">{stateCta}</Link>
        </Card>
      ) : recommendations.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{t.emptyTitle}</p>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{t.emptyBody}</p>
        </Card>
      ) : (
        <>
          {/* Summary strip */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <Card className="p-3"><div className="text-xs text-slate-500 dark:text-slate-400">{t.summaryActionable}</div><div className="text-lg font-semibold text-slate-800 dark:text-slate-100">{data?.summary?.actionable ?? recommendations.length}</div></Card>
            <Card className="p-3"><div className="text-xs text-slate-500 dark:text-slate-400">{t.summaryPages}</div><div className="text-lg font-semibold text-slate-800 dark:text-slate-100">{data?.summary?.affectedPages ?? 0}</div></Card>
          </div>

          {/* Category filter */}
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <button onClick={() => setCategoryFilter(null)} className={`px-3 h-7 rounded-full text-xs font-medium ${!categoryFilter ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'}`}>{t.filterAll}</button>
            {CATEGORIES.map((c) => (
              <button key={c} onClick={() => setCategoryFilter(c)} className={`px-3 h-7 rounded-full text-xs font-medium ${categoryFilter === c ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'}`}>{t.categories[c]}</button>
            ))}
          </div>

          <ul className="space-y-3">
            {filtered.map((r) => {
              const pages = r.involvedPages ?? []
              const shown = showAllPages[r.id] ? pages : pages.slice(0, OVERLAP_INITIAL)
              return (
                <li key={r.id}>
                  <Card className="p-4">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <Badge variant="neutral">{t.categories[r.category]}</Badge>
                      <Badge variant={priorityVariant(r.priority)}>{t.priority[r.priority]}</Badge>
                    </div>
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{cardTitle(r)}</p>
                    <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">{cardSummary(r)}</p>

                    {r.category === 'page_overlap' ? (
                      <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                        <div className="mb-1">{r.hasClearPrimary && r.affectedPage
                          ? <span>{t.overlap.primaryPage}: <a href={r.affectedPage} target="_blank" rel="noopener noreferrer" dir="ltr" className="text-indigo-600 hover:underline">{safeDecode(r.affectedPage)}</a></span>
                          : <span className="text-amber-600 dark:text-amber-400">{t.overlap.noPrimary}</span>}</div>
                        <div className="font-medium text-slate-600 dark:text-slate-300">{t.overlap.involved}:</div>
                        <ul className="mt-1 space-y-0.5">
                          {shown.map((p) => (
                            <li key={p.url} dir="ltr" className="flex items-center justify-between gap-2">
                              <a href={p.url} target="_blank" rel="noopener noreferrer" className={`truncate ${p.isPrimary ? 'font-semibold text-indigo-600' : 'text-slate-500'} hover:underline`}>{safeDecode(p.url)}</a>
                              <span className="shrink-0 text-slate-400">{fmtInt(p.impressions)}</span>
                            </li>
                          ))}
                        </ul>
                        {pages.length > OVERLAP_INITIAL && (
                          <button onClick={() => setShowAllPages((s) => ({ ...s, [r.id]: !s[r.id] }))} className="mt-1 text-indigo-600 hover:underline">{showAllPages[r.id] ? t.overlap.showLess : t.overlap.showAll}</button>
                        )}
                        <div className="mt-1 text-amber-600 dark:text-amber-400">{t.overlap.signalOnly}</div>
                      </div>
                    ) : (
                      r.affectedPage && (
                        <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                          {t.affectedPage}: <a href={r.affectedPage} target="_blank" rel="noopener noreferrer" dir="ltr" className="text-indigo-600 hover:underline">{safeDecode(r.affectedPage)}</a>
                        </div>
                      )
                    )}

                    {/* Metrics */}
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                      <span>{t.metricImpressions}: {fmtInt(r.metrics.impressions)}</span>
                      <span>{t.metricClicks}: {fmtInt(r.metrics.clicks)}</span>
                      {r.category === 'improve_ctr' && <span>{t.metricCtr}: {fmtCtr(r.metrics.ctr)}</span>}
                      <span>{t.metricPosition}: {fmtPos(r.metrics.averagePosition)}</span>
                    </div>

                    {/* Why (expandable) */}
                    <button onClick={() => setExpanded((e) => ({ ...e, [r.id]: !e[r.id] }))} className="mt-2 text-xs font-medium text-indigo-600 hover:underline">
                      {t.whyLabel}
                    </button>
                    {expanded[r.id] && (
                      <div className="mt-1.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 p-2.5 text-xs text-slate-600 dark:text-slate-300 space-y-1.5">
                        <ul className="list-disc pr-4 space-y-0.5">
                          {r.reasonKeys.map((k) => <li key={k}>{t.reasons[k]}</li>)}
                        </ul>
                        {r.needGroups.length > 0 && (
                          <div>
                            <span className="font-medium">{t.needGroupsLabel}: </span>
                            {r.needGroups.flatMap((g) => [g.representativeQuery, ...g.relatedQueries]).slice(0, 12).join(' · ')}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Actions — the primary button only ever opens an external page URL, so its
                        label says exactly that. A/B/C open the affected page; page-overlap opens the
                        primary page ONLY when one is clearly identified (else the involved page links
                        above are the only way in — no arbitrary "first page" button). */}
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {r.category !== 'page_overlap' && r.affectedPage && (
                        <a href={r.affectedPage} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center h-8 px-3 rounded-lg text-xs font-medium bg-indigo-600 text-white hover:bg-indigo-700 transition">{t.openPage}</a>
                      )}
                      {r.category === 'page_overlap' && r.hasClearPrimary && r.affectedPage && (
                        <a href={r.affectedPage} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center h-8 px-3 rounded-lg text-xs font-medium bg-indigo-600 text-white hover:bg-indigo-700 transition">{t.openPrimary}</a>
                      )}
                      {ACTIONS_ENABLED && (
                        <>
                          {r.category !== 'page_overlap' && (
                            <Button variant="secondary" onClick={() => decide(r, 'already_covered')} disabled={busyId === r.id}>{busyId === r.id ? t.busy : t.markHandled}</Button>
                          )}
                          <Button variant="ghost" onClick={() => decide(r, 'irrelevant')} disabled={busyId === r.id}>{busyId === r.id ? t.busy : t.hide}</Button>
                        </>
                      )}
                    </div>
                  </Card>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </div>
  )
}
