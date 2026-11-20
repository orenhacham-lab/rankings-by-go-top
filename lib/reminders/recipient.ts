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
 * WITHOUT A RECORDED LANGUAGE the fallback reads provenance and then the stored
 * signup country, in that order, and `fallbackEmailLocale` below says why each
 * branch answers what it answers. Both facts are written once and never
 * rewritten: `billing_governance.signup_origin` and
 * `signup_attribution.signup_country`. An account that merely installed Shopify
 * later is not App Store provenance.
 *
 * AN ACCOUNT SHOULD RARELY REACH THAT FALLBACK AT ALL. Every sign-in door now
 * records the language it was used in (lib/i18n/account-locale.ts, called from
 * the auth callback), and the dashboard's switcher writes the account's language
 * too (app/api/account/language/route.ts). Before that, a Google sign-up
 * recorded no language at all, so every Google customer fell through to the
 * fallback — which was Hebrew.
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
import type { SignupOrigin } from '@/lib/billing/governance'

/**
 * How the ACCOUNT began (`billing_governance.signup_origin`), or `null` when the
 * provenance could not be read — which is not "website".
 */
export type SignupOriginFact = SignupOrigin | null

/** Everything the fallback is allowed to look at. Nothing here is a live request. */
export interface EmailLocaleFacts {
  /** Where the account was opened, as provenance. */
  origin: SignupOriginFact
  /** The alpha-2 country the account was opened from, or null when unknown. */
  signupCountry: string | null
}

/**
 * The language to use when the account has none recorded, or `null` when there
 * is no honest answer and the email must wait.
 *
 * THE ENGLISH CHANNELS COME FIRST. The Shopify App Store journey is English-only,
 * and so is every external marketplace (JVZoo, Digistore24, ClickBank): their
 * pages, their checkouts and the claim email are English, and the buyer never
 * saw a Hebrew screen. A marketplace buyer used to be mailed in HEBREW — it
 * happened in Production on 2026-11-18, to a buyer in the Philippines about
 * their own .com.ph site — because 'marketplace' fell through to the same branch
 * as a Hebrew website sign-up.
 *
 * THEN WHERE THE ACCOUNT WAS OPENED. `signup_attribution.signup_country` is the
 * one stored fact about the reader that a cron can read
 * (lib/compliance/signup-country.ts). A country is NOT a language, so it is used
 * for one coarse decision only: Israel is the Hebrew market, and everywhere else
 * gets English rather than Hebrew. It never picks a third language — guessing
 * Spanish from ES would be inventing a fact about a person, and the account's
 * own recorded language is what Spanish comes from.
 *
 * ISRAEL AND THE UNREADABLE CASE STAY AS THEY WERE. A website sign-up with no
 * country on file is an account from before that column existed, i.e. the Hebrew
 * site, so Hebrew. A provenance read that FAILED and no country on file answers
 * NOTHING, and the automation cron returns every 15 minutes, so that is a delay,
 * not a lost email. The country is read BEFORE that silence on purpose: it is a
 * stored fact about the reader, so it does not need the provenance to be legible.
 */
export function fallbackEmailLocale(facts: EmailLocaleFacts): 'he' | 'en' | null {
  if (facts.origin === 'shopify_app_store' || facts.origin === 'marketplace') return 'en'
  const country = normalizeEmailCountry(facts.signupCountry)
  if (country) return country === 'IL' ? 'he' : 'en'
  if (facts.origin === null) return null
  return 'he'
}

/** An alpha-2 country code, upper case, or null. Never a longer string. */
function normalizeEmailCountry(raw: string | null): string | null {
  const v = (raw ?? '').trim().toUpperCase()
  return /^[A-Z]{2}$/.test(v) ? v : null
}
