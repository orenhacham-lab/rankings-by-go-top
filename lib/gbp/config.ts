/**
 * Google Business Profile ("posts on Google Maps"): the server-authoritative
 * feature flag and the OAuth configuration. Server-only.
 *
 * OFF everywhere by default. Two flags, the same convention as lib/gsc/config.ts:
 *   GBP_POSTS_ENABLED             (server) every /api/gbp/* route and the page
 *                                 answer 404 unless it is exactly 'true'.
 *   NEXT_PUBLIC_GBP_POSTS_ENABLED (build) only shows the sidebar entry; a route
 *                                 never trusts it.
 *
 * One Google Cloud project, one OAuth client, two SEPARATE consents: Search
 * Console asks only for webmasters.readonly (lib/gsc/config.ts), and this flow
 * asks only for business.manage, incrementally, so a merchant who never posts
 * to Maps never grants write access to their business listing. The client id
 * and secret default to the Search Console ones; GOOGLE_GBP_CLIENT_ID/SECRET
 * override them if the owner ever splits the projects. The redirect URI is its
 * own server env var and is never derived from the request.
 */

/** The only scope this flow requests. */
export const GBP_SCOPE = 'https://www.googleapis.com/auth/business.manage'

export function isGbpPostsEnabled(): boolean {
  return process.env.GBP_POSTS_ENABLED === 'true'
}

export interface GbpOAuthConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
}

export class GbpConfigError extends Error {
  constructor(message: string) { super(message); this.name = 'GbpConfigError' }
}

export function getGbpOAuthConfig(): GbpOAuthConfig {
  const clientId = (process.env.GOOGLE_GBP_CLIENT_ID || process.env.GOOGLE_GSC_CLIENT_ID)?.trim()
  const clientSecret = (process.env.GOOGLE_GBP_CLIENT_SECRET || process.env.GOOGLE_GSC_CLIENT_SECRET)?.trim()
  const redirectUri = process.env.GOOGLE_GBP_REDIRECT_URI?.trim()
  if (!clientId) throw new GbpConfigError('Google OAuth client id is not set.')
  if (!clientSecret) throw new GbpConfigError('Google OAuth client secret is not set.')
  if (!redirectUri || !/^https:\/\/|^http:\/\/localhost[:/]/.test(redirectUri)) throw new GbpConfigError('GOOGLE_GBP_REDIRECT_URI is not set.')
  return { clientId, clientSecret, redirectUri }
}

export function isGbpOAuthConfigured(): boolean {
  try { getGbpOAuthConfig(); return true } catch { return false }
}

