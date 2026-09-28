/**
 * Where the old Scans tab lives now: the check-history section of Keywords,
 * opened. /scans and /scans/<id> redirect here on the server, so a bookmark or an
 * old link lands on the same history instead of a 404. A run's details page
 * (/scans/<id>/details) stays; the history links to it.
 *
 * The project a link named is kept only when it is a plain id; anything else is
 * dropped, and the destination is always this app's own path.
 */
export const SCAN_HISTORY_PATH = '/keywords'

const PROJECT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function scanHistoryHref(projectId?: string | string[] | null): string {
  const id = Array.isArray(projectId) ? projectId[0] : projectId
  const params = new URLSearchParams({ history: '1' })
  if (id && PROJECT_ID.test(id)) params.set('projectId', id)
  return `${SCAN_HISTORY_PATH}?${params.toString()}`
}
