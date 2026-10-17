/**
 * Creem's own buyer terms.
 *
 * Its own module because two screens now have to show it, and the URL is the
 * one Creem string a component may carry: an href cannot come from a
 * translation that a language might omit (lib/creem/__qa__/creem-billing-ui).
 *
 * Where it is used:
 *   - the card checkout button (app/(dashboard)/billing/CreemCheckoutButton.tsx),
 *     where Creem's Merchant Terms 3.8 requires the buyer to be shown them
 *     before paying;
 *   - the manage card on the billing screen (app/(dashboard)/billing/BillingView.tsx),
 *     which tells a Creem-billed customer where cancelling actually happens.
 */
export const CREEM_BUYER_TERMS_URL = 'https://www.creem.io/buyer-terms'
