'use client'

/**
 * AI Visibility premium dashboard section (Phase 2-D enhanced).
 * Premium SaaS layout with KPI cards, engine status cards, and polished result display.
 * Mounted inside the project page only when NEXT_PUBLIC_ENABLE_AI_VISIBILITY === 'true'.
 *
 * Capabilities:
 *  - List ai_prompts for the project
 *  - Create a new ai_prompt
 *  - Run one prompt with one engine (synchronous via existing POST /api/ai-visibility/runs)
 *  - Show KPI summary (visibility score, mentions, citations, credits)
 *  - Show engine status cards with one-click run
 *  - Show latest run result with cleaned response + premium citations table
 */

import { useCallback, useEffect, useState } from 'react'
import { Card } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import Input from '@/components/ui/Input'
import Textarea from '@/components/ui/Textarea'
import Select from '@/components/ui/Select'
import Badge from '@/components/ui/Badge'

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

const ENGINES = [
  { id: 'chatgpt', name: 'ChatGPT', emoji: '🤖' },
  { id: 'perplexity', name: 'Perplexity', emoji: '🔍' },
  { id: 'gemini', name: 'Gemini', emoji: '✨' },
  { id: 'copilot', name: 'Copilot', emoji: '🪟' },
  { id: 'grok', name: 'Grok', emoji: '⚡' },
  { id: 'google_ai_mode', name: 'Google AI', emoji: '🔎' },
]

const ENGINE_OPTIONS = ENGINES.map((e) => ({ value: e.id, label: e.name }))

/**
 * Clean display text: remove ChatGPT artifact markers and malformed characters
 * This is presentation-only; doesn't modify stored raw_response.
 */
