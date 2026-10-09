/**
 * The Go Top SEO listing in the Shopify App Store (owner, 5 October 2026: a
 * Shopify store always installs through the App Store).
 *
 * Where it is used — and nowhere else (guarded by
 * components/public/__qa__/public-nav-menus.qa.ts):
 *   - the public Shopify page (lib/i18n/public/pages/solutions.tsx), which the
 *     public menu's Shopify item (components/PublicNav.tsx) leads to;
 *   - the in-app Shopify connect (components/content/ShopifyConnectionPanel.tsx),
 *     whose not-connected state links here instead of asking for a shop domain.
 *
 * The owner gave this URL on 5 October 2026. Every link to it is
 * rel="nofollow": Shopify already links the listing to our site, so we do not
 * pass authority back (owner, same day). null removes every Shopify link.
 */
export const SHOPIFY_APP_STORE_URL: string | null = 'https://apps.shopify.com/go-top-seo'
