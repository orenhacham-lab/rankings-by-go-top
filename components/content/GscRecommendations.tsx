'use client'

/**
 * Stage E2C — client-facing Search Console RECOMMENDATIONS.
 *
 * A section of the Topics screen now that Search Console is not a screen of its own.
 * It is always there with its title; until Search Console can feed it, it says what it
 * will show and offers the one step that is missing (the shared status decides which),
 * and it asks for recommendations only once there is a sync to build them from. With
 * Search Console switched off on the server there is no step to offer, and no section
 * (its spacing and separator are its own, so none is left behind). It follows the
 * screen's direction (Hebrew right to left, English left to right).
 *
 * A small, bounded, plain-language set of page-level recommendations (categories A–D). No raw
 * queries, no numeric scores, no internal terminology, and NO topic creation — GSC new content
 * flows exclusively through the normal topic generator (E3A). The only writes are grouped
 * handled/hide decisions (gated behind NEXT_PUBLIC_GSC_ACTIONS_ENABLED; the route re-checks the
 * authoritative server flag). Each decision applies to every underlying opportunity of the card.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { settingsGscHref } from '@/lib/content/content-hub-setup'
import { Card } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import StatTile from '@/components/ui/StatTile'
import EmptyState from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { Lightbulb } from 'lucide-react'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import GscSetupPrompt, { GscLoadError, GscLoading } from '@/components/gsc/GscSetupPrompt'
import { useGscStatus } from '@/components/gsc/gsc-data'
import { isGscSetupState } from '@/lib/gsc/widget-state'

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

/** An external link that looks like the small primary button (it opens a page, so it stays an <a>). */
const LINK_BUTTON = 'inline-flex h-8 items-center justify-center rounded-control bg-action px-3 text-caption font-semibold text-action-ink shadow-[inset_0_1px_0_rgb(255_255_255/0.14),0_1px_2px_rgb(20_24_60/0.18)] transition-colors duration-150 hover:bg-action-hover'
/** A filter chip: quiet until chosen, then the soft accent. */
const chip = (on: boolean) => `inline-flex h-7 items-center rounded-pill border px-3 text-caption font-semibold transition-colors duration-150 ${on ? 'border-action/30 bg-action-soft text-action' : 'border-line bg-surface text-body hover:border-line-strong hover:text-ink'}`

