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
 *
 * W6d: A PROJECT WITH A SEEDING SCAN gets the tab of plan section 5 around the
 * same tool: a status bar (row 1), the dark opening card (row 2), the tool with
 * the scan's questions and competitors (row 3), recent activity (row 4) and the
 * scan's AI-readiness checks (row 5). Everything the rows show is read from what
 * the tool already loads and from GET /api/projects/[id]/seed; opening the tab
 * calls no model and spends nothing, and a check still starts only from the
 * tool's own engine buttons, through the dispatch route and its allowance.
 * A project WITHOUT a scan gets the tool exactly as before.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Header from '@/components/layout/Header'
import WorkspaceGate from '@/components/layout/WorkspaceGate'
import AIVisibilitySection, { type AIVisibilityTab } from '@/components/ai-visibility/AIVisibilitySection'
import CompetitorsReadOnly from '@/components/ai-visibility/CompetitorsReadOnly'
import ReadinessCard from '@/components/ai-visibility/ReadinessCard'
import { OverviewOpeningCard, OverviewStatusBar, RecentActivity, type OverviewData } from '@/components/ai-visibility/OverviewRows'
import { useSeedPageState } from '@/components/ai-visibility/useSeedPageState'
import {
  buildOverview, competitorsSettingsHref, readinessView, readRuns, settingsHref, type OverviewRun,
} from '@/components/ai-visibility/overview-model'
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
  // "Manage competitors" links (the keywords tab, the dashboard) open this tab
  // on the competitors. Only that value is honoured; anything else is ignored.
  const initialTab = useSearchParams().get('tab') === 'competitors' ? 'competitors' as const : undefined

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

  // W6d. The seeding scan decides the layout: with a scan run, the overview rows
  // stand around the tool; without one (the scan's flag off, an older project, a
  // read that failed) the tool renders exactly as it did before.
  const { state: seed, questionsArrived } = useSeedPageState(project.id)
  const [runs, setRuns] = useState<OverviewRun[] | 'error' | null>(null)
  const onRunsLoaded = useCallback((raw: unknown[] | null) => setRuns(raw === null ? 'error' : readRuns(raw)), [])
  const overview = useMemo<OverviewData>(() => (runs === null ? null : runs === 'error' ? 'error' : buildOverview(runs)), [runs])
  const [tabRequest, setTabRequest] = useState<{ tab: AIVisibilityTab; seq: number } | undefined>(undefined)
  const toolRef = useRef<HTMLDivElement>(null)
  const chooseQuestions = useCallback(() => {
    setTabRequest((prev) => ({ tab: 'queries', seq: (prev?.seq ?? 0) + 1 }))
    toolRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  const toolProps = {
    projectId: project.id,
    projectCountry: project.country,
    projectLanguage: project.language,
    projectDomain: project.target_domain,
    projectBrandName: project.business_name,
    projectBrandAliases: project.brand_aliases,
    projectDomainAliases: project.domain_aliases,
    projectCity: project.city,
    initialTab,
  }

  // One short database read (bounded by SEED_READ_DEADLINE_MS) before the tool
  // mounts, so the tool never mounts twice and nothing jumps when the rows appear.
  if (seed.kind === 'loading') {
    return <div aria-busy="true" className="min-h-[60vh]" data-ai-page="loading" />
  }

  // The overview's additions to the tool; none at all without a scan.
  const overviewProps =
    seed.kind === 'none'
      ? {}
      : {
          overviewMode: true,
          onRunsLoaded,
          openQueriesWhenEmpty: true,
          suggestionsRefreshKey: questionsArrived,
          requestedTab: tabRequest,
          competitorsSlot: (
            <CompetitorsReadOnly
              projectId={project.id}
              scanDomains={seed.scanCompetitors}
              manageHref={competitorsSettingsHref(project.id)}
            />
          ),
        }
  // The one place the tool is rendered. projectKeywords goes by name: it is the
  // memoized array (reviewer-hardening B11), never a new one per render.
  const tool = <AIVisibilitySection {...toolProps} projectKeywords={projectKeywords} {...overviewProps} />

  // No scan: today's tool, unchanged.
  if (seed.kind === 'none') {
    return tool
  }

  const questionsPending = seed.kind === 'questions_pending'
  const readiness = readinessView(seed)
  return (
    <div className="space-y-5 sm:space-y-6" data-ai-page={seed.kind}>
      <OverviewStatusBar overview={overview} questionsPending={questionsPending} />
      <OverviewOpeningCard
        overview={overview}
        questionsPending={questionsPending}
        questionsSuggested={seed.questionsSuggested}
        onChooseQuestions={chooseQuestions}
      />
      <div ref={toolRef} className="scroll-mt-4">
        {tool}
      </div>
      <div className="grid gap-5 sm:gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:items-start">
        <RecentActivity overview={overview} />
        {readiness && <ReadinessCard view={readiness} scannedAt={seed.scannedAt} settingsHref={settingsHref(project.id)} />}
      </div>
    </div>
  )
}
