/**
 * The WordPress site icon for the author box, when the owner chose "the site
 * icon": the `site_icon_url` the site's REST index (/wp-json) gives, else the
 * `site_icon` media item's `source_url`. Read at publish time (and by the
 * settings preview), through the free check's guarded fetcher (normalizeCheckUrl
 * + fetchSiteText: public hosts only, every redirect re-admitted, size and time
 * capped). Only WordPress: a Shopify store's logo is not readable with the
 * scopes the app holds (read_products, read_content, write_content), so the
 * choice is not offered there, and a custom site or Wix has no known icon.
 *
 * The address must pass normalizeAuthorBoxImage (box.ts): https, on the site's
 * own host or WordPress' CDN. Anything else, or any failure: null, and the box
 * has no image. Never throws.
 */
import { normalizeCheckUrl } from '@/lib/free-check/url-guard'
import { fetchSiteText } from '@/lib/free-check/site-fetch'
import { normalizeAuthorBoxImage } from './box'

export type FetchText = typeof fetchSiteText

const siteHost = (d: unknown) => String(d ?? '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/[/?#].*$/, '').replace(/\.$/, '')

async function readJson(url: string, fetchText: FetchText): Promise<Record<string, unknown> | null> {
  try {
    const u = normalizeCheckUrl(url)
    if (!u.ok) return null
    const res = await fetchText(u.url)
    if (!res.ok || res.status !== 200) return null
    const value: unknown = JSON.parse(res.text)
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null
  } catch {
    return null
  }
}

/** The site icon's checked https address, or null when the site has none (or it is not on the site or its CDN). */
export async function readWordPressSiteIcon(domain: string | null, fetchText: FetchText = fetchSiteText): Promise<string | null> {
  const site = siteHost(domain)
  if (!site) return null
  const index = await readJson(`https://${site}/wp-json/?_fields=site_icon_url,site_icon`, fetchText)
  if (!index) return null
  const direct = normalizeAuthorBoxImage(index.site_icon_url, site)
  if (direct) return direct
  const id = index.site_icon
  if (typeof id !== 'number' || !Number.isInteger(id) || id <= 0) return null
  const media = await readJson(`https://${site}/wp-json/wp/v2/media/${id}?_fields=source_url`, fetchText)
  return media ? normalizeAuthorBoxImage(media.source_url, site) : null
}
