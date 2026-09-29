'use client'

/**
 * Links ("קישורים לאתר"): the opt-in link network among our customers' sites
 * (lib/link-network; hidden for Shopify projects and while its tables do not
 * exist), and, as the second view, links the owner can earn from the open web
 * and the links between the site's own pages (lib/site-links). Opening the tab
 * reads stored data only: it calls no provider and spends nothing.
 */
import Header from '@/components/layout/Header'
import WorkspaceGate from '@/components/layout/WorkspaceGate'
import SiteLinksScreen from '@/components/site-links/network/SiteLinksScreen'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'

export default function SiteLinksPage() {
  const { language } = useDashboardLanguage()
  const copy = getDashboardDictionary(language).siteLinks
  return (
    <div>
      <Header title={copy.title} subtitle={copy.subtitle} />
      <WorkspaceGate>
        {(project) => <SiteLinksScreen key={project.id} projectId={project.id} />}
      </WorkspaceGate>
    </div>
  )
}