export default function GscRecommendations({ projectId, onToast, className }: {
  projectId: string; onToast?: (kind: 'success' | 'error', text: string) => void; className?: string
}) {
  const { language } = useDashboardLanguage()
  const t: Dict = useMemo(() => getDashboardDictionary(language).projectDetail.contentSection.gscRecommendations, [language])
  const w = useMemo(() => getDashboardDictionary(language).gscWidgets.recommendations, [language])
  // Whether there is anything to read at all: connection, property and a sync.
  const gsc = useGscStatus(projectId)
  const gscReady = gsc.view.state === 'ready'

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

  useEffect(() => { if (gscReady) load() }, [load, gscReady])

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
  const gscHref = settingsGscHref(projectId)

  const stateMessage = state === 'not_connected' ? t.stateNotConnected : state === 'no_property' ? t.stateNoProperty : state === 'never_synced' ? t.stateNeverSynced : null
  const stateCta = state === 'not_connected' ? t.ctaConnect : state === 'no_property' ? t.ctaSelectProperty : state === 'never_synced' ? t.ctaSync : null

  const priorityVariant = (p: Priority): 'success' | 'info' | 'neutral' => (p === 'high' ? 'success' : p === 'good' ? 'info' : 'neutral')
  // Deterministic display label: homepage → localized "Homepage"; otherwise the decoded slug label.
  const displayLabel = (r: Recommendation) => (r.isHomepage ? t.homepageLabel : (r.pageLabel ?? t.homepageLabel))
  const cardTitle = (r: Recommendation) => r.category === 'page_overlap' ? t.titles.page_overlap() : t.titles[r.category](displayLabel(r))
  const cardSummary = (r: Recommendation) => r.category === 'improve_ctr' ? t.summaries.improve_ctr(fmtPos(r.metrics.averagePosition), fmtCtr(r.metrics.ctr))
    // Area N — an improve_page card only claims a CTR gap (with the real figure) when the
    // opportunity actually emitted low_ctr_for_position; otherwise the neutral base copy.
    : r.category === 'improve_page' ? (r.reasonKeys.includes('low_ctr_for_position')
      ? t.summaries.improve_page_low_ctr(fmtPos(r.metrics.averagePosition), fmtCtr(r.metrics.ctr))
      : t.summaries.improve_page(fmtPos(r.metrics.averagePosition)))
      : r.category === 'internal_links' ? t.summaries.internal_links(fmtPos(r.metrics.averagePosition))
        : t.summaries.page_overlap(r.involvedPages?.length ?? 0)

  if (gsc.view.state === 'disabled') return null
  return (
    <section data-gsc-widget="recommendations" data-gsc-state={gsc.view.state} className={className}>
      <div className="mb-4">
        <h3 className="text-section font-semibold text-ink">{w.title}</h3>
        {gscReady && <p className="text-copy text-muted mt-1">{w.about}</p>}
      </div>

      {isGscSetupState(gsc.view.state) ? (
        <Card className="p-6">
          <GscSetupPrompt state={gsc.view.state} about={w.about} projectId={projectId} />
        </Card>
      ) : gsc.view.state === 'error' ? (
        <Card className="p-6"><GscLoadError onRetry={gsc.reload} /></Card>
      ) : gsc.view.state === 'loading' ? (
        <Card className="p-6"><GscLoading /></Card>
      ) : (
      <>
      {/* Window toggle */}
      <div className="mb-4 inline-flex rounded-control border border-line bg-sunk p-0.5">
        {WINDOWS.map((w) => (
          <button key={w} type="button" onClick={() => setActiveWindow(w)} aria-pressed={activeWindow === w}
            className={`inline-flex h-8 items-center rounded-[0.375rem] px-3 text-caption font-semibold transition-[background-color,color,box-shadow] duration-150 ${activeWindow === w ? 'bg-surface text-ink shadow-card' : 'text-muted hover:text-ink'}`}>
            {w === 28 ? t.window28 : t.window90}
          </button>
        ))}
      </div>

      {loading ? (
        <div role="status" aria-busy="true" className="space-y-3">
          <span className="sr-only">{t.loading}</span>
          <div className="grid grid-cols-2 gap-3">{[0, 1].map((i) => <Skeleton key={i} className="h-24 rounded-card" />)}</div>
          {[0, 1].map((i) => <Skeleton key={i} className="h-40 rounded-card" />)}
        </div>
      ) : errored ? (
        <Card className="p-6 text-copy text-muted">{t.genericError}</Card>
      ) : stateMessage && stateCta ? (
        <Card className="p-6">
          <p className="text-copy text-muted mb-3">{stateMessage}</p>
          <Link href={gscHref} className={LINK_BUTTON}>{stateCta}</Link>
        </Card>
      ) : recommendations.length === 0 ? (
        <Card padding={false}>
          <EmptyState icon={<Lightbulb />} title={t.emptyTitle} body={t.emptyBody} />
        </Card>
      ) : (
        <>
          {/* Summary strip */}
          <div className="list-enter mb-4 grid grid-cols-2 gap-3 sm:gap-4">
            <StatTile label={t.summaryActionable} value={data?.summary?.actionable ?? recommendations.length} />
            <StatTile label={t.summaryPages} value={data?.summary?.affectedPages ?? 0} />
          </div>

          {/* Category filter */}
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <button type="button" aria-pressed={!categoryFilter} onClick={() => setCategoryFilter(null)} className={chip(!categoryFilter)}>{t.filterAll}</button>
            {CATEGORIES.map((c) => (
              <button key={c} type="button" aria-pressed={categoryFilter === c} onClick={() => setCategoryFilter(c)} className={chip(categoryFilter === c)}>{t.categories[c]}</button>
            ))}
          </div>

          <ul className="list-enter space-y-3">
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
                    <p className="text-copy font-semibold text-ink">{cardTitle(r)}</p>
                    <p className="text-copy text-body mt-1">{cardSummary(r)}</p>

                    {r.category === 'page_overlap' ? (
                      <div className="mt-2 text-caption text-muted">
                        <div className="mb-1">{r.hasClearPrimary && r.affectedPage
                          ? <span>{t.overlap.primaryPage}: <a href={r.affectedPage} target="_blank" rel="noopener noreferrer" dir="ltr" className="text-action hover:underline">{safeDecode(r.affectedPage)}</a></span>
                          : <span className="text-warn">{t.overlap.noPrimary}</span>}</div>
                        <div className="font-medium text-body">{t.overlap.involved}:</div>
                        <ul className="mt-1 space-y-0.5">
                          {shown.map((p) => (
                            <li key={p.url} dir="ltr" className="flex items-center justify-between gap-2">
                              <a href={p.url} target="_blank" rel="noopener noreferrer" className={`truncate ${p.isPrimary ? 'font-semibold text-action' : 'text-muted'} hover:underline`}>{safeDecode(p.url)}</a>
                              <span className="shrink-0 text-muted">{fmtInt(p.impressions)}</span>
                            </li>
                          ))}
                        </ul>
                        {pages.length > OVERLAP_INITIAL && (
                          <button onClick={() => setShowAllPages((s) => ({ ...s, [r.id]: !s[r.id] }))} className="mt-1 text-action hover:underline">{showAllPages[r.id] ? t.overlap.showLess : t.overlap.showAll}</button>
                        )}
                        <div className="mt-1 text-warn">{t.overlap.signalOnly}</div>
                      </div>
                    ) : (
                      r.affectedPage && (
                        <div className="mt-2 text-caption text-muted">
                          {t.affectedPage}: <a href={r.affectedPage} target="_blank" rel="noopener noreferrer" dir="ltr" className="text-action hover:underline">{safeDecode(r.affectedPage)}</a>
                        </div>
                      )
                    )}

                    {/* Metrics */}
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-caption text-muted">
                      <span>{t.metricImpressions}: {fmtInt(r.metrics.impressions)}</span>
                      <span>{t.metricClicks}: {fmtInt(r.metrics.clicks)}</span>
                      {r.category === 'improve_ctr' && <span>{t.metricCtr}: {fmtCtr(r.metrics.ctr)}</span>}
                      <span>{t.metricPosition}: {fmtPos(r.metrics.averagePosition)}</span>
                    </div>

                    {/* Why (expandable) */}
                    <button onClick={() => setExpanded((e) => ({ ...e, [r.id]: !e[r.id] }))} className="mt-2 text-caption font-medium text-action hover:underline">
                      {t.whyLabel}
                    </button>
                    {expanded[r.id] && (
                      <div className="mt-1.5 space-y-1.5 rounded-inset border border-line bg-sunk/60 p-3 text-caption text-body motion-safe:animate-pop-in">
                        <ul className="list-disc ps-4 space-y-0.5">
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
                        <a href={r.affectedPage} target="_blank" rel="noopener noreferrer" className={LINK_BUTTON}>{t.openPage}</a>
                      )}
                      {r.category === 'page_overlap' && r.hasClearPrimary && r.affectedPage && (
                        <a href={r.affectedPage} target="_blank" rel="noopener noreferrer" className={LINK_BUTTON}>{t.openPrimary}</a>
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
      </>
      )}
    </section>
  )
}
