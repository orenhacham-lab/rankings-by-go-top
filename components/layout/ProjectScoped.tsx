'use client'

/**
 * A PER-PROJECT SCREEN STARTS OVER WHEN THE PROJECT IN THE TOP BAR CHANGES.
 *
 * Switching the workspace changes `activeProjectId`, so a screen's effects
 * re-fetch — but React keeps the same component instance, and everything the
 * screen holds in `useState` is the PREVIOUS project's: the rows it fetched, a
 * selected tab, a scan it was showing. The switcher moved, the screen did not,
 * and only a refresh or a navigation cleared it.
 *
 * WorkspaceGate already avoids this for the screens it frames: while the new
 * project's row loads it renders a skeleton instead of the screen, which
 * unmounts the old state. The screens that read the active project directly had
 * nothing doing that for them, so this does it explicitly: the key changes with
 * the project, React discards the subtree, and the screen mounts clean.
 *
 * Use it around a screen that reads useActiveProject() and is NOT inside a
 * WorkspaceGate. It renders nothing of its own.
 */
import { Fragment, type ReactNode } from 'react'
import { useActiveProject } from '@/lib/active-project/ActiveProjectProvider'

export default function ProjectScoped({ children }: { children: ReactNode }) {
  const { activeProjectId, isResolved } = useActiveProject()
  // Before the list resolves there is no project to scope to, and the first
  // resolve must not count as a switch that throws away a mounted screen.
  return <Fragment key={isResolved ? activeProjectId ?? 'none' : 'resolving'}>{children}</Fragment>
}
