'use client'

/**
 * AI Visibility — Professional dashboard with tab-based structure.
 *
 * Tabs:
 * 1. Overview — global summary + engine mention cards
 * 2. Results — scan results table with filters and detail drawer
 * 3. AI Queries — question management + recommended questions
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import Input from '@/components/ui/Input'
import Badge from '@/components/ui/Badge'
import {
  ENGINE_META,
  ExternalLinkIcon,
  SparkleIcon,
} from './EngineIcon'
import PromptSuggestions from './PromptSuggestions'
import { createI18n, isHebrew as detectHebrew } from '@/lib/ai-visibility/i18n'
import { generatePromptSuggestions, type PromptSuggestion } from '@/lib/ai-visibility/prompt-templates'

// Fixed list of supported AI engines (6 total — Claude NOT supported in ScrapeLLM)
const SUPPORTED_ENGINES = ['chatgpt', 'perplexity', 'gemini', 'copilot', 'grok', 'google_ai_mode'] as const

type ResultRow = {
  id: string
  runId: string
  promptId: string | null
  engine: string
  promptText: string
  mentioned: boolean
  targetCited: boolean
  citationCount: number
  status: string | null
  scannedAt: string | null
  citations: Array<{ domain: string; is_target_domain: boolean; url: string; title?: string | null }>
  responseText: string | null
}

type PromptRow = {
  id: string
  prompt: string
  country: string | null
  language: string | null
  target_domain: string | null
  target_brand_name: string | null
  created_at: string
}

type GlobalMetrics = {
  totalScans: number
  totalMentions: number
  totalCitations: number
  mentionRate: number
  citationRate: number
  enginesCovered: number
}

type EngineMetrics = {
  engine: string
  scans: number
  mentions: number
  citations: number
  rate: number
}

type TabType = 'overview' | 'results' | 'queries'

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

  // Tabs and core state
  const [currentTab, setCurrentTab] = useState<TabType>('overview')
  const [allResults, setAllResults] = useState<ResultRow[]>([])
  const [allPrompts, setAllPrompts] = useState<PromptRow[]>([])
  const [globalMetrics, setGlobalMetrics] = useState<GlobalMetrics | null>(null)
  const [engineMetrics, setEngineMetrics] = useState<Map<string, EngineMetrics>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [showNewPrompt, setShowNewPrompt] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [selectedResult, setSelectedResult] = useState<ResultRow | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)

  const [filterEngine, setFilterEngine] = useState<string | null>(null)
  const [filterMentioned, setFilterMentioned] = useState<boolean | null>(null)
  const [filterCited, setFilterCited] = useState<boolean | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  const [suggestedQuestions, setSuggestedQuestions] = useState<PromptSuggestion[]>([])
  const [scanningKey, setScanningKey] = useState<string | null>(null)

  // Load both scan results AND prompts in parallel
  const loadAllResults = useCallback(async () => {
    setError(null)
    setLoading(true)
    try {
      const [runsRes, promptsRes] = await Promise.all([
        fetch(`/api/ai-visibility/runs?projectId=${projectId}&limit=200`),
        fetch(`/api/ai-visibility/prompts?projectId=${projectId}`),
      ])

      if (!runsRes.ok) {
        const body = await runsRes.json().catch(() => ({}))
        throw new Error(body.error || `HTTP ${runsRes.status}`)
      }
      if (!promptsRes.ok) {
        const body = await promptsRes.json().catch(() => ({}))
        throw new Error(body.error || `HTTP ${promptsRes.status}`)
      }

      const runsData = await runsRes.json()
      const promptsData = await promptsRes.json()

      const results: ResultRow[] = (runsData.runs || [])
        .filter((run: any) => run.result)
        .map((run: any) => ({
          id: run.result.id,
          promptId: run.result.promptId || null,
          engine: run.result.engine,
          promptText: run.result.promptText || '',
          mentioned: run.result.mentioned || false,
          targetCited: run.result.targetCited || false,
          citationCount: run.result.citationCount || 0,
          status: run.result.status,
          scannedAt: run.completedAt || run.result.scannedAt,
          citations: [],
          responseText: null,
          runId: run.id,
        }))

      const promptsArr: PromptRow[] = (promptsData.prompts || []) as PromptRow[]
      const promptTextById = new Map(promptsArr.map((p) => [p.id, p.prompt]))
      const resultsWithText = results.map((r) => ({
        ...r,
        promptText: r.promptText || (r.promptId ? promptTextById.get(r.promptId) || '' : ''),
      }))

      setAllResults(resultsWithText)
      setAllPrompts(promptsArr)

      // Aggregate metrics
      const engines = new Set<string>()
      const engineMap = new Map<string, EngineMetrics>()
      let totalMentions = 0
      let totalCitations = 0

      // Initialize all supported engines with 0 metrics
      SUPPORTED_ENGINES.forEach((engine) => {
        engineMap.set(engine, {
          engine,
          scans: 0,
          mentions: 0,
          citations: 0,
          rate: 0,
        })
      })

      // Aggregate from results
      resultsWithText.forEach((r) => {
        if (r.status === 'success' && (SUPPORTED_ENGINES as readonly string[]).includes(r.engine)) {
          engines.add(r.engine)
          if (r.mentioned) totalMentions++
          if (r.targetCited) totalCitations++

          const existing = engineMap.get(r.engine) || {
            engine: r.engine,
            scans: 0,
            mentions: 0,
            citations: 0,
            rate: 0,
          }
          existing.scans++
          if (r.mentioned) existing.mentions++
          existing.citations += r.citationCount
          existing.rate = existing.scans > 0 ? Math.round((existing.mentions / existing.scans) * 100) : 0
          engineMap.set(r.engine, existing)
        }
      })

      const successfulScans = resultsWithText.filter((r) => r.status === 'success').length
      if (successfulScans > 0 || resultsWithText.length > 0) {
        setGlobalMetrics({
          totalScans: successfulScans,
          totalMentions,
          totalCitations,
          mentionRate: successfulScans > 0 ? Math.round((totalMentions / successfulScans) * 100) : 0,
          citationRate: successfulScans > 0 ? Math.round((totalCitations / successfulScans) * 100) : 0,
          enginesCovered: engines.size,
        })
      } else {
        setGlobalMetrics({
          totalScans: 0,
          totalMentions: 0,
          totalCitations: 0,
          mentionRate: 0,
          citationRate: 0,
          enginesCovered: 0,
        })
      }

      setEngineMetrics(engineMap)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load results')
    } finally {
      setLoading(false)
    }
  }, [projectId])

  // Generate smart question suggestions
  useEffect(() => {
    const suggestions = generatePromptSuggestions({
      businessName: projectBrandName,
      domain: projectDomain,
      city: projectCity || null,
      country: projectCountry,
      language: projectLanguage,
      keywords: projectKeywords,
      shuffle: false,
    })
    setSuggestedQuestions(suggestions.slice(0, 4))
  }, [projectBrandName, projectDomain, projectCity, projectCountry, projectLanguage, projectKeywords])

  useEffect(() => {
    loadAllResults()
  }, [loadAllResults])

  // Build a set of "scanned" prompt × engine combinations
  const scannedSet = useMemo(() => {
    const s = new Set<string>()
    allResults.forEach((r) => {
      if (r.promptId && r.status === 'success') {
        s.add(`${r.promptId}:${r.engine}`)
      }
    })
    return s
  }, [allResults])

  // Scan trigger for a specific prompt × engine
  const scanEngine = useCallback(
    async (promptId: string, engine: string) => {
      const key = `${promptId}:${engine}`
      setScanningKey(key)
      setError(null)
      try {
        const res = await fetch('/api/ai-visibility/runs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId, promptId, engine }),
        })
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.error || `HTTP ${res.status}`)
        }
        await loadAllResults()
        // Switch to Results tab and auto-open the drawer for the completed scan
        setCurrentTab('results')
        // Find the newly completed result
        setTimeout(() => {
          const latestResult = allResults.find(
            (r) => r.promptId === promptId && r.engine === engine && r.status === 'success'
          )
          if (latestResult) {
            setSelectedResult(latestResult)
            setDrawerOpen(true)
          }
        }, 100)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Scan failed')
      } finally {
        setScanningKey(null)
      }
    },
    [projectId, loadAllResults, allResults]
  )

  // Filter results — exclude any unsupported engines
  const filteredResults = useMemo(() => {
    return allResults.filter((r) => {
      if (!(SUPPORTED_ENGINES as readonly string[]).includes(r.engine)) return false
      if (filterEngine && r.engine !== filterEngine) return false
      if (filterMentioned !== null && r.mentioned !== filterMentioned) return false
      if (filterCited !== null && r.targetCited !== filterCited) return false
      if (searchQuery && !r.promptText.toLowerCase().includes(searchQuery.toLowerCase())) return false
      return true
    })
  }, [allResults, filterEngine, filterMentioned, filterCited, searchQuery])

  if (loading) {
    return (
      <section id="ai-visibility" className="space-y-6 mb-10">
        <div className="space-y-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="rounded-xl border border-slate-200 bg-white p-4 animate-pulse">
              <div className="h-4 w-2/3 bg-slate-200 rounded mb-3" />
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {[0, 1, 2, 3].map((j) => (
                  <div key={j} className="h-12 bg-slate-100 rounded" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    )
  }

  return (
    <section id="ai-visibility" className="space-y-6 mb-10" dir={isHebrew ? 'rtl' : 'ltr'}>
      {/* HEADER */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 via-indigo-500 to-blue-500 text-white shadow-lg shadow-indigo-500/30">
            <SparkleIcon size={20} className="text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900 tracking-tight">{t('ai_visibility')}</h2>
            <p className="text-xs text-slate-500 mt-0">{t('monitor_engines')}</p>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700 flex items-start gap-2">
          <span className="shrink-0">✕</span>
          <span>{error}</span>
        </div>
      )}

      {/* TAB BAR */}
      <div className="flex gap-2 border-b border-slate-200">
        {(['overview', 'results', 'queries'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setCurrentTab(tab)}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition ${
              currentTab === tab
                ? 'border-indigo-600 text-indigo-700'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            {tab === 'overview' && t('tab_overview')}
            {tab === 'results' && t('tab_results')}
            {tab === 'queries' && t('tab_queries')}
          </button>
        ))}
      </div>

      {/* TAB 1: OVERVIEW */}
      {currentTab === 'overview' && globalMetrics && (
        <>
          <OverviewSummaryStrip metrics={globalMetrics} totalResults={allResults.length} t={t} />
          <EngineMentionCards metrics={engineMetrics} t={t} />
        </>
      )}

      {/* TAB 2: RESULTS */}
      {currentTab === 'results' && (
        <>
          {/* FILTER BAR */}
          <div className="flex flex-wrap gap-2 items-center rounded-lg border border-slate-200 bg-white p-3">
            <Input
              placeholder={t('search')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 min-w-[200px]"
            />
            <select
              value={filterEngine || ''}
              onChange={(e) => setFilterEngine(e.target.value || null)}
              className="text-sm border border-slate-200 rounded-lg px-2 py-1.5"
            >
              <option value="">{t('all_engines')}</option>
              {SUPPORTED_ENGINES.map((e) => (
                <option key={e} value={e}>
                  {ENGINE_META[e as keyof typeof ENGINE_META]?.name || e}
                </option>
              ))}
            </select>
            <select
              value={filterMentioned === null ? '' : filterMentioned ? 'yes' : 'no'}
              onChange={(e) => setFilterMentioned(e.target.value === '' ? null : e.target.value === 'yes')}
              className="text-sm border border-slate-200 rounded-lg px-2 py-1.5"
            >
              <option value="">{t('all_mention')}</option>
              <option value="yes">{t('mentioned')}</option>
              <option value="no">{t('not_mentioned')}</option>
            </select>
            <select
              value={filterCited === null ? '' : filterCited ? 'yes' : 'no'}
              onChange={(e) => setFilterCited(e.target.value === '' ? null : e.target.value === 'yes')}
              className="text-sm border border-slate-200 rounded-lg px-2 py-1.5"
            >
              <option value="">{t('all_citations')}</option>
              <option value="yes">{t('target_cited')}</option>
              <option value="no">{t('not_cited')}</option>
            </select>
          </div>

          {/* RESULTS COUNT */}
          <div className="text-sm text-slate-600">
            {t('showing_results').replace('{count}', String(filteredResults.length))}
          </div>

          {/* RESULTS TABLE */}
          {filteredResults.length > 0 ? (
            <div className="space-y-2">
              {filteredResults.map((r) => (
                <ResultRowCard
                  key={r.id}
                  result={r}
                  onRowClick={async (result) => {
                    setSelectedResult(result)
                    setDrawerOpen(true)
                    // Fetch full result details on demand
                    try {
                      const res = await fetch(`/api/ai-visibility/runs/${result.runId}/results`)
                      if (res.ok) {
                        const data = await res.json()
                        const fullResult = data.results?.[0]
                        if (fullResult) {
                          setSelectedResult({
                            ...result,
                            citations: fullResult.citations || [],
                            responseText: fullResult.responseText || null,
                          })
                        }
                      }
                    } catch (e) {
                      console.error('Failed to load full result:', e)
                    }
                  }}
                  t={t}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center">
              <p className="text-sm text-slate-600">{t('no_scans')}</p>
            </div>
          )}
        </>
      )}

      {/* TAB 3: AI QUERIES */}
      {currentTab === 'queries' && (
        <>
          <div className="flex items-center justify-between gap-4 mb-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-600">
              {t('ai_queries')} ({allPrompts.length})
            </h3>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowSuggestions(true)}>
                {t('recommend_questions')}
              </Button>
              <Button size="sm" onClick={() => setShowNewPrompt(true)}>
                {t('new_query')}
              </Button>
            </div>
          </div>

          {/* QUESTIONS LIST */}
          {allPrompts.length > 0 ? (
            <div className="space-y-2">
              {allPrompts.map((p) => (
                <div key={p.id} className="rounded-lg border border-slate-200 bg-white p-3 hover:shadow-sm transition">
                  <p className="text-sm font-medium text-slate-900 mb-2 line-clamp-2">{p.prompt}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {SUPPORTED_ENGINES.map((engine) => {
                      const meta = ENGINE_META[engine as keyof typeof ENGINE_META]
                      const key = `${p.id}:${engine}`
                      const scanned = scannedSet.has(key)
                      const scanning = scanningKey === key
                      return (
                        <button
                          key={engine}
                          onClick={() => !scanning && !scanned && scanEngine(p.id, engine)}
                          disabled={scanning || scanned}
                          className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium border transition ${
                            scanned
                              ? 'bg-emerald-50 border-emerald-200 text-emerald-700 cursor-default'
                              : scanning
                              ? 'bg-slate-50 border-slate-200 text-slate-400 cursor-wait'
                              : 'bg-white border-slate-200 text-slate-700 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 cursor-pointer'
                          }`}
                        >
                          {meta && <meta.Icon size={14} className={meta.accent} />}
                          <span>{meta?.name || engine}</span>
                          {scanned && <span className="text-emerald-600">✓</span>}
                          {scanning && <span className="text-slate-400 animate-pulse">…</span>}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center">
              <p className="text-sm text-slate-600">{t('no_queries')}</p>
            </div>
          )}

          {/* RECOMMENDED QUESTIONS */}
          {suggestedQuestions.length > 0 && (
            <div className="rounded-lg border border-slate-200 bg-gradient-to-br from-indigo-50/40 to-white p-5 mt-6">
              <h3 className="text-sm font-bold uppercase tracking-wider text-indigo-700 mb-4">
                {t('smart_questions_title')}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {suggestedQuestions.map((q) => (
                  <SmartQuestionCard
                    key={q.id}
                    question={q}
                    onAdd={async () => {
                      try {
                        const res = await fetch('/api/ai-visibility/prompts', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            projectId,
                            prompt: q.prompt,
                            country: projectCountry,
                            language: projectLanguage,
                            targetDomain: projectDomain,
                            targetBrandName: projectBrandName,
                          }),
                        })
                        if (!res.ok) throw new Error('Failed to add')
                        loadAllResults()
                      } catch (e) {
                        setError(e instanceof Error ? e.message : 'Failed to add question')
                      }
                    }}
                    t={t}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* RESULT DETAIL DRAWER */}
      {selectedResult && (
        <ResultDetailDrawer
          open={drawerOpen}
          result={selectedResult}
          onClose={() => {
            setDrawerOpen(false)
            setTimeout(() => setSelectedResult(null), 300)
          }}
          t={t}
        />
      )}

      {/* MODALS */}
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
        onAdded={loadAllResults}
      />

      <NewAIQueryModal
        open={showNewPrompt}
        onClose={() => setShowNewPrompt(false)}
        projectId={projectId}
        domain={projectDomain}
        businessName={projectBrandName}
        country={projectCountry}
        language={projectLanguage}
        onAdded={loadAllResults}
        t={t}
      />
    </section>
  )
}

/* --- COMPONENTS --- */

type T = (key: any) => string

function OverviewSummaryStrip({ metrics, totalResults, t }: { metrics: GlobalMetrics; totalResults: number; t: T }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-gradient-to-r from-indigo-50 to-white p-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
            {t('total_mentions')}
          </div>
          <div className="text-4xl font-bold text-emerald-700">{metrics.totalMentions}</div>
          <div className="text-sm text-slate-600 mt-2">
            {t('out_of_results').replace('{count}', String(totalResults))}
          </div>
        </div>
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
            {t('visibility_percent')}
          </div>
          <div className="text-4xl font-bold text-indigo-700">{metrics.mentionRate}%</div>
          <div className="text-sm text-slate-600 mt-2">{t('overall')}</div>
        </div>
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
            {t('target_cited')}
          </div>
          <div className="text-4xl font-bold text-emerald-700">{metrics.totalCitations}</div>
          <div className="text-sm text-slate-600 mt-2">{t('citations')}</div>
        </div>
      </div>
    </div>
  )
}

function EngineMentionCards({ metrics, t }: { metrics: Map<string, EngineMetrics>; t: T }) {
  const engineList = SUPPORTED_ENGINES.map((engine) =>
    metrics.get(engine) || { engine, scans: 0, mentions: 0, citations: 0, rate: 0 }
  ).sort((a, b) => b.mentions - a.mentions)

  return (
    <div>
      <h3 className="text-sm font-bold uppercase tracking-wider text-slate-600 mb-4">
        {t('mentions_by_engine')}
      </h3>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {engineList.map((em) => {
          const meta = ENGINE_META[em.engine as keyof typeof ENGINE_META]
          const percent = em.scans > 0 ? Math.round((em.mentions / em.scans) * 100) : 0
          return (
            <div
              key={em.engine}
              className="rounded-lg border border-slate-200 bg-white p-4 hover:shadow-md transition flex flex-col items-center text-center"
            >
              {meta && <meta.Icon size={32} className={meta.accent} />}
              <div className="font-semibold text-slate-900 mt-3 text-sm">{meta?.name || em.engine}</div>
              <div className="text-3xl font-bold text-emerald-600 mt-2">{em.mentions}</div>
              <div className="text-xs text-slate-600 mt-2">
                {t('out_of_results').replace('{count}', String(em.scans))}
              </div>
              {em.scans > 0 && <div className="text-xs text-slate-500 mt-1">({percent}%)</div>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ResultRowCard({ result, onRowClick, t }: { result: ResultRow; onRowClick: (r: ResultRow) => void; t: T }) {
  const meta = ENGINE_META[result.engine as keyof typeof ENGINE_META]

  return (
    <div
      onClick={() => onRowClick(result)}
      className="rounded-lg border border-slate-200 bg-white p-4 hover:shadow-md hover:border-slate-300 transition cursor-pointer"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <p className="text-sm font-medium text-slate-900 line-clamp-2">{result.promptText}</p>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            {meta && <meta.Icon size={16} className={meta.accent} />}
            <span className="text-xs text-slate-600 font-medium">{meta?.name || result.engine}</span>
            {result.mentioned && <Badge variant="success" className="!text-xs">{t('mentioned')}</Badge>}
            {!result.mentioned && <Badge variant="neutral" className="!text-xs">{t('not_mentioned')}</Badge>}
            {result.targetCited && <Badge variant="success" className="!text-xs">{t('target_cited')}</Badge>}
            {!result.targetCited && <Badge variant="neutral" className="!text-xs">{t('not_cited')}</Badge>}
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {result.citationCount > 0 && (
            <Badge variant="info" className="!text-xs">
              {result.citationCount} {t('citations')}
            </Badge>
          )}
          <ExternalLinkIcon size={16} className="text-slate-400" />
        </div>
      </div>
    </div>
  )
}

function SmartQuestionCard({
  question,
  onAdd,
  t,
}: {
  question: PromptSuggestion
  onAdd: () => void
  t: T
}) {
  const intentTone: Record<string, 'info' | 'success' | 'warning' | 'neutral' | 'danger'> = {
    brand: 'info',
    comparison: 'warning',
    local: 'success',
    transactional: 'warning',
    recommendation: 'info',
    informational: 'neutral',
  }

  const intentLabel = (intent: string): string => {
    const labels: Record<string, string> = {
      brand: t('intent_brand'),
      comparison: t('intent_comparison'),
      local: t('intent_local'),
      transactional: t('intent_transactional'),
      recommendation: t('intent_recommendation'),
      informational: t('intent_informational'),
    }
    return labels[intent] || intent
  }

  return (
    <div className="flex items-start gap-3 p-3 rounded-lg bg-white border border-slate-200 hover:shadow-sm transition">
      <div className="flex-1">
        <p className="text-sm text-slate-900 font-medium line-clamp-2 mb-2">{question.prompt}</p>
        <div className="flex items-center gap-1.5">
          <Badge variant={intentTone[question.intent] || 'neutral'} className="!text-[9px]">
            {intentLabel(question.intent)}
          </Badge>
          <span className="text-[10px] text-slate-500">{question.qualityScore}%</span>
        </div>
      </div>
      <button
        onClick={onAdd}
        className="shrink-0 w-8 h-8 rounded-lg bg-indigo-100 text-indigo-700 hover:bg-indigo-200 transition flex items-center justify-center"
      >
        +
      </button>
    </div>
  )
}

function ResultDetailDrawer({
  open,
  result,
  onClose,
  t,
}: {
  open: boolean
  result: ResultRow
  onClose: () => void
  t: T
}) {
  if (!open) return null

  const engineMeta = ENGINE_META[result.engine as keyof typeof ENGINE_META]

  function cleanResponseText(text: string): string {
    if (!text) return ''
    return text
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/__([^_]+)__/g, '$1')
      .replace(/_([^_]+)_/g, '$1')
      .replace(/^#+\s+/gm, '')
      .replace(/\[\[\d+\]\]/g, '')
      .replace(/\[\d+\]/g, '')
      .replace(/\(\[[^\]]+\]\[[^\]]+\]\)/g, '')
      .replace(/\(\[[^\]]+\]\)/g, '')
      .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')
      .replace(/^[\s]*[-*+]\s+/gm, '• ')
      .trim()
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-end" onClick={onClose}>
      <div
        className="bg-white w-full max-w-2xl h-full overflow-y-auto shadow-xl animate-in slide-in-from-right"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drawer Header */}
        <div className="sticky top-0 border-b border-slate-200 bg-white p-6 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900 mb-1">{result.promptText}</h2>
            <p className="text-sm text-slate-500">{engineMeta?.name || result.engine}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-2xl leading-none">
            ×
          </button>
        </div>

        {/* Drawer Content */}
        <div className="space-y-6 p-6">
          {/* Scan Info */}
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <h3 className="text-sm font-semibold text-slate-900 mb-3">{t('scan_activity')}</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-xs text-slate-600">{t('mentioned')}</div>
                <div className={`text-lg font-bold ${result.mentioned ? 'text-emerald-700' : 'text-slate-400'}`}>
                  {result.mentioned ? '✓' : '—'}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-600">{t('target_cited')}</div>
                <div className={`text-lg font-bold ${result.targetCited ? 'text-emerald-700' : 'text-slate-400'}`}>
                  {result.targetCited ? '✓' : '—'}
                </div>
              </div>
            </div>
          </div>

          {/* Citations */}
          {result.citations.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-slate-900">
                {t('sources')} ({result.citations.length})
              </h3>
              <div className="space-y-2">
                {result.citations.map((c, i) => (
                  <a
                    key={i}
                    href={c.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block p-2 rounded-lg border border-slate-200 hover:border-slate-300 hover:shadow-sm transition"
                  >
                    <div className="flex items-center gap-2 text-sm">
                      <span className={`font-medium ${c.is_target_domain ? 'text-emerald-700' : 'text-slate-900'}`}>
                        {c.domain}
                      </span>
                      {c.is_target_domain && <Badge variant="success" className="!text-xs">{t('your_domain')}</Badge>}
                    </div>
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Response Preview */}
          {result.responseText && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-slate-900">{t('ai_answer')}</h3>
              <div className="text-sm text-slate-600 bg-slate-50 rounded-lg p-4 space-y-2 max-h-96 overflow-y-auto">
                {cleanResponseText(result.responseText)
                  .split('\n')
                  .map((line, i) => (
                    <p key={i} className="leading-relaxed">
                      {line || <br />}
                    </p>
                  ))}
              </div>
            </div>
          )}
        </div>

        {/* Drawer Footer */}
        <div className="sticky bottom-0 border-t border-slate-200 bg-white p-6">
          <Button variant="outline" onClick={onClose} className="w-full">
            {t('close')}
          </Button>
        </div>
      </div>
    </div>
  )
}

function NewAIQueryModal({
  open,
  onClose,
  projectId,
  domain,
  businessName,
  country,
  language,
  onAdded,
  t,
}: {
  open: boolean
  onClose: () => void
  projectId: string
  domain: string | null
  businessName: string | null
  country: string | null
  language: string | null
  onAdded: () => void
  t: T
}) {
  const [prompt, setPrompt] = useState('')
  const [targetDomain, setTargetDomain] = useState(domain || '')
  const [targetBrand, setTargetBrand] = useState(businessName || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async () => {
    if (!prompt.trim()) {
      setError('Query is required')
      return
    }

    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/ai-visibility/prompts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          prompt: prompt.trim(),
          country,
          language,
          targetDomain: targetDomain || null,
          targetBrandName: targetBrand || null,
        }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `HTTP ${res.status}`)
      }

      setPrompt('')
      setTargetDomain(domain || '')
      setTargetBrand(businessName || '')
      onAdded()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create query')
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  const isHebrew = detectHebrew(language, country)

  return (
    <Modal open={open} onClose={onClose} title={t('new_ai_query_title')} size="md">
      <div className="space-y-4" dir={isHebrew ? 'rtl' : 'ltr'}>
        {error && (
          <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>
        )}

        <div>
          <label className="block text-sm font-medium text-slate-900 mb-2">{t('query_label')}</label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={t('query_label')}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm resize-none"
            rows={3}
            disabled={saving}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-900 mb-2">{t('target_domain_label')}</label>
          <Input
            type="text"
            value={targetDomain}
            onChange={(e) => setTargetDomain(e.target.value)}
            placeholder={domain || t('target_domain_label')}
            disabled={saving}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-900 mb-2">{t('target_brand_label')}</label>
          <Input
            type="text"
            value={targetBrand}
            onChange={(e) => setTargetBrand(e.target.value)}
            placeholder={businessName || t('target_brand_label')}
            disabled={saving}
          />
        </div>

        <div className="flex gap-2 border-t border-slate-200 pt-3">
          <Button variant="outline" onClick={onClose} disabled={saving} className="flex-1">
            {t('cancel')}
          </Button>
          <Button onClick={handleSubmit} loading={saving} className="flex-1">
            {t('create_query')}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
