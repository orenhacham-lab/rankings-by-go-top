/**
 * Every way publishing to a Business Profile can fail, as a stable code. The
 * screen shows the dictionary sentence for the code (mapsPosts.errors in the
 * dashboard dictionaries); a provider's own text is never stored or shown.
 */

export const GBP_ERROR_CODES = [
  'not_connected',
  'reauth_required',
  'no_location',
  'api_not_approved',
  'permission_denied',
  'location_not_found',
  'rate_limited',
  'invalid_post',
  'image_rejected',
  'post_rejected',
  'google_unavailable',
  'image_invalid',
  'image_too_small',
  'image_upload_failed',
  'draft_unavailable',
  'not_available',
  'unexpected',
] as const
export type GbpErrorCode = typeof GBP_ERROR_CODES[number]

export function isGbpErrorCode(v: unknown): v is GbpErrorCode {
  return typeof v === 'string' && (GBP_ERROR_CODES as readonly string[]).includes(v)
}

export class GbpApiError extends Error {
  code: GbpErrorCode
  retryable: boolean
  constructor(code: GbpErrorCode, retryable = false) {
    super(code)
    this.name = 'GbpApiError'
    this.code = code
    this.retryable = retryable
  }
}

/**
 * A Google error response → a code. Reads only the machine fields (HTTP
 * status, error.status, the reasons in error.details) — never the message.
 */
export function classifyGoogleError(httpStatus: number, json: unknown): GbpApiError {
  const err = (json && typeof json === 'object' ? (json as { error?: unknown }).error : null) as
    | { status?: unknown; details?: unknown; errors?: unknown } | null
  const status = typeof err?.status === 'string' ? err.status : ''
  const reasons: string[] = []
  const collect = (arr: unknown) => {
    if (!Array.isArray(arr)) return
    for (const d of arr) {
      if (d && typeof d === 'object') {
        const r = (d as { reason?: unknown }).reason
        if (typeof r === 'string') reasons.push(r)
        const meta = (d as { metadata?: unknown }).metadata
        if (meta && typeof meta === 'object') {
          const limit = (meta as { quota_limit_value?: unknown }).quota_limit_value
          if (limit === '0') reasons.push('QUOTA_ZERO')
        }
      }
    }
  }
  collect(err?.details)
  collect(err?.errors)
  const has = (r: string) => reasons.includes(r)

  if (httpStatus === 401 || status === 'UNAUTHENTICATED') return new GbpApiError('reauth_required')
  if (has('SERVICE_DISABLED') || has('QUOTA_ZERO') || has('API_DISABLED')) return new GbpApiError('api_not_approved')
  if (has('ACCESS_TOKEN_SCOPE_INSUFFICIENT')) return new GbpApiError('reauth_required')
  if (httpStatus === 429 || status === 'RESOURCE_EXHAUSTED') return new GbpApiError('rate_limited', true)
  if (httpStatus === 403 || status === 'PERMISSION_DENIED') return new GbpApiError('permission_denied')
  if (httpStatus === 404 || status === 'NOT_FOUND') return new GbpApiError('location_not_found')
  if (httpStatus === 400 || status === 'INVALID_ARGUMENT' || status === 'FAILED_PRECONDITION') {
    const mediaIssue = reasons.some((r) => /MEDIA|PHOTO|IMAGE/i.test(r))
    return new GbpApiError(mediaIssue ? 'image_rejected' : 'invalid_post')
  }
  if (httpStatus >= 500) return new GbpApiError('google_unavailable', true)
  return new GbpApiError('unexpected')
}
