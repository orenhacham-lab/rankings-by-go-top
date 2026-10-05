import { spanishSiteEnabled } from '@/lib/i18n/spanish-site'
import { portugueseSiteEnabled } from '@/lib/i18n/portuguese-site'

const SITE_URL = 'https://www.gotopseo.com'

/**
 * The Portuguese URL of a page, from its Spanish one. The language trees are
 * mirrors — `/es/pricing` and `/pt-BR/pricing` are the same page in two
 * languages — so deriving it keeps every page's hreflang set complete without
 * each of the twenty-odd routes having to list a fourth path it would be free to
 * forget. `lib/i18n/__qa__/spanish-public-site.qa.ts` holds the mirror itself:
 * every route under app/(public)/es has a twin under app/(public)/pt-BR, or the
 * derived URL would advertise a page that is not there.
 */
function portugueseTwin(esPath: string): string {
  return esPath === '/es' ? '/pt-BR' : esPath.replace(/^\/es(?=\/|$)/, '/pt-BR')
}

/**
 * Builds the `alternates.languages` object for the Next.js Metadata API, given
 * the Hebrew (default locale, no prefix) and English (`/en` prefix) paths for
 * the same logical page. `hePath` and `enPath` must start with `/` (use `/`
 * for the Hebrew homepage and `/en` for the English homepage).
 *
 * The Hebrew version is also used as `x-default` since Hebrew is the site's
 * default/primary locale.
 */
export function buildHreflangAlternates(hePath: string, enPath: string, esPath?: string) {
  const alternates: Record<string, string> = {
    he: `${SITE_URL}${hePath}`,
    en: `${SITE_URL}${enPath}`,
    'x-default': `${SITE_URL}${hePath}`,
  }
  // A language is announced to search engines only once it exists. While its
  // flag is off its tree is a 404, so an hreflang pointing at it would
  // advertise a page that is not there.
  if (esPath && spanishSiteEnabled()) alternates.es = `${SITE_URL}${esPath}`
  if (esPath && portugueseSiteEnabled()) alternates['pt-BR'] = `${SITE_URL}${portugueseTwin(esPath)}`
  return alternates
}
