/**
 * POST /api/google-ads/keyword-ideas — thin wrapper around the reusable
 * Google Ads keyword-ideas service (lib/google-ads/keyword-ideas.ts).
 *
 * Responsibilities kept here: auth, input parsing/validation, and mapping the
 * service's typed GoogleAdsError codes back to the SAME HTTP responses this
 * route has always returned. All Google Ads execution (token, request building,
 * seed handling, fetch/pagination, normalization) now lives in the service so it
 * can also be called from background/automation code. Response shape unchanged.
 */

import { createClient } from '@/lib/supabase/server'
import { COUNTRY_GEO_TARGETS, LANGUAGE_IDS, isValidCountry, isValidLanguage } from '@/lib/google-ads/constants'
import { GoogleAdsError } from '@/lib/google-ads/client'
import { generateKeywordIdeas, prepareSeedKeywords, type KeywordResearchType } from '@/lib/google-ads/keyword-ideas'

// Re-exported for backward compatibility (previously declared in this route).
export type { KeywordIdeaResult } from '@/lib/google-ads/keyword-ideas'

/** Map a typed GoogleAdsError to the exact response this route always returned. */
function mapGoogleAdsError(e: GoogleAdsError): Response {
  switch (e.code) {
    case 'not_configured':
      return Response.json({ success: false, stage: 'env_check', error: 'Google Ads API not configured' }, { status: 503 })
    case 'reauth_required':
      return Response.json(
        {
          success: false,
          stage: 'oauth',
          errorCode: 'GOOGLE_ADS_REAUTH_REQUIRED',
          error: 'Google Ads connection requires re-authentication',
          message: 'חיבור Google Ads פג או בוטל. יש להתחבר מחדש.',
          details: {
            reason: 'refresh_token_expired_or_revoked',
            instruction: 'No need to create new credentials. Just re-authenticate to Google Ads.',
          },
        },
        { status: 401 },
      )
    case 'client_credentials_invalid':
      return Response.json(
        {
          success: false,
          stage: 'oauth',
          errorCode: 'GOOGLE_ADS_CLIENT_CREDENTIALS_INVALID',
          error: 'Google Ads OAuth credentials are invalid',
          details: { reason: 'client_id or client_secret invalid' },
        },
        { status: 503 },
      )
    case 'oauth_token_failed':
      return Response.json(
        { success: false, stage: 'oauth', errorCode: 'GOOGLE_ADS_OAUTH_FAILED', error: 'Failed to obtain Google Ads access token' },
        { status: 502 },
      )
    case 'api_auth_failed':
      return Response.json({ success: false, stage: 'google_ads_api', error: 'Google Ads API authentication failed' }, { status: 502 })
    case 'developer_token_invalid':
      return Response.json({ success: false, stage: 'google_ads_api', error: 'Developer token is invalid or not approved' }, { status: 502 })
    case 'permission_denied':
      return Response.json({ success: false, stage: 'google_ads_api', error: 'Permission denied accessing Google Ads API' }, { status: 502 })
    case 'rate_limit_exceeded':
      return Response.json({ success: false, stage: 'google_ads_api', error: 'rate_limit_exceeded' }, { status: 429 })
    case 'resource_exhausted':
      return Response.json({ success: false, stage: 'google_ads_api', error: 'resource_exhausted' }, { status: 429 })
    case 'invalid_request':
      return Response.json(
        { success: false, stage: 'google_ads_api', error: 'Invalid request to Google Ads API', apiMessage: (e.apiMessage ?? '').slice(0, 300) },
        { status: 502 },
      )
    case 'api_failed':
    default:
      return Response.json(
        { success: false, stage: 'google_ads_api', error: 'Google Ads API request failed', status: e.httpStatus },
        { status: 502 },
      )
  }
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
      return Response.json({ success: false, stage: 'validation', error: 'Invalid JSON body' }, { status: 400 })
    }

    const country = typeof body.country === 'string' ? body.country : 'IL'
    const language = typeof body.language === 'string' ? body.language : 'he'
    const urlRaw = typeof body.url === 'string' ? body.url.trim() : ''
    const minMonthlySearches = typeof body.minMonthlySearches === 'number' ? Math.max(0, body.minMonthlySearches) : 30

    const researchTypeRaw = typeof body.researchType === 'string' ? body.researchType : 'keyword'
    const researchType: KeywordResearchType =
      researchTypeRaw === 'url' || researchTypeRaw === 'keyword_url' ? researchTypeRaw : 'keyword'

    const ALLOWED_RESULT_LIMITS = [100, 250] as const
    const resultsLimitRaw = typeof body.resultsLimit === 'number' ? body.resultsLimit : 100
    const resultsLimit: 100 | 250 = (ALLOWED_RESULT_LIMITS as readonly number[]).includes(resultsLimitRaw)
      ? (resultsLimitRaw as 100 | 250)
      : 100

    // Parse keywords: support both keywords[] (new) and keyword string (compat).
    let parsedKeywords: string[] = []
    if (Array.isArray(body.keywords)) {
      parsedKeywords = (body.keywords as unknown[]).filter((k) => typeof k === 'string').map((k) => (k as string).trim()).filter((k) => k.length > 0)
    } else if (typeof body.keyword === 'string') {
      const kw = body.keyword.trim()
      if (kw) parsedKeywords = [kw]
    }
    const seedKeywordsArray = prepareSeedKeywords(parsedKeywords)

    if (!isValidCountry(country)) {
      return Response.json(
        { success: false, stage: 'validation', error: 'Unsupported country', received: country, supported: Object.keys(COUNTRY_GEO_TARGETS) },
        { status: 400 },
      )
    }
    if (!isValidLanguage(language)) {
      return Response.json(
        { success: false, stage: 'validation', error: 'Unsupported language', received: language, supported: Object.keys(LANGUAGE_IDS) },
        { status: 400 },
      )
    }

    // Validate URL when the research type requires it.
    let validUrl: string | undefined
    if (researchType === 'url' || researchType === 'keyword_url') {
      if (!urlRaw) {
        return Response.json({ success: false, stage: 'validation', error: 'Invalid URL' }, { status: 400 })
      }
      try {
        const u = new URL(urlRaw)
        if (u.protocol !== 'http:' && u.protocol !== 'https:') {
          return Response.json({ success: false, stage: 'validation', error: 'Invalid URL' }, { status: 400 })
        }
        validUrl = urlRaw
      } catch {
        return Response.json({ success: false, stage: 'validation', error: 'Invalid URL' }, { status: 400 })
      }
    }

    // Validate keyword when the research type requires it.
    if (researchType === 'keyword' || researchType === 'keyword_url') {
      if (seedKeywordsArray.length === 0) {
        return Response.json({ success: false, stage: 'validation', error: 'Keyword is required' }, { status: 400 })
      }
    }

    // Delegate execution to the reusable service.
    try {
      const { results, debug } = await generateKeywordIdeas({
        researchType,
        keywords: seedKeywordsArray,
        url: validUrl,
        country,
        language,
        minMonthlySearches,
        resultsLimit,
      })
      return Response.json({ success: true, count: results.length, results, debug })
    } catch (error) {
      if (error instanceof GoogleAdsError) return mapGoogleAdsError(error)
      throw error
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error'
    console.error('[keyword-ideas] unexpected error', errorMsg)
    return Response.json({ success: false, stage: 'unexpected', error: 'An unexpected error occurred' }, { status: 500 })
  }
}
