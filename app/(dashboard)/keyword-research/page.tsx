'use client'

import { useState, useEffect, useMemo } from 'react'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import { SUPPORTED_COUNTRIES, SUPPORTED_LANGUAGES } from '@/lib/google-ads/constants'
import { generateQuestionsFromKeywords, GeneratedQuestion } from '@/lib/ai-questions/generate-questions'
import AIQuestionsModal from '@/components/keyword-research/AIQuestionsModal'
import { Copy, Loader2, CheckCircle, Sparkles } from 'lucide-react'

interface KeywordIdeaResult {
  keyword: string
  avgMonthlySearches: number | null
  competition: 'LOW' | 'MEDIUM' | 'HIGH' | null
  competitionIndex: number | null
  lowTopOfPageBid: number | null
  highTopOfPageBid: number | null
  currency: string
}

interface Project {
  id: string
  name: string
}

type BadgeKey = 'lowCompetition' | 'commercial' | 'highVolume' | 'mediumPotential'
type OpportunityKey = 'high' | 'medium' | 'low'

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
    if (volume >= 1000 && wc >= 2) return 'medium'
    if (volume >= 100 && wc >= 2) return 'medium'
    if (volume >= 50 && wc >= 3) return 'medium'
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

function getOpportunityBadgeInfo(r: KeywordIdeaResult, language: 'he' | 'en'): OpportunityBadgeInfo {
  const key = getSeoPotentialBadge(r)

  const labels = {
    he: {
      high: 'גבוה',
      medium: 'בינוני',
      low: 'נמוך',
    },
    en: {
      high: 'High',
      medium: 'Medium',
      low: 'Low',
    },
  }

  const colorClasses = {
    high: 'bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-300',
    medium: 'bg-yellow-100 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-300',
    low: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300',
  }

  return {
    key,
    label: labels[language][key],
    colorClass: colorClasses[key],
  }
}

