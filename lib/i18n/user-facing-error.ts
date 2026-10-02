/**
 * An error whose message was written for the merchant, in the merchant's
 * language, and may therefore be shown to them as it is.
 *
 * Every other error — a database answer, a provider's text, a crash — is not
 * shown: lib/i18n/action-messages.ts turns it into the generic localized
 * "saving failed". Pure (no server imports), so both server code and the
 * classes that extend it (lib/quota's KeywordQuotaError) can use it.
 */
export class UserFacingError extends Error {
  readonly userFacing = true as const
  /** A stable code for callers that must tell refusals apart without reading the text. */
  readonly code: string
  constructor(message: string, code = 'USER_FACING') {
    super(message)
    this.code = code
  }
}

export function isUserFacingError(err: unknown): err is UserFacingError {
  return !!err && typeof err === 'object' && (err as { userFacing?: unknown }).userFacing === true && typeof (err as { message?: unknown }).message === 'string'
}

/**
 * The message of an API route's JSON error in the screen's language: `errorEn`
 * for English when the route gave one, `error` for Hebrew, else `fallback`.
 * Only those two fields are read, and only when they are non-empty strings.
 */
export function apiErrorText(body: unknown, locale: 'he' | 'en', fallback: string): string {
  if (!body || typeof body !== 'object') return fallback
  const b = body as { error?: unknown; errorEn?: unknown }
  const pick = locale === 'en' ? b.errorEn : b.error
  return typeof pick === 'string' && pick.trim() ? pick : fallback
}
