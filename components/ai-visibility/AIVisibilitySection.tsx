'use client'

/**
 * AI Visibility premium workspace — true 2-column layout optimized for AI insights.
 * Mounted inside the project page only when NEXT_PUBLIC_ENABLE_AI_VISIBILITY === 'true'.
 *
 * Layout:
 *   - HEADER (title + suggest/new query)
 *   - KPI OVERVIEW (Visibility Score, Mentioned, Cited, Citations)
 *   - WORKSPACE (left: query list | right: selected query details)
 *   - SCAN HISTORY (compact footer)
 *
 * Performance:
 *   - History endpoint returns metadata only; full response fetched on demand
 *   - Memoized derived values (kpis, paragraphs, sortedCitations)
 *   - Optimistic delete with fade-out
 *
 * Localization: Hebrew when project language='he' or country='IL'.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import Input from '@/components/ui/Input'
import Textarea from '@/components/ui/Textarea'
import Badge from '@/components/ui/Badge'
import {
  ENGINE_META,
  ExternalLinkIcon,
  SparkleIcon,
} from './EngineIcon'
import PromptSuggestions from './PromptSuggestions'
import ScanHistory from './ScanHistory'
import { parseBlocks, toParagraphs } from '@/lib/ai-visibility/clean-response-text'
import { createI18n, isHebrew as detectHebrew } from '@/lib/ai-visibility/i18n'
import AIInsightCards from './AIInsightCards'

type Prompt = {
  id: string
  project_id: string
  prompt: string
  target_domain: string | null
  target_brand_name: string | null
  country: string | null
  language: string | null
  is_active: boolean
  created_at: string
}

type Citation = {
  id: string
  url: string
  domain: string
  title: string | null
  snippet: string | null
  citation_position: number | null
  is_target_domain: boolean
}

type ResultRow = {
  id: string
  promptId: string | null
  engine: string
  provider: string
  mentioned: boolean
  targetCited: boolean
  citationCount: number
  sourceCount: number
  responseText: string | null
  responseSummary: string | null
  creditsUsed: number | string
  status: string | null
  errorMessage: string | null
  scannedAt: string | null
  citations: Citation[]
}

type RunResults = {
  run: {
    id: string
    status: string
    totalCreditsUsed: number | string
    startedAt: string | null
    completedAt: string | null
    errorMessage: string | null
  }
  results: ResultRow[]
}

const ENGINE_LIST: Array<keyof typeof ENGINE_META> = [
  'chatgpt',
  'perplexity',
  'gemini',
  'copilot',
  'grok',
  'google_ai_mode',
]

function faviconUrl(domain: string): string {
  return `https://www.google.com/s2/favicons?sz=64&domain=${encodeURIComponent(domain)}`
}

function formatRelativeTime(iso: string | null | undefined, justNow = 'just now'): string {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    const now = Date.now()
    const diffSec = Math.floor((now - d.getTime()) / 1000)
    if (diffSec < 60) return justNow
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m`
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h`
    if (diffSec < 86400 * 7) return `${Math.floor(diffSec / 86400)}d`
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return ''
  }
}

export default function AIVisibilitySection({
  projectId,
  projectCountry,
  projectLanguage,
  projectDomain,
  projectBrandName,
  projectCity,
  projectKeywords,
}: {
  projectId: string
  projectCountry: string | null
  projectLanguage: string | null
  projectDomain: string | null
  projectBrandName: string | null
  projectCity?: string | null
  projectKeywords?: string[]
}) {
  const t = useMemo(() => createI18n(projectLanguage, projectCountry), [projectLanguage, projectCountry])
  const isHebrew = detectHebrew(projectLanguage, projectCountry)

  const [prompts, setPrompts] = useState<Prompt[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [showNewPrompt, setShowNewPrompt] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [creating, setCreating] = useState(false)

  const [selectedPromptId, setSelectedPromptId] = useState<string | null>(null)
  const [runningKey, setRunningKey] = useState<string | null>(null)
  const [latestRun, setLatestRun] = useState<RunResults | null>(null)
  const [historyRefresh, setHistoryRefresh] = useState(0)
  const [deleteConfirmRunId, setDeleteConfirmRunId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [removedRunIds, setRemovedRunIds] = useState<Set<string>>(new Set())

  const [newPrompt, setNewPrompt] = useState('')
  const [newCountry, setNewCountry] = useState(projectCountry || 'IL')
  const [newLanguage, setNewLanguage] = useState(projectLanguage || 'he')
  const [newTargetDomain, setNewTargetDomain] = useState(projectDomain || '')
  const [newTargetBrand, setNewTargetBrand] = useState(projectBrandName || '')

  const loadPrompts = useCallback(async () => {
    setError(null)
    try {
      const res = await fetch(`/api/ai-visibility/prompts?projectId=${projectId}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `HTTP ${res.status}`)
      }
      const data = await res.json()
      setPrompts(data.prompts || [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load prompts')
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    loadPrompts()
  }, [loadPrompts])

  async function handleCreatePrompt(e: React.FormEvent) {
    e.preventDefault()
    if (!newPrompt.trim()) return
    setCreating(true)
    setError(null)
    try {
      const res = await fetch('/api/ai-visibility/prompts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          prompt: newPrompt,
          country: newCountry || null,
          language: newLanguage || null,
          targetDomain: newTargetDomain || null,
          targetBrandName: newTargetBrand || null,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `HTTP ${res.status}`)
      }
      setNewPrompt('')
      setShowNewPrompt(false)
      await loadPrompts()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create prompt')
    } finally {
      setCreating(false)
    }
  }

  async function handleRun(promptId: string, engine: string) {
    const key = `${promptId}:${engine}`
    setRunningKey(key)
    setError(null)
    setLatestRun(null)
    try {
      const res = await fetch('/api/ai-visibility/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, promptId, engine }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`)
      const runId = body.runId
      const resultsRes = await fetch(`/api/ai-visibility/runs/${runId}/results`)
      if (!resultsRes.ok) {
        const errBody = await resultsRes.json().catch(() => ({}))
        throw new Error(errBody.error || `Failed to load results: HTTP ${resultsRes.status}`)
      }
      const resultsBody: RunResults = await resultsRes.json()
      setLatestRun(resultsBody)
      setHistoryRefresh((v) => v + 1)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Run failed')
    } finally {
      setRunningKey(null)
    }
  }

  async function handleSelectHistoryRun(runId: string) {
    setError(null)
    try {
      const res = await fetch(`/api/ai-visibility/runs/${runId}/results`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `HTTP ${res.status}`)
      }
      const data: RunResults = await res.json()
      setLatestRun(data)
      if (typeof window !== 'undefined') {
        const el = document.getElementById('ai-result-workspace')
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load run')
    }
  }

  async function handleDeleteRun(runId: string) {
    setDeleting(true)
    // Optimistic UI: mark for fade-out immediately
    setRemovedRunIds(new Set([runId]))
    try {
      const res = await fetch(`/api/ai-visibility/runs/${runId}/delete`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'Failed to delete')
      }
      if (latestRun?.run.id === runId) {
        setLatestRun(null)
      }
      setDeleteConfirmRunId(null)
      // Trigger a fresh history fetch after fade animation completes
      setTimeout(() => {
        setRemovedRunIds(new Set())
        setHistoryRefresh((v) => v + 1)
      }, 260)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed')
      // Undo optimistic removal on failure
      setRemovedRunIds(new Set())
    } finally {
      setDeleting(false)
    }
  }

  const result = latestRun?.results?.[0] ?? null
  const responseIsRTL = useMemo(
    () =>
      result ? /[֐-׿؀-ۿ]/.test(result.responseText || '') : isHebrew,
    [result, isHebrew]
  )

  const kpis = useMemo(
    () =>
      result
        ? {
            score:
              result.status === 'success'
                ? Math.round(((result.mentioned ? 40 : 0) + (result.targetCited ? 60 : 0)))
                : 0,
            mentioned: result.mentioned,
            targetCited: result.targetCited,
            citationCount: result.citationCount,
            scannedAt: result.scannedAt,
            engine: result.engine,
            topSource: result.citations.find((c) => c.is_target_domain) || result.citations[0] || null,
          }
        : null,
    [result]
  )

  return (
    <section id="ai-visibility" className="space-y-5 mb-10" dir={isHebrew ? 'rtl' : 'ltr'}>
      {/* HEADER */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 via-indigo-500 to-blue-500 text-white shadow-lg shadow-indigo-500/30">
            <SparkleIcon size={20} className="text-white" />
            <div className="absolute -inset-0.5 rounded-xl bg-gradient-to-br from-violet-400/40 to-blue-400/40 blur-md -z-10" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900 tracking-tight">{t('ai_visibility')}</h2>
            <p className="text-xs text-slate-500 mt-0">{t('monitor_engines')}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowSuggestions(true)}>
            {t('recommend_questions')}
          </Button>
          <Button size="sm" onClick={() => setShowNewPrompt(true)}>
            {t('new_query')}
          </Button>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700 flex items-start gap-2">
          <span className="shrink-0 text-lg">✕</span>
          <span>{error}</span>
        </div>
      )}

      {/* KPI OVERVIEW */}
      {kpis && <BigKpiPanel kpis={kpis} t={t} />}

      {/* INSIGHTS STRIP */}
      {kpis && <InsightsStrip kpis={kpis} t={t} />}

      {/* WORKSPACE: 2-Column Layout */}
      {loading ? (
        <QueryListSkeleton />
      ) : prompts.length === 0 ? (
        <EmptyPromptState
          onSuggest={() => setShowSuggestions(true)}
          onNew={() => setShowNewPrompt(true)}
          t={t}
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* LEFT: Query List */}
          <div className="lg:col-span-1">
            <div className="space-y-2">
              {prompts.map((p) => {
                const selected = selectedPromptId === p.id
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSelectedPromptId(p.id)}
                    className={`w-full text-start p-4 rounded-xl border transition-all ${
                      selected
                        ? 'border-indigo-300 bg-gradient-to-br from-indigo-50 to-white shadow-md'
                        : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="min-w-0 flex-1">
                        <h3 className="text-sm font-semibold text-slate-900 line-clamp-2">{p.prompt}</h3>
                      </div>
                    </div>
                    {(p.country || p.language) && (
                      <div className="flex gap-2 mb-3">
                        {p.country && <Badge variant="neutral" className="!text-[9px] !px-1.5 !py-0">{p.country}</Badge>}
                        {p.language && <Badge variant="neutral" className="!text-[9px] !px-1.5 !py-0">{p.language}</Badge>}
                      </div>
                    )}
                    {/* Compact Engine Status Chips */}
                    <div className="flex flex-wrap gap-1.5">
                      {ENGINE_LIST.map((engineId) => {
                        const isRunning = runningKey === `${p.id}:${engineId}`
                        const statusIcon =
                          isRunning ? '⟳' :
                          result?.promptId === p.id && result?.engine === engineId
                            ? result.status === 'success'
                              ? '✓'
                              : '✕'
                            : '—'
                        const statusColor =
                          isRunning ? 'bg-blue-100 text-blue-700' :
                          result?.promptId === p.id && result?.engine === engineId
                            ? result.status === 'success'
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-red-100 text-red-700'
                            : 'bg-slate-100 text-slate-500'

                        const meta = ENGINE_META[engineId]
                        return (
                          <button
                            key={engineId}
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              setSelectedPromptId(p.id)
                              handleRun(p.id, engineId)
                            }}
                            disabled={runningKey !== null && !isRunning}
                            className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition ${statusColor} ${
                              runningKey !== null && !isRunning ? 'opacity-50 cursor-not-allowed' : 'hover:shadow-sm'
                            }`}
                            title={meta?.name}
                          >
                            <span>{statusIcon}</span>
                          </button>
                        )
                      })}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* RIGHT: Query Details */}
          <div className="lg:col-span-2">
            {selectedPromptId && prompts.find((p) => p.id === selectedPromptId) ? (
              <>
                {runningKey?.startsWith(selectedPromptId + ':') && !latestRun && (
                  <ResultSkeleton t={t} />
                )}
                {latestRun && result && result.promptId === selectedPromptId && (
                  <ResultWorkspace
                    result={result}
                    responseIsRTL={responseIsRTL}
                    runStatus={latestRun.run.status}
                    completedAt={latestRun.run.completedAt}
                    t={t}
                  />
                )}
                {!latestRun || result?.promptId !== selectedPromptId ? (
                  <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
                    <p className="text-sm text-slate-600">{t('select_and_run_query')}</p>
                  </div>
                ) : null}
              </>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
                <p className="text-sm text-slate-600">{t('select_query_to_view')}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* SCAN HISTORY */}
      <ScanHistory
        projectId={projectId}
        refreshKey={historyRefresh}
        selectedRunId={latestRun?.run.id || null}
        onSelectRun={handleSelectHistoryRun}
        onDeleteRun={setDeleteConfirmRunId}
        language={projectLanguage}
        country={projectCountry}
        removedRunIds={removedRunIds}
      />

      {/* DELETE CONFIRMATION */}
      <Modal
        open={deleteConfirmRunId !== null}
        onClose={() => setDeleteConfirmRunId(null)}
        title={t('delete_scan_title')}
        size="sm"
      >
        <div className="space-y-4" dir={isHebrew ? 'rtl' : 'ltr'}>
          <p className="text-sm text-slate-600">{t('delete_scan_body')}</p>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setDeleteConfirmRunId(null)} disabled={deleting}>
              {t('cancel')}
            </Button>
            <Button
              variant="danger"
              onClick={() => deleteConfirmRunId && handleDeleteRun(deleteConfirmRunId)}
              loading={deleting}
            >
              {t('delete_permanently')}
            </Button>
          </div>
        </div>
      </Modal>

      {/* NEW AI QUERY MODAL */}
      <Modal
        open={showNewPrompt}
        onClose={() => setShowNewPrompt(false)}
        title={t('new_ai_query_title')}
        size="md"
      >
        <form onSubmit={handleCreatePrompt} className="space-y-3" dir={isHebrew ? 'rtl' : 'ltr'}>
          <Textarea
            label={t('query_label')}
            value={newPrompt}
            onChange={(e) => setNewPrompt(e.target.value)}
            placeholder={isHebrew ? 'למשל: חברת SEO מומלצת בישראל?' : 'e.g., Best SEO agency in Israel?'}
            required
            rows={3}
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label={t('country_label')}
              value={newCountry}
              onChange={(e) => setNewCountry(e.target.value)}
              placeholder="IL"
            />
            <Input
              label={t('language_label')}
              value={newLanguage}
              onChange={(e) => setNewLanguage(e.target.value)}
              placeholder="he"
            />
          </div>
          <Input
            label={t('target_domain_label')}
            type="url"
            value={newTargetDomain}
            onChange={(e) => setNewTargetDomain(e.target.value)}
            placeholder={projectDomain || 'example.com'}
          />
          <Input
            label={t('target_brand_label')}
            value={newTargetBrand}
            onChange={(e) => setNewTargetBrand(e.target.value)}
            placeholder={projectBrandName || (isHebrew ? 'שם המותג' : 'Brand name')}
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setShowNewPrompt(false)}>
              {t('cancel')}
            </Button>
            <Button type="submit" loading={creating} disabled={!newPrompt.trim()}>
              {t('create_query')}
            </Button>
          </div>
        </form>
      </Modal>

      <PromptSuggestions
        open={showSuggestions}
        onClose={() => setShowSuggestions(false)}
        projectId={projectId}
        businessName={projectBrandName}
        domain={projectDomain}
        city={projectCity || null}
        country={projectCountry}
        language={projectLanguage}
        keywords={projectKeywords}
        onAdded={loadPrompts}
      />
    </section>
  )
}

