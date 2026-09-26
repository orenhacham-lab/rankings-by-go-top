'use client'

/**
 * AI visibility: how AI assistants answer about the current project.
 *
 * This tab used to be an overview of every project, each card linking into that
 * project's page, where the tool itself sat between the keyword table and the
 * content section. The tool is the tab now, for the project the top bar names.
 * The overview went with it, because the switcher is the one place projects are
 * listed.
 *
 * Gated by the same build-time flag the project page used for this section; the
 * routes it calls re-check the authoritative server flag on their own.
 */
import { useEffect, useMemo, useState } from 'react'
import Header from '@/components/layout/Header'
import WorkspaceGate from '@/components/layout/WorkspaceGate'
import AIVisibilitySection from '@/components/ai-visibility/AIVisibilitySection'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { createI18n } from '@/lib/ai-visibility/i18n'
import { createClient } from '@/lib/supabase/client'
import { withDeadline } from '@/lib/active-project/useProjectRow'
import type { Project } from '@/lib/supabase/types'

export default function AIVisibilityPage() {
  const { language } = useDashboardLanguage()
  const t = useMemo(() => createI18n(language), [language])

  if (process.env.NEXT_PUBLIC_ENABLE_AI_VISIBILITY !== 'true') {
    return (
      <div>
        <Header title={t('ai_visibility')} />
        <p className="py-20 text-center text-sm text-muted">{t('not_available')}</p>
      </div>
    )
  }

  return (
    <div>
      <Header title={t('ai_visibility')} subtitle={t('page_subtitle')} />
      <WorkspaceGate>
        {(project) => <ProjectAIVisibility key={project.id} project={project} />}
      </WorkspaceGate>
    </div>
  )
}

function ProjectAIVisibility({ project }: { project: Project }) {
  const [keywords, setKeywords] = useState<string[]>([])

  // The tracked keywords seed the suggested AI questions. A failed read leaves the
  // list empty, which the section handles as "no keywords yet"; it never blocks
  // the tool.
  useEffect(() => {
    let cancelled = false
    void withDeadline(createClient().from('tracking_targets').select('keyword').eq('project_id', project.id))
      .then((res) => { if (!cancelled) setKeywords((res?.data ?? []).map((r) => r.keyword)) })
    return () => { cancelled = true }
  }, [project.id])

  // A NEW ARRAY EVERY RENDER IS A NEW DEPENDENCY. This list is in the dependency
  // array of an effect that calls the Gemini-backed enriched-suggestions route;
  // passing a fresh array each render once called that endpoint three times for
  // one page load.
  const projectKeywords = useMemo(() => keywords.filter(Boolean), [keywords])

  return (
    <AIVisibilitySection
      projectId={project.id}
      projectCountry={project.country}
      projectLanguage={project.language}
      projectDomain={project.target_domain}
      projectBrandName={project.business_name}
      projectBrandAliases={project.brand_aliases}
      projectDomainAliases={project.domain_aliases}
      projectCity={project.city}
      projectKeywords={projectKeywords}
    />
  )
}
