/**
 * "Continue with Google" on the sign-in and sign-up pages: when it shows, and
 * where Google sends the visitor back to.
 *
 * OFF UNLESS NEXT_PUBLIC_GOOGLE_SIGNIN_ENABLED is exactly "true": the Google
 * provider must first be configured in Supabase (and its OAuth client in
 * Google Cloud), or the button would lead to an error page.
 *
 * NEVER ON A SHOPIFY SURFACE. The Shopify handoff sends merchants to
 * /login?next=/shopify/... (and the embedded app runs in the admin's iframe,
 * where Google refuses to render its sign-in); that flow stays exactly as it
 * is, so the button does not show for a /shopify destination or inside a frame.
 *
 * THE RETURN is the existing callback (app/api/auth/callback/route.ts): it
 * exchanges the code, sanitizes `next` again, creates the default client, and
 * keeps the language. `next` is sanitized here too (sanitizeNextPath: a
 * same-origin path or the dashboard), so no external address can ride it. The
 * free check's claim is NOT in this URL: it is the first-party httpOnly cookie
 * the sign-up page set before the visitor left (lib/onboarding/claim-cookie.ts,
 * SameSite=Lax), which the browser sends again when Google redirects back.
 */
import { LOCALE_PREFIX, type PublicLocale } from '@/lib/i18n/locales'
import { normalizeDashboardUiLocale } from '@/lib/i18n/dashboard/locale'
import { sanitizeNextPath } from '@/lib/i18n/request-locale'
import { statedAuthUrl } from '@/lib/i18n/auth-href'

/** The flag as the browser bundle sees it: inlined at build time. */
export function googleSignInEnabled(value: string | undefined = process.env.NEXT_PUBLIC_GOOGLE_SIGNIN_ENABLED): boolean {
  return value === 'true'
}

/** A destination that belongs to the Shopify handoff. */
export function isShopifyDestination(nextPath: string): boolean {
  const path = sanitizeNextPath(nextPath, '/dashboard')
  return path === '/shopify' || path.startsWith('/shopify/') || path.startsWith('/shopify?') || path.startsWith('/en/shopify')
}

export function googleSignInVisible(args: { enabled: boolean; nextPath: string; framed: boolean }): boolean {
  return args.enabled && !args.framed && !isShopifyDestination(args.nextPath)
}

/**
 * The site's own Google client (lib/auth/google-direct.ts), as the browser
 * bundle sees it: when its id is set, the button starts the flow on this
 * origin, so Google's consent screen names this site instead of the Supabase
 * project. Unset keeps the Supabase-hosted flow below, exactly as before.
 */
export function googleDirectConfigured(value: string | undefined = process.env.NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID): boolean {
  return typeof value === 'string' && value.trim().length > 0
}

/** The same-origin start of that flow, with a sanitized `next` and the form's language. */
export function googleStartPath(nextPath: string, lang: PublicLocale): string {
  const params = new URLSearchParams({ next: sanitizeNextPath(nextPath, '/dashboard'), lang })
  return `/api/auth/google?${params.toString()}`
}

/** Where a Google sign-in that did not complete lands: the sign-in form, in its language, with one generic line. */
export function googleSignInFailureUrl(origin: string, lang: string | null | undefined): string {
  // The form in the language that sent them, from the one prefix table: a
  // two-way check sent a Spanish visitor back to the Hebrew form.
  return statedAuthUrl(origin, 'login', lang, { param: 'error', value: 'google' }).toString()
}

/** Where Google returns to: the auth callback on this origin, with a sanitized `next` and the form's language. */
export function googleRedirectTo(origin: string, nextPath: string, lang: PublicLocale): string {
  const url = new URL('/api/auth/callback', origin)
  url.searchParams.set('next', sanitizeNextPath(nextPath, '/dashboard'))
  url.searchParams.set('lang', lang)
  return url.toString()
}

/** The button's words, per language: kept here, out of the shared auth components (lib/i18n/__qa__/auth-surface-language.qa.ts). */
const COPY = {
  he: { label: 'המשך עם Google', or: 'או', failed: 'לא הצלחנו להתחיל את ההתחברות עם Google. נסו שוב, או המשיכו עם אימייל.', returnFailed: 'ההתחברות עם Google לא הושלמה. נסו שוב, או המשיכו עם אימייל.' },
  en: { label: 'Continue with Google', or: 'or', failed: "We couldn't start signing in with Google. Try again, or continue with email.", returnFailed: "Signing in with Google didn't complete. Try again, or continue with email." },
  es: { label: 'Continuar con Google', or: 'o', failed: 'No hemos podido iniciar el acceso con Google. Inténtalo de nuevo o continúa con tu correo electrónico.', returnFailed: 'El acceso con Google no se ha completado. Inténtalo de nuevo o continúa con tu correo electrónico.' },
  'pt-BR': { label: 'Continuar com o Google', or: 'ou', failed: 'Não conseguimos iniciar o acesso com o Google. Tente novamente ou continue com seu e-mail.', returnFailed: 'O acesso com o Google não foi concluído. Tente novamente ou continue com seu e-mail.' },
} as const

export function googleSignInCopy(lang: PublicLocale): (typeof COPY)[PublicLocale] {
  return COPY[lang] ?? COPY.en
}

/** Whether this page runs inside a frame; a cross-origin parent throws on access, and that is a frame too. */
export function isFramed(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.self !== window.top
  } catch {
    return true
  }
}
