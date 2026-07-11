import { createClient } from '@/lib/supabase/server'
import { COUNTRY_GEO_TARGETS, LANGUAGE_IDS, isValidCountry, isValidLanguage } from '@/lib/google-ads/constants'

interface TokenResponse {
  access_token?: string
  error?: string
  error_description?: string
}

interface GoogleAdsMonthlyVolume {
  year?: number | string
  month?: string
  monthlySearches?: number | string
}

interface GoogleAdsHistoricalResult {
  text?: string
  keywordMetrics?: {
    avgMonthlySearches?: number | string
    competition?: 'LOW' | 'MEDIUM' | 'HIGH'
    competitionIndex?: number | string
    monthlySearchVolumes?: GoogleAdsMonthlyVolume[]
  }
}

interface GoogleAdsResponse {
  results?: GoogleAdsHistoricalResult[]
  error?: {
    code?: number
    message?: string
    status?: string
    details?: unknown[]
  }
}

interface MonthlySearch {
  month: string
  year: number
  searches: number
}

const GOOGLE_ADS_API_VERSION = 'v22'

function toNumber(value: number | string | undefined | null): number | null {
  if (value === undefined || value === null || value === '') return null
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : null
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

function calculateTrend(volumes: MonthlySearch[]): {
  trend: 'up' | 'down' | 'stable' | 'seasonal' | 'unknown'
  peak: MonthlySearch | null
  lowest: MonthlySearch | null
} {
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

  const avg = sorted.reduce((sum, v) => sum + v.searches, 0) / sorted.length
  const variance = avg > 0 ? (peak.searches - lowest.searches) / avg : 0

  let trend: 'up' | 'down' | 'stable' | 'seasonal' = 'stable'
  if (lastAvg > firstAvg * 1.2) {
    trend = 'up'
  } else if (lastAvg < firstAvg * 0.8) {
    trend = 'down'
  } else if (variance > 2) {
    trend = 'seasonal'
  }

  return { trend, peak, lowest }
}

async function getGoogleAdsAccessToken(): Promise<string> {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_ADS_CLIENT_ID!,
      client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET!,
      refresh_token: process.env.GOOGLE_ADS_REFRESH_TOKEN!,
      grant_type: 'refresh_token',
    }).toString(),
  })

  const tokenData = (await response.json()) as TokenResponse

  if (!response.ok || !tokenData.access_token) {
    const desc = tokenData.error_description || tokenData.error || ''
    if (/invalid_grant/i.test(desc)) {
      throw new Error('reauth_required')
    } else if (/invalid_client/i.test(desc)) {
      throw new Error('client_credentials_invalid')
    }
    throw new Error('oauth_token_failed')
  }

  return tokenData.access_token
}

