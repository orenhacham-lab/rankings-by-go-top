/**
 * An address as a merchant reads it in a table: no "https://", no "www.", no
 * trailing slash, and percent-encoded Hebrew decoded back into letters.
 * "https://www.plumber-tlv.co.il/services/" → "plumber-tlv.co.il/services".
 *
 * Display only: the link itself keeps the full address (href and title).
 */
export function displayUrl(url: string | null | undefined): string {
  if (!url) return ''
  let s = url.trim().replace(/^[a-z][a-z0-9+.-]*:\/\//i, '').replace(/^www\./i, '')
  if (s.length > 1) s = s.replace(/\/+$/, '')
  try {
    s = decodeURI(s)
  } catch {
    // A malformed escape stays as it came.
  }
  return s
}
