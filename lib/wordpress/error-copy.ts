/**
 * The WordPress routes answer a failed test or save with a short English
 * sentence of our own (lib/wordpress/client.ts, app/api/wordpress/*). The
 * connection panel used to print that sentence as it came, so a Hebrew screen
 * read "Site hostname could not be resolved." This maps each sentence the
 * routes can send to a key of the panel's dictionary (wpErrors), in the
 * merchant's language; anything else, including any text we did not write, is
 * the generic "something went wrong" and is never shown as it came.
 *
 * The routes are unchanged: this only decides which of our sentences to show.
 */
export type WpErrorKey =
  | 'authFailed'
  | 'notWordPress'
  | 'siteError'
  | 'invalidUrl'
  | 'notHttps'
  | 'notPublic'
  | 'unreachable'
  | 'timeout'
  | 'redirect'
  | 'badResponse'
  | 'missingFields'
  | 'missingPassword'
  | 'otherSite'
  | 'reenterPassword'
  | 'generic'

const EXACT: Record<string, WpErrorKey> = {
  'Authentication failed. Check the username and Application Password.': 'authFailed',
  'WordPress REST API not found at this URL. Is this a WordPress site?': 'notWordPress',
  'Invalid site URL.': 'invalidUrl',
  'Invalid site URL': 'invalidUrl',
  'Site URL must use https://': 'notHttps',
  'Custom ports are not allowed.': 'invalidUrl',
  'Site URL must not contain credentials.': 'invalidUrl',
  'Local or internal hostnames are not allowed.': 'notPublic',
  'IP addresses are not allowed — use the site domain.': 'notPublic',
  'Site hostname resolves to a private network address.': 'notPublic',
  'Site hostname could not be resolved.': 'unreachable',
  'Could not reach the WordPress site. Check the URL.': 'unreachable',
  'WordPress site did not respond in time.': 'timeout',
  'Unexpected redirect from the site.': 'redirect',
  'WordPress response was too large.': 'badResponse',
  'WordPress returned an invalid response.': 'badResponse',
  'siteUrl and username are required': 'missingFields',
  'applicationPassword is required': 'missingPassword',
  'Enter the application password to test a different site address.': 'otherSite',
  'Stored WordPress credentials could not be decrypted. Re-enter the Application Password.': 'reenterPassword',
}

export function wpErrorKey(message: unknown): WpErrorKey {
  if (typeof message !== 'string') return 'generic'
  const text = message.trim()
  if (EXACT[text]) return EXACT[text]
  if (/^WordPress returned an error \(HTTP \d{3}\)\.$/.test(text)) return 'siteError'
  return 'generic'
}
