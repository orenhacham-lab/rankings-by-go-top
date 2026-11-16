/**
 * THE SPELLING OF THE "WAITING FOR YOU" READ PATH, in a module with no
 * 'use client'. Same reason as lib/seed-scan/urls.ts: the dashboard layout, a
 * server component, builds this answer and hands it over keyed by the URL the
 * client reader would have fetched, so one module owns the spelling.
 */
export function waitingUrl(projectId: string): string {
  return `/api/projects/${encodeURIComponent(projectId)}/waiting`
}
