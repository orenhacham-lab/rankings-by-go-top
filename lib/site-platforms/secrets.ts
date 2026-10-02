/**
 * Secrets of the Wix and webhook connections. Server-side only.
 *
 * Stored with the same AES-256-GCM helper WordPress Application Passwords use
 * (lib/security/credentials-crypto.ts). A secret is decrypted only at the moment
 * of use and is never logged, returned, or stored in plaintext. The screen gets
 * `maskSecret`'s output, which keeps at most the last four characters.
 */
import crypto from 'crypto'

/** "••••a1b2" — the last four characters of a secret, never more; short secrets show none. */
export function maskSecret(secret: string, prefix = ''): string {
  const s = String(secret ?? '')
  const tail = s.length >= 16 ? s.slice(-4) : ''
  return `${prefix}••••${tail}`.slice(0, 24)
}

/**
 * A new webhook signing secret: 32 random bytes, base64url, with a recognisable
 * prefix so a developer can tell it apart from other keys in their config.
 * Generated on the server, shown to the owner ONCE (in the save response), and
 * from then on only as its mask.
 */
export function generateWebhookSecret(random: (n: number) => Buffer = crypto.randomBytes): string {
  return `whsec_${random(32).toString('base64url')}`
}

/** A Wix site id is a UUID. */
export function isWixSiteId(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
}

/**
 * A Wix API key as the dashboard issues it: a long token of URL-safe and dot
 * characters (it currently starts "IST."). We check shape only — Wix decides
 * whether it is valid — so a merchant who pastes a site id or a URL into the key
 * field hears so before any request leaves.
 */
export function looksLikeWixApiKey(v: string): boolean {
  return v.length >= 20 && v.length <= 4096 && /^[A-Za-z0-9._\-]+$/.test(v)
}
