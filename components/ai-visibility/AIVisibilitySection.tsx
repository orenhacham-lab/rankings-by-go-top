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
import { BarChart3, Link, Bot, AlertTriangle, Award, Layers, Cpu, TrendingDown } from 'lucide-react'
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
import type { GeoInsights, QueryIntent, CitationType } from '@/lib/ai-visibility/geo-signals'
import { generateGeoExplanation } from '@/lib/ai-visibility/geo-explanations'
import { generateGeoRecommendations } from '@/lib/ai-visibility/geo-recommendations'
import type {
  GeoOpportunityMapping,
  ContentSignalKey,
  SignalStats,
  CitationStats,
  EngineStats,
  MissingOpportunity,
} from '@/lib/ai-visibility/geo-opportunity-mapping'
import type {
  GeoCompetitorIntelligence,
  CompetitorCategory,
} from '@/lib/ai-visibility/geo-competitor-intelligence'
import type { BusinessMentionIntelligence } from '@/lib/ai-visibility/geo-business-mentions'

const SUPPORTED_ENGINES = ['chatgpt', 'perplexity', 'gemini', 'copilot', 'grok', 'google_ai_mode'] as const

type ResultRow = {
  id: string
  runId: string
  promptId: string | null
  engine: string
  promptText: string
  // Raw DB values — never overwritten.
  mentioned: boolean
  targetCited: boolean
  citationCount: number
  status: string | null
  scannedAt: string | null
  citations: Array<{ domain: string; is_target_domain: boolean; url: string; title?: string | null }>
  responseText: string | null
  // Server-computed display values — present from /api/ai-visibility/runs;
  // used everywhere the UI counts or labels mentions/citations.
  displayMentioned: boolean
  displayCited: boolean
  displayBrandLabels: string[]
  displayDomainLabel: string | null
  // GEO Insights — server-computed, rule-based, read-only. Drawer-only UI.
  geoInsights: GeoInsights | null
}

