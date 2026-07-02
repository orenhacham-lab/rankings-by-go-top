/**
 * WordPress REST API types for the content module.
 * Only the fields the app actually consumes are typed.
 */

export interface WordPressCredentials {
  /** Site base URL, https only (e.g. https://example.com). */
  siteUrl: string
  /** WordPress username the Application Password belongs to. */
  username: string
  /** Application Password (plaintext, decrypted server-side at call time). */
  applicationPassword: string
}

export interface WordPressUser {
  id: number
  name: string
  slug: string
}

export interface WordPressCategory {
  id: number
  name: string
  slug: string
  parent: number
  count: number
}

export interface WordPressTag {
  id: number
  name: string
  slug: string
  count: number
}

export interface WordPressTestResult {
  ok: boolean
  /** Authenticated user (present when ok). */
  user?: WordPressUser
  /** Human-readable failure reason (present when not ok). Never contains credentials. */
  error?: string
}
