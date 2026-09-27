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
import type { Locale } from '@/lib/i18n/locales'
import { sanitizeNextPath } from '@/lib/i18n/request-locale'

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

/** Where Google returns to: the auth callback on this origin, with a sanitized `next` and the form's language. */
export function googleRedirectTo(origin: string, nextPath: string, lang: Locale): string {
  const url = new URL('/api/auth/callback', origin)
  url.searchParams.set('next', sanitizeNextPath(nextPath, '/dashboard'))
  url.searchParams.set('lang', lang)
  return url.toString()
}
