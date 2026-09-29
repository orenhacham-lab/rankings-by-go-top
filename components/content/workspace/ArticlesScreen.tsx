'use client'

/**
 * Articles — the content workspace's first screen: what has actually been written.
 *
 * Stats, filters, the article table and its per-row / batch publish actions. It used
 * to be the top third of a 1,325-line page that also held the pending topics, the
 * automation queue, the Search Console area and the connection panels. Those are
 * their own screens now, so this file is about articles and nothing else.
 */

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { platformSetupHref } from '@/lib/content/content-hub-setup'
import { Card } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import { Table, TableHead, TableBody, TableRow, Th, Td, EmptyRow } from '@/components/ui/Table'
import ContentHubPlatformCard from '@/components/content/ContentHubPlatformCard'
import SiteHubCard from '@/components/content/site-platforms/SiteHubCard'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import { cn, formatDate } from '@/lib/utils'
import StatTile from '@/components/ui/StatTile'
import SectionHeading from '@/components/ui/SectionHeading'
import EmptyState from '@/components/ui/EmptyState'
import { TableSkeleton } from '@/components/ui/Skeleton'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Checkbox from '@/components/ui/Checkbox'
import { CheckCircle2, ChevronDown, ExternalLink, FileText, Loader2, Pencil, Plus, Search, Send, ShieldCheck, Trash2, Upload, X } from 'lucide-react'
import { resolvePublishCta } from '@/lib/content/publish-cta'
import { CitedBadge } from '@/components/content/ArticleAiVisibilityCard'
import RowMenu from '@/components/ui/RowMenu'
import DeleteConfirmDialog from '@/components/ui/DeleteConfirmDialog'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { useContentWorkspace } from './ContentWorkspaceProvider'
import { BATCH_LIMIT, STATUS_TONE, type ArticleRow } from './types'

/** Rows shown before "show more" (design contract §7). */
const ARTICLES_PAGE = 25
/** Literal column classes for the stat row, so Tailwind sees every one of them. */
const STAT_COLS: Record<number, string> = {
  1: 'sm:grid-cols-2 lg:grid-cols-4',
  2: 'sm:grid-cols-2 lg:grid-cols-4',
  3: 'sm:grid-cols-3',
  4: 'sm:grid-cols-4',
  5: 'sm:grid-cols-3 lg:grid-cols-5',
  6: 'sm:grid-cols-3 lg:grid-cols-6',
}

