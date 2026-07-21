'use client'

/**
 * Stage E2A surface + Stage E2B controlled decisions (RTL, Hebrew-first).
 *
 * E2A remains fully read-only. E2B adds human-triggered decisions — Create reviewed topic /
 * Already covered / Not relevant — gated behind NEXT_PUBLIC_GSC_ACTIONS_ENABLED (the server
 * route re-checks the authoritative GSC_ACTIONS_ENABLED). No bulk actions, no auto-approval,
 * no generation/publish/queue/title-meta/link editing. "Create topic" only opens the EXISTING
 * ArticleBriefModal (prefilled, fully editable); nothing is created until the user submits it,
 * and the GSC decision is written only AFTER the topic is created.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Lightbulb, AlertTriangle } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import ArticleBriefModal from '@/components/content/ArticleBriefModal'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'

type WindowDays = 28 | 90
const WINDOWS: WindowDays[] = [28, 90]
const PAGE_SIZE = 25
const ACTIONS_ENABLED = process.env.NEXT_PUBLIC_GSC_ACTIONS_ENABLED === 'true'

type OpportunityType = 'improve_existing_page' | 'improve_title_meta_ctr' | 'supporting_content_candidate' | 'internal_link_support_candidate'
type FilterValue = OpportunityType | 'multi_page_signal'
type DecisionKind = 'already_covered' | 'irrelevant' | 'created_topic'
type DecisionState = 'open' | 'decided' | 'all'
interface ReasonCode { code: string; detail: string; value?: number }
interface ContentMatch { source: string; matchType: string; confidence: number; reference: string; matchedUrl: string | null }
interface DecisionAnnotation { decision: DecisionKind; createdTopicId: string | null; createdAt: string; updatedAt: string }
interface Opportunity {
  id: string; primaryQuery: string; relatedQueries: string[]; page: string; pageType: string; queryIntent: string
  clicks: number; impressions: number; ctr: number; averagePosition: number; distinctPageCount: number
  opportunityType: OpportunityType; signals: string[]; opportunityScore: number; reasons: ReasonCode[]; existingContentMatch: ContentMatch | null
  decision?: DecisionAnnotation | null
}
interface ApiResponse {
  ok: boolean; state?: 'not_connected' | 'no_property' | 'never_synced' | 'ok'; error?: string
  window?: number; total?: number; typeCounts?: Record<string, number>; opportunities?: Opportunity[]
  decisionCounts?: Record<string, number>
}
interface ProjectOption { id: string; name: string; language?: string | null; business_name?: string | null }
type Dict = ReturnType<typeof getDashboardDictionary>['projectDetail']['contentSection']['gscOpportunities']

const fmtInt = (n: number) => Math.round(n).toLocaleString()
const fmtCtr = (n: number) => `${(n * 100).toFixed(2)}%`
const fmtPos = (n: number) => (n > 0 ? n.toFixed(1) : '—')
function safeDecodeUrl(u: string): string { try { return decodeURI(u) } catch { return u } }
/** Map GSC query intent → the existing topic search_intent format (safe subset). */
function mapIntent(gsc: string): string | undefined {
  switch (gsc) {
    case 'informational': return 'informational'
    case 'commercial': return 'commercial'
    case 'product': return 'transactional'
    case 'branded_or_service': case 'support': return 'other'
    default: return undefined
  }
}

