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
 *
 * EVERY PROJECT GETS THIS TAB (part B of the UX review). A project WITHOUT a scan
 * (older than it, or the scan's flag off) used to get the tool exactly as it was
 * before W6d, in its older look. It now gets the same rows: the status bar, the
 * opening card and recent activity are computed from its own checks
 * (ai_scan_results, through the tool's runs), its questions are its own, and
 * competitors are shown read-only with the link to settings. Only what the scan
 * alone can know (the four readiness checks, the questions it suggests from the
 * business) is a placeholder that offers the mapping, and only when the mapping
 * can be offered at all.
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
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import { createI18n } from '@/lib/ai-visibility/i18n'
import MappingPlaceholder from '@/components/mapping/MappingPlaceholder'
import { useMapping } from '@/components/mapping/useMapping'
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
        <p className="py-20 text-center text-copy text-muted">{t('not_available')}</p>
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
  const { language } = useDashboardLanguage()
  const mappingCopy = getDashboardDictionary(language).mapping
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

  // The seeding scan no longer decides the layout: every project gets the overview
  // rows around the tool. The scan only adds what it alone knows.
  const [seedRefresh, setSeedRefresh] = useState(0)
  const { state: seed, questionsArrived } = useSeedPageState(project.id, seedRefresh)
  const mapping = useMapping(project.id, language, useCallback(() => setSeedRefresh((n) => n + 1), []))
  const [runs, setRuns] = useState<OverviewRun[] | 'error' | null>(null)
  // How many questions the project tracks, from the tool's own list: the opening
  // card's next step is "check one" with questions, "pick one" without.
  const [questionsCount, setQuestionsCount] = useState<number | null>(null)
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

  // The overview's additions to the tool, for every project.
  const overviewProps = {
    overviewMode: true,
    onRunsLoaded,
    onQuestionsCount: setQuestionsCount,
    openQueriesWhenEmpty: true,
    suggestionsRefreshKey: questionsArrived,
    requestedTab: tabRequest,
    competitorsSlot: (
      <CompetitorsReadOnly
        projectId={project.id}
        scanDomains={seed.kind === 'none' ? [] : seed.scanCompetitors}
        manageHref={competitorsSettingsHref(project.id)}
      />
    ),
  }
  // The one place the tool is rendered. projectKeywords goes by name: it is the
  // memoized array (reviewer-hardening B11), never a new one per render.
  const tool = <AIVisibilitySection {...toolProps} projectKeywords={projectKeywords} {...overviewProps} />

  const questionsPending = seed.kind === 'questions_pending'
  const readiness = readinessView(seed)
  // No scan yet: the readiness checks and the scan's questions are the mapping's to find.
  const mappingCard = seed.kind === 'none' && mapping.mapping.available === true && (
    <section
      id="ai-readiness"
      aria-label={mappingCopy.aiTitle}
      data-ai-readiness="mapping"
      className="min-w-0 rounded-card border border-line bg-surface p-5 shadow-card sm:p-6"
    >
      <MappingPlaceholder control={mapping} title={mappingCopy.aiTitle} body={mappingCopy.aiBody} locale={language} withNotice />
    </section>
  )
  return (
    <div className="space-y-8" data-ai-page={seed.kind}>
      <OverviewStatusBar overview={overview} questionsPending={questionsPending} />
      <OverviewOpeningCard
        overview={overview}
        questionsPending={questionsPending}
        questionsSuggested={seed.kind === 'none' ? null : seed.questionsSuggested}
        questionsCount={questionsCount}
        onChooseQuestions={chooseQuestions}
      />
      <div ref={toolRef} className="scroll-mt-4">
        {tool}
      </div>
      <div className="grid gap-4 sm:gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:items-start">
        <RecentActivity overview={overview} />
        {readiness && seed.kind !== 'none' && <ReadinessCard view={readiness} scannedAt={seed.scannedAt} settingsHref={settingsHref(project.id)} />}
        {mappingCard}
      </div>
    </div>
  )
}
