'use client'

/**
 * Keywords: where the current project ranks today, and the actions that move it.
 *
 * This screen used to be a read-only list with its own project dropdown, whose
 * every row linked out to the project page, because adding, scanning and
 * refreshing a keyword only existed there. Those tools are the screen now, for
 * the project the top bar names, and the project page is gone.
 *
 * Under the keywords sits the project's check history, which used to be a tab of
 * its own ("Scans"). /scans redirects here with ?history=1, which opens it and
 * puts it first.
 */
import { useSearchParams } from 'next/navigation'
import Header from '@/components/layout/Header'
import WorkspaceGate from '@/components/layout/WorkspaceGate'
import ProjectKeywordsPanel from '@/components/keywords/ProjectKeywordsPanel'
import ScanHistory from '@/components/scans/ScanHistory'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'

export default function KeywordsPage() {
  const { language } = useDashboardLanguage()
  const kp = getDashboardDictionary(language).keywordsPage
  const historyOpen = useSearchParams().get('history') === '1'

  return (
    <div>
      <Header title={kp.title} subtitle={kp.subtitle} />
      <WorkspaceGate>
        {(project) => {
          const history = (
            <ScanHistory
              key={`history-${project.id}`}
              projectId={project.id}
              defaultOpen={historyOpen}
              className={historyOpen ? 'mb-8' : 'mt-8'}
            />
          )
          // Arriving for the history (?history=1, where /scans leads), it comes
          // first, open; otherwise it waits, closed, under the keywords. Placed, not
          // scrolled to: the keywords above it load later and would push it away.
          return historyOpen ? (
            <>
              {history}
              <ProjectKeywordsPanel key={project.id} project={project} />
            </>
          ) : (
            <>
              <ProjectKeywordsPanel key={project.id} project={project} />
              {history}
            </>
          )
        }}
      </WorkspaceGate>
    </div>
  )
}
