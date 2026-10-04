/**
 * Password reset, on Supabase Auth's own recovery flow (no provider change).
 *
 *   /forgot-password  (/en/forgot-password)
 *     → supabase.auth.resetPasswordForEmail(email, { redirectTo })
 *     → Supabase emails a recovery link that lands on /api/auth/callback with a
 *       code and next=/reset-password (the same callback the sign-up
 *       confirmation already uses), which exchanges it for a session
 *   /reset-password   (/en/reset-password)
 *     → supabase.auth.updateUser({ password }) with that session.
 *
 * ACCOUNT PRIVACY. The request step answers the SAME thing whether or not an
 * account exists for the address: Supabase's own answer (success, a rate limit
 * that only a real account can hit, any other refusal) is never shown, so the
 * form cannot be used to learn who has an account. Only a malformed address
 * (checked before anything is sent) and a network failure (nothing reached the
 * server) are reported.
 *
 * No provider text reaches the page: every outcome is a code the page maps to
 * its own dictionary.
 */
import type { PublicLocale } from '@/lib/i18n/locales'

/** Where the recovery link lands after Supabase: its fixed, same-origin path. */
export const RESET_PASSWORD_PATH = '/reset-password'
export const MIN_PASSWORD_LENGTH = 8

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * The redirect the recovery email carries: our own callback, next fixed to the
 * reset page (never a caller-supplied path), and the form's language.
 */
export function recoveryRedirectTo(origin: string, locale: PublicLocale): string {
  return `${origin}/api/auth/callback?next=${encodeURIComponent(RESET_PASSWORD_PATH)}&lang=${locale}`
}

export type ResetRequestOutcome = 'sent' | 'invalid_email' | 'unavailable'

type RecoveryClient = {
  auth: { resetPasswordForEmail: (email: string, options: { redirectTo: string }) => Promise<{ error: unknown }> }
}

/** Ask Supabase to send a recovery link. 'sent' whatever Supabase answered (see ACCOUNT PRIVACY). */
export async function requestPasswordReset(client: RecoveryClient, rawEmail: string, redirectTo: string): Promise<ResetRequestOutcome> {
  const email = rawEmail.trim()
  if (!EMAIL_SHAPE.test(email)) return 'invalid_email'
  try {
    await client.auth.resetPasswordForEmail(email, { redirectTo })
  } catch {
    // Nothing reached the server (offline, blocked): say so, it reveals nothing.
    return 'unavailable'
  }
  return 'sent'
}

export type NewPasswordOutcome = 'updated' | 'too_short' | 'mismatch' | 'same_password' | 'weak_password' | 'link_expired' | 'failed'

type UpdateClient = {
  auth: { updateUser: (attrs: { password: string }) => Promise<{ error: unknown }> }
}

/** Validate and set the new password on the recovery session. Reads only the error's stable code. */
export async function setNewPassword(client: UpdateClient, password: string, confirm: string): Promise<NewPasswordOutcome> {
  if (password.length < MIN_PASSWORD_LENGTH) return 'too_short'
  if (password !== confirm) return 'mismatch'
  let error: unknown
  try {
    ;({ error } = await client.auth.updateUser({ password }))
  } catch {
    return 'failed'
  }
  if (!error) return 'updated'
  const code = String((error as { code?: unknown }).code ?? '').toLowerCase()
  const name = String((error as { name?: unknown }).name ?? '')
  if (code === 'same_password') return 'same_password'
  if (code === 'weak_password') return 'weak_password'
  if (code === 'session_not_found' || code === 'session_expired' || name === 'AuthSessionMissingError') return 'link_expired'
  return 'failed'
}

/**
 * Where a recovery link that could not be exchanged goes: back to the request
 * form, in the visitor's language, saying the link expired. Only for the reset
 * page's own `next`; every other failure keeps the sign-in page.
 */
export function recoveryFailureUrl(origin: string, lang: string | null): URL {
  const url = new URL(lang === 'en' ? '/en/forgot-password' : '/forgot-password', origin)
  url.searchParams.set('error', 'link')
  if (lang === 'he') url.searchParams.set('lang', 'he')
  return url
}
