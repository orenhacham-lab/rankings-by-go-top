/**
 * The Brazilian Portuguese public site's gate, the same shape as the Spanish one.
 *
 * OFF means genuinely absent, not merely unlinked: `/pt-BR/*` answers 404, no
 * hreflang points at it, it is not in the sitemap, and the language switcher does
 * not offer it. A page that is reachable but unfinished is worse than one that is
 * not there — it gets indexed, and a visitor lands on a half-translated site.
 *
 * IT IS READ AT BUILD TIME, because Next inlines NEXT_PUBLIC_* into the compiled
 * output: turning the language on or off in an environment is a redeploy of it,
 * never a runtime toggle. The flag is NEXT_PUBLIC_ because the language switcher
 * is a client component and must agree with the server about which locales exist.
 *
 * It stays OFF until the owner says otherwise. Two things are owed before it can
 * go on: the cookie-consent log still constrains its locale to he/en/es, so a
 * Brazilian visitor's cookie decision would be dropped in silence (one additive
 * line, the legal thread's migration), and the owner's own rule is that a language
 * launches only once its legal pages cover us in it.
 */
export function portugueseSiteEnabled(value: string | undefined = process.env.NEXT_PUBLIC_PORTUGUESE_SITE_ENABLED): boolean {
  return value === 'true'
}
