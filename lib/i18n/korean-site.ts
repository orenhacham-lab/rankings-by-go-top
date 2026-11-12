/**
 * The Korean public site's gate, the same shape as the eight locales before it.
 *
 * OFF means genuinely absent, not merely unlinked: `/ko/*` answers 404, no
 * hreflang points at it, it is not in the sitemap, and the language switcher does
 * not offer it. A page that is reachable but unfinished is worse than one that is
 * not there — it gets indexed, and a visitor lands on a half-translated site.
 *
 * IT IS READ AT BUILD TIME, because Next inlines NEXT_PUBLIC_* into the compiled
 * output: turning the language on or off in an environment is a redeploy of it,
 * never a runtime toggle. The flag is NEXT_PUBLIC_ because the language switcher
 * is a client component and must agree with the server about which locales exist.
 *
 * KOREA IS THE FIRST LOCALE THAT MAY MARKET AND MAY NOT SELL ON OUR OWN NAME.
 * The legal thread's ruling of 12.11.2026 (/mnt/project-files/legal/
 * korea-locale-2026-11-12.md): VAT Act art. 53-2 puts 10% Korean VAT on a B2C
 * electronic service supplied to a Korean consumer by a foreign supplier with NO
 * de-minimis threshold, from the first sale, and 전자상거래법 art. 13 asks a
 * storefront for a Korean business registration number and a mail-order
 * notification number that a seller with no Korean registration cannot produce.
 * Both duties fall on the SELLER, and for the abroad plans the seller of record is
 * Creem, whose own Merchant Terms cl. 3.2 and 3.3.4 (read 12.11.2026) make it the
 * contractual reseller in its own name and put the calculation, collection and
 * remittance of indirect taxes on it, by the buyer's billing address.
 *
 * So `koreanCheckoutEnabled` is a SECOND gate, deliberately separate from the
 * first: the locale can go live as a marketing-and-trial site while the
 * checkout question is still open, and the Korean trial takes no card, so there
 * is nothing to tax and nothing to withdraw from during it. Do not collapse the
 * two flags into one. The day the legal thread accepts Creem's clause, or the
 * company registers for simplified NTS collection, this one flips and the
 * Korean price pages stop being an explanation and start being a checkout.
 */
export function koreanSiteEnabled(value: string | undefined = process.env.NEXT_PUBLIC_KOREAN_SITE_ENABLED): boolean {
  return value === 'true'
}

/**
 * MAY A VISITOR ON THE KOREAN TREE COMPLETE A PAID PURCHASE?
 *
 * Separate from `koreanSiteEnabled` for the reason above, and fails CLOSED: an
 * environment that never heard of the flag sells nothing in Korea, which is the
 * safe half of the ruling. It gates the price pages' buy buttons, not the pages
 * themselves — a Korean reader still sees what the plans cost, because hiding
 * the price would make the locale useless for the very terms it is built
 * against, and still gets the seven-day trial, which needs no card.
 */
export function koreanCheckoutEnabled(value: string | undefined = process.env.NEXT_PUBLIC_KOREAN_CHECKOUT_ENABLED): boolean {
  return value === 'true'
}
