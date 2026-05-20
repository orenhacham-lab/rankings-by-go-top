import { createClient } from '@/lib/supabase/server'
import { COUNTRY_GEO_TARGETS, LANGUAGE_IDS, isValidCountry, isValidLanguage } from '@/lib/google-ads/constants'

interface TokenResponse {
  access_token?: string
  error?: string
  error_description?: string
}

// Google Ads REST API uses camelCase, not snake_case.
interface GoogleAdsKeywordIdea {
  text?: string
  keywordIdeaMetrics?: {
    avgMonthlySearches?: number | string
    competition?: 'LOW' | 'MEDIUM' | 'HIGH'
    competitionIndex?: number | string
    lowTopOfPageBidMicros?: number | string
    highTopOfPageBidMicros?: number | string
  }
}

interface GoogleAdsResponse {
  results?: GoogleAdsKeywordIdea[]
  nextPageToken?: string
  error?: {
    code?: number
    message?: string
    status?: string
    details?: unknown[]
  }
}

export interface KeywordIdeaResult {
  keyword: string
  avgMonthlySearches: number | null
  competition: 'LOW' | 'MEDIUM' | 'HIGH' | null
  competitionIndex: number | null
  lowTopOfPageBid: number | null
  highTopOfPageBid: number | null
  currency: string
}

const GOOGLE_ADS_API_VERSION = 'v22'

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
      throw new Error('refresh_token_invalid')
    } else if (/invalid_client/i.test(desc)) {
      throw new Error('client_credentials_invalid')
    }
    throw new Error('oauth_token_failed')
  }

  return tokenData.access_token
}

function toNumber(value: number | string | undefined): number | null {
  if (value === undefined || value === null || value === '') return null
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : null
}

