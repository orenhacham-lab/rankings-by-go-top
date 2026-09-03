/**
 * ONE client-side localizer for a Shopify publishing failure code.
 *
 * The same failure reaches the browser in three different shapes, and each one
 * used to be handled (or not handled) separately:
 *
 *   bare        `missing_default_blog`   — the direct publish route's JSON `reason`
 *   prefixed    `shopify_missing_default_blog` — what the automation queue persists
 *                                          into article_pool_items.last_error
 *   with detail `shopify_graphql_user_error: Blog does not exist`
 *                                        — the prefixed form plus a provider detail
 *
 * Callers that only matched a short hand-written list of bare codes fell back to
 * a generic "the Shopify action failed", which is exactly how a merchant ended
 * up with no idea that the real problem was an unchosen blog. This normalizes
 * all three shapes against the SAME dictionary (contentHub.genErrors, which
 * carries both the bare and `shopify_`-prefixed keys) and returns a localized
 * sentence, never a raw code.
 *
 * PURE — no React, no fetch, no dictionary import: the caller passes the
 * already-resolved dictionary so this stays testable without a language context.
 */

export interface ShopifyPublishErrorDict {
  /** contentHub.genErrors — bare and `shopify_`-prefixed keys. */
  codes: Record<string, string>
  /** The last-resort sentence when the code is genuinely unknown. */
  fallback: string
}

/** Split `code: detail` into its parts. The detail is optional and may itself contain ':'. */
function splitDetail(raw: string): { code: string; detail: string } {
  const idx = raw.indexOf(':')
  if (idx < 0) return { code: raw.trim(), detail: '' }
  return { code: raw.slice(0, idx).trim(), detail: raw.slice(idx + 1).trim() }
}

/**
 * Localize one failure code. Tries the value as given, then with the
 * `shopify_` prefix added, then with it removed — so a dictionary that lists
 * only one of the two forms still resolves the other.
 */
export function localizeShopifyPublishError(raw: unknown, dict: ShopifyPublishErrorDict): string {
  const value = typeof raw === 'string' ? raw.trim() : ''
  if (!value) return dict.fallback

  const { code, detail } = splitDetail(value)
  if (!code) return dict.fallback

  const candidates = [code]
  if (code.startsWith('shopify_')) candidates.push(code.slice('shopify_'.length))
  else candidates.push(`shopify_${code}`)

  for (const key of candidates) {
    const message = dict.codes[key]
    // A localized sentence WINS over the raw detail: the detail is a provider
    // string in English and is only ever an addition, never the message itself.
    if (message) return detail ? `${message} (${detail})` : message
  }
  return dict.fallback
}
