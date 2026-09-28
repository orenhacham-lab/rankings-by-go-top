'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import { SUPPORTED_COUNTRIES, SUPPORTED_LANGUAGES } from '@/lib/google-ads/constants'
import { GeneratedQuestion } from '@/lib/ai-questions/generate-questions'
import AIQuestionsModal from '@/components/keyword-research/AIQuestionsModal'
import TrendModal from '@/components/keyword-research/TrendModal'
import GscOpportunities from '@/components/content/GscOpportunities'
import { useToasts, ToastHost } from '@/components/content/Toast'
import { useActiveProject } from '@/lib/active-project/ActiveProjectProvider'
import { useProjectRow } from '@/lib/active-project/useProjectRow'
import { useScanResearch } from '@/components/keyword-research/useScanResearch'
import ScanOverview from '@/components/keyword-research/ScanOverview'
import ResearchStart from '@/components/keyword-research/ResearchStart'
import Header from '@/components/layout/Header'
import { useMapping } from '@/components/mapping/useMapping'
import { formatResearchDate } from '@/lib/keyword-research/format'
import { ScanEmptyCard, ScanLoadingSkeleton, ScanPendingCard, ScanRunningCard } from '@/components/keyword-research/ScanCards'
import ResearchFormBar, { ResearchFormClose } from '@/components/keyword-research/ResearchFormBar'
import EasyWins from '@/components/keyword-research/EasyWins'
import ResearchChips from '@/components/keyword-research/ResearchChips'
import ScanGscNotice from '@/components/keyword-research/ScanGscNotice'
import KeywordSourceLine from '@/components/keyword-research/KeywordSourceLine'
import { useGscKeywordFigures } from '@/components/gsc/GscKeywordFigures'
import { formatCount } from '@/components/gsc/format'
import { formatMoney } from '@/lib/keyword-research/format'
import { researchModel } from '@/lib/keyword-research/model'
import { EASY_WINS_SHOWN } from '@/lib/keyword-research/easy-wins'
import { keywordKey, type ScanKeyword, type TrackedKeyword } from '@/lib/keyword-research/scan-research'
import type { ResearchChip } from '@/lib/keyword-research/chips'
import type { ResearchRow } from '@/lib/keyword-research/rows'
import { Check, Copy, Loader2, CheckCircle, Plus, Sparkles, TrendingUp } from 'lucide-react'
import ResearchLandscape, { LANDSCAPE_IDS } from '@/components/keyword-research/ResearchLandscape'
import SectionNav from '@/components/keyword-research/SectionNav'
import SiteAvatar from '@/components/ui/SiteAvatar'
import { NO_LANDSCAPE } from '@/components/keyword-research/landscape'

interface KeywordIdeaResult {
  keyword: string
  avgMonthlySearches: number | null
  competition: 'LOW' | 'MEDIUM' | 'HIGH' | null
  competitionIndex: number | null
  lowTopOfPageBid: number | null
  highTopOfPageBid: number | null
  currency: string
}

type BadgeKey = 'lowCompetition' | 'commercial' | 'highVolume' | 'mediumPotential'
type OpportunityKey = 'high' | 'medium' | 'low'

/** With the scan's research on screen: rows the table shows at once, and adds per "show more". */
const TABLE_PAGE = 100
const NO_SCAN_KEYWORDS: ScanKeyword[] = []
const NO_TRACKED: TrackedKeyword[] = []

function getWordCount(keyword: string): number {
  return keyword.trim().split(/\s+/).filter(Boolean).length
}

function getSeoPotentialBadge(r: KeywordIdeaResult): OpportunityKey {
  const volume = r.avgMonthlySearches ?? 0
  const competition = r.competition
  const wc = getWordCount(r.keyword)

  if (volume < 10) return 'low'

  if (competition === 'LOW') {
    if (volume >= 30) return 'high'
    return 'medium'
  }

  if (competition === 'MEDIUM') {
    if (volume >= 100) return 'high'
    if (volume >= 30 && wc >= 2) return 'medium'
    if (volume >= 30) return 'medium'
    return 'low'
  }

  if (competition === 'HIGH') {
    if (wc <= 1) return 'low'
    if (wc === 2 && volume >= 1000) return 'medium'
    if (wc >= 3 && volume >= 100) return 'medium'
    return 'low'
  }

  const index = r.competitionIndex
  if (typeof index === 'number') {
    if (index <= 30 && volume >= 30) return 'high'
    if (index <= 60 && volume >= 100) return 'high'
    if (index <= 60 && volume >= 30) return 'medium'
    if (index > 80 && volume >= 100 && wc >= 3) return 'medium'
    if (index > 80 && volume >= 1000 && wc >= 2) return 'medium'
    return 'low'
  }

  return 'low'
}

function getBadgeKey(r: KeywordIdeaResult): BadgeKey {
  const vol = r.avgMonthlySearches ?? 0
  const cpc = r.highTopOfPageBid ?? 0
  if (r.competition === 'LOW' && vol >= 100) return 'lowCompetition'
  if (cpc >= 2 && vol >= 500) return 'commercial'
  if (vol >= 1000) return 'highVolume'
  return 'mediumPotential'
}

interface OpportunityBadgeInfo {
  key: OpportunityKey
  label: string
  colorClass: string
}

/** The SEO potential's pill, in the design tokens (its words come from the dictionary). */
function getOpportunityBadgeInfo(r: KeywordIdeaResult, labels: Record<OpportunityKey, string>): OpportunityBadgeInfo {
  const key = getSeoPotentialBadge(r)

  const colorClasses: Record<OpportunityKey, string> = {
    high: 'bg-ok-soft text-ok',
    medium: 'bg-warn-soft text-warn',
    low: 'bg-sunk text-muted',
  }

  return {
    key,
    label: labels[key],
    colorClass: colorClasses[key],
  }
}

/**
 * Google Ads' competition level in the screen's words and a token colour (UX review
 * P1-4): "בינונית", never "MEDIUM (55)". The 0–100 index is the cell's tooltip.
 */
const COMPETITION_TONE: Record<'LOW' | 'MEDIUM' | 'HIGH', string> = { LOW: 'text-ok', MEDIUM: 'text-warn', HIGH: 'text-bad' }
function competitionCell(
  r: Pick<KeywordIdeaResult, 'competition' | 'competitionIndex'>,
  levels: Record<'LOW' | 'MEDIUM' | 'HIGH', string>,
  indexLabel: (n: number) => string,
): { label: string; tone: string; title: string | undefined } {
  if (!r.competition) return { label: '—', tone: 'text-muted', title: undefined }
  return {
    label: levels[r.competition],
    tone: COMPETITION_TONE[r.competition],
    title: typeof r.competitionIndex === 'number' ? indexLabel(r.competitionIndex) : undefined,
  }
}