export async function POST(request: Request) {
  try {
    // Auth check
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return Response.json({ error: 'Unauthorized', stage: 'auth' }, { status: 401 })
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
    const urlRaw = typeof body.url === 'string' ? body.url.trim() : ''
    const minMonthlySearches = typeof body.minMonthlySearches === 'number' ? Math.max(0, body.minMonthlySearches) : 30
    // Default to keyword mode when researchType is missing or invalid — preserves
    // existing keyword-only callers exactly.
    const researchTypeRaw = typeof body.researchType === 'string' ? body.researchType : 'keyword'
    const researchType: 'keyword' | 'url' | 'keyword_url' =
      researchTypeRaw === 'url' || researchTypeRaw === 'keyword_url' ? researchTypeRaw : 'keyword'

    // resultsLimit: how many results to return to the client. Allowed: 100, 250, 500.
    // Missing/invalid → 100. Hard cap at 500.
    const ALLOWED_RESULT_LIMITS = [100, 250, 500] as const
    const resultsLimitRaw = typeof body.resultsLimit === 'number' ? body.resultsLimit : 100
    const resultsLimit: 100 | 250 | 500 = (ALLOWED_RESULT_LIMITS as readonly number[]).includes(resultsLimitRaw)
      ? (resultsLimitRaw as 100 | 250 | 500)
      : 100

    if (!isValidCountry(country)) {
      return Response.json(
        {
          success: false,
          stage: 'validation',
          error: 'Unsupported country',
          received: country,
          supported: Object.keys(COUNTRY_GEO_TARGETS),
        },
        { status: 400 }
      )
    }

    if (!isValidLanguage(language)) {
      return Response.json(
        {
          success: false,
          stage: 'validation',
          error: 'Unsupported language',
          received: language,
          supported: Object.keys(LANGUAGE_IDS),
        },
        { status: 400 }
      )
    }

    // Validate URL when the research type requires it.
    let validUrl: string | undefined
    if (researchType === 'url' || researchType === 'keyword_url') {
      if (!urlRaw) {
        return Response.json(
          { success: false, stage: 'validation', error: 'Invalid URL' },
          { status: 400 }
        )
      }
      try {
        const u = new URL(urlRaw)
        if (u.protocol !== 'http:' && u.protocol !== 'https:') {
          return Response.json(
            { success: false, stage: 'validation', error: 'Invalid URL' },
            { status: 400 }
          )
        }
        validUrl = urlRaw
      } catch {
        return Response.json(
          { success: false, stage: 'validation', error: 'Invalid URL' },
          { status: 400 }
        )
      }
    }

    // Validate keyword when the research type requires it.
    if (researchType === 'keyword' || researchType === 'keyword_url') {
      if (!keywordRaw) {
        return Response.json(
          { success: false, stage: 'validation', error: 'Keyword is required' },
          { status: 400 }
        )
      }
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
      if (err === 'refresh_token_invalid') {
        return Response.json(
          { success: false, stage: 'oauth', error: 'Google Ads refresh token is invalid or expired' },
          { status: 503 }
        )
      } else if (err === 'client_credentials_invalid') {
        return Response.json(
          { success: false, stage: 'oauth', error: 'Google Ads OAuth credentials are invalid' },
          { status: 503 }
        )
      }
      return Response.json(
        { success: false, stage: 'oauth', error: 'Failed to obtain Google Ads access token' },
        { status: 502 }
      )
    }

    // Build the request body for GenerateKeywordIdeas (REST API — camelCase).
    // The API accepts ONE of: keywordSeed, urlSeed, keywordAndUrlSeed, siteSeed.
    const geoTargetId = COUNTRY_GEO_TARGETS[country]
    const languageId = LANGUAGE_IDS[language]

    // Map researchType to the Google Ads seed field. Each request sends exactly
    // one seed type (oneof).
    type SeedField =
      | { keywordSeed: { keywords: string[] } }
      | { urlSeed: { url: string } }
      | { keywordAndUrlSeed: { url: string; keywords: string[] } }

    let seed: SeedField
    let seedType: 'keywordSeed' | 'urlSeed' | 'keywordAndUrlSeed'
    let seedKeywords: string[] = []

    if (researchType === 'url') {
      seedType = 'urlSeed'
      seed = { urlSeed: { url: validUrl! } }
    } else if (researchType === 'keyword_url') {
      seedType = 'keywordAndUrlSeed'
      seedKeywords = [keywordRaw]
      seed = { keywordAndUrlSeed: { url: validUrl!, keywords: seedKeywords } }
    } else {
      seedType = 'keywordSeed'
      seedKeywords = [keywordRaw]
      seed = { keywordSeed: { keywords: seedKeywords } }
    }

    const requestBody = {
      ...seed,
      geoTargetConstants: [`geoTargetConstants/${geoTargetId}`],
      language: `languageConstants/${languageId}`,
      includeAdultKeywords: false,
      keywordPlanNetwork: 'GOOGLE_SEARCH',
      pageSize: 1000,
    }

    // Safe server-side debug — no secrets.
    console.log('[keyword-ideas] request', {
      apiVersion: GOOGLE_ADS_API_VERSION,
      researchType,
      country,
      language,
      geoTarget: `geoTargetConstants/${geoTargetId}`,
      languageConstant: `languageConstants/${languageId}`,
      seedType,
      seedKeywords,
      hasUrl: Boolean(validUrl),
      customerIdPresent: Boolean(customerId),
      loginCustomerIdPresent: Boolean(loginCustomerId),
      minMonthlySearches,
      pageSize: requestBody.pageSize,
    })

    // Call Google Ads API with pagination support
    const apiUrl = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${customerId}:generateKeywordIdeas`

    const allRawResults: GoogleAdsKeywordIdea[] = []
    let nextPageToken: string | undefined = undefined
    let pageCount = 0
    const MAX_PAGES = 5 // Fetch up to 5 pages (500 results max)

    do {
      pageCount++
      const pageRequestBody = {
        ...requestBody,
        ...(nextPageToken ? { pageToken: nextPageToken } : {}),
      }

      if (pageCount === 1) {
        console.log('[keyword-ideas] first page request body', {
          bodyKeys: Object.keys(pageRequestBody),
          seedType,
          seedKeywords,
          hasPageToken: Boolean(nextPageToken),
        })
      }

      const apiResponse = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'developer-token': developerToken,
          'login-customer-id': loginCustomerId,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(pageRequestBody),
      })

      if (!apiResponse.ok) {
        const errorBody = (await apiResponse.json().catch(() => ({}))) as GoogleAdsResponse
        const apiMessage = errorBody.error?.message || ''
        const apiStatus = errorBody.error?.status || ''

        // Safe server-side log of the API error (Google does not return secrets here).
        console.error('[keyword-ideas] google ads api error', {
          httpStatus: apiResponse.status,
          apiStatus,
          message: apiMessage,
          page: pageCount,
        })

        if (apiResponse.status === 401) {
          return Response.json(
            { success: false, stage: 'google_ads_api', error: 'Google Ads API authentication failed' },
            { status: 502 }
          )
        } else if (apiResponse.status === 403) {
          if (/developer token/i.test(apiMessage)) {
            return Response.json(
              { success: false, stage: 'google_ads_api', error: 'Developer token is invalid or not approved' },
              { status: 502 }
            )
          }
          return Response.json(
            { success: false, stage: 'google_ads_api', error: 'Permission denied accessing Google Ads API' },
            { status: 502 }
          )
        } else if (apiResponse.status === 429) {
          return Response.json(
            { success: false, stage: 'google_ads_api', error: 'rate_limit_exceeded' },
            { status: 429 }
          )
        } else if (apiResponse.status === 400) {
          return Response.json(
            {
              success: false,
              stage: 'google_ads_api',
              error: 'Invalid request to Google Ads API',
              apiMessage: apiMessage.slice(0, 300),
            },
            { status: 502 }
          )
        }

        return Response.json(
          { success: false, stage: 'google_ads_api', error: 'Google Ads API request failed', status: apiResponse.status },
          { status: 502 }
        )
      }

      const data = (await apiResponse.json()) as GoogleAdsResponse
      const pageResultCount = data.results?.length ?? 0
      console.log(`[keyword-ideas] page ${pageCount} fetched`, {
        resultsInThisPage: pageResultCount,
        totalSoFar: allRawResults.length + pageResultCount,
        hasNextPageToken: Boolean(data.nextPageToken),
      })
      if (data.results) {
        allRawResults.push(...data.results)
      }
      nextPageToken = data.nextPageToken
    } while (nextPageToken && pageCount < MAX_PAGES)

    // Whether Google indicated more pages exist (true if last page returned a nextPageToken).
    const hasNextPageToken = Boolean(nextPageToken)

    const rawResultsCount = allRawResults.length
    const firstRawKeywords = allRawResults
      .slice(0, 10)
      .map((r) => r.text || '')
      .filter((s) => s.length > 0)

    // Detailed first raw results (with metrics) for debugging.
    const firstRawResults = allRawResults.slice(0, 10).map((r) => ({
      text: r.text || '',
      avgMonthlySearches: toNumber(r.keywordIdeaMetrics?.avgMonthlySearches),
      competition: r.keywordIdeaMetrics?.competition ?? null,
      competitionIndex: toNumber(r.keywordIdeaMetrics?.competitionIndex),
    }))

    // Normalize results — Google Ads REST returns camelCase.
    // No exact-match or originalKeyword filtering — keep all keyword ideas returned by Google.
    const allResults: KeywordIdeaResult[] = allRawResults
      .filter((idea) => idea.text)
      .map((idea) => {
        const metrics = idea.keywordIdeaMetrics || {}
        const lowMicros = toNumber(metrics.lowTopOfPageBidMicros)
        const highMicros = toNumber(metrics.highTopOfPageBidMicros)
        return {
          keyword: idea.text!,
          avgMonthlySearches: toNumber(metrics.avgMonthlySearches),
          competition: metrics.competition ?? null,
          competitionIndex: toNumber(metrics.competitionIndex),
          lowTopOfPageBid: lowMicros !== null ? lowMicros / 1_000_000 : null,
          highTopOfPageBid: highMicros !== null ? highMicros / 1_000_000 : null,
          currency: country === 'IL' ? 'ILS' : country === 'GR' || country === 'CY' ? 'EUR' : country === 'GB' ? 'GBP' : 'USD',
        }
      })

    // Deduplicate normalized results by keyword (case-insensitive, trimmed).
    const seenKeywords = new Set<string>()
    const dedupedResults: KeywordIdeaResult[] = []
    for (const r of allResults) {
      const key = r.keyword.trim().toLowerCase()
      if (!seenKeywords.has(key)) {
        seenKeywords.add(key)
        dedupedResults.push(r)
      }
    }

    const normalizedResultsCount = dedupedResults.length

    // Filter by minimum monthly searches.
    // When minMonthlySearches === 0, include results with null avgMonthlySearches too.
    const filteredResults = dedupedResults.filter((r) => {
      if (minMonthlySearches === 0) return true
      return r.avgMonthlySearches !== null && r.avgMonthlySearches >= minMonthlySearches
    })

    // Sort by avgMonthlySearches DESC, then competitionIndex DESC
    filteredResults.sort((a, b) => {
      const av = a.avgMonthlySearches ?? -1
      const bv = b.avgMonthlySearches ?? -1
      if (bv !== av) return bv - av
      const ac = a.competitionIndex ?? -1
      const bc = b.competitionIndex ?? -1
      return bc - ac
    })

    // filteredResultsCount = how many results passed the minMonthlySearches filter (before limit).
    const filteredResultsCount = filteredResults.length

    // Apply user-selected results limit (100, 250, or 500). Hard cap at 500.
    const results = filteredResults.slice(0, resultsLimit)
    const returnedResultsCount = results.length

    const firstNormalizedKeywords = dedupedResults.slice(0, 10).map((r) => r.keyword)

    console.log('[keyword-ideas] result summary', {
      rawResultsCount,
      normalizedResultsCount,
      filteredResultsCount,
      finalResultCount: results.length,
      resultsLimit,
      returnedResultsCount,
      minMonthlySearches,
      researchType,
      seedType,
      seedKeywords,
      pagesFetched: pageCount,
      hasNextPageToken,
      apiVersionUsed: GOOGLE_ADS_API_VERSION,
      keyword: keywordRaw,
    })

    const debugNote =
      rawResultsCount <= 1
        ? 'Google Ads returned only one raw keyword idea for this seed'
        : undefined

    return Response.json({
      success: true,
      count: results.length,
      results,
      debug: {
        apiVersionUsed: GOOGLE_ADS_API_VERSION,
        researchType,
        requestBodySentToGoogle: requestBody,
        seedKeywords,
        seedType,
        rawResultsCount,
        normalizedResultsCount,
        filteredResultsCount,
        resultsLimit,
        returnedResultsCount,
        minMonthlySearches,
        pagesFetched: pageCount,
        hasNextPageToken,
        firstRawKeywords,
        firstRawResults,
        firstNormalizedKeywords,
        ...(debugNote ? { debugNote } : {}),
      },
    })
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error'
    console.error('[keyword-ideas] unexpected error', errorMsg)
    return Response.json(
      { success: false, stage: 'unexpected', error: 'An unexpected error occurred' },
      { status: 500 }
    )
  }
}
