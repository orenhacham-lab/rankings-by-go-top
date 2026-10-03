'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import { SUPPORTED_COUNTRIES, SUPPORTED_LANGUAGES } from '@/lib/google-ads/constants'
import { GeneratedQuestion } from '@/lib/ai-questions/generate-questions'
import AIQuestionsModal from '@/components/keyword-research/AIQuestionsModal'
import TrendModal, { type TrendError } from '@/components/keyword-research/TrendModal'
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
import { ArrowDown, ArrowUp, ArrowUpDown, Check, Copy, Loader2, Plus, Search, Sparkles, TrendingUp, X } from 'lucide-react'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Segmented from '@/components/ui/Segmented'
import Checkbox from '@/components/ui/Checkbox'
import Notice from '@/components/ui/Notice'
import RowMenu from '@/components/ui/RowMenu'
import Badge from '@/components/ui/Badge'
import EmptyState from '@/components/ui/EmptyState'
import { FIELD_LABEL_CLASSES } from '@/components/ui/Input'
import { LANDSCAPE_IDS, ResearchAudiences, ResearchRivals } from '@/components/keyword-research/ResearchLandscape'
import SectionNav from '@/components/keyword-research/SectionNav'
import SiteAvatar from '@/components/ui/SiteAvatar'
import { useFirstEntrance } from '@/components/ui/motion'
import { NO_LANDSCAPE } from '@/components/keyword-research/landscape'
import CompetitiveResearch, { COMPETITIVE_ID } from '@/components/keyword-research/competitive/CompetitiveResearch'

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

/** Rows the table shows at once, and adds per "show more" (design contract §6). */
const TABLE_PAGE = 25
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

type BadgeVariant = 'success' | 'warning' | 'danger' | 'neutral'

interface OpportunityBadgeInfo {
  key: OpportunityKey
  label: string
  variant: BadgeVariant
}

/** The SEO potential as a ui Badge (its words come from the dictionary). */
function getOpportunityBadgeInfo(r: KeywordIdeaResult, labels: Record<OpportunityKey, string>): OpportunityBadgeInfo {
  const key = getSeoPotentialBadge(r)
  const variants: Record<OpportunityKey, BadgeVariant> = { high: 'success', medium: 'warning', low: 'neutral' }
  return { key, label: labels[key], variant: variants[key] }
}

/**
 * Google Ads' competition level in the screen's words (UX review P1-4): "בינונית",
 * never "MEDIUM (55)", drawn as a ui Badge like the potential beside it (final review
 * R18), not as a coloured word. The 0–100 index is the badge's tooltip.
 */
const COMPETITION_VARIANT: Record<'LOW' | 'MEDIUM' | 'HIGH', BadgeVariant> = { LOW: 'success', MEDIUM: 'warning', HIGH: 'danger' }
function competitionCell(
  r: Pick<KeywordIdeaResult, 'competition' | 'competitionIndex'>,
  levels: Record<'LOW' | 'MEDIUM' | 'HIGH', string>,
  indexLabel: (n: number) => string,
): { label: string; variant: BadgeVariant | null; title: string | undefined } {
  if (!r.competition) return { label: '—', variant: null, title: undefined }
  return {
    label: levels[r.competition],
    variant: COMPETITION_VARIANT[r.competition],
    title: typeof r.competitionIndex === 'number' ? indexLabel(r.competitionIndex) : undefined,
  }
}

/** The competition cell's content: its Badge, or a muted dash when Google gave no level. */
function CompetitionBadge({ c }: { c: ReturnType<typeof competitionCell> }) {
  if (!c.variant) return <span className="text-muted">{c.label}</span>
  return <span title={c.title} data-competition=""><Badge variant={c.variant}>{c.label}</Badge></span>
}

