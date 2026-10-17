/**
 * THE SITE'S ICON AT THE TOP OF A PDF REPORT.
 *
 * The icon is the one the site scan already stored (`summary.siteIcon` on the
 * project's seed runs, lib/seed-scan/site-icon.ts): the icon the home page
 * declares, often the brand mark. It is NOT a logo file, so it is shown small,
 * next to the project name, and a report without one looks exactly as before.
 *
 * Nothing here fetches the icon. The address is checked again with
 * safeSiteIcon (https only, on the project's own site or its platform's CDN)
 * and handed to the HTML as an <img>; the PDF renderer loads it, with no
 * referrer. A failed read or an icon that no longer passes is simply no icon.
 *
 * The client is the service-role one, which bypasses RLS: the caller has
 * already proved the project is the requester's, and the read is by that id.
 */
import { safeSiteIcon } from '@/lib/site-icon'

interface IconReader {
  from: (table: string) => any // eslint-disable-line @typescript-eslint/no-explicit-any
}

export async function reportSiteIcon(admin: IconReader, projectId: string, domain: string | null): Promise<string | null> {
  try {
    const { data, error } = await admin
      .from('project_seed_runs')
      .select('site_icon:summary->>siteIcon, created_at')
      .eq('project_id', projectId)
      .not('summary->>siteIcon', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
    if (error || !Array.isArray(data) || data.length === 0) return null
    return safeSiteIcon((data[0] as { site_icon?: unknown }).site_icon, domain)
  } catch {
    return null
  }
}

/** The <img> for a report header, or '' when there is no icon. The caller escapes nothing: this does. */
export function reportSiteIconImg(icon: string | null | undefined, esc: (s: string) => string): string {
  if (!icon) return ''
  return `<img class="site-icon" src="${esc(icon)}" alt="" width="28" height="28" referrerpolicy="no-referrer">`
}

export const REPORT_SITE_ICON_CSS =
  '.site-icon { width: 28px; height: 28px; object-fit: contain; vertical-align: middle; margin-inline-end: 8px; border-radius: 6px; }'