export default function GscOpportunities({ projectId, projects = [], onToast, onTopicsChanged }: {
  projectId: string; projects?: ProjectOption[]; onToast?: (kind: 'success' | 'error', text: string) => void; onTopicsChanged?: () => void
}) {
  const { language } = useDashboardLanguage()
  const t: Dict = useMemo(() => getDashboardDictionary(language).projectDetail.contentSection.gscOpportunities, [language])

  const [activeWindow, setActiveWindow] = useState<WindowDays>(28)
  const [typeFilter, setTypeFilter] = useState<FilterValue | null>(null)
  const [decisionState, setDecisionState] = useState<DecisionState>('open')
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<ApiResponse | null>(null)
  const [errored, setErrored] = useState(false)

  // E2B action state.
  const [busyId, setBusyId] = useState<string | null>(null)
  const [actingOpp, setActingOpp] = useState<Opportunity | null>(null)
  const [briefOpen, setBriefOpen] = useState(false)
  const [partialRetry, setPartialRetry] = useState<{ opportunityId: string; createdTopicId: string } | null>(null)
  const [retrying, setRetrying] = useState(false)

  const errText = useCallback((code: string | null | undefined): string => {
    if (!code) return t.genericError
    return (t.errors as Record<string, string>)[code] ?? t.genericError
  }, [t])

  const load = useCallback(async () => {
    setLoading(true); setErrored(false)
    try {
      const params = new URLSearchParams({ projectId, window: String(activeWindow), page: String(page), pageSize: String(PAGE_SIZE) })
      if (typeFilter) params.set('type', typeFilter)
      if (ACTIONS_ENABLED) params.set('decisionState', decisionState)
      const res = await fetch(`/api/gsc/opportunities?${params.toString()}`)
      if (res.status === 404) { setData(null); setErrored(true); return }
      const json = (await res.json()) as ApiResponse
      if (!json.ok) { setErrored(true); setData(null) } else { setData(json) }
    } catch { setErrored(true); setData(null) } finally { setLoading(false) }
  }, [projectId, activeWindow, typeFilter, page, decisionState])

  useEffect(() => { load() }, [load])
  useEffect(() => { setPage(0) }, [activeWindow, typeFilter, decisionState])

  const reasonText = (r: ReasonCode) => (t.reasons as Record<string, string>)[r.code] ?? r.detail
  const typeLabel = (ty: string) => (t.types as Record<string, string>)[ty] ?? ty
  const intentLabel = (i: string) => (t.intents as Record<string, string>)[i] ?? i
  const pageTypeLabel = (p: string) => (t.pageTypes as Record<string, string>)[p] ?? p

  const state = data?.state
  const opportunities = data?.opportunities ?? []
  const total = data?.total ?? 0
  const typeCounts = data?.typeCounts ?? {}
  const allTypes: FilterValue[] = ['improve_existing_page', 'improve_title_meta_ctr', 'supporting_content_candidate', 'internal_link_support_candidate', 'multi_page_signal']
  const scoreBadgeVariant = (s: number): 'success' | 'info' | 'neutral' => (s >= 66 ? 'success' : s >= 33 ? 'info' : 'neutral')

  const gscHref = `/projects/${projectId}#gsc-section`
  const ctaFor = (s: string): string | null => (s === 'not_connected' ? t.ctaConnect : s === 'no_property' ? t.ctaSelectProperty : s === 'never_synced' ? t.ctaSync : null)
  const renderStateCta = (message: string, ctaText: string) => (
    <div className="py-4">
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">{message}</p>
      <Link href={gscHref} className="inline-flex items-center justify-center h-8 px-3 rounded-lg text-xs font-medium bg-indigo-600 text-white hover:bg-indigo-700 transition">{ctaText}</Link>
    </div>
  )

  // ── E2B action handlers ─────────────────────────────────────────────────────
  async function postDecision(opportunityId: string, decision: DecisionKind, createdTopicId?: string): Promise<{ ok: boolean; error?: string }> {
    const res = await fetch('/api/gsc/opportunities/decision', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, opportunityId, window: activeWindow, decision, ...(createdTopicId ? { createdTopicId } : {}) }),
    })
    const d = await res.json().catch(() => ({}))
    return { ok: res.ok && d.ok, error: d.error }
  }

  async function handleDecision(o: Opportunity, decision: 'already_covered' | 'irrelevant') {
    if (busyId) return // prevent double submission
    setBusyId(o.id)
    try {
      const r = await postDecision(o.id, decision)
      if (r.ok) { onToast?.('success', t.toastDecisionSaved); await load() } else onToast?.('error', errText(r.error))
    } catch { onToast?.('error', t.genericError) } finally { setBusyId(null) }
  }

  async function handleUndo(o: Opportunity) {
    if (busyId) return
    setBusyId(o.id)
    try {
      const res = await fetch(`/api/gsc/opportunities/decision?projectId=${projectId}&opportunityId=${encodeURIComponent(o.id)}`, { method: 'DELETE' })
      const d = await res.json().catch(() => ({}))
      if (res.ok && d.ok) { onToast?.('success', t.toastDecisionUndone); await load() } else onToast?.('error', errText(d.error))
    } catch { onToast?.('error', t.genericError) } finally { setBusyId(null) }
  }

  function handleCreateTopic(o: Opportunity) {
    setActingOpp(o); setBriefOpen(true)
  }

  // Fires after the existing modal creates the topic(s). Only THEN do we write the GSC decision.
  async function handleTopicsCreated(created: { id: string; topic: string; primary_keyword: string | null }[]) {
    onTopicsChanged?.() // the topic WAS created — refresh the hub's topic list regardless
    const opp = actingOpp
    if (!created.length || !opp) return
    const createdTopicId = created[0].id
    const r = await postDecision(opp.id, 'created_topic', createdTopicId)
    if (r.ok) { onToast?.('success', t.toastTopicTracked); setActingOpp(null); setPartialRetry(null); await load() }
    else { setPartialRetry({ opportunityId: opp.id, createdTopicId }); onToast?.('error', t.partialSuccess) } // topic created, decision failed
  }

  async function handleRetryDecision() {
    if (!partialRetry || retrying) return
    setRetrying(true)
    try {
      const r = await postDecision(partialRetry.opportunityId, 'created_topic', partialRetry.createdTopicId) // never re-creates the topic
      if (r.ok) { setPartialRetry(null); setActingOpp(null); onToast?.('success', t.toastTopicTracked); await load() } else onToast?.('error', errText(r.error))
    } catch { onToast?.('error', t.genericError) } finally { setRetrying(false) }
  }

  const decidedLabel = (d: DecisionKind) => (d === 'created_topic' ? t.decidedCreatedTopic : d === 'already_covered' ? t.decidedAlreadyCovered : t.decidedIrrelevant)

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
          <span className="inline-block w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />{t.loading}
        </div>
      ) : errored ? (
        <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-3 py-2 text-sm text-red-700 dark:text-red-300">{t.apiError}</div>
      ) : state === 'not_connected' ? (
        renderStateCta(t.notConnected, ctaFor('not_connected')!)
      ) : state === 'no_property' ? (
        renderStateCta(t.noProperty, ctaFor('no_property')!)
      ) : state === 'never_synced' ? (
        renderStateCta(t.neverSynced, ctaFor('never_synced')!)
      ) : (
        <div className="space-y-3">
          {/* Partial-success retry banner (topic created, decision write failed) */}
          {ACTIONS_ENABLED && partialRetry && (
            <div className="rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 text-sm text-amber-800 dark:text-amber-300 flex flex-wrap items-center gap-2">
              <AlertTriangle size={14} /><span>{t.partialSuccess}</span>
              <Button size="sm" variant="outline" className="ms-auto" onClick={handleRetryDecision} loading={retrying} disabled={retrying}>{t.retryDecision}</Button>
            </div>
          )}

          {/* E2B decision-state controls */}
          {ACTIONS_ENABLED && (
            <div className="flex flex-wrap gap-2">
              {(['open', 'decided', 'all'] as DecisionState[]).map((ds) => (
                <button key={ds} type="button" onClick={() => setDecisionState(ds)}
                  className={`text-xs px-2.5 py-1 rounded-full border ${decisionState === ds ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'}`}>
                  {ds === 'open' ? t.decisionOpen : ds === 'decided' ? t.decisionDecided : t.decisionAll}
                  {data?.decisionCounts && ds !== 'all' ? ` (${data.decisionCounts[ds] ?? 0})` : ''}
                </button>
              ))}
            </div>
          )}

          {/* Type filter chips */}
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
              {opportunities.map((o) => {
                const isBusy = busyId === o.id
                const canCreateTopic = o.opportunityType === 'supporting_content_candidate'
                return (
                  <li key={o.id} className="rounded-lg border border-slate-200 dark:border-slate-700 p-3">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <Badge variant={scoreBadgeVariant(o.opportunityScore)}>{t.scoreLabel}: {o.opportunityScore}</Badge>
                      <Badge variant="info">{typeLabel(o.opportunityType)}</Badge>
                      {o.queryIntent !== 'unknown' && <Badge variant="neutral">{intentLabel(o.queryIntent)}</Badge>}
                      {o.pageType !== 'unknown' && <Badge variant="neutral">{pageTypeLabel(o.pageType)}</Badge>}
                      {o.signals.includes('multi_page_signal') && <Badge variant="warning">{typeLabel('multi_page_signal')}: {o.distinctPageCount}</Badge>}
                      {/* Decided badge */}
                      {o.decision && <Badge variant={o.decision.decision === 'created_topic' ? 'success' : 'neutral'}>{decidedLabel(o.decision.decision)}</Badge>}
                    </div>

                    <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">{o.primaryQuery}</div>
                    {o.relatedQueries.length > 0 && (
                      <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{t.colRelated}: {o.relatedQueries.join(' · ')}</div>
                    )}
                    <a href={o.page} target="_blank" rel="noopener noreferrer" title={safeDecodeUrl(o.page)} dir="ltr"
                      className="block text-xs font-mono text-indigo-600 dark:text-indigo-400 hover:underline mt-1 truncate">
                      {safeDecodeUrl(o.page)}
                    </a>

                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-300 mt-2">
                      <span>{t.colClicks}: <span className="tabular-nums font-medium">{fmtInt(o.clicks)}</span></span>
                      <span>{t.colImpressions}: <span className="tabular-nums font-medium">{fmtInt(o.impressions)}</span></span>
                      <span>{t.colCtr}: <span className="tabular-nums font-medium">{fmtCtr(o.ctr)}</span></span>
                      <span>{t.colPosition}: <span className="tabular-nums font-medium">{fmtPos(o.averagePosition)}</span></span>
                    </div>

                    <div className="mt-2">
                      <div className="text-xs font-medium text-slate-500 dark:text-slate-400">{t.whyLabel}</div>
                      <ul className="mt-1 flex flex-wrap gap-1.5">
                        {o.reasons.map((r, i) => (
                          <li key={`${o.id}-${r.code}-${i}`} className="text-[11px] px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">{reasonText(r)}</li>
                        ))}
                      </ul>
                      {o.signals.includes('multi_page_signal') && (
                        <div className="mt-1 text-[11px] text-amber-600 dark:text-amber-400 inline-flex items-center gap-1"><AlertTriangle size={11} />{t.multiPageNote}</div>
                      )}
                    </div>

                    <div className="mt-2 text-xs">
                      {o.existingContentMatch ? (
                        <span className="text-emerald-700 dark:text-emerald-400">{t.matchLabel}: <span className="font-medium">{o.existingContentMatch.reference}</span></span>
                      ) : (
                        <span className="text-slate-400 dark:text-slate-500">{t.noMatch}</span>
                      )}
                    </div>

                    {/* E2B controlled actions (only when the actions flag is on, state is ok) */}
                    {ACTIONS_ENABLED && (
                      <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 dark:border-slate-800 pt-2">
                        {o.decision ? (
                          o.decision.decision === 'created_topic' ? (
                            <span className="text-xs text-emerald-700 dark:text-emerald-400">{t.createdTopicRef}{o.decision.createdTopicId ? `: ${o.decision.createdTopicId.slice(0, 8)}…` : ''}</span>
                          ) : (
                            <Button size="sm" variant="outline" onClick={() => handleUndo(o)} loading={isBusy} disabled={isBusy}>{isBusy ? t.working : t.actionUndo}</Button>
                          )
                        ) : (
                          <>
                            {canCreateTopic && <Button size="sm" onClick={() => handleCreateTopic(o)} disabled={isBusy}>{t.actionCreateTopic}</Button>}
                            <Button size="sm" variant="outline" onClick={() => handleDecision(o, 'already_covered')} loading={isBusy} disabled={isBusy}>{t.actionAlreadyCovered}</Button>
                            <Button size="sm" variant="outline" onClick={() => handleDecision(o, 'irrelevant')} loading={isBusy} disabled={isBusy}>{t.actionIrrelevant}</Button>
                          </>
                        )}
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}

          <p className="text-[11px] text-slate-400 dark:text-slate-500">{t.scoreExplained}</p>

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

      {/* Reused topic-creation modal (create mode, prefilled, fully editable). Only mounted
          when the actions flag is on and a "create topic" action was triggered. */}
      {ACTIONS_ENABLED && actingOpp && (
        <ArticleBriefModal
          open={briefOpen}
          onClose={() => setBriefOpen(false)}
          projects={projects}
          defaultProjectId={projectId}
          editing={null}
          mode="gsc_reviewed_topic"
          prefill={{ topic: actingOpp.primaryQuery, primaryKeyword: actingOpp.primaryQuery, secondaryKeywords: actingOpp.relatedQueries, searchIntent: mapIntent(actingOpp.queryIntent) }}
          onSaved={() => { onTopicsChanged?.() }}
          onToast={onToast}
          onTopicsCreated={handleTopicsCreated}
        />
      )}
    </Card>
  )
}
