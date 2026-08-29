const SITE_URL = 'https://www.gotopseo.com'

/**
 * Builds the `alternates.languages` object for the Next.js Metadata API, given
 * the Hebrew (default locale, no prefix) and English (`/en` prefix) paths for
 * the same logical page. `hePath` and `enPath` must start with `/` (use `/`
 * for the Hebrew homepage and `/en` for the English homepage).
 *
 * The Hebrew version is also used as `x-default` since Hebrew is the site's
 * default/primary locale.
 */
export function buildHreflangAlternates(hePath: string, enPath: string) {
  return {
    he: `${SITE_URL}${hePath}`,
    en: `${SITE_URL}${enPath}`,
    'x-default': `${SITE_URL}${hePath}`,
  }
}
