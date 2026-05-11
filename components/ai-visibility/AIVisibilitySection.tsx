'use client'

/**
 * AI Visibility premium dashboard section.
 * Mounted inside the project page only when NEXT_PUBLIC_ENABLE_AI_VISIBILITY === 'true'.
 *
 * Visual goals: premium AI SaaS feel (Perplexity / Profound / Linear-style).
 * Inline SVG engine icons (no emojis, no copyrighted logos).
 * Smart prompt suggestions (local templates) + manual create.
 * Scan history as activity feed with click-to-view past results.
 * Presentation-only response text cleanup (artifacts hidden, raw_response unchanged).
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

  const [runningKey, setRunningKey] = useState<string | null>(null) // `${promptId}:${engine}`
  const [latestRun, setLatestRun] = useState<RunResults | null>(null)
  const [historyRefresh, setHistoryRefresh] = useState(0)

  // New-prompt form state
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
      // Scroll the viewer into view
      if (typeof window !== 'undefined') {
        const el = document.getElementById('ai-result-viewer')
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load run')
    }
  }

  const result = latestRun?.results?.[0] ?? null
  const responseIsRTL = result
    ? /[֐-׿؀-ۿ]/.test(result.responseText || '')
    : (projectLanguage || '').toLowerCase() === 'he'

  // KPIs derived from latest result
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
      }
    : null

  return (
    <section id="ai-visibility" className="mb-8">
      {/* Header — tightened spacing */}
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex items-center gap-3">
          <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 via-indigo-500 to-blue-500 text-white shadow-md shadow-indigo-500/25">
            <SparkleIcon size={20} className="text-white" />
            <div className="absolute -inset-0.5 rounded-xl bg-gradient-to-br from-violet-400/40 to-blue-400/40 blur-md -z-10" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-slate-900 tracking-tight">AI Visibility</h2>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-violet-700 bg-violet-100 rounded-full px-1.5 py-0.5">
                Beta
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Track your brand across ChatGPT, Perplexity, Gemini, Copilot, Grok & Google AI.
            </p>
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={() => setShowSuggestions(true)}>
            ✨ Suggest
          </Button>
          <Button size="sm" onClick={() => setShowNewPrompt(true)}>
            + New prompt
          </Button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700 flex items-start gap-2">
          <span className="shrink-0">✗</span>
          <span>{error}</span>
        </div>
      )}

      {/* KPI strip — unified gradient system */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 mb-4">
        <KpiCard
          label="Visibility"
          value={kpis ? `${kpis.score}` : '—'}
          suffix={kpis ? '%' : undefined}
          tone={kpis ? (kpis.score >= 60 ? 'good' : kpis.score >= 20 ? 'warn' : 'flat') : 'flat'}
          hint={kpis ? null : 'Run a scan'}
          accent="indigo"
        />
        <KpiCard
          label="Mentioned"
          value={kpis ? (kpis.mentioned ? 'Yes' : 'No') : '—'}
          tone={kpis && kpis.mentioned ? 'good' : 'flat'}
          accent="emerald"
        />
        <KpiCard
          label="Target cited"
          value={kpis ? (kpis.targetCited ? 'Yes' : 'No') : '—'}
          tone={kpis && kpis.targetCited ? 'good' : 'flat'}
          accent="emerald"
        />
        <KpiCard
          label="Citations"
          value={kpis ? String(kpis.citationCount) : '—'}
          tone={kpis && kpis.citationCount > 0 ? 'good' : 'flat'}
          accent="blue"
        />
        <KpiCard
          label="Credits"
          value={kpis ? kpis.credits : '—'}
          tone="flat"
          accent="slate"
        />
      </div>

      {/* Prompts + engine grid */}
      {loading ? (
        <PromptListSkeleton />
      ) : prompts.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-gradient-to-br from-slate-50/60 to-white p-10 text-center mb-4">
          <div className="mx-auto w-12 h-12 rounded-xl bg-gradient-to-br from-violet-100 to-indigo-100 flex items-center justify-center mb-3 shadow-sm">
            <SparkleIcon size={22} className="text-indigo-600" />
          </div>
          <div className="text-base font-semibold text-slate-900 mb-1">No prompts yet</div>
          <div className="text-sm text-slate-500 mb-5 max-w-md mx-auto">
            Generate smart prompt suggestions tailored to your business, or create one manually.
          </div>
          <div className="flex gap-2 justify-center">
            <Button variant="outline" onClick={() => setShowSuggestions(true)}>
              ✨ Suggest prompts
            </Button>
            <Button onClick={() => setShowNewPrompt(true)}>+ New prompt</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-2.5 mb-5">
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

      {/* Latest result viewer */}
      {runningKey && !latestRun && (
        <div id="ai-result-viewer" className="mb-5">
          <ResultSkeleton />
        </div>
      )}
      {latestRun && result && (
        <div id="ai-result-viewer" className="mb-5">
          <ResultViewer
            result={result}
            responseIsRTL={responseIsRTL}
            runStatus={latestRun.run.status}
            completedAt={latestRun.run.completedAt}
          />
        </div>
      )}

      {/* Scan history */}
      <ScanHistory
        projectId={projectId}
        refreshKey={historyRefresh}
        selectedRunId={latestRun?.run.id || null}
        onSelectRun={handleSelectHistoryRun}
      />

      {/* New Prompt Modal */}
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

      {/* Prompt suggestions modal */}
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

function KpiCard({
  label,
  value,
  suffix,
  tone,
  hint,
  accent,
}: {
  label: string
  value: string
  suffix?: string
  tone: 'good' | 'warn' | 'flat'
  hint?: string | null
  accent: 'indigo' | 'emerald' | 'blue' | 'slate'
}) {
  const accentBar =
    tone === 'good'
      ? accent === 'indigo'
        ? 'from-indigo-400 to-violet-500'
        : accent === 'emerald'
        ? 'from-emerald-400 to-teal-500'
        : accent === 'blue'
        ? 'from-blue-400 to-cyan-500'
        : 'from-slate-300 to-slate-400'
      : tone === 'warn'
      ? 'from-amber-400 to-orange-500'
      : 'from-slate-200 to-slate-300'

  const valueColor =
    tone === 'good' ? 'text-slate-900' : tone === 'warn' ? 'text-slate-900' : 'text-slate-500'

  return (
    <div className="group relative overflow-hidden rounded-xl border border-slate-200/80 bg-white px-3.5 py-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)] hover:shadow-[0_4px_12px_rgba(15,23,42,0.06)] hover:-translate-y-0.5 transition-all duration-200">
      <div className={`absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r ${accentBar}`} />
      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        {label}
      </div>
      <div className="mt-1 flex items-baseline gap-1">
        <div className={`text-2xl font-bold leading-tight tracking-tight ${valueColor}`}>{value}</div>
        {suffix && <div className="text-sm text-slate-400 font-medium">{suffix}</div>}
      </div>
      {hint && <div className="text-[10px] text-slate-400 mt-0.5">{hint}</div>}
    </div>
  )
}

function PromptListSkeleton() {
  return (
    <div className="space-y-2.5 mb-5">
      {[0, 1].map((i) => (
        <div
          key={i}
          className="rounded-2xl border border-slate-200/70 bg-white p-4 animate-pulse"
        >
          <div className="h-3 w-16 bg-slate-200 rounded mb-2" />
          <div className="h-4 w-3/4 bg-slate-200 rounded mb-3" />
          <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
            {[0, 1, 2, 3, 4, 5].map((j) => (
              <div key={j} className="h-16 bg-slate-100 rounded-xl" />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function ResultSkeleton() {
  return (
    <div className="rounded-2xl border border-slate-200/70 bg-white shadow-sm overflow-hidden animate-pulse">
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 bg-slate-50/40">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-slate-200" />
          <div>
            <div className="h-3 w-20 bg-slate-200 rounded mb-1.5" />
            <div className="h-2 w-14 bg-slate-100 rounded" />
          </div>
        </div>
        <div className="flex gap-2">
          <div className="h-5 w-16 bg-slate-200 rounded-full" />
          <div className="h-5 w-16 bg-slate-200 rounded-full" />
        </div>
      </div>
      <div className="px-6 py-6 space-y-2.5">
        <div className="h-3 bg-slate-200 rounded w-full" />
        <div className="h-3 bg-slate-200 rounded w-[92%]" />
        <div className="h-3 bg-slate-200 rounded w-[85%]" />
        <div className="h-3 bg-slate-200 rounded w-[78%]" />
        <div className="h-3 bg-slate-200 rounded w-[88%]" />
      </div>
      <div className="border-t border-slate-100 px-5 py-3 flex items-center gap-2">
        <div className="w-3.5 h-3.5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        <span className="text-sm text-blue-700 font-medium">Scanning AI engine…</span>
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
    <div className="rounded-2xl border border-slate-200/70 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] hover:shadow-[0_4px_16px_rgba(15,23,42,0.06)] transition-all duration-200 overflow-hidden">
      {/* Prompt header */}
      <div className="px-4 pt-3.5 pb-3 border-b border-slate-100">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Prompt
              </span>
              {prompt.country && (
                <Badge variant="neutral" className="!text-[10px] !px-1.5 !py-0">{prompt.country}</Badge>
              )}
              {prompt.language && (
                <Badge variant="neutral" className="!text-[10px] !px-1.5 !py-0">{prompt.language}</Badge>
              )}
            </div>
            <div className="text-[14px] font-semibold text-slate-900 leading-snug">
              {prompt.prompt}
            </div>
          </div>
        </div>
      </div>

      {/* Engine grid — premium hover/active animations */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 p-2.5 bg-slate-50/40">
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
              className={`group relative flex flex-col items-stretch gap-1.5 p-2.5 rounded-xl border text-start transition-all duration-200 ${
                isRunning
                  ? 'border-blue-300 bg-gradient-to-br from-blue-50 to-indigo-50/60 shadow-[0_0_0_3px_rgba(99,102,241,0.12)]'
                  : success
                  ? 'border-emerald-200 bg-gradient-to-br from-emerald-50/80 to-white shadow-sm'
                  : failed
                  ? 'border-red-200 bg-gradient-to-br from-red-50/80 to-white'
                  : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-gradient-to-br hover:from-slate-50/60 hover:to-white hover:shadow-md hover:-translate-y-0.5'
              } ${isDisabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Icon size={18} className={`${meta.accent} transition-transform group-hover:scale-110`} />
                  <span className="text-[13px] font-semibold text-slate-800">{meta.name}</span>
                </div>
                {isRunning ? (
                  <div className="w-3.5 h-3.5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                ) : success ? (
                  <span className="relative flex items-center">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span className="absolute inset-0 w-2 h-2 rounded-full bg-emerald-400 animate-ping opacity-30" />
                  </span>
                ) : failed ? (
                  <span className="w-2 h-2 rounded-full bg-red-500" />
                ) : (
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-300 group-hover:bg-slate-400 transition" />
                )}
              </div>

              <div className="flex items-center justify-between text-[10.5px] text-slate-500">
                {hasResult && success ? (
                  <span>
                    <b className="text-slate-900 font-semibold">{activeResult!.citationCount}</b> citations
                  </span>
                ) : hasResult && failed ? (
                  <span className="text-red-600 font-medium">Failed</span>
                ) : isRunning ? (
                  <span className="text-blue-600 font-medium">Scanning…</span>
                ) : (
                  <span className="text-slate-400">Click to run</span>
                )}
                {hasResult && success && activeResult?.targetCited && (
                  <Badge variant="success" className="!text-[9px] !px-1.5 !py-0">cited</Badge>
                )}
                {hasResult && success && activeResult?.mentioned && !activeResult.targetCited && (
                  <Badge variant="info" className="!text-[9px] !px-1.5 !py-0">mention</Badge>
                )}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function ResultViewer({
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
  const [responseExpanded, setResponseExpanded] = useState(true)

  const paragraphs = useMemo(
    () => toParagraphs(result.responseText || result.responseSummary || ''),
    [result.responseText, result.responseSummary]
  )

  const previewParagraphs = paragraphs.slice(0, 1)
  const hasMore = paragraphs.length > 1

  // Split citations: target domain first, then primary, then rest
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
    <article className="rounded-2xl border border-slate-200/70 bg-gradient-to-b from-white via-white to-slate-50/30 shadow-[0_4px_24px_rgba(15,23,42,0.06)] overflow-hidden">
      {/* Header — engine, status, timestamp */}
      <header className="flex items-center justify-between px-5 py-3 border-b border-slate-100 bg-white/60 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          {engineMeta && Icon ? (
            <>
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-white to-slate-50 border border-slate-200/80 flex items-center justify-center shadow-sm">
                <Icon size={20} className={engineMeta.accent} />
              </div>
              <div>
                <div className="text-sm font-semibold text-slate-900 leading-tight">
                  {engineMeta.name}
                </div>
                <div className="text-[11px] text-slate-500 leading-tight">
                  AI answer · {formatRelativeTime(completedAt || result.scannedAt)}
                </div>
              </div>
            </>
          ) : (
            <div className="text-sm font-semibold text-slate-700">{result.engine}</div>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {result.mentioned && (
            <Badge variant="info" className="!text-[10px]">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-500 me-1" />
              Mentioned
            </Badge>
          )}
          {result.targetCited && (
            <Badge variant="success" className="!text-[10px]">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 me-1" />
              Target cited
            </Badge>
          )}
          {isError ? (
            <Badge variant="danger" className="!text-[10px]">Error</Badge>
          ) : (
            <Badge variant="success" className="!text-[10px]">Success</Badge>
          )}
        </div>
      </header>

      {isError ? (
        <div className="px-5 py-4 text-sm text-red-700 bg-red-50/60 border-t border-red-100">
          {result.errorMessage || 'Scan failed.'}
        </div>
      ) : (
        <>
          {/* AI answer body — Perplexity/ChatGPT-like reading layout */}
          <div className="px-5 sm:px-8 py-6 sm:py-7 bg-gradient-to-b from-white to-slate-50/40">
            {paragraphs.length === 0 ? (
              <div className="text-sm text-slate-400 italic text-center py-6">
                No response text returned.
              </div>
            ) : (
              <div
                dir={responseIsRTL ? 'rtl' : 'ltr'}
                className={`mx-auto max-w-[68ch] ${
                  responseIsRTL ? 'text-right' : 'text-left'
                }`}
              >
                {/* Preview — always visible (first paragraph) */}
                <div className="space-y-4">
                  {previewParagraphs.map((p, i) => (
                    <p
                      key={i}
                      className="whitespace-pre-wrap text-[15.5px] leading-[1.85] text-slate-700 font-normal tracking-[0.005em]"
                    >
                      {p}
                    </p>
                  ))}
                </div>

                {/* Expanded — rest of paragraphs */}
                {hasMore && responseExpanded && (
                  <div className="space-y-4 mt-4">
                    {paragraphs.slice(1).map((p, i) => (
                      <p
                        key={i}
                        className="whitespace-pre-wrap text-[15.5px] leading-[1.85] text-slate-700 font-normal tracking-[0.005em]"
                      >
                        {p}
                      </p>
                    ))}
                  </div>
                )}

                {/* Toggle */}
                {hasMore && (
                  <button
                    type="button"
                    onClick={() => setResponseExpanded((v) => !v)}
                    className="mt-5 inline-flex items-center gap-1.5 text-[13px] font-medium text-indigo-600 hover:text-indigo-700 hover:underline transition"
                  >
                    {responseExpanded ? (
                      <>
                        <span>Show less</span>
                        <span className="text-xs">▲</span>
                      </>
                    ) : (
                      <>
                        <span>Show full answer · {paragraphs.length - 1} more paragraph{paragraphs.length - 1 === 1 ? '' : 's'}</span>
                        <span className="text-xs">▼</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Citations section — modern grid of cards */}
          {sortedCitations.length > 0 ? (
            <section className="border-t border-slate-100 bg-slate-50/30 px-5 sm:px-8 py-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    Sources
                  </span>
                  <span className="text-[11px] text-slate-400">·</span>
                  <span className="text-[11px] text-slate-500">{sortedCitations.length}</span>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {sortedCitations.map((c) => (
                  <CitationCard key={c.id} citation={c} />
                ))}
              </div>
            </section>
          ) : (
            <div className="border-t border-slate-100 px-5 py-4 text-xs text-slate-400 text-center bg-slate-50/30">
              No sources cited in this response.
            </div>
          )}
        </>
      )}
    </article>
  )
}

function CitationCard({ citation }: { citation: Citation }) {
  const [imgError, setImgError] = useState(false)
  const displayTitle = citation.title?.trim() || citation.domain
  const initials = citation.domain.slice(0, 2).toUpperCase()

  return (
    <a
      href={citation.url}
      target="_blank"
      rel="noopener noreferrer"
      className={`group relative flex flex-col gap-2 p-3 rounded-xl border bg-white transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 ${
        citation.is_target_domain
          ? 'border-emerald-300 bg-gradient-to-br from-emerald-50/40 to-white shadow-[0_0_0_1px_rgba(16,185,129,0.15)]'
          : 'border-slate-200/80 hover:border-slate-300'
      }`}
    >
      {/* Top row — favicon + domain + ext icon */}
      <div className="flex items-center gap-2 min-w-0">
        <div className="shrink-0 w-7 h-7 rounded-lg bg-slate-50 border border-slate-200/80 overflow-hidden flex items-center justify-center">
          {!imgError ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={faviconUrl(citation.domain)}
              alt=""
              width={20}
              height={20}
              loading="lazy"
              onError={() => setImgError(true)}
              className="w-5 h-5"
            />
          ) : (
            <span className="text-[9px] font-bold text-slate-400">{initials}</span>
          )}
        </div>
        <div className="flex-1 min-w-0 flex items-center gap-1.5">
          <span className="text-[11.5px] text-slate-500 truncate font-medium">
            {citation.domain}
          </span>
          {citation.is_target_domain && (
            <span className="shrink-0 text-[9.5px] font-semibold text-emerald-700 bg-emerald-100 rounded-full px-1.5 py-0.5">
              YOUR DOMAIN
            </span>
          )}
        </div>
        <ExternalLinkIcon size={12} className="text-slate-300 group-hover:text-slate-500 shrink-0 transition" />
      </div>

      {/* Title */}
      <div className="text-[13.5px] font-semibold text-slate-900 leading-snug line-clamp-2 group-hover:text-indigo-700 transition">
        {displayTitle}
      </div>

      {/* Snippet */}
      {citation.snippet && (
        <div className="text-[11.5px] text-slate-500 leading-relaxed line-clamp-2">
          {citation.snippet}
        </div>
      )}
    </a>
  )
}
