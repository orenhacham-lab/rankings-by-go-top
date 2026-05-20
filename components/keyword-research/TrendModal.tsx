'use client'

import { X, Loader2 } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

interface MonthlySearch {
  month: string
  year: number
  searches: number
}

interface TrendModalProps {
  open: boolean
  onClose: () => void
  keyword: string
  language: 'he' | 'en'
  isRTL: boolean
  loading?: boolean
  error?: string
  data?: {
    avgMonthlySearches: number | null
    monthlySearchVolumes: MonthlySearch[]
    trend: 'up' | 'down' | 'stable' | 'seasonal' | 'unknown'
    peakMonth: { month: string; year: number; searches: number } | null
    lowestMonth: { month: string; year: number; searches: number } | null
  }
}

const translations = {
  he: {
    title: (keyword: string) => `טרנד חיפושים: ${keyword}`,
    loading: 'טוען נתוני טרנד...',
    error: 'לא הצליח לטעון את נתוני הטרנד. אנא נסה שוב מאוחר יותר.',
    noData: 'אין נתוני טרנד זמינים לביטוי זה.',
    monthlyAverage: 'ממוצע חודשי',
    trend: 'טרנד',
    trendRising: 'עולה',
    trendDeclining: 'יורד',
    trendStable: 'יציב',
    trendSeasonal: 'עונתי',
    trendUnknown: 'לא ידוע',
    peakMonth: 'חודש שיא',
    lowestMonth: 'חודש נמוך ביותר',
    disclaimer: 'הנתונים מבוססים על Google Ads Keyword Planner ועשויים להיות משוערים.',
    close: 'סגור',
  },
  en: {
    title: (keyword: string) => `Search Trend: ${keyword}`,
    loading: 'Loading trend data...',
    error: 'Trend data could not be loaded right now. Please try again later.',
    noData: 'No trend data is available for this keyword.',
    monthlyAverage: 'Monthly average',
    trend: 'Trend',
    trendRising: 'Rising',
    trendDeclining: 'Declining',
    trendStable: 'Stable',
    trendSeasonal: 'Seasonal',
    trendUnknown: 'Unknown',
    peakMonth: 'Peak month',
    lowestMonth: 'Lowest month',
    disclaimer: 'Data is based on Google Ads Keyword Planner and may be approximate.',
    close: 'Close',
  },
}

const getTrendLabel = (trend: string, labels: typeof translations.en): string => {
  const trendMap: Record<string, string> = {
    up: labels.trendRising,
    down: labels.trendDeclining,
    stable: labels.trendStable,
    seasonal: labels.trendSeasonal,
    unknown: labels.trendUnknown,
  }
  return trendMap[trend] || labels.trendUnknown
}

const getTrendColor = (trend: string): string => {
  switch (trend) {
    case 'up':
      return 'text-green-600 dark:text-green-400'
    case 'down':
      return 'text-red-600 dark:text-red-400'
    case 'stable':
      return 'text-blue-600 dark:text-blue-400'
    case 'seasonal':
      return 'text-purple-600 dark:text-purple-400'
    default:
      return 'text-slate-600 dark:text-slate-400'
  }
}

