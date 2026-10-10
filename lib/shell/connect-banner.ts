/**
 * Where the "your site isn't connected yet" banner shows
 * (components/layout/ConnectSiteBanner.tsx).
 *
 * Connecting the site is the first thing a new project needs: until then
 * nothing can be published. The dashboard's "Start here" card said so, but a
 * screen opened from the sidebar said nothing, and an owner who went to another
 * tab had no way back to it (owner's report of 10 October 2026). So every screen
 * of a project carries the banner while the site is not connected, except:
 *   - the dashboard, which places it itself (above its opening card), and shows
 *     "Start here" instead on a brand-new project, whose next step it already is;
 *   - the settings, where the connection itself leads the screen;
 *   - screens that are not about one project (billing, the partner program, the
 *     project list, a new project and its research summary, the admin's).
 *
 * Pure (lib/shell/__qa__/connect-banner.qa.ts).
 */
const PROJECT_SCREENS = [
  '/keyword-research', '/keywords', '/content', '/site-links', '/maps-posts', '/ai-visibility', '/site-health', '/reports',
] as const

/** Whether the app shell shows the banner on this screen (the site's state decides the rest). */
export function connectBannerOnPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false
  return PROJECT_SCREENS.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

/** Shown only when the site is KNOWN not to be connected: an unread answer (null) shows nothing. */
export function showConnectBanner(siteConnected: boolean | null | undefined): boolean {
  return siteConnected === false
}