/* --- Subcomponents --- */

type T = (key: Parameters<ReturnType<typeof createI18n>>[0]) => string

function BigKpiPanel({
  kpis,
  t,
}: {
  kpis: { score: number; mentioned: boolean; targetCited: boolean; citationCount: number }
  t: T
}) {
  const scoreLabel =
    kpis.score >= 60 ? t('high_visibility') : kpis.score >= 20 ? t('moderate_visibility') : t('low_visibility')

  return (
    <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 rounded-2xl border border-slate-200/70 bg-gradient-to-br from-white to-slate-50/40 p-4 shadow-sm">
      <div className="col-span-2 lg:col-span-2 relative overflow-hidden rounded-xl bg-gradient-to-br from-indigo-50 via-white to-violet-50/40 border-2 border-indigo-200/60 p-5 shadow-sm">
        <div className="absolute top-0 right-0 w-20 h-20 bg-indigo-200/20 rounded-full -mr-10 -mt-10" />
        <div className="relative z-10">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-indigo-700 mb-1">
            {t('visibility_score')}
          </div>
          <div className="text-5xl font-black text-indigo-900 leading-tight">
            {kpis.score}<span className="text-2xl text-indigo-600">%</span>
          </div>
          <div className="text-xs text-indigo-600 font-medium mt-2">{scoreLabel}</div>
        </div>
      </div>

      <KpiTile
        label={t('mentioned')}
        value={kpis.mentioned ? '✓' : '✕'}
        sub={kpis.mentioned ? t('in_ai_response') : t('not_found')}
        tone={kpis.mentioned ? 'blue' : 'flat'}
      />
      <KpiTile
        label={t('target_cited')}
        value={kpis.targetCited ? '✓' : '✕'}
        sub={kpis.targetCited ? t('as_source') : t('not_cited')}
        tone={kpis.targetCited ? 'emerald' : 'flat'}
      />
      <KpiTile
        label={t('citations')}
        value={String(kpis.citationCount)}
        sub={t('sources_cited')}
        tone={kpis.citationCount > 0 ? 'amber' : 'flat'}
      />
    </div>
  )
}

