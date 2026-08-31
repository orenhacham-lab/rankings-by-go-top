/**
 * Shopify connection health — the ONE shared decision about whether a live
 * `shopify_connections` row still holds a usable Admin API credential, or must
 * be re-authorised through a fresh Shopify-managed install.
 *
 * PRODUCTION DEAD-END THIS EXISTS TO END
 * --------------------------------------
 * /api/shopify/app-home used to detect the reinstall case with one exact
 * string comparison:
 *
 *     connection_status === 'failed' && last_error === 'app_uninstalled'
 *
 * `last_error` is a free-text column with several writers, and one of them —
 * POST /api/shopify/test-connection — persisted the CLIENT'S ENGLISH SENTENCE
 * ("Authentication failed. Check the Admin API access token.") over the marker.
 * One connection test against a revoked token therefore erased the only signal
 * app-home recognised: the shop stopped being offered a reconnect, rendered
 * "Needs attention" forever, and /api/shopify/embedded-install could never be
 * reached again. The store had no way back, and the deployed token-exchange
 * diagnostics could never run.
 *
 * The fix has three parts, all of them here:
 *   1. `normalizeConnectionErrorCode` maps whatever is stored — a stable code,
 *      a code-prefixed message, or legacy prose from before this module — onto
 *      a small closed set of MACHINE codes. Detection never depends on one
 *      exact English sentence.
 *   2. `classifyReinstallNeed` decides reinstall from those codes, and stays
 *      NARROW: only a conclusively dead credential qualifies. A generic
 *      failure, a scope gap, or a permission refusal is a connection with a
 *      problem the merchant can retry — never a forced reinstall.
 *   3. `nextConnectionLastError` is how writers record a test result: a stable
 *      code first, the human detail after it, and the uninstall marker is
 *      never overwritten by a failing test.
 *
 * PURE — no I/O, no Supabase, no secrets. Nothing here ever receives or
 * returns a token, a session token, or ciphertext.
 */

/** The uninstall tombstone marker written by lib/shopify/shop-cleanup.ts. */
export const SHOPIFY_UNINSTALL_CODE = 'app_uninstalled'

/**
 * The closed set of stable machine codes `shopify_connections.last_error` may
 * carry. Everything except `app_uninstalled` mirrors a ShopifyConnectionStatus
 * or a ShopifyErrorKind, so a writer never has to invent one.
 */
export const SHOPIFY_CONNECTION_ERROR_CODES = [
  'app_uninstalled',
  'invalid_token',
  'refresh_token_invalid',
  'permission_error',
  'missing_scopes',
  'api_version_fallback',
  'rate_limited',
  'network',
  'api_error',
  'shop_identity_unverified',
] as const
export type ShopifyConnectionErrorCode = (typeof SHOPIFY_CONNECTION_ERROR_CODES)[number]

const KNOWN_CODES = new Set<string>(SHOPIFY_CONNECTION_ERROR_CODES)

/**
 * Compatibility ONLY, for rows written before codes were persisted (including
 * the row that produced the production dead-end). Ordered most-specific first
 * so a scope/permission message can never be read as a dead credential — the
 * distinction requirement 4 depends on. A message matching nothing here stays
 * unclassified (`null`), which is deliberately NOT a reinstall.
 */
const LEGACY_MESSAGE_CODES: ReadonlyArray<readonly [RegExp, ShopifyConnectionErrorCode]> = [
  [/^missing required scopes/i, 'missing_scopes'],
  [/granted scopes/i, 'permission_error'],
  [/^shopify served api version/i, 'api_version_fallback'],
  [/rate limit/i, 'rate_limited'],
  [/could not reach the shopify store/i, 'network'],
  [/^authentication failed/i, 'invalid_token'],
  [/check the admin api access token/i, 'invalid_token'],
  [/^shopify (returned http|server error)/i, 'api_error'],
]

/** Longest human detail kept alongside the code. Detail is never a secret. */
const MAX_DETAIL_CHARS = 300

/**
 * Persisted form of a test outcome: `"<code>"`, or `"<code>: <detail>"` when
 * there is a human-readable detail worth showing in the dashboard. The code
 * comes first so `normalizeConnectionErrorCode` can recover it exactly,
 * whatever language the detail is in.
 */
