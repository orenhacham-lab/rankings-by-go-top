'use client'

/**
 * AI Visibility premium dashboard section.
 * Mounted inside the project page only when NEXT_PUBLIC_ENABLE_AI_VISIBILITY === 'true'.
 *
 * Visual goals: dense, polished, AI-observability dashboard feel.
 * Inline SVG engine icons (no emojis, no copyrighted logos).
 * Smart prompt suggestions (local templates) + manual create.
 * Scan history with click-to-view past results.
 * Presentation-only response text cleanup (artifacts hidden, raw_response unchanged).
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Card } from '@/components/ui/Card'
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
  return `https://www.google.com/s2/favicons?sz=32&domain=${encodeURIComponent(domain)}`
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
  const isHebrew = useMemo(
    () => (result ? false : (projectLanguage || '').toLowerCase() === 'he'),
    [result, projectLanguage]
  )
  const responseIsRTL = result
    ? /[֐-׿؀-ۿ]/.test(result.responseText || '')
    : isHebrew

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
    <section id="ai-visibility" className="mb-10">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-5">
        <div className="flex items-start gap-3">
          <div className="flex items-center justify-center w-11 h-11 rounded-xl bg-gradient-to-br from-violet-500 via-indigo-500 to-blue-500 text-white shadow-lg shadow-indigo-500/20">
            <SparkleIcon size={22} className="text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-bold text-slate-900 tracking-tight">AI Visibility</h2>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-violet-700 bg-violet-100 rounded-full px-2 py-0.5">
                Beta
              </span>
            </div>
            <p className="text-sm text-slate-600 mt-0.5">
              Monitor your brand and domain across ChatGPT, Perplexity, Gemini, Copilot, Grok and
              Google AI Mode.
            </p>
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button variant="outline" size="md" onClick={() => setShowSuggestions(true)}>
            ✨ Suggest prompts
          </Button>
          <Button size="md" onClick={() => setShowNewPrompt(true)}>
            + New prompt
          </Button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-5">
        <KpiCard
          label="Visibility score"
          value={kpis ? `${kpis.score}` : '—'}
          suffix={kpis ? '%' : undefined}
          tone={kpis ? (kpis.score >= 60 ? 'good' : kpis.score >= 20 ? 'warn' : 'flat') : 'flat'}
          hint={kpis ? null : 'Run a scan'}
        />
        <KpiCard
          label="Mentions"
          value={kpis ? (kpis.mentioned ? 'Yes' : 'No') : '—'}
          tone={kpis && kpis.mentioned ? 'good' : 'flat'}
        />
        <KpiCard
          label="Target citations"
          value={kpis ? (kpis.targetCited ? 'Yes' : 'No') : '—'}
          tone={kpis && kpis.targetCited ? 'good' : 'flat'}
        />
        <KpiCard
          label="Total citations"
          value={kpis ? String(kpis.citationCount) : '—'}
          tone={kpis && kpis.citationCount > 0 ? 'good' : 'flat'}
        />
        <KpiCard
          label="Credits used"
          value={kpis ? kpis.credits : '—'}
          tone="flat"
        />
      </div>

      {/* Prompts + engine grid */}
      {loading ? (
        <Card className="!p-8">
          <div className="text-sm text-slate-500 text-center">Loading prompts...</div>
        </Card>
      ) : prompts.length === 0 ? (
        <Card className="!p-10 text-center border-dashed">
          <div className="mx-auto w-12 h-12 rounded-xl bg-gradient-to-br from-violet-100 to-indigo-100 flex items-center justify-center mb-3">
            <SparkleIcon size={22} className="text-indigo-600" />
          </div>
          <div className="text-base font-semibold text-slate-900 mb-1">No prompts yet</div>
          <div className="text-sm text-slate-500 mb-5">
            Generate smart prompt suggestions tailored to your business, or create one manually.
          </div>
          <div className="flex gap-2 justify-center">
            <Button variant="outline" onClick={() => setShowSuggestions(true)}>
              ✨ Suggest prompts
            </Button>
            <Button onClick={() => setShowNewPrompt(true)}>+ New prompt</Button>
          </div>
        </Card>
      ) : (
        <div className="space-y-3 mb-5">
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
      {latestRun && result && (
        <div id="ai-result-viewer" className="space-y-4 mb-5">
          <ResultViewer result={result} responseIsRTL={responseIsRTL} runStatus={latestRun.run.status} />
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
}: {
  label: string
  value: string
  suffix?: string
  tone: 'good' | 'warn' | 'flat'
  hint?: string | null
}) {
  const toneClass =
    tone === 'good'
      ? 'from-emerald-50 to-white border-emerald-200/60'
      : tone === 'warn'
      ? 'from-amber-50 to-white border-amber-200/60'
      : 'from-slate-50 to-white border-slate-200/60'

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border bg-gradient-to-br ${toneClass} px-4 py-3 shadow-sm`}
    >
      <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
        {label}
      </div>
      <div className="mt-1 flex items-baseline gap-1">
        <div className="text-2xl font-bold text-slate-900 leading-tight">{value}</div>
        {suffix && <div className="text-sm text-slate-500">{suffix}</div>}
      </div>
      {hint && <div className="text-[11px] text-slate-400 mt-0.5">{hint}</div>}
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
      {/* Prompt header */}
      <div className="px-5 pt-4 pb-3 border-b border-slate-100">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
              Prompt
            </div>
            <div className="text-[15px] font-semibold text-slate-900 leading-snug">
              {prompt.prompt}
            </div>
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              {prompt.country && <Badge variant="neutral">{prompt.country}</Badge>}
              {prompt.language && <Badge variant="neutral">{prompt.language}</Badge>}
              {prompt.target_domain && (
                <Badge variant="info">{prompt.target_domain}</Badge>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Engine grid */}
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
              className={`group relative flex flex-col items-stretch gap-2 p-3 rounded-xl border text-start transition ${
                isRunning
                  ? 'border-blue-400 bg-blue-50 shadow-inner'
                  : success
                  ? 'border-emerald-300 bg-emerald-50/60'
                  : failed
                  ? 'border-red-300 bg-red-50/60'
                  : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50 hover:shadow'
              } ${isDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Icon size={20} className={meta.accent} />
                  <span className="text-sm font-semibold text-slate-800">{meta.name}</span>
                </div>
                {isRunning ? (
                  <div className="w-3.5 h-3.5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                ) : success ? (
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                ) : failed ? (
                  <span className="w-2 h-2 rounded-full bg-red-500" />
                ) : (
                  <span className="w-2 h-2 rounded-full bg-slate-300" />
                )}
              </div>

              <div className="flex items-center justify-between text-[11px] text-slate-500">
                {hasResult && success ? (
                  <span>
                    <b className="text-slate-900">{activeResult!.citationCount}</b> citations
                  </span>
                ) : hasResult && failed ? (
                  <span className="text-red-600">Failed</span>
                ) : isRunning ? (
                  <span className="text-blue-600">Scanning…</span>
                ) : (
                  <span>Click to run</span>
                )}
                {hasResult && success && activeResult?.targetCited && (
                  <Badge variant="success">cited</Badge>
                )}
                {hasResult && success && activeResult?.mentioned && !activeResult.targetCited && (
                  <Badge variant="info">mention</Badge>
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
}: {
  result: ResultRow
  responseIsRTL: boolean
  runStatus: string
}) {
  const engineMeta = ENGINE_META[result.engine] || null
  const Icon = engineMeta?.Icon
  const isError = result.status === 'error' || runStatus === 'failed'

  const paragraphs = useMemo(
    () => toParagraphs(result.responseText || result.responseSummary || ''),
    [result.responseText, result.responseSummary]
  )

  return (
    <div className="rounded-2xl border border-slate-200/70 bg-white shadow-sm overflow-hidden">
      {/* Header strip */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white">
        <div className="flex items-center gap-3">
          {engineMeta && Icon ? (
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center shadow-sm">
                <Icon size={18} className={engineMeta.accent} />
              </div>
              <div>
                <div className="text-sm font-semibold text-slate-900">{engineMeta.name}</div>
                <div className="text-[11px] text-slate-500">AI Response</div>
              </div>
            </div>
          ) : (
            <div className="text-sm font-semibold text-slate-700">{result.engine}</div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {result.mentioned && <Badge variant="info">Mentioned</Badge>}
          {result.targetCited && <Badge variant="success">Target cited</Badge>}
          {isError ? <Badge variant="danger">Error</Badge> : <Badge variant="success">Success</Badge>}
        </div>
      </div>

      {isError ? (
        <div className="px-5 py-4 text-sm text-red-700 bg-red-50">
          {result.errorMessage || 'Scan failed.'}
        </div>
      ) : (
        <>
          {/* Response body */}
          <div className="px-5 py-5">
            {paragraphs.length === 0 ? (
              <div className="text-sm text-slate-500 italic">No response text returned.</div>
            ) : (
              <div
                dir={responseIsRTL ? 'rtl' : 'ltr'}
                className={`prose prose-slate prose-sm max-w-none leading-relaxed text-slate-800 ${
                  responseIsRTL ? 'text-right' : 'text-left'
                }`}
              >
                {paragraphs.map((p, i) => (
                  <p key={i} className="whitespace-pre-wrap !my-2 first:!mt-0 last:!mb-0">
                    {p}
                  </p>
                ))}
              </div>
            )}
          </div>

          {/* Citations */}
          {result.citations.length > 0 && (
            <div className="border-t border-slate-100">
              <div className="px-5 pt-4 pb-2 flex items-center justify-between">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Citations
                </div>
                <span className="text-xs text-slate-400">{result.citationCount} sources</span>
              </div>
              <ul className="px-3 pb-3 divide-y divide-slate-100">
                {result.citations.map((c) => (
                  <CitationRow key={c.id} citation={c} />
                ))}
              </ul>
            </div>
          )}

          {result.citations.length === 0 && (
            <div className="border-t border-slate-100 px-5 py-3 text-sm text-slate-500">
              No citations in this response.
            </div>
          )}
        </>
      )}
    </div>
  )
}

function CitationRow({ citation }: { citation: Citation }) {
  return (
    <li className="flex items-start gap-3 px-2 py-2.5 rounded-lg hover:bg-slate-50 transition">
      <div className="shrink-0 w-7 h-7 rounded-md bg-slate-100 border border-slate-200 overflow-hidden flex items-center justify-center">
        {/* favicon (best-effort, hides on error) */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={faviconUrl(citation.domain)}
          alt=""
          width={16}
          height={16}
          loading="lazy"
          onError={(e) => {
            ;(e.currentTarget as HTMLImageElement).style.display = 'none'
          }}
          className="rounded-sm"
        />
      </div>
      <div className="flex-1 min-w-0">
        <a
          href={citation.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-900 hover:text-blue-700 hover:underline"
        >
          <span className="truncate">{citation.title || citation.domain}</span>
          <ExternalLinkIcon size={12} className="text-slate-400 shrink-0" />
        </a>
        <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-500">
          <span className="font-mono truncate">{citation.domain}</span>
          {citation.citation_position != null && (
            <span className="text-slate-400">· #{citation.citation_position}</span>
          )}
        </div>
        {citation.snippet && (
          <div className="text-xs text-slate-500 mt-1 line-clamp-2">{citation.snippet}</div>
        )}
      </div>
      {citation.is_target_domain && (
        <div className="shrink-0">
          <Badge variant="success">Your domain</Badge>
        </div>
      )}
    </li>
  )
}
