'use client'

/**
 * AI Visibility minimal UI section (Phase 2-D).
 * Mounted inside the project page only when NEXT_PUBLIC_ENABLE_AI_VISIBILITY === 'true'.
 *
 * Capabilities (minimal):
 *  - List ai_prompts for the project
 *  - Create a new ai_prompt
 *  - Run one prompt with one engine (synchronous via existing POST /api/ai-visibility/runs)
 *  - Show latest run summary + result + citations table
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

const ENGINE_OPTIONS = [
  { value: 'perplexity', label: 'Perplexity' },
  { value: 'chatgpt', label: 'ChatGPT' },
  { value: 'gemini', label: 'Gemini' },
  { value: 'copilot', label: 'Copilot' },
  { value: 'grok', label: 'Grok' },
  { value: 'google_ai_mode', label: 'Google AI Mode' },
]

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

  async function handleRun(promptId: string) {
    const engine = engineByPrompt[promptId] || 'perplexity'
    setRunningPromptId(promptId)
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

  return (
    <div className="mt-8">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">AI Visibility</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Run a single prompt against an AI search engine and view mentions + citations.
          </p>
        </div>
        <Button size="sm" onClick={() => setShowNewPrompt(true)}>
          + New AI Prompt
        </Button>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-sm text-slate-500">Loading prompts...</div>
      ) : prompts.length === 0 ? (
        <Card>
          <div className="text-sm text-slate-500 text-center py-6">
            No AI prompts yet. Click <b>+ New AI Prompt</b> to create one.
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {prompts.map((p) => {
            const isRunning = runningPromptId === p.id
            const selectedEngine = engineByPrompt[p.id] || 'perplexity'
            return (
              <Card key={p.id}>
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-800 truncate">
                      {p.prompt}
                    </div>
                    <div className="flex flex-wrap gap-2 mt-1.5 text-xs text-slate-500">
                      {p.country && <Badge variant="neutral">{p.country}</Badge>}
                      {p.language && <Badge variant="neutral">{p.language}</Badge>}
                      {p.target_domain && (
                        <span className="font-mono">domain: {p.target_domain}</span>
                      )}
                      {p.target_brand_name && (
                        <span>brand: {p.target_brand_name}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="w-40">
                      <Select
                        options={ENGINE_OPTIONS}
                        value={selectedEngine}
                        onChange={(e) =>
                          setEngineByPrompt((prev) => ({ ...prev, [p.id]: e.target.value }))
                        }
                        disabled={isRunning}
                      />
                    </div>
                    <Button
                      size="sm"
                      loading={isRunning}
                      disabled={isRunning || runningPromptId !== null}
                      onClick={() => handleRun(p.id)}
                    >
                      {isRunning ? 'Running…' : 'Run'}
                    </Button>
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {/* Latest run result */}
      {latestRun && result && (
        <div className="mt-6">
          <h3 className="text-base font-semibold text-slate-800 mb-3">Latest Run Result</h3>

          <Card className="mb-4">
            <div className="grid grid-cols-2 md:grid-cols-6 gap-3 text-xs">
              <div>
                <div className="text-slate-500">Engine</div>
                <div className="font-medium text-slate-800">{result.engine}</div>
              </div>
              <div>
                <div className="text-slate-500">Status</div>
                <div>
                  <Badge variant={latestRun.run.status === 'completed' ? 'success' : 'danger'}>
                    {latestRun.run.status}
                  </Badge>
                </div>
              </div>
              <div>
                <div className="text-slate-500">Mentioned</div>
                <div>
                  <Badge variant={result.mentioned ? 'success' : 'neutral'}>
                    {result.mentioned ? 'yes' : 'no'}
                  </Badge>
                </div>
              </div>
              <div>
                <div className="text-slate-500">Target Cited</div>
                <div>
                  <Badge variant={result.targetCited ? 'success' : 'neutral'}>
                    {result.targetCited ? 'yes' : 'no'}
                  </Badge>
                </div>
              </div>
              <div>
                <div className="text-slate-500">Citations</div>
                <div className="font-medium text-slate-800">{result.citationCount}</div>
              </div>
              <div>
                <div className="text-slate-500">Credits used</div>
                <div className="font-medium text-slate-800">{String(result.creditsUsed)}</div>
              </div>
            </div>
          </Card>

          {result.errorMessage && (
            <Card className="mb-4">
              <div className="text-xs text-slate-500 mb-1">Error</div>
              <div className="text-sm text-red-700 whitespace-pre-wrap">{result.errorMessage}</div>
            </Card>
          )}

          {result.responseSummary && (
            <Card className="mb-4">
              <div className="text-xs text-slate-500 mb-1">Response summary</div>
              <div className="text-sm text-slate-800 whitespace-pre-wrap">
                {result.responseSummary}
              </div>
            </Card>
          )}

          {result.citations.length > 0 && (
            <Card>
              <div className="text-xs text-slate-500 mb-2">Citations</div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-slate-500 border-b border-slate-200">
                      <th className="text-start py-2 px-2">#</th>
                      <th className="text-start py-2 px-2">Title</th>
                      <th className="text-start py-2 px-2">Domain</th>
                      <th className="text-start py-2 px-2">URL</th>
                      <th className="text-start py-2 px-2">Target?</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.citations.map((c) => (
                      <tr key={c.id} className="border-b border-slate-100">
                        <td className="py-2 px-2 text-slate-500">
                          {c.citation_position ?? '—'}
                        </td>
                        <td className="py-2 px-2 text-slate-800 max-w-xs truncate">
                          {c.title || '—'}
                        </td>
                        <td className="py-2 px-2 font-mono text-slate-700">{c.domain}</td>
                        <td className="py-2 px-2">
                          <a
                            href={c.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline font-mono truncate inline-block max-w-xs"
                          >
                            {c.url}
                          </a>
                        </td>
                        <td className="py-2 px-2">
                          {c.is_target_domain ? (
                            <Badge variant="success">yes</Badge>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      )}

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
            placeholder="e.g. Best SEO agency in Israel?"
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
              Create
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
