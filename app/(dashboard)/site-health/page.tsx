'use client'

/**
 * Site health: a score for the current project's site and its findings in plain
 * words, with "fix it for me" where the WordPress connection allows it and
 * step-by-step cards everywhere else. The screen: components/site-health; the
 * rules, the bounded scan and the fix engine: lib/site-health.
 */
import Header from '@/components/layout/Header'
import WorkspaceGate from '@/components/layout/WorkspaceGate'
import SiteHealthScreen from '@/components/site-health/SiteHealthScreen'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'

export default function SiteHealthPage() {
  const { language } = useDashboardLanguage()
  const copy = getDashboardDictionary(language).siteHealth
  return (
    <div>
      <Header title={copy.title} subtitle={copy.subtitle} />
      <WorkspaceGate>
        {(project) => <SiteHealthScreen key={project.id} project={project} />}
      </WorkspaceGate>
    </div>
  )
}
