/**
 * THE SPELLING OF THE COMPETITORS READ PATH, in a module with no 'use client'.
 * Same reason as lib/seed-scan/urls.ts.
 */
export function competitorsUrl(projectId: string): string {
  return `/api/projects/${encodeURIComponent(projectId)}/ai-visibility/competitors`
}
