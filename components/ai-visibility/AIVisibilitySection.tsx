'use client'

/**
 * AI Visibility premium dashboard — workspace layout optimized for AI insights.
 * Mounted inside the project page only when NEXT_PUBLIC_ENABLE_AI_VISIBILITY === 'true'.
 *
 * 3-panel design:
 * - TOP: Big KPI overview (visibility, mentioned, cited, citations, credits)
 * - MIDDLE: Prompt + premium engine grid
 * - BOTTOM: Result workspace (answer + citations sidebar on desktop, stacked mobile)
 * - Activity feed with delete capability
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
  TrashIcon,
} from './EngineIcon'
import PromptSuggestions from './PromptSuggestions'
import ScanHistory from './ScanHistory'
import { toParagraphs } from '@/lib/ai-visibility/clean-response-text'

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

function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    const now = Date.now()
    const diffSec = Math.floor((now - d.getTime()) / 1000)
    if (diffSec < 60) return 'just now'
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`
    if (diffSec < 86400 * 7) return `${Math.floor(diffSec / 86400)}d ago`
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
}: {
  projectId: string
  projectCountry: string | null
  projectLanguage: string | null
  projectDomain: string | null
  projectBrandName: string | null
  projectCity?: string | null
}) {
  const [prompts, setPrompts] = useState<Prompt[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [showNewPrompt, setShowNewPrompt] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [creating, setCreating] = useState(false)

  const [runningKey, setRunningKey] = useState<string | null>(null)
  const [latestRun, setLatestRun] = useState<RunResults | null>(null)
  const [historyRefresh, setHistoryRefresh] = useState(0)
  const [deleteConfirmRunId, setDeleteConfirmRunId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

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
    try {
      const res = await fetch(`/api/ai-visibility/runs/${runId}/delete`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'Failed to delete')
      }
      // If deleted run was selected, clear it
      if (latestRun?.run.id === runId) {
        setLatestRun(null)
      }
      setDeleteConfirmRunId(null)
      setHistoryRefresh((v) => v + 1)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed')
    } finally {
      setDeleting(false)
    }
  }

  const result = latestRun?.results?.[0] ?? null
  const responseIsRTL = result
    ? /[֐-׿؀-ۿ]/.test(result.responseText || '')
    : (projectLanguage || '').toLowerCase() === 'he'

  const kpis = result
    ? {
        score:
          result.status === 'success'
            ? Math.round(
                ((result.mentioned ? 40 : 0) + (result.targetCited ? 60 : 0))
              )
            : 0,
        mentioned: result.mentioned,
        targetCited: result.targetCited,
        citationCount: result.citationCount,
        credits: String(result.creditsUsed),
        scannedAt: result.scannedAt,
      }
    : null

  return (
    <section id="ai-visibility" className="space-y-6 mb-10">
      {/* HEADER */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 via-indigo-500 to-blue-500 text-white shadow-lg shadow-indigo-500/30">
            <SparkleIcon size={20} className="text-white" />
            <div className="absolute -inset-0.5 rounded-xl bg-gradient-to-br from-violet-400/40 to-blue-400/40 blur-md -z-10" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900 tracking-tight">AI Visibility</h2>
            <p className="text-xs text-slate-500 mt-0">Monitor across 6 AI engines</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowSuggestions(true)}>
            ✨ Suggest
          </Button>
          <Button size="sm" onClick={() => setShowNewPrompt(true)}>
            + New prompt
          </Button>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700 flex items-start gap-2">
          <span className="shrink-0 text-lg">✕</span>
          <span>{error}</span>
        </div>
      )}

      {/* TOP PANEL — BIG KPI OVERVIEW */}
      {kpis && (
        <BigKpiPanel kpis={kpis} />
      )}

      {/* MIDDLE PANEL — PROMPT + ENGINE CARDS */}
      {loading ? (
        <PromptListSkeleton />
      ) : prompts.length === 0 ? (
        <EmptyPromptState onSuggest={() => setShowSuggestions(true)} onNew={() => setShowNewPrompt(true)} />
      ) : (
        <div className="space-y-3">
          {prompts.map((p) => (
            <PromptCard
              key={p.id}
              prompt={p}
              runningKey={runningKey}
              activeResult={result?.promptId === p.id ? result : null}
              onRun={(engine) => handleRun(p.id, engine)}
            />
          ))}
        </div>
      )}

      {/* BOTTOM PANEL — RESULT WORKSPACE */}
      {runningKey && !latestRun && (
        <div id="ai-result-workspace">
          <ResultSkeleton />
        </div>
      )}
      {latestRun && result && (
        <div id="ai-result-workspace">
          <ResultWorkspace
            result={result}
            responseIsRTL={responseIsRTL}
            runStatus={latestRun.run.status}
            completedAt={latestRun.run.completedAt}
          />
        </div>
      )}

      {/* SCAN HISTORY + DELETE */}
      <ScanHistory
        projectId={projectId}
        refreshKey={historyRefresh}
        selectedRunId={latestRun?.run.id || null}
        onSelectRun={handleSelectHistoryRun}
        onDeleteRun={setDeleteConfirmRunId}
      />

      {/* DELETE CONFIRMATION MODAL */}
      <Modal
        open={deleteConfirmRunId !== null}
        onClose={() => setDeleteConfirmRunId(null)}
        title="Delete scan result?"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            This will permanently delete the AI scan result, response, and all associated citations.
            This action cannot be undone.
          </p>
          <div className="flex gap-2 justify-end">
            <Button
              variant="outline"
              onClick={() => setDeleteConfirmRunId(null)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => deleteConfirmRunId && handleDeleteRun(deleteConfirmRunId)}
              loading={deleting}
            >
              Delete permanently
            </Button>
          </div>
        </div>
      </Modal>

      {/* MODALS */}
      <Modal
        open={showNewPrompt}
        onClose={() => setShowNewPrompt(false)}
        title="New AI Prompt"
        size="md"
      >
        <form onSubmit={handleCreatePrompt} className="space-y-3">
          <Textarea
            label="Prompt"
            value={newPrompt}
            onChange={(e) => setNewPrompt(e.target.value)}
            placeholder="e.g., Best SEO agency in Israel?"
            required
            rows={3}
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Country (ISO)"
              value={newCountry}
              onChange={(e) => setNewCountry(e.target.value)}
              placeholder="IL"
            />
            <Input
              label="Language"
              value={newLanguage}
              onChange={(e) => setNewLanguage(e.target.value)}
              placeholder="he"
            />
          </div>
          <Input
            label="Target domain (optional)"
            type="url"
            value={newTargetDomain}
            onChange={(e) => setNewTargetDomain(e.target.value)}
            placeholder={projectDomain || 'example.com'}
          />
          <Input
            label="Target brand (optional)"
            value={newTargetBrand}
            onChange={(e) => setNewTargetBrand(e.target.value)}
            placeholder={projectBrandName || 'Brand name'}
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setShowNewPrompt(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={creating} disabled={!newPrompt.trim()}>
              Create prompt
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
        onAdded={loadPrompts}
      />
    </section>
  )
}

