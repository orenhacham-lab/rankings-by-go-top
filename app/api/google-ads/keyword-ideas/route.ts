import { createClient } from '@/lib/supabase/server'
import { COUNTRY_GEO_TARGETS, LANGUAGE_IDS, isValidCountry, isValidLanguage } from '@/lib/google-ads/constants'

interface TokenResponse {
  access_token?: string
  error?: string
  error_description?: string
}

interface GoogleAdsKeywordIdea {
  text?: string
  keyword_idea_metrics?: {
    avg_monthly_searches?: number
    competition?: 'LOW' | 'MEDIUM' | 'HIGH'
    competition_index?: number
    low_top_of_page_bid_micros?: number
    high_top_of_page_bid_micros?: number
  }
}

interface GoogleAdsResponse {
  results?: GoogleAdsKeywordIdea[]
  error?: {
    code?: number
    message?: string
    status?: string
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

async function getPayPalToken(): Promise<string> {
  const auth = Buffer.from(
    `${process.env.GOOGLE_ADS_CLIENT_ID}:${process.env.GOOGLE_ADS_CLIENT_SECRET}`
  ).toString('base64')

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

export async function POST(request: Request) {
  try {
    // Auth check
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Validate request body
    const body = await request.json()
    const { keyword, country = 'IL', language = 'he', url } = body

    if (!keyword || typeof keyword !== 'string' || !keyword.trim()) {
      return Response.json(
        { error: 'Keyword is required and must be non-empty' },
        { status: 400 }
      )
    }

    if (!isValidCountry(country)) {
      return Response.json(
        { error: `Unsupported country: ${country}` },
        { status: 400 }
      )
    }

    if (!isValidLanguage(language)) {
      return Response.json(
        { error: `Unsupported language: ${language}` },
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
        { error: 'Google Ads API not configured', stage: 'env_check' },
        { status: 503 }
      )
    }

    const customerId = process.env.GOOGLE_ADS_CUSTOMER_ID!.replace(/-/g, '')
    const loginCustomerId = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID!.replace(/-/g, '')
    const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN!

    // Get access token
    let accessToken: string
    try {
      accessToken = await getPayPalToken()
    } catch (error) {
      const err = error instanceof Error ? error.message : 'unknown'
      if (err === 'refresh_token_invalid') {
        return Response.json(
          { error: 'Google Ads refresh token is invalid or expired', stage: 'oauth' },
          { status: 503 }
        )
      } else if (err === 'client_credentials_invalid') {
        return Response.json(
          { error: 'Google Ads OAuth credentials are invalid', stage: 'oauth' },
          { status: 503 }
        )
      }
      return Response.json(
        { error: 'Failed to obtain Google Ads access token', stage: 'oauth' },
        { status: 502 }
      )
    }

    // Build the request body for GenerateKeywordIdeas
    const geoTargetId = COUNTRY_GEO_TARGETS[country]
    const languageId = LANGUAGE_IDS[language].toString()

    const requestBody = {
      keyword_seed: {
        keywords: [keyword.trim()],
      },
      ...(url && {
        url_seed: {
          url: url.trim(),
        },
      }),
      geo_target_constants: [`geoTargetConstants/${geoTargetId}`],
      language_id: languageId,
      keyword_plan_network: 'GOOGLE_SEARCH',
      page_size: 100,
    }

    // Call Google Ads API
    const apiUrl = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${customerId}:generateKeywordIdeas`

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

      if (apiResponse.status === 401) {
        return Response.json(
          { error: 'Google Ads API authentication failed', stage: 'google_ads_api' },
          { status: 502 }
        )
      } else if (apiResponse.status === 403) {
        const msg = errorBody.error?.message || ''
        if (/developer token/i.test(msg) || /PERMISSION_DENIED/i.test(msg)) {
          return Response.json(
            { error: 'Developer token is invalid or not approved', stage: 'google_ads_api' },
            { status: 502 }
          )
        }
        return Response.json(
          { error: 'Permission denied accessing Google Ads API', stage: 'google_ads_api' },
          { status: 502 }
        )
      } else if (apiResponse.status === 429) {
        return Response.json(
          { error: 'rate_limit_exceeded', stage: 'google_ads_api' },
          { status: 429 }
        )
      } else if (apiResponse.status === 400) {
        return Response.json(
          { error: 'Invalid request to Google Ads API', stage: 'google_ads_api' },
          { status: 400 }
        )
      }

      return Response.json(
        { error: 'Google Ads API request failed', stage: 'google_ads_api', status: apiResponse.status },
        { status: 502 }
      )
    }

    const data = (await apiResponse.json()) as GoogleAdsResponse

    // Normalize results
    const results: KeywordIdeaResult[] = (data.results || [])
      .filter((idea) => idea.text)
      .map((idea) => {
        const metrics = idea.keyword_idea_metrics || {}
        return {
          keyword: idea.text!,
          avgMonthlySearches: metrics.avg_monthly_searches ?? null,
          competition: metrics.competition ?? null,
          competitionIndex: metrics.competition_index ?? null,
          lowTopOfPageBid: metrics.low_top_of_page_bid_micros ? metrics.low_top_of_page_bid_micros / 1000000 : null,
          highTopOfPageBid: metrics.high_top_of_page_bid_micros ? metrics.high_top_of_page_bid_micros / 1000000 : null,
          currency: country === 'IL' ? 'ILS' : 'USD',
        }
      })

    return Response.json({
      success: true,
      results,
      count: results.length,
    })
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error'
    const safe = errorMsg.replace(/[A-Za-z0-9-_]{30,}/g, '[redacted]')
    console.error('[Keyword Research] Error:', errorMsg)
    return Response.json(
      { error: 'An unexpected error occurred', stage: 'unexpected' },
      { status: 500 }
    )
  }
}
