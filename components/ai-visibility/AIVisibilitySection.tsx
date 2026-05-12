'use client'

/**
 * AI Visibility — Premium dashboard matching competitor structure.
 *
 * Layout:
 * 1. Global overview (aggregated stats across all scans)
 * 2. Engine summary cards (one per engine)
 * 3. Filter bar (search, engine, mention/citation status)
 * 4. Compact results table (flat list of scan results)
 * 5. Detail drawer (click row to open)
 * 6. Smart Questions section (separate)
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

// Fixed list of supported AI engines — always shown, regardless of results
const SUPPORTED_ENGINES = ['chatgpt', 'perplexity', 'gemini', 'copilot', 'grok', 'google_ai_mode', 'claude'] as const

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

  const [allResults, setAllResults] = useState<ResultRow[]>([])
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

  // Load all scan results
  const loadAllResults = useCallback(async () => {
    setError(null)
    setLoading(true)
    try {
      const res = await fetch(`/api/ai-visibility/runs?projectId=${projectId}&limit=200`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `HTTP ${res.status}`)
      }
      const data = await res.json()
      const results: ResultRow[] = (data.runs || [])
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

      setAllResults(results)

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
      results.forEach((r) => {
        if (r.status === 'success') {
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

      const successfulScans = results.filter((r) => r.status === 'success').length
      if (successfulScans > 0 || results.length > 0) {
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

  useEffect(() => {
    loadAllResults()
  }, [loadAllResults])

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

  // Filter results
  const filteredResults = useMemo(() => {
    return allResults.filter((r) => {
      if (filterEngine && r.engine !== filterEngine) return false
      if (filterMentioned !== null && r.mentioned !== filterMentioned) return false
      if (filterCited !== null && r.targetCited !== filterCited) return false
      if (searchQuery && !r.promptText.toLowerCase().includes(searchQuery.toLowerCase())) return false
      return true
    })
  }, [allResults, filterEngine, filterMentioned, filterCited, searchQuery])

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
          <span className="shrink-0">✕</span>
          <span>{error}</span>
        </div>
      )}

      {loading ? (
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
      ) : (
        <>
          {/* GLOBAL OVERVIEW */}
          {globalMetrics && (
            <GlobalOverviewPanel metrics={globalMetrics} t={t} />
          )}

          {/* ENGINE SUMMARY CARDS — always show all supported engines */}
          <EngineSummaryCards metrics={engineMetrics} t={t} />

          {/* FILTER BAR — show all supported engines */}
          <FilterBar
            engines={SUPPORTED_ENGINES as unknown as string[]}
            filterEngine={filterEngine}
            filterMentioned={filterMentioned}
            filterCited={filterCited}
            searchQuery={searchQuery}
            onEngineChange={setFilterEngine}
            onMentionedChange={setFilterMentioned}
            onCitedChange={setFilterCited}
            onSearchChange={setSearchQuery}
            t={t}
          />

          {/* RESULTS TABLE */}
          {filteredResults.length > 0 ? (
            <ResultsTable
              results={filteredResults}
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
          ) : (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center">
              <p className="text-sm text-slate-600">{t('no_scans')}</p>
            </div>
          )}

          {/* SMART QUESTIONS */}
          {suggestedQuestions.length > 0 && (
            <SmartQuestionsSection
              questions={suggestedQuestions}
              projectId={projectId}
              country={projectCountry}
              language={projectLanguage}
              domain={projectDomain}
              businessName={projectBrandName}
              onAdded={loadAllResults}
              t={t}
            />
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

      {/* Manual AI Query Creation Modal */}
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

/* --- UTILITIES --- */

function cleanResponseText(text: string): string {
  if (!text) return ''

  let cleaned = text
    // Remove markdown bold/italic markers
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    // Remove markdown headings but keep text
    .replace(/^#+\s+/gm, '')
    // Remove citation syntax variations: [1], [[1]], ([domain][1]), ([Google])
    .replace(/\[\[\d+\]\]/g, '')
    .replace(/\[\d+\]/g, '')
    .replace(/\(\[[^\]]+\]\[[^\]]+\]\)/g, '')
    .replace(/\(\[[^\]]+\]\)/g, '')
    // Remove markdown link syntax [text](url) but keep text
    .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')
    // Remove trailing markdown list markers
    .replace(/^[\s]*[-*+]\s+/gm, '• ')

  return cleaned.trim()
}

/* --- COMPONENTS --- */

type T = (key: any) => string

function GlobalOverviewPanel({
  metrics,
  t,
}: {
  metrics: GlobalMetrics
  t: T
}) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 rounded-xl border border-slate-200/70 bg-gradient-to-br from-white to-slate-50/40 p-4">
      <OverviewTile
        label={t('visibility_score')}
        value={`${Math.round((metrics.mentionRate + metrics.citationRate) / 2)}%`}
        sub={t('overall')}
        tone="indigo"
      />
      <OverviewTile
        label={t('mentioned')}
        value={String(metrics.totalMentions)}
        sub={`${metrics.mentionRate}%`}
        tone="blue"
      />
      <OverviewTile
        label={t('target_cited')}
        value={String(metrics.totalCitations)}
        sub={`${metrics.citationRate}%`}
        tone="emerald"
      />
      <OverviewTile
        label={t('engine_coverage')}
        value={String(metrics.enginesCovered)}
        sub={`of 6 engines`}
        tone="amber"
      />
    </div>
  )
}

