/**
 * "Links Google already found": Search Console's Links report, opened for the
 * project's own property.
 *
 * The Search Console API has no links endpoint. Checked 2026-09-30 against the
 * API's discovery document (searchconsole v1, revision 20260923): its resources
 * are searchanalytics, sites, sitemaps, urlInspection and urlTestingTools, and
 * the older webmasters v3 has the same minus URL inspection. So the app cannot
 * read or count those links, and the screen never pretends it did: it says so in
 * one line and opens the report in Search Console, on the owner's own property.
 *
 * The address is always Google's own host; the property only goes into the
 * query string, encoded. Pure. Guarded by lib/site-links/__qa__/free-listings.qa.ts.
 */
export const SEARCH_CONSOLE_LINKS_REPORT = 'https://search.google.com/search-console/links'

/**
 * The report's address for a stored property ("sc-domain:example.co.il" or
 * "https://www.example.co.il/"), or null when it is not one.
 */
export function searchConsoleLinksUrl(property: unknown): string | null {
  if (typeof property !== 'string') return null
  const p = property.trim()
  if (!p || p.length > 300) return null
  if (/^sc-domain:[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(p)) return `${SEARCH_CONSOLE_LINKS_REPORT}?resource_id=${encodeURIComponent(p)}`
  let u: URL
  try { u = new URL(p) } catch { return null }
  if ((u.protocol !== 'https:' && u.protocol !== 'http:') || !u.hostname.includes('.') || u.username || u.password) return null
  return `${SEARCH_CONSOLE_LINKS_REPORT}?resource_id=${encodeURIComponent(p)}`
}
