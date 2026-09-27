/**
 * What each answer of the onboarding APIs means to the merchant.
 *
 * Every refusal the create, start, continue and generate routes can give, and
 * every way stage A can end, maps to ONE notice: a key into
 * seedOnboarding.notices (a title and one sentence in both languages) and at
 * most one action. Only stable codes and statuses are read. The text a route
 * sends along (`error`, a provider's message, a database error) is never
 * shown: an unknown answer is the generic "something went wrong" notice.
 */
import {
  SEED_API_ERROR_CODES,
  SEED_TRACKING_CODES,
  type SeedApiErrorCode,
  type SeedTrackingCode,
} from '@/lib/seed-scan/types'

export const NOTICE_KEYS = [
  'signedOut',
  'notAvailable',
  'planRequired',
  'planUnavailable',
  'runInProgress',
  'rescanTooSoon',
  'userDailyCap',
  'globalDailyCap',
  'claimExpired',
  'busy',
  'failed',
  'offline',
  'projectQuota',
  'createFailed',
  'noClient',
  'notReady',
  'keywordsChanged',
  'keywordQuota',
  'keywordsNotAdded',
  'siteUnreachable',
  'siteBlocked',
  'siteForbidden',
  'siteAddress',
  'scanStopped',
] as const
export type NoticeKey = (typeof NOTICE_KEYS)[number]

/** The notices whose sentence says when to try again (their copy is a function of the wait). */
export const WAIT_NOTICES: readonly NoticeKey[] = ['rescanTooSoon', 'userDailyCap', 'globalDailyCap']

/** The one thing a notice lets the merchant do, if anything. */
export type NoticeAction = 'retry' | 'refresh' | 'billing' | 'signin' | 'dashboard' | 'settings' | 'clients'

export type Notice = { key: NoticeKey; action: NoticeAction | null; retryAfterSeconds?: number }

const n = (key: NoticeKey, action: NoticeAction | null, retryAfterSeconds?: number): Notice =>
  retryAfterSeconds ? { key, action, retryAfterSeconds } : { key, action }

export const OFFLINE_NOTICE: Notice = n('offline', 'retry')

/** The stable code and wait of a refusal body; anything else in it is ignored. */
export function readRefusal(body: unknown): { code: SeedApiErrorCode | null; retryAfterSeconds?: number } {
  if (!body || typeof body !== 'object') return { code: null }
  const r = body as Record<string, unknown>
  const code = typeof r.code === 'string' && (SEED_API_ERROR_CODES as readonly string[]).includes(r.code) ? (r.code as SeedApiErrorCode) : null
  const wait = typeof r.retryAfterSeconds === 'number' && Number.isFinite(r.retryAfterSeconds) && r.retryAfterSeconds > 0
    ? Math.ceil(r.retryAfterSeconds)
    : undefined
  return wait ? { code, retryAfterSeconds: wait } : { code }
}

/** The codes every onboarding call shares. */
function common(code: SeedApiErrorCode | null, status: number): Notice | null {
  if (code === 'unauthorized' || (!code && status === 401)) return n('signedOut', 'signin')
  if (code === 'not_found' || (!code && status === 404)) return n('notAvailable', 'dashboard')
  if (code === 'entitlement_required') return n('planRequired', 'billing')
  if (code === 'entitlement_unavailable') return n('planUnavailable', 'retry')
  if (code === 'unavailable') return n('busy', 'retry')
  return null
}

/** Starting a scan (the start route, i.e. the seed route's start or claim). */
export function startNotice(status: number, body: unknown): Notice {
  const { code, retryAfterSeconds } = readRefusal(body)
  const shared = common(code, status)
  if (shared) return shared
  switch (code) {
    case 'run_in_progress':
      return n('runInProgress', 'refresh')
    case 'rescan_too_soon':
      return n('rescanTooSoon', 'dashboard', retryAfterSeconds)
    case 'user_daily_cap':
      return n('userDailyCap', 'dashboard', retryAfterSeconds)
    case 'global_daily_cap':
      return n('globalDailyCap', 'dashboard', retryAfterSeconds)
    case 'claim_invalid':
      return n('claimExpired', 'retry')
    default:
      return n('failed', 'retry')
  }
}