function OverviewTile({
  label,
  value,
  sub,
  tone,
}: {
  label: string
  value: string
  sub: string
  tone: 'indigo' | 'blue' | 'emerald' | 'amber'
}) {
  const bgClass =
    tone === 'indigo'
      ? 'from-indigo-50 to-white border-indigo-100'
      : tone === 'blue'
      ? 'from-blue-50 to-white border-blue-100'
      : tone === 'emerald'
      ? 'from-emerald-50 to-white border-emerald-100'
      : 'from-amber-50 to-white border-amber-100'

  const textColor =
    tone === 'indigo'
      ? 'text-indigo-700'
      : tone === 'blue'
      ? 'text-blue-700'
      : tone === 'emerald'
      ? 'text-emerald-700'
      : 'text-amber-700'

  return (
    <div className={`rounded-lg border bg-gradient-to-br ${bgClass} p-3`}>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">{label}</div>
      <div className={`text-2xl font-bold ${textColor}`}>{value}</div>
      <div className="text-xs text-slate-500 mt-1">{sub}</div>
    </div>
  )
}

function EngineSummaryCards({
  metrics,
  t,
}: {
  metrics: Map<string, EngineMetrics>
  t: T
}) {
  const engineList = Array.from(metrics.values()).sort((a, b) => b.scans - a.scans)

  return (
    <div>
      <h3 className="text-sm font-bold uppercase tracking-wider text-slate-600 mb-3">{t('engine_coverage')}</h3>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {engineList.map((em) => {
          const meta = ENGINE_META[em.engine as keyof typeof ENGINE_META]
          return (
            <div key={em.engine} className="rounded-lg border border-slate-200 bg-white p-3 hover:shadow-md transition">
              <div className="flex items-center gap-2 mb-2">
                {meta && <meta.Icon size={20} className={meta.accent} />}
                <span className="text-xs font-semibold text-slate-900">{meta?.name || em.engine}</span>
              </div>
              <div className="space-y-1">
                <div className="text-[10px] text-slate-600">
                  <span className="font-medium text-slate-900">{em.mentions}</span> mentions
                </div>
                <div className="text-[10px] text-slate-600">
                  <span className="font-medium text-slate-900">{em.citations}</span> citations
                </div>
                <div className="text-[10px] text-slate-600">
                  <span className="font-medium text-slate-900">{em.scans}</span> scans
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function FilterBar({
  engines,
  filterEngine,
  filterMentioned,
  filterCited,
  searchQuery,
  onEngineChange,
  onMentionedChange,
  onCitedChange,
  onSearchChange,
  t,
}: {
  engines: string[]
  filterEngine: string | null
  filterMentioned: boolean | null
  filterCited: boolean | null
  searchQuery: string
  onEngineChange: (engine: string | null) => void
  onMentionedChange: (mentioned: boolean | null) => void
  onCitedChange: (cited: boolean | null) => void
  onSearchChange: (query: string) => void
  t: T
}) {
  return (
    <div className="flex flex-wrap gap-2 items-center rounded-lg border border-slate-200 bg-white p-3">
      <Input
        placeholder={t('search')}
        value={searchQuery}
        onChange={(e) => onSearchChange(e.target.value)}
        className="flex-1 min-w-[200px]"
      />
      <select
        value={filterEngine || ''}
        onChange={(e) => onEngineChange(e.target.value || null)}
        className="text-sm border border-slate-200 rounded-lg px-2 py-1.5"
      >
        <option value="">{t('all_engines')}</option>
        {engines.map((e) => (
          <option key={e} value={e}>
            {ENGINE_META[e as keyof typeof ENGINE_META]?.name || e}
          </option>
        ))}
      </select>
      <select
        value={filterMentioned === null ? '' : filterMentioned ? 'yes' : 'no'}
        onChange={(e) => onMentionedChange(e.target.value === '' ? null : e.target.value === 'yes')}
        className="text-sm border border-slate-200 rounded-lg px-2 py-1.5"
      >
        <option value="">{t('all_mention')}</option>
        <option value="yes">{t('mentioned')}</option>
        <option value="no">{t('not_mentioned')}</option>
      </select>
      <select
        value={filterCited === null ? '' : filterCited ? 'yes' : 'no'}
        onChange={(e) => onCitedChange(e.target.value === '' ? null : e.target.value === 'yes')}
        className="text-sm border border-slate-200 rounded-lg px-2 py-1.5"
      >
        <option value="">{t('all_citations')}</option>
        <option value="yes">{t('target_cited')}</option>
        <option value="no">{t('not_cited')}</option>
      </select>
    </div>
  )
}

function ResultsTable({
  results,
  onRowClick,
  t,
}: {
  results: ResultRow[]
  onRowClick: (result: ResultRow) => void
  t: T
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className="text-left px-4 py-2 font-semibold text-slate-700">{t('query_label')}</th>
              <th className="text-left px-4 py-2 font-semibold text-slate-700">{t('engine')}</th>
              <th className="text-center px-4 py-2 font-semibold text-slate-700">{t('mentioned')}</th>
              <th className="text-center px-4 py-2 font-semibold text-slate-700">{t('target_cited')}</th>
              <th className="text-right px-4 py-2 font-semibold text-slate-700">{t('citations')}</th>
              <th className="text-center px-4 py-2 font-semibold text-slate-700"></th>
            </tr>
          </thead>
          <tbody>
            {results.map((r, i) => (
              <tr
                key={r.id}
                onClick={() => onRowClick(r)}
                className={`border-b border-slate-100 hover:bg-slate-50 cursor-pointer transition ${
                  i % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'
                }`}
              >
                <td className="px-4 py-3 font-medium text-slate-900 line-clamp-1">{r.promptText}</td>
                <td className="px-4 py-3 text-slate-600">
                  {ENGINE_META[r.engine as keyof typeof ENGINE_META]?.name || r.engine}
                </td>
                <td className="px-4 py-3 text-center">
                  {r.mentioned ? <span className="text-emerald-600 font-semibold">✓</span> : <span className="text-slate-400">—</span>}
                </td>
                <td className="px-4 py-3 text-center">
                  {r.targetCited ? <span className="text-emerald-600 font-semibold">✓</span> : <span className="text-slate-400">—</span>}
                </td>
                <td className="px-4 py-3 text-right text-slate-600 font-medium">{r.citationCount}</td>
                <td className="px-4 py-3 text-center">
                  <ExternalLinkIcon size={16} className="text-slate-400" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 text-2xl leading-none"
          >
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
              <h3 className="text-sm font-semibold text-slate-900">{t('sources')} ({result.citations.length})</h3>
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
                {cleanResponseText(result.responseText).split('\n').map((line, i) => (
                  <p key={i} className="leading-relaxed">
                    {line || <br />}
                  </p>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Drawer Footer */}
        <div className="sticky bottom-0 border-t border-slate-200 bg-white p-6 flex gap-2">
          <Button variant="outline" onClick={onClose} className="flex-1">
            {t('close')}
          </Button>
        </div>
      </div>
    </div>
  )
}

function SmartQuestionsSection({
  questions,
  projectId,
  country,
  language,
  domain,
  businessName,
  onAdded,
  t,
}: {
  questions: PromptSuggestion[]
  projectId: string
  country: string | null
  language: string | null
  domain: string | null
  businessName: string | null
  onAdded: () => void
  t: T
}) {
  const [savingId, setSavingId] = useState<string | null>(null)

  const intentLabel = (intent: string): string => {
    switch (intent) {
      case 'brand': return t('intent_brand')
      case 'comparison': return t('intent_comparison')
      case 'local': return t('intent_local')
      case 'transactional': return t('intent_transactional')
      case 'recommendation': return t('intent_recommendation')
      case 'informational': return t('intent_informational')
      default: return intent
    }
  }

  const intentTone: Record<string, 'info' | 'success' | 'warning' | 'neutral' | 'danger'> = {
    brand: 'info',
    comparison: 'warning',
    local: 'success',
    transactional: 'warning',
    recommendation: 'info',
    informational: 'neutral',
  }

  async function addQuestion(question: PromptSuggestion) {
    setSavingId(question.id)
    try {
      const res = await fetch('/api/ai-visibility/prompts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          prompt: question.prompt,
          country,
          language,
          targetDomain: domain,
          targetBrandName: businessName,
        }),
      })
      if (!res.ok) throw new Error('Failed to add')
      onAdded()
    } catch (e) {
      console.error(e)
    } finally {
      setSavingId(null)
    }
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-gradient-to-br from-indigo-50/40 to-white p-5">
      <h3 className="text-sm font-bold uppercase tracking-wider text-indigo-700 mb-4">{t('smart_questions_title')}</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {questions.map((q) => (
          <div key={q.id} className="flex items-start gap-3 p-3 rounded-lg bg-white border border-slate-200 hover:shadow-sm transition">
            <div className="flex-1">
              <p className="text-sm text-slate-900 font-medium line-clamp-2 mb-2">{q.prompt}</p>
              <div className="flex items-center gap-1.5">
                <Badge variant={intentTone[q.intent] || 'neutral'} className="!text-[9px]">
                  {intentLabel(q.intent)}
                </Badge>
                <span className="text-[10px] text-slate-500">{q.qualityScore}%</span>
              </div>
            </div>
            <button
              onClick={() => addQuestion(q)}
              disabled={savingId === q.id}
              className="shrink-0 w-8 h-8 rounded-lg bg-indigo-100 text-indigo-700 hover:bg-indigo-200 transition disabled:opacity-50"
            >
              {savingId === q.id ? '…' : '+'}
            </button>
          </div>
        ))}
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
