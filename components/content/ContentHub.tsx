'use client'

/**
 * Content Hub — standalone content workspace (Phase 1.5, read-only).
 *
 * Tool-first entry: pick a project at the top, see its article stats + list,
 * and manage its WordPress connection. NO generation/publish/scheduling yet —
 * those actions render as disabled "coming soon". Data comes from the read-only
 * /api/content/overview endpoint (no secrets, RLS-scoped).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/layout/Header'
import { Card } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import { Table, TableHead, TableBody, TableRow, Th, Td, EmptyRow } from '@/components/ui/Table'
import WordPressConnectionPanel from '@/components/content/WordPressConnectionPanel'
import ContentHubPlatformCard from '@/components/content/ContentHubPlatformCard'
import InternalLinkIndexStatus from '@/components/content/InternalLinkIndexStatus'
import ArticleBriefModal from '@/components/content/ArticleBriefModal'
import TopicsList from '@/components/content/TopicsList'
import NewTopicsLinkPlanPanel, { type NewTopic } from '@/components/content/NewTopicsLinkPlanPanel'
import type { TopicPlanSummary } from '@/components/content/TopicPlanBadge'
import AutomationIdeas from '@/components/content/AutomationIdeas'
import AutomationSchedule from '@/components/content/AutomationSchedule'
import { useToasts, ToastHost } from '@/components/content/Toast'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import { formatDate } from '@/lib/utils'
import { ExternalLink, Plus } from 'lucide-react'
import type { ArticleTopic } from '@/lib/supabase/types'

type ProjectOption = { id: string; name: string; business_name: string | null; target_domain: string | null; language: string | null }

type Counts = {
  total: number; draft: number; ready: number; scheduled: number
  publishing: number; published: number; failed: number
}

type ArticleRow = {
  id: string; topic_id: string | null; title: string; slug: string; status: string
  wp_post_id: number | null; wp_post_url: string | null; wp_featured_media_id: number | null
  featured_image_url: string | null
  scheduled_at: string | null; published_at: string | null
  created_at: string; updated_at: string
  shopify_article_id?: string | null; shopify_article_url?: string | null; shopify_status?: string | null; shopify_blog_id?: string | null
}

type ActivePlatform = 'wordpress' | 'shopify' | 'conflict' | 'none'
type Overview = {
  projects: ProjectOption[]
  selected: string | null
  counts: Counts | null
  articles: ArticleRow[]
  wordpress: { connected: boolean; siteUrl: string | null; status: string | null } | null
  shopify?: { connected: boolean; shopDomain: string | null; status: string | null; canPublish: boolean; defaultBlogId: string | null } | null
  platform?: { platform: ActivePlatform; shopifyNeedsScope?: boolean } | null
}

const STATUS_TONE: Record<string, 'neutral' | 'info' | 'warning' | 'success' | 'danger'> = {
  draft: 'neutral',
  ready: 'info',
  scheduled: 'warning',
  publishing: 'warning',
  published: 'success',
  failed: 'danger',
}

export default function ContentHub({ proFirst = false }: { proFirst?: boolean }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const projectId = searchParams.get('projectId') || ''

  const { language } = useDashboardLanguage()
  const t = useMemo(() => getDashboardDictionary(language).contentHub, [language])
  const isHebrew = language === 'he'
  const toast = useToasts()

  const [data, setData] = useState<Overview | null>(null)
  // The project's ACTIVE publishing platform (resolved server-side by connection validity).
  // Manual publish/draft actions route by this — a Shopify project never calls WordPress.
  const activePlatform: ActivePlatform = data?.platform?.platform ?? 'wordpress'
  const isShopify = activePlatform === 'shopify'
  // Already exported on the ACTIVE platform (row eligibility + status).
  const exportedIdOf = (a: ArticleRow): string | number | null => isShopify ? (a.shopify_article_id ?? null) : a.wp_post_id
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'articles' | 'gbp' | 'scheduled'>('articles')
  const [statusFilter, setStatusFilter] = useState('')
  const [search, setSearch] = useState('')
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
  // Phase 3F.3.3a/b — after approving ideas, briefly highlight the new "ready"
  // rows. The truthful next-step CTA lives in the ideas card (which scrolls
  // itself into view) so approval does NOT scroll away. The explicit "review
  // links first" action DOES scroll to the ready rows + shows a per-row hint.
  const topicsSectionRef = useRef<HTMLDivElement>(null)
  const scheduleSectionRef = useRef<HTMLDivElement>(null)
  const [highlightTopicIds, setHighlightTopicIds] = useState<string[]>([])
  const [reviewLinksHint, setReviewLinksHint] = useState(false)
  // Phase 3F.3.3e — a link plan was saved in the drawer; guide the user back to
  // the "add to publishing queue" CTA (a bumped signal re-scrolls it into view).
  const [linkPlanSavedHint, setLinkPlanSavedHint] = useState(false)
  const [ctaScrollSignal, setCtaScrollSignal] = useState(0)
  const [rowBusy, setRowBusy] = useState<{ id: string; action: 'publish' | 'draft' | 'ready' } | null>(null)
  const [automationRefresh, setAutomationRefresh] = useState(0)
  // Phase 3F.3.7i — bumped when an enqueue succeeds from the drawer/review panel, so
  // the Automatic Ideas section shows + scrolls its success box into view.
  const [ideasSuccessSignal, setIdeasSuccessSignal] = useState<{ n: number; count: number } | null>(null)
  const handleTopicsQueued = useCallback((info: { topicIds: string[] }) => {
    setHighlightTopicIds(info.topicIds)
    window.setTimeout(() => setHighlightTopicIds([]), 4500)
  }, [])
  const handleReviewLinks = useCallback((topicIds: string[]) => {
    setHighlightTopicIds(topicIds)
    setReviewLinksHint(true)
    window.setTimeout(() => topicsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60)
    window.setTimeout(() => setHighlightTopicIds([]), 6000)
  }, [])
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
  // Phase 3F.3.6/3F.3.7 (Part G) — ensure the project's pool exists (never flips an
  // active pool to paused) and add the given topics to its publishing queue.
  // Returns success. Used by the drawer and the batch link-review panel.
  const ensurePoolAndEnqueue = useCallback(async (topicIds: string[]): Promise<boolean> => {
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
      // P0 Part J — NO unconditional allowNonArticle override: an article topic
      // enqueues normally (server defaults page type to 'article'); a non-article
      // recommendation is blocked server-side and requires a deliberate, visible
      // user override, never an invisible client flag.
      const ir = await fetch(`/api/content/automation/pools/${poolId}/approve-and-queue`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topics: topicIds.map((topicId) => ({ topicId, expectsLinks: true })) }),
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
  const handleSaveAndQueue = useCallback((topicId: string) => ensurePoolAndEnqueue([topicId]), [ensurePoolAndEnqueue])
  const [articlesExpanded, setArticlesExpanded] = useState(false) // show first 3 by default

  // ── Batch article creation (client-side, sequential) ──
  const BATCH_LIMIT = 10
  type BatchEntry = { status: 'queued' | 'generating' | 'success' | 'failed'; error?: string }
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [batchState, setBatchState] = useState<Record<string, BatchEntry>>({})
  const [batchRunning, setBatchRunning] = useState(false)
  const cancelRef = useRef(false)
  // Synchronous lock — set BEFORE any await so rapid double-clicks can't start a
  // second loop while React's batchRunning state is still updating.
  const batchRunningRef = useRef(false)

  // ── Batch WordPress publish/draft (top table, client-side, sequential) ──
  type ArticleBatchEntry = { status: 'queued' | 'running' | 'success' | 'failed'; error?: string }
  const [selectedArticles, setSelectedArticles] = useState<Set<string>>(new Set())
  const [articleBatchState, setArticleBatchState] = useState<Record<string, ArticleBatchEntry>>({})
  const [articleBatchRunning, setArticleBatchRunning] = useState(false)
  const [articleBatchMode, setArticleBatchMode] = useState<'publish' | 'draft' | null>(null)
  const articleBatchRef = useRef(false)
  const cancelArticleRef = useRef(false)

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

  useEffect(() => { load() }, [load])
  useEffect(() => { loadTopics() }, [loadTopics])

  // Refetch when the user returns to the tab (e.g. after publishing in the
  // editor) so WordPress/status changes are reflected without a manual reload.
  useEffect(() => {
    const onFocus = () => { load(); loadTopics() }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [load, loadTopics])

  async function deleteArticle(id: string) {
    if (!window.confirm(t.confirmDeleteArticle)) return
    try {
      const res = await fetch(`/api/content/articles/${id}`, { method: 'DELETE' })
      if (res.ok) { load(); loadTopics(); toast.success(t.toasts.articleDeleted) }
      else toast.error(t.deleteFailed)
    } catch {
      toast.error(t.deleteFailed)
    }
  }

  // Optimistically patch one article row in local state.
  function patchArticle(id: string, patch: Partial<ArticleRow>) {
    setData((d) => (d ? { ...d, articles: d.articles.map((x) => (x.id === id ? { ...x, ...patch } : x)) } : d))
  }

  // Reuses the SAME server route the editor uses. No WordPress logic here.
  async function exportRow(a: ArticleRow, wpStatus: 'draft' | 'publish') {
    if (rowBusy) return
    // Route by the project's ACTIVE platform — a Shopify project publishes to Shopify, not
    // WordPress. Two active platforms / none are explicit states, never a misleading publish.
    if (activePlatform === 'conflict') { toast.error(t.rowShopify.conflict); return }
    if (activePlatform === 'none') { toast.error(t.rowShopify.setup); return }
    if (activePlatform === 'shopify') { await exportRowShopify(a, wpStatus); return }
    if (wpStatus === 'publish' && !window.confirm(t.rowWp.publishConfirm)) return
    let force = false
    if (a.wp_post_id) {
      if (!window.confirm(t.rowWp.newPostConfirm)) return
      force = true
    }
    setRowBusy({ id: a.id, action: wpStatus })
    try {
      const res = await fetch(`/api/content/articles/${a.id}/wordpress`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: wpStatus, force }),
      })
      const d = await res.json().catch(() => ({}))
      if (res.ok && d.wp_post_id) {
        patchArticle(a.id, {
          wp_post_id: d.wp_post_id, wp_post_url: d.wp_post_url ?? null,
          ...(wpStatus === 'publish' ? { status: 'published', published_at: new Date().toISOString() } : {}),
        })
        toast.success(wpStatus === 'publish' ? t.rowWp.published : t.rowWp.draftSent)
        // TRUTHFUL SEO status — the post succeeded, but warn when the SEO meta was NOT applied
        // (never a silent full-success). 'verified' / no-SEO-plugin are fine.
        const seoStatus = typeof d.seoStatus === 'string' ? d.seoStatus : 'verified'
        if (seoStatus !== 'verified' && seoStatus !== 'plugin_unavailable') {
          toast.error(seoStatus === 'seo_bridge_required' ? t.rowWp.seoBridgeRequired : seoStatus === 'permission_error' ? t.rowWp.seoPermission : t.rowWp.seoNotVerified)
        }
        // Phase 3E.1 — surface the keyword-added feedback in the list flow too
        // (only when the publish actually added a new project keyword).
        if (wpStatus === 'publish' && d.keywordAdded) toast.success(t.rowWp.keywordAdded)
        load() // sync authoritative fields (published_at, etc.)
        return
      }
      const reason = typeof d.reason === 'string' ? d.reason : 'unknown'
      toast.error(reason === 'wordpress_media_upload_failed' ? t.rowWp.errImage : reason === 'no_wordpress_connection' ? t.rowWp.errNoConn : t.rowWp.errGeneric)
    } catch {
      toast.error(t.rowWp.errGeneric)
    } finally {
      setRowBusy(null)
    }
  }

  // Shopify single-row publish/draft. Idempotent server-side via the stored
  // shopify_article_id (a retry reconciles the same article, never a duplicate). Surfaces the
  // exact corrective action for a real Shopify prerequisite (scope / blog) — never hidden.
  async function exportRowShopify(a: ArticleRow, status: 'draft' | 'publish') {
    if (status === 'publish' && !window.confirm(t.rowShopify.publishConfirm)) return
    setRowBusy({ id: a.id, action: status })
    try {
      const res = await fetch(`/api/content/articles/${a.id}/shopify`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      const d = await res.json().catch(() => ({}))
      if (res.ok && d.ok) {
        patchArticle(a.id, {
          shopify_article_id: d.shopify_article_id ?? a.shopify_article_id ?? null,
          shopify_article_url: d.shopify_article_url ?? a.shopify_article_url ?? null,
          shopify_status: d.shopify_status ?? (status === 'publish' ? 'published' : 'draft'),
          ...(status === 'publish' ? { status: 'published', published_at: new Date().toISOString() } : {}),
        })
        toast.success(status === 'publish' ? t.rowShopify.published : t.rowShopify.draftSent)
        load()
        return
      }
      const reason = typeof d.reason === 'string' ? d.reason : 'unknown'
      toast.error(
        reason === 'no_shopify_connection' ? t.rowShopify.errNoConn
          : reason === 'missing_write_content_scope' ? t.rowShopify.errScope
            : reason === 'no_shopify_blog' ? t.rowShopify.errBlog
              : t.rowShopify.errGeneric,
      )
    } catch {
      toast.error(t.rowShopify.errGeneric)
    } finally {
      setRowBusy(null)
    }
  }

  async function markReadyRow(a: ArticleRow) {
    if (rowBusy) return
    setRowBusy({ id: a.id, action: 'ready' })
    try {
      const res = await fetch(`/api/content/articles/${a.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'ready' }),
      })
      const d = await res.json().catch(() => ({}))
      if (res.status === 409 && d.error === 'quality_blockers') { toast.error(t.rowWp.markBlocked); return }
      if (res.ok) { patchArticle(a.id, { status: 'ready' }); toast.success(t.rowWp.marked); return }
      toast.error(t.rowWp.errGeneric)
    } catch {
      toast.error(t.rowWp.errGeneric)
    } finally {
      setRowBusy(null)
    }
  }

  // Auto-select when the user has exactly one project and none is chosen yet.
  useEffect(() => {
    if (!projectId && data && data.projects.length === 1) {
      router.replace(`/content?projectId=${data.projects[0].id}`)
    }
  }, [projectId, data, router])

  function onSelectProject(e: React.ChangeEvent<HTMLSelectElement>) {
    const id = e.target.value
    router.push(id ? `/content?projectId=${id}` : '/content')
  }

  const projects = data?.projects ?? []
  const counts = data?.counts
  const selectedProject = projects.find((p) => p.id === projectId) || null

  // Map topic_id → latest article (articles come ordered by updated_at desc).
  const articleByTopic = useMemo(() => {
    const map: Record<string, { id: string; status: string }> = {}
    for (const a of data?.articles ?? []) {
      if (a.topic_id && !map[a.topic_id]) map[a.topic_id] = { id: a.id, status: a.status }
    }
    return map
  }, [data])

  const filteredArticles = (data?.articles ?? []).filter((a) => {
    const matchStatus = !statusFilter || a.status === statusFilter
    const matchSearch = !search || a.title.toLowerCase().includes(search.toLowerCase())
    return matchStatus && matchSearch
  })

  // Topics eligible for batch = those WITHOUT an article yet.
  const selectableTopics = useMemo(() => topics.filter((tp) => !articleByTopic[tp.id]), [topics, articleByTopic])
  const allSelectableSelected = selectableTopics.length > 0 && selectableTopics.every((tp) => selected.has(tp.id))

  // Articles eligible for batch WordPress export = not yet sent + not published.
  const selectableArticles = filteredArticles.filter((a) => !a.wp_post_id && a.status !== 'published')
  const allArticlesSelected = selectableArticles.length > 0 && selectableArticles.every((a) => selectedArticles.has(a.id))
  function toggleArticleSelectAll() {
    setSelectedArticles(() => (allArticlesSelected ? new Set() : new Set(selectableArticles.map((a) => a.id))))
  }

  // Clear selection/batch state when the project changes.
  useEffect(() => {
    setSelected(new Set()); setBatchState({}); setBatchRunning(false); cancelRef.current = false
    setSelectedArticles(new Set()); setArticleBatchState({}); setArticleBatchRunning(false); setArticleBatchMode(null); cancelArticleRef.current = false
  }, [projectId])

  function toggleSelect(id: string) {
    setSelected((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })
  }
  function toggleSelectAll() {
    setSelected(() => (allSelectableSelected ? new Set() : new Set(selectableTopics.map((tp) => tp.id))))
  }
  function clearSelection() { setSelected(new Set()) }

  // Readable Hebrew error from the generate endpoint (no raw JSON).
  function genErrorText(d: { reason?: unknown; audit?: { blockers?: unknown } }): string {
    const errs = t.genErrors as Record<string, string>
    const reason = typeof d.reason === 'string' ? d.reason : 'unknown'
    const blockers = Array.isArray(d.audit?.blockers) ? (d.audit!.blockers as string[]) : []
    if (blockers.length) {
      const codes = t.editor.auditCodes as Record<string, string>
      return `${errs.qualityIntro} ${blockers.map((b) => codes[b] || b).join(', ')}`
    }
    return errs[reason] || errs.unknown
  }

  // One generation request — reuses the EXISTING single endpoint. A generous
  // client timeout only guards a truly stuck request; on timeout the batch STOPS
  // (a client abort can't stop the server, so we never start the next topic).
  async function runOne(topicId: string): Promise<{ ok: boolean; error?: string; timedOut?: boolean }> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 180_000)
    try {
      const res = await fetch('/api/content/articles/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topicId }), signal: controller.signal,
      })
      const d = await res.json().catch(() => ({}))
      if (res.ok && d.articleId) return { ok: true }
      return { ok: false, error: genErrorText(d) }
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return { ok: false, error: t.batch.timeout, timedOut: true }
      return { ok: false, error: (t.genErrors as Record<string, string>).unknown }
    } finally {
      clearTimeout(timer)
    }
  }

  async function runBatch() {
    // Synchronous lock FIRST — before any state update or await.
    if (batchRunningRef.current || batchRunning) return
    const ids = Array.from(selected).filter((id) => !articleByTopic[id])
    if (ids.length === 0) return
    if (ids.length > BATCH_LIMIT) { toast.error(t.batch.tooMany); return }
    batchRunningRef.current = true

    cancelRef.current = false
    setBatchRunning(true)
    setBatchState((s) => { const next = { ...s }; ids.forEach((id) => { next[id] = { status: 'queued' } }); return next })

    const onUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', onUnload)

    let ok = 0, fail = 0
    let stoppedByTimeout = false
    for (const id of ids) {
      if (cancelRef.current) break
      if (articleByTopic[id]) continue // got an article meanwhile → skip safely
      setBatchState((s) => ({ ...s, [id]: { status: 'generating' } }))
      const r = await runOne(id)
      if (r.ok) { ok++; setBatchState((s) => ({ ...s, [id]: { status: 'success' } })) }
      else {
        fail++
        setBatchState((s) => ({ ...s, [id]: { status: 'failed', error: r.error } }))
        // A timeout means the server MAY still be generating — never start N+1.
        if (r.timedOut) { stoppedByTimeout = true; break }
      }
    }

    window.removeEventListener('beforeunload', onUnload)
    const wasCancelled = cancelRef.current
    batchRunningRef.current = false
    setBatchRunning(false)
    setSelected(new Set())
    await load(); await loadTopics() // new articles surface up top; done topics de-select
    if (stoppedByTimeout) toast.error(t.batch.stoppedTimeout)
    else if (wasCancelled) toast.success(t.batch.cancelled)
    else toast.success(t.batch.summary.replace('{ok}', String(ok)).replace('{fail}', String(fail)))
  }

  function cancelBatch() { cancelRef.current = true }

  async function retryTopic(id: string) {
    // Never overlap a batch or another retry.
    if (batchRunningRef.current || batchRunning) return
    batchRunningRef.current = true
    setBatchRunning(true) // lock the topics UI (checkboxes / single create) too
    setBatchState((s) => ({ ...s, [id]: { status: 'generating' } }))
    const r = await runOne(id)
    setBatchState((s) => ({ ...s, [id]: r.ok ? { status: 'success' } : { status: 'failed', error: r.error } }))
    batchRunningRef.current = false
    setBatchRunning(false)
    await load(); await loadTopics()
    if (r.ok) toast.success(t.batch.retrySuccess)
    else toast.error(r.error || t.rowWp.errGeneric)
  }

  // ── Batch WordPress publish/draft (top table) ──
  // Only articles that were NOT sent to WordPress yet AND aren't published can be
  // batch-exported (avoids duplicate-post/409; already-exported ones use the
  // per-row buttons). Reuses the SAME /wordpress route — no route change.
  function toggleArticleSelect(id: string) {
    setSelectedArticles((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })
  }
  function clearArticleSelection() { setSelectedArticles(new Set()) }

  // One export unit — routes by the ACTIVE platform (no confirm here; the batch confirms
  // once). Returns a normalized patch so the batch loop is platform-agnostic. 60s timeout.
  type ExportOnePatch = Partial<ArticleRow>
  async function exportOne(id: string, mode: 'publish' | 'draft'): Promise<{ ok: boolean; error?: string; patch?: ExportOnePatch; seoStatus?: string }> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 60_000)
    const publishedPatch = (extra: ExportOnePatch): ExportOnePatch => ({ ...extra, ...(mode === 'publish' ? { status: 'published', published_at: new Date().toISOString() } : {}) })
    try {
      if (activePlatform === 'shopify') {
        const res = await fetch(`/api/content/articles/${id}/shopify`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: mode }), signal: controller.signal,
        })
        const d = await res.json().catch(() => ({}))
        if (res.ok && d.ok) return { ok: true, patch: publishedPatch({ shopify_article_id: d.shopify_article_id ?? null, shopify_article_url: d.shopify_article_url ?? null, shopify_status: d.shopify_status ?? (mode === 'publish' ? 'published' : 'draft') }) }
        const reason = typeof d.reason === 'string' ? d.reason : 'unknown'
        return { ok: false, error: reason === 'no_shopify_connection' ? t.rowShopify.errNoConn : reason === 'missing_write_content_scope' ? t.rowShopify.errScope : reason === 'no_shopify_blog' ? t.rowShopify.errBlog : t.rowShopify.errGeneric }
      }
      const res = await fetch(`/api/content/articles/${id}/wordpress`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: mode, force: false }), signal: controller.signal,
      })
      const d = await res.json().catch(() => ({}))
      if (res.ok && d.wp_post_id) return { ok: true, patch: publishedPatch({ wp_post_id: d.wp_post_id, wp_post_url: d.wp_post_url ?? null }), seoStatus: typeof d.seoStatus === 'string' ? d.seoStatus : 'verified' }
      const reason = typeof d.reason === 'string' ? d.reason : 'unknown'
      return { ok: false, error: reason === 'wordpress_media_upload_failed' ? t.rowWp.errImage : reason === 'no_wordpress_connection' ? t.rowWp.errNoConn : t.rowWp.errGeneric }
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return { ok: false, error: t.batch.timeout }
      return { ok: false, error: (activePlatform === 'shopify' ? t.rowShopify.errGeneric : t.rowWp.errGeneric) }
    } finally {
      clearTimeout(timer)
    }
  }
  // A row is already exported on the active platform (skip it in batch).
  const alreadyExported = (a: ArticleRow): boolean => activePlatform === 'shopify' ? !!a.shopify_article_id || a.status === 'published' : !!a.wp_post_id || a.status === 'published'

  async function runArticleBatch(mode: 'publish' | 'draft') {
    if (articleBatchRef.current || articleBatchRunning) return // synchronous lock first
    if (activePlatform === 'conflict') { toast.error(t.rowShopify.conflict); return }
    if (activePlatform === 'none') { toast.error(t.rowShopify.setup); return }
    const ids = Array.from(selectedArticles).filter((id) => {
      const a = (data?.articles ?? []).find((x) => x.id === id)
      return !!a && !alreadyExported(a)
    })
    if (ids.length === 0) return
    if (ids.length > BATCH_LIMIT) { toast.error(t.batch.tooMany); return }
    if (mode === 'publish' && !window.confirm(activePlatform === 'shopify' ? t.rowShopify.publishConfirm : t.rowWp.publishConfirm)) return
    articleBatchRef.current = true
    cancelArticleRef.current = false
    setArticleBatchRunning(true); setArticleBatchMode(mode)
    setArticleBatchState((s) => { const next = { ...s }; ids.forEach((id) => { next[id] = { status: 'queued' } }); return next })

    const onUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', onUnload)

    let ok = 0, fail = 0, seoUnverified = 0
    for (const id of ids) {
      if (cancelArticleRef.current) break
      const a = (data?.articles ?? []).find((x) => x.id === id)
      if (!a || alreadyExported(a)) continue // changed meanwhile → skip
      setArticleBatchState((s) => ({ ...s, [id]: { status: 'running' } }))
      const r = await exportOne(id, mode)
      if (r.ok && r.patch) {
        ok++
        if (activePlatform !== 'shopify' && r.seoStatus && r.seoStatus !== 'verified' && r.seoStatus !== 'plugin_unavailable') seoUnverified++
        patchArticle(id, r.patch)
        setArticleBatchState((s) => ({ ...s, [id]: { status: 'success' } }))
      } else {
        fail++
        setArticleBatchState((s) => ({ ...s, [id]: { status: 'failed', error: r.error } }))
      }
    }

    window.removeEventListener('beforeunload', onUnload)
    const wasCancelled = cancelArticleRef.current
    articleBatchRef.current = false
    setArticleBatchRunning(false); setArticleBatchMode(null); setSelectedArticles(new Set())
    await load()
    if (wasCancelled) toast.success(t.batch.cancelled)
    else toast.success((mode === 'publish' ? t.batch.publishSummary : t.batch.draftSummary).replace('{ok}', String(ok)).replace('{fail}', String(fail)))
    // TRUTHFUL: some posts succeeded but their SEO metadata was not applied.
    if (seoUnverified > 0) toast.error(t.rowWp.seoNotVerified)
  }

  function cancelArticleBatch() { cancelArticleRef.current = true }

  const statusLabel = (s: string) =>
    (t.status as Record<string, string>)[s] ?? s

  // WordPress state for an article row (from already-saved fields).
  const wpState = (a: ArticleRow): 'published' | 'exported' | 'none' =>
    a.wp_post_id && a.status === 'published' ? 'published' : a.wp_post_id ? 'exported' : 'none'

  const statCards = counts
    ? [
        { key: 'total', label: t.stats.total, value: counts.total },
        { key: 'draft', label: t.stats.draft, value: counts.draft },
        { key: 'ready', label: t.stats.ready, value: counts.ready },
        { key: 'scheduled', label: t.stats.scheduled, value: counts.scheduled },
        { key: 'published', label: t.stats.published, value: counts.published },
        { key: 'failed', label: t.stats.failed, value: counts.failed },
      ]
    : []

  return (
    <div dir={isHebrew ? 'rtl' : 'ltr'}>
      <Header title={t.title} subtitle={t.subtitle} />

      {/* Coming-soon context banner (this is an SEO/GEO content hub) */}
      <div className="mb-4 rounded-lg border border-indigo-200 dark:border-indigo-800 bg-indigo-50/50 dark:bg-indigo-900/10 px-3 py-2 text-xs text-indigo-700 dark:text-indigo-300">
        {t.comingSoonBanner}
      </div>

      {/* No projects → empty state */}
      {!loading && projects.length === 0 ? (
        <Card className="p-10 text-center">
          <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">{t.noProjectsTitle}</p>
          <Link href="/projects/new"><Button>{t.noProjectsCta}</Button></Link>
        </Card>
      ) : (
        <>
          {/* Project selector */}
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <label className="text-sm text-slate-600 dark:text-slate-300">{t.selectProject}</label>
            <select
              value={projectId}
              onChange={onSelectProject}
              className="px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">{t.selectProjectPlaceholder}</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          {/* Tabs — only "Articles" is active in Phase 1.5 */}
          <div className="flex items-center gap-1 mb-6 border-b border-slate-200 dark:border-slate-700">
            <button
              onClick={() => setActiveTab('articles')}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition ${
                activeTab === 'articles'
                  ? 'border-indigo-600 text-indigo-700 dark:text-indigo-300'
                  : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              {t.tabs.articles}
            </button>
            {/* Scheduling now exists (automation section below) → drop its
                "coming soon" placeholder tab when the automation flag is on. */}
            {(process.env.NEXT_PUBLIC_ENABLE_CONTENT_AUTOMATION === 'true' ? (['gbpPosts'] as const) : (['gbpPosts', 'scheduled'] as const)).map((key) => (
              <span
                key={key}
                className="px-4 py-2 text-sm font-medium text-slate-400 dark:text-slate-600 cursor-not-allowed inline-flex items-center gap-1.5"
                title={t.tabs.comingSoon}
              >
                {t.tabs[key]}
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800">{t.tabs.comingSoon}</span>
              </span>
            ))}
          </div>

          {/* No project selected yet (multi-project) */}
          {!projectId ? (
            <Card className="p-10 text-center text-slate-500 dark:text-slate-400">
              {t.selectProjectMessage}
            </Card>
          ) : (
            <>
              {/* Primary action */}
              <div className="flex justify-end mb-4">
                <Button onClick={() => { setEditingTopic(null); setBriefOpen(true) }}>
                  <Plus size={16} /> {t.newTopicButton}
                </Button>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
                {statCards.map((s) => (
                  <Card key={s.key} className="p-3 hover:translate-y-0">
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 mb-1">{s.label}</div>
                    <div className="text-2xl font-bold text-slate-800 dark:text-slate-100">{s.value}</div>
                  </Card>
                ))}
              </div>

              {/* ── Section 1: generated articles ── */}
              <div className="mt-2 mb-3 border-t border-slate-200 dark:border-slate-800 pt-5">
                <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">{t.articlesHeading}</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">{t.articlesSubtitle}</p>
              </div>

              {(data?.articles?.length ?? 0) === 0 ? (
                <Card className="p-8 text-center mb-6">
                  <p className="text-sm text-slate-600 dark:text-slate-300 mb-3">{t.articlesEmptyTitle}</p>
                  <Button onClick={() => { setEditingTopic(null); setBriefOpen(true) }}><Plus size={16} /> {t.newTopicButton}</Button>
                </Card>
              ) : (
              <>
              {/* Filters */}
              <div className="flex flex-wrap gap-3 mb-3">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">{t.filters.allStatuses}</option>
                  {['draft', 'ready', 'scheduled', 'publishing', 'published', 'failed'].map((s) => (
                    <option key={s} value={s}>{statusLabel(s)}</option>
                  ))}
                </select>
                <input
                  type="text"
                  placeholder={t.filters.search}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="flex-1 max-w-xs px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Batch WordPress export bar — only when there are eligible articles. */}
              {selectableArticles.length > 0 && (
                <div className="flex flex-wrap items-center gap-3 mb-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2">
                  <label className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 cursor-pointer">
                    <input type="checkbox" checked={allArticlesSelected} onChange={toggleArticleSelectAll} disabled={articleBatchRunning} className="cursor-pointer" />
                    {t.batch.selectAll}
                  </label>
                  <span className="text-sm text-slate-600 dark:text-slate-300">{t.batch.selected.replace('{n}', String(selectedArticles.size))}</span>
                  <Button size="sm" onClick={() => runArticleBatch('publish')} loading={articleBatchRunning && articleBatchMode === 'publish'} disabled={articleBatchRunning || selectedArticles.size === 0 || selectedArticles.size > BATCH_LIMIT}>
                    {articleBatchRunning && articleBatchMode === 'publish' ? t.rowWp.publishing : t.batch.publishSelected.replace('{n}', String(selectedArticles.size))}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => runArticleBatch('draft')} loading={articleBatchRunning && articleBatchMode === 'draft'} disabled={articleBatchRunning || selectedArticles.size === 0 || selectedArticles.size > BATCH_LIMIT}>
                    {articleBatchRunning && articleBatchMode === 'draft' ? t.rowWp.sending : t.batch.draftSelected.replace('{n}', String(selectedArticles.size))}
                  </Button>
                  {articleBatchRunning ? (
                    <Button size="sm" variant="ghost" onClick={cancelArticleBatch}>{t.batch.cancel}</Button>
                  ) : (
                    selectedArticles.size > 0 && <Button size="sm" variant="ghost" onClick={clearArticleSelection}>{t.batch.clear}</Button>
                  )}
                  {selectedArticles.size > BATCH_LIMIT && <span className="text-xs text-amber-600 dark:text-amber-400">{t.batch.tooMany}</span>}
                </div>
              )}

              {/* Article table */}
              <div className="overflow-x-auto mb-6">
                <Table>
                  <TableHead>
                    <tr>
                      <Th> </Th>
                      <Th>{t.table.title}</Th>
                      <Th>{t.table.project}</Th>
                      <Th>{t.table.status}</Th>
                      <Th>{t.table.created}</Th>
                      <Th>{t.table.updated}</Th>
                      <Th>{t.table.scheduledAt}</Th>
                      <Th>{t.table.publishedAt}</Th>
                      <Th>{t.table.wordpressUrl}</Th>
                      <Th>{t.table.actions}</Th>
                    </tr>
                  </TableHead>
                  <TableBody>
                    {filteredArticles.length === 0 ? (
                      <EmptyRow colSpan={10} message={t.table.emptyTitle} />
                    ) : (
                      (articlesExpanded ? filteredArticles : filteredArticles.slice(0, 3)).map((a) => {
                        const selectableArticle = !a.wp_post_id && a.status !== 'published'
                        return (
                        <TableRow key={a.id}>
                          <Td>
                            {selectableArticle && (
                              <input
                                type="checkbox"
                                checked={selectedArticles.has(a.id)}
                                disabled={articleBatchRunning}
                                onChange={() => toggleArticleSelect(a.id)}
                                className="cursor-pointer disabled:cursor-not-allowed"
                                aria-label={t.table.title}
                              />
                            )}
                          </Td>
                          <Td><span className="font-medium">{a.title}</span></Td>
                          <Td><span className="text-sm text-slate-600 dark:text-slate-300">{selectedProject?.name ?? '—'}</span></Td>
                          <Td><Badge variant={STATUS_TONE[a.status] ?? 'neutral'}>{statusLabel(a.status)}</Badge></Td>
                          <Td><span className="text-xs text-slate-500">{formatDate(a.created_at)}</span></Td>
                          <Td><span className="text-xs text-slate-500">{formatDate(a.updated_at)}</span></Td>
                          <Td><span className="text-xs text-slate-500">{a.scheduled_at ? formatDate(a.scheduled_at) : '—'}</span></Td>
                          <Td><span className="text-xs text-slate-500">{a.published_at ? formatDate(a.published_at) : '—'}</span></Td>
                          <Td>
                            {(() => {
                              // Platform-aware publication state — a Shopify project shows Shopify
                              // status/URL and never WordPress wording.
                              if (isShopify) {
                                if (!a.shopify_article_id) return <span className="text-xs text-slate-400 dark:text-slate-500">{t.shopifyState.notSent}</span>
                                const published = a.status === 'published' || a.shopify_status === 'published'
                                return (
                                  <span className="inline-flex items-center gap-2">
                                    <Badge variant={published ? 'success' : 'neutral'}>{published ? t.shopifyState.published : t.shopifyState.exported}</Badge>
                                    {a.shopify_article_url && (
                                      <a href={a.shopify_article_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-sm inline-flex items-center gap-1">
                                        {t.shopifyState.open}<ExternalLink size={12} />
                                      </a>
                                    )}
                                  </span>
                                )
                              }
                              const s = wpState(a)
                              if (s === 'none') return <span className="text-xs text-slate-400 dark:text-slate-500">{t.wpState.notSent}</span>
                              const published = s === 'published'
                              return (
                                <span className="inline-flex items-center gap-2">
                                  <Badge variant={published ? 'success' : 'neutral'}>{published ? t.wpState.published : t.wpState.exported}</Badge>
                                  {a.wp_post_url && (
                                    <a href={a.wp_post_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-sm inline-flex items-center gap-1">
                                      {published ? t.wpState.openLive : t.wpState.openWp}<ExternalLink size={12} />
                                    </a>
                                  )}
                                </span>
                              )
                            })()}
                          </Td>
                          <Td>
                            {(() => {
                              const abs = articleBatchState[a.id]
                              if (abs && abs.status !== 'success') {
                                if (abs.status === 'running') {
                                  return (
                                    <span className="inline-flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                                      <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                      {articleBatchMode === 'publish' ? t.rowWp.publishing : t.rowWp.sending}
                                    </span>
                                  )
                                }
                                if (abs.status === 'queued') return <Badge variant="neutral">{t.batch.queued}</Badge>
                                return (
                                  <span className="inline-flex items-center gap-2">
                                    <Badge variant="danger">{t.batch.failed}</Badge>
                                    {abs.error && <span className="text-[11px] text-red-600 dark:text-red-400 max-w-[14rem] truncate" title={abs.error}>{abs.error}</span>}
                                  </span>
                                )
                              }
                              return (
                                <div className="flex flex-wrap items-center gap-2">
                                  {/* State-based publish actions — routed by the active platform
                                      (WordPress or Shopify). Hidden entirely for conflict/none. */}
                                  {activePlatform !== 'conflict' && activePlatform !== 'none' && a.status !== 'published' && (a.status === 'ready' || !!exportedIdOf(a)) && (
                                    <Button size="sm" onClick={() => exportRow(a, 'publish')} loading={rowBusy?.id === a.id && rowBusy.action === 'publish'} disabled={!!rowBusy || articleBatchRunning}>
                                      {rowBusy?.id === a.id && rowBusy.action === 'publish' ? t.rowWp.publishing : (isShopify ? t.rowShopify.publish : t.rowWp.publish)}
                                    </Button>
                                  )}
                                  {activePlatform !== 'conflict' && activePlatform !== 'none' && a.status === 'ready' && !exportedIdOf(a) && (
                                    <Button size="sm" variant="outline" onClick={() => exportRow(a, 'draft')} loading={rowBusy?.id === a.id && rowBusy.action === 'draft'} disabled={!!rowBusy || articleBatchRunning}>
                                      {rowBusy?.id === a.id && rowBusy.action === 'draft' ? t.rowWp.sending : (isShopify ? t.rowShopify.sendDraft : t.rowWp.sendDraft)}
                                    </Button>
                                  )}
                                  {a.status === 'draft' && !exportedIdOf(a) && (
                                    <Button size="sm" variant="outline" onClick={() => markReadyRow(a)} loading={rowBusy?.id === a.id && rowBusy.action === 'ready'} disabled={!!rowBusy || articleBatchRunning}>
                                      {t.rowWp.markReady}
                                    </Button>
                                  )}
                                  <Link href={`/content/articles/${a.id}`} className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline">
                                    {t.actions.edit}
                                  </Link>
                                  <button type="button" onClick={() => deleteArticle(a.id)} className="text-sm text-red-600 dark:text-red-400 hover:underline">
                                    {t.delete}
                                  </button>
                                </div>
                              )
                            })()}
                          </Td>
                        </TableRow>
                        )
                      })
                    )}
                  </TableBody>
                </Table>
                {filteredArticles.length === 0 && (
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-2 px-1">{t.table.emptyHint}</p>
                )}
                {filteredArticles.length > 3 && (
                  <div className="mt-3 px-1">
                    <button
                      type="button"
                      onClick={() => setArticlesExpanded((v) => !v)}
                      className="inline-flex items-center justify-center gap-1 rounded-full border border-indigo-200 dark:border-indigo-500/40 px-3.5 py-1.5 text-xs font-semibold text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-colors"
                    >
                      {articlesExpanded ? t.showLess : `${t.showMoreArticles} (${filteredArticles.length - 3})`}
                    </button>
                  </div>
                )}
              </div>
              </>
              )}

              {/* ── Section 2: content automation — ideas + publishing schedule
                  (flag-gated). Stands as its own group so the pending/manual
                  heading below labels only the manual list. ── */}
              {process.env.NEXT_PUBLIC_ENABLE_CONTENT_AUTOMATION === 'true' && (
                <div className="mb-8 mt-8 border-t border-slate-200 dark:border-slate-800 pt-6 space-y-4">
                  <AutomationIdeas
                    proFirst={proFirst}
                    projectId={projectId}
                    language={language}
                    onCreated={loadTopics}
                    onScheduled={handleScheduled}
                    onTopicsCreated={(created, unchecked, selected) => { if (created.length) { setNewTopicsUnchecked(unchecked ?? {}); setNewTopicsSelected(selected ?? {}); setNewTopics(created) } }}
                    onPlansSaved={(plans) => setPlanStatus((prev) => ({ ...prev, ...Object.fromEntries(plans.map((p) => [p.topicId, { exists: p.exists, linkCount: p.linkCount, approvedCount: p.approvedCount, stale: p.stale }])) }))}
                    onApproved={handleTopicsQueued}
                    onReviewLinks={handleReviewLinks}
                    planSavedHint={linkPlanSavedHint}
                    scrollCtaSignal={ctaScrollSignal}
                    queueSuccessSignal={ideasSuccessSignal}
                    onGoToQueue={() => scheduleSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                  />
                  <div ref={scheduleSectionRef} className="scroll-mt-4">
                    <AutomationSchedule
                      projectId={projectId}
                      language={language}
                      refreshKey={automationRefresh}
                      onChanged={() => { loadTopics(); setAutomationRefresh((k) => k + 1) }}
                    />
                  </div>
                </div>
              )}

              {/* ── Section 3: pending / manual article topics ── */}
              <div ref={topicsSectionRef} className="mb-8 mt-8 border-t border-slate-200 dark:border-slate-800 pt-6 scroll-mt-4">
                <div className="mb-3">
                  <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">{t.topicsHeading}</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{t.topicsSubtitle}</p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t.queueExplain}</p>
                </div>

                {/* "Review links" helper when several topics were just approved. */}
                {reviewLinksHint && (
                  <div className="mb-3 rounded-lg border border-indigo-200 dark:border-indigo-500/30 bg-indigo-50/60 dark:bg-indigo-500/10 px-3 py-2 flex flex-wrap items-start gap-2">
                    <span className="text-xs text-indigo-800 dark:text-indigo-200 flex-1 min-w-[12rem]">{t.reviewRowsHint}</span>
                    <button type="button" onClick={() => setReviewLinksHint(false)} className="text-indigo-700/70 dark:text-indigo-300/70 hover:text-indigo-900 dark:hover:text-indigo-100 text-xs">✕</button>
                  </div>
                )}
                {/* Workflow help — collapsed by default so it doesn't add standing
                    vertical weight. Wraps ONLY the help text. */}
                <details className="mb-3 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 px-3 py-2">
                  <summary className="cursor-pointer select-none text-sm font-medium text-slate-700 dark:text-slate-200">{t.topicsHelpTitle}</summary>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5">{t.topicsHelpText}</p>
                </details>

                {/* Batch action bar — only when there are topics without an article. */}
                {selectableTopics.length > 0 && (
                  <div className="flex flex-wrap items-center gap-3 mb-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2">
                    <label className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 cursor-pointer">
                      <input type="checkbox" checked={allSelectableSelected} onChange={toggleSelectAll} disabled={batchRunning} className="cursor-pointer" />
                      {t.batch.selectAll}
                    </label>
                    <span className="text-sm text-slate-600 dark:text-slate-300">{t.batch.selected.replace('{n}', String(selected.size))}</span>
                    <Button size="sm" onClick={runBatch} loading={batchRunning} disabled={batchRunning || selected.size === 0 || selected.size > BATCH_LIMIT}>
                      {batchRunning ? t.batch.running : t.batch.createSelected.replace('{n}', String(selected.size))}
                    </Button>
                    {batchRunning ? (
                      <Button size="sm" variant="ghost" onClick={cancelBatch}>{t.batch.cancel}</Button>
                    ) : (
                      selected.size > 0 && <Button size="sm" variant="ghost" onClick={clearSelection}>{t.batch.clear}</Button>
                    )}
                    {selected.size > BATCH_LIMIT && <span className="text-xs text-amber-600 dark:text-amber-400">{t.batch.tooMany}</span>}
                  </div>
                )}

                {/* Phase 2F.1 — internal-link suggestions for just-created topics.
                    Flag-gated; mounts only after topic creation (manual brief OR
                    approved automatic ideas), independent of the list's empty state. */}
                {process.env.NEXT_PUBLIC_ENABLE_INTERNAL_LINK_PLANNING === 'true' && projectId && newTopics && newTopics.length > 0 && (
                  <NewTopicsLinkPlanPanel
                    key={newTopics.map((tp) => tp.id).join(',')}
                    projectId={projectId}
                    language={language}
                    topics={newTopics}
                    initialUnchecked={newTopicsUnchecked}
                    initialSelected={newTopicsSelected}
                    onClose={() => setNewTopics(null)}
                    onEnqueue={ensurePoolAndEnqueue}
                    onGoToQueue={() => scheduleSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                    onSaved={(summaries) => setPlanStatus((prev) => {
                      const next = { ...prev }
                      for (const s of summaries) next[s.topicId] = s.summary
                      return next
                    })}
                  />
                )}
                {selectableTopics.length === 0 ? (
                  <Card className="p-8 text-center">
                    <p className="text-sm text-slate-600 dark:text-slate-300 mb-3">{t.topicsEmptyTitle}</p>
                    <Button onClick={() => { setEditingTopic(null); setBriefOpen(true) }}><Plus size={16} /> {t.newTopicButton}</Button>
                  </Card>
                ) : (
                  <>
                    <TopicsList
                      topics={selectableTopics}
                      projectId={projectId}
                      projectName={selectedProject?.name ?? '—'}
                      articleByTopic={articleByTopic}
                      onEdit={(topic) => { setEditingTopic(topic); setBriefOpen(true) }}
                      onChanged={loadTopics}
                      onToast={(kind, text) => (kind === 'success' ? toast.success(text) : toast.error(text))}
                      selectedIds={selected}
                      onToggleSelect={toggleSelect}
                      batchState={batchState}
                      batchRunning={batchRunning}
                      onRetry={retryTopic}
                      planStatus={planStatus}
                      planStatusLoading={topicsLoading}
                      onPlanStatusChange={(id, summary) => setPlanStatus((prev) => ({ ...prev, [id]: summary }))}
                      highlightIds={highlightTopicIds}
                      onReturnToQueue={handleReturnToQueue}
                      onPlanSaved={handleDrawerPlanSaved}
                      onSaveAndQueue={handleSaveAndQueue}
                    />
                  </>
                )}
              </div>

              {/* Phase 4F.1 — platform-aware card: a Shopify project shows a
                  compact Shopify status card; WordPress/neither/both show the
                  existing WordPress panel + index status unchanged. */}
              <ContentHubPlatformCard projectId={projectId}>
                {/* WordPress connection — reuse the existing self-contained panel */}
                <WordPressConnectionPanel projectId={projectId} />

                {/* Internal-link index status (Phase 2E.1) — flag-gated, read-only + manual refresh */}
                {process.env.NEXT_PUBLIC_ENABLE_INTERNAL_LINK_PLANNING === 'true' && (
                  <div className="mt-4">
                    <InternalLinkIndexStatus projectId={projectId} language={language} />
                  </div>
                )}
              </ContentHubPlatformCard>
            </>
          )}
        </>
      )}

      <ArticleBriefModal
        open={briefOpen}
        onClose={() => setBriefOpen(false)}
        projects={projects}
        defaultProjectId={projectId}
        editing={editingTopic}
        onSaved={loadTopics}
        onToast={(kind, text) => (kind === 'success' ? toast.success(text) : toast.error(text))}
        onTopicsCreated={(created) => { if (created.length) { setNewTopicsUnchecked({}); setNewTopicsSelected({}); setNewTopics(created) } }}
      />

      <ToastHost toasts={toast.toasts} dismiss={toast.dismiss} dir={isHebrew ? 'rtl' : 'ltr'} />
    </div>
  )
}
