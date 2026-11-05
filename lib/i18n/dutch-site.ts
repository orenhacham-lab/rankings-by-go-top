/**
 * The Dutch public site's gate, the same shape as the Spanish, Brazilian
 * Portuguese, French, Italian, Japanese and German ones.
 *
 * OFF means genuinely absent, not merely unlinked: `/nl/*` answers 404, no
 * hreflang points at it, it is not in the sitemap, and the language switcher does
 * not offer it. A page that is reachable but unfinished is worse than one that is
 * not there — it gets indexed, and a visitor lands on a half-translated site.
 *
 * IT IS READ AT BUILD TIME, because Next inlines NEXT_PUBLIC_* into the compiled
 * output: turning the language on or off in an environment is a redeploy of it,
 * never a runtime toggle. The flag is NEXT_PUBLIC_ because the language switcher
 * is a client component and must agree with the server about which locales exist.
 *
 * Dutch adds NO page of its own, which is the one way it differs from German and
 * Japanese. The Netherlands has no §5 DDG analogue to the Impressum: Art. 3:15d
 * BW asks that the seller's identity, address and contact be "easily, directly
 * and permanently accessible", and the footer and the terms already carry all
 * three in every locale. Inventing a /nl/impressum by reflex would add a page
 * Dutch law does not ask for.
 */
export function dutchSiteEnabled(value: string | undefined = process.env.NEXT_PUBLIC_DUTCH_SITE_ENABLED): boolean {
  return value === 'true'
}
