'use client'

/**
 * Links ("קישורים לאתר"): links the owner can earn from the open web, and the
 * links between the site's own pages. It never places, trades or sells links
 * between the app's customers (Google's link-scheme policy); the tab says why.
 * Everything shown is read from what the project already stored
 * (lib/site-links); opening the tab calls no provider and spends nothing.
 */
import Header from '@/components/layout/Header'
import WorkspaceGate from '@/components/layout/WorkspaceGate'
import SiteLinksView from '@/components/site-links/SiteLinksView'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'

export default function SiteLinksPage() {
  const { language } = useDashboardLanguage()
  const copy = getDashboardDictionary(language).siteLinks
  return (
    <div>
      <Header title={copy.title} subtitle={copy.subtitle} />
      <WorkspaceGate>
        {(project) => <SiteLinksView key={project.id} projectId={project.id} />}
      </WorkspaceGate>
    </div>
  )
}
