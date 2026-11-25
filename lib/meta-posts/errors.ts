/**
 * Every way publishing to Facebook or Instagram can fail, as a stable code. The
 * screen shows its own sentence for the code; Meta's own text is never stored
 * or shown (the merchant never sees a provider's words).
 */

export const META_ERROR_CODES = [
  'not_connected',
  'reauth_required',
  'no_page',
  'no_instagram',
  'permission_denied',
  'page_not_found',
  'rate_limited',
  'invalid_post',
  'image_rejected',
  'post_rejected',
  'meta_unavailable',
  'not_approved',
  'draft_unavailable',
  'not_available',
  'unexpected',
] as const
export type MetaErrorCode = typeof META_ERROR_CODES[number]

export function isMetaErrorCode(v: unknown): v is MetaErrorCode {
  return typeof v === 'string' && (META_ERROR_CODES as readonly string[]).includes(v)
}

export class MetaApiError extends Error {
  code: MetaErrorCode
  retryable: boolean
  constructor(code: MetaErrorCode, retryable = false) {
    super(code)
    this.name = 'MetaApiError'
    this.code = code
    this.retryable = retryable
  }
}

/**
 * A Graph API error response → a code. Reads only the machine fields (HTTP
 * status, error.code, error.error_subcode) and never error.message or
 * error.error_user_msg.
 *
 * The code numbers are the ones Meta documents for the Graph API error
 * reference; they were NOT re-verified against the live reference when this was
 * written, so an unknown number falls to `unexpected` rather than a guess.
 */
export function classifyGraphError(httpStatus: number, json: unknown): MetaApiError {
  const e = (json && typeof json === 'object' ? (json as { error?: unknown }).error : null) as
    | { code?: unknown; error_subcode?: unknown; type?: unknown } | null
  const code = typeof e?.code === 'number' ? e.code : null
  const sub = typeof e?.error_subcode === 'number' ? e.error_subcode : null

  // Token no longer valid: expired, revoked, or the password changed.
  if (code === 190 || httpStatus === 401) return new MetaApiError('reauth_required')
  // Throttling: the app, the user or the page.
  if (code === 4 || code === 17 || code === 32 || code === 613 || code === 80001 || code === 80002) return new MetaApiError('rate_limited', true)
  // Transient on Meta's side.
  if (code === 1 || code === 2 || httpStatus >= 500) return new MetaApiError('meta_unavailable', true)
  // Instagram: the uploaded photo is not ready yet.
  if (sub === 2207027 || code === 9007) return new MetaApiError('meta_unavailable', true)
  // Instagram: the photo's format or size is not accepted.
  if (sub === 2207026 || sub === 2207004 || sub === 2207005 || sub === 2207009 || sub === 2207052) return new MetaApiError('image_rejected')
  // The app lacks the permission, or has not passed App Review for it.
  if (code === 10 || (code !== null && code >= 200 && code <= 299)) return new MetaApiError('permission_denied')
  // The action was blocked by Meta's integrity systems.
  if (code === 368 || code === 506) return new MetaApiError('post_rejected')
  if (code === 100) return new MetaApiError(httpStatus === 404 ? 'page_not_found' : 'invalid_post')
  if (httpStatus === 404) return new MetaApiError('page_not_found')
  if (httpStatus === 429) return new MetaApiError('rate_limited', true)
  if (httpStatus === 403) return new MetaApiError('permission_denied')
  return new MetaApiError('unexpected')
}
