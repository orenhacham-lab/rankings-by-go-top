/**
 * Stage E1 — Google Search Console read-only: server-authoritative feature flag
 * and OAuth/config env validation. Server-only (never import into a client bundle).
 *
 * Convention mirrors lib/content/api-auth.ts: a private (non-NEXT_PUBLIC) env flag
 * read `=== 'true'`, default OFF; the UI show/hide uses a NEXT_PUBLIC mirror but a
 * route ALWAYS re-checks the authoritative flag and fails closed when it is off.
 */

/** GSC read-only scope — the ONLY scope requested. Never the writable webmasters scope. */
export const GSC_READONLY_SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly'

/** Server-authoritative flag. Default false when missing. */
export function isGscReadOnlyEnabled(): boolean {
  return process.env.GSC_READ_ONLY_ENABLED === 'true'
}

export interface GscOAuthConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
}

export class GscConfigError extends Error {
  constructor(message: string) { super(message); this.name = 'GscConfigError' }
}

/**
 * Validate + return the OAuth config from server env. The redirect URI MUST come
 * from a server env var (never derived from the request origin). Throws when any
 * value is missing — callers fail closed rather than proceeding.
 */
export function getGscOAuthConfig(): GscOAuthConfig {
  const clientId = process.env.GOOGLE_GSC_CLIENT_ID?.trim()
  const clientSecret = process.env.GOOGLE_GSC_CLIENT_SECRET?.trim()
  const redirectUri = process.env.GOOGLE_GSC_REDIRECT_URI?.trim()
  if (!clientId) throw new GscConfigError('GOOGLE_GSC_CLIENT_ID is not set.')
  if (!clientSecret) throw new GscConfigError('GOOGLE_GSC_CLIENT_SECRET is not set.')
  if (!redirectUri) throw new GscConfigError('GOOGLE_GSC_REDIRECT_URI is not set.')
  return { clientId, clientSecret, redirectUri }
}

/** True when OAuth config is fully present (used to render a "not configured" UI state). */
export function isGscOAuthConfigured(): boolean {
  try { getGscOAuthConfig(); return true } catch { return false }
}

/** Max rows fetched per window before we mark the run truncated. Conservative default. */
export function getGscMaxRowsPerWindow(): number {
  const raw = Number(process.env.GSC_MAX_ROWS_PER_WINDOW)
  if (Number.isFinite(raw) && raw > 0) return Math.floor(raw)
  return 50_000
}

/** Google Search Console API request page size (API hard max is 25,000). */
export const GSC_API_PAGE_SIZE = 25_000
