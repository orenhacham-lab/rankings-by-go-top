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

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Archive, Check, ChevronDown, Info, Loader2, MessageSquareText, Minus, Plus, RefreshCw, Search, Sparkles, Trash2 } from 'lucide-react'
import NextLink from 'next/link'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import Input from '@/components/ui/Input'
import Badge from '@/components/ui/Badge'
import EmptyState from '@/components/ui/EmptyState'
import Notice from '@/components/ui/Notice'
import RowMenu from '@/components/ui/RowMenu'
import Select from '@/components/ui/Select'
import { Skeleton } from '@/components/ui/Skeleton'
import {
  ENGINE_META,
  SparkleIcon,
} from './EngineIcon'
import PromptSuggestions from './PromptSuggestions'
import AIBusinessProfilePanel from './AIBusinessProfilePanel'
import { resolveBusinessIdentity, type ScanBusiness } from '@/lib/ai-visibility/business-identity'
import CompetitorsPanel from './CompetitorsPanel'
import CompetitorAnalysisPanel from './CompetitorAnalysisPanel'
import { createI18n } from '@/lib/ai-visibility/i18n'
import { SCORED_ENGINES, engineScores, latestAnswers, visibilityScore } from '@/lib/ai-visibility/score'
import { dropOffTopicSuggestions, type ProjectVocabulary } from '@/lib/ai-visibility/question-relevance'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { UserFacingError, apiErrorText, isUserFacingError } from '@/lib/i18n/user-facing-error'
import { generatePromptSuggestions, buildFallbackSuggestions, normalizeLanguage, applyDisplayQualityGate, isInsufficientContextSuggestion, QUESTION_GENERATION_VERSION, type PromptSuggestion, type ManualAIProfile } from '@/lib/ai-visibility/prompt-templates'
import { analyzeSmartQuestionContext } from '@/lib/ai-visibility/intent-engine'
import { isInvalidPriceQuestion } from '@/lib/ai-visibility/smart-question-keyword-enrichment'
import { getBrandVariants } from '@/lib/ai-visibility/matching/mention-detector'
import { normalizeDomain } from '@/lib/ai-visibility/matching/domain-normalize'
import { buildDomainList } from '@/lib/ai-visibility/display-classification'
import type { GeoOpportunityMapping } from '@/lib/ai-visibility/geo-opportunity-mapping'
import type { GeoCompetitorIntelligence } from '@/lib/ai-visibility/geo-competitor-intelligence'
import type { BusinessMentionIntelligence } from '@/lib/ai-visibility/geo-business-mentions'
import { deriveSuggestionMeta } from '@/lib/ai-visibility/suggestion-dedup'
import type { CompetitorAnalysisData, EngineMetrics, GlobalMetrics, PromptInsight, PromptRow, ResultRow, TabType } from './sections/types'
import { AIVisibilityScoreCard, EngineMentionCards, OverviewSummaryStrip } from './sections/ScoreCards'
import { RecommendationsCard } from './sections/Recommendations'
import { PromptInsightRow } from './sections/PromptInsightRow'
import { ResultRowCard } from './sections/ResultRowCard'
import { SmartQuestionCard } from './sections/SmartQuestionCard'
import { ResultDetailDrawer } from './sections/ResultDetailDrawer'
import { AIVisibilitySummarySection } from './sections/InsightsSummary'
import { GeoOpportunityMappingSection } from './sections/GeoOpportunityMapping'
import { GeoCompetitorIntelligenceSection } from './sections/GeoCompetitorIntelligence'
import { NewAIQueryModal } from './sections/NewAIQueryModal'

const MAX_SUGGESTIONS = 40

/** The engines the tool checks: the shared score's list (lib/ai-visibility/score.ts). */
const SUPPORTED_ENGINES = SCORED_ENGINES

/** The error state's value for "something failed that is not the merchant's to read": shown as our own words. */
const GENERIC_ERROR = '__generic__'

/** The tool's own tabs, for a page that asks it to open one (W6d). */
export type AIVisibilityTab = TabType


