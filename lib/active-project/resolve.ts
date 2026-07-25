/**
 * Area D — pure resolution core for the GLOBAL active project.
 *
 * No React, no DOM, no I/O — every decision the ActiveProjectProvider makes is a
 * pure function here so the precedence, validation, cross-user isolation and
 * legacy-param reconciliation are unit-testable in isolation.
 */

export interface ActiveProjectLite {
  id: string
  name?: string | null
  /** Used only for the documented deterministic fallback (most-recently-updated). */
  updated_at?: string | null
}

/** User-namespaced storage key — prevents cross-user leakage on a shared browser. */
export const ACTIVE_PROJECT_KEY_PREFIX = 'active-project:'
export function activeProjectStorageKey(userId: string): string {
  return `${ACTIVE_PROJECT_KEY_PREFIX}${userId}`
}

export type ResolveSource = 'url' | 'persisted' | 'only' | 'fallback' | 'none'
export interface ResolveResult { id: string | null; source: ResolveSource }

/** True iff `id` is one of the user's OWNED + ACTIVE projects (the authoritative list). */
export function isValidActiveId(id: string | null | undefined, projects: ActiveProjectLite[]): id is string {
  return !!id && projects.some((p) => p.id === id)
}

/** The documented deterministic fallback: most-recently-updated, id-tiebroken. */
export function mostRecentlyUpdated(projects: ActiveProjectLite[]): ActiveProjectLite | null {
  if (projects.length === 0) return null
  return [...projects].sort((a, b) => {
    const ta = a.updated_at ? Date.parse(a.updated_at) : 0
    const tb = b.updated_at ? Date.parse(b.updated_at) : 0
    if (tb !== ta) return tb - ta
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })[0]
}

/**
 * Precedence (highest → lowest):
 *   1. a VALID explicit projectId from the URL / deep-link,
 *   2. the VALIDATED persisted last-active project,
 *   3. the only accessible active project (when exactly one exists),
 *   4. the most-recently-updated project (deterministic fallback) when several
 *      exist and none is saved,
 *   5. none.
 * An invalid url/persisted id (deleted / inactive / unowned) is skipped, never trusted.
 */
export function resolveActiveProject(input: {
  urlId?: string | null
  persistedId?: string | null
  projects: ActiveProjectLite[]
}): ResolveResult {
  const { urlId, persistedId, projects } = input
  if (isValidActiveId(urlId, projects)) return { id: urlId, source: 'url' }
  if (isValidActiveId(persistedId, projects)) return { id: persistedId, source: 'persisted' }
  if (projects.length === 1) return { id: projects[0].id, source: 'only' }
  if (projects.length > 1) return { id: mostRecentlyUpdated(projects)!.id, source: 'fallback' }
  return { id: null, source: 'none' }
}

/**
 * Canonical deep-link param is `projectId`. `project_id` is read as a LEGACY
 * fallback so old links keep working, but it is never written back — the provider
 * standardizes on `projectId`. `fromLegacy` tells the caller a URL rewrite is due.
 */
export function readUrlProjectId(params: {
  get(name: string): string | null
}): { id: string | null; fromLegacy: boolean } {
  const canonical = params.get('projectId')
  if (canonical) return { id: canonical, fromLegacy: false }
  const legacy = params.get('project_id')
  if (legacy) return { id: legacy, fromLegacy: true }
  return { id: null, fromLegacy: false }
}

/**
 * Cross-tab: given a window `storage` event, return whether it targets THIS user's
 * active-project key (events for other users' keys are ignored — no leakage) and,
 * if so, the new active id it carries.
 */
export function activeIdFromStorageEvent(
  evt: { key: string | null; newValue: string | null },
  userId: string,
): { relevant: boolean; value: string | null } {
  if (evt.key !== activeProjectStorageKey(userId)) return { relevant: false, value: null }
  return { relevant: true, value: evt.newValue }
}
