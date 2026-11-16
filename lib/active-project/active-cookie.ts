/**
 * WHICH PROJECT THE VISITOR IS LOOKING AT, IN A FORM THE SERVER CAN READ.
 *
 * The active project is resolved on the CLIENT (lib/active-project/resolve.ts):
 * a valid `projectId` in the URL wins, then the id saved in localStorage, then
 * the most-recently-updated project. localStorage is unreachable from a server
 * render, so a layout that wants to prepare anything for the project on screen
 * has nothing to go on — and preparing it for the WRONG project is worth
 * exactly nothing. Measured on 16.11.2026: the dashboard layout seeded the
 * Search Console status for `projects[0]`, the browser was showing another
 * project, and the widget asked the route anyway.
 *
 * So the provider mirrors the saved id into this cookie whenever it changes.
 * localStorage stays the client's authority — the cookie is a copy for the
 * server, nothing reads it on the client.
 *
 * IT IS NEVER TRUSTED. `activeProjectFromCookie` returns an id only when it is
 * one of the projects in the list it is given, and that list is always the
 * caller's OWN owner-filtered projects. A hand-edited cookie, or one left by
 * another user of the same browser, names a project that is not in the list and
 * is dropped — the worst it can do is make a seed miss, which is where we
 * started. It is a presentation hint, NEVER a permission.
 */
import { isValidActiveId, mostRecentlyUpdated, type ActiveProjectLite } from './resolve'

/** Not user-namespaced like the storage key: the value is validated against the
 *  reader's own project list, which is what keeps users apart. */
export const ACTIVE_PROJECT_COOKIE = 'gt-active-project'

/** A year, like the localStorage copy it mirrors: it is only ever a hint. */
export const ACTIVE_PROJECT_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

/**
 * The project a server render should prepare for: the cookie's, when the user
 * still owns it, else the same deterministic fallback the client would land on
 * with nothing saved. Returns null when the user has no projects.
 *
 * The URL's `projectId` is deliberately NOT considered — a layout cannot read
 * search params — so a deep link to another project simply misses the seed and
 * asks as it always did.
 */
export function activeProjectFromCookie(
  cookieValue: string | null | undefined,
  projects: ActiveProjectLite[],
): string | null {
  if (isValidActiveId(cookieValue, projects)) return cookieValue
  return mostRecentlyUpdated(projects)?.id ?? null
}

/** The `document.cookie` assignment the provider writes; `null` expires it. */
export function activeProjectCookieWrite(id: string | null): string {
  const base = `${ACTIVE_PROJECT_COOKIE}=`
  if (!id) return `${base}; path=/; max-age=0; samesite=lax`
  return `${base}${encodeURIComponent(id)}; path=/; max-age=${ACTIVE_PROJECT_COOKIE_MAX_AGE}; samesite=lax`
}