function KpiTile({
  label,
  value,
  sub,
  tone,
}: {
  label: string
  value: string
  sub: string
  tone: 'blue' | 'emerald' | 'amber' | 'flat'
}) {
  const bgClass =
    tone === 'blue'
      ? 'from-blue-50/60 to-white border-blue-100'
      : tone === 'emerald'
      ? 'from-emerald-50/60 to-white border-emerald-100'
      : tone === 'amber'
      ? 'from-amber-50/40 to-white border-amber-100'
      : 'from-slate-50/40 to-white border-slate-200'

  const valueColor =
    tone === 'blue'
      ? 'text-blue-700'
      : tone === 'emerald'
      ? 'text-emerald-700'
      : tone === 'amber'
      ? 'text-amber-700'
      : 'text-slate-500'

  return (
    <div className={`relative overflow-hidden rounded-xl bg-gradient-to-br ${bgClass} border p-4 shadow-sm hover:shadow-md transition`}>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
        {label}
      </div>
      <div className={`text-3xl font-bold ${valueColor}`}>{value}</div>
      <div className="text-xs text-slate-500 font-medium mt-1">{sub}</div>
    </div>
  )
}

function InsightsStrip({
  kpis,
  t,
}: {
  kpis: { mentioned: boolean; targetCited: boolean; engine: string; topSource: Citation | null }
  t: T
}) {
  const engineMeta = ENGINE_META[kpis.engine] || null
  const Icon = engineMeta?.Icon

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
      {/* Brand insight */}
      <div className={`rounded-xl border p-3 flex items-start gap-2.5 ${kpis.mentioned ? 'border-blue-200 bg-blue-50/40' : 'border-amber-200 bg-amber-50/40'}`}>
        <div className={`shrink-0 w-7 h-7 rounded-lg flex items-center justify-center ${kpis.mentioned ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>
          {kpis.mentioned ? '✓' : '!'}
        </div>
        <div className="min-w-0">
          <div className={`text-[12px] font-semibold ${kpis.mentioned ? 'text-blue-900' : 'text-amber-900'}`}>
            {kpis.mentioned ? t('brand_mentioned_yes') : t('brand_mentioned_no')}
          </div>
        </div>
      </div>

      {/* Domain citation insight */}
      <div className={`rounded-xl border p-3 flex items-start gap-2.5 ${kpis.targetCited ? 'border-emerald-200 bg-emerald-50/40' : 'border-slate-200 bg-slate-50/40'}`}>
        <div className={`shrink-0 w-7 h-7 rounded-lg flex items-center justify-center ${kpis.targetCited ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
          {kpis.targetCited ? '✓' : '·'}
        </div>
        <div className="min-w-0">
          <div className={`text-[12px] font-semibold ${kpis.targetCited ? 'text-emerald-900' : 'text-slate-700'}`}>
            {kpis.targetCited ? t('domain_cited_yes') : t('domain_cited_no')}
          </div>
        </div>
      </div>

      {/* Best engine + top source */}
      <div className="rounded-xl border border-slate-200 bg-white p-3 flex items-start gap-2.5">
        <div className="shrink-0 w-7 h-7 rounded-lg bg-gradient-to-br from-slate-50 to-slate-100 border border-slate-200 flex items-center justify-center">
          {engineMeta && Icon ? <Icon size={14} className={engineMeta.accent} /> : null}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">{t('best_engine')}</div>
          <div className="text-[12px] font-semibold text-slate-900 truncate">{engineMeta?.name || kpis.engine}</div>
          {kpis.topSource && (
            <div className="text-[10px] text-slate-500 truncate mt-0.5">
              {t('top_source')}: <span className="font-medium text-slate-700">{kpis.topSource.domain}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function QueryListSkeleton() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-1 space-y-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-xl border border-slate-200 bg-white p-4 animate-pulse">
            <div className="h-4 w-3/4 bg-slate-200 rounded mb-2" />
            <div className="h-3 w-1/2 bg-slate-100 rounded mb-3" />
            <div className="flex gap-1.5">
              {[0, 1, 2, 3].map((j) => (
                <div key={j} className="w-6 h-6 bg-slate-100 rounded" />
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="lg:col-span-2">
        <div className="rounded-xl border border-slate-200 bg-white p-6 animate-pulse">
          <div className="h-4 w-1/3 bg-slate-200 rounded mb-4" />
          <div className="space-y-2">
            <div className="h-3 w-full bg-slate-100 rounded" />
            <div className="h-3 w-5/6 bg-slate-100 rounded" />
          </div>
        </div>
      </div>
    </div>
  )
}

function EmptyPromptState({ onSuggest, onNew, t }: { onSuggest: () => void; onNew: () => void; t: T }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-gradient-to-br from-slate-50 to-white p-10 text-center">
      <div className="mx-auto w-12 h-12 rounded-xl bg-gradient-to-br from-violet-100 to-indigo-100 flex items-center justify-center mb-3 shadow-sm">
        <SparkleIcon size={22} className="text-indigo-600" />
      </div>
      <h3 className="text-base font-semibold text-slate-900 mb-1">{t('no_queries')}</h3>
      <p className="text-sm text-slate-500 mb-5 max-w-sm mx-auto">{t('no_queries_help')}</p>
      <div className="flex gap-2 justify-center">
        <Button variant="outline" onClick={onSuggest}>{t('recommend_questions')}</Button>
        <Button onClick={onNew}>{t('new_query')}</Button>
      </div>
    </div>
  )
}

function ResultSkeleton({ t }: { t: T }) {
  return (
    <div className="rounded-2xl border border-slate-200/70 bg-white shadow-md overflow-hidden animate-pulse">
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/40">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-slate-200" />
          <div>
            <div className="h-4 w-24 bg-slate-200 rounded mb-1.5" />
            <div className="h-3 w-20 bg-slate-100 rounded" />
          </div>
        </div>
        <div className="flex gap-2">
          <div className="h-6 w-20 bg-slate-200 rounded-full" />
          <div className="h-6 w-20 bg-slate-200 rounded-full" />
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 p-6">
        <div className="lg:col-span-2 space-y-3">
          <div className="h-4 bg-slate-200 rounded w-full" />
          <div className="h-4 bg-slate-200 rounded w-[92%]" />
          <div className="h-4 bg-slate-200 rounded w-[85%]" />
          <div className="h-4 bg-slate-100 rounded w-[70%]" />
        </div>
        <div className="space-y-2">
          <div className="h-12 bg-slate-100 rounded-xl" />
          <div className="h-12 bg-slate-100 rounded-xl" />
        </div>
      </div>
      <div className="border-t border-slate-100 px-6 py-3 flex items-center gap-2">
        <div className="w-3.5 h-3.5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        <span className="text-sm text-blue-700 font-medium">{t('scanning_engine')}</span>
      </div>
    </div>
  )
}

function ResultWorkspace({
  result,
  responseIsRTL,
  runStatus,
  completedAt,
  t,
}: {
  result: ResultRow
  responseIsRTL: boolean
  runStatus: string
  completedAt: string | null
  t: T
}) {
  const engineMeta = ENGINE_META[result.engine] || null
  const Icon = engineMeta?.Icon
  const isError = result.status === 'error' || runStatus === 'failed'

  // Parse into typed blocks for proper markdown rendering
  const blocks = useMemo(
    () => parseBlocks(result.responseText || result.responseSummary || ''),
    [result.responseText, result.responseSummary]
  )

  const paragraphs = useMemo(
    () => toParagraphs(result.responseText || result.responseSummary || ''),
    [result.responseText, result.responseSummary]
  )

  // Raw response collapsed by default — insights are the primary view
  const [expanded, setExpanded] = useState(false)

  // Extract concise summary: first 1-2 text blocks for preview
  const summaryBlock = useMemo(() => {
    const firstText = blocks.find((b) => b.type === 'text')
    if (firstText) return firstText
    return blocks[0] ?? null
  }, [blocks])

  const sortedCitations = useMemo(() => {
    const list = [...result.citations]
    list.sort((a, b) => {
      if (a.is_target_domain && !b.is_target_domain) return -1
      if (!a.is_target_domain && b.is_target_domain) return 1
      const ap = a.citation_position ?? 9999
      const bp = b.citation_position ?? 9999
      return ap - bp
    })
    return list
  }, [result.citations])

  // Detect Hebrew once for AIInsightCards
  const isHebrewResp = responseIsRTL

  return (
    <article className="rounded-2xl border border-slate-200/70 bg-white shadow-md overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-white to-slate-50/40">
        <div className="flex items-center gap-3">
          {engineMeta && Icon ? (
            <>
              <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${engineMeta.bg} border border-slate-200/80 flex items-center justify-center shadow-sm`}>
                <Icon size={20} className={engineMeta.accent} />
              </div>
              <div>
                <div className="font-semibold text-slate-900">{engineMeta.name}</div>
                <div className="text-xs text-slate-500">
                  {formatRelativeTime(completedAt || result.scannedAt, t('just_now'))}
                </div>
              </div>
            </>
          ) : (
            <div className="font-semibold text-slate-900">{result.engine}</div>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {result.mentioned && (
            <Badge variant="info" className="!text-xs">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-500 me-1" />
              {t('mentioned')}
            </Badge>
          )}
          {result.targetCited && (
            <Badge variant="success" className="!text-xs">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 me-1" />
              {t('target_cited')}
            </Badge>
          )}
          {isError ? <Badge variant="danger">{t('error')}</Badge> : <Badge variant="success">{t('success')}</Badge>}
        </div>
      </header>

      {isError ? (
        <div className="px-6 py-4 text-sm text-red-700 bg-red-50/60">
          {result.errorMessage || t('error')}
        </div>
      ) : (
        <div className="p-6 space-y-6">
          {/* AI INSIGHTS — primary view */}
          <AIInsightCards
            input={{
              responseText: result.responseText,
              mentioned: result.mentioned,
              targetCited: result.targetCited,
              citations: result.citations,
              engine: result.engine,
              targetDomain: null,
              targetBrand: null,
            }}
            isHebrew={isHebrewResp}
          />

          {/* Executive Summary — short preview of AI answer */}
          {summaryBlock && (
            <div className="rounded-xl border border-slate-200/70 bg-gradient-to-br from-indigo-50/30 to-white p-5">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[10px] font-bold uppercase tracking-widest text-indigo-700">
                  {isHebrewResp ? '💡 תקציר תשובת AI' : '💡 AI Answer Summary'}
                </span>
              </div>
              <div
                dir={responseIsRTL ? 'rtl' : 'ltr'}
                className={`text-[15px] leading-[1.7] text-slate-700 ${responseIsRTL ? 'text-right' : 'text-left'} max-w-[72ch]`}
              >
                {summaryBlock.type === 'heading' || summaryBlock.type === 'text' ? (
                  <p className="line-clamp-4">{summaryBlock.text}</p>
                ) : (
                  <p className="line-clamp-4">{summaryBlock.text}</p>
                )}
              </div>
            </div>
          )}

          {/* Full Response — COLLAPSED BY DEFAULT */}
          {(blocks.length > 0 || paragraphs.length > 0) && (
            <div className="rounded-xl border border-slate-200/70 bg-white overflow-hidden">
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="w-full flex items-center justify-between gap-3 px-5 py-3 bg-slate-50/60 hover:bg-slate-100/60 transition text-start"
              >
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                    {isHebrewResp ? '📄 תשובת AI מלאה' : '📄 Full AI Response'}
                  </span>
                  <span className="text-[10px] text-slate-400">
                    ({blocks.length || paragraphs.length} {isHebrewResp ? 'בלוקים' : 'blocks'})
                  </span>
                </div>
                <span className="text-xs font-semibold text-indigo-600">
                  {expanded ? (isHebrewResp ? 'הסתר ▲' : 'Hide ▲') : (isHebrewResp ? 'הצג ▼' : 'Show ▼')}
                </span>
              </button>
              {expanded && (
                <div
                  dir={responseIsRTL ? 'rtl' : 'ltr'}
                  className={`px-6 py-5 border-t border-slate-100 max-w-[68ch] ${responseIsRTL ? 'text-right' : 'text-left'}`}
                >
                  <MarkdownBlocks blocks={blocks} />
                </div>
              )}
            </div>
          )}

          {/* Sources (compact, full-width below) */}
          {sortedCitations.length > 0 && (
            <div className="rounded-xl border border-slate-200/70 bg-white p-5">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                  {isHebrewResp ? '🔗 ' : '🔗 '}{t('sources')}
                </h4>
                <span className="text-[11px] text-slate-400">{sortedCitations.length}</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {sortedCitations.map((c) => (
                  <CitationCardSmall key={c.id} citation={c} yourDomainLabel={t('your_domain')} />
                ))}
              </div>
            </div>
          )}

          {(blocks.length === 0 && paragraphs.length === 0) && (
            <p className="text-sm text-slate-400 italic">{t('no_response')}</p>
          )}
        </div>
      )}
    </article>
  )
}

function MarkdownBlocks({ blocks }: { blocks: ReturnType<typeof parseBlocks> }) {
  const grouped: Array<
    | { kind: 'block'; block: ReturnType<typeof parseBlocks>[number] }
    | { kind: 'list-bullet'; items: string[] }
    | { kind: 'list-numbered'; items: Array<{ index: number; text: string }> }
  > = []

  for (const b of blocks) {
    const last = grouped[grouped.length - 1]
    if (b.type === 'bullet') {
      if (last && last.kind === 'list-bullet') {
        last.items.push(b.text)
      } else {
        grouped.push({ kind: 'list-bullet', items: [b.text] })
      }
    } else if (b.type === 'numbered') {
      if (last && last.kind === 'list-numbered') {
        last.items.push({ index: b.index, text: b.text })
      } else {
        grouped.push({ kind: 'list-numbered', items: [{ index: b.index, text: b.text }] })
      }
    } else {
      grouped.push({ kind: 'block', block: b })
    }
  }

  return (
    <div className="space-y-4">
      {grouped.map((g, i) => {
        if (g.kind === 'list-bullet') {
          return (
            <ul key={i} className="list-disc ms-5 space-y-1.5">
              {g.items.map((item, j) => (
                <li key={j} className="text-[15px] leading-[1.7] text-slate-700">
                  {item}
                </li>
              ))}
            </ul>
          )
        }
        if (g.kind === 'list-numbered') {
          return (
            <ol key={i} className="list-decimal ms-5 space-y-1.5">
              {g.items.map((item, j) => (
                <li key={j} className="text-[15px] leading-[1.7] text-slate-700">
                  {item.text}
                </li>
              ))}
            </ol>
          )
        }
        const b = g.block
        if (b.type === 'heading') {
          const headingClasses =
            b.level === 1
              ? 'text-xl font-bold text-slate-900 mt-2'
              : b.level === 2
              ? 'text-lg font-semibold text-slate-900 mt-2'
              : 'text-[15px] font-semibold text-slate-900 mt-1'
          return (
            <div key={i} className={headingClasses}>
              {b.text}
            </div>
          )
        }
        return (
          <p key={i} className="whitespace-pre-wrap text-[15px] leading-[1.8] text-slate-700">
            {b.text}
          </p>
        )
      })}
    </div>
  )
}

function CitationCardSmall({
  citation,
  yourDomainLabel,
}: {
  citation: Citation
  yourDomainLabel: string
}) {
  const [imgError, setImgError] = useState(false)
  const displayTitle = citation.title?.trim() || citation.domain

  return (
    <a
      href={citation.url}
      target="_blank"
      rel="noopener noreferrer"
      className={`group block p-2.5 rounded-lg border transition-all duration-200 ${
        citation.is_target_domain
          ? 'border-emerald-300 bg-emerald-50/60 hover:shadow-md hover:-translate-y-0.5'
          : 'border-slate-200/80 bg-white hover:border-slate-300 hover:shadow-md hover:-translate-y-0.5'
      }`}
    >
      <div className="flex items-start gap-2 min-w-0">
        <div className="shrink-0 w-6 h-6 rounded-md bg-slate-50 border border-slate-200 overflow-hidden flex items-center justify-center mt-0.5">
          {!imgError ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={faviconUrl(citation.domain)}
              alt=""
              width={16}
              height={16}
              loading="lazy"
              onError={() => setImgError(true)}
              className="w-4 h-4"
            />
          ) : (
            <span className="text-[8px] font-bold text-slate-400">
              {citation.domain.slice(0, 2).toUpperCase()}
            </span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[12.5px] font-semibold text-slate-900 line-clamp-2 group-hover:text-indigo-700 transition leading-snug">
            {displayTitle}
          </div>
          <div className="flex items-center gap-1.5 mt-1">
            <span className="text-[10px] text-slate-500 truncate flex-1">
              {citation.domain}
            </span>
            <ExternalLinkIcon size={10} className="text-slate-300 group-hover:text-slate-500 shrink-0 transition" />
          </div>
          {citation.is_target_domain && (
            <div className="text-[9px] font-semibold text-emerald-700 mt-1">
              ✓ {yourDomainLabel}
            </div>
          )}
        </div>
      </div>
    </a>
  )
}