const EMPTY_GEO_INSIGHTS: GeoInsights = {
  queryIntents: [],
  citationTypes: [],
  contentSignals: {
    hasList: false,
    hasComparisonLanguage: false,
    hasPricingLanguage: false,
    hasReviewLanguage: false,
    hasLocalLanguage: false,
    hasRecommendationLanguage: false,
  },
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
  const [geoOpportunityMapping, setGeoOpportunityMapping] = useState<GeoOpportunityMapping | null>(null)
  const [geoCompetitorIntelligence, setGeoCompetitorIntelligence] = useState<GeoCompetitorIntelligence | null>(null)
  const [businessMentionIntelligence, setBusinessMentionIntelligence] = useState<BusinessMentionIntelligence | null>(null)
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
  const [scanProgress, setScanProgress] = useState<number>(0)
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

      // Project-level GEO Opportunity Mapping — server-computed, read-only.
      // Falls back to null when API has no aggregation (older deploy).
      setGeoOpportunityMapping(
        runsData.geoOpportunityMapping
          ? (runsData.geoOpportunityMapping as GeoOpportunityMapping)
          : null
      )

      // Project-level GEO Competitor Intelligence — server-computed, read-only.
      setGeoCompetitorIntelligence(
        runsData.geoCompetitorIntelligence
          ? (runsData.geoCompetitorIntelligence as GeoCompetitorIntelligence)
          : null
      )

      // Business Mention Intelligence — server-computed, deterministic
      // competitor mentions in response text (vs. source citations).
      setBusinessMentionIntelligence(
        runsData.businessMentionIntelligence
          ? (runsData.businessMentionIntelligence as BusinessMentionIntelligence)
          : null
      )

      const results: ResultRow[] = []
      for (const run of runsData.runs || []) {
        for (const result of run.results || []) {
          // Prefer the server-computed display fields. If a stale API response
          // doesn't include them (older deploys), fall back to the raw DB flags.
          const hasDisplay = typeof result.displayMentioned === 'boolean'
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
            displayMentioned: hasDisplay ? result.displayMentioned : (result.mentioned || false),
            displayCited: hasDisplay ? result.displayCited : (result.targetCited || false),
            displayBrandLabels: Array.isArray(result.displayBrandLabels) ? result.displayBrandLabels : [],
            displayDomainLabel: typeof result.displayDomainLabel === 'string' ? result.displayDomainLabel : null,
            geoInsights: result.geoInsights ?? null,
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
          // Summary counts must match the badges shown in the list — use the
          // server-computed display values, not raw DB flags.
          if (r.displayMentioned) totalMentions++
          if (r.displayCited) totalCitations++

          const existing = engineMap.get(r.engine) || {
            engine: r.engine,
            scans: 0,
            mentions: 0,
            citations: 0,
            rate: 0,
          }
          existing.scans++
          if (r.displayMentioned) existing.mentions++
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
        enginesCovered: SUPPORTED_ENGINES.length,
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
      const businessMentionEngines = results.filter((r) => r.displayMentioned).length
      const targetCitedCount = results.filter((r) => r.displayCited).length
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
          const enriched: ResultRow = {
            ...result,
            citations: fullResult.citations || [],
            responseText: fullResult.responseText || null,
          }
          setSelectedResult(enriched)
          // Propagate loaded responseText back into allResults so the list view
          // can re-evaluate mention/citation badges using actual content.
          setAllResults((prev) =>
            prev.map((r) => (r.id === result.id ? { ...r, citations: enriched.citations, responseText: enriched.responseText } : r))
          )
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
      setScanProgress(8)
      setScanStatus(t('scan_in_progress'))
      setError(null)

      // Animate fake progress from 8% to 90%
      let progress = 8
      const progressInterval = setInterval(() => {
        progress += Math.random() * 15
        if (progress > 90) progress = 90
        setScanProgress(progress)
      }, 300)

      try {
        const res = await fetch('/api/ai-visibility/runs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId, promptId, engine }),
        })
        if (!res.ok) {
          clearInterval(progressInterval)
          const body = await res.json().catch(() => ({}))
          throw new Error(body.error || `HTTP ${res.status}`)
        }
        const body = await res.json()
        clearInterval(progressInterval)
        setScanProgress(100)
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
        clearInterval(progressInterval)
        setError(e instanceof Error ? e.message : 'Scan failed')
        setScanStatus(null)
      } finally {
        setScanningKey(null)
        // Reset progress after fade
        setTimeout(() => {
          setScanProgress(0)
          // Auto-dismiss success message after 3 seconds
          setTimeout(() => setScanStatus(null), 3000)
        }, 500)
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
      if (filterMentioned !== null && r.displayMentioned !== filterMentioned) return false
      if (filterCited !== null && r.displayCited !== filterCited) return false
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

          {/* GEO OPPORTUNITY MAPPING (Phase 2A) — project-level aggregated insights */}
          <GeoOpportunityMappingSection
            mapping={geoOpportunityMapping}
            results={allResults}
            isHebrew={isHebrew}
            t={t}
          />

          {/* GEO COMPETITOR INTELLIGENCE (Phase 2C+2D) — sources + business mentions */}
          <GeoCompetitorIntelligenceSection
            intelligence={geoCompetitorIntelligence}
            businessMentions={businessMentionIntelligence}
            results={allResults}
            isHebrew={isHebrew}
            t={t}
          />
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
                          <div key={engine} className="relative inline-block">
                            <button
                              onClick={() => !scanning && !scanned && scanEngine(p.id, engine)}
                              disabled={scanning || scanned}
                              className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium border transition relative overflow-hidden ${
                                scanned
                                  ? 'bg-emerald-50 dark:bg-emerald-900/30 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 cursor-default'
                                  : scanning
                                  ? 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 cursor-wait'
                                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-indigo-300 dark:hover:border-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 hover:text-indigo-700 dark:hover:text-indigo-300 cursor-pointer'
                              }`}
                            >
                              {scanning && (
                                <div
                                  className="absolute inset-0 bg-indigo-200 dark:bg-indigo-700/40 transition-all"
                                  style={{ width: `${scanProgress}%` }}
                                />
                              )}
                              <span className="relative z-10">
                                {meta && <meta.Icon size={14} className={meta.accent} />}
                              </span>
                              <span className="relative z-10">{scanning ? t('scanning') : meta?.name || engine}</span>
                              {scanned && <span className="relative z-10 text-emerald-600">✓</span>}
                            </button>
                          </div>
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
            defaultCollapsed={true}
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
          isHebrew={isHebrew}
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
          <div className="text-2xl sm:text-4xl font-bold text-indigo-700 dark:text-indigo-300">
            {metrics.enginesWithMentions}/{metrics.enginesCovered}
          </div>
          <div className="hidden sm:block text-sm text-slate-600 dark:text-slate-300 mt-2">
            {t('ai_engines')}
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

  // Rule 2: Weak questions — questions where business didn't appear in most/all engines.
  // Use the same display-effective count the badges and summary use, so a
  // question flagged "weak" here matches what the user sees in the list.
  const questionStats = new Map<string | null, { total: number; mentions: number; promptText: string }>()
  for (const result of allResults) {
    if (result.status !== 'success') continue
    const key = result.promptId || `__noprompt__${result.id}`
    const existing = questionStats.get(key) || { total: 0, mentions: 0, promptText: result.promptText }
    existing.total++
    if (result.displayMentioned) existing.mentions++
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
/**
 * Strip protocol, query params, hash, and trailing slashes for clean display.
 * Detection variants are not modified — this is presentation only.
 */
function cleanDisplayDomain(s: string | null): string | null {
  if (!s) return s
  return s
    .replace(/^https?:\/\//i, '')
    .replace(/[?#].*$/, '')
    .replace(/\/+$/, '')
    .trim()
}

/**
 * Check if a citation's domain matches the target domain (ignoring www prefix).
 * Used for citation-list rendering and for setting reCited from sources.
 */
function isTargetCitation(citationDomain: string | null | undefined, targetDomain: string | null): boolean {
  if (!citationDomain || !targetDomain) return false
  const c = citationDomain.toLowerCase().replace(/^www\./, '')
  const t = targetDomain.toLowerCase().replace(/^www\./, '')
  return c === t
}

function findMatchedLabels(
  responseText: string | null,
  brandVariants: string[],
  targetDomain: string | null,
  mentioned: boolean,
  cited: boolean,
  citations?: Array<{ domain: string; is_target_domain: boolean; url: string; title?: string | null }> | null
): { brandLabels: string[]; domainLabel: string | null; reMentioned: boolean; reCited: boolean } {
  const brandLabels: string[] = []
  let domainLabel: string | null = null
  // Fallback to DB-stored values when we can't re-evaluate
  let reMentioned = mentioned
  let reCited = cited

  // A variant is "domain-form" if it looks like a URL or domain (has TLD, www, or scheme).
  // This is a CLASSIFICATION check — detection itself is unchanged.
  const isDomainForm = (s: string): boolean => {
    const t = s.toLowerCase().trim()
    if (/^https?:\/\//.test(t)) return true
    if (/^www\./.test(t)) return true
    if (/\.[a-z]{2,}(\/|$|\?|#)/.test(t)) return true
    return false
  }

  if (responseText) {
    // We can re-evaluate precisely from the actual text — reset and rebuild
    // so domain-only responses do not falsely flag as "mentioned".
    reMentioned = false
    reCited = false

    const lower = responseText.toLowerCase()

    // Find every variant that appears in the response (detection unchanged)
    const matched: string[] = []
    for (const v of brandVariants) {
      if (lower.includes(v.toLowerCase())) matched.push(v)
    }

    // Filter to most specific matches (drop shorter substrings of longer matches)
    const filtered: string[] = []
    for (const variant of matched) {
      const variantLower = variant.toLowerCase()
      const isShorterSubstring = matched.some(
        (other) => other !== variant &&
        other.toLowerCase().includes(variantLower) &&
        other.length > variant.length
      )
      if (!isShorterSubstring) filtered.push(variant)
    }

    // Strict classification:
    //   domain-form match  → reCited only  (never reMentioned)
    //   brand-form match   → reMentioned only  (never reCited)
    for (const v of filtered) {
      if (isDomainForm(v)) {
        if (!domainLabel || v.length > domainLabel.length) {
          domainLabel = v
        }
        reCited = true
      } else {
        brandLabels.push(v)
        reMentioned = true
      }
    }

    // Explicit targetDomain substring check (only contributes to reCited)
    if (targetDomain) {
      const cleaned = targetDomain.toLowerCase()
      if (
        lower.includes(cleaned) ||
        lower.includes(`www.${cleaned}`) ||
        lower.includes(`https://${cleaned}`) ||
        lower.includes(`http://${cleaned}`)
      ) {
        if (!domainLabel) domainLabel = targetDomain
        reCited = true
      }
    }
  }

  // Check citations for target domain match. Citations contribute ONLY to
  // reCited — having the domain in the sources list is a citation, not a mention.
  if (citations && citations.length > 0 && targetDomain) {
    for (const c of citations) {
      if (c.is_target_domain || isTargetCitation(c.domain, targetDomain)) {
        if (!domainLabel) domainLabel = c.domain || targetDomain
        reCited = true
        break
      }
    }
  }

  if (reCited && targetDomain && !domainLabel) domainLabel = targetDomain

  // Final display cleanup: strip protocols / query params from the domain label
  const displayDomain = cleanDisplayDomain(domainLabel)

  return { brandLabels: Array.from(new Set(brandLabels)), domainLabel: displayDomain, reMentioned, reCited }
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
  // Prefer the server-computed display fields so the list is correct on first
  // render. If the drawer has loaded responseText, re-evaluate live to pick up
  // any additional labels (and for in-text highlighting parity).
  const live = findMatchedLabels(
    result.responseText,
    brandVariants,
    targetDomain,
    result.mentioned,
    result.targetCited,
    result.citations
  )
  const brandLabels = result.responseText ? live.brandLabels : result.displayBrandLabels
  const domainLabel = result.responseText ? live.domainLabel : result.displayDomainLabel
  const reMentioned = result.responseText ? live.reMentioned : result.displayMentioned
  const reCited = result.responseText ? live.reCited : result.displayCited

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
              <Badge variant="info" className="!text-xs">{t('target_cited')}</Badge>
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
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2">
              {brandLabels.length > 0 && (
                <div className="inline-flex items-center gap-1.5 flex-wrap">
                  <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">{t('what_was_mentioned')}:</span>
                  {brandLabels.map((label) => (
                    <span
                      key={label}
                      className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800"
                    >
                      {label}
                    </span>
                  ))}
                </div>
              )}
              {domainLabel && (
                <div className="inline-flex items-center gap-1.5 flex-wrap">
                  <span className="text-[11px] text-blue-600 dark:text-blue-400 font-medium">{t('what_was_cited')}:</span>
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-mono bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                    {domainLabel}
                  </span>
                </div>
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
  isHebrew,
  onClose,
  t,
}: {
  open: boolean
  result: ResultRow
  brandVariants: string[]
  targetDomain: string | null
  isHebrew: boolean
  onClose: () => void
  t: T
}) {
  if (!open) return null

  const engineMeta = ENGINE_META[result.engine as keyof typeof ENGINE_META]
  // Same pattern as the list card: use server-computed values until the
  // drawer's responseText load lets us re-evaluate live.
  const live = findMatchedLabels(
    result.responseText,
    brandVariants,
    targetDomain,
    result.mentioned,
    result.targetCited,
    result.citations
  )
  const brandLabels = result.responseText ? live.brandLabels : result.displayBrandLabels
  const domainLabel = result.responseText ? live.domainLabel : result.displayDomainLabel
  const reMentioned = result.responseText ? live.reMentioned : result.displayMentioned
  const reCited = result.responseText ? live.reCited : result.displayCited

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
                <div className="text-xs text-blue-600 dark:text-blue-400">{t('target_cited')}</div>
                <div className={`text-lg font-bold ${reCited ? 'text-blue-700 dark:text-blue-400' : 'text-slate-400 dark:text-slate-500'}`}>
                  {reCited ? '✓' : '—'}
                </div>
              </div>
            </div>
            {(brandLabels.length > 0 || domainLabel) && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-3">
                {brandLabels.length > 0 && (
                  <div className="inline-flex items-center gap-1.5 flex-wrap">
                    <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">{t('what_was_mentioned')}:</span>
                    {brandLabels.map((label) => (
                      <span
                        key={label}
                        className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800"
                      >
                        {label}
                      </span>
                    ))}
                  </div>
                )}
                {domainLabel && (
                  <div className="inline-flex items-center gap-1.5 flex-wrap">
                    <span className="text-[11px] text-blue-600 dark:text-blue-400 font-medium">{t('what_was_cited')}:</span>
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-mono bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                      {domainLabel}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          <GeoExplanationSection
            geoInsights={result.geoInsights}
            displayMentioned={result.displayMentioned}
            displayCited={result.displayCited}
            displayBrandLabels={result.displayBrandLabels}
            displayDomainLabel={result.displayDomainLabel}
            isHebrew={isHebrew}
            t={t}
          />

          <GeoRecommendationsSection
            geoInsights={result.geoInsights}
            displayMentioned={result.displayMentioned}
            displayCited={result.displayCited}
            isHebrew={isHebrew}
            t={t}
          />

          <GeoInsightsCollapsible insights={result.geoInsights} t={t} />

          {result.citations.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {t('sources')} ({result.citations.length})
              </h3>
              <div className="space-y-2">
                {result.citations.map((c, i) => {
                  // Fall back to client-side www-tolerant match when backend
                  // is_target_domain wasn't set on legacy rows.
                  const isTarget = c.is_target_domain || isTargetCitation(c.domain, targetDomain)
                  const displayDomain = cleanDisplayDomain(c.domain) || c.domain
                  return (
                    <a
                      key={i}
                      href={c.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block p-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 hover:shadow-sm transition"
                    >
                      <div className="flex items-center gap-2 text-sm">
                        <span className={`font-medium ${isTarget ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-900 dark:text-slate-100'}`}>
                          {displayDomain}
                        </span>
                        {isTarget && (
                          <Badge variant="success" className="!text-xs">{t('your_domain')}</Badge>
                        )}
                      </div>
                    </a>
                  )
                })}
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
 * GEO Opportunity Mapping — actionable recommendations panel.
 *
 * Answers: "What should I improve on my website so AI engines show me more?"
 *
 * Dynamic card count: each card renders ONLY if it has a real opportunity.
 * If no card has data, a single fallback message is shown.
 *
 * Possible cards (deterministic, data-driven, no inventions):
 *   1. תוכן שכדאי לחזק — weak content signals to strengthen
 *   2. שאלות שבהן העסק חלש — specific prompts where business is missing/weak
 *   3. מנועים שכדאי לחזק — engines with significantly low visibility
 *   4. מה חסר כשהעסק לא מופיע — content patterns missing from failed results
 */
function GeoOpportunityMappingSection({
  mapping,
  results,
  isHebrew,
  t,
}: {
  mapping: GeoOpportunityMapping | null
  results: ResultRow[]
  isHebrew: boolean
  t: T
}) {
  if (!mapping || mapping.totalResults === 0) {
    return null
  }

  const engineDisplayName = (engine: string): string => {
    const meta = ENGINE_META[engine as keyof typeof ENGINE_META]
    return meta?.name || engine
  }

  // ─────────────────────────────────────────────────────────────────────
  // Card 1 templates: actionable instruction per weak content signal.
  // Each phrase is the full sentence (no trailing fragment), so they
  // read naturally on their own.
  // ─────────────────────────────────────────────────────────────────────
  const weakSignalRecommendation = (
    signal: ContentSignalKey,
    lang: 'he' | 'en',
  ): string => {
    if (lang === 'he') {
      switch (signal) {
        case 'pricing':
          return 'להוסיף באתר מידע ברור על מחירים, טווחי מחיר ומה כלול בשירות.'
        case 'reviews':
          return 'להציג ביקורות, דירוגים ועדויות לקוחות באזורים בולטים באתר.'
        case 'comparison':
          return 'להוסיף עמודי השוואה שיעזרו ללקוח לבחור בין מוצרים, שירותים או אפשרויות.'
        case 'list':
          return 'להוסיף שאלות נפוצות, רשימות ותשובות קצרות לשאלות שחוזרות אצל לקוחות.'
        case 'recommendation':
          return 'להוסיף תוכן המלצה שמסביר ללקוח כיצד לבחור את הפתרון המתאים לו.'
        case 'local':
          return 'להבליט אזורי שירות, כתובת, זמינות ומידע מקומי רלוונטי.'
      }
    }
    switch (signal) {
      case 'pricing':
        return 'Add clear pricing information, price ranges, and what is included.'
      case 'reviews':
        return 'Display reviews, ratings, and customer testimonials in prominent areas of the site.'
      case 'comparison':
        return 'Add comparison pages that help customers choose between products, services, or options.'
      case 'list':
        return 'Add FAQs, lists, and concise answers to recurring customer questions.'
      case 'recommendation':
        return 'Add recommendation content explaining how to choose the right solution.'
      case 'local':
        return 'Highlight service areas, address, availability, and relevant local information.'
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // Card 4 templates: structured as "X appeared less when business
  // didn't appear. Worth doing Y."
  // ─────────────────────────────────────────────────────────────────────
  const missingSignalRecommendation = (
    signal: ContentSignalKey,
    lang: 'he' | 'en',
  ): string => {
    if (lang === 'he') {
      switch (signal) {
        case 'pricing':
          return 'מידע על מחירים הופיע פחות כשהעסק לא הופיע. כדאי להציג טווחי מחיר, מה כלול בשירות ותנאי רכישה.'
        case 'reviews':
          return 'ביקורות ודירוגים הופיעו פחות כשהעסק לא הופיע. כדאי להבליט עדויות לקוחות והוכחות אמון באתר.'
        case 'comparison':
          return 'תוכן השוואתי הופיע פחות כשהעסק לא הופיע. כדאי להוסיף עמודים שמשווים בין שירותים, מוצרים או אפשרויות.'
        case 'list':
          return 'תוכן מסודר לשאלות נפוצות הופיע פחות כשהעסק לא הופיע. כדאי להוסיף תשובות קצרות וברורות לשאלות מרכזיות.'
        case 'recommendation':
          return 'תוכן המלצה הופיע פחות כשהעסק לא הופיע. כדאי להוסיף תוכן שמכוון את הלקוח לבחירה הנכונה עבורו.'
        case 'local':
          return 'מידע מקומי הופיע פחות כשהעסק לא הופיע. כדאי להבליט אזורי שירות, כתובת וזמינות באתר.'
      }
    }
    switch (signal) {
      case 'pricing':
        return 'Pricing information appeared less when the business did not appear. Worth displaying price ranges, what is included, and purchase terms.'
      case 'reviews':
        return 'Reviews and ratings appeared less when the business did not appear. Worth highlighting customer testimonials and trust signals.'
      case 'comparison':
        return 'Comparison content appeared less when the business did not appear. Worth adding pages that compare services, products, or options.'
      case 'list':
        return 'FAQ and structured content appeared less when the business did not appear. Worth adding clear answers to key recurring questions.'
      case 'recommendation':
        return 'Recommendation content appeared less when the business did not appear. Worth adding guidance that helps customers choose.'
      case 'local':
        return 'Local information appeared less when the business did not appear. Worth highlighting service areas, address, and availability.'
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // Card 1: Content to strengthen — weak content signals only.
  // A signal is "weak" if its visibilityRate is below 60% (genuinely
  // underperforming in the project's successful answers).
  // ─────────────────────────────────────────────────────────────────────
  const contentStrengthCard = (() => {
    const lines: Array<{ text: string; isFirst?: boolean }> = []
    const weak = mapping.contentSignals
      .filter((s) => s.visibilityRate < 60)
      .sort((a, b) => a.visibilityRate - b.visibilityRate)
      .slice(0, 3)

    if (weak.length === 0) return []

    weak.forEach((signal, idx) => {
      lines.push({
        text: weakSignalRecommendation(signal.signal, isHebrew ? 'he' : 'en'),
        isFirst: idx === 0,
      })
    })
    return lines
  })()

  // ─────────────────────────────────────────────────────────────────────
  // Card 2: Specific prompts where business is missing or nearly missing.
  // For each prompt, count how many engines featured the business vs.
  // total engines scanned. Only show prompts where the business is in
  // 0 engines OR at most 1 out of 3+ engines.
  // ─────────────────────────────────────────────────────────────────────
  const weakPromptsCard = (() => {
    const lines: Array<{ text: string; isFirst?: boolean }> = []

    // Group results by prompt text (fallback to promptId if no text).
    const byPrompt = new Map<string, { promptText: string; total: number; success: number }>()
    for (const r of results) {
      const key = r.promptText?.trim() || r.promptId || ''
      if (!key) continue
      const isSuccess = r.displayMentioned || r.displayCited
      const entry = byPrompt.get(key) || { promptText: r.promptText || '', total: 0, success: 0 }
      entry.total += 1
      if (isSuccess) entry.success += 1
      byPrompt.set(key, entry)
    }

    // Only count prompts with enough engine coverage (at least 2 scans),
    // so single-engine prompts don't pollute the list.
    const weakPrompts = Array.from(byPrompt.values())
      .filter((p) => p.total >= 2 && p.promptText)
      .map((p) => ({
        ...p,
        rate: Math.round((p.success / p.total) * 100),
      }))
      .filter((p) => p.rate <= 25) // missing or near-missing
      .sort((a, b) => a.rate - b.rate)
      .slice(0, 3)

    if (weakPrompts.length === 0) return []

    weakPrompts.forEach((p, idx) => {
      // Truncate long prompts so the card stays scannable.
      const promptDisplay = p.promptText.length > 90
        ? p.promptText.slice(0, 90).trim() + '…'
        : p.promptText
      const actionText = isHebrew
        ? 'כדאי ליצור עמוד תוכן או פסקת FAQ שעונה ישירות על השאלה הזו.'
        : 'Consider creating a content page or FAQ section that directly answers this question.'
      const text = isHebrew
        ? `העסק לא הופיע בשאלה: "${promptDisplay}"\n${actionText}`
        : `The business did not appear for: "${promptDisplay}"\n${actionText}`
      lines.push({ text, isFirst: idx === 0 })
    })
    return lines
  })()

  // ─────────────────────────────────────────────────────────────────────
  // Card 3: Engines worth strengthening — engines where visibility is
  // significantly low (rate < 50% AND clearly below the overall average).
  // ─────────────────────────────────────────────────────────────────────
  const weakEnginesCard = (() => {
    const lines: Array<{ text: string; isFirst?: boolean }> = []

    const avgRate = mapping.totalResults > 0
      ? Math.round((mapping.totalSuccess / mapping.totalResults) * 100)
      : 0

    const underperforming = mapping.enginePatterns
      .map((e) => ({
        engine: e.engine,
        rate: e.totalScans > 0 ? Math.round((e.totalSuccess / e.totalScans) * 100) : 0,
      }))
      // Threshold: must be both <50% AND at least 10 points below average.
      .filter((e) => e.rate < 50 && e.rate <= avgRate - 10)
      .sort((a, b) => a.rate - b.rate)
      .slice(0, 3)

    if (underperforming.length === 0) return []

    underperforming.forEach((e, idx) => {
      const name = engineDisplayName(e.engine)
      const text = isHebrew
        ? `ב-${name} העסק מופיע רק ב-${e.rate}% מהשאלות. כדאי להשקיע בחיזוק התוכן הרלוונטי למנוע הזה.`
        : `On ${name}, the business appears in only ${e.rate}% of questions. Worth investing in strengthening relevant content for this engine.`
      lines.push({ text, isFirst: idx === 0 })
    })
    return lines
  })()

  // ─────────────────────────────────────────────────────────────────────
  // Card 4: What's missing when the business doesn't appear.
  // Uses mapping.missingOpportunities. Dedupes by signal — each content
  // signal yields a unique sentence, so no repetition.
  // ─────────────────────────────────────────────────────────────────────
  const missingGapsCard = (() => {
    const lines: Array<{ text: string; isFirst?: boolean }> = []
    const seen = new Set<string>()

    const impactful = mapping.missingOpportunities
      .filter((m) => m.category === 'content' && m.failureRate >= 50)

    for (const miss of impactful) {
      const key = String(miss.signal)
      if (seen.has(key)) continue
      seen.add(key)
      lines.push({
        text: missingSignalRecommendation(miss.signal as ContentSignalKey, isHebrew ? 'he' : 'en'),
        isFirst: lines.length === 0,
      })
      if (lines.length >= 3) break
    }
    return lines
  })()

  // ─────────────────────────────────────────────────────────────────────
  // Build the visible card list. Only cards with real opportunities
  // are rendered; otherwise the section shows a single fallback.
  // ─────────────────────────────────────────────────────────────────────
  type CardSpec = {
    title: string
    tone: 'emerald' | 'blue' | 'indigo' | 'amber'
    icon: React.ReactNode
    sentences: Array<{ text: string; isFirst?: boolean }>
  }
  const cards: CardSpec[] = []
  if (contentStrengthCard.length > 0) {
    cards.push({
      title: isHebrew ? 'תוכן שכדאי לחזק' : 'Content to strengthen',
      tone: 'emerald',
      icon: <BarChart3 className="w-5 h-5" />,
      sentences: contentStrengthCard,
    })
  }
  if (weakPromptsCard.length > 0) {
    cards.push({
      title: isHebrew ? 'שאלות שבהן העסק חלש' : 'Questions where the business is weak',
      tone: 'blue',
      icon: <TrendingDown className="w-5 h-5" />,
      sentences: weakPromptsCard,
    })
  }
  if (weakEnginesCard.length > 0) {
    cards.push({
      title: isHebrew ? 'מנועים שכדאי לחזק' : 'Engines worth strengthening',
      tone: 'indigo',
      icon: <Cpu className="w-5 h-5" />,
      sentences: weakEnginesCard,
    })
  }
  if (missingGapsCard.length > 0) {
    cards.push({
      title: isHebrew ? 'מה חסר כשהעסק לא מופיע' : 'What is missing when the business does not appear',
      tone: 'amber',
      icon: <Award className="w-5 h-5" />,
      sentences: missingGapsCard,
    })
  }

  const fallbackText = isHebrew
    ? 'הנתונים הנוכחיים לא מצביעים על חולשה ברורה. כדי לקבל מיפוי מדויק יותר, מומלץ להריץ עוד שאלות ומנועים.'
    : 'The current data does not indicate any clear weakness. To get a more accurate mapping, it is recommended to run more questions and engines.'

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 space-y-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            {t('geo_opp_title')}
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {t('geo_opp_subtitle')}
          </p>
        </div>
        <span className="text-[11px] text-slate-500 dark:text-slate-400 whitespace-nowrap">
          {mapping.totalSuccess}/{mapping.totalResults}
        </span>
      </div>

      {mapping.totalResults < 20 && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 flex gap-3">
          <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-900 dark:text-amber-200">
            {t('geo_opp_small_sample_warning')}
          </p>
        </div>
      )}

      {cards.length === 0 ? (
        <p className="text-xs text-slate-500 dark:text-slate-400 italic">{fallbackText}</p>
      ) : (
        <div className={`grid grid-cols-1 ${cards.length > 1 ? 'md:grid-cols-2' : ''} gap-3`}>
          {cards.map((card, i) => (
            <OpportunityCard
              key={i}
              title={card.title}
              tone={card.tone}
              icon={card.icon}
              sentences={card.sentences}
              emptyText=""
            />
          ))}
        </div>
      )}
    </div>
  )
}

function OpportunityCard({
  title,
  tone,
  icon,
  sentences,
  emptyText,
}: {
  title: string
  tone: 'emerald' | 'blue' | 'indigo' | 'amber'
  icon: React.ReactNode
  sentences: Array<{ text: string; isFirst?: boolean; isPrelim?: boolean; isEmpty?: boolean }>
  emptyText: string
}) {
  const accent =
    tone === 'emerald'
      ? 'border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/40 dark:bg-emerald-900/10'
      : tone === 'blue'
      ? 'border-blue-200 dark:border-blue-800/60 bg-blue-50/40 dark:bg-blue-900/10'
      : tone === 'indigo'
      ? 'border-indigo-200 dark:border-indigo-800/60 bg-indigo-50/40 dark:bg-indigo-900/10'
      : 'border-amber-200 dark:border-amber-800/60 bg-amber-50/40 dark:bg-amber-900/10'

  const iconTone =
    tone === 'emerald'
      ? 'text-emerald-600 dark:text-emerald-400'
      : tone === 'blue'
      ? 'text-blue-600 dark:text-blue-400'
      : tone === 'indigo'
      ? 'text-indigo-600 dark:text-indigo-400'
      : 'text-amber-600 dark:text-amber-400'

  return (
    <div className={`rounded-xl border ${accent} p-4 space-y-2`}>
      <div className="flex items-center gap-2">
        <div className={`${iconTone}`} aria-hidden="true">{icon}</div>
        <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h4>
      </div>
      {sentences.length > 0 ? (
        <ul className="space-y-1.5 text-xs leading-relaxed">
          {sentences.map((item, i) => (
            <li key={i} className="flex gap-1.5">
              <span className="text-slate-400 dark:text-slate-500 flex-shrink-0">•</span>
              <span className={item.isFirst ? 'font-medium text-slate-800 dark:text-slate-200' : 'text-slate-700 dark:text-slate-300'}>
                {item.text}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-slate-500 dark:text-slate-400 italic">{emptyText}</p>
      )}
    </div>
  )
}

function capitalize(s: string): string {
  if (!s) return s
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/**
 * GEO Competitor Intelligence — Phase 2C
 *
 * AI search market intelligence section. Surfaces which sources AI engines
 * trust, what content patterns repeatedly win visibility, how different
 * engines differ, and what tends to replace the project when it loses
 * visibility.
 *
 * Framing: executive intelligence (not analytics dump). Insights first,
 * supporting domain pills are visual texture only. Max 1 percentage per
 * card. Authority scores never exposed in UI.
 */
function GeoCompetitorIntelligenceSection({
  intelligence,
  businessMentions,
  results,
  isHebrew,
  t,
}: {
  intelligence: GeoCompetitorIntelligence | null
  businessMentions: BusinessMentionIntelligence | null
  results: ResultRow[]
  isHebrew: boolean
  t: T
}) {
  if (!intelligence) return null

  const hasAnyData =
    intelligence.trustedDomains.length > 0 ||
    intelligence.enginePreferences.length > 0 ||
    intelligence.visibilityLossPatterns.dominantDomains.length > 0 ||
    (businessMentions?.mentionedBusinesses.length ?? 0) > 0

  if (!hasAnyData) return null

  // Never expose 'unknown' to users. Returns null to signal "skip this".
  const categoryLabel = (cat: CompetitorCategory): string | null => {
    switch (cat) {
      case 'review': return t('geo_comp_cat_review')
      case 'marketplace': return t('geo_comp_cat_marketplace')
      case 'forum': return t('geo_comp_cat_forum')
      case 'brand': return t('geo_comp_cat_brand')
      case 'editorial': return t('geo_comp_cat_editorial')
      case 'directory': return t('geo_comp_cat_directory')
      default: return null // 'unknown' or any other → hide entirely
    }
  }

  const engineDisplayName = (engine: string): string => {
    const meta = ENGINE_META[engine as keyof typeof ENGINE_META]
    return meta?.name || engine
  }

  // ─────────────────────────────────────────────────────────────────────
  // Card 1: Recurring websites — focus on specific domains by name.
  // Answers "Who keeps showing up?". No category language (that's Card 3).
  // ─────────────────────────────────────────────────────────────────────
  const trustedSourcesCard = (() => {
    const lines: Array<{ text: string; isFirst?: boolean }> = []
    const domains = intelligence.trustedDomains
    const topDomain = domains[0]
    const secondDomain = domains[1]

    if (topDomain) {
      // Lead: name the most dominant domain directly
      if (topDomain.uniqueEngineCount >= 3) {
        lines.push({
          text: isHebrew
            ? `${topDomain.domain} חזר על עצמו ב-${topDomain.uniqueEngineCount} מנועי AI שונים.`
            : `${topDomain.domain} recurred across ${topDomain.uniqueEngineCount} different AI engines.`,
          isFirst: true,
        })
      } else {
        lines.push({
          text: isHebrew
            ? `${topDomain.domain} בלט בנוכחות חוזרת בתשובות מנועי AI.`
            : `${topDomain.domain} stood out with consistent presence across AI answers.`,
          isFirst: true,
        })
      }
    }

    if (secondDomain) {
      lines.push({
        text: isHebrew
          ? `${secondDomain.domain} הופיע גם הוא במספר תוצאות שונות.`
          : `${secondDomain.domain} also appeared in multiple results.`,
        isFirst: false,
      })
    }

    // Closing context line — only if we have 3+ recurring sites
    if (domains.length >= 3) {
      lines.push({
        text: isHebrew
          ? `סך הכל ${domains.length} אתרים חזרו על עצמם בסריקות.`
          : `In total, ${domains.length} websites recurred across scans.`,
        isFirst: false,
      })
    }

    const pills = domains.slice(0, 3).map((d) => d.domain)
    return { lines, pills }
  })()

  // ─────────────────────────────────────────────────────────────────────
  // Card 2: Content patterns — REAL signals about what content appears.
  // Uses only contentSignals (hasList, hasReviewLanguage, etc) from actual
  // geoInsights. Does NOT use citationTypes / URL taxonomy.
  // Answers: "What KIND OF INFORMATION helped the business appear?"
  // Not: "What kind of URL got cited?"
  // DYNAMIC: Shows only insights for signals that are actually strong in this project.
  // ─────────────────────────────────────────────────────────────────────
  const contentStructureCard = (() => {
    const lines: Array<{ text: string; isFirst?: boolean }> = []

    // Aggregate content signals from all results with geoInsights
    interface ContentSignalCount {
      hasReviewLanguage: number
      hasPricingLanguage: number
      hasComparisonLanguage: number
      hasRecommendationLanguage: number
      hasList: number
      hasLocalLanguage: number
    }

    const signals: ContentSignalCount = {
      hasReviewLanguage: 0,
      hasPricingLanguage: 0,
      hasComparisonLanguage: 0,
      hasRecommendationLanguage: 0,
      hasList: 0,
      hasLocalLanguage: 0,
    }

    let totalResultsWithSignals = 0
    for (const result of results) {
      if (!result.geoInsights?.contentSignals) continue
      totalResultsWithSignals++
      const cs = result.geoInsights.contentSignals
      if (cs.hasReviewLanguage) signals.hasReviewLanguage++
      if (cs.hasPricingLanguage) signals.hasPricingLanguage++
      if (cs.hasComparisonLanguage) signals.hasComparisonLanguage++
      if (cs.hasRecommendationLanguage) signals.hasRecommendationLanguage++
      if (cs.hasList) signals.hasList++
      if (cs.hasLocalLanguage) signals.hasLocalLanguage++
    }

    // Not enough data — fallback
    if (totalResultsWithSignals === 0) {
      lines.push({
        text: isHebrew
          ? 'עדיין אין מספיק נתונים כדי לזהות איזה סוג תוכן עוזר לחשיפה בפרויקט הזה.'
          : 'There is not enough data yet to identify which content types improve visibility for this project.',
        isFirst: true,
      })
      return { lines, pills: [] }
    }

    // Rank signals by frequency
    const rankedSignals = Object.entries(signals)
      .map(([key, count]) => ({
        key,
        count,
        percentage: (count / totalResultsWithSignals) * 100,
      }))
      .filter((s) => s.count > 0) // Only include signals that appeared at least once
      .sort((a, b) => b.count - a.count)

    // If no signals appeared at all, fallback
    if (rankedSignals.length === 0) {
      lines.push({
        text: isHebrew
          ? 'עדיין אין מספיק נתונים כדי לזהות איזה סוג תוכן עוזר לחשיפה בפרויקט הזה.'
          : 'There is not enough data yet to identify which content types improve visibility for this project.',
        isFirst: true,
      })
      return { lines, pills: [] }
    }

    // Define signal groups — signals that share similar meaning get one message.
    // A group is shown only if at least one signal in it is STRONG.
    interface SignalGroup {
      signalKeys: string[]
      heMessage: string
      enMessage: string
    }

    const signalGroups: SignalGroup[] = [
      {
        signalKeys: ['hasList', 'hasComparisonLanguage'],
        heMessage: 'תוכן שמסודר ברשימות, השוואות או שאלות נפוצות הופיע יותר מתוכן כללי.',
        enMessage:
          'List-formatted, comparison, or FAQ content appeared more than generic content.',
      },
      {
        signalKeys: ['hasPricingLanguage'],
        heMessage:
          'בשאלות בנושאי קנייה או בחירת ספק, הופיעו יותר תשובות עם מחיר, יתרונות ופרטי רכישה.',
        enMessage:
          'In purchase or vendor-selection queries, answers with pricing, benefits, and purchase details appeared more often.',
      },
      {
        signalKeys: ['hasReviewLanguage', 'hasRecommendationLanguage'],
        heMessage: 'ביקורות, דירוגים והמלצות חזרו בתשובות שבהן העסק קיבל חשיפה.',
        enMessage:
          'Reviews, ratings, and recommendations recurred in answers where the business appeared.',
      },
      {
        signalKeys: ['hasLocalLanguage'],
        heMessage:
          'בשאלות מקומיות, הופיעו יותר תשובות שכללו אזורי שירות, מיקום או זמינות.',
        enMessage:
          'In local queries, answers that included service areas, location, or availability appeared more often.',
      },
    ]

    // Determine which groups to show: a group is "strong" if at least one signal
    // in it is strong. A signal is strong if: count >= 3, OR in top 3, OR percentage >= 25%.
    const groupsToShow: SignalGroup[] = []

    for (const group of signalGroups) {
      const hasStrongSignal = group.signalKeys.some((signalKey) => {
        const rankedPos = rankedSignals.findIndex((s) => s.key === signalKey)
        if (rankedPos === -1) return false // Signal didn't appear

        const signal = rankedSignals[rankedPos]
        // Strong if: count >= 3, OR in top 3, OR percentage >= 25%
        const isStrong =
          signal.count >= 3 || rankedPos < 3 || signal.percentage >= 25

        return isStrong
      })

      if (hasStrongSignal) {
        groupsToShow.push(group)
      }
    }

    // Display insights for strong groups (max 3)
    const maxInsights = 3
    for (let i = 0; i < groupsToShow.length && i < maxInsights; i++) {
      const group = groupsToShow[i]
      lines.push({
        text: isHebrew ? group.heMessage : group.enMessage,
        isFirst: i === 0,
      })
    }

    // If no groups are strong enough to show, fallback
    if (lines.length === 0) {
      lines.push({
        text: isHebrew
          ? 'עדיין אין מספיק נתונים כדי לזהות איזה סוג תוכן עוזר לחשיפה בפרויקט הזה.'
          : 'There is not enough data yet to identify which content types improve visibility for this project.',
        isFirst: true,
      })
    }

    return { lines, pills: [] }
  })()

  // ─────────────────────────────────────────────────────────────────────
  // Card 3: Per-engine source preferences — pure category language, no
  // domain names (avoids overlap with Card 1). Skip engines where no
  // clear category emerges (no generic fallback).
  // ─────────────────────────────────────────────────────────────────────
  const enginePatternsCard = (() => {
    const lines: Array<{ text: string; isFirst?: boolean }> = []

    const templates = isHebrew
      ? {
          one: (name: string, c1: string) => `${name} הציג בעיקר ${c1}.`,
          two: (name: string, c1: string, c2: string) => `${name} הציג בעיקר ${c1} ו${c2}.`,
        }
      : {
          one: (name: string, c1: string) => `${capitalize(name)} mostly surfaced ${c1}.`,
          two: (name: string, c1: string, c2: string) => `${capitalize(name)} mostly surfaced ${c1} and ${c2}.`,
        }

    let firstLineSet = false
    for (const ep of intelligence.enginePreferences.slice(0, 4)) {
      const name = engineDisplayName(ep.engine)
      if (ep.topCompetitors.length === 0) continue

      // Aggregate categories across this engine's top competitors. Use
      // trustedDomains as the lookup source. Skip 'unknown' categories
      // (categoryLabel returns null) so we never surface debug values.
      const catCount = new Map<CompetitorCategory, number>()
      for (const tc of ep.topCompetitors) {
        const td = intelligence.trustedDomains.find((d) => d.domain === tc.domain)
        if (!td) continue
        if (categoryLabel(td.category) === null) continue // hide 'unknown'
        catCount.set(td.category, (catCount.get(td.category) || 0) + 1)
      }

      const sortedCats = Array.from(catCount.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([c]) => c)

      // No identifiable category → skip this engine line entirely.
      // Avoid generic "recurring sources" fallback.
      if (sortedCats.length === 0) continue

      const cat1 = categoryLabel(sortedCats[0])
      const cat2 = sortedCats.length >= 2 ? categoryLabel(sortedCats[1]) : null
      if (!cat1) continue // double-safety

      const text = cat2
        ? templates.two(name, cat1, cat2)
        : templates.one(name, cat1)

      lines.push({ text, isFirst: !firstLineSet })
      firstLineSet = true
    }

    return { lines, pills: [] }
  })()

  // ─────────────────────────────────────────────────────────────────────
  // Card 4: Business mentions only — competitors detected in response text.
  // NO citation domains here. If no business mentions, show a clear fallback
  // (never fall back to domain pills, which would mix sources with
  // competitors).
  // ─────────────────────────────────────────────────────────────────────
  const visibilityLossCard = (() => {
    const lines: Array<{ text: string; isFirst?: boolean }> = []
    const mentioned = businessMentions?.mentionedBusinesses ?? []

    if (mentioned.length === 0) {
      return { lines, pills: [] }
    }

    // Lead: name the most-mentioned competitor by name.
    const top = mentioned[0]
    if (top.engines.length >= 2) {
      lines.push({
        text: isHebrew
          ? `${top.name} הוזכר ב-${top.mentionCount} תשובות, על פני ${top.engines.length} מנועי AI.`
          : `${top.name} was mentioned in ${top.mentionCount} answers across ${top.engines.length} AI engines.`,
        isFirst: true,
      })
    } else {
      lines.push({
        text: isHebrew
          ? `${top.name} הוזכר ב-${top.mentionCount} תשובות בתוכן של מנועי AI.`
          : `${top.name} was mentioned in ${top.mentionCount} AI answers.`,
        isFirst: true,
      })
    }

    // Secondary: second competitor by name.
    if (mentioned[1]) {
      const second = mentioned[1]
      lines.push({
        text: isHebrew
          ? `${second.name} גם הוא הוזכר במספר תשובות שונות.`
          : `${second.name} was also mentioned in multiple answers.`,
        isFirst: false,
      })
    }

    // Tertiary: total competitors detected
    if (mentioned.length >= 3) {
      lines.push({
        text: isHebrew
          ? `סך הכל ${mentioned.length} מתחרים מהרשימה הוזכרו בתשובות.`
          : `In total, ${mentioned.length} listed competitors were mentioned in answers.`,
        isFirst: false,
      })
    }

    const pills = mentioned.slice(0, 3).map((b) => b.name)
    return { lines, pills }
  })()

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 space-y-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            {t('geo_comp_title')}
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {t('geo_comp_subtitle')}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <IntelligenceCard
          title={t('geo_comp_card_sources')}
          tone="violet"
          icon={<Award className="w-5 h-5" />}
          lines={trustedSourcesCard.lines}
          pills={trustedSourcesCard.pills}
          pillsLabel={t('geo_comp_pills_label')}
          emptyText={t('geo_comp_no_data_sources')}
        />
        <IntelligenceCard
          title={t('geo_comp_card_content')}
          tone="teal"
          icon={<Layers className="w-5 h-5" />}
          lines={contentStructureCard.lines}
          pills={contentStructureCard.pills}
          emptyText={t('geo_comp_no_data_content')}
        />
        <IntelligenceCard
          title={t('geo_comp_card_engines')}
          tone="slate"
          icon={<Cpu className="w-5 h-5" />}
          lines={enginePatternsCard.lines}
          pills={enginePatternsCard.pills}
          emptyText={t('geo_comp_no_data_engines')}
        />
        <IntelligenceCard
          title={t('geo_comp_card_loss')}
          tone="rose"
          icon={<TrendingDown className="w-5 h-5" />}
          lines={visibilityLossCard.lines}
          pills={visibilityLossCard.pills}
          pillsLabel={t('geo_comp_pills_label_competitors')}
          emptyText={t('geo_comp_no_data_loss')}
        />
      </div>
    </div>
  )
}

/**
 * IntelligenceCard — premium card for Competitor Intelligence section.
 * Same visual language as OpportunityCard, plus subtle domain pills as
 * concrete grounding (max 3, never ranked, secondary to the insight).
 */
function IntelligenceCard({
  title,
  tone,
  icon,
  lines,
  pills,
  pillsLabel,
  emptyText,
}: {
  title: string
  tone: 'violet' | 'teal' | 'slate' | 'rose'
  icon: React.ReactNode
  lines: Array<{ text: string; isFirst?: boolean }>
  pills: string[]
  pillsLabel?: string
  emptyText: string
}) {
  const accent =
    tone === 'violet'
      ? 'border-violet-200 dark:border-violet-800/60 bg-violet-50/40 dark:bg-violet-900/10'
      : tone === 'teal'
      ? 'border-teal-200 dark:border-teal-800/60 bg-teal-50/40 dark:bg-teal-900/10'
      : tone === 'rose'
      ? 'border-rose-200 dark:border-rose-800/60 bg-rose-50/40 dark:bg-rose-900/10'
      : 'border-slate-200 dark:border-slate-700 bg-slate-50/40 dark:bg-slate-800/10'

  const iconTone =
    tone === 'violet'
      ? 'text-violet-600 dark:text-violet-400'
      : tone === 'teal'
      ? 'text-teal-600 dark:text-teal-400'
      : tone === 'rose'
      ? 'text-rose-600 dark:text-rose-400'
      : 'text-slate-600 dark:text-slate-400'

  return (
    <div className={`rounded-xl border ${accent} p-4 space-y-3`}>
      <div className="flex items-center gap-2">
        <div className={iconTone} aria-hidden="true">{icon}</div>
        <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h4>
      </div>
      {lines.length > 0 ? (
        <ul className="space-y-1.5 text-xs leading-relaxed">
          {lines.map((line, i) => (
            <li key={i} className="flex gap-1.5">
              <span className="text-slate-400 dark:text-slate-500 flex-shrink-0">•</span>
              <span
                className={
                  line.isFirst
                    ? 'font-medium text-slate-800 dark:text-slate-200'
                    : 'text-slate-700 dark:text-slate-300'
                }
              >
                {line.text}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-slate-500 dark:text-slate-400 italic">{emptyText}</p>
      )}
      {pills.length > 0 && (
        <div className="pt-1 space-y-1.5">
          {pillsLabel && (
            <div className="text-[10px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
              {pillsLabel}
            </div>
          )}
          <div className="flex flex-wrap gap-1.5">
            {pills.map((domain) => (
              <span
                key={domain}
                className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
              >
                {domain}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * GEO Explanation — Phase 1B human-readable explanation.
 *
 * Converts raw GEO Insights into 2–4 clear bullets explaining why
 * this result appeared (or didn't) in the AI engine response.
 */
function GeoExplanationSection({
  geoInsights,
  displayMentioned,
  displayCited,
  displayBrandLabels,
  displayDomainLabel,
  isHebrew,
  t,
}: {
  geoInsights: GeoInsights | null
  displayMentioned: boolean
  displayCited: boolean
  displayBrandLabels: string[]
  displayDomainLabel: string | null
  isHebrew: boolean
  t: T
}) {
  const explanation = generateGeoExplanation({
    geoInsights,
    displayMentioned,
    displayCited,
    displayBrandLabels,
    displayDomainLabel,
    isHebrew,
  })

  if (!explanation.hasSignals || explanation.bullets.length === 0) {
    return null
  }

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-blue-50 dark:bg-blue-900/20 p-4 space-y-2">
      <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
        {t('geo_explanation_title')}
      </h3>
      <ul className="space-y-2 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
        {explanation.bullets.map((bullet, i) => (
          <li key={i} className="flex gap-2">
            <span className="text-slate-400 dark:text-slate-500 flex-shrink-0">•</span>
            <span>{bullet}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * GEO Recommendations — Phase 1C "What can be improved?" section.
 *
 * Rule-based, actionable, business-facing suggestions grounded in gaps
 * detected in geoInsights. Shows fallback message when no gaps are
 * detected (positive reinforcement if the business appeared + cited, or
 * generic "no clear gaps" otherwise).
 */
function GeoRecommendationsSection({
  geoInsights,
  displayMentioned,
  displayCited,
  isHebrew,
  t,
}: {
  geoInsights: GeoInsights | null
  displayMentioned: boolean
  displayCited: boolean
  isHebrew: boolean
  t: T
}) {
  const recs = generateGeoRecommendations({
    geoInsights,
    displayMentioned,
    displayCited,
    isHebrew,
  })

  // Fallback message when no recommendations are generated
  let fallbackText: string | null = null
  if (recs.length === 0) {
    if (displayMentioned && displayCited) {
      // Positive reinforcement: business is appearing well
      fallbackText = isHebrew
        ? 'שמרו על תוכן ברור עם מחירים, ביקורות והמלצות כדי לחזק את הופעתכם בתוצאות דומות.'
        : 'Keep your content clear with pricing, reviews, and recommendations to strengthen your visibility in similar queries.'
    } else {
      // Generic: no clear improvements detected
      fallbackText = isHebrew
        ? 'לא זוהו פעולות שיפור ברורות בתוצאה הזו.'
        : 'No clear improvements were detected in this result.'
    }
  }

  // If no recommendations and no fallback, don't render
  if (recs.length === 0 && !fallbackText) return null

  return (
    <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-4 space-y-2">
      <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
        {t('geo_recommendations_title')}
      </h3>
      {recs.length > 0 ? (
        <ul className="space-y-2 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
          {recs.map((r) => (
            <li key={r.key} className="flex gap-2">
              <span className="text-amber-600 dark:text-amber-400 flex-shrink-0">→</span>
              <span>{r.text}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
          {fallbackText}
        </p>
      )}
    </div>
  )
}

/**
 * GEO Insights — Phase 1C collapsible technical details panel.
 *
 * Renders the raw signals as compact chips inside a collapsible <details>
 * element. The summary line shows the section name; users opt in to see
 * the technical breakdown rather than having it pushed to the foreground.
 *
 * Renders nothing when no signals are present.
 */
function GeoInsightsCollapsible({
  insights,
  t,
}: {
  insights: GeoInsights | null
  t: T
}) {
  const data = insights ?? EMPTY_GEO_INSIGHTS

  const activeSignals: Array<{ key: string; label: string }> = []
  if (data.contentSignals.hasList) activeSignals.push({ key: 'list', label: t('geo_signal_list') })
  if (data.contentSignals.hasComparisonLanguage)
    activeSignals.push({ key: 'comparison', label: t('geo_signal_comparison') })
  if (data.contentSignals.hasPricingLanguage)
    activeSignals.push({ key: 'pricing', label: t('geo_signal_pricing') })
  if (data.contentSignals.hasReviewLanguage)
    activeSignals.push({ key: 'review', label: t('geo_signal_review') })
  if (data.contentSignals.hasLocalLanguage)
    activeSignals.push({ key: 'local', label: t('geo_signal_local') })
  if (data.contentSignals.hasRecommendationLanguage)
    activeSignals.push({ key: 'recommendation', label: t('geo_signal_recommendation') })

  const hasAny =
    data.queryIntents.length > 0 ||
    data.citationTypes.length > 0 ||
    activeSignals.length > 0
  if (!hasAny) return null

  const intentLabel = (i: QueryIntent): string => {
    switch (i) {
      case 'transactional': return t('geo_intent_transactional')
      case 'informational': return t('geo_intent_informational')
      case 'comparison': return t('geo_intent_comparison')
      case 'review': return t('geo_intent_review')
      case 'local': return t('geo_intent_local')
      case 'navigational': return t('geo_intent_navigational')
    }
  }

  const citationLabel = (c: CitationType): string => {
    switch (c) {
      case 'homepage': return t('geo_citation_homepage')
      case 'category': return t('geo_citation_category')
      case 'product': return t('geo_citation_product')
      case 'comparison': return t('geo_citation_comparison')
      case 'review': return t('geo_citation_review')
      case 'blog': return t('geo_citation_blog')
      case 'marketplace': return t('geo_citation_marketplace')
      case 'forum': return t('geo_citation_forum')
      case 'directory': return t('geo_citation_directory')
      case 'brand_site': return t('geo_citation_brand_site')
      case 'unknown': return t('geo_citation_unknown')
    }
  }

  return (
    <details className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 group">
      <summary className="cursor-pointer list-none p-3 flex items-center justify-between gap-2 select-none hover:bg-slate-100 dark:hover:bg-slate-700/50 rounded-lg">
        <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
          {t('geo_insights_title')} <span className="text-slate-400 dark:text-slate-500">· {t('geo_technical_details')}</span>
        </span>
        <span className="text-slate-400 dark:text-slate-500 text-xs group-open:rotate-180 transition-transform">▾</span>
      </summary>
      <div className="p-4 pt-0 space-y-3 border-t border-slate-200 dark:border-slate-700 mt-0">
        {data.queryIntents.length > 0 && (
          <div className="pt-3">
            <GeoChipRow
              label={t('geo_query_intent')}
              chips={data.queryIntents.map((i) => intentLabel(i))}
              tone="indigo"
            />
          </div>
        )}

        {data.citationTypes.filter((c) => c !== 'unknown').length > 0 && (
          <GeoChipRow
            label={t('geo_citation_types')}
            chips={data.citationTypes.filter((c) => c !== 'unknown').map((c) => citationLabel(c))}
            tone="slate"
          />
        )}

        {activeSignals.length > 0 && (
          <GeoChipRow
            label={t('geo_content_signals')}
            chips={activeSignals.map((s) => s.label)}
            tone="emerald"
          />
        )}
      </div>
    </details>
  )
}

function GeoChipRow({
  label,
  chips,
  tone,
}: {
  label: string
  chips: string[]
  tone: 'indigo' | 'slate' | 'emerald'
}) {
  const toneClasses =
    tone === 'indigo'
      ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800'
      : tone === 'emerald'
      ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
      : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-600'

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
        {label}:
      </span>
      {chips.map((c, i) => (
        <span
          key={`${c}-${i}`}
          className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium border ${toneClasses}`}
        >
          {c}
        </span>
      ))}
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