export default function TrendModal({ open, onClose, keyword, language, isRTL, loading = false, error, data }: TrendModalProps) {
  if (!open) return null

  const labels = translations[language]

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className={`bg-white dark:bg-slate-900 rounded-lg shadow-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto ${isRTL ? 'rtl' : 'ltr'}`}>
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-700 sticky top-0 bg-white dark:bg-slate-900">
          <h2 className={`text-lg font-bold text-slate-900 dark:text-slate-100 flex-1 ${isRTL ? 'text-right' : 'text-left'}`}>
            {labels.title(keyword)}
          </h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 ml-2">
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={24} className="animate-spin text-blue-600 dark:text-blue-400" />
              <span className={`ml-2 text-slate-600 dark:text-slate-400 ${isRTL ? 'ml-0 mr-2' : ''}`}>{labels.loading}</span>
            </div>
          )}

          {error && (
            <div className="p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
              <p className="text-red-700 dark:text-red-400">{labels.error}</p>
            </div>
          )}

          {!loading && !error && data && data.monthlySearchVolumes.length === 0 && (
            <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
              <p className="text-slate-600 dark:text-slate-400">{labels.noData}</p>
            </div>
          )}

          {!loading && !error && data && data.monthlySearchVolumes.length > 0 && (
            <div className="space-y-6">
              {/* KPI Stats */}
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                {/* Monthly Average */}
                <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                  <p className={`text-xs font-medium text-slate-600 dark:text-slate-400 ${isRTL ? 'text-right' : 'text-left'}`}>
                    {labels.monthlyAverage}
                  </p>
                  <p className={`text-lg font-bold text-slate-900 dark:text-slate-100 mt-1 ${isRTL ? 'text-right' : 'text-left'}`}>
                    {data.avgMonthlySearches ? data.avgMonthlySearches.toLocaleString() : '—'}
                  </p>
                </div>

                {/* Trend */}
                <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                  <p className={`text-xs font-medium text-slate-600 dark:text-slate-400 ${isRTL ? 'text-right' : 'text-left'}`}>
                    {labels.trend}
                  </p>
                  <p className={`text-lg font-bold mt-1 ${getTrendColor(data.trend)} ${isRTL ? 'text-right' : 'text-left'}`}>
                    {getTrendLabel(data.trend, labels)}
                  </p>
                </div>

                {/* Peak Month */}
                {data.peakMonth && (
                  <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                    <p className={`text-xs font-medium text-slate-600 dark:text-slate-400 ${isRTL ? 'text-right' : 'text-left'}`}>
                      {labels.peakMonth}
                    </p>
                    <p className={`text-sm font-semibold text-slate-900 dark:text-slate-100 mt-1 ${isRTL ? 'text-right' : 'text-left'}`}>
                      {data.peakMonth.month}
                    </p>
                    <p className={`text-xs text-slate-600 dark:text-slate-400 ${isRTL ? 'text-right' : 'text-left'}`}>
                      {data.peakMonth.searches.toLocaleString()}
                    </p>
                  </div>
                )}

                {/* Lowest Month */}
                {data.lowestMonth && (
                  <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                    <p className={`text-xs font-medium text-slate-600 dark:text-slate-400 ${isRTL ? 'text-right' : 'text-left'}`}>
                      {labels.lowestMonth}
                    </p>
                    <p className={`text-sm font-semibold text-slate-900 dark:text-slate-100 mt-1 ${isRTL ? 'text-right' : 'text-left'}`}>
                      {data.lowestMonth.month}
                    </p>
                    <p className={`text-xs text-slate-600 dark:text-slate-400 ${isRTL ? 'text-right' : 'text-left'}`}>
                      {data.lowestMonth.searches.toLocaleString()}
                    </p>
                  </div>
                )}
              </div>

              {/* Chart */}
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data.monthlySearchVolumes}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis
                      dataKey="month"
                      tick={{ fontSize: 12 }}
                      stroke="#9ca3af"
                      style={{ direction: isRTL ? 'rtl' : 'ltr' }}
                    />
                    <YAxis tick={{ fontSize: 12 }} stroke="#9ca3af" />
                    <Tooltip
                      formatter={(value: any) => (typeof value === 'number' ? value.toLocaleString() : value)}
                      contentStyle={{
                        backgroundColor: '#1e293b',
                        border: '1px solid #475569',
                        borderRadius: '8px',
                        color: '#f1f5f9',
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="searches"
                      stroke="#3b82f6"
                      strokeWidth={2}
                      dot={{ fill: '#3b82f6', r: 4 }}
                      activeDot={{ r: 6 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Disclaimer */}
              <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                <p className={`text-xs text-blue-700 dark:text-blue-400 ${isRTL ? 'text-right' : 'text-left'}`}>
                  {labels.disclaimer}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
