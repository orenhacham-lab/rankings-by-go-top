/**
 * The project's home page, for the brand-colour and official-profile reader
 * (readSiteSignals). The stored domain goes through the same URL admission as
 * every other outbound read (normalizeCheckUrl: no credentials, no port, no IP
 * literal, no internal host) BEFORE the first request, the way
 * lib/site-health/api.ts liveReader does; fetchSiteHtml then checks that the
 * host resolves to public addresses and re-admits every redirect hop. A refused address is
 * null, which the caller answers with its fixed code (site_unreachable).
 * Guarded by lib/content/article-style/__qa__/article-style.qa.ts.
 */
import { normalizeCheckUrl } from '@/lib/free-check/url-guard'
import { fetchSiteHtml } from '@/lib/free-check/site-fetch'

export async function fetchHomeHtml(domain: string, fetchHtml: typeof fetchSiteHtml = fetchSiteHtml): Promise<string | null> {
  const u = normalizeCheckUrl(domain)
  if (!u.ok) return null
  const page = await fetchHtml(u.url)
  return page.ok ? page.html : null
}
