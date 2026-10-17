/**
 * GOOGLE CONSENT MODE v2 — the signal names, the denied default, and the update
 * a decision produces.
 *
 * Two independent controls protect the visitor, and the site uses BOTH:
 *
 *  1. gtm.js is not requested at all until a decision exists that allows
 *     something optional (see components/consent/GoogleTags.tsx). A visitor who
 *     refuses never contacts googletagmanager.com from a page of ours.
 *  2. For the visitor who DOES agree, the consent state is declared to Google
 *     in its own vocabulary, so individual tags inside the container respect the
 *     categories even if someone adds a tag to GTM later. The default is
 *     declared BEFORE any tag can run, which is the only ordering Consent Mode
 *     accepts — a default pushed after a tag has fired cannot un-fire it.
 *
 * `security_storage` is granted in the default: it covers fraud prevention and
 * is the one bucket that is strictly necessary. `wait_for_update` tells Google's
 * tags to hold briefly for an update instead of assuming the default is final.
 *
 * Signal names are Google's, not ours; `ad_user_data` and `ad_personalization`
 * are the two that Consent Mode v2 added to the original four.
 */
import type { ConsentChoices } from './categories'

export type GoogleConsentSignal =
  | 'ad_storage'
  | 'ad_user_data'
  | 'ad_personalization'
  | 'analytics_storage'
  | 'functionality_storage'
  | 'personalization_storage'
  | 'security_storage'

export type GoogleConsentState = Record<GoogleConsentSignal, 'granted' | 'denied'>

/** Everything optional denied. What the page declares before any tag exists. */
export const GOOGLE_CONSENT_DEFAULT: GoogleConsentState = {
  ad_storage: 'denied',
  ad_user_data: 'denied',
  ad_personalization: 'denied',
  analytics_storage: 'denied',
  functionality_storage: 'denied',
  personalization_storage: 'denied',
  security_storage: 'granted',
}

/** Our three categories expressed in Google's seven signals. */
export function googleConsentFrom(choices: ConsentChoices): GoogleConsentState {
  const ads = choices.marketing ? 'granted' : 'denied'
  return {
    ad_storage: ads,
    ad_user_data: ads,
    ad_personalization: ads,
    analytics_storage: choices.analytics ? 'granted' : 'denied',
    // Preference storage rides with analytics: it is the bucket for "remember
    // how this visitor likes the page", which is not strictly necessary here.
    functionality_storage: choices.analytics ? 'granted' : 'denied',
    personalization_storage: choices.analytics ? 'granted' : 'denied',
    security_storage: 'granted',
  }
}

/**
 * The inline <script> that declares the denied default and defines gtag().
 * It must be the FIRST script in <head> — before gtm.js is ever appended — so
 * the dataLayer exists and the default is on it before a tag can read it.
 * `wait_for_update` is milliseconds Google's tags wait for `consent update`.
 */
export const GOOGLE_CONSENT_DEFAULT_SCRIPT = `
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('consent', 'default', ${JSON.stringify({ ...GOOGLE_CONSENT_DEFAULT, wait_for_update: 500 })});
gtag('js', new Date());
`.trim()
