/**
 * The Spanish public site's gate.
 *
 * The Spanish site is PUBLIC since 3 October 2026 (the owner's word,
 * "תפרסם את הספרדית"), so the flag is now on in Production as well as Preview.
 * It stays a flag because it is also the switch for the next language's build
 * and the one way to take Spanish down without a revert: the pages exist in the
 * repository and are OFF unless NEXT_PUBLIC_SPANISH_SITE_ENABLED is exactly
 * "true".
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
 * restart, so turning Spanish on or off in an environment is a redeploy of it,
 * never a runtime toggle. Verified by building twice: with
 * it on, `/es` and its twelve pages answer 200; with it absent, every one of
 * them answers 404, no hreflang names Spanish and the sitemap omits it.
 */
export function spanishSiteEnabled(value: string | undefined = process.env.NEXT_PUBLIC_SPANISH_SITE_ENABLED): boolean {
  return value === 'true'
}
