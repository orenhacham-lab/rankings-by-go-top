/**
 * w17 — the ONE server-side answer to "which currency does this request pay in".
 *
 * Reading order (first hit wins):
 *   1. the market STORED on the account (auth app_metadata.billing_market —
 *      written only by the server, at the first PayPal checkout; see
 *      lib/billing/billing-market-selection.ts and app/api/paypal/activate);
 *   2. LEGACY: an account that already paid through PayPal before the market
 *      had its own place keeps the market its signup language gave it
 *      (he -> ILS, en -> USD), exactly as before, so current customers are
 *      untouched;
 *   3. the visitor's COUNTRY, from Vercel's x-vercel-ip-country header
 *      (lib/billing/market.ts: IL -> ILS, anything else or unknown -> USD).
 *
 * The client never chooses or sends a currency, and billing never writes
 * user_metadata.locale (the language). app_metadata, unlike user_metadata, is
 * not writable by the signed-in user, so a stored market cannot be edited
 * from the browser.
 */

import { headers } from 'next/headers'
import type { SupabaseClient, User } from '@supabase/supabase-js'
import { isBillingMarket, marketForCountry, normalizeCountry, type BillingMarket } from '@/lib/billing/market'

export const COUNTRY_HEADER = 'x-vercel-ip-country'

/** Where the stored market lives on the auth user (server-written only). */
export const STORED_MARKET_KEY = 'billing_market'

/** HISTORICAL data, not a language rule: what the signup language meant for
 *  billing before w17. Read ONLY for an account with PayPal history and no
 *  stored market. A language added later is not in it and falls to country. */
const LEGACY_LOCALE_MARKET: Readonly<Partial<Record<string, BillingMarket>>> = Object.freeze({
  he: 'ILS',
  en: 'USD',
})

export type BillingMarketSource = 'stored' | 'legacy' | 'country'

export interface BillingMarketDecision {
  market: BillingMarket
  source: BillingMarketSource
  /** True once the account's currency can no longer follow the country. */
  locked: boolean
}

export interface BillingMarketInputs {
  storedMarket: unknown
  legacyLocale: unknown
  /** The account has (or had) a PayPal subscription. Only then does the
   *  legacy locale count. */
  hasPaypalHistory: boolean
  country: string | null | undefined
}

export function countryFromHeaders(h: { get(name: string): string | null }): string | null {
  return normalizeCountry(h.get(COUNTRY_HEADER))
}

export function legacyMarketForLocale(locale: unknown): BillingMarket | null {
  if (typeof locale !== 'string' || !Object.prototype.hasOwnProperty.call(LEGACY_LOCALE_MARKET, locale)) return null
  return LEGACY_LOCALE_MARKET[locale] ?? null
}

/** PURE decision from already-known inputs. */
export function decideBillingMarket(i: BillingMarketInputs): BillingMarketDecision {
  if (isBillingMarket(i.storedMarket)) return { market: i.storedMarket, source: 'stored', locked: true }
  const legacy = legacyMarketForLocale(i.legacyLocale)
  if (legacy && i.hasPaypalHistory) return { market: legacy, source: 'legacy', locked: true }
  return { market: marketForCountry(i.country), source: 'country', locked: false }
}

export function storedMarketOf(user: Pick<User, 'app_metadata'> | null | undefined): BillingMarket | null {
  const v = (user?.app_metadata as Record<string, unknown> | undefined)?.[STORED_MARKET_KEY]
  return isBillingMarket(v) ? v : null
}

/** Does this account have (or had) a PayPal subscription? On a lookup error
 *  this answers true, so a paying customer keeps the pre-w17 market rather
 *  than being priced by country on a transient failure. */
async function hasPaypalHistory(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('subscriptions')
    .select('id')
    .eq('user_id', userId)
    .not('paypal_subscription_id', 'is', null)
    .limit(1)
    .maybeSingle()
  if (error) {
    console.error('[billing-market] PayPal history lookup failed; keeping the legacy market', { userId, message: error.message })
    return true
  }
  return !!data
}

/** The request's country (null when the header is absent, e.g. locally). */
export async function requestCountry(): Promise<string | null> {
  return countryFromHeaders(await headers())
}

/**
 * The market for this request: the signed-in account's (stored, then
 * legacy), else the visitor's country. Used by the billing screen, the public
 * pricing pages and the PayPal activation route, so they cannot disagree.
 */
export async function resolveBillingMarket(
  supabase: SupabaseClient,
  user: Pick<User, 'id' | 'app_metadata' | 'user_metadata'> | null,
  country?: string | null,
): Promise<BillingMarketDecision> {
  const c = country === undefined ? await requestCountry() : country
  if (!user) return decideBillingMarket({ storedMarket: null, legacyLocale: null, hasPaypalHistory: false, country: c })
  const storedMarket = storedMarketOf(user)
  const legacyLocale = (user.user_metadata as Record<string, unknown> | null)?.locale
  // The history lookup is needed only when the legacy locale could apply.
  const needsHistory = !storedMarket && legacyMarketForLocale(legacyLocale) !== null
  return decideBillingMarket({
    storedMarket,
    legacyLocale,
    hasPaypalHistory: needsHistory ? await hasPaypalHistory(supabase, user.id) : false,
    country: c,
  })
}