export default function KeywordResearchPage() {
  const { language, uiLocale } = useDashboardLanguage()
  const dict = getDashboardDictionary(uiLocale)
  const t = dict.keywordResearch
  const isRTL = language === 'he'
  const router = useRouter()

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
  const [trendError, setTrendError] = useState<TrendError>('')
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
  // What the site's pages are about (w8-relevance): the research ranks by it and sets the unrelated apart.
  const scanSiteTopics = scanOn?.kind === 'seeded' ? scanOn.research.siteTopics ?? null : null
  // Wave 9: the research keywords the site already covers (the shared cannibalization check).
  const scanCovered = scanOn?.kind === 'seeded' ? scanOn.research.covered ?? null : null
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
      siteTopics: scanSiteTopics,
      covered: scanCovered,
    }),
    [scanKeywords, scanTracked, manualActive, results, googleFigures, chip, scanSiteTopics, scanCovered],
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
      setError(t.messages.tooMany)
      return
    }

    setLoading(true)
    setShownRows(TABLE_PAGE)

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
          setError(t.states.errorReauth)
        } else if (data.stage === 'env_check') {
          // Missing configuration (CLIENT_ID, CLIENT_SECRET, etc.)
          setError(t.states.errorEnv)
        } else if (data.stage === 'oauth') {
          // Other OAuth errors
          setError(t.messages.authFailed)
        } else if (data.stage === 'validation') {
          // The route's own words stay in the log: the merchant reads ours.
          setError(data.error === 'Invalid URL' ? t.form.errorInvalidUrl : data.error === 'Keyword is required' ? t.states.empty : t.messages.invalidRequest)
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
      gscToast.success(t.bulk.copied(formatCount(selectedKeywords.size, language)))
    }).catch(() => {})
  }

  const copyKeyword = (kw: string) => {
    navigator.clipboard.writeText(kw).then(() => gscToast.success(t.table.copied)).catch(() => {})
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
        // A code, said by the modal in its own words (never the route's error text).
        setTrendError(data.errorCode === 'GOOGLE_ADS_REAUTH_REQUIRED' ? 'reauth' : 'failed')
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
      setTrendError('failed')
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
        // Our own words only, never the route's text.
        if (response.status === 402) {
          setAddToProjectError(t.addToProject.errorQuota)
        } else {
          setAddToProjectError(response.status === 503 ? ts.add.unavailable : t.addToProject.errorGeneral)
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
      setAIQuestionsError(t.messages.aiOnlyOne)
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
        // Our words for what happened, never the route's message.
        setAIQuestionsError(response.status === 403 ? t.messages.aiNotAvailable : response.status === 503 ? t.messages.aiUnavailable : t.messages.aiFailed)
        return
      }

      const result = await response.json()

      if (!result.questions || result.questions.length === 0) {
        setAIQuestionsError(t.messages.aiNone)
        return
      }

      setGeneratedAIQuestions(result.questions)
      setAIQuestionsOpen(true)
      setAIQuestionsError('')
      setAIQuestionsMessage('')
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      console.error('Error generating AI questions:', errorMsg)
      setAIQuestionsError(t.messages.aiFailed)
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
        setAIQuestionsMessage(t.messages.aiAdded(added, skipped))
        setGeneratedAIQuestions([])
        setTimeout(() => setAIQuestionsOpen(false), 1500)
      } else if (skipped > 0) {
        setAIQuestionsMessage(t.messages.aiSkipped(skipped))
        setTimeout(() => setAIQuestionsOpen(false), 1500)
      }
    } catch (err) {
      setAIQuestionsError(t.messages.aiAddFailed)
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

  // Lucide sort arrows (§6), never a glyph: the column sorted, and which way.
  const sortIndicator = (key: SortKey) => {
    const Icon = sortBy !== key ? ArrowUpDown : sortDir === 'asc' ? ArrowUp : ArrowDown
    return <Icon aria-hidden="true" className={`size-3.5 shrink-0 ${sortBy === key ? 'text-action' : 'text-muted/70'}`} />
  }

  // Top opportunities computed from existing results — no extra API calls.
  // The largest monthly searches in the table: each row's volume bar is measured against it.
  const maxVolume = useMemo(() => Math.max(1, ...tableSource.map((r) => r.avgMonthlySearches ?? 0)), [tableSource])
  // The rows rise in once, when the first research arrives; a chip, a sort or "show more" shows them at once.
  const rowsEnter = useFirstEntrance(tableSource.length > 0)

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
    <ScanGscNotice projectId={activeProjectId} data={gscKeywords.data} count={model.counts.google} scope={model.mode === 'manual' ? 'search' : 'tracked'} retry={gscKeywords.retry} />
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
  // THE ONE COMPETITOR SECTION, for every project. It used to mount only with the
  // scan's research on screen: a project made by hand never saw it, and a seeded one
  // lost it on its first manual search (review P1-2). Its reads (the tracked
  // competitors, their rank rows, Search Console) do not depend on the research on
  // screen, so it is always there. With the scan's research it opens with the scan's
  // competitor cards and sits beside the rest of the scan's story; otherwise it
  // follows the results, so a search's table stays right under its form.
  const competitorSection = activeProjectId ? (
    <CompetitiveResearch
      projectId={activeProjectId}
      siteIcon={seedLandscape.siteIcon}
      suggested={seedLandscape.competitors.filter((c) => c.validated).map((c) => c.domain)}
      onTracked={scan.reloadTracked}
      rivals={landscapeOn && scanOn?.kind === 'seeded'
        ? <ResearchRivals projectId={activeProjectId} keywords={scanOn.research.keywords} seed={seedLandscape} domain={ownDomain} />
        : undefined}
    />
  ) : null

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
            { id: COMPETITIVE_ID, label: dict.researchCompetitive.nav },
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
      <div hidden={scanMode && !formOpen ? true : undefined} className="mb-8 rounded-card border border-line bg-surface p-5 shadow-card sm:p-6">
        <form onSubmit={submitResearch} className="space-y-4">
          {/* Research type: one segmented control; the form still carries its value by name. */}
          <div className="flex flex-col gap-1.5">
            <span id="research-type-label" className={FIELD_LABEL_CLASSES}>{t.form.researchType}</span>
            <input type="hidden" name="researchType" value={researchType} />
            <Segmented
              ariaLabel={t.form.researchType}
              value={researchType}
              onChange={(v) => setResearchType(v)}
              className="max-w-full self-start overflow-x-auto"
              options={[
                { value: 'keyword', label: t.form.researchTypeKeyword, disabled: loading },
                { value: 'url', label: t.form.researchTypeUrl, disabled: loading },
                { value: 'keyword_url', label: t.form.researchTypeKeywordUrl, disabled: loading },
              ]}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {/* Keyword — shown when keyword or keyword_url */}
            {(researchType === 'keyword' || researchType === 'keyword_url') && (
              <div className="md:col-span-2">
                <Input
                  id="research-keyword"
                  label={t.form.keyword}
                  type="text"
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  placeholder={t.form.keywordPlaceholder}
                  aria-required="true"
                  disabled={loading}
                />
              </div>
            )}

            {/* URL — shown when url or keyword_url */}
            {(researchType === 'url' || researchType === 'keyword_url') && (
              <div className="md:col-span-2">
                <Input
                  id="research-url"
                  label={t.form.url}
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder={t.form.urlPlaceholder}
                  aria-required="true"
                  disabled={loading}
                />
              </div>
            )}

            <Select
              id="research-country"
              label={t.form.country}
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              disabled={loading}
              options={SUPPORTED_COUNTRIES.map((cc) => ({ value: cc, label: t.countries[cc as keyof typeof t.countries] }))}
            />
            <Select
              id="research-language"
              label={t.form.language}
              value={selectedLanguage}
              onChange={(e) => setSelectedLanguage(e.target.value)}
              disabled={loading}
              options={SUPPORTED_LANGUAGES.map((lang) => ({ value: lang, label: t.languages[lang as keyof typeof t.languages] }))}
            />
            <Input
              id="research-min-searches"
              label={t.form.minMonthlySearches}
              type="number"
              value={minMonthlySearches}
              onChange={(e) => setMinMonthlySearches(Math.max(0, parseInt(e.target.value) || 0))}
              min="0"
              disabled={loading}
            />
            <Select
              id="research-limit"
              label={t.form.resultsToShow}
              value={String(resultsLimit)}
              onChange={(e) => {
                const v = Number(e.target.value)
                if (v === 100 || v === 250) {
                  setResultsLimit(v)
                }
              }}
              disabled={loading}
              options={[{ value: '100', label: formatCount(100, language) }, { value: '250', label: formatCount(250, language) }]}
            />
          </div>

          {/* Submit: the form's one primary action; while it cannot run, the line beside it says why. */}
          {(() => {
            const missing = (researchType === 'keyword' && !keyword.trim()) ||
              (researchType === 'url' && !url.trim()) ||
              (researchType === 'keyword_url' && (!keyword.trim() || !url.trim()))
            return (
              <div className="flex flex-col-reverse items-stretch gap-3 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-caption text-muted">{missing && !loading ? t.messages.needInput : ''}</p>
                <Button type="submit" loading={loading} disabled={loading || missing} className="sm:min-w-44">
                  {!loading && <Search aria-hidden="true" className="size-4" />}
                  {loading ? t.form.searching : t.form.search}
                </Button>
              </div>
            )
          })()}
        </form>
      </div>

      {/* Error State */}
      {error && <Notice tone="bad" className="mb-6">{error}</Notice>}

      {/* Few Results Warning */}
      {fewResultsWarning && results.length > 0 && <Notice tone="warn" className="mb-4">{t.states.fewResults}</Notice>}

      {/* Filtered Out Warning */}
      {filteredOutWarning && !fewResultsWarning && results.length > 0 && <Notice tone="info" className="mb-4">{t.states.filteredOut}</Notice>}

      {/* Easy battles to win: the best keywords of the research on screen. */}
      {scanMode && model.mode && (
        <div id="research-wins" className="scroll-mt-20">
        <EasyWins
          wins={model.wins.slice(0, EASY_WINS_SHOWN)}
          total={model.wins.length}
          adding={trackingKeys}
          onTrack={trackKeyword}
          onShowAll={model.mode === 'scan' ? showSuggestions : undefined}
          lessRelated={scanSiteTopics ? model.lessRelatedWins : undefined}
          covered={model.covered}
        />
        </div>
      )}

      {/* With the scan's research on screen: who the site competes with (one section),
          then who searches for it. */}
      {landscapeOn && competitorSection}
      {landscapeOn && scanOn?.kind === 'seeded' && activeProjectId && (
        <ResearchAudiences projectId={activeProjectId} keywords={scanOn.research.keywords} seed={seedLandscape} />
      )}

      {/* Search Console's source, where there is no table for it to sit in. */}
      {scanMode && !tableVisible && <div className="mb-6">{gscNotice}</div>}

      {/* Results */}
      {tableVisible && (
        <div id={scanMode ? 'research-table' : undefined} className={`rounded-card border border-line bg-surface p-5 shadow-card sm:p-6${scanMode ? ' scroll-mt-20' : ''}`}>
          {/* The chips of the scan's research, and Search Console's source under them. */}
          {scanMode && (
            <div className="mb-4 space-y-3 scroll-mt-4">
              <ResearchChips counts={model.counts} active={chip} onChange={chooseChip} google={googleChip} />
              {gscNotice}
            </div>
          )}
          {/* Results Toolbar: how many, and (for a research of its own) its suggestions. */}
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-caption text-muted">
              {t.results.resultsCount}: <span className="font-semibold text-ink tabular-nums">{formatCount(tableSource.length, language)}</span>
            </p>
            {!scanMode && topOpportunities.length > 0 && (
              <Button type="button" size="sm" variant="secondary" onClick={() => setOpportunitiesOpen((v) => !v)} aria-expanded={opportunitiesOpen}>
                <Sparkles aria-hidden="true" className="size-4 text-action" />
                {opportunitiesOpen ? t.opportunities.hide : t.opportunities.show}
              </Button>
            )}
          </div>

          {/* Opportunities Panel — opt-in, compact, no extra API calls */}
          {!scanMode && opportunitiesOpen && topOpportunities.length > 0 && (
            <section data-opportunities="" className="mb-4 rounded-inset border border-line bg-surface p-4">
              <h3 className="text-copy font-semibold text-ink">{t.opportunities.title}</h3>
              <p className="text-caption text-muted">{t.opportunities.subtitle}</p>
              <ul className="mt-2 divide-y divide-line">
                {topOpportunities.map((r, i) => {
                  const isSelected = selectedKeywords.has(r.keyword)
                  const badge = t.opportunities.badges[getBadgeKey(r)]
                  const c = competitionCell(r, t.results.competitionLevel, t.results.competitionIndex)
                  return (
                    <li key={r.keyword} className="flex min-h-12 flex-wrap items-center gap-x-3 gap-y-1 py-2 text-caption">
                      <span className="w-5 shrink-0 text-muted tabular-nums">{formatCount(i + 1, language)}</span>
                      <span className="min-w-0 flex-1 truncate text-copy font-medium text-ink" title={r.keyword}>{r.keyword}</span>
                      <span className="whitespace-nowrap text-muted tabular-nums">
                        {r.avgMonthlySearches !== null && r.avgMonthlySearches !== undefined ? formatCount(r.avgMonthlySearches, language) : '—'} {t.opportunities.searches}
                      </span>
                      <CompetitionBadge c={c} />
                      {r.highTopOfPageBid !== null && r.highTopOfPageBid !== undefined && (
                        <span className="whitespace-nowrap text-muted tabular-nums">CPC {formatMoney(r.highTopOfPageBid, r.currency, language)}</span>
                      )}
                      <Badge variant="neutral">{badge}</Badge>
                      <Button type="button" size="sm" variant="secondary" onClick={() => selectKeywordFromOpportunity(r.keyword)} disabled={isSelected}>
                        {isSelected && <Check aria-hidden="true" className="size-4" />}
                        {isSelected ? t.opportunities.selected : t.opportunities.select}
                      </Button>
                    </li>
                  )
                })}
              </ul>
            </section>
          )}

          {/* Results Table (§6): a named checkbox per row, the difficulty in words, one
              money format, figures end-aligned, the row's secondary actions behind "⋯". */}
          <div className="relative -mx-5 overflow-x-auto sm:-mx-6" data-research-table-scroll="">
            <table className="w-full text-copy">
              <thead>
                <tr className="h-10 border-y border-line bg-sunk/70 text-caption text-muted">
                  <th className="w-10 ps-4 pe-1 text-start sm:ps-6 sm:pe-2">
                    <Checkbox
                      checked={selectedKeywords.size === tableSource.length && tableSource.length > 0}
                      indeterminate={selectedKeywords.size > 0 && selectedKeywords.size < tableSource.length}
                      onChange={(on) => (on ? selectAll() : deselectAll())}
                      aria-label={t.results.selectAllRows}
                    />
                  </th>
                  <th className="px-2.5 text-start font-semibold sm:px-4">
                    {t.results.keyword}
                  </th>
                  {([
                    // Below sm (a phone at 390) the table keeps the keyword, its searches and
                    // the row's actions; potential, competition and the click prices return
                    // from sm/md/lg, and on a phone the competition rides under the keyword.
                    // There the keyword, its source line and these headers wrap instead of
                    // truncating, so the three columns fit 390 without a sideways scroll.
                    ['monthlySearches', t.results.monthlySearches, ''],
                    ['opportunity', t.results.opportunity, 'hidden md:table-cell'],
                    ['competition', t.results.competition, 'hidden sm:table-cell'],
                    ['lowCpc', t.results.lowCpc, 'hidden lg:table-cell'],
                    ['highCpc', t.results.highCpc, 'hidden sm:table-cell'],
                  ] as const).map(([key, label, cls]) => {
                    const numeric = key === 'monthlySearches' || key === 'lowCpc' || key === 'highCpc'
                    return (
                      <th key={key} className={`px-2.5 font-semibold sm:px-4 ${numeric ? 'text-end' : 'text-start'} ${cls}`} aria-sort={sortBy === key ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined}>
                        <button
                          type="button"
                          onClick={() => handleSort(key)}
                          title={key === 'opportunity' ? t.results.opportunityTooltip : undefined}
                          aria-label={t.table.sortBy(label)}
                          className={`inline-flex items-center gap-1 rounded-control text-start transition-colors sm:whitespace-nowrap duration-150 ease-snappy hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-action/20 ${sortBy === key ? 'text-ink' : ''}`}
                        >
                          {label}
                          {sortIndicator(key)}
                        </button>
                      </th>
                    )
                  })}
                  <th className="px-2.5 pe-4 text-end font-semibold sm:px-4 sm:pe-6">
                    <span className="sr-only">{t.results.action}</span>
                  </th>
                </tr>
              </thead>
              <tbody className={`divide-y divide-line${rowsEnter ? ' rows-enter' : ''}`}>
                {sortedResults.slice(0, shownRows).map((result, idx) => {
                  const badge = getOpportunityBadgeInfo(result, t.results.potentialLevel)
                  const competition = competitionCell(result, t.results.competitionLevel, t.results.competitionIndex)
                  const selected = selectedKeywords.has(result.keyword)
                  return (
                  <tr key={idx} data-selected={selected || undefined} className={`h-14 transition-[background-color,box-shadow] duration-150 ease-snappy [&>td:first-child]:transition-shadow ${selected ? 'bg-action-soft ltr:[&>td:first-child]:shadow-edge-ltr rtl:[&>td:first-child]:shadow-edge-rtl' : 'hover:bg-action-soft/40 ltr:hover:[&>td:first-child]:shadow-edge-ltr rtl:hover:[&>td:first-child]:shadow-edge-rtl'}`}>
                    <td className="w-10 ps-4 pe-1 sm:ps-6 sm:pe-2">
                      <Checkbox
                        checked={selected}
                        onChange={() => toggleKeyword(result.keyword)}
                        aria-label={t.results.selectKeyword(result.keyword)}
                      />
                    </td>
                    <td className="max-w-72 px-2.5 py-3 text-start sm:px-4">
                      <span className="block break-words font-medium text-ink sm:truncate" title={result.keyword}>{result.keyword}</span>
                      {scanMode && sourceLineFor(result.keyword)}
                      {competition.variant && (
                        <span data-phone-meta="" className="mt-1 flex sm:hidden"><CompetitionBadge c={competition} /></span>
                      )}
                    </td>
                    <td className="px-2.5 py-3 text-end tabular-nums text-body sm:px-4">
                      {result.avgMonthlySearches !== null && result.avgMonthlySearches !== undefined ? (
                        <span className="inline-flex flex-col items-end gap-1">
                          <span className="font-semibold text-ink">{formatCount(result.avgMonthlySearches, language)}</span>
                          {/* The row's searches against the table's largest: a quiet bar under the figure. */}
                          <span aria-hidden="true" className="hidden h-1 w-16 overflow-hidden rounded-pill bg-sunk sm:block">
                            <span className="grow-x block h-full rounded-pill bg-action/60" style={{ width: `${Math.max(4, Math.round((result.avgMonthlySearches / maxVolume) * 100))}%` }} />
                          </span>
                        </span>
                      ) : '—'}
                    </td>
                    <td className="hidden px-4 py-3 text-start md:table-cell">
                      <Badge variant={badge.variant}>{badge.label}</Badge>
                    </td>
                    <td className="hidden whitespace-nowrap px-4 py-3 text-start sm:table-cell">
                      <CompetitionBadge c={competition} />
                    </td>
                    <td className="hidden whitespace-nowrap px-4 py-3 text-end tabular-nums text-body lg:table-cell">
                      {result.lowTopOfPageBid ? formatMoney(result.lowTopOfPageBid, result.currency, language) : '—'}
                    </td>
                    <td className="hidden whitespace-nowrap px-4 py-3 text-end tabular-nums text-body sm:table-cell">
                      {result.highTopOfPageBid ? formatMoney(result.highTopOfPageBid, result.currency, language) : '—'}
                    </td>
                    <td className="px-2.5 py-3 pe-4 sm:px-4 sm:pe-6">
                      <div className="flex items-center justify-end gap-1">
                        {/* One click to track this keyword: the same request and quota check as "easy wins". */}
                        {scanMode && ((result as ResearchRow).tracked ? (
                          <span data-row-tracked="" className="inline-flex h-8 items-center gap-1 whitespace-nowrap px-2 text-caption font-semibold text-ok sm:px-3">
                            <Check aria-hidden="true" className="size-4" /><span className="max-sm:sr-only">{ti.tracked}</span>
                          </span>
                        ) : (
                          <button
                            type="button"
                            data-row-track=""
                            onClick={() => trackKeyword(result as ResearchRow)}
                            disabled={trackingKeys.has(keywordKey(result.keyword))}
                            aria-label={ti.trackAria(result.keyword)}
                            className="inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-control px-2 text-caption sm:px-3 font-semibold text-action transition-colors duration-150 ease-snappy hover:bg-action-soft focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-action/20 disabled:opacity-50"
                          >
                            {trackingKeys.has(keywordKey(result.keyword)) ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <Plus aria-hidden="true" className="size-4" />}
                            <span className="max-sm:sr-only">{trackingKeys.has(keywordKey(result.keyword)) ? ti.tracking : ti.track}</span>
                          </button>
                        ))}
                        <RowMenu
                          label={t.table.rowMenu(result.keyword)}
                          items={[
                            { key: 'trend', label: t.trend.title, icon: <TrendingUp aria-hidden="true" className="size-4" />, onSelect: () => handleOpenTrendModal(result.keyword) },
                            { key: 'copy', label: t.results.copy, icon: <Copy aria-hidden="true" className="size-4" />, onSelect: () => copyKeyword(result.keyword) },
                          ]}
                        />
                      </div>
                    </td>
                  </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {scanMode && sortedResults.length === 0 && (
            <p className="py-8 text-center text-copy text-muted">{ts.chips.empty}</p>
          )}
          {sortedResults.length > shownRows && (
            <div className="mt-4 flex justify-center">
              <Button type="button" variant="secondary" onClick={() => setShownRows((n) => n + TABLE_PAGE)}>
                {ts.table.showMore(
                  formatCount(Math.min(TABLE_PAGE, sortedResults.length - shownRows), language),
                  formatCount(sortedResults.length - shownRows, language),
                )}
              </Button>
            </div>
          )}

          {/* The selection's actions (§6): only while something is selected (or its
              last result is still being said), pinned to the bottom of the view, at
              most three actions; what they came to is said right above them. */}
          {(selectedKeywords.size > 0 || addToProjectMessage || addToProjectError || aiQuestionsError) && (
            <div data-bulk-bar="" className="sticky bottom-4 z-20 mt-4 space-y-2">
              {aiQuestionsError && (
                <Notice tone="info" onDismiss={() => setAIQuestionsError('')}>{aiQuestionsError}</Notice>
              )}
              {addToProjectError && (
                <Notice tone="bad" onDismiss={() => setAddToProjectError('')}>{addToProjectError}</Notice>
              )}
              {addToProjectMessage && (
                <Notice
                  tone="ok"
                  onDismiss={() => { setAddToProjectMessage(''); setLastAddedProjectId('') }}
                  action={lastAddedProjectId ? { label: t.addToProject.goToProject, onClick: () => router.push(`/keywords?projectId=${encodeURIComponent(lastAddedProjectId)}`) } : null}
                >
                  {addToProjectMessage}
                </Notice>
              )}
              {selectedKeywords.size > 0 && (
                <div role="region" aria-label={t.bulk.label} className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-inset bg-contrast px-4 py-3 text-contrast-ink shadow-pop">
                  <div className="flex min-w-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={deselectAll}
                      aria-label={t.bulk.clear}
                      title={t.bulk.clear}
                      className="grid size-8 shrink-0 place-items-center rounded-control text-contrast-ink/80 transition-colors duration-150 ease-snappy hover:bg-contrast-ink/10 hover:text-contrast-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-action/40"
                    >
                      <X aria-hidden="true" className="size-4" />
                    </button>
                    <div className="min-w-0">
                      <p className="text-copy font-semibold tabular-nums">{t.bulk.selected(formatCount(selectedKeywords.size, language))}</p>
                      {activeProjectName && <p className="truncate text-caption text-contrast-ink/70">{t.bulk.project(activeProjectName)}</p>}
                    </div>
                  </div>

                  {projects.length === 0 && !projectsLoading ? (
                    <p className="text-caption text-contrast-ink/80">{t.addToProject.noProjects}</p>
                  ) : projectsLoading ? (
                    <p className="inline-flex items-center gap-2 text-caption text-contrast-ink/80">
                      <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                      {t.addToProject.projectsLoading}
                    </p>
                  ) : (
                    <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
                      <Segmented
                        ariaLabel={t.addToProject.engineLabel}
                        value={engineType}
                        onChange={(v) => setEngineType(v)}
                        options={[
                          { value: 'google_search', label: t.addToProject.engineGoogleOrganic, disabled: addingToProject },
                          { value: 'google_maps', label: t.addToProject.engineGoogleMaps, disabled: addingToProject },
                        ]}
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={copySelected}
                        className="text-contrast-ink hover:bg-contrast-ink/10 hover:text-contrast-ink"
                      >
                        <Copy aria-hidden="true" className="size-4" />
                        {t.bulk.copy}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={handleGenerateAIQuestions}
                        disabled={!activeProject || generatingAIQuestions}
                        title={selectedKeywords.size > 1 ? t.bulk.aiQuestionsHint : undefined}
                        className="text-contrast-ink hover:bg-contrast-ink/10 hover:text-contrast-ink"
                      >
                        {generatingAIQuestions ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <Sparkles aria-hidden="true" className="size-4" />}
                        {t.bulk.aiQuestions}
                      </Button>
                      <Button type="button" size="sm" onClick={handleAddToProject} loading={addingToProject} disabled={!selectedProject || addingToProject}>
                        {!addingToProject && <Plus aria-hidden="true" className="size-4" />}
                        {addingToProject ? t.bulk.adding : t.addToProject.addButton}
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Empty State */}
      {!scanMode && !loading && results.length === 0 && !error && (
        <EmptyState icon={<Search />} title={t.states.empty} />
      )}

      {/* Every other screen (no scan, the empty start, a manual search): the same
          competitor section, after the results. */}
      {!landscapeOn && competitorSection && <div data-competitive-after="" className="mt-6">{competitorSection}</div>}

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
