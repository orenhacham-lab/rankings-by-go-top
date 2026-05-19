import { createClient } from '@/lib/supabase/server'
import { COUNTRY_GEO_TARGETS, LANGUAGE_IDS, isValidCountry, isValidLanguage } from '@/lib/google-ads/constants'

interface TokenResponse {
  access_token?: string
  error?: string
  error_description?: string
}

interface HistoricalKeywordResult {
  text?: string
  keywordMetrics?: {
    avgMonthlySearches?: number | string
    competition?: 'LOW' | 'MEDIUM' | 'HIGH'
    competitionIndex?: number | string
    lowTopOfPageBidMicros?: number | string
    highTopOfPageBidMicros?: number | string
  }
}

interface HistoricalMetricsResponse {
  results?: HistoricalKeywordResult[]
  error?: {
    code?: number
    message?: string
    status?: string
  }
}

const GOOGLE_ADS_API_VERSION = 'v22'
const BATCH_SIZE = 50

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
    throw new Error('oauth_token_failed')
  }
  return tokenData.access_token
}

function toNumber(value: number | string | undefined): number | null {
  if (value === undefined || value === null || value === '') return null
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : null
}

function currencyForCountry(country: string): string {
  if (country === 'IL') return 'ILS'
  if (country === 'GR' || country === 'CY') return 'EUR'
  if (country === 'GB') return 'GBP'
  return 'USD'
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    let body: Record<string, unknown>
    try {
      body = await request.json()
    } catch {
      return Response.json({ success: false, error: 'Invalid JSON body' }, { status: 400 })
    }

    const projectId = typeof body.projectId === 'string' ? body.projectId : ''
    const targetIdsRaw = Array.isArray(body.targetIds) ? body.targetIds : null
    const forceRefresh = body.forceRefresh === true

    if (!projectId) {
      return Response.json({ success: false, error: 'Project ID is required' }, { status: 400 })
    }

    // Verify project ownership and get country/language
    const { data: project } = await supabase
      .from('projects')
      .select('id, user_id, country, language')
      .eq('id', projectId)
      .single()

    if (!project || project.user_id !== user.id) {
      return Response.json(
        { success: false, error: 'Project not found or access denied' },
        { status: 403 }
      )
    }

    const country = typeof project.country === 'string' ? project.country : ''
    const language = typeof project.language === 'string' ? project.language : ''
    if (!isValidCountry(country) || !isValidLanguage(language)) {
      return Response.json(
        {
          success: false,
          error: 'Project country/language not supported by Google Ads API',
          country,
          language,
        },
        { status: 400 }
      )
    }

    // Fetch tracking_targets for this project
    let query = supabase
      .from('tracking_targets')
      .select('id, keyword, metrics_updated_at')
      .eq('project_id', projectId)
      .eq('is_active', true)

    if (Array.isArray(targetIdsRaw) && targetIdsRaw.length > 0) {
      const validIds = targetIdsRaw.filter((id): id is string => typeof id === 'string')
      query = query.in('id', validIds)
    }

    const { data: targets, error: fetchError } = await query
    if (fetchError) {
      console.error('[keyword-metrics] fetch error', fetchError.message)
      return Response.json({ success: false, error: 'Failed to fetch tracking targets' }, { status: 500 })
    }

    const allTargets = targets || []

    // Filter to targets that need refresh: never fetched OR older than 30 days
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000
    const targetsToFetch = forceRefresh
      ? allTargets
      : allTargets.filter((t) => {
          if (!t.metrics_updated_at) return true
          const updated = new Date(t.metrics_updated_at as string).getTime()
          return Number.isFinite(updated) && updated < thirtyDaysAgo
        })

    if (targetsToFetch.length === 0) {
      return Response.json({
        success: true,
        updated: 0,
        noData: 0,
        skipped: allTargets.length,
        message: 'All keywords are up to date',
      })
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
        { success: false, error: 'Google Ads API not configured' },
        { status: 503 }
      )
    }

    const customerId = process.env.GOOGLE_ADS_CUSTOMER_ID!.replace(/-/g, '')
    const loginCustomerId = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID!.replace(/-/g, '')
    const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN!

    let accessToken: string
    try {
      accessToken = await getGoogleAdsAccessToken()
    } catch {
      return Response.json(
        { success: false, error: 'Failed to obtain access token' },
        { status: 503 }
      )
    }

    const geoTargetId = COUNTRY_GEO_TARGETS[country]
    const languageId = LANGUAGE_IDS[language]
    const apiUrl = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${customerId}:generateKeywordHistoricalMetrics`
    const currency = currencyForCountry(country)
    const nowIso = new Date().toISOString()

    // Build keyword → target IDs map (handle duplicate keywords pointing to multiple targets).
    const keywordToTargetIds = new Map<string, string[]>()
    for (const t of targetsToFetch) {
      const kw = (t.keyword as string).trim()
      if (!kw) continue
      const key = kw.toLowerCase()
      const ids = keywordToTargetIds.get(key) || []
      ids.push(t.id as string)
      keywordToTargetIds.set(key, ids)
    }

    const uniqueKeywords = Array.from(keywordToTargetIds.keys())
    const metricsByKeyword = new Map<string, HistoricalKeywordResult['keywordMetrics']>()

    // Batch keywords through Google Ads API
    for (let i = 0; i < uniqueKeywords.length; i += BATCH_SIZE) {
      const batch = uniqueKeywords.slice(i, i + BATCH_SIZE)
      const requestBody = {
        keywords: batch,
        geoTargetConstants: [`geoTargetConstants/${geoTargetId}`],
        language: `languageConstants/${languageId}`,
        keywordPlanNetwork: 'GOOGLE_SEARCH',
      }

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
        const errBody = (await apiResponse.json().catch(() => ({}))) as HistoricalMetricsResponse
        console.error('[keyword-metrics] api error', {
          httpStatus: apiResponse.status,
          message: errBody.error?.message,
          batchIndex: i,
        })
        if (apiResponse.status === 429) {
          return Response.json(
            { success: false, error: 'rate_limit_exceeded' },
            { status: 429 }
          )
        }
        return Response.json(
          { success: false, error: 'Google Ads API request failed' },
          { status: 502 }
        )
      }

      const data = (await apiResponse.json()) as HistoricalMetricsResponse
      for (const r of data.results || []) {
        if (r.text) {
          metricsByKeyword.set(r.text.toLowerCase(), r.keywordMetrics)
        }
      }
    }

    // Update each target with its metrics
    let updated = 0
    let noData = 0
    const errors: string[] = []

    for (const [kw, targetIds] of keywordToTargetIds.entries()) {
      const m = metricsByKeyword.get(kw)
      if (!m) {
        noData += targetIds.length
        continue
      }

      const lowMicros = toNumber(m.lowTopOfPageBidMicros)
      const highMicros = toNumber(m.highTopOfPageBidMicros)
      const updatePayload = {
        avg_monthly_searches: toNumber(m.avgMonthlySearches),
        competition: m.competition ?? null,
        competition_index: toNumber(m.competitionIndex),
        low_top_of_page_bid: lowMicros !== null ? lowMicros / 1_000_000 : null,
        high_top_of_page_bid: highMicros !== null ? highMicros / 1_000_000 : null,
        metrics_currency: currency,
        metrics_updated_at: nowIso,
      }

      const { error: updateError } = await supabase
        .from('tracking_targets')
        .update(updatePayload)
        .in('id', targetIds)

      if (updateError) {
        console.error('[keyword-metrics] update error', updateError.message)
        errors.push(kw)
      } else {
        updated += targetIds.length
      }
    }

    return Response.json({
      success: true,
      updated,
      noData,
      errors: errors.length,
      skipped: allTargets.length - targetsToFetch.length,
      totalProcessed: targetsToFetch.length,
    })
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error'
    console.error('[keyword-metrics] unexpected error', errorMsg)
    return Response.json(
      { success: false, error: 'An unexpected error occurred' },
      { status: 500 }
    )
  }
}