export function formatConnectionError(code: string, detail?: string | null): string {
  const c = String(code || 'api_error').trim()
  const d = typeof detail === 'string' ? detail.trim() : ''
  if (!d || d === c) return c
  return `${c}: ${d}`.slice(0, MAX_DETAIL_CHARS + c.length + 2)
}

/**
 * Recover the stable machine code from a stored `last_error`, or null when the
 * value carries no recognised code. Accepts the three shapes that exist in
 * production: a bare code, `"<code>: <detail>"`, and legacy prose.
 */
export function normalizeConnectionErrorCode(value: string | null | undefined): ShopifyConnectionErrorCode | null {
  const raw = typeof value === 'string' ? value.trim() : ''
  if (!raw) return null
  const head = raw.split(':')[0].trim().toLowerCase()
  if (KNOWN_CODES.has(head)) return head as ShopifyConnectionErrorCode
  for (const [pattern, code] of LEGACY_MESSAGE_CODES) {
    if (pattern.test(raw)) return code
  }
  return null
}

/** Why a live connection cannot be used until it is re-authorised. */
export type ShopifyReinstallReason = 'app_uninstalled' | 'credential_revoked'

/**
 * The reinstall decision, shared by /api/shopify/app-home and its tests.
 *
 * Reinstall is demanded for exactly two conclusive states:
 *   * `app_uninstalled` — the merchant removed the app; the stored token was
 *     replaced by the revocation sentinel. Always retryable: this stays true
 *     however many reconnect attempts fail, because nothing on the failure
 *     path rewrites the marker.
 *   * `invalid_token` — Shopify answered the Admin API with 401/403, i.e. the
 *     credential itself is not accepted. Re-testing cannot repair that; only a
 *     new token exchange can.
 *
 * Everything else — `permission_error`, `missing_scopes`, transport failures,
 * an unrecognised message, `untested`, or any non-failed status — is a
 * connection with a PROBLEM, not a connection that must be reinstalled.
 */
export function classifyReinstallNeed(
  row: { connection_status?: string | null; last_error?: string | null } | null | undefined,
): { needsInstall: boolean; reason: ShopifyReinstallReason | null; errorCode: ShopifyConnectionErrorCode | null } {
  if (!row) return { needsInstall: false, reason: null, errorCode: null }
  const errorCode = normalizeConnectionErrorCode(row.last_error)
  if (row.connection_status !== 'failed') return { needsInstall: false, reason: null, errorCode }
  if (errorCode === 'app_uninstalled') return { needsInstall: true, reason: 'app_uninstalled', errorCode }
  // A terminal refresh failure is the same class of fact as a rejected access
  // token: Shopify will not accept the credential this connection holds, and no
  // amount of retrying changes that. It is written by
  // fail_shopify_token_refresh (never by a transient failure), so it cannot
  // manufacture a reconnect out of a network blip.
  if (errorCode === 'invalid_token' || errorCode === 'refresh_token_invalid') {
    return { needsInstall: true, reason: 'credential_revoked', errorCode }
  }
  return { needsInstall: false, reason: null, errorCode }
}

/**
 * What a connection test must write into `last_error`.
 *
 * The uninstall marker is PRESERVED whenever the test did not succeed: an
 * uninstalled store's stored credential is the revocation sentinel, so the
 * test necessarily fails with `invalid_token` — overwriting the marker with
 * that generic code is exactly what broke production, and it also loses the
 * one state `claim_shopify_shop_ownership` needs to supersede a shop held by
 * another project. A test that SUCCEEDS is proof the app is installed again,
 * so the marker is cleared like any other stale error.
 */
export function nextConnectionLastError(args: {
  priorLastError: string | null | undefined
  ok: boolean
  status: string
  message?: string | null
}): string | null {
  if (args.ok && args.status === 'connection_ok') return null
  if (!args.ok && normalizeConnectionErrorCode(args.priorLastError) === SHOPIFY_UNINSTALL_CODE) {
    return SHOPIFY_UNINSTALL_CODE
  }
  return formatConnectionError(args.status, args.message)
}