export default function AIVisibilitySection({
  projectId,
  projectCountry,
  projectLanguage,
  projectDomain,
  projectBrandName,
  projectBrandAliases,
  projectDomainAliases,
  projectCity,
  projectKeywords,
  initialTab,
  overviewMode = false,
  onRunsLoaded,
  onQuestionsCount,
  competitorsSlot,
  openQueriesWhenEmpty = false,
  suggestionsRefreshKey = 0,
  requestedTab,
}: {
  projectId: string
  projectCountry: string | null
  projectLanguage: string | null
  projectDomain: string | null
  projectBrandName: string | null
  projectBrandAliases?: string[] | null
  projectDomainAliases?: string[] | null
  projectCity?: string | null
  projectKeywords?: string[]
  /** The tab to open on, e.g. from a link that manages competitors. */
  initialTab?: TabType
  // ── W6d: the AI-visibility tab's overview around the tool. Every one of these
  // is optional and off by default. The AI-visibility page passes them for every
  // project, scanned or not (part B of the UX review): a caller that passes none
  // gets the bare tool.
  /** The page shows its own title, score and summary: leave out the tool's copies of them. */
  overviewMode?: boolean
  /** The runs this tool loaded (GET /api/ai-visibility/runs), or null when they could not be read. */
  onRunsLoaded?: (runs: unknown[] | null) => void
  /** How many questions the project tracks, once loaded (the page's next-step copy). */
  onQuestionsCount?: (count: number) => void
  /** Shown in the competitors tab in place of the editor (competitors are managed in settings). */
  competitorsSlot?: React.ReactNode
  /** On the first load, open the questions tab when there is no check yet. */
  openQueriesWhenEmpty?: boolean
  /** Bumped when new suggested questions were saved (the scan's b5): reload them from the cache. */
  suggestionsRefreshKey?: number
  /** Switch to a tab; `seq` makes the same tab requestable twice. */
  requestedTab?: { tab: TabType; seq: number }
}) {
  const { language: dashboardLanguage } = useDashboardLanguage()
  const t = useMemo(() => createI18n(dashboardLanguage), [dashboardLanguage])
  const isHebrew = dashboardLanguage === 'he'

  const [currentTab, setCurrentTab] = useState<TabType>(initialTab ?? 'results')
  // W6d. Held in refs: loadAllResults must keep depending on the project alone,
  // or a caller's new callback identity would reload every result on each render.
  const onRunsLoadedRef = useRef(onRunsLoaded)
  onRunsLoadedRef.current = onRunsLoaded
  const openQueriesWhenEmptyRef = useRef(openQueriesWhenEmpty && !initialTab)
  useEffect(() => {
    if (requestedTab) setCurrentTab(requestedTab.tab)
  }, [requestedTab])
  const [allResults, setAllResults] = useState<ResultRow[]>([])
  const [allPrompts, setAllPrompts] = useState<PromptRow[]>([])
  const onQuestionsCountRef = useRef(onQuestionsCount)
  onQuestionsCountRef.current = onQuestionsCount
  const [globalMetrics, setGlobalMetrics] = useState<GlobalMetrics | null>(null)
  const [engineMetrics, setEngineMetrics] = useState<Map<string, EngineMetrics>>(new Map())
  const [geoOpportunityMapping, setGeoOpportunityMapping] = useState<GeoOpportunityMapping | null>(null)
  const [geoCompetitorIntelligence, setGeoCompetitorIntelligence] = useState<GeoCompetitorIntelligence | null>(null)
  const [businessMentionIntelligence, setBusinessMentionIntelligence] = useState<BusinessMentionIntelligence | null>(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    if (!loading) onQuestionsCountRef.current?.(allPrompts.length)
  }, [loading, allPrompts.length])
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
  // Always strip the insufficient-context marker before it can enter state, so
  // it never lingers as a "+" card after the user generates new questions.
  // The project's own words, for dropping suggestions about another trade
  // (lib/ai-visibility/question-relevance.ts): read through a ref so every
  // commit uses the latest ones.
  const vocabularyRef = useRef<ProjectVocabulary>({})
  const commitSuggestedQuestions = useCallback((list: PromptSuggestion[]) => {
    setSuggestedQuestions(dropOffTopicSuggestions(list.filter((s) => !isInsufficientContextSuggestion(s)), vocabularyRef.current))
  }, [])
  const [refreshingSuggestions, setRefreshingSuggestions] = useState(false)
  // Tracks normalized prompt text of every suggestion shown across all batches
  // in this session. Used as exclusion input to the generator on "Generate more"
  // so the same questions never reappear.
  const [excludedSuggestionKeys, setExcludedSuggestionKeys] = useState<Set<string>>(new Set())
  // Set to true when "Generate more" produced zero new suggestions. Cleared
  // when the profile changes or another generate-more attempt is made.
  const [noNewSuggestionsFound, setNoNewSuggestionsFound] = useState(false)
  // Set to true when the AI/Gemini path failed or returned nothing and we fell
  // back to basic local questions. Shows a friendly notice. Cleared on success.
  const [usedFallbackQuestions, setUsedFallbackQuestions] = useState(false)
  // Track previous server pool count to detect shrinkage across requests
  const [previousServerPoolCount, setPreviousServerPoolCount] = useState(0)
  const [scanningKey, setScanningKey] = useState<string | null>(null)
  /**
   * The AI-check allowance, from the ledger that enforces it. `null` means "not
   * read yet"; the `unknown` state means the server could not read it and the UI
   * must say so rather than imply zero.
   */
  const [allowance, setAllowance] = useState<
    | { state: 'known'; limit: number; used: number; remaining: number }
    | { state: 'unknown' } | { state: 'unmetered' } | null
  >(null)
  const loadAllowance = useCallback(async () => {
    try {
      const res = await fetch('/api/ai-visibility/allowance')
      if (!res.ok) { setAllowance({ state: 'unknown' }); return }
      const body = await res.json()
      setAllowance(body?.state === 'known' || body?.state === 'unmetered' || body?.state === 'unknown'
        ? body : { state: 'unknown' })
    } catch {
      setAllowance({ state: 'unknown' })
    }
  }, [])
  useEffect(() => { void loadAllowance() }, [loadAllowance])
  const [scanProgress, setScanProgress] = useState<number>(0)
  const [manualProfile, setManualProfile] = useState<ManualAIProfile | null>(null)
  // What the site scan says the business is, read with the saved profile.
  const [scanBusiness, setScanBusiness] = useState<ScanBusiness | null>(null)
  // The suggestions wait for that read, so they are built once, from the right
  // business, and never flash questions for a type the business is not.
  const [identityReady, setIdentityReady] = useState(false)
  // THE BUSINESS TYPE comes from the owner's choice, then the site scan, then
  // the name/domain, then a clear keyword majority (business-identity.ts). It
  // used to come from every tracked keyword joined together, where one keyword
  // ("אוכל רחוב יפן") turned a Japan travel site into a restaurant.
  const identity = useMemo(
    () => resolveBusinessIdentity({
      manualProfile, scan: scanBusiness, businessName: projectBrandName, domain: projectDomain, keywords: projectKeywords,
    }),
    [manualProfile, scanBusiness, projectBrandName, projectDomain, projectKeywords],
  )
  const identityCategory = identity.category
  vocabularyRef.current = {
    keywords: projectKeywords ?? [],
    offerings: manualProfile?.mode === 'manual' ? [manualProfile.primaryCategory, ...manualProfile.secondaryCategories] : [],
    businessName: projectBrandName,
    domain: projectDomain,
  }
  const [showAllPrompts, setShowAllPrompts] = useState(false)
  // Questions whose full engine row is open (the rest show only the engines that named the business).
  const [enginesOpenFor, setEnginesOpenFor] = useState<ReadonlySet<string>>(() => new Set())
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

  // Build brand variants once for reuse in result rows (mention chips).
  // Includes project-level brand & domain aliases so e.g. "Samsung Israel" or
  // "samsungmobile.co.il" are recognised.
  const brandVariants = useMemo(
    () => getBrandVariants(projectBrandName, projectDomain, projectBrandAliases, projectDomainAliases),
    [projectBrandName, projectDomain, projectBrandAliases, projectDomainAliases]
  )
  // Normalized project domains (primary + aliases) for citation + mention checks.
  const domainList = useMemo(
    () => buildDomainList(projectDomain, projectDomainAliases),
    [projectDomain, projectDomainAliases]
  )
  const normalizedTargetDomain = useMemo(
    () => (projectDomain ? normalizeDomain(projectDomain) : null),
    [projectDomain]
  )

  /** A stable key for the keyword LIST, so identity changes cannot re-trigger
   *  work that only depends on the values. */
  const projectKeywordsKey = (projectKeywords || []).join('\u0000')
  const isRichProject = useMemo(
    () => analyzeSmartQuestionContext(projectKeywords || []).isRichProject,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [projectKeywordsKey]
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
      onRunsLoadedRef.current?.(Array.isArray(runsData.runs) ? runsData.runs : [])
      // Once, on the first load: nothing checked yet, so the questions are the place to start.
      if (openQueriesWhenEmptyRef.current) {
        openQueriesWhenEmptyRef.current = false
        if (!Array.isArray(runsData.runs) || runsData.runs.length === 0) setCurrentTab('queries')
      }

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
            // Strict signals — fall back to display flags on older API payloads.
            mentionedInAnswer: typeof result.mentionedInAnswer === 'boolean'
              ? result.mentionedInAnswer
              : (hasDisplay ? result.displayMentioned : (result.mentioned || false)),
            citedAsSource: typeof result.citedAsSource === 'boolean'
              ? result.citedAsSource
              : (hasDisplay ? result.displayCited : (result.targetCited || false)),
            domainMentioned: typeof result.domainMentioned === 'boolean' ? result.domainMentioned : false,
            brandMentioned: typeof result.brandMentioned === 'boolean' ? result.brandMentioned : false,
            domainInAnswerLabel: typeof result.domainInAnswerLabel === 'string' ? result.domainInAnswerLabel : null,
            domainInSourceLabel: typeof result.domainInSourceLabel === 'string' ? result.domainInSourceLabel : null,
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

      // The shared score (lib/ai-visibility/score.ts): the latest answer per
      // question x engine, archived answers and unchecked engines left out. The
      // same number the overview, the dashboard and the competitor comparison show.
      const scored = resultsWithText.map((r) => ({
        id: r.id, promptId: r.promptId || null, engine: r.engine, at: r.scannedAt || null, status: r.status,
        excluded: r.excludedFromScore === true, mentioned: r.displayMentioned === true, cited: r.displayCited === true,
      }))
      const total = visibilityScore(scored)
      const engineMap = new Map<string, EngineMetrics>()
      for (const [engine, m] of engineScores(scored)) {
        engineMap.set(engine, { engine, scans: m.answers, mentions: m.mentions, citations: m.citations, rate: m.rate })
      }

      setGlobalMetrics({
        totalScans: total.answers,
        totalMentions: total.mentions,
        totalCitations: total.citations,
        mentionRate: total.score ?? 0,
        citationRate: total.answers > 0 ? Math.round((total.citations / total.answers) * 100) : 0,
        enginesCovered: SUPPORTED_ENGINES.length,
        enginesWithMentions: [...engineMap.values()].filter((m) => m.mentions > 0).length,
      })

      setEngineMetrics(engineMap)
    } catch (e) {
      onRunsLoadedRef.current?.(null)
      setError(isUserFacingError(e) ? e.message : GENERIC_ERROR)
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
        if (cancelled) return
        setManualProfile(d.profile ?? null)
        setScanBusiness(d.scanBusiness ?? null)
        setIdentityReady(true)
      })
      .catch(() => {
        if (cancelled) return
        setManualProfile(null)
        setScanBusiness(null)
        setIdentityReady(true)
      })
    return () => {
      cancelled = true
    }
  }, [projectId])

  useEffect(() => {
    if (!identityReady) return
    let cancelled = false

    const suggestions = generatePromptSuggestions({
      businessName: projectBrandName,
      domain: projectDomain,
      city: projectCity || null,
      country: projectCountry,
      language: projectLanguage,
      keywords: projectKeywords,
      manualProfile,
      category: identityCategory,
      shuffle: false,
      limit: 8,
    })
    // project.language is the source of truth — an English project shown in a
    // Hebrew UI must still produce English questions (and vice-versa).
    const lang: 'he' | 'en' = normalizeLanguage(projectLanguage)
    // Filter vNext questions safely — ensure prompt field is valid string
    let vNextFiltered = suggestions.filter((q) => {
      const promptText = q?.prompt ?? ''
      return typeof promptText === 'string' && promptText.trim().length > 0 && !isInvalidPriceQuestion(promptText, lang)
    })

    // GUARANTEED FALLBACK: brand-new projects with no keyword signals resolve to
    // the `generic` category, for which the vNext engine has no seeds → returns [].
    // Without this, the panel would auto-show an empty state. Seed it with basic
    // business-name/domain questions so new projects always display suggestions.
    // No notice here — this is a passive load, not a failed AI attempt. Cached
    // Gemini questions (if any) replace these silently in the background below.
    if (vNextFiltered.length === 0) {
      const category = identityCategory
      const fallback = buildFallbackSuggestions(
        projectBrandName,
        null, // projectName not available
        projectDomain,
        category,
        projectCity || null,
        projectKeywords || [],
        [], // competitors not available on initial load
        lang
      )
      if (fallback.length > 0) {
        vNextFiltered = fallback
        console.log('[ai-question-suggestions] initial load seeded local fallback', {
          projectId,
          businessName: projectBrandName || '(none)',
          targetDomain: projectDomain || '(none)',
          rawLanguage: projectLanguage || '(none)',
          normalizedLanguage: lang,
          category,
          fallbackCount: fallback.length,
        })
      }
    }

    // Show vNext immediately — cached suggestions arrive in the background
    commitSuggestedQuestions(vNextFiltered)
    setExcludedSuggestionKeys(new Set())
    setNoNewSuggestionsFound(false)
    setUsedFallbackQuestions(false)

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

        // PHASE 2: Detect pool shrinkage for warning logs
        const currentServerPoolCount = serverDedupedQuestions.length
        if (previousServerPoolCount > 0 && currentServerPoolCount < previousServerPoolCount) {
          console.warn('[AI_SUGGESTIONS_POOL_SHRINK_WARNING]', {
            projectId,
            contextHash: data.contextHash || '(not returned)',
            previousCount: previousServerPoolCount,
            currentCount: currentServerPoolCount,
            shrinkageCount: previousServerPoolCount - currentServerPoolCount,
            percentChange: Math.round(((currentServerPoolCount - previousServerPoolCount) / previousServerPoolCount) * 100),
          })
        }

        // Read localStorage v2 key only — never respect old auto-expand key
        let savedExpandedState = false
        try {
          savedExpandedState = localStorage.getItem(`ai-visibility-expanded-v2-${projectId}`) === 'true'
        } catch (e) {
          // localStorage may not be available
        }

        // DISPLAY QUALITY GATE: cached/vNext rows may have been generated by the
        // pre-intent-v2 engine. Drop legacy/weak phrasings and top up with the
        // new engine so what users actually see reflects the current logic.
        const gateCategory = identityCategory
        const gated = applyDisplayQualityGate(merged, {
          businessName: projectBrandName,
          domain: projectDomain,
          category: gateCategory,
          location: projectCity || null,
          keywords: projectKeywords || [],
          language: projectLanguage,
        })
        const gatedMerged = gated.suggestions
        console.log('[ai-question-suggestions] displayed source:', merged.length > 0 ? 'cache/db' : 'fallback')
        console.log('[ai-question-suggestions] cache suggestions count', { count: cachedRaw.length })
        console.log('[ai-question-suggestions] current generation version', { version: QUESTION_GENERATION_VERSION })
        console.log('[ai-question-suggestions] using cached suggestions:', merged.length > 0)
        console.log('[ai-question-suggestions] force refresh:', false)
        console.log('[ai-question-suggestions] old suggestions rejected count', { count: gated.rejectedCount })
        console.log('[ai-question-suggestions] new suggestions generated count', { count: gated.addedFromEngine })
        console.log('[ai-question-suggestions] final displayed suggestions count', { count: gatedMerged.length })

        if (!cancelled) {
          commitSuggestedQuestions(gatedMerged)
          setShowAllSmartQuestions(savedExpandedState)
          setPreviousServerPoolCount(currentServerPoolCount)
          // Real cached/Gemini questions arrived — clear the local-fallback notice.
          if (gatedMerged.length > 0) setUsedFallbackQuestions(false)

          console.log('[AI_SUGGESTIONS_CLIENT_SERVER_RECONCILE]', {
            projectId,
            contextHash: data.contextHash || '(not returned)',
            serverDedupedCount: currentServerPoolCount,
            clientMergedCount: merged.length,
            vNextCount: vNextFiltered.length,
            cachedInServer: cachedDisplayedCount,
            geminiWasCalled: false,
            persistenceSource: 'server_cache_write',
          })

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
    // Keyed by the keywords' VALUE, not the array's identity. A caller that
    // passes an inline `targets.map(...)` — as this page did — hands over a new
    // array on every render, and an effect that calls a Gemini-backed endpoint
    // must not re-run because a parent re-rendered. The parent now memoizes it
    // too; this makes the component immune to the next caller that forgets.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectBrandName, projectDomain, projectCity, projectCountry, projectLanguage, suggestionsRefreshKey, projectKeywordsKey, manualProfile, identityCategory, identityReady, projectId])

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

  // What each question's latest answer on each engine said: true = the
  // business was mentioned, false = checked and not mentioned; absent = never
  // checked. The chip's mark says this, not merely "checked".
  const mentionedByPair = useMemo(() => {
    const m = new Map<string, boolean>()
    const latest = latestAnswers(allResults.filter((r) => !!r.promptId).map((r) => ({
      ...r, at: r.scannedAt, excluded: false, mentioned: r.displayMentioned === true, cited: r.displayCited === true,
    })))
    for (const a of latest) m.set(`${a.promptId}:${a.engine}`, a.mentioned)
    return m
  }, [allResults])

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
          // Only a refusal written for the merchant (it carries errorEn: quota,
          // already running, try again) is shown as it is; anything else is ours.
          throw typeof body.errorEn === 'string' && body.errorEn
            ? new UserFacingError(apiErrorText(body, isHebrew ? 'he' : 'en', body.errorEn))
            : new Error(body.error || `HTTP ${res.status}`)
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
        setError(isUserFacingError(e) ? e.message : GENERIC_ERROR)
        setScanStatus(null)
      } finally {
        // The allowance moved (or did not) — re-read it either way, so what the
        // merchant sees is the ledger's answer and not an optimistic guess.
        void loadAllowance()
        setScanningKey(null)
        // Reset progress after fade
        setTimeout(() => {
          setScanProgress(0)
          // Auto-dismiss success message after 3 seconds
          setTimeout(() => setScanStatus(null), 3000)
        }, 500)
      }
    },
    [projectId, loadAllResults, allResults, openResultDrawer, t, loadAllowance, isHebrew]
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
      setError(isUserFacingError(e) ? e.message : GENERIC_ERROR)
    } finally {
      setDeleting(false)
      setDeletePromptId(null)
    }
  }, [allPrompts, loadAllResults])

  const refreshSuggestions = useCallback(async (trigger: 'inner' | 'top' = 'inner') => {
    setRefreshingSuggestions(true)
    setNoNewSuggestionsFound(false)
    // Track whether Gemini actually produced anything this cycle so we know if a
    // local fallback is required (so the user is never left with no questions).
    let geminiProducedQuestions = false
    const normalizedLang = normalizeLanguage(projectLanguage)
    const detectedCategory = identityCategory
    if (trigger === 'top') console.log('[ai-question-suggestions] top button clicked', { projectId })
    else console.log('[ai-question-suggestions] inner button clicked', { projectId })
    console.log('[ai-question-suggestions] generate clicked', {
      projectId,
      businessName: projectBrandName || '(none)',
      projectName: projectBrandName || '(none)',
      targetDomain: projectDomain || '(none)',
      rawLanguage: projectLanguage || '(none)',
      normalizedLanguage: normalizedLang,
      detectedCategory,
      location: projectCity || '(none)',
      keywordsCount: (projectKeywords || []).length,
      competitorsCount: 0,
      currentlyShown: suggestedQuestions.length,
    })
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
        category: identityCategory,
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
      // Gemini is the PRIMARY source: this endpoint tries vNext + cache + Gemini
      // first. Only if it yields nothing do we fall back to local questions.
      let apiDedupedQuestions: any[] = []
      try {
        console.log('[ai-question-suggestions] calling enriched suggestions endpoint', { projectId, normalizedLanguage: normalizedLang, trigger, forceRefresh: trigger === 'inner' || trigger === 'top' })
        const enrichResponse = await fetch('/api/ai-visibility/enriched-suggestions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectId,
            language: normalizedLang,
            country: projectCountry || undefined,
            businessCategory: null,
            forceRefresh: trigger === 'inner' || trigger === 'top',
          }),
        })

        if (enrichResponse.ok) {
          const enrichData = await enrichResponse.json()

          // Use ONLY API's DEDUPED suggestions as authoritative pool
          apiDedupedQuestions = enrichData.dedupedQuestions || []
          geminiWasCalled = enrichData.geminiWasCalled || false
          geminiNotCalledReason = enrichData.geminiNotCalledReason || ''
          contextHash = enrichData.contextHash || ''
          geminiProducedQuestions = apiDedupedQuestions.length > 0

          console.log('[ai-question-suggestions] Gemini attempted', { projectId, geminiWasCalled, geminiNotCalledReason: geminiWasCalled ? null : geminiNotCalledReason })
          console.log('[ai-question-suggestions] Gemini response count:', {
            usingGemini: geminiWasCalled,
            geminiNotCalledReason: geminiWasCalled ? null : geminiNotCalledReason,
            apiPoolCount: apiDedupedQuestions.length,
          })

          // Count items by source from dedupedQuestions using normalized source
          const cachedItemsInDedup = apiDedupedQuestions.filter((q: any) => normalizeSuggestionSource(q) === 'cache').length
          const geminiItemsInDedup = apiDedupedQuestions.filter((q: any) => normalizeSuggestionSource(q) === 'gemini').length
          const vNextItemsInDedup = apiDedupedQuestions.filter((q: any) => normalizeSuggestionSource(q) === 'vnext').length
          const unknownItemsInDedup = apiDedupedQuestions.filter((q: any) => normalizeSuggestionSource(q) === 'unknown').length
          cachedLoadedCount = cachedItemsInDedup // Track count of cached items that survived server dedup
          newGeminiCount = geminiItemsInDedup // Track count of gemini items that survived server dedup

          // Log metrics from API
          console.log('[AI_SUGGESTIONS_SERVER_POOL_RESPONSE]', {
            projectId,
            contextHash,
            apiDedupedCount: apiDedupedQuestions.length,
            cachedInDedup: cachedItemsInDedup,
            geminiInDedup: geminiItemsInDedup,
            vNextInDedup: vNextItemsInDedup,
            unknownInDedup: unknownItemsInDedup,
            geminiWasCalled,
            duplicatesRemovedByApi: enrichData.duplicatesRemoved || 0,
            persistenceMethod: 'server_cache_write_reload',
            apiSource: enrichData.source || 'unknown',
          })

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
      const filtered = vNextFiltered.filter((q) => !isInvalidPriceQuestion(q.prompt, normalizedLang))

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
        // No new candidates from this batch (vNext empty + Gemini gave nothing).
        emptyStateReason = 'no_new_candidates'
        // GUARANTEED FALLBACK: if the user currently has NO suggestions shown
        // (new/generic project where Gemini is disabled, failing, or returned
        // nothing), seed basic local questions so they are never left empty.
        // For projects that already show suggestions (rich projects clicking
        // "generate more") we keep the normal "pool exhausted" behavior.
        if (suggestedQuestions.length === 0) {
          const fallback = buildFallbackSuggestions(
            projectBrandName,
            null, // projectName not available
            projectDomain,
            detectedCategory,
            projectCity || null,
            projectKeywords || [],
            [], // competitors not available
            normalizedLang
          )
          const fallbackReason = geminiWasCalled ? 'gemini_returned_nothing' : (geminiNotCalledReason || 'enrichment_unavailable')
          if (fallback.length > 0) {
            console.log('[ai-question-suggestions] fallback used', { projectId, used: true, reason: fallbackReason, fallbackCount: fallback.length, geminiWasCalled, geminiNotCalledReason })
            console.log('[ai-question-suggestions] fallback reason', { projectId, reason: fallbackReason })
            commitSuggestedQuestions(fallback)
            // Only show fallback notice if Gemini was actually called and failed (not just unavailable)
            const shouldShowNotice = geminiWasCalled && fallbackReason === 'gemini_returned_nothing'
            setUsedFallbackQuestions(shouldShowNotice)
            setNoNewSuggestionsFound(false)
            console.log('[ai-question-suggestions] final suggestions count:', fallback.length)
            console.log('[ai-question-suggestions] state updated')
          } else {
            // buildFallbackSuggestions never returns [] anymore, but keep the
            // guard so a future regression can't strand the user on empty.
            setNoNewSuggestionsFound(true)
          }
        } else {
          setNoNewSuggestionsFound(true)
        }
      } else {
        // Real candidates produced (vNext and/or Gemini) — clear fallback notice.
        if (geminiProducedQuestions) setUsedFallbackQuestions(false)
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
        // DISPLAY QUALITY GATE (force refresh): user explicitly asked for more
        // questions, so drop legacy/weak phrasings and top up with intent-v2.
        const refreshGateCategory = identityCategory
        const refreshGate = applyDisplayQualityGate(capped, {
          businessName: projectBrandName,
          domain: projectDomain,
          category: refreshGateCategory,
          location: projectCity || null,
          keywords: projectKeywords || [],
          language: projectLanguage,
        }, { minCount: 6, maxCount: MAX_SUGGESTIONS })
        const finalDeduped: PromptSuggestion[] = refreshGate.suggestions

        console.log('[ai-question-suggestions] displayed source:', 'cache/db+gemini')
        console.log('[ai-question-suggestions] cache suggestions count', { count: apiDedupedQuestions.length })
        console.log('[ai-question-suggestions] current generation version', { version: QUESTION_GENERATION_VERSION })
        console.log('[ai-question-suggestions] using cached suggestions:', true)
        console.log('[ai-question-suggestions] force refresh:', true)
        console.log('[ai-question-suggestions] old suggestions rejected count', { count: refreshGate.rejectedCount })
        console.log('[ai-question-suggestions] new suggestions generated count', { count: refreshGate.addedFromEngine })
        console.log('[ai-question-suggestions] final displayed suggestions count', { count: finalDeduped.length })

        const visibleAfter = finalDeduped.length
        const growth = visibleAfter - visibleBefore

        // PHASE 2: Detect pool shrinkage for warning logs
        const currentServerPoolCount = apiDedupedQuestions.length
        if (previousServerPoolCount > 0 && currentServerPoolCount < previousServerPoolCount) {
          console.warn('[AI_SUGGESTIONS_POOL_SHRINK_WARNING]', {
            projectId,
            contextHash,
            previousCount: previousServerPoolCount,
            currentCount: currentServerPoolCount,
            shrinkageCount: previousServerPoolCount - currentServerPoolCount,
            percentChange: Math.round(((currentServerPoolCount - previousServerPoolCount) / previousServerPoolCount) * 100),
            geminiWasCalled,
          })
        }

        // Update exclusion ledger
        setExcludedSuggestionKeys((prev) => {
          const next = new Set(prev)
          currentlyShown.forEach((p) => next.add(normalize(p)))
          return next
        })

        commitSuggestedQuestions(finalDeduped)
        setPreviousServerPoolCount(currentServerPoolCount)
        console.log('[ai-question-suggestions] final suggestions count:', finalDeduped.length)
        console.log('[ai-question-suggestions] state updated')

        // Log server-to-client reconciliation
        console.log('[AI_SUGGESTIONS_CLIENT_SERVER_RECONCILE]', {
          projectId,
          contextHash,
          serverDedupedCount: currentServerPoolCount,
          clientMergedCount: finalDeduped.length,
          cachedInServer: cachedLoadedCount,
          geminiInServer: newGeminiCount,
          geminiWasCalled,
          persistenceSource: 'server_cache_write',
        })

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
      // On failure: keep existing suggestions visible. If the user has nothing
      // shown at all, guarantee basic local questions so they're never empty.
      console.error('[ai-question-suggestions] generation error:', e instanceof Error ? e.message : String(e))
      if (suggestedQuestions.length === 0) {
        const fallback = buildFallbackSuggestions(
          projectBrandName,
          null, // projectName not available
          projectDomain,
          detectedCategory,
          projectCity || null,
          projectKeywords || [],
          [], // competitors not available
          normalizedLang
        )
        if (fallback.length > 0) {
          console.log('[ai-question-suggestions] fallback used', { projectId, used: true, reason: 'exception', fallbackCount: fallback.length, error: e instanceof Error ? e.message : String(e) })
          console.log('[ai-question-suggestions] fallback reason', { projectId, reason: 'exception' })
          commitSuggestedQuestions(fallback)
          // Show notice on exception (user-triggered generation failed)
          setUsedFallbackQuestions(true)
          console.log('[ai-question-suggestions] final suggestions count:', fallback.length)
          console.log('[ai-question-suggestions] state updated')
        } else {
          setError(isUserFacingError(e) ? e.message : GENERIC_ERROR)
        }
      } else {
        setError(isUserFacingError(e) ? e.message : GENERIC_ERROR)
      }
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
    identityCategory,
    suggestedQuestions,
    allPrompts,
    excludedSuggestionKeys,
    previousServerPoolCount,
    projectId,
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
            message: t('archive_update_failed'),
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
        const message = newExcludedState ? t('archived_toast') : t('restored_toast')

        setExclusionToast({ message, type: 'success' })
        setTimeout(() => setExclusionToast(null), 3000)

      } catch (err) {
        console.error('Error updating archive status:', err)
        setExclusionToast({
          message: t('archive_update_failed'),
          type: 'error',
        })
        setTimeout(() => setExclusionToast(null), 3000)
      }
    },
    [t]
  )

  if (loading) {
    return (
      <section id="ai-visibility" className="space-y-6">
        <div role="status" aria-busy="true" className="space-y-4" data-skeleton="">
          <span className="sr-only">{t('loading')}</span>
          <Skeleton className="h-11 w-full max-w-md" />
          {[0, 1, 2].map((i) => (
            <div key={i} className="rounded-card border border-line bg-surface p-5 shadow-card">
              <Skeleton className="mb-3 h-4 w-2/3" />
              <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                {[0, 1, 2, 3].map((j) => (
                  <Skeleton key={j} className="h-10" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    )
  }

  return (
    <section id="ai-visibility" className="space-y-6" dir={isHebrew ? 'rtl' : 'ltr'}>
      {/* HEADER — the page carries its own in overview mode (W6d) */}
      {!overviewMode && (
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-inset bg-action-soft text-action">
            <SparkleIcon size={20} />
          </span>
          <div>
            <h2 className="text-section font-semibold text-ink">{t('ai_visibility')}</h2>
            <p className="text-caption text-muted">{t('monitor_engines')}</p>
          </div>
        </div>
      </div>
      )}

      {/* Only our own words reach the merchant: a raw server or provider error
          is stored as GENERIC_ERROR and read out as "something went wrong". */}
      {error && (
        <Notice tone="bad" onDismiss={() => setError(null)}>
          {error === GENERIC_ERROR ? t('something_went_wrong') : error}
        </Notice>
      )}

      {scanStatus && <Notice tone="wait">{scanStatus}</Notice>}

      {exclusionToast && (
        <Notice tone={exclusionToast.type === 'success' ? 'ok' : 'bad'}>{exclusionToast.message}</Notice>
      )}

      {/* TAB BAR */}
      <div
        role="tablist"
        aria-label={t('ai_visibility')}
        className="-mx-4 flex gap-1 overflow-x-auto border-b border-line px-4 sm:mx-0 sm:px-0"
        onKeyDown={(e) => {
          // Arrow keys move between the tabs (and select), as a tab list should.
          if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
          const order = ['results', 'queries', 'insights', 'competitors'] as const
          const forward = (e.key === 'ArrowLeft') === isHebrew
          const next = order[(order.indexOf(currentTab as (typeof order)[number]) + (forward ? 1 : order.length - 1)) % order.length]
          e.preventDefault()
          setCurrentTab(next)
          e.currentTarget.querySelector<HTMLElement>(`[data-ai-tab="${next}"]`)?.focus()
        }}
      >
        {(['results', 'queries', 'insights', 'competitors'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            data-ai-tab={tab}
            aria-selected={currentTab === tab}
            tabIndex={currentTab === tab ? 0 : -1}
            onClick={() => setCurrentTab(tab)}
            className={`-mb-px whitespace-nowrap border-b-2 px-4 py-3 text-copy font-semibold transition-colors duration-150 ease-snappy focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-action/20 ${
              currentTab === tab
                ? 'border-action text-ink'
                : 'border-transparent text-muted hover:text-ink'
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
          {/* In overview mode the page's opening card shows the score and the totals (W6d). */}
          {globalMetrics && !overviewMode && (
            <AIVisibilityScoreCard score={globalMetrics.mentionRate} t={t} isRTL={isHebrew} />
          )}
          {globalMetrics && !overviewMode && (
            <OverviewSummaryStrip metrics={globalMetrics} totalResults={scoreResults.length} t={t} />
          )}
          <EngineMentionCards metrics={engineMetrics} t={t} />

          {/* FILTER BAR */}
          <div className="space-y-2">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))_auto] lg:items-center">
              <div className="relative sm:col-span-2 lg:col-span-1">
                <Search aria-hidden="true" className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
                <Input
                  type="search"
                  aria-label={t('search')}
                  placeholder={t('search')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="ps-9"
                />
              </div>
              <Select
                aria-label={t('filter_engine')}
                value={filterEngine || ''}
                onChange={(e) => setFilterEngine(e.target.value || null)}
                options={[
                  { value: '', label: t('all_engines') },
                  ...SUPPORTED_ENGINES.map((e) => ({ value: e, label: ENGINE_META[e as keyof typeof ENGINE_META]?.name || e })),
                ]}
              />
              <Select
                aria-label={t('filter_mention')}
                value={filterMentioned === null ? '' : filterMentioned ? 'yes' : 'no'}
                onChange={(e) =>
                  setFilterMentioned(e.target.value === '' ? null : e.target.value === 'yes')
                }
                options={[
                  { value: '', label: t('all_mention') },
                  { value: 'yes', label: t('mentioned') },
                  { value: 'no', label: t('not_mentioned') },
                ]}
              />
              <Select
                aria-label={t('filter_citation')}
                value={filterCited === null ? '' : filterCited ? 'yes' : 'no'}
                onChange={(e) =>
                  setFilterCited(e.target.value === '' ? null : e.target.value === 'yes')
                }
                options={[
                  { value: '', label: t('all_citations') },
                  { value: 'yes', label: t('target_cited') },
                  { value: 'no', label: t('not_cited') },
                ]}
              />
              {archivedResults.length > 0 && (
                <Button
                  variant="secondary"
                  onClick={() => setShowArchive(!showArchive)}
                  aria-pressed={showArchive}
                  className={showArchive ? 'border-action bg-action-soft text-action hover:border-action hover:bg-action-soft' : undefined}
                >
                  <Archive aria-hidden="true" className="size-4" />
                  {t('show_archive').replace('{count}', String(archivedResults.length))}
                </Button>
              )}
            </div>
            <p className="text-caption text-muted">
              {t('showing_results').replace('{count}', String(showAllResults ? filteredResults.length : Math.min(3, filteredResults.length)))}
              {archivedResults.length > 0 && <> · {t('archive_note')}</>}
            </p>
          </div>

          {filteredResults.length > 0 ? (
            <>
              <div className="space-y-3">
                {filteredResults.slice(0, showAllResults ? undefined : 3).map((r) => (
                  <ResultRowCard
                    key={r.id}
                    result={r}
                    highlighted={highlightResultId === r.id}
                    brandVariants={brandVariants}
                    targetDomain={normalizedTargetDomain}
                    domainList={domainList}
                    isHebrew={isHebrew}
                    onRowClick={openResultDrawer}
                    onArchiveToggle={handleArchiveResult}
                    onRetry={() => r.promptId && scanEngine(r.promptId, r.engine)}
                    t={t}
                  />
                ))}
              </div>
              {filteredResults.length > 3 && (
                <div className="flex justify-center">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setShowAllResults(!showAllResults)}
                  >
                    {showAllResults ? t('show_less') : t('show_all')}
                  </Button>
                </div>
              )}
            </>
          ) : (
            <EmptyState
              icon={<MessageSquareText />}
              title={t('no_scans')}
              body={t('no_scans_help')}
              action={
                <Button size="sm" variant="secondary" onClick={() => setCurrentTab('queries')}>
                  {t('tab_queries')}
                </Button>
              }
              className="rounded-card border border-line bg-surface"
            />
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
            identity={identity}
            scanDescription={scanBusiness?.description ?? null}
            ready={identityReady}
            initialProfile={manualProfile}
            onRegenerate={() => { void refreshSuggestions('top') }}
            onChange={(profile) => {
              setManualProfile(profile)
              // Immediately refresh inline recommended questions with the
              // new profile — no page reload needed.
              const next = resolveBusinessIdentity({
                manualProfile: profile, scan: scanBusiness, businessName: projectBrandName, domain: projectDomain, keywords: projectKeywords,
              })
              const refreshed = generatePromptSuggestions({
                businessName: projectBrandName,
                domain: projectDomain,
                city: projectCity || null,
                country: projectCountry,
                language: projectLanguage,
                keywords: projectKeywords,
                manualProfile: profile,
                category: next.category,
                shuffle: false,
                limit: 20,
              })
              commitSuggestedQuestions(refreshed)
            }}
          />
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <div className="flex items-center gap-2">
              <h3 className="text-section font-semibold text-ink">{t('ai_queries')}</h3>
              <Badge variant="neutral">{allPrompts.length}</Badge>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:flex">
              <Button variant="secondary" onClick={() => { console.log('[ai-question-suggestions] top button clicked', { projectId }); setShowSuggestions(true) }}>
                <Sparkles aria-hidden="true" className="size-4" />
                {t('recommend_questions')}
              </Button>
              <Button onClick={() => setShowNewPrompt(true)}>
                <Plus aria-hidden="true" className="size-4" />
                {t('new_query')}
              </Button>
            </div>
          </div>

          {/* How it works: the long explanations fold away; the one line that
              says what to do (and the allowance) stays in view. */}
          <details className="group rounded-inset border border-line bg-surface">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-inset px-4 py-3 text-copy font-semibold text-ink transition-colors duration-150 ease-snappy hover:bg-sunk focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-action/20 [&::-webkit-details-marker]:hidden">
              <span className="inline-flex items-center gap-2">
                <Info aria-hidden="true" className="size-4 text-muted" />
                {t('how_it_works')}
              </span>
              <ChevronDown aria-hidden="true" className="size-4 text-muted transition-transform duration-150 ease-snappy group-open:rotate-180" />
            </summary>
            <div className="space-y-2 border-t border-line px-4 py-3">
              <p data-ai-questions-explainer="" className="max-w-[80ch] text-copy text-body">{t('queries_explainer')}</p>
              <p className="text-caption text-muted" data-ai-chip-legend="">{t('chip_legend')}</p>
            </div>
          </details>
          {allPrompts.length > 0 ? (
            <>
              {/* THE CONTROL EXISTS — say so. The engine chips below dispatch a
                  check; they looked like status badges next to a delete icon,
                  which is why a reviewer could not find any way to start one.
                  The allowance beside it comes from the usage ledger, so it can
                  never disagree with what the dispatcher enforces. */}
              <div className="flex flex-wrap items-center justify-between gap-2 text-caption">
                <span className="text-body">{t('run_a_check_hint')}</span>
                <span className="text-muted tabular-nums" data-testid="ai-allowance">
                  {allowance == null ? null
                    : allowance.state === 'unmetered' ? t('ai_allowance_unmetered')
                    : allowance.state === 'unknown' ? t('ai_allowance_unknown')
                    : allowance.limit === 0 ? `${t('ai_allowance')}: ${t('ai_allowance_not_included')}`
                    : `${t('ai_allowance')}: ${allowance.used}/${allowance.limit}`}
                </span>
              </div>
              {/* Nothing left to check with: say which case it is (a plan without
                  AI checks is not "used them all") and where to get more. The
                  link only opens the billing page; nothing here changes a plan. */}
              {allowance != null && allowance.state === 'known' && allowance.remaining === 0 && (
                <Notice tone="warn">
                  <span data-ai-allowance-out="">
                    {allowance.limit === 0 ? t('ai_allowance_none_body') : t('ai_allowance_exhausted')}{' '}
                    <NextLink href="/billing" className="font-semibold text-action underline underline-offset-2 hover:text-action-hover">
                      {t('ai_allowance_upgrade')}
                    </NextLink>
                  </span>
                </Notice>
              )}
              <ul className="space-y-3">
                {allPrompts.slice(0, showAllPrompts ? undefined : 3).map((p) => (
                  <li
                    key={p.id}
                    data-ai-question=""
                    className="space-y-3 rounded-inset border border-line bg-surface p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="line-clamp-2 flex-1 text-copy font-medium text-ink">{p.prompt}</p>
                      <RowMenu
                        label={t('question_more_actions')}
                        className="-me-1.5 -mt-1 shrink-0"
                        items={[
                          { key: 'delete', label: t('delete'), danger: true, icon: <Trash2 aria-hidden="true" className="size-4" />, onSelect: () => setDeletePromptId(p.id) },
                        ]}
                      />
                    </div>
                    <PromptInsightRow insight={promptInsights.get(p.id) ?? null} t={t} isRTL={isHebrew} />
                    {(() => {
                    // One quiet row per question: the engines that mentioned the business
                    // (and one that is running now), the rest behind "+N". A question never
                    // checked anywhere shows every engine, since each chip is how a check starts.
                    const checkedAny = SUPPORTED_ENGINES.some((e) => scannedSet.has(`${p.id}:${e}`))
                    const allOpen = !checkedAny || enginesOpenFor.has(p.id)
                    const shownEngines = allOpen ? SUPPORTED_ENGINES
                      : SUPPORTED_ENGINES.filter((e) => mentionedByPair.get(`${p.id}:${e}`) === true || scanningKey === `${p.id}:${e}`)
                    const hiddenEngines = SUPPORTED_ENGINES.length - shownEngines.length
                    return (
                    <div className="flex flex-wrap gap-1.5" data-ai-engine-row={allOpen ? 'all' : 'mentioned'}>
                      {shownEngines.map((engine) => {
                        const meta = ENGINE_META[engine as keyof typeof ENGINE_META]
                        const key = `${p.id}:${engine}`
                        const scanned = scannedSet.has(key)
                        const mentionedHere = mentionedByPair.get(key)
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
                          ? `${mentionedHere === true ? t('chip_mentioned') : t('chip_not_mentioned')}${scannedAt ? ` · ${t('scanned_at')}: ${formatDate(scannedAt)}` : ''} · ${t('rescan')}`
                          : t('scan_this_engine')
                        // The ACCESSIBLE NAME says what the click does and to
                        // which engine. "ChatGPT ✓" named a status; "Run an AI
                        // check on ChatGPT" names an action, which is what a
                        // reviewer — and a screen reader — is looking for.
                        // …and then what the last check found there.
                        const outcomeLabel = mentionedHere === true ? t('chip_mentioned')
                          : mentionedHere === false ? t('chip_not_mentioned') : t('chip_not_checked')
                        const actionLabel = scanning
                          ? t('scanning')
                          : `${scanned ? t('rerun_check_on') : t('run_check_on')}${meta?.name || engine} (${outcomeLabel})`
                        return (
                          <div key={engine} className="group relative min-w-0">
                              <button
                                type="button"
                                onClick={() => !scanning && scanEngine(p.id, engine)}
                                disabled={scanning}
                                title={actionLabel}
                                aria-label={actionLabel}
                                className={`relative inline-flex h-8 items-center gap-1.5 overflow-hidden rounded-control border px-2.5 text-caption font-medium transition-colors duration-150 ease-snappy focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-action/20 ${
                                  scanning
                                    ? 'cursor-wait border-line bg-sunk text-body'
                                    : mentionedHere === true
                                    ? 'cursor-pointer border-ok/40 bg-ok-soft text-ink hover:border-ok'
                                    : mentionedHere === false
                                    ? 'cursor-pointer border-line bg-sunk text-body hover:border-line-strong'
                                    : 'cursor-pointer border-line bg-surface text-body hover:border-action hover:bg-action-soft'
                                }`}
                                data-chip-outcome={mentionedHere === true ? 'mentioned' : mentionedHere === false ? 'not_mentioned' : 'not_checked'}
                              >
                                {scanning && (
                                  <span
                                    aria-hidden="true"
                                    className="absolute inset-y-0 start-0 bg-action/20 transition-[width] duration-150 ease-snappy"
                                    style={{ width: `${scanProgress}%` }}
                                  />
                                )}
                                <span className="relative z-10">
                                  {meta && <meta.Icon size={14} />}
                                </span>
                                <span className="relative z-10">{scanning ? t('scanning') : meta?.name || engine}</span>
                                {!scanning && mentionedHere === true && <Check aria-hidden size={13} strokeWidth={3} className="relative z-10 text-ok" />}
                                {!scanning && mentionedHere === false && <Minus aria-hidden size={13} strokeWidth={3} className="relative z-10 text-muted" />}
                              </button>
                              {/* Custom CSS tooltip — appears instantly on hover/focus, not delayed like native title */}
                              <span
                                role="tooltip"
                                className="pointer-events-none absolute bottom-full start-0 z-50 mb-1.5 hidden w-max max-w-[min(16rem,70vw)] rounded-control bg-contrast px-2 py-1 text-caption font-medium text-contrast-ink shadow-pop group-focus-within:block group-hover:block"
                              >
                                {tooltip}
                              </span>
                          </div>
                        )
                      })}
                      {hiddenEngines > 0 && (
                        <button
                          type="button"
                          onClick={() => setEnginesOpenFor((prev) => new Set(prev).add(p.id))}
                          aria-label={t('engines_show_rest').replace('{n}', String(hiddenEngines))}
                          title={t('engines_show_rest').replace('{n}', String(hiddenEngines))}
                          data-ai-engines-more={hiddenEngines}
                          className="inline-flex h-8 items-center rounded-control border border-line bg-surface px-2.5 text-caption font-semibold tabular-nums text-body transition-colors duration-150 ease-snappy hover:border-line-strong hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-action/20"
                        >
                          <span dir="ltr">+{hiddenEngines}</span>
                        </button>
                      )}
                    </div>
                    )
                    })()}
                  </li>
                ))}
              </ul>
              {allPrompts.length > 3 && (
                <div className="flex justify-center">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setShowAllPrompts(!showAllPrompts)}
                  >
                    {showAllPrompts ? t('show_less') : t('show_more')}
                  </Button>
                </div>
              )}
            </>
          ) : (
            <div data-ai-questions-empty="" className="rounded-card border border-line bg-surface">
              <EmptyState
                icon={<MessageSquareText />}
                title={t('no_queries_title')}
                body={t('no_queries_body')}
                action={<Button onClick={() => setShowSuggestions(true)}>{t('no_queries_pick')}</Button>}
                secondary={
                  <button
                    type="button"
                    onClick={() => setShowNewPrompt(true)}
                    className="rounded-control font-semibold text-action underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-action/20"
                  >
                    {t('no_queries_write')}
                  </button>
                }
              />
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
              // The insufficient-context marker is a notice, never a question
              // card — exclude it so it can never render with a "+" button.
              if (isInsufficientContextSuggestion(q)) return false
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

            const showMoreButtonVisible = availableSuggestions.length > COLLAPSED_VISIBLE_SUGGESTIONS && !showAllSmartQuestions
            const showLessButtonVisible = availableSuggestions.length > COLLAPSED_VISIBLE_SUGGESTIONS && showAllSmartQuestions

            console.log('[AI_SUGGESTIONS_RENDER]', {
              allInState: suggestedQuestions.length,
              availableSuggestions: availableSuggestions.length,
              trackedPrompts: trackedSet.size,
              localStorageKeyUsed,
              localStorageValue,
              expandedStateSource,
              isCollapsed,
              visibleSliced: visibleSliced.length,
              showMoreButtonVisible,
              showLessButtonVisible,
              collapsedLimit: COLLAPSED_VISIBLE_SUGGESTIONS,
            })

            // ALWAYS render the panel in the queries tab for new projects.
            // On initial load, suggestedQuestions may be empty but vNext generation
            // in the background (useEffect at line 437) will populate them.
            // If truly empty, show empty state with button to manually generate.
            return (
              <section aria-labelledby="ai-smart-questions-title" className="rounded-card border border-line bg-surface p-5 shadow-card sm:p-6">
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <h3 id="ai-smart-questions-title" className="flex items-center gap-1.5 text-section font-semibold text-ink">
                      {t('smart_questions_title')}
                      <span className="group relative inline-flex items-center">
                        <span
                          className="cursor-help text-action inline-flex rounded-pill focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-action/20"
                          role="img"
                          tabIndex={0}
                          aria-label={t('priority_tag_help_label')}
                        >
                          <Info aria-hidden="true" className="size-4" />
                        </span>
                        <span
                          role="tooltip"
                          className="pointer-events-none absolute bottom-full start-0 z-50 mb-1.5 hidden w-max max-w-[200px] rounded-control bg-contrast px-2 py-1.5 text-caption font-medium text-contrast-ink shadow-pop group-focus-within:block group-hover:block"
                        >
                          {t('priority_tag_help')}
                        </span>
                      </span>
                    </h3>
                    <p className="mt-0.5 text-caption text-muted">
                      {t('smart_questions_subtitle')}
                    </p>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => refreshSuggestions('inner')}
                    loading={refreshingSuggestions}
                    disabled={refreshingSuggestions || noNewSuggestionsFound}
                    className="shrink-0"
                    title={t('generate_more_suggestions')}
                    aria-label={t('generate_more_suggestions')}
                  >
                    {!refreshingSuggestions && <RefreshCw aria-hidden="true" className="size-4" />}
                    <span className="hidden sm:inline">{t('generate_more_suggestions')}</span>
                    <span className="sm:hidden">{t('more_questions_short')}</span>
                  </Button>
                </div>

                {/* EMPTY STATE: Show when no suggestions available and not refreshing */}
                {availableSuggestions.length === 0 && !refreshingSuggestions && (
                  <EmptyState
                    icon={<Sparkles />}
                    title={t('no_recommended_yet')}
                    action={
                      <Button size="sm" onClick={() => refreshSuggestions('inner')} disabled={refreshingSuggestions}>
                        {t('generate_recommended')}
                      </Button>
                    }
                    className="py-8"
                  />
                )}

                {/* LOADING INDICATOR: Show while generating */}
                {refreshingSuggestions && availableSuggestions.length === 0 && (
                  <div role="status" className="flex flex-col items-center gap-3 py-8">
                    <Loader2 aria-hidden="true" className="size-5 animate-spin text-action" />
                    <span className="text-copy text-body">{t('generating_recommended')}</span>
                  </div>
                )}

                {/* FALLBACK NOTICE: shown when AI was unavailable and we seeded basics */}
                {usedFallbackQuestions && availableSuggestions.length > 0 && !refreshingSuggestions && (
                  <Notice tone="warn" className="mb-4">{t('fallback_questions_notice')}</Notice>
                )}

                {/* SUGGESTIONS GRID: Show when there are available suggestions */}
                {availableSuggestions.length > 0 && (
                  <>
                    {/* Inline loading indicator — shown above the grid when adding more */}
                    {refreshingSuggestions && (
                      <div role="status" className="mb-3 flex items-center gap-2 text-caption text-muted">
                        <Loader2 aria-hidden="true" className="size-4 animate-spin text-action" />
                        <span>{t('generating_more')}</span>
                      </div>
                    )}
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
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
                              setError(isUserFacingError(e) ? e.message : GENERIC_ERROR)
                            }
                          }}
                          t={t}
                        />
                      ))}
                    </div>
                    {availableSuggestions.length > COLLAPSED_VISIBLE_SUGGESTIONS && (
                      <div className="mt-4 flex justify-center">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            const newExpandedState = !showAllSmartQuestions
                            setShowAllSmartQuestions(newExpandedState)
                            try {
                              if (newExpandedState) {
                                // User clicked show-more: expand and save v2 key
                                localStorage.setItem(`ai-visibility-expanded-v2-${projectId}`, 'true')
                              } else {
                                // User clicked show-less: collapse and clear v2 key
                                localStorage.removeItem(`ai-visibility-expanded-v2-${projectId}`)
                              }
                            } catch (e) {
                              // localStorage may be unavailable
                            }
                          }}
                        >
                          {showAllSmartQuestions ? t('show_less') : t('show_more')}
                        </Button>
                      </div>
                    )}
                    {noNewSuggestionsFound && (
                      <p className="mt-4 text-center text-caption text-muted">
                        {t(isRichProject ? 'pool_exhausted_rich' : 'pool_exhausted_thin')}
                      </p>
                    )}
                  </>
                )}
              </section>
            )
          })()}
        </>
      )}

      {/* TAB 3: COMPETITORS */}
      {currentTab === 'competitors' && (
        <>
          {/* Competitors are added and removed in settings once the page passes a slot (W6d). */}
          {competitorsSlot ?? (
          <CompetitorsPanel
            projectId={projectId}
            defaultCollapsed={initialTab !== 'competitors'}
            onCompetitorsChanged={() => setCompetitorsRefreshKey((k) => k + 1)}
          />
          )}
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
          domainList={domainList}
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
            <p className="text-copy text-body">{t('delete_question_body')}</p>
            <div className="flex flex-col-reverse gap-2 border-t border-line pt-4 sm:flex-row sm:justify-end">
              <Button
                variant="secondary"
                onClick={() => setDeletePromptId(null)}
                disabled={deleting}
              >
                {t('cancel')}
              </Button>
              <Button
                variant="danger"
                onClick={() => deletePrompt(deletePromptId)}
                loading={deleting}
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
        category={identityCategory}
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
