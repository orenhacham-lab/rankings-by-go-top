/**
 * The spelling of the dashboard's own read path, in a module with no 'use
 * client' on it.
 *
 * The screen's reader (components/dashboard/useDashboardData.ts) is a client
 * module, so every export of it is a client reference a server component cannot
 * call. The dashboard's own layout builds this answer in-region and hands it to
 * the screen keyed by the URL it would have fetched, so both sides have to spell
 * that URL the same way: a seeded answer under a different URL is an answer
 * nobody reads.
 */
export function dashboardOverviewUrl(projectId: string): string {
  return `/api/projects/${encodeURIComponent(projectId)}/dashboard`
}
