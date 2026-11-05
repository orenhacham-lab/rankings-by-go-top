/**
 * The Polish public site's gate, the same shape as the Spanish, Brazilian
 * Portuguese, French, Italian, Japanese, German and Dutch ones.
 *
 * OFF means genuinely absent, not merely unlinked: `/pl/*` answers 404, no
 * hreflang points at it, it is not in the sitemap, and the language switcher does
 * not offer it. A page that is reachable but unfinished is worse than one that is
 * not there — it gets indexed, and a visitor lands on a half-translated site.
 *
 * IT IS READ AT BUILD TIME, because Next inlines NEXT_PUBLIC_* into the compiled
 * output: turning the language on or off in an environment is a redeploy of it,
 * never a runtime toggle. The flag is NEXT_PUBLIC_ because the language switcher
 * is a client component and must agree with the server about which locales exist.
 *
 * Polish adds ONE page of its own, the same shape as /de/impressum,
 * /ja/tokusho and /nl/bedrijfsgegevens: /pl/dane-firmy. Its basis is NOT the
 * one the Dutch page has, and getting that wrong was the first thing the legal
 * thread corrected. Art. 5 of the ustawa o świadczeniu usług drogą
 * elektroniczną looks like the §5 DDG analogue and is not one for us: the Act
 * sets a COUNTRY-OF-ORIGIN rule keyed to a seat inside the EU, and a provider
 * established in Israel has no such seat, so the provision does not reach us.
 *
 * The duty that does reach us is the information duty of the ustawa o prawach
 * konsumenta, and it asks for MORE than the Dutch one: the register and the
 * registration number, and a TELEPHONE number, not an e-mail address alone.
 * That is why this is a page and not a line in the footer — the footer carries
 * the name, the address and the e-mail, and three of the required items were
 * nowhere on the Polish tree.
 *
 * The page is NOT called Impressum, because that is a German word for a German
 * statute, and it is not called after the e-services act either. "Dane firmy"
 * is Polish for what it is.
 */
export function polishSiteEnabled(value: string | undefined = process.env.NEXT_PUBLIC_POLISH_SITE_ENABLED): boolean {
  return value === 'true'
}

/**
 * The footer link, on every Polish page. Exported here rather than typed into the
 * footer so the gate and the link live in one file, as German and Dutch do it.
 */
export const POLISH_COMPANY_INFO_LINK = { href: '/pl/dane-firmy', label: 'Dane firmy' } as const
