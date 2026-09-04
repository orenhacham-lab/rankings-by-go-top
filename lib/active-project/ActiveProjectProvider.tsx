'use client'

/**
 * Area D — the SINGLE global active-project source of truth. One instance is
 * mounted in the dashboard layout; every section reads it via useActiveProject().
 * Do NOT create competing contexts.
 *
 * Behavior (see lib/active-project/resolve.ts for the pure rules):
 *  - persistence under the user-namespaced key active-project:{userId},
 *  - precedence URL projectId > validated persisted > only-active > most-recently-
 *    updated fallback,
 *  - the URL `projectId` is the deep-link source of truth: it wins AND updates
 *    persistence; changes sync to the URL via router.replace (no history spam);
 *    the legacy `project_id` param is read once then rewritten to `projectId`,
 *  - cross-tab convergence via the window `storage` event (other users' keys are
 *    ignored; echoes are guarded),
 *  - continuous re-validation against the owned+active list (a deleted/inactive/
 *    unowned id is dropped and re-resolved).
 *
 * Authorization is NEVER derived from this client state — every server route keeps
 * its own ownership check; the active projectId is a UI convenience only.
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import {
  activeProjectStorageKey, resolveActiveProject, isValidActiveId, readUrlProjectId,
  activeIdFromStorageEvent, type ActiveProjectLite,
} from './resolve'

interface ActiveProjectContextValue {
  activeProjectId: string | null
  /** The AUTHORITATIVE owned+active list. `setActiveProject` accepts only these. */
  projects: ActiveProjectLite[]
  isResolved: boolean
  /**
   * The accessible-project list could NOT be loaded. Distinct from "this account
   * has no projects": a consumer must not render an empty state, or an
   * unselectable dropdown, for what is actually a failed request.
   */
  projectsError: boolean
  /** Retry the accessible-project list after a failure. */
  reloadProjects: () => void
  setActiveProject: (id: string) => void
}

const ActiveProjectContext = createContext<ActiveProjectContextValue | null>(null)

export function ActiveProjectProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [projects, setProjects] = useState<ActiveProjectLite[]>([])
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null)
  const [isResolved, setIsResolved] = useState(false)
  const [projectsError, setProjectsError] = useState(false)

  // Refs mirror latest state for the storage listener (registered once).
  const projectsRef = useRef<ActiveProjectLite[]>([])
  const activeIdRef = useRef<string | null>(null)
  projectsRef.current = projects
  activeIdRef.current = activeProjectId

  const storageKey = activeProjectStorageKey(userId)

  const persist = useCallback((id: string | null) => {
    try {
      if (id) localStorage.setItem(storageKey, id)
      else localStorage.removeItem(storageKey)
    } catch { /* private mode / quota — ignore */ }
  }, [storageKey])

  // Reflect the canonical ?projectId in the URL WITHOUT a history entry, dropping any
  // legacy project_id. No-op when the URL already matches (prevents replace loops).
  const syncUrl = useCallback((id: string) => {
    const next = new URLSearchParams(Array.from(searchParams.entries()))
    if (next.get('projectId') === id && !next.has('project_id')) return
    next.set('projectId', id)
    next.delete('project_id')
    router.replace(`${pathname}?${next.toString()}`, { scroll: false })
  }, [router, pathname, searchParams])

  // ── Load the owned+active list, then resolve the active project. ──
  //
  // A FAILED load is recorded, not swallowed. It used to fall through to an
  // empty list, which is indistinguishable from "this account has no projects"
  // — and because setActiveProject validates against this list, an empty list
  // silently makes EVERY project unselectable everywhere. Consumers can now
  // tell the two apart and offer a retry.
  const loadProjects = useCallback(async (signal?: { cancelled: boolean }) => {
    let list: ActiveProjectLite[] = []
    let failed = false
    try {
      const res = await fetch('/api/projects/active')
      if (res.ok) {
        const d = await res.json()
        if (Array.isArray(d?.projects)) list = d.projects
        else failed = true
      } else failed = true
    } catch { failed = true }
    if (signal?.cancelled) return
    let persisted: string | null = null
    try { persisted = localStorage.getItem(storageKey) } catch { /* ignore */ }
    const { id: urlId, fromLegacy } = readUrlProjectId(searchParams)
    const resolved = resolveActiveProject({ urlId, persistedId: persisted, projects: list })
    setProjects(list)
    setProjectsError(failed)
    setActiveProjectId(resolved.id)
    setIsResolved(true)
    // A deep-link wins and updates persistence; a fallback also persists its pick.
    if (resolved.id && (resolved.source === 'url' || resolved.id !== persisted)) persist(resolved.id)
    // Standardize a legacy project_id deep-link onto the canonical projectId.
    if (resolved.id && resolved.source === 'url' && fromLegacy) syncUrl(resolved.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey, persist])

  const reloadProjects = useCallback(() => { void loadProjects() }, [loadProjects])

  useEffect(() => {
    const signal = { cancelled: false }
    void loadProjects(signal)
    return () => { signal.cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Cross-tab convergence: another tab wrote this user's active-project key. ──
  useEffect(() => {
    function onStorage(evt: StorageEvent) {
      const { relevant, value } = activeIdFromStorageEvent(evt, userId)
      if (!relevant) return // ignore other users' / unrelated keys (no leakage)
      if (value && isValidActiveId(value, projectsRef.current)) {
        if (value !== activeIdRef.current) setActiveProjectId(value) // echo guard
      } else {
        setActiveProjectId(resolveActiveProject({ persistedId: null, projects: projectsRef.current }).id)
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [userId])

  // ── Deep-link / Back-Forward: adopt a valid projectId that appears in the URL. ──
  useEffect(() => {
    if (!isResolved) return
    const { id: urlId } = readUrlProjectId(searchParams)
    if (urlId && isValidActiveId(urlId, projectsRef.current) && urlId !== activeIdRef.current) {
      setActiveProjectId(urlId)
      persist(urlId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, isResolved])

  // ── Re-validate when the list changes (e.g. the active project was deleted). ──
  useEffect(() => {
    if (!isResolved) return
    if (activeProjectId && !isValidActiveId(activeProjectId, projects)) {
      const next = resolveActiveProject({ persistedId: null, projects }).id
      setActiveProjectId(next)
      persist(next)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects, isResolved])

  const setActiveProject = useCallback((id: string) => {
    if (!isValidActiveId(id, projectsRef.current)) return
    if (id !== activeIdRef.current) {
      setActiveProjectId(id)
      persist(id)
    }
    syncUrl(id) // always reflect the canonical param (also reconciles a legacy one)
  }, [persist, syncUrl])

  return (
    <ActiveProjectContext.Provider value={{ activeProjectId, projects, isResolved, projectsError, reloadProjects, setActiveProject }}>
      {children}
    </ActiveProjectContext.Provider>
  )
}

/** Read the global active project. Safe no-op default outside the provider. */
export function useActiveProject(): ActiveProjectContextValue {
  const ctx = useContext(ActiveProjectContext)
  if (ctx) return ctx
  return { activeProjectId: null, projects: [], isResolved: true, projectsError: false, reloadProjects: () => {}, setActiveProject: () => {} }
}
