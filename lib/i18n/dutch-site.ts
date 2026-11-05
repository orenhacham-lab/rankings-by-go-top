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
 * Dutch adds ONE page of its own, the same shape as /de/impressum and
 * /ja/tokusho: /nl/bedrijfsgegevens. Art. 3:15d lid 1 BW is the Dutch §5 DDG
 * analogue, word for word in substance — "Degene die een dienst van de
 * informatiemaatschappij verleent, maakt de volgende gegevens gemakkelijk,
 * rechtstreeks en permanent toegankelijk" — with no establishment qualifier, so
 * being established in Israel is no exemption, and Art. 3:15f lid 3 names the
 * officials charged with detecting breaches of it, which makes it publicly
 * enforced and not merely a private-law duty. Two of its items are NOT in the
 * footer or the terms: sub c wants the REGISTER named, not just the number, and
 * sub f wants the VAT identification number, which we do not have in the
 * Netherlands and therefore have to say so about.
 *
 * The page is NOT called Impressum, because that is a German word for a German
 * statute; lid 1 asks only that the data be easy, direct and permanently
 * accessible, so the title is ours and it is Dutch. "Rechtstreeks" is what makes
 * it a footer link on every /nl page rather than a page two clicks deep.
 */
export function dutchSiteEnabled(value: string | undefined = process.env.NEXT_PUBLIC_DUTCH_SITE_ENABLED): boolean {
  return value === 'true'
}

/**
 * The footer link, on every Dutch page. Exported here rather than typed into the
 * footer so the gate and the link live in one file, as German does it.
 */
export const DUTCH_COMPANY_INFO_LINK = { href: '/nl/bedrijfsgegevens', label: 'Bedrijfsgegevens' } as const
