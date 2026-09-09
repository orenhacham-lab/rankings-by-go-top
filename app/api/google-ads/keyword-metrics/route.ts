import { createClient } from '@/lib/supabase/server'
import { COUNTRY_GEO_TARGETS, LANGUAGE_IDS, isValidCountry, isValidLanguage } from '@/lib/google-ads/constants'
import {
  Deadline, fetchProvider, logOperation, newRequestId,
  type ProviderOutcome,
} from '@/lib/ops/deadline'

/**
 * The platform ceiling this handler must ALWAYS answer inside.
 *
 * Declared explicitly rather than inherited: an inherited ceiling is a number
 * nobody in this file knows, and the operation budget below has to be smaller
 * than it. When the function is killed at the ceiling instead of answering,
 * nothing is logged, nothing is persisted and the merchant is told nothing —
 * which is exactly what happened here.
 */
export const maxDuration = 60

/** The whole operation's budget, comfortably inside `maxDuration` so the
 *  handler — not the platform — decides how this request ends. */
const OPERATION_BUDGET_MS = 45_000
/** One provider round trip. Both of these used to have NO timeout at all, so a
 *  provider that accepted the connection and never answered held the request
 *  open until the platform killed it. */
const OAUTH_TIMEOUT_MS = 10_000
const METRICS_TIMEOUT_MS = 20_000

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

/**
 * The OAuth exchange, BOUNDED. It used to be a bare `fetch` with no signal:
 * one unresponsive token endpoint and this request could never end on its own.
 *
 * The two credential faults are still distinguished, because they need
 * different operator action — but they are now read from a classified result
 * rather than from an unbounded call that may never have returned.
 */
