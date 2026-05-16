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
import { createI18n, isHebrew as detectHebrew } from '@/lib/ai-visibility/i18n'
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
}

type EngineMetrics = {
  engine: string
  scans: number
  mentions: number
  citations: number
  rate: number
}

type TabType = 'results' | 'queries'

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
  const t = useMemo(() => createI18n('he', 'IL'), [])
  const isHebrew = true

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
      setGlobalMetrics({
        totalScans: successfulScans,
        totalMentions,
        totalCitations,
        mentionRate: successfulScans > 0 ? Math.round((totalMentions / successfulScans) * 100) : 0,
        citationRate: successfulScans > 0 ? Math.round((totalCitations / successfulScans) * 100) : 0,
        enginesCovered: engines.size,
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

  const scannedSet = useMemo(() => {
    const s = new Set<string>()
    allResults.forEach((r) => {
      if (r.promptId && r.status === 'success') {
        s.add(`${r.promptId}:${r.engine}`)
      }
    })
    return s
  }, [allResults])

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
      setScanStatus('סריקת מנוע AI בתהליך…')
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
        setScanStatus('הסריקה הושלמה')
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
    [projectId, loadAllResults, allResults, openResultDrawer]
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

      {/* TAB BAR — only two tabs */}
      <div className="flex gap-2 border-b border-slate-200 dark:border-slate-700">
        {(['results', 'queries'] as const).map((tab) => (
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
          </button>
        ))}
      </div>

      {/* TAB 1: RESULTS (includes overview) */}
      {currentTab === 'results' && (
        <>
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
                    {showAllResults ? 'הצג פחות' : 'הצג הכל'}
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
          <div className="flex items-center justify-between gap-4 mb-4">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                {t('ai_queries')}
              </h3>
              <Badge variant="neutral" className="!text-xs">{allPrompts.length}</Badge>
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
                    {showAllPrompts ? 'הצג פחות' : 'הצג עוד'}
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
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-gradient-to-r from-indigo-50 to-white dark:from-slate-900 dark:to-slate-800 p-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
            {t('total_mentions')}
          </div>
          <div className="text-4xl font-bold text-emerald-700 dark:text-emerald-400">{metrics.totalMentions}</div>
          <div className="text-sm text-slate-600 dark:text-slate-300 mt-2">
            {t('out_of_results').replace('{count}', String(totalResults))}
          </div>
        </div>
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
            {t('visibility_percent')}
          </div>
          <div className="text-4xl font-bold text-indigo-700 dark:text-indigo-300">{metrics.mentionRate}%</div>
          <div className="text-sm text-slate-600 dark:text-slate-300 mt-2">{t('overall')}</div>
        </div>
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
            {t('target_cited')}
          </div>
          <div className="text-4xl font-bold text-emerald-700 dark:text-emerald-400">{metrics.totalCitations}</div>
          <div className="text-sm text-slate-600 dark:text-slate-300 mt-2">{t('citations')}</div>
        </div>
      </div>
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
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {engineList.map((em) => {
          const meta = ENGINE_META[em.engine as keyof typeof ENGINE_META]
          const percent = em.scans > 0 ? Math.round((em.mentions / em.scans) * 100) : 0
          return (
            <div
              key={em.engine}
              className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 hover:shadow-md transition flex flex-col items-center text-center"
            >
              {meta && <meta.Icon size={32} className={meta.accent} />}
              <div className="font-semibold text-slate-900 dark:text-slate-100 mt-3 text-sm">{meta?.name || em.engine}</div>
              <div className="text-3xl font-bold text-emerald-600 dark:text-emerald-400 mt-2">{em.mentions}</div>
              <div className="text-xs text-slate-600 dark:text-slate-300 mt-2">
                {t('out_of_results').replace('{count}', String(em.scans))}
              </div>
              {em.scans > 0 && <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">({percent}%)</div>}
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

  // Prefer the precomputed intentLabel (localized in the generator) and fall
  // back to legacy i18n keys for backwards compatibility.
  const label =
    question.intentLabel ||
    (
      {
        brand: t('intent_brand'),
        comparison: t('intent_comparison'),
        local: t('intent_local'),
        transactional: t('intent_transactional'),
        recommendation: t('intent_recommendation'),
        informational: t('intent_informational'),
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
        aria-label="הוסף לרשימת השאילתות"
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

  const isHebrew = detectHebrew(language, country)

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
          <label className="block text-sm font-medium text-slate-900 mb-2">{t('query_label')}</label>
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
