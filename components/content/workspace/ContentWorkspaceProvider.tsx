'use client'

/**
 * Content workspace — the state every /content screen shares.
 *
 * Before this existed, ContentHub.tsx was one 1,325-line component that held the
 * article table, the pending topics, the automation ideas + publishing queue, the
 * Search Console area and the WordPress/Shopify/GSC connection panels, all behind
 * internal useState tabs. Nothing had its own URL and nothing could be reasoned
 * about in isolation.
 *
 * The workspace is now one route per concern (/content, /content/topics,
 * /content/automation, /content/search-console) and this provider owns only what
 * genuinely crosses those screens:
 *   - the overview payload (/api/content/overview): counts, articles, platform
 *   - the topic list + per-topic link-plan summaries
 *   - the cross-screen enqueue workflow (ideas → link review → publishing queue)
 *   - the toasts and the shared "new article topic" action
 *
 * Screen-local state (filters, selections, batch progress) stays in its screen.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useActiveProject } from '@/lib/active-project/ActiveProjectProvider'
import { useToasts } from '@/components/content/Toast'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import { localizeShopifyPublishError } from '@/lib/i18n/dashboard/shopify-publish-error'
import { ideasSectionFromParam, ideasSectionToParam, type IdeasSection } from '@/lib/content/content-hub-ideas-section'
import { CONTENT_AUTOMATION_PATH, CONTENT_TOPICS_PATH } from '@/lib/content/content-workspace-nav'
import type { NewTopic } from '@/components/content/NewTopicsLinkPlanPanel'
import type { TopicPlanSummary } from '@/components/content/TopicPlanBadge'
import type { ArticleTopic } from '@/lib/supabase/types'
import type { ActivePlatform, ArticleRow, Overview, ProjectOption } from './types'

type ContentWorkspace = ReturnType<typeof useWorkspaceValue>

const WorkspaceContext = createContext<ContentWorkspace | null>(null)

/** Every screen reads the workspace through this hook — never its own fetch. */
export function useContentWorkspace(): ContentWorkspace {
  const ctx = useContext(WorkspaceContext)
  if (!ctx) throw new Error('useContentWorkspace must be used inside ContentWorkspaceProvider')
  return ctx
}

