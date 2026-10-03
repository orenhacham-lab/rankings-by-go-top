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
 *
 * IT IS READ AT BUILD TIME. Next inlines NEXT_PUBLIC_* into the compiled
 * output, so changing it on a deployment takes effect at the next build, not on
 * restart. That is what we want here — Preview is built with it on and
 * Production without it — but it means "turn the Spanish site on" is a redeploy
 * of that environment, never a runtime toggle. Verified by building twice: with
 * it on, `/es` and its twelve pages answer 200; with it absent, every one of
 * them answers 404, no hreflang names Spanish and the sitemap omits it.
 */
export function spanishSiteEnabled(value: string | undefined = process.env.NEXT_PUBLIC_SPANISH_SITE_ENABLED): boolean {
  return value === 'true'
}
