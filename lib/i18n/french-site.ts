/**
 * The French public site's gate, the same shape as the Spanish and Brazilian
 * Portuguese ones.
 *
 * OFF means genuinely absent, not merely unlinked: `/fr/*` answers 404, no
 * hreflang points at it, it is not in the sitemap, and the language switcher does
 * not offer it. A page that is reachable but unfinished is worse than one that is
 * not there — it gets indexed, and a visitor lands on a half-translated site.
 *
 * IT IS READ AT BUILD TIME, because Next inlines NEXT_PUBLIC_* into the compiled
 * output: turning the language on or off in an environment is a redeploy of it,
 * never a runtime toggle. The flag is NEXT_PUBLIC_ because the language switcher
 * is a client component and must agree with the server about which locales exist.
 *
 * It stays OFF until the owner says otherwise, which is also the owner's own
 * rule: a language launches only once its legal pages cover us in it.
 */
export function frenchSiteEnabled(value: string | undefined = process.env.NEXT_PUBLIC_FRENCH_SITE_ENABLED): boolean {
  return value === 'true'
}