export async function POST(request: Request) {
  try {
    // Auth check
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return Response.json({ success: false, stage: 'auth', error: 'Unauthorized' }, { status: 401 })
    }

    // Parse and validate body
    let body: Record<string, unknown>
    try {
      body = await request.json()
    } catch {
      return Response.json(
        { success: false, stage: 'validation', error: 'Invalid JSON body' },
        { status: 400 }
      )
    }

    const keywordRaw = typeof body.keyword === 'string' ? body.keyword.trim() : ''
    const country = typeof body.country === 'string' ? body.country : 'IL'
    const language = typeof body.language === 'string' ? body.language : 'he'

    if (!keywordRaw) {
      return Response.json(
        { success: false, stage: 'validation', error: 'Keyword is required' },
        { status: 400 }
      )
    }

    if (!isValidCountry(country)) {
      return Response.json(
        { success: false, stage: 'validation', error: 'Unsupported country', received: country },
        { status: 400 }
      )
    }

    if (!isValidLanguage(language)) {
      return Response.json(
        { success: false, stage: 'validation', error: 'Unsupported language', received: language },
        { status: 400 }
      )
    }

    // Check required env vars
    const requiredEnvVars = [
      'GOOGLE_ADS_CLIENT_ID',
      'GOOGLE_ADS_CLIENT_SECRET',
      'GOOGLE_ADS_DEVELOPER_TOKEN',
      'GOOGLE_ADS_REFRESH_TOKEN',
      'GOOGLE_ADS_CUSTOMER_ID',
      'GOOGLE_ADS_LOGIN_CUSTOMER_ID',
    ] as const

    const missing = requiredEnvVars.filter((name) => !process.env[name])
    if (missing.length > 0) {
      return Response.json(
        { success: false, stage: 'env_check', error: 'Google Ads API not configured' },
        { status: 503 }
      )
    }

    const customerId = process.env.GOOGLE_ADS_CUSTOMER_ID!.replace(/-/g, '')
    const loginCustomerId = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID!.replace(/-/g, '')
    const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN!

    // Get access token
    let accessToken: string
    try {
      accessToken = await getGoogleAdsAccessToken()
    } catch (error) {
      const err = error instanceof Error ? error.message : 'unknown'
      if (err === 'reauth_required') {
        return Response.json(
          {
            success: false,
            stage: 'oauth',
            errorCode: 'GOOGLE_ADS_REAUTH_REQUIRED',
            error: 'Google Ads connection requires re-authentication',
            details: { reason: 'refresh_token_expired_or_revoked' },
          },
          { status: 401 }
        )
      } else if (err === 'client_credentials_invalid') {
        return Response.json(
          {
            success: false,
            stage: 'oauth',
            errorCode: 'GOOGLE_ADS_CLIENT_CREDENTIALS_INVALID',
            error: 'Google Ads OAuth credentials are invalid',
            details: { reason: 'client_id or client_secret invalid' },
          },
          { status: 503 }
        )
      }
      return Response.json(
        {
          success: false,
          stage: 'oauth',
          errorCode: 'GOOGLE_ADS_OAUTH_FAILED',
          error: 'Failed to obtain Google Ads access token',
        },
        { status: 502 }
      )
    }

    const geoTargetId = COUNTRY_GEO_TARGETS[country]
    const languageId = LANGUAGE_IDS[language]
    const geoTargetConstant = `geoTargetConstants/${geoTargetId}`
    const languageConstant = `languageConstants/${languageId}`

    // Build request body for GenerateKeywordHistoricalMetrics (REST API — camelCase)
    const requestBody = {
      keywords: [keywordRaw],
      geoTargetConstants: [geoTargetConstant],
      language: languageConstant,
      keywordPlanNetwork: 'GOOGLE_SEARCH',
      includeAdultKeywords: false,
    }

    console.log('[keyword-trends] request', {
      apiVersion: GOOGLE_ADS_API_VERSION,
      country,
      language,
      geoTargetConstant,
      languageConstant,
      keywordPresent: Boolean(keywordRaw),
    })

    const apiUrl = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${customerId}:generateKeywordHistoricalMetrics`

    const apiResponse = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'developer-token': developerToken,
        'login-customer-id': loginCustomerId,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    })

    if (!apiResponse.ok) {
      const errorBody = (await apiResponse.json().catch(() => ({}))) as GoogleAdsResponse
      const apiMessage = errorBody.error?.message || ''
      const apiStatus = errorBody.error?.status || ''

      console.error('[keyword-trends] google ads api error', {
        httpStatus: apiResponse.status,
        apiStatus,
        message: apiMessage.slice(0, 500),
      })

      const safeApiMessage = apiMessage.slice(0, 500)

      if (apiResponse.status === 401) {
        return Response.json(
          {
            success: false,
            stage: 'google_ads_api',
            error: 'Google Ads API authentication failed',
            apiStatus: apiResponse.status,
            apiMessage: safeApiMessage,
          },
          { status: 502 }
        )
      } else if (apiResponse.status === 403) {
        return Response.json(
          {
            success: false,
            stage: 'google_ads_api',
            error: 'Permission denied accessing Google Ads API',
            apiStatus: apiResponse.status,
            apiMessage: safeApiMessage,
          },
          { status: 502 }
        )
      } else if (apiResponse.status === 429) {
        return Response.json(
          {
            success: false,
            stage: 'google_ads_api',
            error: 'rate_limit_exceeded',
            apiStatus: apiResponse.status,
            apiMessage: safeApiMessage,
          },
          { status: 429 }
        )
      } else if (apiResponse.status === 400) {
        if (/resource.*exhausted/i.test(apiMessage) || /quota/i.test(apiMessage)) {
          return Response.json(
            {
              success: false,
              stage: 'google_ads_api',
              error: 'resource_exhausted',
              apiStatus: apiResponse.status,
              apiMessage: safeApiMessage,
            },
            { status: 429 }
          )
        }
        return Response.json(
          {
            success: false,
            stage: 'google_ads_api',
            error: 'Invalid request to Google Ads API',
            apiStatus: apiResponse.status,
            apiMessage: safeApiMessage,
            debug: {
              apiVersionUsed: GOOGLE_ADS_API_VERSION,
              endpointUsed: `customers/{customerId}:generateKeywordHistoricalMetrics`,
              country,
              language,
              geoTargetConstant,
              languageConstant,
              requestBodySentToGoogle: requestBody,
            },
          },
          { status: 502 }
        )
      }

      return Response.json(
        {
          success: false,
          stage: 'google_ads_api',
          error: 'Google Ads API request failed',
          apiStatus: apiResponse.status,
          apiMessage: safeApiMessage,
        },
        { status: 502 }
      )
    }

    let data: GoogleAdsResponse
    try {
      data = (await apiResponse.json()) as GoogleAdsResponse
    } catch {
      return Response.json(
        {
          success: false,
          stage: 'parse',
          error: 'Failed to parse Google Ads API response',
        },
        { status: 502 }
      )
    }

    // If no results or empty, return success with empty data — Modal will show "no data"
    if (!data.results || data.results.length === 0) {
      console.log('[keyword-trends] empty results from Google Ads')
      return Response.json({
        success: true,
        keyword: keywordRaw,
        avgMonthlySearches: 0,
        monthlySearchVolumes: [],
        trend: 'unknown',
        peakMonth: null,
        lowestMonth: null,
        debug: {
          apiVersionUsed: GOOGLE_ADS_API_VERSION,
          monthsCount: 0,
        },
      })
    }

    const firstResult = data.results[0]
    const metrics = firstResult.keywordMetrics || {}
    const avgMonthlySearches = toNumber(metrics.avgMonthlySearches) ?? 0

    const rawVolumes = metrics.monthlySearchVolumes || []
    const monthlySearchVolumes: MonthlySearch[] = rawVolumes
      .map((vol) => ({
        month: vol.month || 'UNKNOWN',
        year: toNumber(vol.year) ?? new Date().getFullYear(),
        searches: toNumber(vol.monthlySearches) ?? 0,
      }))
      .filter((v) => v.month !== 'UNKNOWN')

    console.log('[keyword-trends] parsed result', {
      keyword: keywordRaw,
      avgMonthlySearches,
      monthsCount: monthlySearchVolumes.length,
    })

    const { trend, peak, lowest } = calculateTrend(monthlySearchVolumes)

    const peakMonth = peak
      ? { month: formatMonthName(getMonthIndex(peak.month), language), year: peak.year, searches: peak.searches }
      : null

    const lowestMonth = lowest
      ? { month: formatMonthName(getMonthIndex(lowest.month), language), year: lowest.year, searches: lowest.searches }
      : null

    return Response.json({
      success: true,
      keyword: keywordRaw,
      avgMonthlySearches,
      monthlySearchVolumes,
      trend,
      peakMonth,
      lowestMonth,
      debug: {
        apiVersionUsed: GOOGLE_ADS_API_VERSION,
        monthsCount: monthlySearchVolumes.length,
      },
    })
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error'
    console.error('[keyword-trends] unexpected error', errorMsg)
    return Response.json(
      { success: false, stage: 'unexpected', error: 'An unexpected error occurred' },
      { status: 500 }
    )
  }
}
