'use client'

/**
 * AI Visibility dashboard — two-tab structure.
 *
 *   Tab 1: תוצאות (Results)
 *     - Global summary strip
 *     - Engine mention cards
 *     - Filter/search bar
 *     - Result row cards (premium design) → detail drawer on click
 *
 *   Tab 2: שאילתות AI (AI Queries)
 *     - Existing questions list with per-engine scan chips
 *     - Add / delete actions
 *     - Recommended questions section
 *
 * Default tab is Results.  Scan completion auto-switches to Results and opens
 * the drawer for the just-completed scan.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import Input from '@/components/ui/Input'
import Badge from '@/components/ui/Badge'
import {
  ENGINE_META,
  ExternalLinkIcon,
  SparkleIcon,
  TrashIcon,
} from './EngineIcon'
import PromptSuggestions from './PromptSuggestions'
import AIBusinessProfilePanel from './AIBusinessProfilePanel'
import CompetitorsPanel from './CompetitorsPanel'
import CompetitorAnalysisPanel from './CompetitorAnalysisPanel'
import { createI18n } from '@/lib/ai-visibility/i18n'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { generatePromptSuggestions, type PromptSuggestion, type ManualAIProfile } from '@/lib/ai-visibility/prompt-templates'
import { getBrandVariants } from '@/lib/ai-visibility/matching/mention-detector'
import { normalizeDomain } from '@/lib/ai-visibility/matching/domain-normalize'

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
  enginesWithMentions: number
}

type EngineMetrics = {
  engine: string
  scans: number
  mentions: number
  citations: number
  rate: number
}

type TabType = 'results' | 'queries' | 'competitors'

type CompetitorAnalysisData = {
  project: { name: string | null; mentionsCount: number; totalResults: number; mentionRate: number } | null
  competitors: Array<{ id: string; name: string; mentionsCount: number; mentionRate: number }>
}

type PromptInsight = {
  totalEngines: number
  businessMentionEngines: number
  mentionRate: number
  targetCitedCount: number
  status: 'missing' | 'weak' | 'medium' | 'good'
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
  const { language: dashboardLanguage } = useDashboardLanguage()
  const t = useMemo(() => createI18n(dashboardLanguage), [dashboardLanguage])
  const isHebrew = dashboardLanguage === 'he'

  const [currentTab, setCurrentTab] = useState<TabType>('results')
  const [allResults, setAllResults] = useState<ResultRow[]>([])
  const [allPrompts, setAllPrompts] = useState<PromptRow[]>([])
  const [globalMetrics, setGlobalMetrics] = useState<GlobalMetrics | null>(null)
  const [engineMetrics, setEngineMetrics] = useState<Map<string, EngineMetrics>>(new Map())
  const [loading, setLoading] = useState(true)
  const [showAllResults, setShowAllResults] = useState(false)
  const [seenPrompts, setSeenPrompts] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)

  const [showNewPrompt, setShowNewPrompt] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [selectedResult, setSelectedResult] = useState<ResultRow | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [deletePromptId, setDeletePromptId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [highlightResultId, setHighlightResultId] = useState<string | null>(null)

  const [filterEngine, setFilterEngine] = useState<string | null>(null)
  const [filterMentioned, setFilterMentioned] = useState<boolean | null>(null)
  const [filterCited, setFilterCited] = useState<boolean | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  const [suggestedQuestions, setSuggestedQuestions] = useState<PromptSuggestion[]>([])
  const [scanningKey, setScanningKey] = useState<string | null>(null)
  const [manualProfile, setManualProfile] = useState<ManualAIProfile | null>(null)
  const [showAllPrompts, setShowAllPrompts] = useState(false)
  const [scanStatus, setScanStatus] = useState<string | null>(null)
  const [competitorsRefreshKey, setCompetitorsRefreshKey] = useState(0)
  const [competitorAnalysis, setCompetitorAnalysis] = useState<CompetitorAnalysisData | null>(null)
  const [competitorAnalysisStatus, setCompetitorAnalysisStatus] = useState<'idle' | 'loading' | 'loaded' | 'error' | 'empty'>('idle')

  // Build brand variants once for reuse in result rows (mention chips)
  const brandVariants = useMemo(
    () => getBrandVariants(projectBrandName, projectDomain),
    [projectBrandName, projectDomain]
  )
  const normalizedTargetDomain = useMemo(
    () => (projectDomain ? normalizeDomain(projectDomain) : null),
    [projectDomain]
  )

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

      const results: ResultRow[] = []
      for (const run of runsData.runs || []) {
        for (const result of run.results || []) {
          results.push({
            id: result.id,
            promptId: result.promptId || null,
            engine: result.engine,
            promptText: result.promptText || '',
            mentioned: result.mentioned || false,
            targetCited: result.targetCited || false,
            citationCount: result.citationCount || 0,
            status: result.status,
            scannedAt: run.completedAt || result.scannedAt,
            citations: [],
            responseText: null,
            runId: run.id,
          })
        }
      }

      const promptsArr: PromptRow[] = (promptsData.prompts || []) as PromptRow[]
      const promptTextById = new Map(promptsArr.map((p) => [p.id, p.prompt]))
      const resultsWithText = results.map((r) => ({
        ...r,
        promptText: r.promptText || (r.promptId ? promptTextById.get(r.promptId) || '' : ''),
      }))

      setAllResults(resultsWithText)
      setAllPrompts(promptsArr)

      const engines = new Set<string>()
      const engineMap = new Map<string, EngineMetrics>()
      let totalMentions = 0
      let totalCitations = 0

      SUPPORTED_ENGINES.forEach((engine) => {
        engineMap.set(engine, { engine, scans: 0, mentions: 0, citations: 0, rate: 0 })
      })

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

      // Count engines that have at least one mention
      let enginesWithMentions = 0
      for (const [, metrics] of engineMap) {
        if (metrics.mentions > 0) {
          enginesWithMentions++
        }
      }

      setGlobalMetrics({
        totalScans: successfulScans,
        totalMentions,
        totalCitations,
        mentionRate: successfulScans > 0 ? Math.round((totalMentions / successfulScans) * 100) : 0,
        citationRate: successfulScans > 0 ? Math.round((totalCitations / successfulScans) * 100) : 0,
        enginesCovered: engines.size,
        enginesWithMentions,
      })

      setEngineMetrics(engineMap)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load results')
    } finally {
      setLoading(false)
    }
  }, [projectId])

  // Load the saved manual AI Business Profile for this project (if any)
  useEffect(() => {
    let cancelled = false
    fetch(`/api/projects/${projectId}/ai-profile`)
      .then((r) => (r.ok ? r.json() : { profile: null }))
      .then((d) => {
        if (!cancelled) setManualProfile(d.profile ?? null)
      })
      .catch(() => {
        if (!cancelled) setManualProfile(null)
      })
    return () => {
      cancelled = true
    }
  }, [projectId])

  useEffect(() => {
    const suggestions = generatePromptSuggestions({
      businessName: projectBrandName,
      domain: projectDomain,
      city: projectCity || null,
      country: projectCountry,
      language: projectLanguage,
      keywords: projectKeywords,
      manualProfile,
      shuffle: false,
    })
    setSuggestedQuestions(suggestions.slice(0, 4))
  }, [projectBrandName, projectDomain, projectCity, projectCountry, projectLanguage, projectKeywords, manualProfile])

  useEffect(() => {
    loadAllResults()
  }, [loadAllResults])

  // Fetch competitor analysis (read-only) so we can build a competitor-leading
  // recommendation when a competitor has more mentions than the project.
  // Refetches whenever scan results or competitors change.
  useEffect(() => {
    let cancelled = false
    setCompetitorAnalysisStatus('loading')
    fetch(`/api/projects/${projectId}/ai-visibility/competitor-analysis`)
      .then(async (r) => {
        if (!r.ok) return { ok: false as const, status: r.status, data: null }
        const data = await r.json().catch(() => null)
        return { ok: true as const, status: r.status, data }
      })
      .then((res) => {
        if (cancelled) return
        if (!res.ok || !res.data || !res.data.success) {
          setCompetitorAnalysis(null)
          setCompetitorAnalysisStatus('error')
          return
        }
        // Empty states from the API (no competitors / no scan / table missing)
        if (!res.data.project || !Array.isArray(res.data.competitors) || res.data.competitors.length === 0) {
          setCompetitorAnalysis(null)
          setCompetitorAnalysisStatus('empty')
          return
        }
        setCompetitorAnalysis({
          project: res.data.project,
          competitors: res.data.competitors,
        })
        setCompetitorAnalysisStatus('loaded')
      })
      .catch(() => {
        if (cancelled) return
        setCompetitorAnalysis(null)
        setCompetitorAnalysisStatus('error')
      })
    return () => {
      cancelled = true
    }
  }, [projectId, allResults.length, competitorsRefreshKey])

  const scannedSet = useMemo(() => {
    const s = new Set<string>()
    allResults.forEach((r) => {
      if (r.promptId && r.status === 'success') {
        s.add(`${r.promptId}:${r.engine}`)
      }
    })
    return s
  }, [allResults])

  // Per-prompt insights: dedupe by (promptKey, engine) keeping latest result
  // per engine, then aggregate mentions/citations. Read-only over allResults.
  // Keying tries promptId first; falls back to normalized promptText when the
  // result has no promptId attached (older runs / cascade-detached results).
  const promptInsights = useMemo(() => {
    const normalizeText = (text: string): string =>
      text.trim().toLowerCase().replace(/\s+/g, ' ').replace(/[?.!,;؟،]+\s*$/u, '').trim()

    // Build text-based lookups for the active prompts: text -> prompt.id
    const promptIdByText = new Map<string, string>()
    for (const p of allPrompts) {
      const norm = normalizeText(p.prompt || '')
      if (norm) promptIdByText.set(norm, p.id)
    }

    const sorted = [...allResults].sort((a, b) =>
      (b.scannedAt || '').localeCompare(a.scannedAt || '')
    )
    const byPrompt = new Map<string, Map<string, ResultRow>>()
    for (const r of sorted) {
      if (r.status !== 'success') continue
      let key: string | null = r.promptId
      if (!key && r.promptText) {
        const norm = normalizeText(r.promptText)
        key = promptIdByText.get(norm) || null
      }
      if (!key) continue
      if (!byPrompt.has(key)) byPrompt.set(key, new Map())
      const engineMap = byPrompt.get(key)!
      if (!engineMap.has(r.engine)) engineMap.set(r.engine, r)
    }
    const insights = new Map<string, PromptInsight>()
    for (const [pid, engineMap] of byPrompt) {
      const results = Array.from(engineMap.values())
      const totalEngines = results.length
      const businessMentionEngines = results.filter((r) => r.mentioned).length
      const targetCitedCount = results.filter((r) => r.targetCited).length
      const mentionRate = totalEngines > 0
        ? Math.round((businessMentionEngines / totalEngines) * 100)
        : 0
      let status: PromptInsight['status']
      if (businessMentionEngines === 0) status = 'missing'
      else if (mentionRate < 30) status = 'weak'
      else if (mentionRate < 70) status = 'medium'
      else status = 'good'
      insights.set(pid, {
        totalEngines,
        businessMentionEngines,
        mentionRate,
        targetCitedCount,
        status,
      })
    }
    return insights
  }, [allResults, allPrompts])

  // Open the drawer for a specific result, fetching full details on demand.
  const openResultDrawer = useCallback(async (result: ResultRow) => {
    setSelectedResult(result)
    setDrawerOpen(true)
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
  }, [])

  // Scan trigger — after success, switch to Results tab and open drawer for the new result.
  const scanEngine = useCallback(
    async (promptId: string, engine: string) => {
      const key = `${promptId}:${engine}`
      setScanningKey(key)
      setScanStatus(t('scan_in_progress'))
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
        const body = await res.json()
        await loadAllResults()
        setScanStatus(t('scan_done'))
        setCurrentTab('results')
        // After loadAllResults the new result is in state. Use its id to highlight + open.
        if (body.resultId) setHighlightResultId(body.resultId)
        setTimeout(() => {
          // Re-fetch latest results state by inspecting via the runId match
          const newest = (allResults || []).find((r) => r.id === body.resultId)
          if (newest) {
            openResultDrawer(newest)
          }
        }, 250)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Scan failed')
        setScanStatus(null)
      } finally {
        setScanningKey(null)
        // Auto-dismiss success message after 3 seconds
        setTimeout(() => setScanStatus(null), 3000)
      }
    },
    [projectId, loadAllResults, allResults, openResultDrawer, t]
  )

  // When allResults updates after a scan, if there's a highlighted id we haven't
  // opened yet, open it now.
  useEffect(() => {
    if (!highlightResultId) return
    const found = allResults.find((r) => r.id === highlightResultId)
    if (found && !drawerOpen) {
      openResultDrawer(found)
      setHighlightResultId(null)
    }
  }, [allResults, highlightResultId, drawerOpen, openResultDrawer])

  const deletePrompt = useCallback(async (promptId: string) => {
    setDeleting(true)
    setError(null)
    // Optimistic removal
    const prev = allPrompts
    setAllPrompts((p) => p.filter((q) => q.id !== promptId))
    try {
      const res = await fetch(`/api/ai-visibility/prompts/${promptId}`, { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `HTTP ${res.status}`)
      }
      // Reload to pick up unlinked results (prompt_id is set to null on cascade)
      await loadAllResults()
    } catch (e) {
      setAllPrompts(prev)
      setError(e instanceof Error ? e.message : 'Failed to delete question')
    } finally {
      setDeleting(false)
      setDeletePromptId(null)
    }
  }, [allPrompts, loadAllResults])

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
            <div key={i} className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 animate-pulse">
              <div className="h-4 w-2/3 bg-slate-200 dark:bg-slate-700 rounded mb-3" />
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {[0, 1, 2, 3].map((j) => (
                  <div key={j} className="h-12 bg-slate-100 dark:bg-slate-800 rounded" />
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
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 tracking-tight">{t('ai_visibility')}</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0">{t('monitor_engines')}</p>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700 flex items-start gap-2">
          <span className="shrink-0">✕</span>
          <span>{error}</span>
        </div>
      )}

      {scanStatus && (
        <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 text-sm text-blue-700 flex items-start gap-2">
          <span className="shrink-0 animate-pulse">…</span>
          <span>{scanStatus}</span>
        </div>
      )}

      {/* TAB BAR */}
      <div className="flex gap-2 border-b border-slate-200 dark:border-slate-700">
        {(['results', 'queries', 'competitors'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setCurrentTab(tab)}
            className={`px-4 py-3 text-base font-semibold border-b-2 transition ${
              currentTab === tab
                ? 'border-indigo-600 text-indigo-700 dark:text-indigo-300'
                : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
            }`}
          >
            {tab === 'results' && t('tab_results')}
            {tab === 'queries' && t('tab_queries')}
            {tab === 'competitors' && t('tab_competitors')}
          </button>
        ))}
      </div>

      {/* TAB 1: RESULTS (includes overview) */}
      {currentTab === 'results' && (
        <>
          {globalMetrics && (
            <AIVisibilityScoreCard score={globalMetrics.mentionRate} t={t} isRTL={isHebrew} />
          )}
          {globalMetrics && (
            <OverviewSummaryStrip metrics={globalMetrics} totalResults={allResults.length} t={t} />
          )}
          <EngineMentionCards metrics={engineMetrics} t={t} />

          {/* FILTER BAR */}
          <div className="flex flex-wrap gap-2 items-center rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3">
            <Input
              placeholder={t('search')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 min-w-[200px]"
            />
            <select
              value={filterEngine || ''}
              onChange={(e) => setFilterEngine(e.target.value || null)}
              className="text-sm border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 rounded-lg px-2 py-1.5"
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
              onChange={(e) =>
                setFilterMentioned(e.target.value === '' ? null : e.target.value === 'yes')
              }
              className="text-sm border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 rounded-lg px-2 py-1.5"
            >
              <option value="">{t('all_mention')}</option>
              <option value="yes">{t('mentioned')}</option>
              <option value="no">{t('not_mentioned')}</option>
            </select>
            <select
              value={filterCited === null ? '' : filterCited ? 'yes' : 'no'}
              onChange={(e) =>
                setFilterCited(e.target.value === '' ? null : e.target.value === 'yes')
              }
              className="text-sm border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 rounded-lg px-2 py-1.5"
            >
              <option value="">{t('all_citations')}</option>
              <option value="yes">{t('target_cited')}</option>
              <option value="no">{t('not_cited')}</option>
            </select>
          </div>

          <div className="text-sm text-slate-600 dark:text-slate-300">
            {t('showing_results').replace('{count}', String(showAllResults ? filteredResults.length : Math.min(3, filteredResults.length)))}
          </div>

          {filteredResults.length > 0 ? (
            <>
              <div className="space-y-2">
                {filteredResults.slice(0, showAllResults ? undefined : 3).map((r) => (
                  <ResultRowCard
                    key={r.id}
                    result={r}
                    highlighted={highlightResultId === r.id}
                    brandVariants={brandVariants}
                    targetDomain={normalizedTargetDomain}
                    isHebrew={isHebrew}
                    onRowClick={openResultDrawer}
                    t={t}
                  />
                ))}
              </div>
              {filteredResults.length > 3 && (
                <div className="text-center mt-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowAllResults(!showAllResults)}
                  >
                    {showAllResults ? t('show_less') : t('show_all')}
                  </Button>
                </div>
              )}
            </>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-10 text-center">
              <p className="text-sm text-slate-600 dark:text-slate-300">{t('no_scans')}</p>
            </div>
          )}

          {/* RECOMMENDATIONS CARD */}
          {globalMetrics && (
            <RecommendationsCard
              metrics={globalMetrics}
              engineMetrics={engineMetrics}
              allResults={allResults}
              competitorAnalysis={competitorAnalysis}
              t={t}
              isRTL={isHebrew}
            />
          )}
        </>
      )}

      {/* TAB 2: AI QUERIES */}
      {currentTab === 'queries' && (
        <>
          <AIBusinessProfilePanel
            projectId={projectId}
            businessName={projectBrandName}
            domain={projectDomain}
            keywords={projectKeywords || []}
            initialProfile={manualProfile}
            onChange={(profile) => {
              setManualProfile(profile)
              // Immediately refresh inline recommended questions with the
              // new profile — no page reload needed.
              const refreshed = generatePromptSuggestions({
                businessName: projectBrandName,
                domain: projectDomain,
                city: projectCity || null,
                country: projectCountry,
                language: projectLanguage,
                keywords: projectKeywords,
                manualProfile: profile,
                shuffle: false,
              })
              setSuggestedQuestions(refreshed.slice(0, 4))
            }}
          />
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 mb-4">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                {t('ai_queries')}
              </h3>
              <Badge variant="neutral" className="!text-xs">{allPrompts.length}</Badge>
            </div>
            <div className="grid grid-cols-2 sm:flex gap-2 w-full sm:w-auto">
              <Button variant="outline" size="sm" onClick={() => setShowSuggestions(true)} className="w-full sm:w-auto">
                {t('recommend_questions')}
              </Button>
              <Button size="sm" onClick={() => setShowNewPrompt(true)} className="w-full sm:w-auto">
                {t('new_query')}
              </Button>
            </div>
          </div>

          {allPrompts.length > 0 ? (
            <>
              <div className="space-y-2">
                {allPrompts.slice(0, showAllPrompts ? undefined : 3).map((p) => (
                  <div
                    key={p.id}
                    className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 hover:shadow-sm transition"
                  >
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <p className="text-sm font-medium text-slate-900 dark:text-slate-100 flex-1 line-clamp-2">{p.prompt}</p>
                      <button
                        onClick={() => setDeletePromptId(p.id)}
                        className="shrink-0 p-1.5 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 transition"
                        title={t('delete')}
                        aria-label={t('delete')}
                      >
                        <TrashIcon size={16} />
                      </button>
                    </div>
                    <PromptInsightRow insight={promptInsights.get(p.id) ?? null} t={t} isRTL={isHebrew} />
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
                                ? 'bg-emerald-50 dark:bg-emerald-900/30 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 cursor-default'
                                : scanning
                                ? 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-500 cursor-wait'
                                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-indigo-300 dark:hover:border-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 hover:text-indigo-700 dark:hover:text-indigo-300 cursor-pointer'
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
              {allPrompts.length > 3 && (
                <div className="text-center mt-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowAllPrompts(!showAllPrompts)}
                  >
                    {showAllPrompts ? t('show_less') : t('show_more')}
                  </Button>
                </div>
              )}
            </>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-10 text-center">
              <p className="text-sm text-slate-600 dark:text-slate-300">{t('no_queries')}</p>
            </div>
          )}

          {suggestedQuestions.length > 0 && (
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-gradient-to-br from-indigo-50/40 to-white dark:from-slate-900 dark:to-slate-800 p-5 mt-6">
              <h3 className="text-sm font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-300 mb-4">
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

      {/* TAB 3: COMPETITORS */}
      {currentTab === 'competitors' && (
        <>
          <CompetitorsPanel
            projectId={projectId}
            defaultCollapsed={false}
            onCompetitorsChanged={() => setCompetitorsRefreshKey((k) => k + 1)}
          />
          <CompetitorAnalysisPanel projectId={projectId} refreshKey={competitorsRefreshKey} />
        </>
      )}

      {/* RESULT DETAIL DRAWER */}
      {selectedResult && (
        <ResultDetailDrawer
          open={drawerOpen}
          result={selectedResult}
          brandVariants={brandVariants}
          targetDomain={normalizedTargetDomain}
          onClose={() => {
            setDrawerOpen(false)
            setTimeout(() => setSelectedResult(null), 300)
          }}
          t={t}
        />
      )}

      {/* DELETE PROMPT CONFIRMATION MODAL */}
      {deletePromptId && (
        <Modal
          open={!!deletePromptId}
          onClose={() => !deleting && setDeletePromptId(null)}
          title={t('delete_question_title')}
          size="md"
        >
          <div className="space-y-4" dir={isHebrew ? 'rtl' : 'ltr'}>
            <p className="text-sm text-slate-700 dark:text-slate-200">{t('delete_question_body')}</p>
            <div className="flex gap-2 border-t border-slate-200 dark:border-slate-700 pt-3">
              <Button
                variant="outline"
                onClick={() => setDeletePromptId(null)}
                disabled={deleting}
                className="flex-1"
              >
                {t('cancel')}
              </Button>
              <Button
                onClick={() => deletePrompt(deletePromptId)}
                loading={deleting}
                className="flex-1 !bg-red-600 hover:!bg-red-700 !text-white"
              >
                {t('delete_permanently')}
              </Button>
            </div>
          </div>
        </Modal>
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
        manualProfile={manualProfile}
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
        existingPrompts={allPrompts}
        onAdded={loadAllResults}
        t={t}
      />
    </section>
  )
}

/* --- COMPONENTS --- */

type T = (key: any) => string

function AIVisibilityScoreCard({
  score,
  t,
  isRTL,
}: {
  score: number
  t: T
  isRTL: boolean
}) {
  const safeScore = Math.max(0, Math.min(100, Math.round(score || 0)))
  const level = safeScore <= 30 ? 'low' : safeScore <= 70 ? 'medium' : 'high'
  const badgeText = level === 'low' ? t('score_low') : level === 'medium' ? t('score_medium') : t('score_high')
  const badgeClass =
    level === 'low'
      ? 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/20 dark:text-orange-300 dark:border-orange-800'
      : level === 'medium'
      ? 'bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-300 dark:border-yellow-800'
      : 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800'
  const scoreColor =
    level === 'low'
      ? 'text-orange-600 dark:text-orange-400'
      : level === 'medium'
      ? 'text-yellow-600 dark:text-yellow-400'
      : 'text-emerald-600 dark:text-emerald-400'
  const barColor =
    level === 'low'
      ? 'bg-orange-400 dark:bg-orange-500'
      : level === 'medium'
      ? 'bg-yellow-400 dark:bg-yellow-500'
      : 'bg-emerald-400 dark:bg-emerald-500'

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-gradient-to-r from-white to-indigo-50/40 dark:from-slate-900 dark:to-slate-800 p-4 sm:p-5">
      <div className={`flex items-center justify-between gap-4 ${isRTL ? 'flex-row-reverse' : ''}`}>
        <div className={`flex-1 min-w-0 ${isRTL ? 'text-right' : 'text-left'}`}>
          <div className={`flex items-center gap-2 flex-wrap ${isRTL ? 'flex-row-reverse' : ''}`}>
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
              {t('ai_visibility_score')}
            </h3>
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${badgeClass}`}
              title={t('score_help')}
            >
              {badgeText}
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-snug" title={t('score_help')}>
            {t('score_subtext')}
          </p>
        </div>
        <div className="shrink-0" dir="ltr">
          <span className={`text-3xl sm:text-4xl font-bold tabular-nums ${scoreColor}`}>{safeScore}</span>
          <span className="text-sm sm:text-base font-semibold text-slate-400 dark:text-slate-500 ml-0.5">/100</span>
        </div>
      </div>
      {/* Progress bar */}
      <div className="mt-3 w-full h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden" dir="ltr">
        <div
          className={`h-full ${barColor} transition-all`}
          style={{ width: `${safeScore}%` }}
        />
      </div>
    </div>
  )
}

function OverviewSummaryStrip({
  metrics,
  totalResults,
  t,
}: {
  metrics: GlobalMetrics
  totalResults: number
  t: T
}) {
  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-gradient-to-r from-indigo-50 to-white dark:from-slate-900 dark:to-slate-800 p-4 sm:p-6">
      <div className="grid grid-cols-3 gap-3 sm:gap-6">
        <div className="min-w-0">
          <div className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1 sm:mb-2 truncate">
            {t('total_mentions')}
          </div>
          <div className="text-2xl sm:text-4xl font-bold text-emerald-700 dark:text-emerald-400">{metrics.totalMentions}</div>
          <div className="hidden sm:block text-sm text-slate-600 dark:text-slate-300 mt-2">
            {t('out_of_results').replace('{count}', String(totalResults))}
          </div>
        </div>
        <div className="min-w-0">
          <div className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1 sm:mb-2 truncate" title={t('engines_coverage_help')}>
            {t('engine_coverage')}
          </div>
          <div className="text-2xl sm:text-4xl font-bold text-indigo-700 dark:text-indigo-300">{metrics.enginesWithMentions}</div>
          <div className="hidden sm:block text-sm text-slate-600 dark:text-slate-300 mt-2">
            {t('of_n_ai_engines').replace('{count}', String(metrics.enginesCovered))}
          </div>
        </div>
        <div className="min-w-0">
          <div className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1 sm:mb-2 truncate">
            {t('target_cited')}
          </div>
          <div className="text-2xl sm:text-4xl font-bold text-emerald-700 dark:text-emerald-400">{metrics.totalCitations}</div>
          <div className="hidden sm:block text-sm text-slate-600 dark:text-slate-300 mt-2">{t('citations')}</div>
        </div>
      </div>
    </div>
  )
}

interface Recommendation {
  id: string
  type: 'weak_engines' | 'weak_questions' | 'competitor_leading'
  severity: 'high' | 'medium' | 'low'
  titleKey: string
  bodyKey: string
  body?: string
  priority: number
}

function RecommendationsCard({
  metrics,
  engineMetrics,
  allResults,
  competitorAnalysis,
  t,
  isRTL,
}: {
  metrics: GlobalMetrics
  engineMetrics: Map<string, EngineMetrics>
  allResults: ResultRow[]
  competitorAnalysis: CompetitorAnalysisData | null
  t: T
  isRTL: boolean
}) {
  const recommendations: Recommendation[] = []

  // Rule 0: Competitor leading — a competitor has more mentions than the
  // project. Highest priority because it shows real competitive risk.
  if (competitorAnalysis && competitorAnalysis.project && competitorAnalysis.competitors.length > 0) {
    const projectMentions = competitorAnalysis.project.mentionsCount
    // Find the competitor with the largest positive gap over the project
    let leadingCompetitor: { name: string; gap: number } | null = null
    for (const comp of competitorAnalysis.competitors) {
      const gap = comp.mentionsCount - projectMentions
      if (gap > 0 && comp.name && (!leadingCompetitor || gap > leadingCompetitor.gap)) {
        leadingCompetitor = { name: comp.name, gap }
      }
    }
    if (leadingCompetitor) {
      const bodyText = t('rec_competitor_leading_body')
        .replace('{competitorName}', leadingCompetitor.name)
        .replace('{gap}', String(leadingCompetitor.gap))
      recommendations.push({
        id: 'competitor_leading',
        type: 'competitor_leading',
        severity: 'high',
        titleKey: 'rec_competitor_leading_title',
        body: bodyText,
        bodyKey: 'rec_competitor_leading_body',
        priority: 1,
      })
    }
  }

  // Rule 1: Weak engines — engines with scans but no mentions
  const allWeakEngines = Array.from(engineMetrics.values())
    .filter((em) => em.scans > 0 && em.mentions === 0)
    .map((em) => ENGINE_META[em.engine as keyof typeof ENGINE_META]?.name || em.engine)

  if (allWeakEngines.length > 0) {
    const displayEngines = allWeakEngines.slice(0, 3)
    const moreCount = allWeakEngines.length > 3 ? allWeakEngines.length - 3 : 0
    const andConjunction = isRTL ? 'ו' : 'and'

    // Format the list of engine names. When a "+more" suffix is needed,
    // separate displayed engines with commas only — the "and ..." conjunction
    // comes from the suffix itself. Without a suffix, use "and" before the
    // last item for natural reading.
    let engineNames: string
    if (moreCount > 0) {
      engineNames = displayEngines.join(', ')
      const moreLabel = isRTL
        ? (moreCount === 1 ? 'ועוד מנוע אחד' : `ועוד ${moreCount} מנועים`)
        : (moreCount === 1 ? 'and 1 more engine' : `and ${moreCount} more engines`)
      engineNames = `${engineNames} ${moreLabel}`
    } else if (displayEngines.length === 1) {
      engineNames = displayEngines[0]
    } else if (displayEngines.length === 2) {
      engineNames = `${displayEngines[0]} ${andConjunction} ${displayEngines[1]}`
    } else {
      engineNames = `${displayEngines[0]}, ${displayEngines[1]} ${andConjunction} ${displayEngines[2]}`
    }

    const bodyText = t('rec_weak_engines_body').replace('{engines}', engineNames)

    recommendations.push({
      id: 'weak_engines',
      type: 'weak_engines',
      severity: 'high',
      titleKey: 'rec_weak_engines_title',
      body: bodyText,
      bodyKey: 'rec_weak_engines_body',
      priority: 3,
    })
  }

  // Rule 2: Weak questions — questions where business didn't appear in most/all engines
  const questionStats = new Map<string | null, { total: number; mentions: number; promptText: string }>()
  for (const result of allResults) {
    if (result.status !== 'success') continue
    const key = result.promptId || `__noprompt__${result.id}`
    const existing = questionStats.get(key) || { total: 0, mentions: 0, promptText: result.promptText }
    existing.total++
    if (result.mentioned) existing.mentions++
    questionStats.set(key, existing)
  }

  // Normalize prompt text for dedupe: trim, lowercase, collapse whitespace,
  // and strip trailing punctuation (?, ., !, Hebrew/Arabic equivalents).
  const normalizeQuestion = (text: string): string =>
    text
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/[?.!,;؟،]+\s*$/u, '')
      .trim()

  const weakQuestionsMap = new Map<string, { text: string; mentionRate: number; mentions: number }>()
  for (const stat of questionStats.values()) {
    const rate = stat.total > 0 ? stat.mentions / stat.total : 0
    if (rate >= 0.25) continue
    if (!stat.promptText || stat.promptText.length === 0) continue
    const normalized = normalizeQuestion(stat.promptText)
    if (!normalized) continue
    // Keep the lowest mention rate when duplicates collide
    const existing = weakQuestionsMap.get(normalized)
    if (!existing || rate < existing.mentionRate) {
      weakQuestionsMap.set(normalized, { text: stat.promptText.trim(), mentionRate: rate, mentions: stat.mentions })
    }
  }
  const allWeakQuestions = Array.from(weakQuestionsMap.values())

  // Separate into zero mentions (did not appear) and weak mentions (barely appeared)
  const zeroMentionQuestions = allWeakQuestions.filter((q) => q.mentions === 0).sort((a, b) => a.mentionRate - b.mentionRate)
  const weakMentionQuestions = allWeakQuestions.filter((q) => q.mentions > 0).sort((a, b) => a.mentionRate - b.mentionRate)

  // Prefer zero mentions if available; otherwise use weak mentions
  const questionGroup = zeroMentionQuestions.length > 0 ? zeroMentionQuestions : weakMentionQuestions
  const isZeroMentions = zeroMentionQuestions.length > 0

  if (questionGroup.length > 0) {
    const topQuestions = questionGroup.slice(0, 2)
    let bodyText: string
    let bodyKey: string

    if (topQuestions.length === 1) {
      bodyKey = isZeroMentions ? 'rec_weak_questions_zero_single' : 'rec_weak_questions_weak_single'
      bodyText = t(bodyKey as any).replace('{question}', `"${topQuestions[0].text}"`)
    } else {
      bodyKey = isZeroMentions ? 'rec_weak_questions_zero_multi' : 'rec_weak_questions_weak_multi'
      // Put each question on its own line so the body reads as a list
      const questionsBlock = topQuestions.map((q) => `"${q.text}"`).join('\n')
      bodyText = t(bodyKey as any).replace('{questions}', questionsBlock)
    }

    recommendations.push({
      id: 'weak_questions',
      type: 'weak_questions',
      severity: 'high',
      titleKey: 'rec_weak_questions_title',
      body: bodyText,
      bodyKey,
      priority: 2,
    })
  }

  // Sort by severity (high → medium → low) then by priority
  const severityOrder = { high: 0, medium: 1, low: 2 }
  const sorted = [...recommendations].sort((a, b) => {
    const severityDiff = severityOrder[a.severity] - severityOrder[b.severity]
    if (severityDiff !== 0) return severityDiff
    return a.priority - b.priority
  })

  // Take top 3
  const topThree = sorted.slice(0, 3)

  if (topThree.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 mt-6">
        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1">
          {t('recommendations_title')}
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">{t('recommendations_desc')}</p>
        <p className="text-sm text-slate-600 dark:text-slate-300 italic">{t('recommendations_none_specific')}</p>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 mt-6">
      <h3 className="text-sm font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1">
        {t('recommendations_title')}
      </h3>
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">{t('recommendations_desc')}</p>
      <div className="space-y-2">
        {topThree.map((rec) => (
          <RecommendationItem key={rec.id} rec={rec} t={t} isRTL={isRTL} />
        ))}
      </div>
    </div>
  )
}

function RecommendationItem({
  rec,
  t,
  isRTL,
}: {
  rec: Recommendation
  t: T
  isRTL: boolean
}) {
  const borderClass = {
    high: 'border-rose-200 dark:border-rose-800',
    medium: 'border-amber-200 dark:border-amber-800',
    low: 'border-slate-200 dark:border-slate-700',
  }[rec.severity]

  const badgeClass = {
    high: 'bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
    medium: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    low: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  }[rec.severity]

  const severityLabel =
    rec.severity === 'high'
      ? t('rec_severity_high')
      : rec.severity === 'medium'
      ? t('rec_severity_medium')
      : t('rec_severity_low')

  const bodyText = rec.body || t(rec.bodyKey as any)

  return (
    <div className={`rounded-md border bg-white dark:bg-slate-900 px-3 py-2.5 sm:px-4 sm:py-3 ${borderClass}`}>
      <div className={`flex items-center gap-2 flex-wrap ${isRTL ? 'flex-row-reverse justify-end' : ''}`}>
        <h4 className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-slate-100 leading-snug">
          {t(rec.titleKey as any)}
        </h4>
        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold shrink-0 ${badgeClass}`}>
          {severityLabel}
        </span>
      </div>
      <p className={`text-xs text-slate-600 dark:text-slate-400 mt-2 sm:mt-2.5 leading-relaxed whitespace-pre-line ${isRTL ? 'text-right' : 'text-left'}`}>
        {bodyText}
      </p>
    </div>
  )
}

function PromptInsightRow({
  insight,
  t,
  isRTL,
}: {
  insight: PromptInsight | null
  t: T
  isRTL: boolean
}) {
  if (!insight) {
    return (
      <div className={`text-xs text-slate-500 dark:text-slate-400 mb-2 ${isRTL ? 'text-right' : 'text-left'}`}>
        {t('prompt_not_scanned_yet')}
      </div>
    )
  }

  const statusKey = (`prompt_status_${insight.status}`) as
    | 'prompt_status_missing'
    | 'prompt_status_weak'
    | 'prompt_status_medium'
    | 'prompt_status_good'

  const mentionsText = t('prompt_engines_of')
    .replace('{mentioned}', String(insight.businessMentionEngines))
    .replace('{total}', String(insight.totalEngines))

  const citedText = insight.targetCitedCount > 0 ? t('prompt_yes') : t('prompt_no')
  const statusText = t(statusKey)

  return (
    <div
      className={`mb-2 text-[11px] sm:text-xs text-slate-600 dark:text-slate-400 ${
        isRTL ? 'text-right' : 'text-left'
      }`}
    >
      <span className="font-semibold text-slate-700 dark:text-slate-200">{t('prompt_mentions')}:</span>
      <span> {mentionsText} </span>
      <span className="text-slate-400 dark:text-slate-500">|</span>
      <span> {t('prompt_site_cited')}:</span>
      <span className="font-semibold text-slate-700 dark:text-slate-200"> {citedText} </span>
      <span className="text-slate-400 dark:text-slate-500">|</span>
      <span> {t('prompt_status')}:</span>
      <span className="font-semibold text-slate-700 dark:text-slate-200"> {statusText}</span>
    </div>
  )
}

function EngineMentionCards({ metrics, t }: { metrics: Map<string, EngineMetrics>; t: T }) {
  const engineList = SUPPORTED_ENGINES.map(
    (engine) => metrics.get(engine) || { engine, scans: 0, mentions: 0, citations: 0, rate: 0 }
  ).sort((a, b) => b.mentions - a.mentions)

  return (
    <div>
      <h3 className="text-sm font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-4">
        {t('mentions_by_engine')}
      </h3>
      <div className="grid grid-cols-3 md:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-4">
        {engineList.map((em) => {
          const meta = ENGINE_META[em.engine as keyof typeof ENGINE_META]
          const percent = em.scans > 0 ? Math.round((em.mentions / em.scans) * 100) : 0
          return (
            <div
              key={em.engine}
              className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-2.5 sm:p-4 hover:shadow-md transition flex flex-col items-center text-center"
            >
              {meta && <meta.Icon size={32} className={`${meta.accent} mb-2 sm:mb-1`} />}
              <div className="font-semibold text-slate-900 dark:text-slate-100 mt-1 sm:mt-2 text-xs sm:text-sm truncate max-w-full">{meta?.name || em.engine}</div>
              <div className="text-xl sm:text-3xl font-bold text-emerald-600 dark:text-emerald-400 mt-1 sm:mt-2">{em.mentions}</div>
              <div className="hidden sm:block text-xs text-slate-600 dark:text-slate-300 mt-2">
                {t('out_of_results').replace('{count}', String(em.scans))}
              </div>
              {em.scans > 0 && <div className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 mt-0.5 sm:mt-1">({percent}%)</div>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/**
 * Highlight matched brand variants and domain inside text.
 * Returns React nodes with matched portions wrapped in a styled span.
 * Case-insensitive. Hebrew/RTL safe — only renders the text, doesn't modify raw.
 */
function highlightMatches(
  text: string,
  brandVariants: string[],
  targetDomain: string | null
): React.ReactNode {
  if (!text) return text

  // Build a unique, sorted-by-length-desc list of search terms
  const terms = new Set<string>()
  for (const v of brandVariants) {
    if (v && v.trim().length >= 2) terms.add(v.trim())
  }
  if (targetDomain && targetDomain.trim().length >= 2) {
    const cleaned = targetDomain.trim().toLowerCase()
    terms.add(cleaned)
    terms.add(`www.${cleaned}`)
    terms.add(`https://${cleaned}`)
    terms.add(`http://${cleaned}`)
    terms.add(`https://www.${cleaned}`)
    terms.add(`http://www.${cleaned}`)
  }
  if (terms.size === 0) return text

  const sortedTerms = Array.from(terms).sort((a, b) => b.length - a.length)
  const escaped = sortedTerms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const pattern = new RegExp(`(${escaped.join('|')})`, 'gi')

  const parts = text.split(pattern)
  const lowerTerms = new Set(sortedTerms.map((s) => s.toLowerCase()))

  return parts.map((part, i) => {
    if (!part) return null
    if (lowerTerms.has(part.toLowerCase())) {
      return (
        <span
          key={i}
          className="font-bold text-emerald-700 bg-emerald-50 px-1 rounded"
        >
          {part}
        </span>
      )
    }
    return <React.Fragment key={i}>{part}</React.Fragment>
  })
}

/**
 * Find which brand variant (or domain) actually appears in the response text,
 * for display as a chip on the result row. Falls back to first variant if
 * the response text isn't loaded yet but the row is marked mentioned.
 */
function findMatchedLabels(
  responseText: string | null,
  brandVariants: string[],
  targetDomain: string | null,
  mentioned: boolean,
  cited: boolean
): { brandLabels: string[]; domainLabel: string | null; reMentioned: boolean; reCited: boolean } {
  const labels: string[] = []
  let domainLabel: string | null = null
  let reMentioned = mentioned
  let reCited = cited
  if (responseText) {
    const lower = responseText.toLowerCase()
    for (const v of brandVariants) {
      if (lower.includes(v.toLowerCase())) labels.push(v)
    }
    if (targetDomain) {
      const cleaned = targetDomain.toLowerCase()
      // Detect bare domain, www.domain, full URL, or markdown link
      if (
        lower.includes(cleaned) ||
        lower.includes(`www.${cleaned}`) ||
        lower.includes(`https://${cleaned}`) ||
        lower.includes(`http://${cleaned}`)
      ) {
        domainLabel = targetDomain
        reCited = true
      }
    }
    // Re-evaluate mentioned flag based on actual content
    if (labels.length > 0) reMentioned = true
  } else {
    // Row preview without responseText loaded: show first brand variant as a hint.
    if (mentioned && brandVariants[0]) labels.push(brandVariants[0])
  }
  if (reCited && targetDomain && !domainLabel) domainLabel = targetDomain
  return { brandLabels: Array.from(new Set(labels)), domainLabel, reMentioned, reCited }
}

function ResultRowCard({
  result,
  highlighted,
  brandVariants,
  targetDomain,
  isHebrew,
  onRowClick,
  t,
}: {
  result: ResultRow
  highlighted: boolean
  brandVariants: string[]
  targetDomain: string | null
  isHebrew: boolean
  onRowClick: (r: ResultRow) => void
  t: T
}) {
  const meta = ENGINE_META[result.engine as keyof typeof ENGINE_META]
  const { brandLabels, domainLabel, reMentioned, reCited } = findMatchedLabels(
    result.responseText,
    brandVariants,
    targetDomain,
    result.mentioned,
    result.targetCited
  )

  const scannedAtStr = result.scannedAt ? formatShortDateTime(result.scannedAt, isHebrew) : null

  return (
    <div
      onClick={() => onRowClick(result)}
      className={`rounded-lg border bg-white dark:bg-slate-900 p-4 hover:shadow-md hover:border-slate-300 dark:hover:border-slate-600 transition cursor-pointer ${
        highlighted ? 'border-indigo-300 ring-2 ring-indigo-200 dark:ring-indigo-700' : 'border-slate-200 dark:border-slate-700'
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          {/* Row 1: query text */}
          <p className="text-sm font-medium text-slate-900 dark:text-slate-100 line-clamp-2">{result.promptText}</p>

          {/* Row 2: engine + status badges + scan time */}
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            {meta && <meta.Icon size={16} className={meta.accent} />}
            <span className="text-xs text-slate-600 dark:text-slate-300 font-medium">{meta?.name || result.engine}</span>

            {reMentioned ? (
              <Badge variant="success" className="!text-xs">{t('mentioned')}</Badge>
            ) : (
              <Badge variant="neutral" className="!text-xs">{t('not_mentioned')}</Badge>
            )}
            {reCited ? (
              <Badge variant="success" className="!text-xs">{t('target_cited')}</Badge>
            ) : (
              <Badge variant="neutral" className="!text-xs">{t('not_cited')}</Badge>
            )}

            {scannedAtStr && (
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                · {t('scanned_at')} {scannedAtStr}
              </span>
            )}
          </div>

          {/* Row 3: matched variants — only when something was matched */}
          {(brandLabels.length > 0 || domainLabel) && (
            <div className="flex items-center gap-1.5 mt-2 flex-wrap">
              <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">{t('what_was_mentioned')}:</span>
              {brandLabels.map((label) => (
                <span
                  key={label}
                  className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800"
                >
                  {label}
                </span>
              ))}
              {domainLabel && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-mono bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                  {domainLabel}
                </span>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {result.citationCount > 0 && (
            <Badge variant="info" className="!text-xs">
              {result.citationCount} {t('citations')}
            </Badge>
          )}
          <ExternalLinkIcon size={16} className="text-slate-400 dark:text-slate-500" />
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
    commercial: 'warning',
    alternatives: 'neutral',
    pre_purchase: 'info',
    gift: 'success',
  }

  // Intent label follows dashboard UI language, not the project's scan language.
  const label =
    (
      {
        brand: t('intent_brand'),
        comparison: t('intent_comparison'),
        commercial: t('intent_commercial'),
        local: t('intent_local'),
        transactional: t('intent_transactional'),
        recommendation: t('intent_recommendation'),
        informational: t('intent_informational'),
        alternatives: t('intent_alternatives'),
        pre_purchase: t('intent_pre_purchase'),
        gift: t('intent_gift'),
      } as Record<string, string>
    )[question.intent] ||
    question.intent

  return (
    <div className="flex items-start gap-3 p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:shadow-sm transition">
      <div className="flex-1 min-w-0">
        <p className="text-sm text-slate-900 dark:text-slate-100 font-medium line-clamp-2 mb-1.5">{question.prompt}</p>
        <div className="flex items-center gap-1.5 mb-1">
          <Badge variant={intentTone[question.intent] || 'neutral'} className="!text-[9px]">
            {label}
          </Badge>
          <span className="text-[10px] text-slate-500 dark:text-slate-400">{question.qualityScore}%</span>
        </div>
        {question.reason && (
          <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2" title={question.reason}>
            {question.reason}
          </p>
        )}
      </div>
      <button
        onClick={onAdd}
        className="shrink-0 w-8 h-8 rounded-lg bg-indigo-100 text-indigo-700 hover:bg-indigo-200 transition flex items-center justify-center"
        aria-label={t('add_to_queries_aria')}
      >
        +
      </button>
    </div>
  )
}

function ResultDetailDrawer({
  open,
  result,
  brandVariants,
  targetDomain,
  onClose,
  t,
}: {
  open: boolean
  result: ResultRow
  brandVariants: string[]
  targetDomain: string | null
  onClose: () => void
  t: T
}) {
  if (!open) return null

  const engineMeta = ENGINE_META[result.engine as keyof typeof ENGINE_META]
  const { brandLabels, domainLabel, reMentioned, reCited } = findMatchedLabels(
    result.responseText,
    brandVariants,
    targetDomain,
    result.mentioned,
    result.targetCited
  )

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
        className="bg-white dark:bg-slate-900 w-full max-w-2xl h-full overflow-y-auto shadow-xl animate-in slide-in-from-right"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-1">{result.promptText}</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">{engineMeta?.name || result.engine}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 text-2xl leading-none">
            ×
          </button>
        </div>

        <div className="space-y-6 p-6">
          <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-4">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">{t('scan_activity')}</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-xs text-slate-600 dark:text-slate-300">{t('mentioned')}</div>
                <div className={`text-lg font-bold ${reMentioned ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-400 dark:text-slate-500'}`}>
                  {reMentioned ? '✓' : '—'}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-600 dark:text-slate-300">{t('target_cited')}</div>
                <div className={`text-lg font-bold ${reCited ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-400 dark:text-slate-500'}`}>
                  {reCited ? '✓' : '—'}
                </div>
              </div>
            </div>
            {(brandLabels.length > 0 || domainLabel) && (
              <div className="flex items-center gap-1.5 mt-3 flex-wrap">
                <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">{t('what_was_mentioned')}:</span>
                {brandLabels.map((label) => (
                  <span
                    key={label}
                    className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800"
                  >
                    {label}
                  </span>
                ))}
                {domainLabel && (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-mono bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                    {domainLabel}
                  </span>
                )}
              </div>
            )}
          </div>

          {result.citations.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {t('sources')} ({result.citations.length})
              </h3>
              <div className="space-y-2">
                {result.citations.map((c, i) => (
                  <a
                    key={i}
                    href={c.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block p-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 hover:shadow-sm transition"
                  >
                    <div className="flex items-center gap-2 text-sm">
                      <span className={`font-medium ${c.is_target_domain ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-900 dark:text-slate-100'}`}>
                        {c.domain}
                      </span>
                      {c.is_target_domain && (
                        <Badge variant="success" className="!text-xs">{t('your_domain')}</Badge>
                      )}
                    </div>
                  </a>
                ))}
              </div>
            </div>
          )}

          {result.responseText && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t('ai_answer')}</h3>
              <div className="text-sm text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 rounded-lg p-4 space-y-2 max-h-96 overflow-y-auto">
                {cleanResponseText(result.responseText)
                  .split('\n')
                  .map((line, i) => (
                    <p key={i} className="leading-relaxed">
                      {line ? highlightMatches(line, brandVariants, targetDomain) : <br />}
                    </p>
                  ))}
              </div>
            </div>
          )}
        </div>

        <div className="sticky bottom-0 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6">
          <Button variant="outline" onClick={onClose} className="w-full">
            {t('close')}
          </Button>
        </div>
      </div>
    </div>
  )
}

/**
 * Manual "+ שאלת AI חדשה" modal. Supports both single and multi-question entry:
 * each non-empty line is sent as a separate query. Duplicates (within the input
 * or against existing prompts) are skipped client-side; the API also dedups.
 */
function NewAIQueryModal({
  open,
  onClose,
  projectId,
  domain,
  businessName,
  country,
  language,
  existingPrompts,
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
  existingPrompts: PromptRow[]
  onAdded: () => void
  t: T
}) {
  const { language: dashboardLanguage } = useDashboardLanguage()
  const [prompt, setPrompt] = useState('')
  const [targetDomain, setTargetDomain] = useState(domain || '')
  const [targetBrand, setTargetBrand] = useState(businessName || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const existingSet = useMemo(
    () => new Set(existingPrompts.map((p) => p.prompt.trim().toLowerCase())),
    [existingPrompts]
  )

  // Parse the textarea into deduplicated, trimmed lines.
  const parsedQueries = useMemo(() => {
    const seen = new Set<string>()
    const out: string[] = []
    for (const raw of prompt.split('\n')) {
      const line = raw.trim()
      if (!line) continue
      const key = line.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      out.push(line)
    }
    return out
  }, [prompt])

  const newQueries = useMemo(
    () => parsedQueries.filter((q) => !existingSet.has(q.toLowerCase())),
    [parsedQueries, existingSet]
  )
  const skippedDuplicates = parsedQueries.length - newQueries.length

  const handleSubmit = async () => {
    if (parsedQueries.length === 0) {
      setError(t('multi_query_help'))
      return
    }

    setSaving(true)
    setError(null)
    let failures = 0
    try {
      for (const q of parsedQueries) {
        try {
          const res = await fetch('/api/ai-visibility/prompts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              projectId,
              prompt: q,
              country,
              language,
              targetDomain: targetDomain || null,
              targetBrandName: targetBrand || null,
            }),
          })
          if (!res.ok) failures++
        } catch {
          failures++
        }
      }
      setPrompt('')
      setTargetDomain(domain || '')
      setTargetBrand(businessName || '')
      onAdded()
      onClose()
      if (failures > 0) {
        setError(`${failures} ${t('error')}`)
      }
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  const isHebrew = dashboardLanguage === 'he'

  const countText =
    parsedQueries.length === 0
      ? ''
      : parsedQueries.length === 1
      ? t('will_create_one_query')
      : t('will_create_n_queries').replace('{count}', String(newQueries.length))

  return (
    <Modal open={open} onClose={onClose} title={t('new_ai_query_title')} size="md">
      <div className="space-y-4" dir={isHebrew ? 'rtl' : 'ltr'}>
        {error && (
          <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>
        )}

        <div>
          <label className="block text-sm font-medium text-slate-900 dark:text-slate-100 mb-2">{t('query_label')}</label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={t('multi_query_placeholder')}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm resize-none"
            rows={6}
            disabled={saving}
          />
          <p className="text-xs text-slate-500 mt-1">{t('multi_query_help')}</p>
          {countText && (
            <p className="text-xs text-indigo-600 mt-1 font-medium">
              {countText}
              {skippedDuplicates > 0 && (
                <span className="text-slate-500 font-normal">
                  {' '}
                  ({skippedDuplicates} {t('query_already_exists')})
                </span>
              )}
            </p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-900 dark:text-slate-100 mb-2">{t('target_domain_label')}</label>
          <Input
            type="text"
            value={targetDomain}
            onChange={(e) => setTargetDomain(e.target.value)}
            placeholder={domain || t('target_domain_label')}
            disabled={saving}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-900 dark:text-slate-100 mb-2">{t('target_brand_label')}</label>
          <Input
            type="text"
            value={targetBrand}
            onChange={(e) => setTargetBrand(e.target.value)}
            placeholder={businessName || t('target_brand_label')}
            disabled={saving}
          />
        </div>

        <div className="flex gap-2 border-t border-slate-200 dark:border-slate-700 pt-3">
          <Button variant="outline" onClick={onClose} disabled={saving} className="flex-1">
            {t('cancel')}
          </Button>
          <Button
            onClick={handleSubmit}
            loading={saving}
            disabled={parsedQueries.length === 0 || saving}
            className="flex-1"
          >
            {t('create_query')}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

/* --- Helpers --- */

function formatShortDateTime(iso: string, isHebrew: boolean): string {
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return ''
    return d.toLocaleString(isHebrew ? 'he-IL' : 'en-US', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return ''
  }
}
