/**
 * Stored Shopify publish errors → a key the UI can translate.
 *
 * generated_articles.shopify_last_error keeps a DIAGNOSTIC string for support,
 * e.g. `shopify_billing_no_active_shopify_plan: no_subscription`. It used to be
 * rendered verbatim on the article page and in the embedded Shopify app, so a
 * merchant saw internal codes. The column is unchanged (it stays useful in the
 * database); only what is shown goes through here. Anything unrecognised maps
 * to the generic `exact_failure` — never to the raw text.
 */
export type PublishErrorKey =
  | 'billing_not_entitled' | 'billing_unavailable' | 'token_invalid' | 'exact_failure'
  | string

const BILLING_REASON_KEYS: Record<string, PublishErrorKey> = {
  no_active_shopify_plan: 'billing_not_entitled',
  no_active_website_plan: 'billing_not_entitled',
  paypal_migration_incomplete: 'billing_unavailable',
  billing_authority_unavailable: 'billing_unavailable',
  migration_state_unavailable: 'billing_unavailable',
  billing_verification_unavailable: 'billing_unavailable',
  shop_identity_unverified: 'token_invalid',
}

/** The translatable key for a stored error or an API `reason`. */
export function publishErrorKey(stored: string | null | undefined): PublishErrorKey | null {
  if (!stored) return null
  const code = String(stored).split(':')[0].trim()
  if (code.startsWith('shopify_billing_')) {
    return BILLING_REASON_KEYS[code.slice('shopify_billing_'.length)] ?? 'billing_not_entitled'
  }
  return code || 'exact_failure'
}

/** English copy for the embedded Shopify surface (English-only by contract). */
const EMBEDDED_EN: Record<string, string> = {
  billing_not_entitled: 'Publishing needs an active plan for this store. Choose a plan in the Billing section.',
  billing_unavailable: 'We couldn’t verify the plan just now. This is temporary — try publishing again shortly.',
  token_invalid: 'The store connection needs to be renewed. Reconnect the store and try again.',
  missing_write_content_scope: 'The write_content permission is missing. Authorize publishing to continue.',
  no_shopify_blog: 'No blog found in the store. Create a blog in Shopify or select one.',
  rate_limited: 'Shopify rate limit reached. Try again shortly.',
  remote_article_missing: 'The article was deleted on Shopify. Explicit action is required to recreate it.',
  exact_failure: 'Publishing failed. Try again, and contact us if it repeats.',
}

export function embeddedPublishErrorMessage(stored: string | null | undefined): string | null {
  const key = publishErrorKey(stored)
  if (!key) return null
  return EMBEDDED_EN[key] ?? EMBEDDED_EN.exact_failure
}