export default function ArticlesScreen() {
  const {
    t, projectId, data, overviewSettled, counts, toast,
    activePlatform, isShopify, isSite, exportedIdOf, load, loadTopics, patchArticle, shopifyPublishError,
    handleCreateTopic,
  } = useContentWorkspace()
  // Wix / custom-site wording (the rest of this screen's copy is the content hub's).
  const { language } = useDashboardLanguage()
  const sp = getDashboardDictionary(language).sitePlatforms
  const siteError = (code: unknown) => (sp.errors as Record<string, string>)[String(code ?? '')] ?? sp.errors.unexpected
  // Publishing goes live, so it asks first — in the app's own dialog, not the browser's.
  const { confirm, dialog: confirmDialog } = useConfirm()
  const cf = t.confirms
  const confirmPublish = (body: string) => confirm({ title: cf.publishTitle, body, confirmLabel: cf.publishAction })

  const [statusFilter, setStatusFilter] = useState('')
  const [search, setSearch] = useState('')
  const [articlesExpanded, setArticlesExpanded] = useState(false) // show the first ARTICLES_PAGE rows by default
  const [rowBusy, setRowBusy] = useState<{ id: string; action: 'publish' | 'draft' | 'ready' } | null>(null)

  // ── Batch publish/draft on the active platform (client-side, sequential) ──
  type ArticleBatchEntry = { status: 'queued' | 'running' | 'success' | 'failed'; error?: string }
  const [selectedArticles, setSelectedArticles] = useState<Set<string>>(new Set())
  const [articleBatchState, setArticleBatchState] = useState<Record<string, ArticleBatchEntry>>({})
  const [articleBatchRunning, setArticleBatchRunning] = useState(false)
  const [articleBatchMode, setArticleBatchMode] = useState<'publish' | 'draft' | null>(null)
  const articleBatchRef = useRef(false)
  const cancelArticleRef = useRef(false)

  // C9 — which published articles a stored AI citation points at (by live URL).
  const [cited, setCited] = useState<Record<string, string[]>>({})
  const articleCount = data?.articles?.length ?? 0
  useEffect(() => {
    if (!projectId || articleCount === 0) { setCited({}); return }
    let live = true
    fetch(`/api/content/citations?projectId=${encodeURIComponent(projectId)}`)
      .then((r) => (r.ok ? r.json() : { cited: {} }))
      .then((d: { cited?: Record<string, string[]> }) => { if (live) setCited(d.cited ?? {}) })
      .catch(() => { if (live) setCited({}) })
    return () => { live = false }
  }, [projectId, articleCount])

  // C1 — the same invitation as the article viewer's top bar: with no site
  // connected (or a Shopify store without the publishing scope) an unpublished
  // row offers the connect / scope-upgrade link instead of a publish button.
  const rowCta = resolvePublishCta({
    projectId,
    platform: activePlatform,
    shopifyNeedsScope: !!data?.platform?.shopifyNeedsScope,
    shopDomain: data?.shopify?.shopDomain ?? null,
  })

  // The article whose deletion is being confirmed (the "⋯" menu opens the dialog).
  const [deleting, setDeleting] = useState<ArticleRow | null>(null)
  async function deleteArticle(id: string): Promise<{ ok: boolean }> {
    try {
      const res = await fetch(`/api/content/articles/${id}`, { method: 'DELETE' })
      return { ok: res.ok }
    } catch {
      return { ok: false }
    }
  }

  // Optimistically patch one article row in local state.

  async function exportRow(a: ArticleRow, wpStatus: 'draft' | 'publish') {
    if (rowBusy) return
    // Route by the project's ACTIVE platform — a Shopify project publishes to Shopify, not
    // WordPress. Two active platforms / none are explicit states, never a misleading publish.
    if (activePlatform === 'conflict') { toast.error(t.rowShopify.conflict); return }
    if (activePlatform === 'none') { toast.error(t.rowShopify.setup); return }
    if (activePlatform === 'shopify') { await exportRowShopify(a, wpStatus); return }
    if (isSite) { await exportRowSite(a, wpStatus); return }
    if (wpStatus === 'publish' && !(await confirmPublish(t.rowWp.publishConfirm))) return
    let force = false
    if (a.wp_post_id) {
      if (!(await confirm({ title: cf.newPostTitle, body: t.rowWp.newPostConfirm, confirmLabel: cf.newPostAction }))) return
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
    if (status === 'publish' && !(await confirmPublish(t.rowShopify.publishConfirm))) return
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
      // Every KNOWN reason gets a localized sentence, in all three shapes the
      // server can produce (bare, `shopify_`-prefixed, and `code: detail`).
      // The old three-code list turned a missing default blog and a blogs
      // outage alike into "the Shopify action failed", which told the merchant
      // nothing they could act on.
      toast.error(shopifyPublishError(d.reason ?? d.error))
    } catch {
      toast.error(t.rowShopify.errGeneric)
    } finally {
      setRowBusy(null)
    }
  }

  // Wix / custom site: publish only (these platforms have no draft step).
  // Idempotent server-side: an article already on the site is reconciled.
  async function exportRowSite(a: ArticleRow, mode: 'draft' | 'publish') {
    if (mode === 'draft') { toast.error(sp.publish.draftUnsupported); return }
    if (!(await confirm({ title: sp.publish.confirm, confirmLabel: cf.publishAction }))) return
    setRowBusy({ id: a.id, action: 'publish' })
    try {
      const res = await fetch(`/api/content/articles/${a.id}/site-platform`, { method: 'POST' })
      const d = await res.json().catch(() => ({}))
      if (res.ok && d.ok) {
        patchArticle(a.id, { status: 'published', published_at: new Date().toISOString() })
        toast.success(sp.publish.published)
        load()
        return
      }
      toast.error(siteError(d.reason ?? d.error))
    } catch {
      toast.error(sp.errors.unexpected)
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

  // Area D — single-project auto-selection + persistence + URL sync are all handled
  // centrally by ActiveProjectProvider; the section only needs to change the shared

  /**
   * A row is already exported on the ACTIVE platform (skip it in batch, and do
   * not offer its checkbox). A hoisted function declaration, not a const arrow:
   * the article table computes selectability further up the render than this
   * sits, and a `const` would be in its temporal dead zone there.
   */
  function alreadyExported(a: ArticleRow): boolean {
    return activePlatform === 'shopify'
      ? !!a.shopify_article_id || a.status === 'published'
      : isSite ? a.status === 'published'
      : !!a.wp_post_id || a.status === 'published'
  }

  const filteredArticles = (data?.articles ?? []).filter((a) => {
    const matchStatus = !statusFilter || a.status === statusFilter
    const matchSearch = !search || a.title.toLowerCase().includes(search.toLowerCase())
    return matchStatus && matchSearch
  })


  // Articles eligible for batch export = not yet sent ON THE ACTIVE PLATFORM +
  // not published. `alreadyExported` is the one predicate that knows about both
  // platforms; using `wp_post_id` here left a Shopify-published article selected
  // for a batch that would immediately reject it.
  const selectableArticles = filteredArticles.filter((a) => !alreadyExported(a))
  const allArticlesSelected = selectableArticles.length > 0 && selectableArticles.every((a) => selectedArticles.has(a.id))
  function toggleArticleSelectAll() {
    setSelectedArticles(() => (allArticlesSelected ? new Set() : new Set(selectableArticles.map((a) => a.id))))
  }

  // Clear selection/batch state when the project changes.

  // Clear the batch selection when the project changes.
  useEffect(() => {
    setSelectedArticles(new Set()); setArticleBatchState({}); setArticleBatchRunning(false); setArticleBatchMode(null); cancelArticleRef.current = false
  }, [projectId])

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
      if (isSite) {
        if (mode === 'draft') return { ok: false, error: sp.publish.draftUnsupported }
        const res = await fetch(`/api/content/articles/${id}/site-platform`, { method: 'POST', signal: controller.signal })
        const d = await res.json().catch(() => ({}))
        if (res.ok && d.ok) return { ok: true, patch: publishedPatch({}) }
        return { ok: false, error: siteError(d.reason ?? d.error) }
      }
      if (activePlatform === 'shopify') {
        const res = await fetch(`/api/content/articles/${id}/shopify`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: mode }), signal: controller.signal,
        })
        const d = await res.json().catch(() => ({}))
        if (res.ok && d.ok) return { ok: true, patch: publishedPatch({ shopify_article_id: d.shopify_article_id ?? null, shopify_article_url: d.shopify_article_url ?? null, shopify_status: d.shopify_status ?? (mode === 'publish' ? 'published' : 'draft') }) }
        return { ok: false, error: shopifyPublishError(d.reason ?? d.error) }
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
      return { ok: false, error: (activePlatform === 'shopify' ? t.rowShopify.errGeneric : isSite ? sp.errors.unexpected : t.rowWp.errGeneric) }
    } finally {
      clearTimeout(timer)
    }
  }

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
    if (isSite && mode === 'draft') { toast.error(sp.publish.draftUnsupported); return }
    if (mode === 'publish') {
      // The lock is taken only after the answer, so a cancelled question leaves nothing held.
      const ok = isSite
        ? await confirm({ title: sp.publish.confirm, confirmLabel: cf.publishAction })
        : await confirmPublish(activePlatform === 'shopify' ? t.rowShopify.publishConfirm : t.rowWp.publishConfirm)
      if (!ok || articleBatchRef.current) return
    }
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
        if (activePlatform !== 'shopify' && !isSite && r.seoStatus && r.seoStatus !== 'verified' && r.seoStatus !== 'plugin_unavailable') seoUnverified++
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

  // Design contract §7: a tile that says "0" says nothing. The total always
  // shows (once there is anything at all); the per-status tiles only when they
  // count something; and with no articles the empty state below speaks instead.
  const statCards = counts && counts.total > 0
    ? [
        { key: 'total', label: t.stats.total, value: counts.total },
        { key: 'draft', label: t.stats.draft, value: counts.draft },
        { key: 'ready', label: t.stats.ready, value: counts.ready },
        { key: 'scheduled', label: t.stats.scheduled, value: counts.scheduled },
        { key: 'published', label: t.stats.published, value: counts.published },
        { key: 'failed', label: t.stats.failed, value: counts.failed },
      ].filter((c) => c.key === 'total' || c.value > 0)
    : []
  const shownArticles = articlesExpanded ? filteredArticles : filteredArticles.slice(0, ARTICLES_PAGE)
  const selectedCount = selectedArticles.size
  const someArticlesSelected = selectedCount > 0 && !allArticlesSelected


  return (
    <>
      {/* Phase 4F.1 — the platform-aware destination card. A Shopify project
          needs to see WHERE its articles publish (the queue can block on a
          missing default blog), so the card stays with the articles. What used
          to sit inside it — the WordPress and Shopify CONNECT forms — is gone
          from the content screens: connection management belongs to the
          project, and duplicating it here is what made this page a catch-all.

          It is shown only once a platform IS connected. With none connected the
          setup card above already asks for exactly that, with the same links,
          and two cards asking one question is the clutter this split removes. */}
      {/* Only once this project's overview says which platform: until then the
          platform is not known, and a guess drew the wrong card for a second. */}
      {data && activePlatform !== 'none' && (
        <div className="mb-4">
          {isSite ? <SiteHubCard projectId={projectId} /> : (
          <ContentHubPlatformCard projectId={projectId}>
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-copy text-body">{t.manageConnection}</span>
              <Link href={platformSetupHref(projectId)} className="text-copy font-medium text-action hover:underline">
                {t.manageConnectionCta}
              </Link>
            </div>
          </ContentHubPlatformCard>
          )}
        </div>
      )}

      {/* Stats: the same tile as every other screen, entering as a list. */}
      {statCards.length > 0 && (
        <div className={cn('list-enter mb-8 grid grid-cols-2 gap-4 sm:gap-5', STAT_COLS[statCards.length] ?? 'sm:grid-cols-3 lg:grid-cols-6')}>
          {statCards.map((s) => (
            <StatTile key={s.key} label={s.label} value={s.value} />
          ))}
        </div>
      )}

      {/* ── Section 1: generated articles, with the screen's primary action ── */}
      <SectionHeading
        title={t.articlesHeading}
        description={t.articlesSubtitle}
        action={<Button onClick={handleCreateTopic}><Plus aria-hidden="true" className="size-4" />{t.newTopicButton}</Button>}
      />

      {!overviewSettled ? (
        // The list's shape while this project's articles are read: never
        // "no articles yet" to a merchant whose articles are on their way.
        <div className="mb-6" data-articles-loading="">
          <TableSkeleton label={getDashboardDictionary(language).common.loading} rows={4} />
        </div>
      ) : (data?.articles?.length ?? 0) === 0 ? (
        <Card padding={false} className="mb-6">
          <EmptyState icon={<FileText />} title={t.articlesEmptyTitle} action={<Button variant="secondary" onClick={handleCreateTopic}><Plus aria-hidden="true" className="size-4" />{t.newTopicButton}</Button>} />
        </Card>
      ) : (
      <>
      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-0 flex-1 basis-56 sm:max-w-xs">
          <Search aria-hidden="true" className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <Input
            type="search"
            placeholder={t.filters.search}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label={t.filters.search}
            className="h-10 ps-9"
          />
        </div>
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          aria-label={t.filters.status}
          className="h-10 w-auto"
          options={[
            { value: '', label: t.filters.allStatuses },
            ...['draft', 'ready', 'scheduled', 'publishing', 'published', 'failed'].map((s) => ({ value: s, label: statusLabel(s) })),
          ]}
        />
      </div>

      {/* Bulk bar (design contract §7) — only while something is selected or a
          batch runs: sticky, dark, three actions at most. Select-all lives in
          the table head. */}
      {(selectedCount > 0 || articleBatchRunning) && (
        <div data-bulk-bar="" role="region" aria-label={t.batch.selected.replace('{n}', String(selectedCount))} className="sticky top-16 z-20 mb-3 flex flex-wrap items-center gap-2 rounded-inset bg-contrast px-4 py-2.5 text-contrast-ink shadow-pop motion-safe:animate-pop-in">
          <span className="me-2 text-copy font-semibold tabular-nums">{t.batch.selected.replace('{n}', String(selectedCount))}</span>
          <Button size="sm" variant="ghost" className="text-contrast-ink hover:bg-surface/10 hover:text-contrast-ink" onClick={() => runArticleBatch('publish')} loading={articleBatchRunning && articleBatchMode === 'publish'} disabled={articleBatchRunning || selectedCount === 0 || selectedCount > BATCH_LIMIT}>
            {!(articleBatchRunning && articleBatchMode === 'publish') && <Upload aria-hidden="true" className="size-4" />}
            {articleBatchRunning && articleBatchMode === 'publish' ? t.rowWp.publishing : t.batch.publishSelected.replace('{n}', String(selectedCount))}
          </Button>
          {!isSite && <Button size="sm" variant="ghost" className="text-contrast-ink hover:bg-surface/10 hover:text-contrast-ink" onClick={() => runArticleBatch('draft')} loading={articleBatchRunning && articleBatchMode === 'draft'} disabled={articleBatchRunning || selectedCount === 0 || selectedCount > BATCH_LIMIT}>
            {!(articleBatchRunning && articleBatchMode === 'draft') && <Send aria-hidden="true" className="size-4 rtl:-scale-x-100" />}
            {articleBatchRunning && articleBatchMode === 'draft' ? t.rowWp.sending : t.batch.draftSelected.replace('{n}', String(selectedCount))}
          </Button>}
          {articleBatchRunning ? (
            <Button size="sm" variant="ghost" className="ms-auto text-contrast-ink hover:bg-surface/10 hover:text-contrast-ink" onClick={cancelArticleBatch}>{t.batch.cancel}</Button>
          ) : (
            <Button size="sm" variant="ghost" className="ms-auto text-contrast-ink hover:bg-surface/10 hover:text-contrast-ink" onClick={clearArticleSelection}><X aria-hidden="true" className="size-4" />{t.batch.clear}</Button>
          )}
          {selectedCount > BATCH_LIMIT && <span className="basis-full text-caption">{t.batch.tooMany}</span>}
        </div>
      )}

      {/* Article table */}
      <div className="overflow-x-auto mb-6">
        <Table>
          <TableHead>
            <tr className="max-sm:[&>th]:px-2.5">
              <Th className="w-10">
                {selectableArticles.length > 0 && (
                  <Checkbox
                    checked={allArticlesSelected}
                    indeterminate={someArticlesSelected}
                    onChange={toggleArticleSelectAll}
                    disabled={articleBatchRunning}
                    aria-label={t.batch.selectAll}
                  />
                )}
              </Th>
              <Th>{t.table.title}</Th>
              {/* No "project / site" column: every row is the project the top bar
                  names (UX review P1-18). */}
              {/* PRIORITY COLUMNS: on a phone the row is checkbox, title (with its
                  status under it) and actions; dates and publication return as
                  the screen widens, instead of the table scrolling sideways. */}
              <Th className="hidden sm:table-cell">{t.table.status}</Th>
              <Th className="hidden md:table-cell">{t.table.created}</Th>
              <Th className="hidden xl:table-cell">{t.table.updated}</Th>
              <Th className="hidden lg:table-cell">{t.table.scheduledAt}</Th>
              <Th className="hidden lg:table-cell">{t.table.publishedAt}</Th>
              {/* The column carries the row's PUBLICATION state, which is
                  WordPress or Shopify depending on the active platform.
                  Labelling it "WordPress" for a Shopify project was simply
                  wrong; a neutral heading is used whenever the row is not
                  WordPress. */}
              <Th className="hidden md:table-cell">{isSite ? t.table.publication : isShopify ? t.table.publication : t.table.wordpressUrl}</Th>
              <Th>{t.table.actions}</Th>
            </tr>
          </TableHead>
          <TableBody>
            {filteredArticles.length === 0 ? (
              <EmptyRow colSpan={9} message={t.table.emptyTitle} />
            ) : (
              shownArticles.map((a) => {
                const selectableArticle = !alreadyExported(a)
                return (
                <TableRow key={a.id} className={cn('max-sm:[&>td]:px-2.5', selectedArticles.has(a.id) && 'bg-action-soft/60')}>
                  <Td className="w-10">
                    {selectableArticle && (
                      <Checkbox
                        checked={selectedArticles.has(a.id)}
                        disabled={articleBatchRunning}
                        onChange={() => toggleArticleSelect(a.id)}
                        aria-label={t.table.selectArticle(a.title)}
                      />
                    )}
                  </Td>
                  <Td className="min-w-[9rem] sm:min-w-[12rem]">
                    <Link href={`/content/articles/${a.id}`} className="font-medium text-ink hover:text-action hover:underline">{a.title}</Link>
                    <div className="mt-1 sm:hidden"><Badge variant={STATUS_TONE[a.status] ?? 'neutral'}>{statusLabel(a.status)}</Badge></div>
                    {a.status === 'published' && cited[a.id]?.length ? (
                      <div className="mt-1"><CitedBadge t={t.editor.aiVisibility} engines={cited[a.id]} /></div>
                    ) : null}
                  </Td>
                  <Td className="hidden sm:table-cell"><Badge variant={STATUS_TONE[a.status] ?? 'neutral'}>{statusLabel(a.status)}</Badge></Td>
                  <Td className="hidden md:table-cell"><span className="whitespace-nowrap text-caption text-muted">{formatDate(a.created_at, language)}</span></Td>
                  <Td className="hidden xl:table-cell"><span className="whitespace-nowrap text-caption text-muted">{formatDate(a.updated_at, language)}</span></Td>
                  <Td className="hidden lg:table-cell"><span className="whitespace-nowrap text-caption text-muted">{a.scheduled_at ? formatDate(a.scheduled_at, language) : '—'}</span></Td>
                  <Td className="hidden lg:table-cell"><span className="whitespace-nowrap text-caption text-muted">{a.published_at ? formatDate(a.published_at, language) : '—'}</span></Td>
                  <Td className="hidden md:table-cell">
                    {(() => {
                      // Platform-aware publication state — a Shopify project shows Shopify
                      // status/URL and never WordPress wording.
                      if (isSite) {
                        return a.status === 'published'
                          ? <Badge variant="success">{sp.publish.live}</Badge>
                          : <NotSent label={sp.publish.notSent} />
                      }
                      if (isShopify) {
                        if (!a.shopify_article_id) return <NotSent label={t.shopifyState.notSent} />
                        const published = a.status === 'published' || a.shopify_status === 'published'
                        return (
                          <span className="inline-flex items-center gap-2">
                            <Badge variant={published ? 'success' : 'neutral'}>{published ? t.shopifyState.published : t.shopifyState.exported}</Badge>
                            {a.shopify_article_url && (
                              <a href={a.shopify_article_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-control text-caption font-medium text-action hover:underline focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-action/20">
                                {t.shopifyState.open}<ExternalLink aria-hidden="true" className="size-3.5" />
                              </a>
                            )}
                          </span>
                        )
                      }
                      const s = wpState(a)
                      if (s === 'none') return <NotSent label={t.wpState.notSent} />
                      const published = s === 'published'
                      return (
                        <span className="inline-flex items-center gap-2">
                          <Badge variant={published ? 'success' : 'neutral'}>{published ? t.wpState.published : t.wpState.exported}</Badge>
                          {a.wp_post_url && (
                            <a href={a.wp_post_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-control text-caption font-medium text-action hover:underline focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-action/20">
                              {published ? t.wpState.openLive : t.wpState.openWp}<ExternalLink aria-hidden="true" className="size-3.5" />
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
                            <span className="inline-flex items-center gap-1.5 text-caption text-muted">
                              <Loader2 aria-hidden="true" className="size-4 motion-safe:animate-spin" />
                              {articleBatchMode === 'publish' ? t.rowWp.publishing : t.rowWp.sending}
                            </span>
                          )
                        }
                        if (abs.status === 'queued') return <Badge variant="neutral">{t.batch.queued}</Badge>
                        return (
                          <span className="inline-flex items-center gap-2">
                            <Badge variant="danger">{t.batch.failed}</Badge>
                            {abs.error && <span className="max-w-56 truncate text-caption text-muted" title={abs.error}>{abs.error}</span>}
                          </span>
                        )
                      }
                      // Row actions (design contract §7): at most ONE inline action,
                      // the most useful next step for this row; everything else sits
                      // behind "⋯". Every action and every condition is the same as
                      // before — only where it is drawn changed.
                      const canAct = activePlatform !== 'conflict' && activePlatform !== 'none' && rowCta.kind !== 'grant_scope' && a.status !== 'published'
                      const canPublish = canAct && (a.status === 'ready' || !!exportedIdOf(a))
                      const canSendDraft = canAct && !isSite && a.status === 'ready' && !exportedIdOf(a)
                      const canMarkReady = a.status === 'draft' && !exportedIdOf(a)
                      const busyHere = rowBusy?.id === a.id
                      const rowLocked = !!rowBusy || articleBatchRunning
                      const publishLabel = isShopify ? t.rowShopify.publish : isSite ? sp.publish.button : t.rowWp.publish
                      const draftLabel = isShopify ? t.rowShopify.sendDraft : t.rowWp.sendDraft
                      const INLINE = 'inline-flex h-8 items-center gap-1.5 rounded-control px-2.5 text-caption font-semibold text-action transition-colors duration-150 ease-snappy hover:bg-action-soft focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-action/20 sm:whitespace-nowrap'
                      // With no site connected the rows never repeat "connect the site to
                      // publish": the setup card at the top of the workspace says it once
                      // (final review R24). A draft still offers "mark ready" inline.
                      const inline = a.status !== 'published' && rowCta.kind === 'grant_scope' ? (
                        <a href={rowCta.href} data-cta="grant_scope" className={INLINE}>
                          <ShieldCheck aria-hidden="true" className="size-4" /> {t.editor.topBar.grantScope}
                        </a>
                      ) : canPublish ? (
                        <Button size="sm" variant="ghost" className="text-action hover:bg-action-soft hover:text-action" onClick={() => exportRow(a, 'publish')} loading={busyHere && rowBusy?.action === 'publish'} disabled={rowLocked}>
                          {busyHere && rowBusy?.action === 'publish' ? t.rowWp.publishing : publishLabel}
                        </Button>
                      ) : canMarkReady ? (
                        <Button size="sm" variant="ghost" className="text-action hover:bg-action-soft hover:text-action" onClick={() => markReadyRow(a)} loading={busyHere && rowBusy?.action === 'ready'} disabled={rowLocked}>
                          {t.rowWp.markReady}
                        </Button>
                      ) : null
                      const inlineIsMarkReady = !canPublish && canMarkReady && !(a.status !== 'published' && rowCta.kind === 'grant_scope')
                      const menuBusy = busyHere && (rowBusy?.action === 'draft' || (rowBusy?.action === 'ready' && !inlineIsMarkReady))
                      return (
                        <div className="flex items-center justify-end gap-1">
                          {menuBusy ? (
                            <span className="inline-flex items-center gap-1.5 text-caption text-muted">
                              <Loader2 aria-hidden="true" className="size-4 motion-safe:animate-spin" />
                              {rowBusy?.action === 'draft' ? t.rowWp.sending : t.rowWp.markReady}
                            </span>
                          ) : inline}
                          {/* Edit and delete behind "⋯" (UX review P2-3): delete opens
                              the confirmation dialog; it never deletes on the click. */}
                          <RowMenu
                            label={t.table.rowMenu(a.title)}
                            items={[
                              { key: 'edit', label: t.actions.edit, href: `/content/articles/${a.id}`, icon: <Pencil className="size-4" aria-hidden="true" /> },
                              ...(canSendDraft ? [{ key: 'draft', label: draftLabel, onSelect: () => { void exportRow(a, 'draft') }, disabled: rowLocked, icon: <Send className="size-4 rtl:-scale-x-100" aria-hidden="true" /> }] : []),
                              ...(canMarkReady && !inlineIsMarkReady ? [{ key: 'ready', label: t.rowWp.markReady, onSelect: () => { void markReadyRow(a) }, disabled: rowLocked, icon: <CheckCircle2 className="size-4" aria-hidden="true" /> }] : []),
                              { key: 'delete', label: t.delete, danger: true, onSelect: () => setDeleting(a), icon: <Trash2 className="size-4" aria-hidden="true" /> },
                            ]}
                          />
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
          <p className="mt-2 px-1 text-caption text-muted">{t.table.emptyHint}</p>
        )}
        {filteredArticles.length > ARTICLES_PAGE && (
          <div className="mt-3 px-1">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setArticlesExpanded((v) => !v)}
              aria-expanded={articlesExpanded}
            >
              {articlesExpanded ? t.showLess : `${t.showMoreArticles} (${filteredArticles.length - ARTICLES_PAGE})`}
              <ChevronDown aria-hidden="true" className={cn('size-4 transition-transform duration-150 ease-snappy', articlesExpanded && 'rotate-180')} />
            </Button>
          </div>
        )}
      </div>
      </>
      )}

      <DeleteConfirmDialog
        open={deleting !== null}
        name={deleting?.title ?? ''}
        labels={t.deleteDialog}
        onConfirm={() => (deleting ? deleteArticle(deleting.id) : Promise.resolve({ ok: false }))}
        onClose={() => setDeleting(null)}
        onDeleted={() => { load(); loadTopics(); toast.success(t.toasts.articleDeleted) }}
      />
      {confirmDialog}
    </>
  )
}

/**
 * "Not sent yet" is every new article's normal state, so it is not a badge on each
 * row (only the exceptions are: exported, published). A quiet dash keeps the column
 * aligned, and the words stay for a screen reader.
 */
function NotSent({ label }: { label: string }) {
  return <span className="text-caption text-muted" title={label}><span aria-hidden="true">—</span><span className="sr-only">{label}</span></span>
}
