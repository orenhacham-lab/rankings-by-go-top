'use client'

import { useState } from 'react'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import { SUPPORTED_COUNTRIES, SUPPORTED_LANGUAGES } from '@/lib/google-ads/constants'
import { Copy, Loader2 } from 'lucide-react'

interface KeywordIdeaResult {
  keyword: string
  avgMonthlySearches: number | null
  competition: 'LOW' | 'MEDIUM' | 'HIGH' | null
  competitionIndex: number | null
  lowTopOfPageBid: number | null
  highTopOfPageBid: number | null
  currency: string
}

export default function KeywordResearchPage() {
  const { language, isLoaded } = useDashboardLanguage()
  const dict = isLoaded ? getDashboardDictionary(language) : getDashboardDictionary('he')
  const t = dict.keywordResearch
  const isRTL = language === 'he'

  const [keyword, setKeyword] = useState('')
  const [country, setCountry] = useState('IL')
  const [selectedLanguage, setSelectedLanguage] = useState('he')
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [results, setResults] = useState<KeywordIdeaResult[]>([])
  const [selectedKeywords, setSelectedKeywords] = useState<Set<string>>(new Set())

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setResults([])
    setSelectedKeywords(new Set())

    if (!keyword.trim()) {
      setError(t.states.empty)
      return
    }

    setLoading(true)

    try {
      const response = await fetch('/api/google-ads/keyword-ideas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keyword: keyword.trim(),
          country,
          language: selectedLanguage,
          url: url.trim() || undefined,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        if (data.error === 'rate_limit_exceeded') {
          setError(t.states.errorQuota)
        } else if (data.stage === 'env_check') {
          setError(t.states.errorEnv)
        } else {
          setError(data.error || t.states.errorGeneral)
        }
        return
      }

      if (!data.results || data.results.length === 0) {
        setError(t.states.noResults)
        return
      }

      setResults(data.results)
    } catch (err) {
      setError(t.states.errorGeneral)
      console.error('Keyword research error:', err)
    } finally {
      setLoading(false)
    }
  }

  const toggleKeyword = (kw: string) => {
    const newSelected = new Set(selectedKeywords)
    if (newSelected.has(kw)) {
      newSelected.delete(kw)
    } else {
      newSelected.add(kw)
    }
    setSelectedKeywords(newSelected)
  }

  const selectAll = () => {
    setSelectedKeywords(new Set(results.map((r) => r.keyword)))
  }

  const deselectAll = () => {
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Keyword */}
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

            {/* URL */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                {t.form.url} <span className="text-xs text-slate-500">{t.form.urlOptional}</span>
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
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading || !keyword.trim()}
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

      {/* Results */}
      {results.length > 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 p-6">
          {/* Results Toolbar */}
          <div className={`flex flex-col sm:flex-row gap-2 mb-4 justify-between items-start sm:items-center`}>
            <div className={`text-sm text-slate-600 dark:text-slate-400`}>
              {t.results.keyword}: {results.length}
            </div>
            <div className="flex gap-2 flex-wrap">
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
                <button
                  onClick={copySelected}
                  className="text-xs px-3 py-1 rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors flex items-center gap-1"
                >
                  <Copy size={14} />
                  {t.results.copySelected}
                </button>
              )}
            </div>
          </div>

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
                    {t.results.monthlySearches}
                  </th>
                  <th className={`px-4 py-3 ${isRTL ? 'text-right' : 'text-left'} font-semibold text-slate-900 dark:text-slate-100`}>
                    {t.results.competition}
                  </th>
                  <th className={`px-4 py-3 ${isRTL ? 'text-right' : 'text-left'} font-semibold text-slate-900 dark:text-slate-100`}>
                    {t.results.lowCpc}
                  </th>
                  <th className={`px-4 py-3 ${isRTL ? 'text-right' : 'text-left'} font-semibold text-slate-900 dark:text-slate-100`}>
                    {t.results.highCpc}
                  </th>
                  <th className={`px-4 py-3 ${isRTL ? 'text-right' : 'text-left'} font-semibold text-slate-900 dark:text-slate-100`}>
                    {t.results.action}
                  </th>
                </tr>
              </thead>
              <tbody>
                {results.map((result, idx) => (
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
    </div>
  )
}
