/**
 * The Go Top SEO listing in the Shopify App Store. Every "Shopify" link on the
 * public site, and the in-app Shopify connect, sends merchants here (owner,
 * 5 October 2026: a Shopify store always installs through the App Store).
 *
 * The owner gave this URL on 5 October 2026. Every link to it is
 * rel="nofollow": Shopify already links the listing to our site, so we do not
 * pass authority back (owner, same day). null would remove every Shopify link.
 */
export const SHOPIFY_APP_STORE_URL: string | null = 'https://apps.shopify.com/go-top-seo'
