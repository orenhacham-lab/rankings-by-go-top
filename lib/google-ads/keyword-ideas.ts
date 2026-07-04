/**
 * Google Ads — Keyword Ideas service (reusable, server-side).
 *
 * Extracted verbatim (behavior-preserving) from
 * app/api/google-ads/keyword-ideas/route.ts. The route is now a thin wrapper
 * (auth + input validation + response shaping); this module owns seed handling,
 * request building, the fetch + pagination, and response normalization. It is
 * callable from any server context (route or background/automation job) because
 * Google auth is app-level env credentials (see ./client).
 *
 * On any Google failure it throws a typed `GoogleAdsError` (see ./client) so the
 * caller can map the code to its own response — the existing route mapping is
 * preserved exactly.
 */

import {
  GOOGLE_ADS_API_VERSION,
  GoogleAdsError,
  getGoogleAdsAccessToken,
  getGoogleAdsConfig,
  toNumber,
} from './client'
import { COUNTRY_GEO_TARGETS, LANGUAGE_IDS } from './constants'

// Google Ads REST API uses camelCase.
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
  error?: { code?: number; message?: string; status?: string; details?: unknown[] }
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

export type KeywordResearchType = 'keyword' | 'url' | 'keyword_url'

export interface KeywordIdeasInput {
  researchType: KeywordResearchType
  /** Seed keywords (deduped + capped internally). */
  keywords: string[]
  /** Validated absolute URL (required for 'url' / 'keyword_url'). */
  url?: string
  country: string
  language: string
  minMonthlySearches: number
  resultsLimit: 100 | 250
  /**
   * How many result pages to fetch. Defaults to 1 to preserve the existing
   * route behavior (single page, avoids rate limiting). Automation may raise it.
   */
  pageLimit?: number
}

export interface KeywordIdeasResult {
  results: KeywordIdeaResult[]
  /** Same diagnostic payload the route has always returned under `debug`. */
  debug: Record<string, unknown>
}

/** Dedupe (case-insensitive) + cap at 20 — the Google Ads keyword-seed limit. */
export function prepareSeedKeywords(keywords: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of keywords) {
    const k = (raw ?? '').trim()
    if (!k) continue
    const lower = k.toLowerCase()
    if (seen.has(lower)) continue
    seen.add(lower)
    out.push(k)
  }
  return out.slice(0, 20)
}

/** Currency is derived from country (Google Ads bids come back in micros, no currency). */
function currencyForCountry(country: string): string {
  return country === 'IL' ? 'ILS'
    : country === 'GR' || country === 'CY' ? 'EUR'
    : country === 'GB' ? 'GBP'
    : 'USD'
}

type SeedField =
  | { keywordSeed: { keywords: string[] } }
  | { urlSeed: { url: string } }
  | { keywordAndUrlSeed: { url: string; keywords: string[] } }

/**
 * Run GenerateKeywordIdeas. Assumes inputs are already validated (country,
 * language, url shape, keyword presence) by the caller — same contract the route
 * enforced inline before. Throws GoogleAdsError on config/OAuth/API failure.
 */