function cleanDisplayText(text: string | null | undefined): string {
  if (!text) return ''

  let cleaned = text
    // Remove ```artifact markers (ChatGPT code fence artifacts)
    .replace(/```artifact[\s\S]*?```/g, '')
    // Remove standalone ``` markers
    .replace(/```/g, '')
    // Remove common artifact UI tokens
    .replace(/​/g, '') // zero-width space
    .replace(/﻿/g, '') // BOM
    // Clean up excessive whitespace
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  return cleaned
}

/**
 * Format date for display
 */
function formatTime(isoString: string | null | undefined): string {
  if (!isoString) return '—'
  try {
    const d = new Date(isoString)
    return d.toLocaleString('he-IL', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return '—'
  }
}

export default function AIVisibilitySection({
  projectId,
  projectCountry,
  projectLanguage,
  projectDomain,
  projectBrandName,
}: {
  projectId: string
  projectCountry: string | null
  projectLanguage: string | null
  projectDomain: string | null
  projectBrandName: string | null
}) {
  const [prompts, setPrompts] = useState<Prompt[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showNewPrompt, setShowNewPrompt] = useState(false)
  const [creating, setCreating] = useState(false)
  const [runningPromptId, setRunningPromptId] = useState<string | null>(null)
  const [engineByPrompt, setEngineByPrompt] = useState<Record<string, string>>({})
  const [latestRun, setLatestRun] = useState<RunResults | null>(null)

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
    setRunningPromptId(`${promptId}:${engine}`)
    setError(null)
    setLatestRun(null)
    try {
      const res = await fetch('/api/ai-visibility/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, promptId, engine }),
      })
      const body = await res.json()
      if (!res.ok) {
        throw new Error(body.error || `HTTP ${res.status}`)
      }
      // Fetch full results + citations
      const runId = body.runId
      const resultsRes = await fetch(`/api/ai-visibility/runs/${runId}/results`)
      if (!resultsRes.ok) {
        const errBody = await resultsRes.json().catch(() => ({}))
        throw new Error(errBody.error || `Failed to load results: HTTP ${resultsRes.status}`)
      }
      const resultsBody: RunResults = await resultsRes.json()
      setLatestRun(resultsBody)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Run failed')
    } finally {
      setRunningPromptId(null)
    }
  }

  const result = latestRun?.results?.[0] ?? null

  // Calculate aggregated KPIs from latest result
  const kpis = result
    ? {
        visibilityScore: Math.round(
          ((result.mentioned ? 40 : 0) + (result.targetCited ? 60 : 0)) / 100 * 100
        ),
        mentioned: result.mentioned,
        targetCited: result.targetCited,
        citationCount: result.citationCount,
        creditsUsed: String(result.creditsUsed),
      }
    : null

  return (
    <section id="ai-visibility" className="mb-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 text-white text-xl">
            ✨
          </div>
          <div>
            <h2 className="text-2xl font-bold text-slate-900">AI Visibility</h2>
            <p className="text-sm text-slate-600 mt-0.5">
              Track your domain's mentions and citations across AI search engines.
            </p>
          </div>
        </div>
        <Button size="md" onClick={() => setShowNewPrompt(true)} className="shrink-0">
          + New Prompt
        </Button>
      </div>

      {error && (
        <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* KPI Cards */}
      {kpis && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Card className="!p-4">
            <div className="text-xs text-slate-500 font-medium mb-1">Visibility Score</div>
            <div className="text-3xl font-bold text-slate-900">{kpis.visibilityScore}%</div>
          </Card>
          <Card className="!p-4">
            <div className="text-xs text-slate-500 font-medium mb-1">Mentioned</div>
            <div>
              <Badge variant={kpis.mentioned ? 'success' : 'neutral'}>
                {kpis.mentioned ? '✓ Yes' : '—'}
              </Badge>
            </div>
          </Card>
          <Card className="!p-4">
            <div className="text-xs text-slate-500 font-medium mb-1">Target Cited</div>
            <div>
              <Badge variant={kpis.targetCited ? 'success' : 'neutral'}>
                {kpis.targetCited ? '✓ Yes' : '—'}
              </Badge>
            </div>
          </Card>
          <Card className="!p-4">
            <div className="text-xs text-slate-500 font-medium mb-1">Total Citations</div>
            <div className="text-3xl font-bold text-slate-900">{kpis.citationCount}</div>
          </Card>
          <Card className="!p-4">
            <div className="text-xs text-slate-500 font-medium mb-1">Credits Used</div>
            <div className="text-2xl font-bold text-slate-900">{kpis.creditsUsed}</div>
          </Card>
        </div>
      )}

      {/* Engine Cards Grid */}
      {loading ? (
        <div className="text-sm text-slate-500 text-center py-8">Loading prompts...</div>
      ) : prompts.length === 0 ? (
        <Card className="!p-8 text-center">
          <div className="text-slate-500 mb-3">No AI prompts yet</div>
          <Button size="sm" onClick={() => setShowNewPrompt(true)}>
            Create your first prompt
          </Button>
        </Card>
      ) : (
        <div className="space-y-4">
          {prompts.map((prompt) => (
            <Card key={prompt.id} className="!p-0 overflow-hidden">
              {/* Prompt header */}
              <div className="bg-slate-50 border-b border-slate-200 p-4">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-slate-900 truncate">
                      {prompt.prompt}
                    </div>
                  </div>
                  {result?.promptId === prompt.id && (
                    <Badge variant="info">Last run</Badge>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {prompt.country && <Badge variant="neutral">{prompt.country}</Badge>}
                  {prompt.language && <Badge variant="neutral">{prompt.language}</Badge>}
                </div>
              </div>

              {/* Engine buttons grid */}
              <div className="grid grid-cols-2 md:grid-cols-6 gap-2 p-4">
                {ENGINES.map((engine) => {
                  const isRunning = runningPromptId === `${prompt.id}:${engine.id}`
                  const isDisabled = runningPromptId !== null && !isRunning
                  const hasResult = result?.engine === engine.id && result?.promptId === prompt.id
                  return (
                    <button
                      key={engine.id}
                      onClick={() => handleRun(prompt.id, engine.id)}
                      disabled={isDisabled}
                      className={`flex flex-col items-center gap-2 p-3 rounded-lg border transition-all ${
                        isRunning
                          ? 'border-blue-400 bg-blue-50'
                          : hasResult
                          ? result.status === 'success'
                            ? 'border-green-300 bg-green-50'
                            : 'border-red-300 bg-red-50'
                          : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                      } ${isDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                    >
                      <div className="text-xl">{engine.emoji}</div>
                      <div className="text-xs font-medium text-slate-700 text-center">
                        {engine.name}
                      </div>
                      {isRunning && (
                        <div className="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                      )}
                      {hasResult && result.status === 'success' && (
                        <div className="text-xs text-green-700 font-medium">
                          {result.citationCount} cite
                        </div>
                      )}
                      {hasResult && result.status === 'error' && (
                        <div className="text-xs text-red-700 font-medium">Error</div>
                      )}
                    </button>
                  )
                })}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Latest Result Panel */}
      {latestRun && result && result.status === 'success' && (
        <Card className="!p-6 border-2 border-green-100 bg-gradient-to-br from-green-50 to-white">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-slate-900">Latest Result</h3>
            <Badge variant="success">✓ Success</Badge>
          </div>

          {/* Response summary */}
          {result.responseSummary && (
            <Card className="!p-4 mb-4 bg-white">
              <div className="text-xs text-slate-500 font-medium mb-2">Response Summary</div>
              <div className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">
                {cleanDisplayText(result.responseSummary)}
              </div>
            </Card>
          )}

          {/* Citations table */}
          {result.citations.length > 0 && (
            <div>
              <div className="text-xs text-slate-500 font-medium mb-3">
                Citations ({result.citationCount})
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-slate-600 border-b border-slate-200">
                      <th className="text-start py-2 px-3 font-medium">#</th>
                      <th className="text-start py-2 px-3 font-medium">Title</th>
                      <th className="text-start py-2 px-3 font-medium">Domain</th>
                      <th className="text-start py-2 px-3 font-medium">Target</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.citations.map((c) => (
                      <tr key={c.id} className="border-b border-slate-100 hover:bg-slate-50 transition">
                        <td className="py-3 px-3 text-slate-500">
                          {c.citation_position ?? '—'}
                        </td>
                        <td className="py-3 px-3 text-slate-800 max-w-xs">
                          <a
                            href={c.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline truncate block"
                            title={c.title || c.url}
                          >
                            {c.title || 'Link'}
                          </a>
                        </td>
                        <td className="py-3 px-3">
                          <Badge variant="neutral">{c.domain}</Badge>
                        </td>
                        <td className="py-3 px-3">
                          {c.is_target_domain ? (
                            <Badge variant="success">✓ Your domain</Badge>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {result.citations.length === 0 && (
            <div className="text-sm text-slate-500 text-center py-4">No citations in result</div>
          )}
        </Card>
      )}

      {/* Error Result Panel */}
      {latestRun && result && result.status === 'error' && (
        <Card className="!p-6 border-2 border-red-100 bg-gradient-to-br from-red-50 to-white">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-lg font-semibold text-slate-900">Run Failed</h3>
            <Badge variant="danger">✗ Error</Badge>
          </div>
          <div className="text-sm text-red-700 mt-2">{result.errorMessage}</div>
        </Card>
      )}

      {/* New Prompt Modal */}
      <Modal
        open={showNewPrompt}
        onClose={() => setShowNewPrompt(false)}
        title="New AI Prompt"
        size="md"
      >
        <form onSubmit={handleCreatePrompt} className="space-y-4">
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
              Create Prompt
            </Button>
          </div>
        </form>
      </Modal>
    </section>
  )
}