function useWorkspaceValue() {
  // Area D — the project comes from the GLOBAL active-project state, so the content
  // workspace stays in sync with keywords / reports / other sections, across tabs
  // and refresh.
  const {
    activeProjectId,
    projects: accessibleProjects, isResolved: projectsResolved,
    projectsError, reloadProjects,
  } = useActiveProject()
  const projectId = activeProjectId ?? ''
  // Area M — router/searchParams are used ONLY for the ideas `?section` sub-tab; the
  // active PROJECT still comes from the provider above (Areas D + M compose: M copies
  // every existing param, so the provider's ?projectId is preserved on a section change).
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const { language } = useDashboardLanguage()
  const t = useMemo(() => getDashboardDictionary(language).contentHub, [language])
  const isHebrew = language === 'he'
  const toast = useToasts()

  // ONE localizer for every Shopify publish failure the row/batch actions can
  // receive, in any of the shapes the server produces. genErrors is the shared
  // dictionary the automation queue already renders through, so the manual and
  // the automatic path say the same thing about the same failure.
  const shopifyPublishError = useCallback(
    (code: unknown) => localizeShopifyPublishError(code, { codes: t.genErrors as Record<string, string>, fallback: t.rowShopify.errGeneric }),
    [t],
  )

  const [data, setData] = useState<Overview | null>(null)
  // The project's ACTIVE publishing platform (resolved server-side by connection validity).
  // Manual publish/draft actions route by this — a Shopify project never calls WordPress.
  const activePlatform: ActivePlatform = data?.platform?.platform ?? 'wordpress'
  const isShopify = activePlatform === 'shopify'
  // Already exported on the ACTIVE platform (row eligibility + status).
  const exportedIdOf = useCallback(
    (a: ArticleRow): string | number | null => (isShopify ? (a.shopify_article_id ?? null) : a.wp_post_id),
    [isShopify],
  )
  const [loading, setLoading] = useState(true)
  // M — ideas destination sub-tab (automatic ideas vs manual topic), carried in the URL
  // `?section=` so a refresh / deep-link preserves it.
  const [ideasSection, setIdeasSection] = useState<IdeasSection>(() => ideasSectionFromParam(searchParams.get('section')))
  const automationEnabled = process.env.NEXT_PUBLIC_ENABLE_CONTENT_AUTOMATION === 'true'
  const [topics, setTopics] = useState<ArticleTopic[]>([])
  const [briefOpen, setBriefOpen] = useState(false)
  const [editingTopic, setEditingTopic] = useState<ArticleTopic | null>(null)
  // Phase 2F.1: internal-link planning step for freshly-created topics. Lifted
  // planStatus so the panel can seed the topic-row badges for those IDs only.
  const [newTopics, setNewTopics] = useState<NewTopic[] | null>(null)
  // Phase 3F.3.7b — per created-topic-id, the idea-stage suggested-link URLs the
  // user unchecked, so the review panel preserves that choice.
  const [newTopicsUnchecked, setNewTopicsUnchecked] = useState<Record<string, string[]>>({})
  // Phase 3G.3 — per created-topic-id, the CHECKED idea-stage links, so the review
  // panel seeds them (they don't disappear when its fresh dry-run differs).
  const [newTopicsSelected, setNewTopicsSelected] = useState<Record<string, { url: string; anchor: string }[]>>({})
  const [planStatus, setPlanStatus] = useState<Record<string, TopicPlanSummary>>({})
  // True while topic plan-summaries are being (re)hydrated — the row badge shows a neutral
  // "checking links" state instead of the "add links" default so unknown never reads missing.
  const [topicsLoading, setTopicsLoading] = useState(true)
  // Phase 3F.3.3a/b — after approving ideas, briefly highlight the new "ready" rows.
  const [highlightTopicIds, setHighlightTopicIds] = useState<string[]>([])
  const [reviewLinksHint, setReviewLinksHint] = useState(false)
  // Phase 3F.3.3e — a link plan was saved in the drawer; guide the user back to
  // the "add to publishing queue" CTA (a bumped signal re-scrolls it into view).
  const [linkPlanSavedHint, setLinkPlanSavedHint] = useState(false)
  const [ctaScrollSignal, setCtaScrollSignal] = useState(0)
  const [automationRefresh, setAutomationRefresh] = useState(0)
  // Phase 3F.3.7i — bumped when an enqueue succeeds from the drawer/review panel, so
  // the Automatic Ideas section shows + scrolls its success box into view.
  const [ideasSuccessSignal, setIdeasSuccessSignal] = useState<{ n: number; count: number } | null>(null)
  // The publishing queue lives on the automation screen; the topics screen asks to be
  // taken to it rather than scrolling a shared page.
  const scheduleSectionRef = useRef<HTMLDivElement>(null)
  const goToQueue = useCallback(() => {
    if (scheduleSectionRef.current) scheduleSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
    else router.push(CONTENT_AUTOMATION_PATH)
  }, [router])

  const handleTopicsQueued = useCallback((info: { topicIds: string[] }) => {
    setHighlightTopicIds(info.topicIds)
    window.setTimeout(() => setHighlightTopicIds([]), 4500)
  }, [])
  // "Review the links first" used to scroll to the topic rows further down the same
  // page. The topics are their own screen now, so it navigates there instead — and the
  // highlight + hint survive the navigation because they live in this provider.
  const handleReviewLinks = useCallback((topicIds: string[]) => {
    setHighlightTopicIds(topicIds)
    setReviewLinksHint(true)
    router.push(CONTENT_TOPICS_PATH)
    window.setTimeout(() => setHighlightTopicIds([]), 6000)
  }, [router])
  const handleScheduled = useCallback(() => {
    // Phase 3F.3.7i — refresh the queue in the background but DO NOT scroll to the
    // schedule section; the viewport must stay on / return to the Automatic Ideas
    // section (its success box scrolls itself into view).
    setAutomationRefresh((k) => k + 1)
    setReviewLinksHint(false)
    setLinkPlanSavedHint(false)
  }, [])
  const handleDrawerPlanSaved = useCallback(() => { setLinkPlanSavedHint(true) }, [])
  const handleReturnToQueue = useCallback(() => { setLinkPlanSavedHint(true); setCtaScrollSignal((n) => n + 1) }, [])

  // M — mirror the URL `?section=` into the ideas sub-tab (deep-link / refresh / Back-Forward).
  useEffect(() => { setIdeasSection(ideasSectionFromParam(searchParams.get('section'))) }, [searchParams])
  // Change the ideas sub-tab: write the canonical `?section=` (replace — no history spam).
  const changeIdeasSection = useCallback((section: IdeasSection) => {
    const params = new URLSearchParams(Array.from(searchParams.entries()))
    params.set('section', ideasSectionToParam(section))
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }, [router, pathname, searchParams])
  // The "New article topic" button leads to the automatic article-ideas SCREEN. It used
  // to scroll to a section of the one big page; it is now its own route, so the same
  // intent is a navigation and the destination survives a refresh or a shared link.
  const goToIdeas = useCallback(() => {
    router.push(`${CONTENT_AUTOMATION_PATH}?section=${ideasSectionToParam('auto')}`)
  }, [router])
  // Retargeted create-topic action: to the ideas destination when automation is on;
  // otherwise the manual brief modal directly (so manual creation always works).
  const handleCreateTopic = useCallback(() => {
    if (automationEnabled) goToIdeas()
    else { setEditingTopic(null); setBriefOpen(true) }
  }, [automationEnabled, goToIdeas])
  const openManualBrief = useCallback(() => { setEditingTopic(null); setBriefOpen(true) }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const qs = projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''
      const res = await fetch(`/api/content/overview${qs}`)
      if (res.ok) setData(await res.json())
    } catch {
      // Non-fatal: the page still renders its empty/selector states.
    } finally {
      setLoading(false)
    }
  }, [projectId])

  const loadTopics = useCallback(async () => {
    if (!projectId) { setTopics([]); setPlanStatus({}); setTopicsLoading(false); return }
    setTopicsLoading(true)
    try {
      const res = await fetch(`/api/content/topics?projectId=${encodeURIComponent(projectId)}`)
      if (res.ok) {
        const json = await res.json()
        setTopics(json.topics || [])
        // TRUTHFUL hydration on load/refresh — one-shot saved-plan summaries for every topic
        // (server-derived from the latest active batch), so the row badges are correct even
        // for plans saved in a PRIOR session. Merges over any in-session seeds.
        if (json.planStatus && typeof json.planStatus === 'object') {
          setPlanStatus((prev) => ({ ...prev, ...(json.planStatus as Record<string, TopicPlanSummary>) }))
        }
      }
    } catch {
      // Non-fatal: the topics section simply shows its empty state.
    } finally {
      setTopicsLoading(false)
    }
  }, [projectId])

  // Phase 3F.3.6/3F.3.7 (Part G) — ensure the project's pool exists (never flips an
  // active pool to paused) and add the given topics to its publishing queue.
  // Returns success. Used by the drawer and the batch link-review panel.
  const ensurePoolAndEnqueue = useCallback(async (topicIds: string[], expectsLinks: boolean): Promise<boolean> => {
    if (!projectId || topicIds.length === 0) return false
    try {
      let poolId: string | null = null
      try {
        const gr = await fetch(`/api/content/automation/pools?projectId=${encodeURIComponent(projectId)}`)
        if (gr.ok) { const gd = await gr.json(); poolId = gd.pool?.id ?? null }
      } catch { /* fall through to create */ }
      if (!poolId) {
        const pr = await fetch('/api/content/automation/pools', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId, cadence: 'weekly', intervalDays: 7, isActive: false }),
        })
        if (!pr.ok) return false
        const pd = await pr.json(); poolId = pd.pool?.id ?? null
      }
      if (!poolId) return false
      // ONE authoritative call (Part G): validate + verify saved link plan + approve
      // + enqueue per topic, with typed per-topic results. Never reports full success
      // when a topic's links did not persist. expectsLinks=true → the server confirms
      // the review-panel's saved link plan (a zero-link topic still has a batch).
      //
      // `expectsLinks` comes from the CALLER, the only place that knows whether a
      // plan was saved. It used to be hard-coded true, so a project with no
      // internal-link site index could never queue a topic at all: no plan could
      // be saved, so the server's verification could never pass. It is still true
      // for every flow that saves a plan — the server-side verification itself is
      // untouched.
      // P0 Part J — NO unconditional allowNonArticle override: an article topic
      // enqueues normally (server defaults page type to 'article'); a non-article
      // recommendation is blocked server-side and requires a deliberate, visible
      // user override, never an invisible client flag.
      const ir = await fetch(`/api/content/automation/pools/${poolId}/approve-and-queue`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topics: topicIds.map((topicId) => ({ topicId, expectsLinks })) }),
      })
      if (!ir.ok && ir.status !== 207) return false
      const d = await ir.json().catch(() => ({}))
      const added = typeof d.added === 'number' ? d.added : 0
      const alreadyQueued = typeof d.alreadyQueued === 'number' ? d.alreadyQueued : 0
      // Truthful: full success requires EVERY topic to be added/queued (no partial).
      if (d.ok !== true || (added <= 0 && alreadyQueued <= 0)) return false
      handleScheduled()
      // Surface the success in the Automatic Ideas section (drawer/panel path).
      setIdeasSuccessSignal((prev) => ({ n: (prev?.n ?? 0) + 1, count: topicIds.length }))
      return true
    } catch {
      return false
    }
  }, [projectId, handleScheduled])
  const handleSaveAndQueue = useCallback((topicId: string, expectsLinks: boolean) => ensurePoolAndEnqueue([topicId], expectsLinks), [ensurePoolAndEnqueue])

  useEffect(() => { load() }, [load])
  useEffect(() => { loadTopics() }, [loadTopics])

  // Refetch when the user returns to the tab (e.g. after publishing in the
  // editor) so WordPress/status changes are reflected without a manual reload.
  useEffect(() => {
    const onFocus = () => { load(); loadTopics() }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [load, loadTopics])

  // Optimistically patch one article row in local state.
  const patchArticle = useCallback((id: string, patch: Partial<ArticleRow>) => {
    setData((d) => (d ? { ...d, articles: d.articles.map((x) => (x.id === id ? { ...x, ...patch } : x)) } : d))
  }, [])

  // The selector's options come from the AUTHORITATIVE accessible-project list, not
  // from whatever the overview payload happened to return.
  const overviewProjects = data?.projects ?? []
  const projects: ProjectOption[] = useMemo(() => {
    const enriched = new Map(overviewProjects.map((p) => [p.id, p]))
    return accessibleProjects.map((p) => enriched.get(p.id) ?? {
      id: p.id, name: p.name ?? '—', business_name: null, target_domain: null, language: null,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessibleProjects, data])

  const counts = data?.counts
  const selectedProject = projects.find((p) => p.id === projectId) || null

  // topic_id → the article generated from it, so a topic that already has an
  // article never offers "generate" again.
  const articleByTopic = useMemo(() => {
    const m: Record<string, ArticleRow> = {}
    for (const a of data?.articles ?? []) if (a.topic_id) m[a.topic_id] = a
    return m
  }, [data])

  const selectableTopics = useMemo(() => topics.filter((tp) => !articleByTopic[tp.id]), [topics, articleByTopic])

  return {
    // identity + i18n
    projectId, projects, selectedProject, projectsResolved, projectsError, reloadProjects,
    language, t, isHebrew, toast,
    // overview
    data, loading, counts, activePlatform, isShopify, exportedIdOf, load, patchArticle, shopifyPublishError,
    // topics
    topics, selectableTopics, articleByTopic, topicsLoading, loadTopics,
    planStatus, setPlanStatus, highlightTopicIds,
    newTopics, setNewTopics, newTopicsUnchecked, setNewTopicsUnchecked, newTopicsSelected, setNewTopicsSelected,
    reviewLinksHint, setReviewLinksHint,
    // the cross-screen enqueue workflow
    automationEnabled, ideasSection, changeIdeasSection, goToIdeas, goToQueue, scheduleSectionRef,
    automationRefresh, setAutomationRefresh, ideasSuccessSignal, linkPlanSavedHint, ctaScrollSignal,
    ensurePoolAndEnqueue, handleSaveAndQueue, handleScheduled, handleTopicsQueued, handleReviewLinks,
    handleDrawerPlanSaved, handleReturnToQueue,
    // the shared "new article topic" action + its modal
    handleCreateTopic, openManualBrief, briefOpen, setBriefOpen, editingTopic, setEditingTopic,
  }
}

export function ContentWorkspaceProvider({ children }: { children: ReactNode }) {
  const value = useWorkspaceValue()
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
}
