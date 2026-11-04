/**
 * The German public site's gate, the same shape as the Spanish, Brazilian
 * Portuguese, French, Italian and Japanese ones.
 *
 * OFF means genuinely absent, not merely unlinked: `/de/*` answers 404, no
 * hreflang points at it, it is not in the sitemap, and the language switcher does
 * not offer it. A page that is reachable but unfinished is worse than one that is
 * not there — it gets indexed, and a visitor lands on a half-translated site.
 *
 * IT IS READ AT BUILD TIME, because Next inlines NEXT_PUBLIC_* into the compiled
 * output: turning the language on or off in an environment is a redeploy of it,
 * never a runtime toggle. The flag is NEXT_PUBLIC_ because the language switcher
 * is a client component and must agree with the server about which locales exist.
 *
 * German carries one obligation none of the others do: §5 DDG (the provision the
 * old §5 TMG became) requires an Impressum reachable from every page. The gate
 * and that page go live together — `/de/impressum` is in the tree and in the
 * footer before the flag is ever turned on, never after.
 */
export function germanSiteEnabled(value: string | undefined = process.env.NEXT_PUBLIC_GERMAN_SITE_ENABLED): boolean {
  return value === 'true'
}