/**
 * "Start" on the summary (the seed route's continue). Stage B having already
 * begun is not a failure: it means the dashboard is where to go.
 */
export function continueNotice(status: number, body: unknown): Notice | 'open_dashboard' {
  const { code } = readRefusal(body)
  if (code === 'stage_b_started') return 'open_dashboard'
  const shared = common(code, status)
  if (shared) return shared
  if (code === 'not_continuable') return n('notReady', 'refresh')
  if (code === 'invalid_request') return n('keywordsChanged', 'refresh')
  return n('failed', 'retry')
}

/**
 * Stage B started, but adding the chosen keywords may have been refused by the
 * plan's keyword limit or an entitlement outage. That is said, with the
 * dashboard as the way on; a clean outcome needs no notice at all.
 */
export function trackingNotice(tracking: unknown): Notice | null {
  const code = tracking && typeof tracking === 'object' ? (tracking as { code?: unknown }).code : null
  if (typeof code !== 'string' || !(SEED_TRACKING_CODES as readonly string[]).includes(code)) return null
  switch (code as SeedTrackingCode) {
    case 'keyword_quota_exceeded':
      return n('keywordQuota', 'dashboard')
    case 'keyword_entitlement_unavailable':
    case 'keywords_add_failed':
      return n('keywordsNotAdded', 'dashboard')
    default:
      return null
  }
}

/** Creating the project (/api/projects/create). Its body is read for its stable `code` only. */
export function createNotice(status: number, body: unknown): Notice {
  const code = body && typeof body === 'object' ? (body as { code?: unknown }).code : null
  if (status === 401) return n('signedOut', 'signin')
  if (status === 403 && code === 'QUOTA_PROJECTS') return n('projectQuota', 'billing')
  if (status === 503) return n('planUnavailable', 'retry')
  return n('createFailed', 'retry')
}

/** Stage A ended `failed`: its first step could not read the site. */
export function stageFailureNotice(code: string | null | undefined): Notice {
  switch (code) {
    case 'site_unreachable':
      return n('siteUnreachable', 'retry')
    case 'site_blocked':
      return n('siteBlocked', 'retry')
    // The host refuses automated reads and Google shows none of its pages: not "check it opens".
    case 'site_forbidden':
      return n('siteForbidden', 'retry')
    case 'invalid_site_url':
    case 'site_not_html':
    case 'site_offsite_redirect':
      return n('siteAddress', 'settings')
    default:
      return n('scanStopped', 'retry')
  }
}

/**
 * Why the first article was not written, from the generate route's stable
 * `reason` and status (app/api/content/articles/generate): a key into
 * seedOnboarding.firstArticle.errors. The route's `error` text is not read.
 * `timeout` is the screen's own: the request outlived its three minutes.
 */
export const FIRST_ARTICLE_ERRORS = ['quota', 'billing', 'unavailable', 'inProgress', 'quality', 'details', 'generic', 'timeout'] as const
export type FirstArticleError = (typeof FIRST_ARTICLE_ERRORS)[number]

/** The errors a second try can fix; the others need a plan, a setting or patience. */
export const RETRYABLE_ARTICLE_ERRORS: readonly FirstArticleError[] = ['unavailable', 'quality', 'generic']

export function firstArticleError(status: number, body: unknown): FirstArticleError {
  const reason = body && typeof body === 'object' ? (body as { reason?: unknown }).reason : null
  switch (reason) {
    case 'quota_exceeded':
      return 'quota'
    case 'shopify_billing_required':
      return 'billing'
    case 'entitlement_unavailable':
    case 'usage_period_unavailable':
      return 'unavailable'
    case 'generation_in_progress':
      return 'inProgress'
    case 'cta_details_missing':
    case 'required_anchor_missing_url':
      return 'details'
  }
  // 422 is the quality gate; 502 is the writer itself failing, which is not the article's fault.
  if (status === 422) return 'quality'
  return 'generic'
}

/** Minutes up to an hour, then hours; always rounded up, never zero. */
export function waitParts(seconds: number): { unit: 'minutes' | 'hours'; value: number } {
  const s = Math.max(1, Math.ceil(seconds))
  if (s < 60 * 60) return { unit: 'minutes', value: Math.max(1, Math.ceil(s / 60)) }
  return { unit: 'hours', value: Math.ceil(s / 3600) }
}
