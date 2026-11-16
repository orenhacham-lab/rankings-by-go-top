/**
 * THE SPELLING OF THE MONTHLY-REPORTS READ PATH, in a module with no
 * 'use client'. Same reason as lib/seed-scan/urls.ts.
 *
 * The month is optional and the screen's first read omits it, which is the one
 * the dashboard layout can build: a month the visitor has not chosen yet is not
 * something the server can guess.
 */
export function monthlyReportsUrl(projectId: string, month?: string | null): string {
  const q = new URLSearchParams({ projectId })
  if (month) q.set('month', month)
  return `/api/reports/monthly?${q.toString()}`
}
