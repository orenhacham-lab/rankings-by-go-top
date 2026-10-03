/**
 * The Spanish public site's gate.
 *
 * The Spanish tree is built and reviewable on the PREVIEW deployment before it
 * is a product: Spain's pricing is not set, the legal pages have no Spanish
 * version yet, and the payment provider for customers abroad is not approved.
 * So the pages exist in the repository and are OFF unless
 * NEXT_PUBLIC_SPANISH_SITE_ENABLED is exactly "true".
 *
 * OFF means genuinely absent, not merely unlinked: `/es/*` answers 404, no
 * hreflang points at it, it is not in the sitemap, and the language switcher
 * does not offer it. A page that is reachable but unfinished is worse than one
 * that is not there — it gets indexed, and a visitor lands on a half-translated
 * site. The flag is NEXT_PUBLIC_ because the switcher is a client component and
 * must agree with the server about which locales exist.
 */
export function spanishSiteEnabled(value: string | undefined = process.env.NEXT_PUBLIC_SPANISH_SITE_ENABLED): boolean {
  return value === 'true'
}