export default function KeywordResearchPage() {
  const { language, isLoaded } = useDashboardLanguage()
  const dict = isLoaded ? getDashboardDictionary(language) : getDashboardDictionary('he')
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

  const [projects, setProjects] = useState<Project[]>([])
  const [projectsLoading, setProjectsLoading] = useState(false)
  const [selectedProject, setSelectedProject] = useState('')
  const [engineType, setEngineType] = useState<'google_search' | 'google_maps'>('google_search')
  const [addingToProject, setAddingToProject] = useState(false)
  const [addToProjectMessage, setAddToProjectMessage] = useState('')
  const [addToProjectError, setAddToProjectError] = useState('')
  const [lastAddedProjectId, setLastAddedProjectId] = useState('')

  // Sorting state for results table
  type SortKey = 'monthlySearches' | 'competition' | 'lowCpc' | 'highCpc' | 'opportunity'
  const [sortBy, setSortBy] = useState<SortKey>('monthlySearches')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  // Opportunities panel (closed by default to keep page lightweight)
  const [opportunitiesOpen, setOpportunitiesOpen] = useState(false)

  // AI Questions state
  const [aiQuestionsOpen, setAIQuestionsOpen] = useState(false)
  const [generatedAIQuestions, setGeneratedAIQuestions] = useState<GeneratedQuestion[]>([])
  const [addingAIQuestions, setAddingAIQuestions] = useState(false)
  const [aiQuestionsMessage, setAIQuestionsMessage] = useState('')
  const [aiQuestionsError, setAIQuestionsError] = useState('')

  useEffect(() => {
    fetchProjects()
  }, [])

  const fetchProjects = async () => {
    setProjectsLoading(true)
    try {
      const response = await fetch('/api/projects')
      if (response.ok) {
        const data = await response.json()
        setProjects(data.projects || [])
      }
    } catch (err) {
      console.error('Error fetching projects:', err)
    } finally {
      setProjectsLoading(false)
    }
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
    const trimmedKeyword = keyword.trim()
    const trimmedUrl = url.trim()

    if (researchType === 'keyword' && !trimmedKeyword) {
      setError(t.states.empty)
      return
    }
    if (researchType === 'url' && !trimmedUrl) {
      setError(t.form.errorInvalidUrl)
      return
    }
    if (researchType === 'keyword_url' && (!trimmedKeyword || !trimmedUrl)) {
      if (!trimmedKeyword) {
        setError(t.states.empty)
      } else {
        setError(t.form.errorInvalidUrl)
      }
      return
    }

    setLoading(true)

    try {
      const response = await fetch('/api/google-ads/keyword-ideas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          researchType,
          keyword: trimmedKeyword,
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
        } else if (data.stage === 'env_check' || data.stage === 'oauth') {
          setError(t.states.errorEnv)
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
    setSelectedKeywords(new Set(results.map((r) => r.keyword)))
  }

  const deselectAll = () => {
    clearAddToProjectSuccess()
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
      const resultsByKeyword = new Map(results.map((r) => [r.keyword, r]))
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
        } else {
          setAddToProjectError(result.message || t.addToProject.errorGeneral)
        }
        return
      }

      setAddToProjectMessage(t.addToProject.success(result.added || 0, result.skipped || 0))
      setLastAddedProjectId(projectIdUsed)
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

  const handleGenerateAIQuestions = () => {
    if (!selectedProject) {
      setAIQuestionsError(t.addToProject.errorSelectProject)
      return
    }

    if (selectedKeywords.size === 0) {
      setAIQuestionsError(t.addToProject.errorSelectKeywords)
      return
    }

    const keywordsList = Array.from(selectedKeywords)
    const generated = generateQuestionsFromKeywords(keywordsList, language as 'he' | 'en')
    setGeneratedAIQuestions(generated)
    setAIQuestionsOpen(true)
    setAIQuestionsError('')
    setAIQuestionsMessage('')
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
    if (results.length === 0) return results
    const competitionRank: Record<string, number> = { LOW: 1, MEDIUM: 2, HIGH: 3 }
    const opportunityRank: Record<OpportunityKey, number> = { low: 1, medium: 2, high: 3 }
    const copy = [...results]
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
  }, [results, sortBy, sortDir])

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

  const competitionColor = (competition: string | null) => {
    switch (competition) {
      case 'LOW':
        return 'text-green-600 dark:text-green-400'
      case 'MEDIUM':
        return 'text-yellow-600 dark:text-yellow-400'
      case 'HIGH':
        return 'text-red-600 dark:text-red-400'
      default:
        return 'text-gray-600 dark:text-gray-400'
    }
  }

  return (
    <div className={`max-w-6xl mx-auto ${isRTL ? 'rtl' : 'ltr'}`}>
      {/* Header */}
      <div className={`mb-8 ${isRTL ? 'text-right' : 'text-left'}`}>
        <h1 className="text-3xl font-bold mb-2 dark:text-slate-100">{t.title}</h1>
        <p className="text-slate-600 dark:text-slate-300">{t.subtitle}</p>
      </div>

      {/* Form */}
      <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 p-6 mb-8">
        <form onSubmit={handleSearch} className="space-y-4">
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

      {/* Results */}
      {results.length > 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 p-6">
          {/* Results Toolbar */}
          <div className={`flex flex-col sm:flex-row gap-2 mb-4 justify-between items-start sm:items-center`}>
            <div className={`text-sm font-medium text-slate-700 dark:text-slate-200`}>
              {t.results.resultsCount}: <span className="font-bold text-slate-900 dark:text-slate-100">{results.length}</span>
            </div>
            <div className="flex gap-2 flex-wrap">
              {topOpportunities.length > 0 && (
                <button
                  onClick={() => setOpportunitiesOpen((v) => !v)}
                  className="text-xs px-3 py-1 rounded border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors flex items-center gap-1"
                  aria-expanded={opportunitiesOpen}
                >
                  <Sparkles size={14} />
                  {opportunitiesOpen ? t.opportunities.hide : t.opportunities.show}
                </button>
              )}
              <button
                onClick={selectAll}
                className="text-xs px-3 py-1 rounded border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                {t.results.selectAll}
              </button>
              <button
                onClick={deselectAll}
                className="text-xs px-3 py-1 rounded border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                {t.results.deselectAll}
              </button>
              {selectedKeywords.size > 0 && (
                <>
                  <button
                    onClick={copySelected}
                    className="text-xs px-3 py-1 rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors flex items-center gap-1"
                  >
                    <Copy size={14} />
                    {t.results.copySelected}
                  </button>
                  <button
                    onClick={handleGenerateAIQuestions}
                    disabled={!selectedProject}
                    className="text-xs px-3 py-1 rounded bg-purple-600 text-white hover:bg-purple-700 disabled:bg-slate-300 dark:disabled:bg-slate-700 transition-colors flex items-center gap-1"
                    title={!selectedProject ? t.addToProject.errorSelectProject : ''}
                  >
                    <Sparkles size={14} />
                    {language === 'he' ? 'יצירת שאלות AI' : 'Create AI questions'}
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Add to Project Section — visible whenever at least one keyword is selected,
              OR a success/error message is still showing from the last action. */}
          {(selectedKeywords.size > 0 || addToProjectMessage || addToProjectError) && (
            <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border-2 border-blue-300 dark:border-blue-700">
              <div className={`mb-3 font-semibold text-blue-900 dark:text-blue-100 flex items-center justify-between gap-3 ${isRTL ? 'flex-row-reverse text-right' : 'text-left'}`}>
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
                    className="text-xs font-normal text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 underline"
                  >
                    {language === 'he' ? 'סגירה' : 'Dismiss'}
                  </button>
                )}
              </div>

              {selectedKeywords.size > 0 && projects.length === 0 && !projectsLoading && (
                <div className="text-sm text-slate-700 dark:text-slate-300 p-3 bg-white dark:bg-slate-800 rounded">
                  {t.addToProject.noProjects}
                </div>
              )}

              {selectedKeywords.size > 0 && projectsLoading && (
                <div className="text-sm text-slate-600 dark:text-slate-400 flex items-center gap-2">
                  <Loader2 size={14} className="animate-spin" />
                  {t.addToProject.projectsLoading}
                </div>
              )}

              {selectedKeywords.size > 0 && projects.length > 0 && !projectsLoading && (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                    <div>
                      <label className={`block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 ${isRTL ? 'text-right' : 'text-left'}`}>
                        {t.addToProject.projectLabel} *
                      </label>
                      <select
                        value={selectedProject}
                        onChange={(e) => setSelectedProject(e.target.value)}
                        className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
                        disabled={addingToProject}
                      >
                        <option value="">{t.addToProject.projectPlaceholder}</option>
                        {projects.map((project) => (
                          <option key={project.id} value={project.id}>
                            {project.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className={`block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 ${isRTL ? 'text-right' : 'text-left'}`}>
                        {t.addToProject.engineLabel}
                      </label>
                      <select
                        value={engineType}
                        onChange={(e) => setEngineType(e.target.value as 'google_search' | 'google_maps')}
                        className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
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
                        className="w-full bg-green-600 hover:bg-green-700 disabled:bg-slate-300 dark:disabled:bg-slate-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
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
                <div className={`text-sm text-red-600 dark:text-red-400 mb-2 ${isRTL ? 'text-right' : 'text-left'}`}>
                  {addToProjectError}
                </div>
              )}
              {addToProjectMessage && (
                <div className={`flex flex-col sm:flex-row sm:items-center gap-3 ${isRTL ? 'sm:flex-row-reverse' : ''}`}>
                  <div className={`text-sm text-green-700 dark:text-green-400 flex items-center gap-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
                    <CheckCircle size={16} />
                    <span>{addToProjectMessage}</span>
                  </div>
                  {lastAddedProjectId && (
                    <a
                      href={`/projects/${lastAddedProjectId}`}
                      className="inline-flex items-center justify-center bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors text-sm"
                    >
                      {t.addToProject.goToProject}
                    </a>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Opportunities Panel — opt-in, compact, no extra API calls */}
          {opportunitiesOpen && topOpportunities.length > 0 && (
            <div className="mb-4 p-3 bg-amber-50/60 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/50 rounded-lg">
              <div className={`mb-2 ${isRTL ? 'text-right' : 'text-left'}`}>
                <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                  {t.opportunities.title}
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  {t.opportunities.subtitle}
                </p>
              </div>
              <ul className="divide-y divide-amber-100 dark:divide-amber-900/30">
                {topOpportunities.map((r, i) => {
                  const isSelected = selectedKeywords.has(r.keyword)
                  const badge = t.opportunities.badges[getBadgeKey(r)]
                  return (
                    <li
                      key={r.keyword}
                      className={`flex items-center flex-wrap gap-x-3 gap-y-1 py-1.5 text-xs ${isRTL ? 'flex-row-reverse text-right' : ''}`}
                    >
                      <span className="text-slate-500 dark:text-slate-400 font-mono w-5 shrink-0">
                        {i + 1}.
                      </span>
                      <span className="font-medium text-slate-900 dark:text-slate-100 truncate min-w-0 flex-1">
                        {r.keyword}
                      </span>
                      <span className="text-slate-600 dark:text-slate-400 whitespace-nowrap">
                        {r.avgMonthlySearches?.toLocaleString() ?? '—'} {t.opportunities.searches}
                      </span>
                      <span className={`whitespace-nowrap ${competitionColor(r.competition)}`}>
                        {r.competition ?? '—'}
                      </span>
                      {r.highTopOfPageBid !== null && r.highTopOfPageBid !== undefined && (
                        <span className="text-slate-600 dark:text-slate-400 whitespace-nowrap">
                          CPC {r.highTopOfPageBid.toFixed(2)} {r.currency}
                        </span>
                      )}
                      <span className="px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 whitespace-nowrap text-[10px] font-medium">
                        {badge}
                      </span>
                      <button
                        type="button"
                        onClick={() => selectKeywordFromOpportunity(r.keyword)}
                        disabled={isSelected}
                        className="px-2 py-0.5 rounded bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 dark:disabled:bg-slate-700 text-white text-[11px] font-medium transition-colors whitespace-nowrap"
                      >
                        {isSelected ? t.opportunities.selected : t.opportunities.select}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}

          {/* Results Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700">
                  <th className="px-4 py-3 text-left font-semibold text-slate-900 dark:text-slate-100 w-6">
                    <input
                      type="checkbox"
                      checked={selectedKeywords.size === results.length && results.length > 0}
                      onChange={(e) => (e.target.checked ? selectAll() : deselectAll())}
                      className="rounded"
                    />
                  </th>
                  <th className={`px-4 py-3 ${isRTL ? 'text-right' : 'text-left'} font-semibold text-slate-900 dark:text-slate-100`}>
                    {t.results.keyword}
                  </th>
                  <th className={`px-4 py-3 ${isRTL ? 'text-right' : 'text-left'} font-semibold text-slate-900 dark:text-slate-100`}>
                    <button
                      type="button"
                      onClick={() => handleSort('monthlySearches')}
                      className={`inline-flex items-center gap-1 hover:text-blue-600 transition-colors ${sortBy === 'monthlySearches' ? 'text-blue-600 dark:text-blue-400' : ''}`}
                    >
                      {t.results.monthlySearches}
                      <span className="text-xs">{sortIndicator('monthlySearches')}</span>
                    </button>
                  </th>
                  <th className={`px-4 py-3 ${isRTL ? 'text-right' : 'text-left'} font-semibold text-slate-900 dark:text-slate-100 hidden sm:table-cell`}>
                    <button
                      type="button"
                      onClick={() => handleSort('opportunity')}
                      title={t.results.opportunityTooltip}
                      className={`inline-flex items-center gap-1 hover:text-blue-600 transition-colors ${sortBy === 'opportunity' ? 'text-blue-600 dark:text-blue-400' : ''}`}
                    >
                      {t.results.opportunity}
                      <span className="text-xs">{sortIndicator('opportunity')}</span>
                    </button>
                  </th>
                  <th className={`px-4 py-3 ${isRTL ? 'text-right' : 'text-left'} font-semibold text-slate-900 dark:text-slate-100`}>
                    <button
                      type="button"
                      onClick={() => handleSort('competition')}
                      className={`inline-flex items-center gap-1 hover:text-blue-600 transition-colors ${sortBy === 'competition' ? 'text-blue-600 dark:text-blue-400' : ''}`}
                    >
                      {t.results.competition}
                      <span className="text-xs">{sortIndicator('competition')}</span>
                    </button>
                  </th>
                  <th className={`px-4 py-3 ${isRTL ? 'text-right' : 'text-left'} font-semibold text-slate-900 dark:text-slate-100`}>
                    <button
                      type="button"
                      onClick={() => handleSort('lowCpc')}
                      className={`inline-flex items-center gap-1 hover:text-blue-600 transition-colors ${sortBy === 'lowCpc' ? 'text-blue-600 dark:text-blue-400' : ''}`}
                    >
                      {t.results.lowCpc}
                      <span className="text-xs">{sortIndicator('lowCpc')}</span>
                    </button>
                  </th>
                  <th className={`px-4 py-3 ${isRTL ? 'text-right' : 'text-left'} font-semibold text-slate-900 dark:text-slate-100`}>
                    <button
                      type="button"
                      onClick={() => handleSort('highCpc')}
                      className={`inline-flex items-center gap-1 hover:text-blue-600 transition-colors ${sortBy === 'highCpc' ? 'text-blue-600 dark:text-blue-400' : ''}`}
                    >
                      {t.results.highCpc}
                      <span className="text-xs">{sortIndicator('highCpc')}</span>
                    </button>
                  </th>
                  <th className={`px-4 py-3 ${isRTL ? 'text-right' : 'text-left'} font-semibold text-slate-900 dark:text-slate-100`}>
                    {t.results.action}
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedResults.map((result, idx) => (
                  <tr key={idx} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selectedKeywords.has(result.keyword)}
                        onChange={() => toggleKeyword(result.keyword)}
                        className="rounded"
                      />
                    </td>
                    <td className={`px-4 py-3 text-slate-900 dark:text-slate-100 ${isRTL ? 'text-right' : 'text-left'}`}>
                      {result.keyword}
                    </td>
                    <td className={`px-4 py-3 text-slate-600 dark:text-slate-400 ${isRTL ? 'text-right' : 'text-left'}`}>
                      {result.avgMonthlySearches?.toLocaleString() ?? '—'}
                    </td>
                    <td className={`px-4 py-3 hidden sm:table-cell ${isRTL ? 'text-right' : 'text-left'}`}>
                      {(() => {
                        const badge = getOpportunityBadgeInfo(result, language as 'he' | 'en')
                        return (
                          <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium whitespace-nowrap ${badge.colorClass}`}>
                            {badge.label}
                          </span>
                        )
                      })()}
                    </td>
                    <td className={`px-4 py-3 ${competitionColor(result.competition)} ${isRTL ? 'text-right' : 'text-left'}`}>
                      {result.competition ?? '—'}
                      {result.competitionIndex && <span className="text-xs ml-1">({result.competitionIndex})</span>}
                    </td>
                    <td className={`px-4 py-3 text-slate-600 dark:text-slate-400 ${isRTL ? 'text-right' : 'text-left'}`}>
                      {result.lowTopOfPageBid ? `${result.lowTopOfPageBid.toFixed(2)} ${result.currency}` : '—'}
                    </td>
                    <td className={`px-4 py-3 text-slate-600 dark:text-slate-400 ${isRTL ? 'text-right' : 'text-left'}`}>
                      {result.highTopOfPageBid ? `${result.highTopOfPageBid.toFixed(2)} ${result.currency}` : '—'}
                    </td>
                    <td className={`px-4 py-3 ${isRTL ? 'text-right' : 'text-left'}`}>
                      <button
                        onClick={() => copyKeyword(result.keyword)}
                        className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 flex items-center gap-1 transition-colors"
                      >
                        <Copy size={16} />
                        <span className="text-xs">{t.results.copy}</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Empty State */}
      {!loading && results.length === 0 && !error && (
        <div className={`text-center py-12 text-slate-500 dark:text-slate-400`}>
          <p>{t.states.empty}</p>
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
    </div>
  )
}
