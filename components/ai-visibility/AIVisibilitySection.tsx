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
import { BarChart3, Link, Bot, AlertTriangle, Award, Layers, Cpu, TrendingDown, Sparkles } from 'lucide-react'
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
import { analyzeSmartQuestionContext } from '@/lib/ai-visibility/intent-engine'
import { isInvalidPriceQuestion } from '@/lib/ai-visibility/smart-question-keyword-enrichment'
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
import { dedupClientSide, applyDiversityFilter, deriveSuggestionMeta } from '@/lib/ai-visibility/suggestion-dedup'

const MAX_SUGGESTIONS = 40

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
  excludedFromScore: boolean
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

type TabType = 'results' | 'queries' | 'insights' | 'competitors'

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
  const [showArchive, setShowArchive] = useState(false)
  const [exclusionToast, setExclusionToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const [filterEngine, setFilterEngine] = useState<string | null>(null)
  const [filterMentioned, setFilterMentioned] = useState<boolean | null>(null)
  const [filterCited, setFilterCited] = useState<boolean | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  const [suggestedQuestions, setSuggestedQuestions] = useState<PromptSuggestion[]>([])
  const [refreshingSuggestions, setRefreshingSuggestions] = useState(false)
  // Tracks normalized prompt text of every suggestion shown across all batches
  // in this session. Used as exclusion input to the generator on "Generate more"
  // so the same questions never reappear.
  const [excludedSuggestionKeys, setExcludedSuggestionKeys] = useState<Set<string>>(new Set())
  // Set to true when "Generate more" produced zero new suggestions. Cleared
  // when the profile changes or another generate-more attempt is made.
  const [noNewSuggestionsFound, setNoNewSuggestionsFound] = useState(false)
  const [scanningKey, setScanningKey] = useState<string | null>(null)
  const [scanProgress, setScanProgress] = useState<number>(0)
  const [manualProfile, setManualProfile] = useState<ManualAIProfile | null>(null)
  const [showAllPrompts, setShowAllPrompts] = useState(false)
  const [showAllSmartQuestions, setShowAllSmartQuestions] = useState(() => {
    if (typeof window === 'undefined') return false
    try {
      // Only read from v2 key (user-click versioned). Ignore old auto-expand pollution.
      return localStorage.getItem(`ai-visibility-expanded-v2-${projectId}`) === 'true'
    } catch {
      return false
    }
  })
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

  const isRichProject = useMemo(
    () => analyzeSmartQuestionContext(projectKeywords || []).isRichProject,
    [projectKeywords]
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
            excludedFromScore: result.excludedFromScore || false,
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

      // Score calculation must exclude archived results, regardless of display filter
      const scoreResults = resultsWithText.filter((r) => r.excludedFromScore !== true)

      const engines = new Set<string>()
      const engineMap = new Map<string, EngineMetrics>()
      let totalMentions = 0
      let totalCitations = 0

      SUPPORTED_ENGINES.forEach((engine) => {
        engineMap.set(engine, { engine, scans: 0, mentions: 0, citations: 0, rate: 0 })
      })

      scoreResults.forEach((r) => {
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

      const successfulScans = scoreResults.filter((r) => r.status === 'success').length

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
    let cancelled = false

    const suggestions = generatePromptSuggestions({
      businessName: projectBrandName,
      domain: projectDomain,
      city: projectCity || null,
      country: projectCountry,
      language: projectLanguage,
      keywords: projectKeywords,
      manualProfile,
      shuffle: false,
      limit: 8,
    })
    const lang: 'he' | 'en' = projectLanguage === 'en' ? 'en' : 'he'
    // Filter vNext questions safely — ensure prompt field is valid string
    const vNextFiltered = suggestions.filter((q) => {
      const promptText = q?.prompt ?? ''
      return typeof promptText === 'string' && promptText.trim().length > 0 && !isInvalidPriceQuestion(promptText, lang)
    })

    // Show vNext immediately — cached suggestions arrive in the background
    setSuggestedQuestions(vNextFiltered)
    setExcludedSuggestionKeys(new Set())
    setNoNewSuggestionsFound(false)

    // Background: load cached Gemini suggestions without calling Gemini API
    ;(async () => {
      try {
        const response = await fetch('/api/ai-visibility/enriched-suggestions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectId,
            language: lang,
            country: projectCountry || undefined,
            businessCategory: null,
            cacheOnly: true,
          }),
        })

        if (cancelled) return
        if (!response.ok) return

        const data = await response.json()
        if (cancelled) return

        const cachedRaw: Array<{ id?: string; question: string; intent?: string }> = data.cachedSuggestions || []

        console.log('[AI_SUGGESTIONS_CLIENT_RECEIVED]', {
          apiReturnedTotal: data.total || 0,
          apiReturnedDedupedCount: data.dedupedQuestions?.length || 0,
          vNextCount: vNextFiltered.length,
          cachedCount: cachedRaw.length,
          newGeminiCount: (data.newSuggestions || []).length,
          geminiWasCalled: data.geminiWasCalled || false,
          source: data.source,
        })

        console.log('[AIVisibility-initialLoad] Cache load attempt', {
          projectId,
          language: lang,
          country: projectCountry || '(none)',
          businessCategory: null,
          cacheOnlyMode: true,
          cachedLoadedRaw: cachedRaw.length,
          vNextCount: vNextFiltered.length,
          geminiWasCalled: data.geminiWasCalled || false,
          apiResponse: {
            total: data.total,
            source: data.source,
            vNextQuestionsCount: data.vNextQuestions?.length || 0,
          }
        })

        if (cachedRaw.length === 0) {
          console.log('[AIVisibility-initialLoad] No cached suggestions found after API call', {
            vNextCount: vNextFiltered.length,
            cachedLoadedRaw: 0,
            geminiWasCalled: false,
          })
          return
        }

        const normalizeText = (t?: string | null): string => {
          if (!t || typeof t !== 'string') return ''
          return t.trim().toLowerCase().replace(/\s+/g, ' ').replace(/[?.!,;؟،]+\s*$/u, '').trim()
        }

        // Safe helper to extract suggestion text from mixed data shapes
        // Server returns dedupedQuestions with either 'prompt' or 'question' field
        // Used globally to prevent "Cannot read properties of undefined" crashes
        function getSuggestionText(item: any): string {
          if (!item) return ''
          const raw = item.prompt ?? item.question ?? item.text ?? ''
          return typeof raw === 'string' ? raw.trim() : ''
        }

        // Track rejection reasons for each cached suggestion
        const cachedFilteringLog: Array<{
          question: string
          intent?: string
          displayed: boolean
          rejectedReason?: string
        }> = []

        // Use server's dedupedQuestions directly — do NOT re-dedup on client
        // The server already deduped across vNext + cached + Gemini = 35 unique
        const serverDedupedQuestions = data.dedupedQuestions || []

        // Convert to PromptSuggestion format with safe data-shape normalization
        const merged: PromptSuggestion[] = serverDedupedQuestions
          .map((q: any) => {
            // Get text safely from either prompt or question field
            const promptText = getSuggestionText(q)
            if (!promptText) return null // Skip items with no text

            // Check if this matches a vNext question
            const fromVNext = vNextFiltered.find((v) => {
              const vText = v?.prompt ?? ''
              const vNorm = typeof vText === 'string' ? normalizeText(vText) : ''
              const qNorm = normalizeText(promptText)
              return vNorm && qNorm && vNorm === qNorm
            })
            if (fromVNext) return fromVNext

            // Cached/Gemini item
            const meta = deriveSuggestionMeta(q.intent)
            return {
              id: `gemini-${q.id || Math.random().toString(36).slice(2, 8)}`,
              prompt: promptText, // Use safely extracted text
              intent: meta.intent,
              intentLabel: meta.intent,
              category: 'generic',
              language: projectLanguage ?? 'he',
              qualityScore: meta.qualityScore,
              confidenceTier: meta.confidenceTier,
              reason: '',
              chips: [],
              valueReason: '',
            }
          })
          .filter((item: any): item is PromptSuggestion => item !== null) // Remove null entries

        const cachedDisplayedCount = merged.filter((m) => m.id.startsWith('gemini-')).length

        console.log('[AIVisibility-initialLoad] Using server dedupedQuestions', {
          projectId,
          contextHash: data.contextHash || '(not returned)',
          serverDedupedCount: serverDedupedQuestions.length,
          vNextCount: vNextFiltered.length,
          cachedLoadedRaw: cachedRaw.length,
          cachedDisplayedInMerged: cachedDisplayedCount,
          finalMergedCount: merged.length,
          geminiWasCalled: false,
        })

        // Read localStorage v2 key only — never respect old auto-expand key
        let savedExpandedState = false
        try {
          savedExpandedState = localStorage.getItem(`ai-visibility-expanded-v2-${projectId}`) === 'true'
        } catch (e) {
          // localStorage may not be available
        }

        if (!cancelled) {
          setSuggestedQuestions(merged)
          setShowAllSmartQuestions(savedExpandedState)

          console.log('[AI_SUGGESTIONS_STATE_SET]', {
            suggestedQuestionsCount: merged.length,
            showAllSmartQuestions: savedExpandedState,
            geminiQuestionsInState: cachedDisplayedCount,
            vNextQuestionsInState: vNextFiltered.length,
            savedExpandedState,
          })
        }
      } catch (e) {
        console.debug('[AIVisibility-initialLoad] Cache load failed, showing vNext only:', e)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [projectBrandName, projectDomain, projectCity, projectCountry, projectLanguage, projectKeywords, manualProfile, projectId])

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

  // Map of prompt:engine -> scannedAt date for latest successful scan
  const scannedDateMap = useMemo(() => {
    const map = new Map<string, string>()
    const resultsByKey = new Map<string, ResultRow>()
    // Keep only the latest result for each prompt:engine
    allResults.forEach((r) => {
      if (r.promptId && r.status === 'success') {
        const key = `${r.promptId}:${r.engine}`
        const existing = resultsByKey.get(key)
        if (!existing || (r.scannedAt || '') > (existing.scannedAt || '')) {
          resultsByKey.set(key, r)
        }
      }
    })
    // Extract dates
    resultsByKey.forEach((r, key) => {
      if (r.scannedAt) {
        map.set(key, r.scannedAt)
      }
    })
    return map
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

  const refreshSuggestions = useCallback(async () => {
    setRefreshingSuggestions(true)
    setNoNewSuggestionsFound(false)
    try {
      await new Promise((resolve) => setTimeout(resolve, 200))

      const normalize = (text?: string | null): string => {
        if (!text || typeof text !== 'string') return ''
        return text.trim().toLowerCase().replace(/\s+/g, ' ').replace(/[?.!,;؟،]+\s*$/u, '').trim()
      }

      // Normalize source field from any shape the server might return
      function normalizeSuggestionSource(item: any): 'cache' | 'gemini' | 'vnext' | 'unknown' {
        const raw = String(
          item?._apiSource ??
          item?.source ??
          item?.origin ??
          item?.metadata?.source ??
          ''
        ).toLowerCase()
        if (raw.includes('cache') || raw.includes('cached')) return 'cache'
        if (raw.includes('gemini')) return 'gemini'
        if (raw.includes('vnext') || raw.includes('smart')) return 'vnext'
        // Fallback: detect cache by structural fields even if source label is missing
        if (item?.cacheId || item?.status === 'suggested' || item?.question_hash || item?.questionHash) {
          return 'cache'
        }
        return 'unknown'
      }

      // Metrics tracking for logging
      const visibleBefore = suggestedQuestions.length
      const trackedPrompts = allPrompts.map((p) => p.prompt || '').filter(Boolean)
      let geminiWasCalled = false
      let geminiNotCalledReason = ''
      let contextHash = ''
      let newGeminiCount = 0
      let cachedLoadedCount = 0
      let duplicatesRemovedCount = 0
      let diversityFilteredCount = 0
      let emptyStateReason = ''

      // Pool is already at the hard cap — no need to call API
      if (visibleBefore >= MAX_SUGGESTIONS) {
        emptyStateReason = 'pool_full'
        setNoNewSuggestionsFound(true)
        return
      }

      // Build the exclusion ledger: every prompt the user has ever seen in this session OR already tracks
      const currentlyShown = suggestedQuestions.map((q) => q.prompt)
      const exclude = [
        ...currentlyShown,
        ...trackedPrompts,
        ...Array.from(excludedSuggestionKeys),
      ]

      const refreshed = generatePromptSuggestions({
        businessName: projectBrandName,
        domain: projectDomain,
        city: projectCity || null,
        country: projectCountry,
        language: projectLanguage,
        keywords: projectKeywords,
        manualProfile,
        shuffle: true,
        diversify: true,
        limit: 40,
        excludePrompts: exclude,
        previousSet: currentlyShown,
      })

      // Defense in depth: even with excludePrompts the generator can return overlap if the pool is exhausted
      // Safe normalize function for this context
      const safeNormalize = (text?: string | null): string => {
        if (!text || typeof text !== 'string') return ''
        return text.trim().toLowerCase().replace(/\s+/g, ' ').replace(/[?.!,;؟،]+\s*$/u, '').trim()
      }
      const seenKeys = new Set<string>(exclude.map(safeNormalize))
      let vNextFiltered: (PromptSuggestion & { _apiSource?: string })[] = refreshed
        .filter((q) => {
          const qText = q?.prompt ?? ''
          const normalized = typeof qText === 'string' ? safeNormalize(qText) : ''
          return normalized && !seenKeys.has(normalized)
        })
        .map((q): PromptSuggestion & { _apiSource?: string } => ({
          ...q,
          _apiSource: 'vnext' as const,
        }))

      // DEBUG: Check vNextFiltered initial state
      console.log('[AIVisibility-refreshSuggestions] VNEXT_FILTERED_INITIAL', {
        count: vNextFiltered.length,
        sample: vNextFiltered[0] ? {
          prompt: (vNextFiltered[0] as any).prompt?.substring(0, 60),
          hasApiSource: '_apiSource' in vNextFiltered[0],
          apiSourceValue: (vNextFiltered[0] as any)._apiSource,
        } : null,
      })

      // ── Gemini-powered enrichment via persistent cache layer ──────────────
      try {
        const enrichResponse = await fetch('/api/ai-visibility/enriched-suggestions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectId,
            language: projectLanguage === 'he' ? 'he' : 'en',
            country: projectCountry || undefined,
            businessCategory: null,
          }),
        })

        if (enrichResponse.ok) {
          const enrichData = await enrichResponse.json()

          // Use ONLY API's DEDUPED suggestions as authoritative pool
          const apiDedupedQuestions = enrichData.dedupedQuestions || []
          geminiWasCalled = enrichData.geminiWasCalled || false
          geminiNotCalledReason = enrichData.geminiNotCalledReason || ''
          contextHash = enrichData.contextHash || ''

          // Count items by source from dedupedQuestions using normalized source
          const cachedItemsInDedup = apiDedupedQuestions.filter((q: any) => normalizeSuggestionSource(q) === 'cache').length
          const geminiItemsInDedup = apiDedupedQuestions.filter((q: any) => normalizeSuggestionSource(q) === 'gemini').length
          const vNextItemsInDedup = apiDedupedQuestions.filter((q: any) => normalizeSuggestionSource(q) === 'vnext').length
          const unknownItemsInDedup = apiDedupedQuestions.filter((q: any) => normalizeSuggestionSource(q) === 'unknown').length
          cachedLoadedCount = cachedItemsInDedup // Track count of cached items that survived server dedup
          newGeminiCount = geminiItemsInDedup // Track count of gemini items that survived server dedup

          // Log metrics from API
          console.log('[AIVisibility-refreshSuggestions] API dedup metrics', {
            apiDedupedCount: apiDedupedQuestions.length,
            cachedInDedup: cachedItemsInDedup,
            geminiInDedup: geminiItemsInDedup,
            vNextInDedup: vNextItemsInDedup,
            unknownInDedup: unknownItemsInDedup,
            geminiWasCalled,
            duplicatesRemovedByApi: enrichData.duplicatesRemoved || 0,
          })

          // Safe helper for API suggestion text extraction
          function getSuggestionTextForAPI(item: any): string {
            if (!item) return ''
            const raw = item.question ?? item.prompt ?? item.text ?? ''
            return typeof raw === 'string' ? raw.trim() : ''
          }

          // Map deduplicated API suggestions to PromptSuggestion format
          // Preserve source field so we can track which items came from cache/gemini/vnext
          const apiProcessed = apiDedupedQuestions
            .map((q: any) => {
              // Safely extract text from mixed data shapes
              const promptText = getSuggestionTextForAPI(q)
              if (!promptText) return null // Skip items with no text
              return {
                ...q,
                promptText,
                source: q.source || 'unknown', // Preserve source from server
                wasDeduped: true,
              }
            })
            .filter((q: any): q is any => q !== null)

          const apiFiltered = apiProcessed
            .filter((q: any) => !seenKeys.has(normalize(q.promptText)))
            .map((q: any): PromptSuggestion & { _apiSource?: string } => {
              const meta = deriveSuggestionMeta(q.intent)
              const normalizedSource = normalizeSuggestionSource(q)
              return {
                id: `gemini-${q.id || Math.random().toString(36).slice(2, 8)}`,
                prompt: q.promptText, // Use safely extracted text
                intent: meta.intent,
                intentLabel: meta.intent,
                category: 'generic',
                language: projectLanguage ?? 'he',
                qualityScore: meta.qualityScore,
                confidenceTier: meta.confidenceTier,
                reason: '',
                chips: [],
                valueReason: '',
                _apiSource: normalizedSource, // Normalized source: cache | gemini | vnext | unknown
              }
            })

          // Log unknown-source items if any exist in API pool
          if (unknownItemsInDedup > 0) {
            const unknownSamples = apiDedupedQuestions.filter((q: any) => normalizeSuggestionSource(q) === 'unknown').slice(0, 5)
            console.warn('[AIVisibility-refreshSuggestions] UNKNOWN_SOURCE_ITEMS in dedupedQuestions', {
              count: unknownItemsInDedup,
              samples: unknownSamples.map((q: any) => ({
                question: getSuggestionTextForAPI(q)?.substring(0, 80),
                rawSource: q.source,
                metadataSource: q.metadata?.source,
                status: q.status,
                hasQuestionHash: !!(q.question_hash || q.questionHash),
                keys: Object.keys(q).join(','),
              })),
            })
          }

          vNextFiltered = [...vNextFiltered, ...apiFiltered]

          // DEBUG: Check vNextFiltered after API merge
          console.log('[AIVisibility-refreshSuggestions] VNEXT_FILTERED_AFTER_API_MERGE', {
            count: vNextFiltered.length,
            vnextItemCount: vNextFiltered.filter((q: any) => (q as any)._apiSource === 'vnext').length,
            cacheItemCount: vNextFiltered.filter((q: any) => (q as any)._apiSource === 'cache').length,
            geminiItemCount: vNextFiltered.filter((q: any) => (q as any)._apiSource === 'gemini').length,
            unknownItemCount: vNextFiltered.filter((q: any) => !(q as any)._apiSource).length,
          })

          // Log dedup breakdown using dedupedQuestions as source of truth
          console.log('[AIVisibility-refreshSuggestions] Server dedup breakdown', {
            apiDedupedCount: apiDedupedQuestions.length,
            cachedSurvivingDedup: cachedItemsInDedup,
            geminiSurvivingDedup: geminiItemsInDedup,
            vNextSurvivingDedup: vNextItemsInDedup,
            unknownInDedup: unknownItemsInDedup,
            apiFilteredByClient: apiFiltered.length,
            duplicatesRemoved: enrichData.duplicatesRemoved || 0,
          })
        }
      } catch (enrichErr) {
        console.debug('[AIVisibility] Enrichment endpoint unavailable, continuing with vNext only:', enrichErr)
        emptyStateReason = 'enrichment_unavailable'
      }
      // ──────────────────────────────────────────────────────────────────────

      // Apply display-level safety filter: block invalid price questions
      const lang: 'he' | 'en' = projectLanguage === 'en' ? 'en' : 'he'
      const filtered = vNextFiltered.filter((q) => !isInvalidPriceQuestion(q.prompt, lang))

      // DEBUG: Check filtered items have _apiSource
      console.log('[AIVisibility-refreshSuggestions] FILTERED_SOURCE_DEBUG', {
        filteredCount: filtered.length,
        samples: filtered.slice(0, 2).map((q: any) => ({
          prompt: q.prompt?.substring(0, 60),
          hasApiSource: '_apiSource' in q,
          apiSourceValue: (q as any)._apiSource,
          keys: Object.keys(q).slice(0, 5),
        })),
      })

      if (filtered.length === 0) {
        // No new candidates from this batch
        emptyStateReason = 'no_new_candidates'
        setNoNewSuggestionsFound(true)
      } else {
        // Light client-side dedup: only remove exact normalized matches against currently visible.
        // The API already ran strong dedup, so we trust its work and don't re-dedup semantically here.
        const normalizeLightDedup = (text?: string | null): string => {
          if (!text || typeof text !== 'string') return ''
          return text.trim().toLowerCase().replace(/\s+/g, ' ').replace(/[?.!,;؟،]+\s*$/u, '').trim()
        }
        // PromptSuggestion items in state always have prompt field
        const prevNormSet = new Set(suggestedQuestions.map((q) => {
          const qText = q?.prompt ?? ''
          return typeof qText === 'string' ? normalizeLightDedup(qText) : ''
        }).filter(t => t.length > 0))
        // filtered items also have prompt field (they're PromptSuggestion)
        const newItems = filtered.filter((q) => {
          const qText = q?.prompt ?? ''
          const normalized = typeof qText === 'string' ? normalizeLightDedup(qText) : ''
          return normalized && !prevNormSet.has(normalized)
        })

        // DEBUG: Log the actual source field on newItems before counting
        console.log('[AIVisibility-refreshSuggestions] NEW_ITEMS_SOURCE_DEBUG', {
          newItemsCount: newItems.length,
          samples: newItems.slice(0, 3).map((q: any) => ({
            prompt: q.prompt?.substring(0, 60),
            source: (q as any).source,
            _apiSource: (q as any)._apiSource,
            origin: (q as any).origin,
            metadataSource: (q as any).metadata?.source,
            keys: Object.keys(q).join(','),
            normalizedSource: normalizeSuggestionSource(q),
          })),
        })

        duplicatesRemovedCount = filtered.length - newItems.length
        diversityFilteredCount = 0

        // Combine existing + new (no additional diversity filter—trust API's dedup)
        const totalAvailable = [...suggestedQuestions, ...newItems]
        const capped = totalAvailable.slice(0, MAX_SUGGESTIONS)

        console.log('[AIVisibility-refreshSuggestions] Final merge (light dedup)', {
          visibleBefore,
          newItemsAdded: newItems.length,
          duplicateExactMatches: duplicatesRemovedCount,
          diversityFiltered: 0, // Not applied here (trust API dedup)
          afterCap: capped.length,
          poolMax: MAX_SUGGESTIONS,
        })

        // capped already contains the right PromptSuggestion objects with intent/labels from API
        const finalDeduped: PromptSuggestion[] = capped

        const visibleAfter = finalDeduped.length
        const growth = visibleAfter - visibleBefore

        // Update exclusion ledger
        setExcludedSuggestionKeys((prev) => {
          const next = new Set(prev)
          currentlyShown.forEach((p) => next.add(normalize(p)))
          return next
        })

        setSuggestedQuestions(finalDeduped)

        // Safe text extraction for metrics logging
        const normalize = (text?: string | null): string => {
          if (!text || typeof text !== 'string') return ''
          return text.trim().toLowerCase().replace(/\s+/g, ' ').replace(/[?.!,;؟،]+\s*$/u, '').trim()
        }

        // Count newItems by normalized _apiSource (cache | gemini | vnext | unknown)
        const newItemsFromCache = newItems.filter((q: any) => (q as any)._apiSource === 'cache').length
        const newItemsFromGemini = newItems.filter((q: any) => (q as any)._apiSource === 'gemini').length
        const newItemsFromVNext = newItems.filter((q: any) => (q as any)._apiSource === 'vnext').length
        const newItemsFromUnknown = newItems.filter((q: any) => {
          const src = (q as any)._apiSource
          return !src || src === 'unknown'
        }).length

        // Determine explicit reason why we stopped adding suggestions
        let stoppedReason: string
        if (visibleAfter >= MAX_SUGGESTIONS) {
          stoppedReason = 'reached_max_40'
        } else if (growth > 0 && newItemsFromCache > 0) {
          stoppedReason = 'added_from_cache'
        } else if (growth > 0 && geminiWasCalled && newItemsFromGemini > 0) {
          stoppedReason = 'added_from_gemini'
        } else if (growth > 0) {
          stoppedReason = 'added_from_vnext_or_mixed'
        } else if (growth === 0 && !geminiWasCalled && cachedLoadedCount === 0) {
          stoppedReason = 'cache_and_vnext_exhausted'
        } else if (growth === 0 && cachedLoadedCount > 0) {
          stoppedReason = 'all_cache_already_visible'
        } else if (growth === 0 && geminiWasCalled && newGeminiCount === 0) {
          stoppedReason = 'gemini_returned_nothing'
        } else if (growth === 0 && geminiWasCalled && duplicatesRemovedCount === newGeminiCount) {
          stoppedReason = 'all_gemini_were_duplicates'
        } else {
          // Fallback with diagnostic info
          stoppedReason = `no_growth_unclear_${growth}_cached:${newItemsFromCache}_gemini:${newItemsFromGemini}`
        }

        // Validate source accounting
        const sourceTotal = newItemsFromCache + newItemsFromGemini + newItemsFromVNext + newItemsFromUnknown
        if (sourceTotal !== newItems.length) {
          console.error('[AIVisibility-refreshSuggestions] METRIC_MISMATCH: source accounting failed', {
            cachedInNewItems: newItemsFromCache,
            geminiInNewItems: newItemsFromGemini,
            vNextInNewItems: newItemsFromVNext,
            unknownInNewItems: newItemsFromUnknown,
            total: sourceTotal,
            expected: newItems.length,
          })
        }

        // Log unknown-source items in newItems for diagnosis
        if (newItemsFromUnknown > 0) {
          const unknownNewItems = newItems.filter((q: any) => {
            const src = (q as any)._apiSource
            return !src || src === 'unknown'
          }).slice(0, 5)
          console.warn('[AIVisibility-refreshSuggestions] UNKNOWN_SOURCE_ITEMS in newItems', {
            count: newItemsFromUnknown,
            samples: unknownNewItems.map((q: any) => ({
              question: q.prompt?.substring(0, 80),
              rawSource: (q as any)._apiSource,
              keys: Object.keys(q).join(','),
            })),
          })
        }

        console.log('[AIVisibility-refreshSuggestions] Full cycle metrics', {
          maxExpandedPool: MAX_SUGGESTIONS,
          visibleBefore,
          neededToReachMax: MAX_SUGGESTIONS - visibleBefore,
          cachedSurvivingServerDedup: cachedLoadedCount,
          cachedInNewItems: newItemsFromCache,
          geminiInNewItems: newItemsFromGemini,
          vNextInNewItems: newItemsFromVNext,
          unknownInNewItems: newItemsFromUnknown,
          geminiWasCalled,
          geminiRequestedCandidateCount: geminiWasCalled ? refreshed.length : 0,
          rejectedByDedupCount: duplicatesRemovedCount,
          rejectedByDiversityCount: diversityFilteredCount,
          acceptedNewCount: newItems.length,
          finalPoolAfter: visibleAfter,
          growth,
          stoppedReason,
        })

        if (visibleAfter >= MAX_SUGGESTIONS) {
          emptyStateReason = 'pool_full_after_merge'
          setNoNewSuggestionsFound(true)
        } else if (growth === 0) {
          if (!geminiWasCalled) {
            emptyStateReason = 'pool_exhausted_no_gemini'
          } else if (newGeminiCount === 0) {
            emptyStateReason = 'gemini_returned_nothing'
          } else {
            emptyStateReason = 'all_new_were_duplicates'
          }
          setNoNewSuggestionsFound(true)
        }
      }
    } catch (e) {
      // On failure: keep existing suggestions visible
      setError(e instanceof Error ? e.message : 'Failed to generate suggestions')
    } finally {
      setRefreshingSuggestions(false)
    }
  }, [
    projectBrandName,
    projectDomain,
    projectCity,
    projectCountry,
    projectLanguage,
    projectKeywords,
    manualProfile,
    suggestedQuestions,
    allPrompts,
    excludedSuggestionKeys,
  ])

  const dedupedAllResults = useMemo(() => {
    // Deduplicate: for each (promptId, engine) pair, keep only the latest result by scannedAt.
    // Safe comparison: ISO strings compare correctly lexicographically; null → empty string (sorts first).
    const deduped = new Map<string, ResultRow>()
    for (const r of allResults) {
      const key = `${r.promptId}:${r.engine}`
      const existing = deduped.get(key)
      if (!existing) {
        deduped.set(key, r)
      } else {
        // Compare dates: if new has a more recent timestamp, use it. ISO strings are lexicographically comparable.
        const newTime = r.scannedAt ?? ''
        const existingTime = existing.scannedAt ?? ''
        if (newTime > existingTime) {
          deduped.set(key, r)
        }
      }
    }
    return Array.from(deduped.values())
  }, [allResults])

  const filteredResults = useMemo(() => {
    // Apply all existing filters to the deduplicated results
    return dedupedAllResults.filter((r) => {
      if (!(SUPPORTED_ENGINES as readonly string[]).includes(r.engine)) return false
      // Filter: exclude archived results by default (unless showArchive is enabled)
      if (!showArchive && r.excludedFromScore) return false
      if (filterEngine && r.engine !== filterEngine) return false
      if (filterMentioned !== null && r.displayMentioned !== filterMentioned) return false
      if (filterCited !== null && r.displayCited !== filterCited) return false
      if (searchQuery && !r.promptText.toLowerCase().includes(searchQuery.toLowerCase())) return false
      return true
    })
  }, [dedupedAllResults, filterEngine, filterMentioned, filterCited, searchQuery, showArchive])

  const archivedResults = useMemo(() => {
    return dedupedAllResults.filter((r) => r.excludedFromScore && (SUPPORTED_ENGINES as readonly string[]).includes(r.engine))
  }, [dedupedAllResults])

  const scoreResults = useMemo(() => {
    return dedupedAllResults.filter((r) => !r.excludedFromScore && (SUPPORTED_ENGINES as readonly string[]).includes(r.engine))
  }, [dedupedAllResults])

  const handleArchiveResult = useCallback(
    async (resultId: string, newExcludedState: boolean) => {
      try {
        const res = await fetch(`/api/ai-visibility/results/${resultId}/exclusion`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ excluded: newExcludedState }),
        })

        if (!res.ok) {
          const errorBody = await res.json().catch(() => ({}))
          setExclusionToast({
            message: isHebrew ? 'שגיאה בעדכון סטטוס הארכיון' : 'Failed to update archive status',
            type: 'error',
          })
          setTimeout(() => setExclusionToast(null), 3000)
          return
        }

        // Update local state immediately for UI responsiveness
        setAllResults((prev) =>
          prev.map((r) => (r.id === resultId ? { ...r, excludedFromScore: newExcludedState } : r))
        )

        // Show success message
        const message = newExcludedState
          ? (isHebrew ? 'הסריקה הועברה לארכיון ולא תשפיע על ציון הנראות.' : 'Result archived and excluded from score.')
          : (isHebrew ? 'הסריקה שוחזרה וחזרה לחישוב ציון הנראות.' : 'Result restored and included in score.')

        setExclusionToast({ message, type: 'success' })
        setTimeout(() => setExclusionToast(null), 3000)

        // Optionally show archive view after archiving (but don't force it)
        if (newExcludedState && !showArchive) {
          // Just show toast, let user choose to view archive if they want
        }
      } catch (err) {
        console.error('Error updating archive status:', err)
        setExclusionToast({
          message: isHebrew ? 'שגיאה בעדכון סטטוס הארכיון' : 'Failed to update archive status',
          type: 'error',
        })
        setTimeout(() => setExclusionToast(null), 3000)
      }
    },
    [isHebrew]
  )

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

      {exclusionToast && (
        <div className={`p-3 rounded-xl border text-sm flex items-start gap-2 ${
          exclusionToast.type === 'success'
            ? 'bg-green-50 border-green-200 text-green-700'
            : 'bg-red-50 border-red-200 text-red-700'
        }`}>
          <span className="shrink-0">{exclusionToast.type === 'success' ? '✓' : '✕'}</span>
          <span>{exclusionToast.message}</span>
        </div>
      )}

      {/* TAB BAR */}
      <div className="flex gap-2 border-b border-slate-200 dark:border-slate-700 overflow-x-auto">
        {(['results', 'queries', 'insights', 'competitors'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setCurrentTab(tab)}
            className={`px-4 py-3 text-base font-semibold border-b-2 transition whitespace-nowrap ${
              currentTab === tab
                ? 'border-indigo-600 text-indigo-700 dark:text-indigo-300'
                : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
            }`}
          >
            {tab === 'results' && t('tab_results')}
            {tab === 'queries' && t('tab_queries')}
            {tab === 'insights' && t('tab_insights')}
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
            <OverviewSummaryStrip metrics={globalMetrics} totalResults={scoreResults.length} t={t} />
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
            {archivedResults.length > 0 && (
              <button
                onClick={() => setShowArchive(!showArchive)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                  showArchive
                    ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100'
                    : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600'
                }`}
              >
                {isHebrew ? `הצג ארכיון (${archivedResults.length})` : `Show archive (${archivedResults.length})`}
              </button>
            )}
          </div>

          {archivedResults.length > 0 && (
            <div className="text-xs text-slate-500 dark:text-slate-400 italic">
              {isHebrew ? 'תוצאות בארכיון אינן נכללות בחישוב הציון.' : 'Archived results are not included in score calculations.'}
            </div>
          )}

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
                    onArchiveToggle={handleArchiveResult}
                    onRetry={() => r.promptId && scanEngine(r.promptId, r.engine)}
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

        </>
      )}

      {/* TAB: INSIGHTS & RECOMMENDATIONS — strategic sections only */}
      {currentTab === 'insights' && (
        <>
          {/* AI VISIBILITY SUMMARY — high-level snapshot + recommended action */}
          {globalMetrics && (
            <AIVisibilitySummarySection
              metrics={globalMetrics}
              engineMetrics={engineMetrics}
              mapping={geoOpportunityMapping}
              isHebrew={isHebrew}
              t={t}
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

          {/* COMPETITIVE GAPS — only renders when a competitor leads in mentions */}
          <RecommendationsCard
            competitorAnalysis={competitorAnalysis}
            t={t}
            isRTL={isHebrew}
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
                limit: 20,
              })
              setSuggestedQuestions(refreshed)
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
                        const scannedAt = scannedDateMap.get(key)
                        const formatDate = (dateStr: string) => {
                          try {
                            const date = new Date(dateStr)
                            const day = String(date.getDate()).padStart(2, '0')
                            const month = String(date.getMonth() + 1).padStart(2, '0')
                            const year = date.getFullYear()
                            return `${day}.${month}.${year}`
                          } catch {
                            return dateStr
                          }
                        }
                        const tooltip = scanning
                          ? t('scanning')
                          : scanned
                          ? t('rescan')
                          : t('scan_this_engine')
                        return (
                          <div
                            key={engine}
                            className="inline-flex flex-col items-center min-w-0"
                          >
                            <div className="relative group">
                              <button
                                onClick={() => !scanning && scanEngine(p.id, engine)}
                                disabled={scanning}
                                title={tooltip}
                                aria-label={tooltip}
                                className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium border transition relative overflow-hidden ${
                                  scanning
                                    ? 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 cursor-wait'
                                    : scanned
                                    ? 'bg-emerald-50 dark:bg-emerald-900/30 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 hover:border-emerald-300 dark:hover:border-emerald-700 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 cursor-pointer'
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
                              {/* Custom CSS tooltip — appears instantly on hover/focus, not delayed like native title */}
                              <span
                                role="tooltip"
                                className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 rounded bg-slate-900 dark:bg-slate-700 text-white text-[11px] font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-100 z-50 shadow-md"
                              >
                                {tooltip}
                              </span>
                            </div>
                            {scanned && scannedAt && (
                              <div className="text-[10px] leading-tight text-slate-500 dark:text-slate-400 mt-0.5 text-center whitespace-nowrap">
                                {t('scanned_at')}: {formatDate(scannedAt)}
                              </div>
                            )}
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

          {(() => {
            const normalizeText = (text?: string | null): string => {
              if (!text || typeof text !== 'string') return ''
              return text.trim().toLowerCase().replace(/\s+/g, ' ').replace(/[?.!,;؟،]+\s*$/u, '').trim()
            }
            // Build set of tracked prompts using safe text extraction
            const trackedSet = new Set(
              allPrompts
                .map((p) => {
                  const text = p.prompt ?? ''
                  return typeof text === 'string' ? normalizeText(text) : ''
                })
                .filter((t) => t.length > 0)
            )
            // Filter available suggestions, using safe text extraction
            // PromptSuggestion items always have prompt field
            const availableSuggestions = suggestedQuestions.filter((q) => {
              const qText = q.prompt ?? ''
              const normalized = typeof qText === 'string' ? normalizeText(qText) : ''
              return normalized && !trackedSet.has(normalized)
            })
            const COLLAPSED_VISIBLE_SUGGESTIONS = 8
            const isCollapsed = !showAllSmartQuestions
            const visibleSliced = availableSuggestions.slice(0, isCollapsed ? COLLAPSED_VISIBLE_SUGGESTIONS : undefined)

            // Determine source of expanded state for logging
            let expandedStateSource: 'v2_user_click' | 'missing' = 'missing'
            let localStorageKeyUsed = `ai-visibility-expanded-v2-${projectId}`
            let localStorageValue = null
            try {
              localStorageValue = localStorage.getItem(localStorageKeyUsed)
              if (localStorageValue === 'true') expandedStateSource = 'v2_user_click'
              // Old key should be ignored (but log if present for diagnostic)
              const oldKey = `ai-visibility-expanded-${projectId}`
              const oldValue = localStorage.getItem(oldKey)
              if (oldValue === 'true' && expandedStateSource === 'missing') {
                console.debug('[AI_SUGGESTIONS_RENDER] Old localStorage key detected but ignored:', oldKey)
              }
            } catch (e) {
              // localStorage unavailable
            }

            console.log('[AI_SUGGESTIONS_RENDER]', {
              allInState: suggestedQuestions.length,
              availableSuggestions: availableSuggestions.length,
              trackedPrompts: trackedSet.size,
              localStorageKeyUsed,
              localStorageValue,
              expandedStateSource,
              isCollapsed,
              showMoreButtonVisible: availableSuggestions.length > COLLAPSED_VISIBLE_SUGGESTIONS && isCollapsed,
              visibleSliced: visibleSliced.length,
              collapsedLimit: COLLAPSED_VISIBLE_SUGGESTIONS,
            })

            const showPanel = refreshingSuggestions || availableSuggestions.length > 0
            if (!showPanel) return null
            return (
              <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-gradient-to-br from-indigo-50/40 to-white dark:from-slate-900 dark:to-slate-800 p-5 mt-6">
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-300 mb-1 flex items-center gap-1.5">
                      {t('smart_questions_title')}
                      <span className="relative group inline-flex items-center">
                        <span
                          className="cursor-help text-indigo-400 dark:text-indigo-500 flex-shrink-0"
                          tabIndex={0}
                          aria-label="מה המשמעות של גבוה/טוב?"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <circle cx="12" cy="12" r="10"/>
                            <path d="M12 16v-4M12 8h.01"/>
                          </svg>
                        </span>
                        <span
                          role="tooltip"
                          className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1.5 rounded bg-slate-900 dark:bg-slate-700 text-white text-[10px] font-medium normal-case tracking-normal opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-100 z-50 shadow-md w-max max-w-[200px] text-center"
                        >
                          התגית מציינת עדיפות למעקב, לא ציון הסריקה.
                        </span>
                      </span>
                    </h3>
                    <p className="text-xs text-slate-600 dark:text-slate-400">
                      {t('smart_questions_subtitle')}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={refreshSuggestions}
                    loading={refreshingSuggestions}
                    disabled={refreshingSuggestions || noNewSuggestionsFound}
                    className="shrink-0"
                    title={t('generate_more_suggestions')}
                    aria-label={t('generate_more_suggestions')}
                  >
                    <span className="hidden sm:inline">{t('generate_more_suggestions')}</span>
                    <span className="sm:hidden">
                      {isHebrew ? 'עוד שאלות' : 'More questions'}
                    </span>
                  </Button>
                </div>
                {/* Inline loading indicator — shown above the grid, never replaces it */}
                {refreshingSuggestions && (
                  <div className="flex items-center gap-2 mb-3 text-xs text-slate-500 dark:text-slate-400">
                    <span className="w-3.5 h-3.5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                    <span>{t('generating_more')}</span>
                  </div>
                )}
                {/* Questions grid is always visible — even while loading */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {visibleSliced.map((q) => (
                    <SmartQuestionCard
                      key={q.id}
                      question={q}
                      isAlreadyTracked={false}
                      allPrompts={allPrompts}
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
                {availableSuggestions.length > COLLAPSED_VISIBLE_SUGGESTIONS && !showAllSmartQuestions && (
                  <div className="text-center mt-4">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setShowAllSmartQuestions(true)
                        try {
                          // Set v2 key only on user-explicit click
                          localStorage.setItem(`ai-visibility-expanded-v2-${projectId}`, 'true')
                        } catch (e) {
                          // localStorage may be unavailable
                        }
                      }}
                    >
                      {t('show_more')}
                    </Button>
                  </div>
                )}
                {noNewSuggestionsFound && (
                  <div className="mt-4 text-center text-xs text-slate-600 dark:text-slate-400 italic">
                    {t(isRichProject ? 'pool_exhausted_rich' : 'pool_exhausted_thin')}
                  </div>
                )}
              </div>
            )
          })()}
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
  type: 'competitor_leading'
  severity: 'high' | 'medium' | 'low'
  titleKey: string
  bodyKey: string
  body?: string
  priority: number
}

function RecommendationsCard({
  competitorAnalysis,
  t,
  isRTL,
}: {
  competitorAnalysis: CompetitorAnalysisData | null
  t: T
  isRTL: boolean
}) {
  const recommendations: Recommendation[] = []

  // Competitor leading — a competitor has more mentions than the project.
  // This is the ONLY recommendation type retained here. weak_engines and
  // weak_questions are already covered by GEO Opportunity Mapping with
  // richer context, so they were removed to eliminate duplication.
  if (competitorAnalysis && competitorAnalysis.project && competitorAnalysis.competitors.length > 0) {
    const projectMentions = competitorAnalysis.project.mentionsCount
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

  // Hide section entirely when there is no competitor_leading alert.
  // No fallback, no "all good" message — the section simply disappears.
  if (recommendations.length === 0) {
    return null
  }

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 mt-6">
      <h3 className="text-sm font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1">
        {t('recommendations_title')}
      </h3>
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">{t('recommendations_desc')}</p>
      <div className="space-y-2">
        {recommendations.map((rec) => (
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
  onArchiveToggle,
  onRetry,
  t,
}: {
  result: ResultRow
  highlighted: boolean
  brandVariants: string[]
  targetDomain: string | null
  isHebrew: boolean
  onRowClick: (r: ResultRow) => void
  onArchiveToggle: (resultId: string, newExcludedState: boolean) => void
  onRetry: () => void
  t: T
}) {
  const [isTogglingArchive, setIsTogglingArchive] = React.useState(false)
  const [isRetrying, setIsRetrying] = React.useState(false)

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

  const handleArchiveClick = async (e: React.MouseEvent) => {
    e.stopPropagation()
    setIsTogglingArchive(true)
    await onArchiveToggle(result.id, !result.excludedFromScore)
    setIsTogglingArchive(false)
  }

  const handleRetry = async (e: React.MouseEvent) => {
    e.stopPropagation()
    setIsRetrying(true)
    await onRetry()
    setIsRetrying(false)
  }

  // Show error state when scan failed/timed out
  if (result.status === 'error') {
    return (
      <div
        className={`rounded-lg border bg-red-50 dark:bg-red-950/30 p-4 hover:shadow-md transition ${
          highlighted ? 'border-red-300 ring-2 ring-red-200 dark:ring-red-700' : 'border-red-200 dark:border-red-800'
        }`}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium line-clamp-2 text-red-900 dark:text-red-100">
              {result.promptText}
            </p>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              {meta && <meta.Icon size={16} className={meta.accent} />}
              <span className="text-xs font-medium text-red-700 dark:text-red-300">
                {meta?.name || result.engine}
              </span>
              <Badge variant="danger" className="!text-xs">
                {isHebrew ? 'סריקה נכשלה' : 'Scan failed'}
              </Badge>
            </div>
            <p className="text-xs text-red-600 dark:text-red-400 mt-2">
              {isHebrew ? 'הסריקה נכשלה זמנית. אפשר לנסות שוב.' : 'Scan failed temporarily. You can retry.'}
            </p>
          </div>
          <button
            onClick={handleRetry}
            disabled={isRetrying}
            className={`px-3 py-1.5 rounded text-xs font-medium transition whitespace-nowrap ${
              isRetrying
                ? 'bg-red-200 dark:bg-red-800 text-red-700 dark:text-red-200 opacity-50 cursor-wait'
                : 'bg-red-200 dark:bg-red-800 text-red-700 dark:text-red-200 hover:bg-red-300 dark:hover:bg-red-700'
            }`}
          >
            {isHebrew ? 'נסה שוב' : 'Retry'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div
      onClick={() => onRowClick(result)}
      className={`rounded-lg border bg-white dark:bg-slate-900 p-4 hover:shadow-md hover:border-slate-300 dark:hover:border-slate-600 transition cursor-pointer ${
        highlighted ? 'border-indigo-300 ring-2 ring-indigo-200 dark:ring-indigo-700' : 'border-slate-200 dark:border-slate-700'
      } ${result.excludedFromScore ? 'opacity-60' : ''}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          {/* Row 1: query text */}
          <p className={`text-sm font-medium line-clamp-2 ${result.excludedFromScore ? 'text-slate-500 dark:text-slate-400' : 'text-slate-900 dark:text-slate-100'}`}>
            {result.promptText}
          </p>

          {/* Row 2: engine + status badges + scan time + archive label */}
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            {meta && <meta.Icon size={16} className={meta.accent} />}
            <span className={`text-xs font-medium ${result.excludedFromScore ? 'text-slate-500 dark:text-slate-400' : 'text-slate-600 dark:text-slate-300'}`}>
              {meta?.name || result.engine}
            </span>

            {result.excludedFromScore && (
              <Badge variant="neutral" className="!text-xs !bg-slate-100 dark:!bg-slate-800">
                {isHebrew ? 'לא נכלל בציון' : 'Not in score'}
              </Badge>
            )}

            {!result.excludedFromScore && (
              <>
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
              </>
            )}

            {scannedAtStr && (
              <span className={`text-[11px] ${result.excludedFromScore ? 'text-slate-400 dark:text-slate-500' : 'text-slate-500 dark:text-slate-400'}`}>
                · {t('scanned_at')} {scannedAtStr}
              </span>
            )}
          </div>

          {/* Row 3: matched variants — only when something was matched and not archived */}
          {!result.excludedFromScore && (brandLabels.length > 0 || domainLabel) && (
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
          {!result.excludedFromScore && result.citationCount > 0 && (
            <Badge variant="info" className="!text-xs">
              {result.citationCount} {t('citations')}
            </Badge>
          )}
          <button
            onClick={handleArchiveClick}
            disabled={isTogglingArchive}
            title={result.excludedFromScore ? (isHebrew ? 'שחזר לציון הנראות' : 'Restore to scoring') : (isHebrew ? 'העבר לארכיון' : 'Archive')}
            className={`px-2 py-1 rounded text-xs font-medium transition ${
              result.excludedFromScore
                ? 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
            } ${isTogglingArchive ? 'opacity-50 cursor-wait' : ''}`}
          >
            {result.excludedFromScore ? (isHebrew ? 'שחזר' : 'Restore') : (isHebrew ? 'ארכיון' : 'Archive')}
          </button>
          <ExternalLinkIcon size={16} className={`${result.excludedFromScore ? 'text-slate-300 dark:text-slate-600' : 'text-slate-400 dark:text-slate-500'}`} />
        </div>
      </div>
    </div>
  )
}

function SmartQuestionCard({
  question,
  onAdd,
  t,
  allPrompts,
  isAlreadyTracked,
}: {
  question: PromptSuggestion
  onAdd: () => void
  t: T
  allPrompts?: PromptRow[]
  isAlreadyTracked?: boolean
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

  // Confidence tier display (replaces numeric score)
  const confidenceTierLabel = (tier: string): string => {
    switch (tier) {
      case 'high': return t('confidence_high')
      case 'good': return t('confidence_good')
      case 'medium': return t('confidence_medium')
      case 'opportunity': return t('confidence_opportunity')
      case 'experimental': return t('confidence_experimental')
      default: return tier
    }
  }

  const confidenceTierColor = (tier: string): 'success' | 'info' | 'warning' | 'neutral' | 'danger' => {
    switch (tier) {
      case 'high': return 'success'
      case 'good': return 'info'
      case 'medium': return 'warning'
      case 'opportunity': return 'warning'
      case 'experimental': return 'neutral'
      default: return 'neutral'
    }
  }

  const chipLabel = (chip: string): string => {
    return t(chip as any) || chip
  }

  return (
    <div className="flex items-start gap-3 p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:shadow-sm transition">
      <div className="flex-1 min-w-0">
        <p className="text-sm text-slate-900 dark:text-slate-100 font-medium line-clamp-2 mb-1.5">{question.prompt}</p>
        <div className="flex items-center gap-1.5 mb-1">
          <Badge variant={intentTone[question.intent] || 'neutral'} className="!text-[9px]">
            {label}
          </Badge>
          {'confidenceTier' in question && (
            <Badge variant={confidenceTierColor(question.confidenceTier)} className="!text-[9px]">
              {confidenceTierLabel(question.confidenceTier)}
            </Badge>
          )}
        </div>
        {'valueReason' in question && question.valueReason && (
          <p className="text-[12px] font-medium text-indigo-700 dark:text-indigo-300 mb-1.5">
            {question.valueReason}
          </p>
        )}
        {'chips' in question && question.chips && question.chips.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-1.5">
            {question.chips.map((chip) => (
              <span
                key={chip}
                className="inline-flex items-center px-1.5 py-0.5 text-[9px] font-medium rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
              >
                {chipLabel(chip)}
              </span>
            ))}
          </div>
        )}
        {question.reason && (
          <p className="text-[10px] text-slate-400 dark:text-slate-500 line-clamp-1">
            {question.reason}
          </p>
        )}
      </div>
      {isAlreadyTracked ? (
        <div className="shrink-0 px-2 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-[9px] font-medium text-emerald-700 dark:text-emerald-300 whitespace-nowrap flex items-center">
          {t('already_tracked')}
        </div>
      ) : (
        <button
          onClick={onAdd}
          className="shrink-0 w-8 h-8 rounded-lg bg-indigo-100 text-indigo-700 hover:bg-indigo-200 transition flex items-center justify-center"
          aria-label={t('add_question_label')}
          title={t('add_question_label')}
        >
          +
        </button>
      )}
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
 * AI Visibility Summary — top of Insights tab.
 *
 * A compact 3-4 bullet snapshot:
 *   1. Overall visibility status (high / medium / low / insufficient)
 *   2. Strongest engines (success rate >= 60%)
 *   3. Weakest engines (success rate <= 25%) — only if clearly weak
 *   4. Single recommended action (deterministic, derived from
 *      GeoOpportunityMapping signals)
 *
 * Deterministic. No AI calls. No DB / API changes.
 */
function AIVisibilitySummarySection({
  metrics,
  engineMetrics,
  mapping,
  isHebrew,
  t,
}: {
  metrics: GlobalMetrics
  engineMetrics: Map<string, EngineMetrics>
  mapping: GeoOpportunityMapping | null
  isHebrew: boolean
  t: T
}) {
  const engineDisplayName = (engine: string): string =>
    ENGINE_META[engine as keyof typeof ENGINE_META]?.name || engine

  // Hebrew & English list joiners — "X, Y ו־Z" / "X, Y and Z".
  const joinNames = (names: string[]): string => {
    if (names.length === 0) return ''
    if (names.length === 1) return names[0]
    const and = isHebrew ? 'ו־' : 'and '
    if (names.length === 2) {
      return isHebrew ? `${names[0]} ${and}${names[1]}` : `${names[0]} ${and}${names[1]}`
    }
    const head = names.slice(0, -1).join(', ')
    const last = names[names.length - 1]
    return isHebrew ? `${head} ${and}${last}` : `${head} ${and}${last}`
  }

  // Map a content signal to its short action sentence.
  const actionForSignal = (signal: ContentSignalKey): string => {
    switch (signal) {
      case 'reviews': return t('ai_summary_action_reviews')
      case 'comparison': return t('ai_summary_action_comparison')
      case 'pricing': return t('ai_summary_action_pricing')
      case 'list': return t('ai_summary_action_list')
      case 'local': return t('ai_summary_action_local')
      case 'recommendation': return t('ai_summary_action_recommendation')
    }
  }

  // Pick a single recommended action. Prioritize missing signals
  // (failureRate >= 50%) over merely weak signals. Falls back to a
  // generic suggestion when no clear opportunity is detectable.
  const pickAction = (): string => {
    if (mapping) {
      const missing = mapping.missingOpportunities
        .filter((m) => m.category === 'content' && m.failureRate >= 50)
        .sort((a, b) => b.failureRate - a.failureRate)
      if (missing.length > 0) {
        return actionForSignal(missing[0].signal as ContentSignalKey)
      }
      const weak = [...mapping.contentSignals]
        .filter((s) => s.visibilityRate < 60)
        .sort((a, b) => a.visibilityRate - b.visibilityRate)
      if (weak.length > 0) {
        return actionForSignal(weak[0].signal)
      }
    }
    return t('ai_summary_action_fallback')
  }

  type Bullet = { text: string; isFirst?: boolean; isAction?: boolean }
  const bullets: Bullet[] = []

  // Insufficient data short-circuit — show only status + fallback action.
  if (metrics.totalScans < 3) {
    bullets.push({ text: t('ai_summary_status_insufficient'), isFirst: true })
    bullets.push({
      text: t('ai_summary_action_label') + t('ai_summary_action_fallback'),
      isAction: true,
    })
  } else {
    // 1. Overall status bullet
    const score = metrics.mentionRate || 0
    let statusText: string
    if (score >= 70) statusText = t('ai_summary_status_high')
    else if (score >= 40) statusText = t('ai_summary_status_medium')
    else statusText = t('ai_summary_status_low')
    bullets.push({ text: statusText, isFirst: true })

    // 2. Strong engines (rate >= 60% AND at least 2 scans on that engine)
    // Phrasing depends on overall visibility to avoid contradiction:
    // If overall score < 40%, use moderate phrasing; otherwise, "strong visibility" is appropriate.
    const strong = Array.from(engineMetrics.values())
      .filter((em) => em.scans >= 2 && em.rate >= 60)
      .sort((a, b) => b.rate - a.rate)
      .slice(0, 3)
      .map((em) => engineDisplayName(em.engine))
    if (strong.length > 0) {
      const score = metrics.mentionRate || 0
      let text: string
      if (isHebrew) {
        text = score < 40
          ? `העסק הופיע בעיקר ב־${joinNames(strong)}.`
          : `הנראות חזקה בעיקר ב־${joinNames(strong)}.`
      } else {
        text = score < 40
          ? `The business did appear mainly on ${joinNames(strong)}.`
          : `Visibility is strong mainly on ${joinNames(strong)}.`
      }
      bullets.push({ text })
    }

    // 3. Weak engines (rate <= 25% AND at least 2 scans on that engine)
    const weakEngines = Array.from(engineMetrics.values())
      .filter((em) => em.scans >= 2 && em.rate <= 25)
      .sort((a, b) => a.rate - b.rate)
      .slice(0, 2)
      .map((em) => engineDisplayName(em.engine))
    if (weakEngines.length > 0) {
      const text = isHebrew
        ? `החולשה המרכזית היא ב־${joinNames(weakEngines)}.`
        : `The main weakness is on ${joinNames(weakEngines)}.`
      bullets.push({ text })
    }

    // 4. Recommended action — marked as action for visual emphasis
    bullets.push({ text: t('ai_summary_action_label') + pickAction(), isAction: true })
  }

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 space-y-3 shadow-sm">
      <div className="flex items-center gap-2">
        <Sparkles className="w-5 h-5 text-indigo-600 dark:text-indigo-400" aria-hidden="true" />
        <div>
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            {t('ai_summary_title')}
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {t('ai_summary_subtitle')}
          </p>
        </div>
      </div>
      <div className="space-y-1.5 text-xs sm:text-sm leading-relaxed">
        {bullets.map((b, i) => (
          <div key={i}>
            {b.isAction && i > 0 && (
              <div className="my-2 border-t border-slate-200 dark:border-slate-700" />
            )}
            <div className={`flex gap-1.5 ${b.isAction ? 'pt-1.5' : ''}`}>
              <span className="text-slate-400 dark:text-slate-500 flex-shrink-0">•</span>
              <span
                className={
                  b.isFirst
                    ? 'font-medium text-slate-800 dark:text-slate-200'
                    : b.isAction
                    ? 'font-semibold text-indigo-700 dark:text-indigo-300'
                    : 'text-slate-700 dark:text-slate-300'
                }
              >
                {b.text}
              </span>
            </div>
          </div>
        ))}
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
          return 'בשאלות שבהן העסק לא הופיע, היה פחות מידע מסחרי. כדאי להציג טווחי מחיר, מה כלול בשירות ותנאי רכישה.'
        case 'reviews':
          return 'בשאלות שבהן העסק לא הופיע, חסרו הוכחות אמון. כדאי להבליט ביקורות, דירוגים ועדויות לקוחות.'
        case 'comparison':
          return 'בשאלות שבהן העסק לא הופיע, חסרו השוואות ברורות. כדאי להוסיף עמודים שיעזרו ללקוח לבחור בין אפשרויות.'
        case 'list':
          return 'בשאלות שבהן העסק לא הופיע, חסרו תשובות מסודרות. כדאי להוסיף שאלות נפוצות ותשובות קצרות לשאלות מרכזיות.'
        case 'recommendation':
          return 'בשאלות שבהן העסק לא הופיע, חסר תוכן המלצה. כדאי להוסיף תוכן שמכוון את הלקוח לבחירה הנכונה עבורו.'
        case 'local':
          return 'בשאלות שבהן העסק לא הופיע, חסר מידע מקומי. כדאי להבליט אזורי שירות, כתובת וזמינות.'
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
        ? 'צרו עמוד תוכן או FAQ שעונה לשאלה הזו.'
        : 'Consider creating a content page or FAQ section that directly answers this question.'
      const text = isHebrew
        ? `בשאלה "${promptDisplay}" העסק לא הופיע. מומלץ ליצור עמוד תוכן או FAQ שעונה לה ישירות.`
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
        ? `${name}: העסק מופיע רק ב-${e.rate}% מהשאלות. חזקו את התוכן שמתאים למנוע הזה.`
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
      title: isHebrew ? 'שאלות שבהן העסק לא הופיע' : 'Questions where the business is weak',
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
    ? 'כרגע לא זוהתה חולשה ברורה. כדי לקבל המלצות מדויקות יותר, מומלץ להריץ עוד שאלות ומנועים.'
    : 'No clear weakness detected at the moment. To get more accurate recommendations, it is recommended to run more questions and engines.'

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
            ? `${topDomain.domain} הופיע ב-${topDomain.uniqueEngineCount} מנועים שונים.`
            : `${topDomain.domain} recurred across ${topDomain.uniqueEngineCount} different AI engines.`,
          isFirst: true,
        })
      } else {
        lines.push({
          text: isHebrew
            ? `${topDomain.domain} הופיע בעקביות בתוצאות AI.`
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
        heMessage: 'רשימות, השוואות ו-FAQ הופיעו יותר בתוצאות מוצלחות.',
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
    () => new Set(existingPrompts.map((p) => (p.prompt || '').trim().toLowerCase())),
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