async function getGoogleAdsAccessToken(timeoutMs: number): Promise<{ token: string | null; outcome: ProviderOutcome; status: number | null; reason: string | null }> {
  const res = await fetchProvider<TokenResponse>('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_ADS_CLIENT_ID!,
      client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET!,
      refresh_token: process.env.GOOGLE_ADS_REFRESH_TOKEN!,
      grant_type: 'refresh_token',
    }).toString(),
  }, timeoutMs)

  if (res.ok && res.data?.access_token) {
    return { token: res.data.access_token, outcome: 'ok', status: res.status, reason: null }
  }
  // A 4xx from the token endpoint says WHICH credential is wrong, and the two
  // faults need different operator action. fetchProvider already read that body
  // once; it is inspected here and DISCARDED — only a stable code escapes this
  // function, never provider text.
  let reason: string | null = null
  if (res.outcome === 'auth' || res.outcome === 'bad_request') {
    const body = (res.errorBody ?? {}) as TokenResponse
    const desc = `${body.error_description ?? ''} ${body.error ?? ''}`
    reason = /invalid_grant/i.test(desc) ? 'reauth_required'
      : /invalid_client/i.test(desc) ? 'client_credentials_invalid'
        : 'oauth_token_failed'
  }
  return { token: null, outcome: res.outcome, status: res.status, reason }
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
  // ONE structured line per operation, emitted whatever happens — including the
  // paths that previously returned silently. Both production failures left the
  // retained platform window with nothing at all, so "which stage consumed the
  // minute" could not be answered afterwards.
  const startedAt = Date.now()
  const requestId = newRequestId()
  const deadline = new Deadline(OPERATION_BUDGET_MS)
  const diag: {
    stage: string; outcome: string; userId?: string; projectId?: string
    targetCount?: number; providerStatus?: number | null; providerOutcome?: ProviderOutcome | null
    persisted?: number | null; persistenceOutcome?: string | null
  } = { stage: 'start', outcome: 'unknown' }

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

    diag.userId = user.id
    diag.projectId = projectId
    diag.stage = 'authorize'
    if (!project || project.user_id !== user.id) {
      diag.outcome = 'forbidden'
      return Response.json(
        { success: false, errorCode: 'FORBIDDEN', error: 'Project not found or access denied' },
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
      console.error('[keyword-metrics] target load failed', { requestId, code: (fetchError as { code?: string }).code })
      diag.outcome = 'targets_load_failed'
      return Response.json({ success: false, errorCode: 'LOAD_FAILED', error: 'Failed to fetch tracking targets', retryable: true, requestId }, { status: 500 })
    }

    const allTargets = targets || []
    diag.stage = 'select_targets'
    diag.targetCount = allTargets.length

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
      diag.outcome = 'up_to_date'
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
      diag.outcome = 'not_configured'
      return Response.json(
        { success: false, errorCode: 'GOOGLE_ADS_NOT_CONFIGURED', error: 'Google Ads API not configured', retryable: false },
        { status: 503 }
      )
    }

    const customerId = process.env.GOOGLE_ADS_CUSTOMER_ID!.replace(/-/g, '')
    const loginCustomerId = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID!.replace(/-/g, '')
    const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN!

    diag.stage = 'provider_auth'
    const tokenRes = await getGoogleAdsAccessToken(deadline.sliceFor(OAUTH_TIMEOUT_MS))
    diag.providerOutcome = tokenRes.outcome
    diag.providerStatus = tokenRes.status
    if (!tokenRes.token) {
      // A CREDENTIAL fault is not retryable and needs an operator; a timeout or
      // a network fault is transient and the merchant may simply try again.
      // They used to collapse into the same opaque 503.
      diag.outcome = tokenRes.reason ?? tokenRes.outcome
      if (tokenRes.reason === 'reauth_required') {
        return Response.json({
          success: false, errorCode: 'GOOGLE_ADS_REAUTH_REQUIRED',
          error: 'Google Ads connection requires re-authentication',
          details: { reason: 'refresh_token_expired_or_revoked' }, retryable: false, requestId,
        }, { status: 401 })
      }
      if (tokenRes.reason === 'client_credentials_invalid') {
        return Response.json({
          success: false, errorCode: 'GOOGLE_ADS_CLIENT_CREDENTIALS_INVALID',
          error: 'Google Ads OAuth credentials are invalid',
          details: { reason: 'client_id or client_secret invalid' }, retryable: false, requestId,
        }, { status: 503 })
      }
      const transient = tokenRes.outcome === 'timeout' || tokenRes.outcome === 'network' || tokenRes.outcome === 'server_error'
      return Response.json({
        success: false,
        errorCode: transient ? 'PROVIDER_UNAVAILABLE' : 'GOOGLE_ADS_AUTH_FAILED',
        error: 'Could not reach the search-volume provider', retryable: transient, requestId,
      }, { status: transient ? 503 : 502 })
    }
    const accessToken = tokenRes.token

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

      diag.stage = 'provider_metrics'
      const apiRes = await fetchProvider<HistoricalMetricsResponse>(apiUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'developer-token': developerToken,
          'login-customer-id': loginCustomerId,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      }, deadline.sliceFor(METRICS_TIMEOUT_MS))
      diag.providerOutcome = apiRes.outcome
      diag.providerStatus = apiRes.status

      if (!apiRes.ok) {
        // Only a stable category is logged and returned — never the provider's
        // own message, which can carry account identifiers and query text.
        console.error('[keyword-metrics] provider call failed', {
          requestId, batchIndex: i, outcome: apiRes.outcome, httpStatus: apiRes.status,
        })
        diag.outcome = `provider_${apiRes.outcome}`
        if (apiRes.outcome === 'rate_limited') {
          return Response.json({
            success: false, errorCode: 'RATE_LIMITED',
            error: 'The search-volume provider is rate limiting requests', retryable: true, requestId,
          }, { status: 429 })
        }
        const transient = apiRes.outcome === 'timeout' || apiRes.outcome === 'network' || apiRes.outcome === 'server_error'
        return Response.json({
          success: false,
          errorCode: transient ? 'PROVIDER_UNAVAILABLE' : 'PROVIDER_FAILED',
          error: 'Could not reach the search-volume provider', retryable: transient, requestId,
        }, { status: transient ? 503 : 502 })
      }

      const data = apiRes.data ?? {}
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
        console.error('[keyword-metrics] persist failed', { requestId, code: (updateError as { code?: string }).code })
        errors.push(kw)
      } else {
        updated += targetIds.length
      }
    }

    diag.stage = 'persist'
    diag.persisted = updated
    diag.persistenceOutcome = errors.length > 0 ? 'partial' : updated > 0 ? 'written' : 'nothing_to_write'
    // NO SILENT SUCCESS. `success: true` used to be returned even when every
    // write failed, so the UI could report a cheerful outcome for a request
    // that changed nothing. It now states what was actually written.
    diag.outcome = errors.length > 0 && updated === 0 ? 'persist_failed'
      : updated > 0 ? 'updated' : 'no_provider_data'
    if (errors.length > 0 && updated === 0) {
      return Response.json({
        success: false, errorCode: 'PERSIST_FAILED',
        error: 'The volumes could not be saved', retryable: true, requestId,
      }, { status: 500 })
    }
    return Response.json({
      success: true,
      updated,
      noData,
      errors: errors.length,
      skipped: allTargets.length - targetsToFetch.length,
      totalProcessed: targetsToFetch.length,
      requestId,
    })
  } catch (error) {
    // The message is classified into a stable code and then DISCARDED — a raw
    // database or provider message must never reach the merchant.
    const errorMsg = error instanceof Error ? error.message : 'Unknown error'
    console.error('[keyword-metrics] unexpected error', { requestId, stage: diag.stage, message: errorMsg.slice(0, 200) })
    diag.outcome = 'unexpected_error'
    return Response.json(
      { success: false, errorCode: 'UNEXPECTED', error: 'An unexpected error occurred', requestId },
      { status: 500 }
    )
  } finally {
    logOperation({
      operation: 'search_volume',
      stage: diag.stage,
      outcome: diag.outcome,
      durationMs: Date.now() - startedAt,
      requestId,
      userId: diag.userId,
      projectId: diag.projectId,
      targetCount: diag.targetCount,
      providerStatus: diag.providerStatus ?? null,
      providerOutcome: diag.providerOutcome ?? null,
      persisted: diag.persisted ?? null,
      persistenceOutcome: diag.persistenceOutcome ?? null,
    })
  }
}