/* --- Subcomponents --- */

function BigKpiPanel({ kpis }: { kpis: { score: number; mentioned: boolean; targetCited: boolean; citationCount: number; credits: string; scannedAt?: string | null } }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 rounded-2xl border border-slate-200/70 bg-gradient-to-br from-white to-slate-50/40 p-5 shadow-md">
      {/* Visibility Score — dominant card */}
      <div className="lg:col-span-2 relative overflow-hidden rounded-xl bg-gradient-to-br from-indigo-50 via-white to-indigo-50/40 border-2 border-indigo-200/60 p-5 shadow-sm">
        <div className="absolute top-0 right-0 w-20 h-20 bg-indigo-200/20 rounded-full -mr-10 -mt-10" />
        <div className="relative z-10">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-indigo-700 mb-1">
            Visibility Score
          </div>
          <div className="text-5xl font-black text-indigo-900 leading-tight">
            {kpis.score}<span className="text-2xl text-indigo-600">%</span>
          </div>
          <div className="text-xs text-indigo-600 font-medium mt-2">
            {kpis.score >= 60 ? '🔥 High visibility' : kpis.score >= 20 ? '⚠️ Moderate visibility' : '📌 Low visibility'}
          </div>
        </div>
      </div>

      {/* Mentioned */}
      <div className="relative overflow-hidden rounded-xl bg-white border border-slate-200/80 p-4 shadow-sm hover:shadow-md transition">
        <div className="absolute top-0 right-0 w-16 h-16 bg-blue-100/30 rounded-full -mr-8 -mt-8" />
        <div className="relative z-10">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
            Mentioned
          </div>
          <div className="text-3xl font-bold text-slate-900">
            {kpis.mentioned ? '✓' : '✕'}
          </div>
          <div className={`text-xs font-medium mt-1 ${kpis.mentioned ? 'text-blue-600' : 'text-slate-400'}`}>
            {kpis.mentioned ? 'In AI response' : 'Not found'}
          </div>
        </div>
      </div>

      {/* Target Cited */}
      <div className="relative overflow-hidden rounded-xl bg-white border border-slate-200/80 p-4 shadow-sm hover:shadow-md transition">
        <div className="absolute top-0 right-0 w-16 h-16 bg-emerald-100/30 rounded-full -mr-8 -mt-8" />
        <div className="relative z-10">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
            Target Cited
          </div>
          <div className="text-3xl font-bold text-slate-900">
            {kpis.targetCited ? '✓' : '✕'}
          </div>
          <div className={`text-xs font-medium mt-1 ${kpis.targetCited ? 'text-emerald-600' : 'text-slate-400'}`}>
            {kpis.targetCited ? 'As source' : 'Not cited'}
          </div>
        </div>
      </div>

      {/* Total Citations */}
      <div className="relative overflow-hidden rounded-xl bg-white border border-slate-200/80 p-4 shadow-sm hover:shadow-md transition">
        <div className="absolute top-0 right-0 w-16 h-16 bg-amber-100/30 rounded-full -mr-8 -mt-8" />
        <div className="relative z-10">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
            Citations
          </div>
          <div className="text-3xl font-bold text-slate-900">
            {kpis.citationCount}
          </div>
          <div className="text-xs text-slate-500 font-medium mt-1">
            Sources cited
          </div>
        </div>
      </div>

      {/* Credits Used */}
      <div className="relative overflow-hidden rounded-xl bg-white border border-slate-200/80 p-4 shadow-sm hover:shadow-md transition">
        <div className="absolute top-0 right-0 w-16 h-16 bg-violet-100/30 rounded-full -mr-8 -mt-8" />
        <div className="relative z-10">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
            Credits used
          </div>
          <div className="text-3xl font-bold text-slate-900">
            {kpis.credits}
          </div>
          <div className="text-xs text-slate-500 font-medium mt-1">
            This scan
          </div>
        </div>
      </div>
    </div>
  )
}

