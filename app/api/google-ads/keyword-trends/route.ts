import { NextRequest, NextResponse } from 'next/server'
import { COUNTRY_GEO_TARGETS, LANGUAGE_IDS, SUPPORTED_COUNTRIES, SUPPORTED_LANGUAGES } from '@/lib/google-ads/constants'

interface TrendRequest {
  keyword: string
  country: string
  language: string
}

interface MonthlySearch {
  month: string
  year: number
  searches: number
}

interface TrendResponse {
  success: boolean
  keyword: string
  avgMonthlySearches: number | null
  monthlySearchVolumes: MonthlySearch[]
  trend: 'up' | 'down' | 'stable' | 'seasonal' | 'unknown'
  peakMonth: { month: string; year: number; searches: number } | null
  lowestMonth: { month: string; year: number; searches: number } | null
  debug?: {
    apiVersionUsed: string
    monthsCount: number
  }
}

function calculateTrend(volumes: MonthlySearch[]): { trend: string; peak: MonthlySearch | null; lowest: MonthlySearch | null } {
  if (volumes.length < 6) {
    return { trend: 'unknown', peak: null, lowest: null }
  }

  const sorted = [...volumes].sort((a, b) => {
    const aDate = new Date(a.year, getMonthIndex(a.month))
    const bDate = new Date(b.year, getMonthIndex(b.month))
    return aDate.getTime() - bDate.getTime()
  })

  const firstThree = sorted.slice(0, 3)
  const lastThree = sorted.slice(-3)

  const firstAvg = firstThree.reduce((sum, v) => sum + v.searches, 0) / firstThree.length
  const lastAvg = lastThree.reduce((sum, v) => sum + v.searches, 0) / lastThree.length

  const peak = sorted.reduce((max, v) => (v.searches > max.searches ? v : max))
  const lowest = sorted.reduce((min, v) => (v.searches < min.searches ? v : min))

  const variance = (peak.searches - lowest.searches) / (sorted.reduce((sum, v) => sum + v.searches, 0) / sorted.length)

  let trend = 'stable'
  if (lastAvg > firstAvg * 1.2) {
    trend = 'up'
  } else if (lastAvg < firstAvg * 0.8) {
    trend = 'down'
  } else if (variance > 2) {
    trend = 'seasonal'
  }

  return { trend, peak, lowest }
}

function getMonthIndex(monthName: string): number {
  const months: Record<string, number> = {
    JANUARY: 0, FEBRUARY: 1, MARCH: 2, APRIL: 3, MAY: 4, JUNE: 5,
    JULY: 6, AUGUST: 7, SEPTEMBER: 8, OCTOBER: 9, NOVEMBER: 10, DECEMBER: 11,
  }
  return months[monthName] ?? 0
}

function formatMonthName(monthIndex: number, language: string): string {
  const months_en = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
  const months_he = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר']
  const monthList = language === 'he' ? months_he : months_en
  return monthList[monthIndex] || ''
}

async function getAccessToken(): Promise<string> {
  const clientId = process.env.GOOGLE_ADS_CLIENT_ID
  const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET
  const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Google Ads credentials not configured')
  }

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }).toString(),
  })

  if (!response.ok) {
    throw new Error('Failed to obtain access token')
  }

  const data = await response.json()
  return data.access_token
}

async function fetchTrendData(
  keyword: string,
  country: string,
  language: string,
  accessToken: string,
): Promise<{ avgMonthlySearches: number | null; monthlySearchVolumes: MonthlySearch[] }> {
  const customerId = (process.env.GOOGLE_ADS_CUSTOMER_ID || '').replace(/-/g, '')
  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN
  const loginCustomerId = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID

  if (!customerId || !developerToken || !loginCustomerId) {
    throw new Error('Google Ads API configuration incomplete')
  }

  const geoTargetId = COUNTRY_GEO_TARGETS[country as keyof typeof COUNTRY_GEO_TARGETS]
  const languageId = LANGUAGE_IDS[language as keyof typeof LANGUAGE_IDS]

  if (!geoTargetId || !languageId) {
    throw new Error('Invalid country or language')
  }

  const url = `https://googleads.googleapis.com/v22/customers/${customerId}:generateKeywordHistoricalMetrics`

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'developer-token': developerToken,
      'login-customer-id': loginCustomerId,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      keywords: [keyword],
      geoTargetConstants: [`geoTargetConstants/${geoTargetId}`],
      languageConstants: `languageConstants/${languageId}`,
      keywordPlanNetwork: 'GOOGLE_SEARCH',
    }),
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    throw new Error(`Google Ads API error: ${response.status}`)
  }

  const data = await response.json()

  if (!data.results || data.results.length === 0) {
    return { avgMonthlySearches: null, monthlySearchVolumes: [] }
  }

  const result = data.results[0]
  const avgMonthlySearches = result.avgMonthlySearches ?? null

  const monthlySearchVolumes: MonthlySearch[] = (result.monthlySearchVolumes || []).map(
    (vol: { month?: string; year?: number; monthlySearchVolume?: number }) => ({
      month: vol.month || 'UNKNOWN',
      year: vol.year || new Date().getFullYear(),
      searches: vol.monthlySearchVolume || 0,
    }),
  )

  return { avgMonthlySearches, monthlySearchVolumes }
}

export async function POST(request: NextRequest) {
  try {
    const body: TrendRequest = await request.json()

    const { keyword, country = 'IL', language = 'he' } = body

    if (!keyword || keyword.trim().length === 0) {
      return NextResponse.json({ success: false, error: 'Keyword is required' }, { status: 400 })
    }

    if (!SUPPORTED_COUNTRIES.includes(country as any)) {
      return NextResponse.json({ success: false, error: 'Unsupported country' }, { status: 400 })
    }

    if (!SUPPORTED_LANGUAGES.includes(language as any)) {
      return NextResponse.json({ success: false, error: 'Unsupported language' }, { status: 400 })
    }

    const accessToken = await getAccessToken()
    const { avgMonthlySearches, monthlySearchVolumes } = await fetchTrendData(keyword, country, language, accessToken)

    const { trend, peak, lowest } = calculateTrend(monthlySearchVolumes)

    const peakMonth = peak
      ? { month: formatMonthName(getMonthIndex(peak.month), language), year: peak.year, searches: peak.searches }
      : null

    const lowestMonth = lowest
      ? { month: formatMonthName(getMonthIndex(lowest.month), language), year: lowest.year, searches: lowest.searches }
      : null

    const response: TrendResponse = {
      success: true,
      keyword,
      avgMonthlySearches,
      monthlySearchVolumes,
      trend: trend as 'up' | 'down' | 'stable' | 'seasonal' | 'unknown',
      peakMonth,
      lowestMonth,
      debug: {
        apiVersionUsed: 'v22',
        monthsCount: monthlySearchVolumes.length,
      },
    }

    return NextResponse.json(response)
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Unknown error'

    if (error.includes('Google Ads credentials not configured') || error.includes('configuration incomplete')) {
      return NextResponse.json({ success: false, error: 'Google Ads API not configured' }, { status: 503 })
    }

    console.error('Keyword trends error:', error)
    return NextResponse.json({ success: false, error: 'Failed to fetch trend data' }, { status: 500 })
  }
}
