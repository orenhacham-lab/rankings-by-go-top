/**
 * The language of the AUTH surface (/login, /signup and their /en twins).
 *
 * THE DEFECT THIS REPLACES. Both pages already carried complete Hebrew AND
 * English dictionaries — labels, placeholders, validation messages, errors,
 * success states, footer links. What was broken was the one line that CHOSE
 * between them:
 *
 *     const lang = langParam === 'en' || pathname?.startsWith('/en/') ? 'en' : 'he'
 *
 * An `/en/` URL or an explicit `?lang=en`, and otherwise Hebrew — full stop. The
 * request contract that PR #58 built (route → cookie → auth seed →
 * Accept-Language → English) was never consulted, so a reviewer whose browser
 * resolved to English received `<html lang="en" dir="ltr">` wrapped around a
 * Hebrew sign-in form. Correct attributes on Hebrew copy is the worse of the two
 * failures: it tells a screen reader to pronounce Hebrew as English.
 *
 * PRECEDENCE, matching the rest of the contract:
 *   1. the ROUTE — `/en/login` is the English route and says so itself;
 *   2. an explicit `?lang=` — carried by the OAuth callback and linked from the
 *      English sitemap, so it must keep working;
 *   3. the locale the SERVER resolved for this request.
 *
 * DETERMINISTIC ON BOTH SIDES. `usePathname()` and `useSearchParams()` return
 * the real request values during SSR as well as on the client, and the server
 * locale arrives as a prop through AuthLocaleProvider — so this function has the
 * same three inputs and produces the same answer in both renders. There is no
 * effect anywhere in the path and therefore nothing to flip after hydration.
 */

import type { PublicLocale } from './locales'
import { isEnglishPath, isPortuguesePath, isSpanishPath } from './request-locale'
import { normalizeDashboardUiLocale } from './dashboard/locale'

/**
 * SPANISH JOINED THE THREE (owner, 4 October 2026): "a customer comes in on the
 * Spanish site, signs up, signs in, and everything is in Spanish". The auth
 * surface was the break in that chain — it knew two languages, so a Spanish
 * visitor was handed the Hebrew or English form. `/es/login` is now the Spanish
 * route and says so itself, exactly as `/en/login` does, and the Spanish tree's
 * own gate (app/(auth)/es/layout.tsx) keeps those URLs from existing while the
 * Spanish site is off — so this can never label a 404 'es'.
 *
 * Brazilian Portuguese joins it on the same terms: `/pt-BR/login` is the
 * Portuguese route, gated by app/(auth)/pt-BR/layout.tsx.
 */
export function resolveAuthLocale(input: {
  pathname?: string | null
  langParam?: string | null
  serverLocale?: PublicLocale | null
}): PublicLocale {
  if (isEnglishPath(input.pathname)) return 'en'
  if (isSpanishPath(input.pathname)) return 'es'
  if (isPortuguesePath(input.pathname)) return 'pt-BR'
  return normalizeDashboardUiLocale(input.langParam) ?? input.serverLocale ?? 'he'
}