export default function KeywordResearchPage() {
  const { language } = useDashboardLanguage()
  const dict = getDashboardDictionary(language)
  const t = dict.keywordResearch
  const isRTL = language === 'he'

  const [researchType, setResearchType] = useState<'keyword' | 'url' | 'keyword_url'>('keyword')
  const [keyword, setKeyword] = useState('')
  const [country, setCountry] = useState('IL')
  const [selectedLanguage, setSelectedLanguage] = useState('he')
  const [url, setUrl] = useState('')
  const [minMonthlySearches, setMinMonthlySearches] = useState(30)
  const [resultsLimit, setResultsLimit] = useState<100 | 250>(100)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [results, setResults] = useState<KeywordIdeaResult[]>([])
  const [selectedKeywords, setSelectedKeywords] = useState<Set<string>>(new Set())
  const [fewResultsWarning, setFewResultsWarning] = useState(false)
  const [filteredOutWarning, setFilteredOutWarning] = useState(false)

  // Research needs no project. What it finds is added to the project the top bar
  // names, like every other screen's project; this page no longer picks its own.
  const { activeProjectId, projects, isResolved: projectsResolved } = useActiveProject()
  const { project: activeProject } = useProjectRow(activeProjectId)
  const selectedProject = activeProjectId ?? ''
  const projectsLoading = !projectsResolved
  const activeProjectName = projects.find((p) => p.id === activeProjectId)?.name ?? ''
  const projectOptions = useMemo(() => projects.map((p) => ({ id: p.id, name: p.name ?? '' })), [projects])
  // What the raw Search Console opportunity browser reports back when it is on (a
  // decision saved or undone, a topic created, or why not), and what tracking one
  // keyword of the scan's research came to: neither has another place on this
  // screen to say it.
  const gscToast = useToasts()
  const [engineType, setEngineType] = useState<'google_search' | 'google_maps'>('google_search')
  const [addingToProject, setAddingToProject] = useState(false)
  const [addToProjectMessage, setAddToProjectMessage] = useState('')
  const [addToProjectError, setAddToProjectError] = useState('')
  const [lastAddedProjectId, setLastAddedProjectId] = useState('')

  // Sorting state for results table. 'rank' keeps the order the active chip gives
  // ("suggested to track" is ranked by the easy-wins score).
  type SortKey = 'monthlySearches' | 'competition' | 'lowCpc' | 'highCpc' | 'opportunity' | 'rank'
  const [sortBy, setSortBy] = useState<SortKey>('monthlySearches')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  // Opportunities panel (closed by default to keep page lightweight)
  const [opportunitiesOpen, setOpportunitiesOpen] = useState(false)

  // AI Questions state
  const [aiQuestionsOpen, setAIQuestionsOpen] = useState(false)
  const [generatedAIQuestions, setGeneratedAIQuestions] = useState<GeneratedQuestion[]>([])
  const [generatingAIQuestions, setGeneratingAIQuestions] = useState(false)
  const [addingAIQuestions, setAddingAIQuestions] = useState(false)
  const [aiQuestionsMessage, setAIQuestionsMessage] = useState('')
  const [aiQuestionsError, setAIQuestionsError] = useState('')

  // Trend state
  interface TrendData {
    avgMonthlySearches: number | null
    monthlySearchVolumes: Array<{ month: string; year: number; searches: number }>
    trend: 'up' | 'down' | 'stable' | 'seasonal' | 'unknown'
    peakMonth: { month: string; year: number; searches: number } | null
    lowestMonth: { month: string; year: number; searches: number } | null
  }
  const [trendModalOpen, setTrendModalOpen] = useState(false)
  const [selectedTrendKeyword, setSelectedTrendKeyword] = useState('')
  const [trendLoading, setTrendLoading] = useState(false)
  const [trendError, setTrendError] = useState('')
  const [trendCache, setTrendCache] = useState<Map<string, TrendData>>(new Map())
  const [trendData, setTrendData] = useState<TrendData | undefined>()

  // ── The project's research (components/keyword-research, lib/keyword-research) ──
  // Every project opens on the same research screen (part B of the UX review): the
  // scan's research, the project's own when it has no scan, or the screen's empty
  // start (a keyword field, and the mapping when it can be offered). The older form
  // is one click away, never the screen (components/keyword-research/__qa__/legacy-screen.qa.ts).
  // Until the first answer is in (the project list, then the scan's two reads), the
  // screen is the research screen's skeleton, never today's form: a project WITH
  // research used to see that form, in the older look, until its research replaced
  // it. Opening the tab only reads: the scan's run and its cached research, never
  // Google Ads, Serper or a model.
  const ts = dict.keywordResearchScan
  const scan = useScanResearch(activeProjectId)
  const scanView = scan.view
  const scanOn = scanView.kind === 'none' || scanView.kind === 'loading' ? null : scanView
  const scanMode = scanOn !== null
  const firstAnswerPending = !projectsResolved || scanView.kind === 'loading'
  const scanKeywords = scanOn?.kind === 'seeded' ? scanOn.research.keywords : NO_SCAN_KEYWORDS
  const scanTracked = scanOn ? scanOn.tracked : NO_TRACKED
  const unseeded = scanView.kind === 'unseeded'
  // What the scan's summary says about the market (competitors, audiences, the site's icon); absent before the scan.
  const seedLandscape = scan.landscape ?? NO_LANDSCAPE
  // The mapping, offered on the empty start; its end reads the research again.
  const mapping = useMapping(activeProjectId, language, scan.retry)
  // A research the merchant runs from the form takes the screen until they go back to the scan's.
  const [manualActive, setManualActive] = useState(false)
  const [chip, setChip] = useState<ResearchChip>('all')
  const [shownRows, setShownRows] = useState(TABLE_PAGE)
  // null: the form folds by itself once there is research on screen; true/false: the merchant chose.
  const [formChoice, setFormChoice] = useState<boolean | null>(null)
  const [trackingKeys, setTrackingKeys] = useState<Set<string>>(new Set())
  // Search Console's keywords view, asked for only with the scan's research on screen
  // (or on its way). The empty start ('unseeded': no scan and no research of the
  // project's own) is one keyword field and the mapping, with no Search Console
  // source: there is no research for Google's keywords to join, and its count would
  // read 0 however many clicks Google reports.
  const gscSource = scanMode && !unseeded
  const trackedIdsKey = useMemo(() => scanTracked.map((k) => k.id).sort().join(','), [scanTracked])
  const gscKeywords = useGscKeywordFigures(gscSource ? activeProjectId : null, trackedIdsKey)
  const googleFigures = gscKeywords.data.state === 'ready' ? gscKeywords.data.data : null
  const model = useMemo(
    () => researchModel({
      scanKeywords,
      tracked: scanTracked,
      manual: results.length > 0 && (manualActive || scanKeywords.length === 0) ? results : null,
      google: googleFigures,
      chip,
    }),
    [scanKeywords, scanTracked, manualActive, results, googleFigures, chip],
  )
  // The table's rows: the active chip's, with the scan's research on screen; otherwise the results, as always.
  const tableSource: KeywordIdeaResult[] = scanMode && model.mode ? model.chipRows : results
  // With no research yet (the empty start), the start's own field runs the research: the form opens only when asked.
  const formOpen = !scanMode || (formChoice ?? (unseeded ? false : (!(model.mode || scanView.kind === 'pending') || loading || !!error)))
  const researchStartShown = unseeded && !model.mode && !formOpen
  // Where the research on screen came from, when the project's own research is part of it.
  const researchSources = scanOn?.kind === 'seeded' ? scanOn.research.sources : undefined
  const ownResearchDate = researchSources?.manualAt ? formatResearchDate(researchSources.manualAt, language) : null
  const sourceOverride = model.mode === 'scan' && researchSources && ownResearchDate
    ? (researchSources.scan ? dict.mapping.researchSourceBoth(ownResearchDate) : dict.mapping.researchSourceManual(ownResearchDate))
    : undefined

  // Parse multiple keywords from comma/semicolon/newline separated input
  const parseKeywords = (input: string): string[] => {
    const raw = input
      .split(/[,;\n]+/)
      .map((k) => k.trim())
      .filter((k) => k.length > 0)
    // Remove duplicates (case-insensitive)
    const seen = new Set<string>()
    const deduplicated: string[] = []
    for (const k of raw) {
      const lower = k.toLowerCase()
      if (!seen.has(lower)) {
        seen.add(lower)
        deduplicated.push(k)
      }
    }
    return deduplicated
  }

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setResults([])
    setSelectedKeywords(new Set())
    setFewResultsWarning(false)
    setFilteredOutWarning(false)
    // Starting a new search clears any previous add-to-project success state.
    setAddToProjectMessage('')
    setAddToProjectError('')
    setLastAddedProjectId('')

    // Validate by research type
    const trimmedUrl = url.trim()
    const parsedKeywords = parseKeywords(keyword)

    if (researchType === 'keyword' && parsedKeywords.length === 0) {
      setError(t.states.empty)
      return
    }
    if (researchType === 'url' && !trimmedUrl) {
      setError(t.form.errorInvalidUrl)
      return
    }
    if (researchType === 'keyword_url' && (parsedKeywords.length === 0 || !trimmedUrl)) {
      if (parsedKeywords.length === 0) {
        setError(t.states.empty)
      } else {
        setError(t.form.errorInvalidUrl)
      }
      return
    }

    // Check keyword limit
    if (parsedKeywords.length > 20) {
      setError(isRTL ? 'ניתן להזין עד 20 ביטויים בכל מחקר' : 'Maximum 20 keywords per research')
      return
    }

    setLoading(true)

    try {
      const response = await fetch('/api/google-ads/keyword-ideas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          researchType,
          // Send both for backward compatibility with partially deployed backends:
          // New backend uses keywords[]; old backend falls back to keyword string.
          keyword: parsedKeywords[0] ?? keyword.trim(),
          keywords: parsedKeywords,
          url: trimmedUrl,
          country,
          language: selectedLanguage,
          minMonthlySearches,
          resultsLimit,
        }),
      })

      const data = await response.json()

      if (!response.ok || data.success === false) {
        if (data.error === 'resource_exhausted') {
          setError(t.states.errorResourceExhausted)
        } else if (data.error === 'rate_limit_exceeded' || response.status === 429) {
          setError(t.states.errorQuota)
        } else if (data.errorCode === 'GOOGLE_ADS_REAUTH_REQUIRED') {
          // Refresh token expired or revoked — user needs to re-authenticate
          setError(isRTL ? 'חיבור Google Ads פג או בוטל. יש להתחבר מחדש לחשבון Google Ads.' : 'Google Ads connection expired. Please re-authenticate.')
        } else if (data.stage === 'env_check') {
          // Missing configuration (CLIENT_ID, CLIENT_SECRET, etc.)
          setError(t.states.errorEnv)
        } else if (data.stage === 'oauth') {
          // Other OAuth errors
          setError(isRTL ? 'שגיאת הרשאה ב-Google Ads. אנא נסה שוב או פנה לתמיכה.' : 'Google Ads authentication error. Please try again or contact support.')
        } else if (data.stage === 'validation' && data.error) {
          setError(`${t.states.errorGeneral} (${data.error})`)
        } else {
          setError(t.states.errorGeneral)
        }
        return
      }

      if (!data.results || data.results.length === 0) {
        setError(t.states.noResults)
        return
      }

      setResults(data.results)
      if (data.debug && typeof data.debug.rawResultsCount === 'number') {
        const raw = data.debug.rawResultsCount
        const normalized = typeof data.debug.normalizedResultsCount === 'number' ? data.debug.normalizedResultsCount : raw
        const filtered = typeof data.debug.filteredResultsCount === 'number' ? data.debug.filteredResultsCount : data.results.length
        if (raw <= 1) {
          setFewResultsWarning(true)
        } else if (normalized > filtered && minMonthlySearches > 0) {
          setFilteredOutWarning(true)
        }
      }
    } catch (err) {
      setError(t.states.errorGeneral)
      console.error('Keyword research error:', err)
    } finally {
      setLoading(false)
    }
  }

  // The form's submit. With the scan's research on screen, what the merchant runs
  // takes the screen (and the form folds again once it has results); the research
  // itself is handleSearch, unchanged.
  const submitResearch = (e: React.FormEvent) => {
    if (scanMode) {
      setManualActive(true)
      setChip('all')
      setSortBy((current) => (current === 'rank' ? 'monthlySearches' : current))
      setShownRows(TABLE_PAGE)
      setFormChoice(null)
    }
    return handleSearch(e)
  }

  const clearAddToProjectSuccess = () => {
    if (addToProjectMessage || lastAddedProjectId) {
      setAddToProjectMessage('')
      setLastAddedProjectId('')
    }
    if (addToProjectError) {
      setAddToProjectError('')
    }
  }

  const toggleKeyword = (kw: string) => {
    clearAddToProjectSuccess()
    setAIQuestionsError('')
    const newSelected = new Set(selectedKeywords)
    if (newSelected.has(kw)) {
      newSelected.delete(kw)
    } else {
      newSelected.add(kw)
    }
    setSelectedKeywords(newSelected)
  }

  const selectAll = () => {
    clearAddToProjectSuccess()
    setAIQuestionsError('')
    setSelectedKeywords(new Set(tableSource.map((r) => r.keyword)))
  }

  const deselectAll = () => {
    clearAddToProjectSuccess()
    setAIQuestionsError('')
    setSelectedKeywords(new Set())
  }

  const copySelected = () => {
    const keywords = Array.from(selectedKeywords).join('\n')
    navigator.clipboard.writeText(keywords).then(() => {
      alert('Copied to clipboard!')
    })
  }

  const copyKeyword = (kw: string) => {
    navigator.clipboard.writeText(kw)
  }

  const handleOpenTrendModal = async (kw: string) => {
    setSelectedTrendKeyword(kw)
    setTrendError('')
    setTrendLoading(true)
    setTrendModalOpen(true)

    const cacheKey = `${kw}-${country}-${selectedLanguage}`
    if (trendCache.has(cacheKey)) {
      setTrendData(trendCache.get(cacheKey))
      setTrendLoading(false)
      return
    }

    try {
      const response = await fetch('/api/google-ads/keyword-trends', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keyword: kw,
          country,
          language: selectedLanguage,
        }),
      })

      let data: {
        success?: boolean
        stage?: string
        error?: string
        errorCode?: string
        apiMessage?: string
        debug?: unknown
        avgMonthlySearches?: number | null
        monthlySearchVolumes?: Array<{ month: string; year: number; searches: number }>
        trend?: 'up' | 'down' | 'stable' | 'seasonal' | 'unknown'
        peakMonth?: { month: string; year: number; searches: number } | null
        lowestMonth?: { month: string; year: number; searches: number } | null
      } = {}
      try {
        data = await response.json()
      } catch {
        // Response body was not JSON.
      }

      if (!response.ok || !data.success) {
        if (process.env.NODE_ENV !== 'production') {
          console.error('[trend-modal] fetch failed', {
            httpStatus: response.status,
            stage: data.stage,
            error: data.error,
            errorCode: data.errorCode,
            apiMessage: data.apiMessage,
            debug: data.debug,
          })
        }
        if (data.errorCode === 'GOOGLE_ADS_REAUTH_REQUIRED') {
          setTrendError(isRTL ? 'חיבור Google Ads פג או בוטל. יש להתחבר מחדש.' : 'Google Ads connection expired. Please re-authenticate.')
        } else {
          setTrendError(data.error || 'Failed to fetch trend data')
        }
        setTrendData(undefined)
        return
      }

      const trendInfo: TrendData = {
        avgMonthlySearches: data.avgMonthlySearches ?? null,
        monthlySearchVolumes: data.monthlySearchVolumes ?? [],
        trend: data.trend ?? 'unknown',
        peakMonth: data.peakMonth ?? null,
        lowestMonth: data.lowestMonth ?? null,
      }

      setTrendData(trendInfo)
      const newCache = new Map(trendCache)
      newCache.set(cacheKey, trendInfo)
      setTrendCache(newCache)
    } catch (err) {
      if (process.env.NODE_ENV !== 'production') {
        console.error('[trend-modal] network/runtime error', err)
      }
      setTrendError('network_error')
      setTrendData(undefined)
    } finally {
      setTrendLoading(false)
    }
  }

  const handleAddToProject = async () => {
    if (!selectedProject) {
      setAddToProjectError(t.addToProject.errorSelectProject)
      return
    }

    if (selectedKeywords.size === 0) {
      setAddToProjectError(t.addToProject.errorSelectKeywords)
      return
    }

    setAddingToProject(true)
    setAddToProjectMessage('')
    setAddToProjectError('')
    setLastAddedProjectId('')

    try {
      // Include metrics from research result so they are stored on the new targets.
      const resultsByKeyword = new Map((scanMode ? [...model.rows, ...results] : results).map((r) => [r.keyword, r]))
      const keywordsArray = Array.from(selectedKeywords).map((kw) => {
        const r = resultsByKeyword.get(kw)
        return {
          keyword: kw,
          avgMonthlySearches: r?.avgMonthlySearches ?? null,
          competition: r?.competition ?? null,
          competitionIndex: r?.competitionIndex ?? null,
          lowTopOfPageBid: r?.lowTopOfPageBid ?? null,
          highTopOfPageBid: r?.highTopOfPageBid ?? null,
          currency: r?.currency ?? null,
        }
      })
      const projectIdUsed = selectedProject
      const response = await fetch('/api/keyword-research/add-to-project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: projectIdUsed,
          engineType,
          keywords: keywordsArray,
          language: selectedLanguage,
        }),
      })

      const result = await response.json()

      if (!response.ok || !result.success) {
        if (response.status === 402) {
          setAddToProjectError(t.addToProject.errorQuota)
        } else if (scanMode) {
          // With the scan's research on screen, our own words only, never the route's text.
          setAddToProjectError(response.status === 503 ? ts.add.unavailable : t.addToProject.errorGeneral)
        } else {
          setAddToProjectError(result.message || t.addToProject.errorGeneral)
        }
        return
      }

      setAddToProjectMessage(t.addToProject.success(result.added || 0, result.skipped || 0))
      setLastAddedProjectId(projectIdUsed)
      // "Already tracked", the suggestions and Google's figures follow the keywords just added.
      if (scanMode) scan.reloadTracked()
      // Keep selection visible after success so the user can see what they added
      // and the "Go to project" button. The success state is cleared the next time
      // the user searches, toggles a checkbox, or dismisses the message manually.
    } catch (err) {
      setAddToProjectError(t.addToProject.errorGeneral)
      console.error('Error adding keywords to project:', err)
    } finally {
      setAddingToProject(false)
    }
  }

  const handleGenerateAIQuestions = async () => {
    if (!selectedProject) {
      setAIQuestionsError(t.addToProject.errorSelectProject)
      return
    }

    if (selectedKeywords.size === 0) {
      setAIQuestionsError(t.addToProject.errorSelectKeywords)
      return
    }

    // Only allow exactly one keyword for generation
    if (selectedKeywords.size > 1) {
      setAIQuestionsError(
        language === 'he'
          ? 'בחרו ביטוי אחד בלבד ליצירת שאלות AI.'
          : 'Select exactly one keyword to generate AI questions.'
      )
      return
    }

    const keyword = Array.from(selectedKeywords)[0]
    const project = activeProject

    if (!project) {
      setAIQuestionsError(t.addToProject.errorSelectProject)
      return
    }

    setGeneratingAIQuestions(true)
    setAIQuestionsError('')
    setAIQuestionsMessage('')

    try {
      const response = await fetch('/api/keyword-research/generate-ai-questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keyword,
          projectId: selectedProject,
          projectBusinessName: project.business_name,
          projectTargetDomain: project.target_domain,
          language: language as 'he' | 'en',
          country: country || undefined,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        setAIQuestionsError(
          errorData.message ||
          (language === 'he'
            ? 'שגיאה בהפקת שאלות AI'
            : 'Error generating AI questions')
        )
        return
      }

      const result = await response.json()

      if (!result.questions || result.questions.length === 0) {
        const emptyMessage = result.message || (language === 'he'
          ? 'לא נמצאו שאלות AI איכותיות לביטוי זה. נסו ביטוי אחר.'
          : 'No high-quality AI questions found for this keyword. Try a different keyword.')
        setAIQuestionsError(emptyMessage)
        return
      }

      setGeneratedAIQuestions(result.questions)
      setAIQuestionsOpen(true)
      setAIQuestionsError('')
      setAIQuestionsMessage('')
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      console.error('Error generating AI questions:', errorMsg)
      setAIQuestionsError(
        language === 'he'
          ? 'שגיאה בהפקת שאלות AI. נסו שוב.'
          : 'Error generating AI questions. Please try again.'
      )
    } finally {
      setGeneratingAIQuestions(false)
    }
  }

  const handleAddAIQuestions = async (questions: GeneratedQuestion[]) => {
    if (!selectedProject || questions.length === 0) {
      return
    }

    setAddingAIQuestions(true)
    setAIQuestionsError('')
    setAIQuestionsMessage('')

    try {
      let added = 0
      let skipped = 0

      for (const question of questions) {
        const response = await fetch('/api/ai-visibility/prompts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectId: selectedProject,
            prompt: question.question,
            targetDomain: null,
            targetBrandName: null,
            country: country || null,
            language: language || null,
          }),
        })

        const result = await response.json()

        if (response.ok && result.prompt) {
          if (result.duplicate) {
            skipped++
          } else {
            added++
          }
        } else {
          console.error('Error adding question:', result.error)
        }
      }

      if (added > 0) {
        const msgKey = language === 'he'
          ? `נוספו ${added} שאלות AI לפרויקט${skipped > 0 ? `. ${skipped} שאלות כבר היו קיימות ודולגו.` : '.'}`
          : `${added} AI questions were added to the project${skipped > 0 ? `. ${skipped} existing questions were skipped.` : '.'}`
        setAIQuestionsMessage(msgKey)
        setGeneratedAIQuestions([])
        setTimeout(() => setAIQuestionsOpen(false), 1500)
      } else if (skipped > 0) {
        const msgKey = language === 'he'
          ? `${skipped} שאלות כבר היו קיימות ודולגו.`
          : `${skipped} questions already existed and were skipped.`
        setAIQuestionsMessage(msgKey)
        setTimeout(() => setAIQuestionsOpen(false), 1500)
      }
    } catch (err) {
      const errMsg = language === 'he' ? 'שגיאה בהוספת השאלות' : 'Error adding questions'
      setAIQuestionsError(errMsg)
      console.error('Error adding AI questions:', err)
    } finally {
      setAddingAIQuestions(false)
    }
  }

  const handleSort = (key: SortKey) => {
    if (sortBy === key) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortBy(key)
    setSortDir('desc')
  }

  const sortedResults = useMemo(() => {
    if (tableSource.length === 0) return tableSource
    const competitionRank: Record<string, number> = { LOW: 1, MEDIUM: 2, HIGH: 3 }
    const opportunityRank: Record<OpportunityKey, number> = { low: 1, medium: 2, high: 3 }
    const copy = [...tableSource]
    const dir = sortDir === 'asc' ? 1 : -1
    copy.sort((a, b) => {
      if (sortBy === 'opportunity') {
        const aRank = opportunityRank[getSeoPotentialBadge(a)]
        const bRank = opportunityRank[getSeoPotentialBadge(b)]
        if (aRank !== bRank) return (aRank - bRank) * dir
        const aVol = a.avgMonthlySearches ?? -1
        const bVol = b.avgMonthlySearches ?? -1
        if (aVol === bVol) return 0
        return (aVol - bVol) * dir
      }

      let aVal: number
      let bVal: number
      switch (sortBy) {
        case 'monthlySearches':
          aVal = a.avgMonthlySearches ?? -1
          bVal = b.avgMonthlySearches ?? -1
          break
        case 'lowCpc':
          aVal = a.lowTopOfPageBid ?? -1
          bVal = b.lowTopOfPageBid ?? -1
          break
        case 'highCpc':
          aVal = a.highTopOfPageBid ?? -1
          bVal = b.highTopOfPageBid ?? -1
          break
        case 'competition':
          aVal = a.competition ? competitionRank[a.competition] : -1
          bVal = b.competition ? competitionRank[b.competition] : -1
          break
        default:
          return 0
      }
      if (aVal === bVal) return 0
      return (aVal - bVal) * dir
    })
    return copy
  }, [tableSource, sortBy, sortDir])

  const sortIndicator = (key: SortKey) => {
    if (sortBy !== key) return ' ↕'
    return sortDir === 'asc' ? ' ▲' : ' ▼'
  }

  // Top opportunities computed from existing results — no extra API calls.
  const topOpportunities = useMemo(() => {
    if (results.length === 0) return []
    const opportunityRank: Record<OpportunityKey, number> = { low: 1, medium: 2, high: 3 }
    return results
      .map((r) => ({ ...r, badge: getSeoPotentialBadge(r) }))
      .filter((r) => r.badge !== 'low')
      .sort((a, b) => {
        const rankDiff = opportunityRank[b.badge] - opportunityRank[a.badge]
        if (rankDiff !== 0) return rankDiff
        return (b.avgMonthlySearches ?? 0) - (a.avgMonthlySearches ?? 0)
      })
      .slice(0, 5)
  }, [results])

  const selectKeywordFromOpportunity = (kw: string) => {
    if (selectedKeywords.has(kw)) return
    const next = new Set(selectedKeywords)
    next.add(kw)
    setSelectedKeywords(next)
    clearAddToProjectSuccess()
  }

  // ── With the scan's research on screen: chips, pages of rows, one-click tracking ──
  const tableVisible = scanMode ? model.mode !== null : results.length > 0

  const chooseChip = (next: ResearchChip) => {
    setChip(next)
    setShownRows(TABLE_PAGE)
    setSortBy((current) => (next === 'suggested' ? 'rank' : current === 'rank' ? 'monthlySearches' : current))
  }

  const showSuggestions = () => {
    chooseChip('suggested')
    document.getElementById('research-table')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const backToScan = () => {
    setManualActive(false)
    setChip('all')
    setSortBy((current) => (current === 'rank' ? 'monthlySearches' : current))
    setShownRows(TABLE_PAGE)
    setSelectedKeywords(new Set())
    clearAddToProjectSuccess()
  }

  const fillSeedKeywords = () => {
    if (!scanOn || scanOn.seedKeywords.length === 0) return
    setResearchType('keyword')
    setKeyword(scanOn.seedKeywords.join(', '))
    setFormChoice(true)
  }

  // One keyword, one click: the same action and quota check as the add section, for
  // the project the top bar names. What it came to is said in our own words only.
  const trackKeyword = async (row: ResearchRow) => {
    const key = keywordKey(row.keyword)
    if (!selectedProject || trackingKeys.has(key)) return
    setTrackingKeys((prev) => new Set(prev).add(key))
    try {
      const response = await fetch('/api/keyword-research/add-to-project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: selectedProject,
          engineType,
          language,
          keywords: [{
            keyword: row.keyword,
            avgMonthlySearches: row.avgMonthlySearches,
            competition: row.competition,
            competitionIndex: row.competitionIndex,
            lowTopOfPageBid: row.lowTopOfPageBid,
            highTopOfPageBid: row.highTopOfPageBid,
            currency: row.currency || null,
          }],
        }),
      })
      const result = await response.json().catch(() => null)
      if (response.ok && result?.success) {
        gscToast.success(result.added > 0 ? ts.add.added(row.keyword) : ts.add.skipped(row.keyword))
        scan.reloadTracked()
      } else {
        gscToast.error(response.status === 402 ? t.addToProject.errorQuota : response.status === 503 ? ts.add.unavailable : ts.add.errorGeneral)
      }
    } catch {
      gscToast.error(ts.add.errorGeneral)
    } finally {
      setTrackingKeys((prev) => {
        const next = new Set(prev)
        next.delete(key)
        return next
      })
    }
  }

  const sourceLineFor = (kw: string) => {
    const row = model.byKey.get(keywordKey(kw))
    return row ? <KeywordSourceLine row={row} /> : null
  }

  const gscState = gscSource ? gscKeywords.data.state : 'disabled'
  const googleChip = gscState === 'disabled' ? 'hidden' : gscState === 'loading' ? 'loading' : 'counted'
  const gscNotice = gscSource ? (
    <ScanGscNotice projectId={activeProjectId} data={gscKeywords.data} count={model.counts.google} retry={gscKeywords.retry} />
  ) : null

  // The research's own site, named with its icon under the title, once the scan's research is on screen.
  const ownDomain = scanMode && model.mode === 'scan' ? (scanOn?.domain ?? seedLandscape.domain) : null
  const ti = dict.researchInsights
  const siteChip = ownDomain ? (
    <span data-research-site="" className="inline-flex max-w-full items-center gap-2 rounded-pill border border-line bg-surface py-1 pe-3 ps-1 shadow-control">
      <SiteAvatar domain={ownDomain} icon={seedLandscape.siteIcon} size="sm" />
      <span dir="ltr" className="truncate text-caption font-semibold text-ink">{ownDomain}</span>
      {seedLandscape.niche && <span className="hidden truncate border-s border-line ps-2 text-caption text-muted sm:inline">{seedLandscape.niche}</span>}
    </span>
  ) : undefined
  const header = <Header title={t.title} subtitle={t.subtitle}>{siteChip}</Header>
  const landscapeOn = scanMode && model.mode === 'scan' && scanOn?.kind === 'seeded' && !!activeProjectId

  // Nothing is known yet about which screen this is: its skeleton, not today's form.
  if (firstAnswerPending) {
    return (
      <div className={`max-w-6xl mx-auto ${isRTL ? 'rtl' : 'ltr'}`}>
        {header}
        <ScanLoadingSkeleton />
      </div>
    )
  }

  return (
    <div className={`max-w-6xl mx-auto ${isRTL ? 'rtl' : 'ltr'}`}>
      {/* Header */}
      {header}

      {/* The seeding scan's research opens the screen, before the form. */}
      {scanOn?.kind === 'pending' && <ScanPendingCard />}
      {scanOn?.kind === 'running' && <ScanRunningCard seedKeywords={scanOn.seedKeywords} steps={scanOn.steps} />}
      {scanOn?.kind === 'empty' && model.mode !== 'manual' && (
        <ScanEmptyCard reason={scanOn.reason} seedKeywords={scanOn.seedKeywords} onRetry={scan.retry} onUseSeeds={fillSeedKeywords} />
      )}
      {scanMode && model.mode && (
        <div id="research-overview" className="scroll-mt-20">
        <ScanOverview
          totals={model.totals}
          easyWins={model.wins.length}
          mode={model.mode}
          domain={scanOn?.domain ?? null}
          fetchedAt={scanOn?.kind === 'seeded' ? scanOn.research.fetchedAt : null}
          running={model.mode === 'scan' && scanOn?.kind === 'seeded' && scanOn.running}
          truncated={model.mode === 'scan' && scanOn?.kind === 'seeded' && scanOn.research.truncated}
          onBackToScan={model.mode === 'manual' && scanKeywords.length > 0 ? backToScan : undefined}
          sourceOverride={sourceOverride}
        />
        </div>
      )}
      {landscapeOn && (
        <SectionNav
          label={ti.nav.label}
          sections={[
            { id: 'research-overview', label: ti.nav.overview },
            { id: 'research-wins', label: ti.nav.wins },
            { id: LANDSCAPE_IDS.rivals, label: ti.nav.rivals },
            { id: LANDSCAPE_IDS.audiences, label: ti.nav.audiences },
            { id: 'research-table', label: ti.nav.keywords },
          ]}
        />
      )}
      {researchStartShown && (
        <ResearchStart
          locale={language}
          keyword={keyword}
          onKeyword={(value) => { setResearchType('keyword'); setKeyword(value) }}
          onSubmit={submitResearch}
          loading={loading}
          onAdvanced={() => setFormChoice(true)}
          mapping={mapping}
        />
      )}

      {/* Form */}
      {scanMode && !formOpen && !researchStartShown && <ResearchFormBar onOpen={() => setFormChoice(true)} />}
      {scanMode && formOpen && (model.mode || unseeded) && <ResearchFormClose onClose={() => setFormChoice(false)} />}
      <div hidden={scanMode && !formOpen ? true : undefined} className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 p-6 mb-8">
        <form onSubmit={submitResearch} className="space-y-4">
          {/* Research type */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              {t.form.researchType}
            </label>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  { value: 'keyword', label: t.form.researchTypeKeyword },
                  { value: 'url', label: t.form.researchTypeUrl },
                  { value: 'keyword_url', label: t.form.researchTypeKeywordUrl },
                ] as const
              ).map((opt) => (
                <label
                  key={opt.value}
                  className={`px-3 py-2 rounded-lg border cursor-pointer text-sm transition-colors ${
                    researchType === opt.value
                      ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-400'
                      : 'border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  <input
                    type="radio"
                    name="researchType"
                    value={opt.value}
                    checked={researchType === opt.value}
                    onChange={() => setResearchType(opt.value)}
                    className="sr-only"
                    disabled={loading}
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Keyword — shown when keyword or keyword_url */}
            {(researchType === 'keyword' || researchType === 'keyword_url') && (
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  {t.form.keyword} *
                </label>
                <input
                  type="text"
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  placeholder={t.form.keywordPlaceholder}
                  className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
                  disabled={loading}
                />
              </div>
            )}

            {/* URL — shown when url or keyword_url */}
            {(researchType === 'url' || researchType === 'keyword_url') && (
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  {t.form.url} *
                </label>
                <input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder={t.form.urlPlaceholder}
                  className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
                  disabled={loading}
                />
              </div>
            )}

            {/* Country */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                {t.form.country}
              </label>
              <select
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
                disabled={loading}
              >
                {SUPPORTED_COUNTRIES.map((cc) => (
                  <option key={cc} value={cc}>
                    {t.countries[cc as keyof typeof t.countries]}
                  </option>
                ))}
              </select>
            </div>

            {/* Language */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                {t.form.language}
              </label>
              <select
                value={selectedLanguage}
                onChange={(e) => setSelectedLanguage(e.target.value)}
                className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
                disabled={loading}
              >
                {SUPPORTED_LANGUAGES.map((lang) => (
                  <option key={lang} value={lang}>
                    {t.languages[lang as keyof typeof t.languages]}
                  </option>
                ))}
              </select>
            </div>

            {/* Minimum Monthly Searches */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                {t.form.minMonthlySearches}
              </label>
              <input
                type="number"
                value={minMonthlySearches}
                onChange={(e) => setMinMonthlySearches(Math.max(0, parseInt(e.target.value) || 0))}
                min="0"
                className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
                disabled={loading}
              />
            </div>

            {/* Results Limit */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                {t.form.resultsToShow}
              </label>
              <select
                value={resultsLimit}
                onChange={(e) => {
                  const v = Number(e.target.value)
                  if (v === 100 || v === 250) {
                    setResultsLimit(v)
                  }
                }}
                className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
                disabled={loading}
              >
                <option value={100}>100</option>
                <option value={250}>250</option>
              </select>
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={
              loading ||
              (researchType === 'keyword' && !keyword.trim()) ||
              (researchType === 'url' && !url.trim()) ||
              (researchType === 'keyword_url' && (!keyword.trim() || !url.trim()))
            }
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 dark:disabled:bg-slate-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            {loading && <Loader2 size={18} className="animate-spin" />}
            {loading ? t.form.searching : t.form.search}
          </button>
        </form>
      </div>

      {/* Error State */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-8">
          <p className="text-red-800 dark:text-red-300">{error}</p>
        </div>
      )}

      {/* Few Results Warning */}
      {fewResultsWarning && results.length > 0 && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4 mb-4">
          <p className="text-amber-800 dark:text-amber-300 text-sm">{t.states.fewResults}</p>
        </div>
      )}

      {/* Filtered Out Warning */}
      {filteredOutWarning && !fewResultsWarning && results.length > 0 && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-4">
          <p className="text-blue-800 dark:text-blue-300 text-sm">{t.states.filteredOut}</p>
        </div>
      )}

      {/* Easy battles to win: the best keywords of the research on screen. */}
      {scanMode && model.mode && (
        <div id="research-wins" className="scroll-mt-20">
        <EasyWins
          wins={model.wins.slice(0, EASY_WINS_SHOWN)}
          total={model.wins.length}
          adding={trackingKeys}
          onTrack={trackKeyword}
          onShowAll={model.mode === 'scan' ? showSuggestions : undefined}
        />
        </div>
      )}

      {/* Who the site competes with, and who searches for it (only with the scan's research on screen). */}
      {landscapeOn && scanOn?.kind === 'seeded' && activeProjectId && (
        <ResearchLandscape projectId={activeProjectId} keywords={scanOn.research.keywords} seed={seedLandscape} domain={ownDomain} />
      )}

      {/* Search Console's source, where there is no table for it to sit in. */}
      {scanMode && !tableVisible && <div className="mb-6">{gscNotice}</div>}

      {/* Results */}
      {tableVisible && (
        <div id={scanMode ? 'research-table' : undefined} className={`rounded-card border border-line bg-surface p-6 shadow-card${scanMode ? ' scroll-mt-20' : ''}`}>
          {/* The chips of the scan's research, and Search Console's source under them. */}
          {scanMode && (
            <div className="mb-4 space-y-3 scroll-mt-4">
              <ResearchChips counts={model.counts} active={chip} onChange={chooseChip} google={googleChip} />
              {gscNotice}
            </div>
          )}
          {/* Results Toolbar */}
          <div className={`flex flex-col sm:flex-row gap-2 mb-4 justify-between items-start sm:items-center`}>
            <div className={`text-sm font-medium text-body`}>
              {t.results.resultsCount}: <span className="font-bold text-ink">{tableSource.length}</span>
            </div>
            <div className="flex gap-2 flex-wrap">
              {!scanMode && topOpportunities.length > 0 && (
                <button
                  onClick={() => setOpportunitiesOpen((v) => !v)}
                  className="text-xs px-3 py-1 rounded border border-warn/40 bg-warn-soft text-warn hover:border-warn/70 transition-colors flex items-center gap-1"
                  aria-expanded={opportunitiesOpen}
                >
                  <Sparkles size={14} />
                  {opportunitiesOpen ? t.opportunities.hide : t.opportunities.show}
                </button>
              )}
              <button
                onClick={selectAll}
                className="text-xs px-3 py-1 rounded-control border border-line text-body hover:bg-sunk transition-colors"
              >
                {t.results.selectAll}
              </button>
              <button
                onClick={deselectAll}
                className="text-xs px-3 py-1 rounded-control border border-line text-body hover:bg-sunk transition-colors"
              >
                {t.results.deselectAll}
              </button>
              {selectedKeywords.size > 0 && (
                <>
                  <button
                    onClick={copySelected}
                    className="text-xs px-3 py-1 rounded-control bg-action text-action-ink hover:bg-action-hover transition-colors flex items-center gap-1"
                  >
                    <Copy size={14} />
                    {t.results.copySelected}
                  </button>
                  <button
                    onClick={handleGenerateAIQuestions}
                    disabled={!activeProject || generatingAIQuestions}
                    className="text-xs px-3 py-1 rounded-control border border-action text-action hover:bg-action-soft disabled:opacity-50 transition-colors flex items-center gap-1"
                    title={!selectedProject ? t.addToProject.errorSelectProject : ''}
                  >
                    {generatingAIQuestions ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Sparkles size={14} />
                    )}
                    {language === 'he' ? 'יצירת שאלות AI' : 'Create AI questions'}
                  </button>
                </>
              )}
            </div>
          </div>

          {/* AI Questions feedback — mismatch / empty state (neutral info, not error) */}
          {aiQuestionsError && (
            <div className={`flex items-start justify-between gap-3 mb-4 p-3 bg-sunk border border-line rounded-control text-sm text-body ${isRTL ? 'flex-row-reverse text-right' : 'text-left'}`}>
              <span>{aiQuestionsError}</span>
              <button
                type="button"
                onClick={() => setAIQuestionsError('')}
                className="shrink-0 text-muted hover:text-ink"
                aria-label={language === 'he' ? 'סגירה' : 'Dismiss'}
              >
                ✕
              </button>
            </div>
          )}

          {/* Add to Project Section — visible whenever at least one keyword is selected,
              OR a success/error message is still showing from the last action. */}
          {(selectedKeywords.size > 0 || addToProjectMessage || addToProjectError) && (
            <div className="mb-6 p-4 bg-action-soft rounded-card border border-action/30">
              <div className={`mb-3 font-semibold text-ink flex items-center justify-between gap-3 ${isRTL ? 'flex-row-reverse text-right' : 'text-left'}`}>
                <span>
                  {t.addToProject.sectionTitle} ({selectedKeywords.size})
                </span>
                {(addToProjectMessage || addToProjectError) && (
                  <button
                    type="button"
                    onClick={() => {
                      setAddToProjectMessage('')
                      setAddToProjectError('')
                      setLastAddedProjectId('')
                    }}
                    className="text-xs font-normal text-muted hover:text-ink underline"
                  >
                    {language === 'he' ? 'סגירה' : 'Dismiss'}
                  </button>
                )}
              </div>

              {selectedKeywords.size > 0 && projects.length === 0 && !projectsLoading && (
                <div className="text-sm text-body p-3 bg-surface rounded-control">
                  {t.addToProject.noProjects}
                </div>
              )}

              {selectedKeywords.size > 0 && projectsLoading && (
                <div className="text-sm text-muted flex items-center gap-2">
                  <Loader2 size={14} className="animate-spin" />
                  {t.addToProject.projectsLoading}
                </div>
              )}

              {selectedKeywords.size > 0 && projects.length > 0 && !projectsLoading && (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                    <div>
                      {/* The project is the one the top bar names; switching it
                          there changes where these keywords go. */}
                      <span className={`block text-sm font-medium text-body mb-2 ${isRTL ? 'text-right' : 'text-left'}`}>
                        {t.addToProject.projectLabel}
                      </span>
                      <p className="w-full truncate px-4 py-2 rounded-lg border border-line bg-sunk text-ink">
                        {activeProjectName}
                      </p>
                    </div>

                    <div>
                      <label className={`block text-sm font-medium text-body mb-2 ${isRTL ? 'text-right' : 'text-left'}`}>
                        {t.addToProject.engineLabel}
                      </label>
                      <select
                        value={engineType}
                        onChange={(e) => setEngineType(e.target.value as 'google_search' | 'google_maps')}
                        className="w-full px-4 py-2 rounded-lg border border-line bg-surface text-ink focus:outline-none focus:ring-2 focus:ring-action"
                        disabled={addingToProject}
                      >
                        <option value="google_search">{t.addToProject.engineGoogleOrganic}</option>
                        <option value="google_maps">{t.addToProject.engineGoogleMaps}</option>
                      </select>
                    </div>

                    <div className="flex items-end">
                      <button
                        onClick={handleAddToProject}
                        disabled={!selectedProject || addingToProject}
                        className="w-full bg-action hover:bg-action-hover disabled:bg-sunk disabled:text-muted text-action-ink font-semibold py-2 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
                      >
                        {addingToProject && <Loader2 size={18} className="animate-spin" />}
                        {addingToProject
                          ? language === 'he'
                            ? 'מוסיף ביטויים לפרויקט...'
                            : 'Adding keywords to project...'
                          : t.addToProject.addButton}
                      </button>
                    </div>
                  </div>
                </>
              )}

              {addToProjectError && (
                <div className={`text-sm text-bad mb-2 ${isRTL ? 'text-right' : 'text-left'}`}>
                  {addToProjectError}
                </div>
              )}
              {addToProjectMessage && (
                <div className={`flex flex-col sm:flex-row sm:items-center gap-3 ${isRTL ? 'sm:flex-row-reverse' : ''}`}>
                  <div className={`text-sm text-ok flex items-center gap-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
                    <CheckCircle size={16} />
                    <span>{addToProjectMessage}</span>
                  </div>
                  {lastAddedProjectId && (
                    <Link
                      href={`/keywords?projectId=${encodeURIComponent(lastAddedProjectId)}`}
                      className="inline-flex items-center justify-center bg-action hover:bg-action-hover text-action-ink font-semibold py-2 px-4 rounded-lg transition-colors text-sm"
                    >
                      {t.addToProject.goToProject}
                    </Link>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Opportunities Panel — opt-in, compact, no extra API calls */}
          {!scanMode && opportunitiesOpen && topOpportunities.length > 0 && (
            <div className="mb-4 p-3 bg-warn-soft border border-warn/25 rounded-control">
              <div className={`mb-2 ${isRTL ? 'text-right' : 'text-left'}`}>
                <h3 className="text-sm font-semibold text-ink">
                  {t.opportunities.title}
                </h3>
                <p className="text-xs text-muted">
                  {t.opportunities.subtitle}
                </p>
              </div>
              <ul className="divide-y divide-warn/15">
                {topOpportunities.map((r, i) => {
                  const isSelected = selectedKeywords.has(r.keyword)
                  const badge = t.opportunities.badges[getBadgeKey(r)]
                  return (
                    <li
                      key={r.keyword}
                      className={`flex items-center flex-wrap gap-x-3 gap-y-1 py-1.5 text-xs ${isRTL ? 'flex-row-reverse text-right' : ''}`}
                    >
                      <span className="text-muted font-mono w-5 shrink-0">
                        {i + 1}.
                      </span>
                      <span className="font-medium text-ink truncate min-w-0 flex-1">
                        {r.keyword}
                      </span>
                      <span className="text-muted whitespace-nowrap">
                        {r.avgMonthlySearches?.toLocaleString() ?? '—'} {t.opportunities.searches}
                      </span>
                      {(() => {
                        const c = competitionCell(r, t.results.competitionLevel, t.results.competitionIndex)
                        return <span className={`whitespace-nowrap ${c.tone}`} title={c.title}>{c.label}</span>
                      })()}
                      {r.highTopOfPageBid !== null && r.highTopOfPageBid !== undefined && (
                        <span className="text-muted whitespace-nowrap">
                          CPC {formatMoney(r.highTopOfPageBid, r.currency, language)}
                        </span>
                      )}
                      <span className="px-2 py-0.5 rounded-full bg-warn-soft text-warn ring-1 ring-warn/25 whitespace-nowrap text-[10px] font-medium">
                        {badge}
                      </span>
                      <button
                        type="button"
                        onClick={() => selectKeywordFromOpportunity(r.keyword)}
                        disabled={isSelected}
                        className="px-2 py-0.5 rounded bg-action hover:bg-action-hover disabled:bg-sunk disabled:text-muted text-action-ink text-[11px] font-medium transition-colors whitespace-nowrap"
                      >
                        {isSelected ? t.opportunities.selected : t.opportunities.select}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}

          {/* Results Table — in the design tokens, with the difficulty in words, one
              money format (the hero's), and a name on every checkbox (UX review P1-4). */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line">
                  <th className="px-4 py-3 text-start font-semibold text-ink w-6">
                    <input
                      type="checkbox"
                      checked={selectedKeywords.size === tableSource.length && tableSource.length > 0}
                      onChange={(e) => (e.target.checked ? selectAll() : deselectAll())}
                      aria-label={t.results.selectAllRows}
                      className="rounded accent-action"
                    />
                  </th>
                  <th className="px-4 py-3 text-start font-semibold text-ink">
                    {t.results.keyword}
                  </th>
                  {([
                    ['monthlySearches', t.results.monthlySearches, ''],
                    ['opportunity', t.results.opportunity, 'hidden sm:table-cell'],
                    ['competition', t.results.competition, ''],
                    ['lowCpc', t.results.lowCpc, ''],
                    ['highCpc', t.results.highCpc, ''],
                  ] as const).map(([key, label, cls]) => (
                    <th key={key} className={`px-4 py-3 text-start font-semibold text-ink ${cls}`} aria-sort={sortBy === key ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined}>
                      <button
                        type="button"
                        onClick={() => handleSort(key)}
                        title={key === 'opportunity' ? t.results.opportunityTooltip : undefined}
                        className={`inline-flex items-center gap-1 whitespace-nowrap transition-colors hover:text-action ${sortBy === key ? 'text-action' : ''}`}
                      >
                        {label}
                        <span className="text-xs">{sortIndicator(key)}</span>
                      </button>
                    </th>
                  ))}
                  <th className="px-4 py-3 text-start font-semibold text-ink">
                    {t.results.action}
                  </th>
                </tr>
              </thead>
              <tbody>
                {(scanMode ? sortedResults.slice(0, shownRows) : sortedResults).map((result, idx) => {
                  const badge = getOpportunityBadgeInfo(result, t.results.potentialLevel)
                  const competition = competitionCell(result, t.results.competitionLevel, t.results.competitionIndex)
                  return (
                  <tr key={idx} className="border-b border-line transition-colors hover:bg-sunk/50">
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selectedKeywords.has(result.keyword)}
                        onChange={() => toggleKeyword(result.keyword)}
                        aria-label={t.results.selectKeyword(result.keyword)}
                        className="rounded accent-action"
                      />
                    </td>
                    <td className="px-4 py-3 text-start text-ink">
                      {result.keyword}
                      {scanMode && sourceLineFor(result.keyword)}
                    </td>
                    <td className="px-4 py-3 text-start tabular-nums text-body">
                      {result.avgMonthlySearches !== null && result.avgMonthlySearches !== undefined ? formatCount(result.avgMonthlySearches, language) : '—'}
                    </td>
                    <td className="px-4 py-3 text-start hidden sm:table-cell">
                      <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium whitespace-nowrap ${badge.colorClass}`}>
                        {badge.label}
                      </span>
                    </td>
                    <td className={`px-4 py-3 text-start whitespace-nowrap font-medium ${competition.tone}`} title={competition.title}>
                      {competition.label}
                    </td>
                    <td className="px-4 py-3 text-start tabular-nums whitespace-nowrap text-body">
                      {result.lowTopOfPageBid ? formatMoney(result.lowTopOfPageBid, result.currency, language) : '—'}
                    </td>
                    <td className="px-4 py-3 text-start tabular-nums whitespace-nowrap text-body">
                      {result.highTopOfPageBid ? formatMoney(result.highTopOfPageBid, result.currency, language) : '—'}
                    </td>
                    <td className="px-4 py-3 text-start">
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => copyKeyword(result.keyword)}
                          className="flex items-center gap-1 text-action transition-colors hover:text-action-hover"
                        >
                          <Copy size={16} aria-hidden="true" />
                          <span className="text-xs">{t.results.copy}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenTrendModal(result.keyword)}
                          className="flex items-center gap-1 text-action transition-colors hover:text-action-hover"
                        >
                          <TrendingUp size={16} aria-hidden="true" />
                          <span className="text-xs">{t.trend.button}</span>
                        </button>
                        {/* One click to track this keyword: the same request and quota check as "easy wins". */}
                        {scanMode && ((result as ResearchRow).tracked ? (
                          <span data-row-tracked="" className="inline-flex h-7 items-center gap-1 rounded-pill border border-ok/20 bg-ok-soft px-2.5 text-xs font-semibold text-ok">
                            <Check size={12} strokeWidth={3} aria-hidden="true" />{ti.tracked}
                          </span>
                        ) : (
                          <button
                            type="button"
                            data-row-track=""
                            onClick={() => trackKeyword(result as ResearchRow)}
                            disabled={trackingKeys.has(keywordKey(result.keyword))}
                            aria-label={ti.trackAria(result.keyword)}
                            className="inline-flex h-7 items-center gap-1 rounded-pill border border-line bg-surface px-2.5 text-xs font-semibold text-ink transition-colors hover:border-action/40 hover:bg-action-soft hover:text-action disabled:opacity-60"
                          >
                            {trackingKeys.has(keywordKey(result.keyword)) ? <Loader2 size={12} className="animate-spin" aria-hidden="true" /> : <Plus size={12} strokeWidth={2.5} aria-hidden="true" />}
                            {trackingKeys.has(keywordKey(result.keyword)) ? ti.tracking : ti.track}
                          </button>
                        ))}
                      </div>
                    </td>
                  </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {scanMode && sortedResults.length === 0 && (
            <p className="py-8 text-center text-sm text-muted">{ts.chips.empty}</p>
          )}
          {scanMode && sortedResults.length > shownRows && (
            <div className="mt-4 flex justify-center">
              <button
                type="button"
                onClick={() => setShownRows((n) => n + TABLE_PAGE)}
                className="inline-flex h-9 items-center rounded-control border border-line bg-surface px-4 text-sm font-semibold text-body transition-colors hover:bg-sunk"
              >
                {ts.table.showMore(
                  formatCount(Math.min(TABLE_PAGE, sortedResults.length - shownRows), language),
                  formatCount(sortedResults.length - shownRows, language),
                )}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Empty State */}
      {!scanMode && !loading && results.length === 0 && !error && (
        <div className={`text-center py-12 text-slate-500 dark:text-slate-400`}>
          <p>{t.states.empty}</p>
        </div>
      )}

      {/* Internal/dev-only raw Search Console opportunity browser (Stage E2A/E2B) —
          behind NEXT_PUBLIC_GSC_RAW_BROWSER_ENABLED. It is a diagnostic, never the
          merchant-facing view (a merchant-grade presentation of these opportunities
          is a later package). For the project the top bar names, and keyed by it, so
          a switch starts it afresh instead of showing, or later receiving, the
          previous project's opportunities. */}
      {process.env.NEXT_PUBLIC_GSC_RAW_BROWSER_ENABLED === 'true' && (
        <div className="mt-8">
          <GscOpportunities projectId={selectedProject} key={selectedProject} projects={projectOptions}
            onToast={(kind, text) => (kind === 'success' ? gscToast.success(text) : gscToast.error(text))} />
        </div>
      )}

      {/* AI Questions Modal */}
      <AIQuestionsModal
        open={aiQuestionsOpen}
        onClose={() => {
          setAIQuestionsOpen(false)
          setGeneratedAIQuestions([])
          setAIQuestionsMessage('')
          setAIQuestionsError('')
        }}
        questions={generatedAIQuestions}
        selectedProject={selectedProject}
        projects={projects}
        language={language as 'he' | 'en'}
        isRTL={isRTL}
        onAddQuestions={handleAddAIQuestions}
        loading={addingAIQuestions}
        successMessage={aiQuestionsMessage}
      />

      {/* Trend Modal */}
      <TrendModal
        open={trendModalOpen}
        onClose={() => {
          setTrendModalOpen(false)
          setSelectedTrendKeyword('')
          setTrendData(undefined)
          setTrendError('')
        }}
        keyword={selectedTrendKeyword}
        language={language as 'he' | 'en'}
        isRTL={isRTL}
        loading={trendLoading}
        error={trendError}
        data={trendData}
      />

      <ToastHost toasts={gscToast.toasts} dismiss={gscToast.dismiss} dir={isRTL ? 'rtl' : 'ltr'} />
    </div>
  )
}
