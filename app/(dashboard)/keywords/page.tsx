'use client'

/**
 * Keywords: where the current project ranks today, and the actions that move it.
 *
 * This screen used to be a read-only list with its own project dropdown, whose
 * every row linked out to the project page, because adding, scanning and
 * refreshing a keyword only existed there. Those tools are the screen now, for
 * the project the top bar names, and the project page is gone.
 */
import Header from '@/components/layout/Header'
import WorkspaceGate from '@/components/layout/WorkspaceGate'
import ProjectKeywordsPanel from '@/components/keywords/ProjectKeywordsPanel'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'

export default function KeywordsPage() {
  const { language } = useDashboardLanguage()
  const kp = getDashboardDictionary(language).keywordsPage

  return (
    <div>
      <Header title={kp.title} subtitle={kp.subtitle} />
      <WorkspaceGate>
        {(project) => <ProjectKeywordsPanel key={project.id} project={project} />}
      </WorkspaceGate>
    </div>
  )
}
