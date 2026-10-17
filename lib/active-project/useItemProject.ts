'use client'

import { useEffect, useRef } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useActiveProject } from './ActiveProjectProvider'
import { isValidActiveId } from './resolve'
import { decideItemProject } from './item-project'

/**
 * Keep an ITEM screen and the workspace switcher in agreement.
 *
 * Call it from a screen about one item (an article, a keyword's history, a
 * check's details) with the project the item's own row names, and the list to
 * fall back to. Opening an item adopts its project; switching the workspace
 * afterwards leaves for the new project's list. item-project.ts says why the
 * two are different events.
 *
 * Adoption writes the canonical ?projectId into the url and lets the provider
 * adopt it there, rather than calling setActiveProject: the top-bar switcher
 * stays the only control that sets the active project (guarded by
 * lib/active-project/__qa__/resolve.qa.ts), and a url that already names the
 * project survives a reload and the back button.
 *
 * `itemProjectId` is null while the row loads, which is a 'wait': nothing
 * happens until the screen knows which project its item belongs to.
 */
export function useItemProject(
  itemProjectId: string | null | undefined,
  listHref: (projectId: string) => string,
): void {
  const { activeProjectId, projects, isResolved } = useActiveProject()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  // The opening decision is taken once per item, not once per render.
  const adoptedFor = useRef<string | null>(null)
  // `listHref` is usually an inline arrow — a new function every render — so it
  // is kept in a ref, written on commit, instead of being a dependency.
  const hrefRef = useRef(listHref)
  useEffect(() => { hrefRef.current = listHref })

  useEffect(() => {
    const decision = decideItemProject({
      itemProjectId,
      activeProjectId,
      isResolved,
      itemProjectKnown: isValidActiveId(itemProjectId, projects),
      hasAdopted: adoptedFor.current === itemProjectId,
    })
    if (decision.action === 'adopt') {
      adoptedFor.current = decision.projectId
      const next = new URLSearchParams(Array.from(searchParams.entries()))
      next.delete('project_id') // the legacy param, never written back
      next.set('projectId', decision.projectId)
      router.replace(`${pathname}?${next.toString()}`)
      return
    }
    if (decision.action === 'stay' && itemProjectId && itemProjectId === activeProjectId) {
      // Arrived here already on the right project: that WAS the opening.
      adoptedFor.current = itemProjectId
      return
    }
    if (decision.action === 'leave') router.replace(hrefRef.current(decision.projectId))
  }, [itemProjectId, activeProjectId, isResolved, projects, router, pathname, searchParams])
}
