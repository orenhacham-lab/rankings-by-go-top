/**
 * Who a customer email goes to, and in which language. One module, because the
 * approval reminder, the setup emails and the weekly summary must agree.
 *
 * THE LANGUAGE IS THE OWNER'S OWN. It is the language recorded on the account at
 * signup (the version of the site they registered on), and nothing else overrides
 * it. The three runs used to guess instead: an account with a connected Shopify
 * store was mailed in English, so an Israeli agency that connected one client's
 * Shopify store received every email about every project in English. A
 * `shopify_connections` row is an integration record, exactly as
 * lib/billing/governance.ts says; it is not evidence of anybody's language.
 *
 * ENGLISH WITHOUT A RECORDED LANGUAGE belongs to one case only: an account that
 * CAME from the Shopify App Store. That journey is English-only and seeds no
 * language, so English is the right answer for it. The fact is provenance
 * (`billing_governance.signup_origin`), which is written once and never
 * rewritten; an account that merely installed later is not it.
 *
 * WHAT CANNOT BE READ IS NOT GUESSED. When the provenance read fails and the
 * account carries no recorded language, there is no language to write in, so
 * nothing is sent this run. The automation cron returns every 15 minutes, so
 * that is a delay, not a lost email.
 *
 * STAFF ARE NOT CUSTOMERS. An administrator's own projects get none of these
 * emails. They exist to nudge a customer who has not finished something, and an
 * administrator is us.
 */

/**
 * Did this account come from the Shopify App Store? `null` means the provenance
 * could not be read — not "no".
 */
export type ShopifyOriginFact = boolean | null

/**
 * The language to use when the account has none recorded, or `null` when there
 * is no honest answer and the email must wait.
 */
export function fallbackEmailLocale(origin: ShopifyOriginFact): 'he' | 'en' | null {
  if (origin === null) return null
  return origin ? 'en' : 'he'
}