function PromptListSkeleton() {
  return (
    <div className="space-y-3">
      {[0, 1].map((i) => (
        <div
          key={i}
          className="rounded-2xl border border-slate-200/70 bg-white p-4 animate-pulse"
        >
          <div className="h-3 w-24 bg-slate-200 rounded mb-2" />
          <div className="h-5 w-2/3 bg-slate-200 rounded mb-4" />
          <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
            {[0, 1, 2, 3, 4, 5].map((j) => (
              <div key={j} className="h-20 bg-slate-100 rounded-xl" />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function EmptyPromptState({ onSuggest, onNew }: { onSuggest: () => void; onNew: () => void }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-gradient-to-br from-slate-50 to-white p-10 text-center">
      <div className="mx-auto w-12 h-12 rounded-xl bg-gradient-to-br from-violet-100 to-indigo-100 flex items-center justify-center mb-3 shadow-sm">
        <SparkleIcon size={22} className="text-indigo-600" />
      </div>
      <h3 className="text-base font-semibold text-slate-900 mb-1">No prompts yet</h3>
      <p className="text-sm text-slate-500 mb-5 max-w-sm mx-auto">
        Generate smart suggestions tailored to your business, or create one manually.
      </p>
      <div className="flex gap-2 justify-center">
        <Button variant="outline" onClick={onSuggest}>
          ✨ Suggest prompts
        </Button>
        <Button onClick={onNew}>+ New prompt</Button>
      </div>
    </div>
  )
}

function ResultSkeleton() {
  return (
    <div className="rounded-2xl border border-slate-200/70 bg-white shadow-md overflow-hidden animate-pulse">
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/40">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-slate-200" />
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
          <div className="h-4 bg-slate-200 rounded" />
          <div className="h-4 bg-slate-200 rounded" />
          <div className="h-4 bg-slate-100 rounded" />
        </div>
      </div>
    </div>
  )
}

function PromptCard({
  prompt,
  runningKey,
  activeResult,
  onRun,
}: {
  prompt: Prompt
  runningKey: string | null
  activeResult: ResultRow | null
  onRun: (engine: string) => void
}) {
  return (
    <div className="rounded-2xl border border-slate-200/70 bg-white shadow-sm hover:shadow-md transition overflow-hidden">
      <div className="px-5 pt-4 pb-3 border-b border-slate-100">
        <div className="mb-2 flex items-center gap-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Prompt
          </span>
          {prompt.country && (
            <Badge variant="neutral" className="!text-[9px] !px-1.5 !py-0">{prompt.country}</Badge>
          )}
          {prompt.language && (
            <Badge variant="neutral" className="!text-[9px] !px-1.5 !py-0">{prompt.language}</Badge>
          )}
        </div>
        <h3 className="text-[15px] font-semibold text-slate-900">{prompt.prompt}</h3>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 p-3 bg-slate-50/40">
        {ENGINE_LIST.map((engineId) => {
          const meta = ENGINE_META[engineId]
          const Icon = meta.Icon
          const isRunning = runningKey === `${prompt.id}:${engineId}`
          const isDisabled = runningKey !== null && !isRunning
          const hasResult = activeResult?.engine === engineId
          const success = hasResult && activeResult?.status === 'success'
          const failed = hasResult && activeResult?.status === 'error'

          return (
            <button
              key={engineId}
              onClick={() => onRun(engineId)}
              disabled={isDisabled}
              type="button"
              className={`group relative flex flex-col gap-2 p-3 rounded-xl border transition-all duration-200 text-start ${
                isRunning
                  ? 'border-blue-300 bg-gradient-to-br from-blue-50 to-indigo-50/60 shadow-[0_0_0_3px_rgba(99,102,241,0.1)]'
                  : success
                  ? 'border-emerald-200 bg-gradient-to-br from-emerald-50/80 to-white'
                  : failed
                  ? 'border-red-200 bg-gradient-to-br from-red-50/80 to-white'
                  : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/60 hover:shadow-md hover:-translate-y-0.5'
              } ${isDisabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Icon size={18} className={`${meta.accent} transition-transform group-hover:scale-110`} />
                  <span className="text-sm font-semibold text-slate-800">{meta.name}</span>
                </div>
                {isRunning ? (
                  <div className="w-3.5 h-3.5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                ) : success ? (
                  <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-lg shadow-emerald-400/50" />
                ) : failed ? (
                  <span className="w-2 h-2 rounded-full bg-red-500" />
                ) : (
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                )}
              </div>

              <div className="flex items-center justify-between text-[10px] text-slate-500">
                {hasResult && success ? (
                  <span>
                    <b className="text-slate-900 font-semibold">{activeResult!.citationCount}</b> citations
                  </span>
                ) : hasResult && failed ? (
                  <span className="text-red-600 font-medium">Failed</span>
                ) : isRunning ? (
                  <span className="text-blue-600 font-medium">Scanning…</span>
                ) : (
                  <span className="text-slate-400">Run</span>
                )}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function ResultWorkspace({
  result,
  responseIsRTL,
  runStatus,
  completedAt,
}: {
  result: ResultRow
  responseIsRTL: boolean
  runStatus: string
  completedAt: string | null
}) {
  const engineMeta = ENGINE_META[result.engine] || null
  const Icon = engineMeta?.Icon
  const isError = result.status === 'error' || runStatus === 'failed'

  const paragraphs = useMemo(
    () => toParagraphs(result.responseText || result.responseSummary || ''),
    [result.responseText, result.responseSummary]
  )

  const previewParagraphs = paragraphs.slice(0, 1)
  const hasMore = paragraphs.length > 1
  const [expanded, setExpanded] = useState(false)

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

  return (
    <article className="rounded-2xl border border-slate-200/70 bg-white shadow-md overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-white to-slate-50/40">
        <div className="flex items-center gap-3">
          {engineMeta && Icon ? (
            <>
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-white to-slate-50 border border-slate-200/80 flex items-center justify-center shadow-sm">
                <Icon size={20} className={engineMeta.accent} />
              </div>
              <div>
                <div className="font-semibold text-slate-900">{engineMeta.name}</div>
                <div className="text-xs text-slate-500">
                  {formatRelativeTime(completedAt || result.scannedAt)}
                </div>
              </div>
            </>
          ) : (
            <div className="font-semibold text-slate-900">{result.engine}</div>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {result.mentioned && (
            <Badge variant="info" className="!text-xs"><span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-500 me-1" />Mentioned</Badge>
          )}
          {result.targetCited && (
            <Badge variant="success" className="!text-xs"><span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 me-1" />Target cited</Badge>
          )}
          {isError ? <Badge variant="danger">Error</Badge> : <Badge variant="success">Success</Badge>}
        </div>
      </header>

      {isError ? (
        <div className="px-6 py-4 text-sm text-red-700 bg-red-50/60">
          {result.errorMessage || 'Scan failed.'}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 p-6">
          {/* Main: AI Answer Viewer */}
          <div className="lg:col-span-2">
            <div className="prose prose-slate prose-sm max-w-2xl">
              {paragraphs.length === 0 ? (
                <p className="text-sm text-slate-400 italic">No response text returned.</p>
              ) : (
                <div dir={responseIsRTL ? 'rtl' : 'ltr'} className={responseIsRTL ? 'text-right' : 'text-left'}>
                  {/* Preview */}
                  <div className="space-y-4 mb-5">
                    {previewParagraphs.map((p, i) => (
                      <p key={i} className="whitespace-pre-wrap text-[15px] leading-[1.8] text-slate-700">
                        {p}
                      </p>
                    ))}
                  </div>

                  {/* Full response */}
                  {hasMore && expanded && (
                    <div className="space-y-4 mb-5 p-4 rounded-lg bg-slate-50/40 border border-slate-100">
                      {paragraphs.slice(1).map((p, i) => (
                        <p key={i} className="whitespace-pre-wrap text-[15px] leading-[1.8] text-slate-700">
                          {p}
                        </p>
                      ))}
                    </div>
                  )}

                  {/* Toggle */}
                  {hasMore && (
                    <button
                      type="button"
                      onClick={() => setExpanded((v) => !v)}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-700 hover:underline transition"
                    >
                      {expanded ? (
                        <>Show less <span>▲</span></>
                      ) : (
                        <>Show full answer ({paragraphs.length - 1} more para{paragraphs.length - 1 === 1 ? '' : 's'}) <span>▼</span></>
                      )}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Sidebar: Citations Grid */}
          <aside className="lg:col-span-1">
            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
                Sources ({sortedCitations.length})
              </h4>
              {sortedCitations.length === 0 ? (
                <div className="text-xs text-slate-400 italic py-4">No sources cited.</div>
              ) : (
                <div className="space-y-2">
                  {sortedCitations.map((c) => (
                    <CitationCardSmall key={c.id} citation={c} />
                  ))}
                </div>
              )}
            </div>
          </aside>
        </div>
      )}
    </article>
  )
}

function CitationCardSmall({ citation }: { citation: Citation }) {
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
      <div className="flex items-start gap-1.5 min-w-0">
        <div className="shrink-0 w-5 h-5 rounded-md bg-slate-50 border border-slate-200 overflow-hidden flex items-center justify-center mt-0.5">
          {!imgError ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={faviconUrl(citation.domain)}
              alt=""
              width={14}
              height={14}
              loading="lazy"
              onError={() => setImgError(true)}
              className="w-4 h-4"
            />
          ) : (
            <span className="text-[7px] font-bold text-slate-400">
              {citation.domain.slice(0, 2).toUpperCase()}
            </span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[12px] font-semibold text-slate-900 line-clamp-2 group-hover:text-indigo-700 transition">
            {displayTitle}
          </div>
          <div className="text-[10px] text-slate-500 truncate mt-0.5">
            {citation.domain}
          </div>
          {citation.is_target_domain && (
            <div className="text-[9px] font-semibold text-emerald-700 mt-1">
              ✓ Your domain
            </div>
          )}
        </div>
      </div>
    </a>
  )
}