export async function generateKeywordIdeas(input: KeywordIdeasInput): Promise<KeywordIdeasResult> {
  const { researchType, country, language, minMonthlySearches, resultsLimit } = input
  const pageLimit = Math.max(1, input.pageLimit ?? 1)
  const seedKeywordsArray = prepareSeedKeywords(input.keywords)
  const validUrl = (input.url ?? '').trim()

  const config = getGoogleAdsConfig() // throws not_configured
  const accessToken = await getGoogleAdsAccessToken() // throws reauth_required / client_credentials_invalid / oauth_token_failed

  const geoTargetId = COUNTRY_GEO_TARGETS[country]
  const languageId = LANGUAGE_IDS[language]

  let seed: SeedField
  let seedType: 'keywordSeed' | 'urlSeed' | 'keywordAndUrlSeed'
  if (researchType === 'url') {
    seedType = 'urlSeed'
    seed = { urlSeed: { url: validUrl } }
  } else if (researchType === 'keyword_url') {
    seedType = 'keywordAndUrlSeed'
    seed = { keywordAndUrlSeed: { url: validUrl, keywords: seedKeywordsArray } }
  } else {
    seedType = 'keywordSeed'
    seed = { keywordSeed: { keywords: seedKeywordsArray } }
  }

  const requestBody = {
    ...seed,
    geoTargetConstants: [`geoTargetConstants/${geoTargetId}`],
    language: `languageConstants/${languageId}`,
    includeAdultKeywords: false,
    keywordPlanNetwork: 'GOOGLE_SEARCH',
    pageSize: resultsLimit,
  }

  console.log('[keyword-ideas] request', {
    apiVersion: GOOGLE_ADS_API_VERSION,
    researchType,
    country,
    language,
    geoTarget: `geoTargetConstants/${geoTargetId}`,
    languageConstant: `languageConstants/${languageId}`,
    seedType,
    seedKeywords: seedKeywordsArray,
    hasUrl: Boolean(validUrl),
    customerIdPresent: Boolean(config.customerId),
    loginCustomerIdPresent: Boolean(config.loginCustomerId),
    minMonthlySearches,
    pageSize: requestBody.pageSize,
  })

  const apiUrl = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${config.customerId}:generateKeywordIdeas`

  const allRawResults: GoogleAdsKeywordIdea[] = []
  let nextPageToken: string | undefined = undefined
  let pageCount = 0

  do {
    pageCount++
    const pageRequestBody = { ...requestBody, ...(nextPageToken ? { pageToken: nextPageToken } : {}) }

    if (pageCount === 1) {
      console.log('[keyword-ideas] first page request body', {
        bodyKeys: Object.keys(pageRequestBody),
        seedType,
        seedKeywords: seedKeywordsArray,
        hasPageToken: Boolean(nextPageToken),
      })
    }

    const apiResponse = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'developer-token': config.developerToken,
        'login-customer-id': config.loginCustomerId,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(pageRequestBody),
    })

    if (!apiResponse.ok) {
      const errorBody = (await apiResponse.json().catch(() => ({}))) as GoogleAdsResponse
      const apiMessage = errorBody.error?.message || ''
      const apiStatus = errorBody.error?.status || ''

      console.error('[keyword-ideas] google ads api error', {
        httpStatus: apiResponse.status,
        apiStatus,
        message: apiMessage,
        page: pageCount,
      })

      if (apiResponse.status === 401) {
        throw new GoogleAdsError('api_auth_failed', { httpStatus: 401 })
      } else if (apiResponse.status === 403) {
        if (/developer token/i.test(apiMessage)) throw new GoogleAdsError('developer_token_invalid', { httpStatus: 403 })
        throw new GoogleAdsError('permission_denied', { httpStatus: 403 })
      } else if (apiResponse.status === 429) {
        throw new GoogleAdsError('rate_limit_exceeded', { httpStatus: 429 })
      } else if (apiResponse.status === 400) {
        if (/resource.*exhausted/i.test(apiMessage) || /quota/i.test(apiMessage)) {
          throw new GoogleAdsError('resource_exhausted', { httpStatus: 429 })
        }
        throw new GoogleAdsError('invalid_request', { httpStatus: 400, apiMessage: apiMessage.slice(0, 300) })
      }
      throw new GoogleAdsError('api_failed', { httpStatus: apiResponse.status })
    }

    const data = (await apiResponse.json()) as GoogleAdsResponse
    const pageResultCount = data.results?.length ?? 0
    console.log(`[keyword-ideas] page ${pageCount} fetched`, {
      resultsInThisPage: pageResultCount,
      totalSoFar: allRawResults.length + pageResultCount,
      hasNextPageToken: Boolean(data.nextPageToken),
    })
    if (data.results) allRawResults.push(...data.results)
    nextPageToken = data.nextPageToken
  } while (nextPageToken && pageCount < pageLimit)

  const hasNextPageToken = Boolean(nextPageToken)

  const rawResultsCount = allRawResults.length
  const firstRawKeywords = allRawResults.slice(0, 10).map((r) => r.text || '').filter((s) => s.length > 0)
  const firstRawResults = allRawResults.slice(0, 10).map((r) => ({
    text: r.text || '',
    avgMonthlySearches: toNumber(r.keywordIdeaMetrics?.avgMonthlySearches),
    competition: r.keywordIdeaMetrics?.competition ?? null,
    competitionIndex: toNumber(r.keywordIdeaMetrics?.competitionIndex),
  }))

  const currency = currencyForCountry(country)
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
        currency,
      }
    })

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

  const filteredResults = dedupedResults.filter((r) => {
    if (minMonthlySearches === 0) return true
    return r.avgMonthlySearches !== null && r.avgMonthlySearches >= minMonthlySearches
  })

  filteredResults.sort((a, b) => {
    const av = a.avgMonthlySearches ?? -1
    const bv = b.avgMonthlySearches ?? -1
    if (bv !== av) return bv - av
    const ac = a.competitionIndex ?? -1
    const bc = b.competitionIndex ?? -1
    return bc - ac
  })

  const filteredResultsCount = filteredResults.length
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
    seedKeywords: seedKeywordsArray,
    pagesFetched: pageCount,
    hasNextPageToken,
    apiVersionUsed: GOOGLE_ADS_API_VERSION,
    keywordCount: seedKeywordsArray.length,
  })

  const debugNote = rawResultsCount <= 1 ? 'Google Ads returned only one raw keyword idea for this seed' : undefined

  return {
    results,
    debug: {
      apiVersionUsed: GOOGLE_ADS_API_VERSION,
      researchType,
      requestBodySentToGoogle: requestBody,
      seedKeywords: seedKeywordsArray,
      seedType,
      pageSizeSentToGoogle: requestBody.pageSize,
      maxPages: pageLimit,
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
  }
}
