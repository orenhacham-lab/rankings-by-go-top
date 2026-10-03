'use client'

/**
 * The frame every per-project screen renders inside.
 *
 * A screen scoped to "the project in the top bar" has five ways to have no
 * project to show, and each has its own answer: the project list failed (retry
 * it), the list is still resolving (say so, never flash an empty state at someone
 * who has projects), the account has no project yet (create one), the project's
 * row failed (retry it), or the row did not come back (pick another). The project
 * page answered these for itself; the screens that replaced it answer them here,
 * once, in the same words.
 *
 * The order is the rule that page learned the hard way: a failure is checked
 * BEFORE the spinner, so it can never present as "still loading".
 */
import Link from 'next/link'
import { FolderPlus } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import EmptyState from '@/components/ui/EmptyState'
import { ScreenSkeleton } from '@/components/ui/Skeleton'
import { useActiveProject } from '@/lib/active-project/ActiveProjectProvider'
import { useProjectRow } from '@/lib/active-project/useProjectRow'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import type { Project } from '@/lib/supabase/types'
import type { ReactNode } from 'react'

export default function WorkspaceGate({
  children,
}: {
  /** Rendered only with a loaded row, which belongs to the current project. */
  children: (project: Project, reload: () => void) => ReactNode
}) {
  const { activeProjectId, isResolved, projectsError, reloadProjects } = useActiveProject()
  const { project, status, reload } = useProjectRow(isResolved ? activeProjectId : null)
  const { uiLocale } = useDashboardLanguage()
  const t = getDashboardDictionary(uiLocale).workspace

  if (isResolved && projectsError) {
    return (
      <Card>
        <EmptyState title={t.projectsLoadError} action={<Button onClick={reloadProjects}>{t.retry}</Button>} />
      </Card>
    )
  }

  if (isResolved && !activeProjectId) {
    return (
      <Card>
        <EmptyState
          icon={<FolderPlus size={22} />}
          title={t.noProjectTitle}
          body={t.noProjectBody}
          action={<Link href="/projects/new"><Button>{t.noProjectCta}</Button></Link>}
        />
      </Card>
    )
  }

  if (status === 'error') {
    return (
      <Card>
        <EmptyState title={t.projectLoadError} action={<Button onClick={reload}>{t.retry}</Button>} />
      </Card>
    )
  }

  // The row is gone although the list named it (deleted in another tab, say).
  // Reloading the list drops it and moves on to a project that exists.
  if (isResolved && status === 'missing') {
    return (
      <Card>
        <EmptyState title={t.projectMissing} action={<Button onClick={reloadProjects}>{t.retry}</Button>} />
      </Card>
    )
  }

  // Still resolving: the screen's shape, not a sentence in an empty card (the
  // sentence is still there, for screen readers, in the skeleton's live region).
  if (!isResolved || status === 'loading' || !project) {
    return <ScreenSkeleton label={t.loadingProject} />
  }

  return <>{children(project, reload)}</>
}
