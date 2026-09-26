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
import { Card } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import { Table, TableHead, TableBody, TableRow, Th, Td, EmptyRow } from '@/components/ui/Table'
import ContentHubPlatformCard from '@/components/content/ContentHubPlatformCard'
import { formatDate } from '@/lib/utils'
import { ExternalLink, Plus } from 'lucide-react'
import { useContentWorkspace } from './ContentWorkspaceProvider'
import { BATCH_LIMIT, STATUS_TONE, type ArticleRow } from './types'

export default function ArticlesScreen() {
  const {
    t, projectId, data, counts, toast, selectedProject,
    activePlatform, isShopify, exportedIdOf, load, loadTopics, patchArticle, shopifyPublishError,
    handleCreateTopic,
  } = useContentWorkspace()

  const [statusFilter, setStatusFilter] = useState('')
  const [search, setSearch] = useState('')
  const [articlesExpanded, setArticlesExpanded] = useState(false) // show first 3 by default
  const [rowBusy, setRowBusy] = useState<{ id: string; action: 'publish' | 'draft' | 'ready' } | null>(null)

  // ── Batch publish/draft on the active platform (client-side, sequential) ──
  type ArticleBatchEntry = { status: 'queued' | 'running' | 'success' | 'failed'; error?: string }
  const [selectedArticles, setSelectedArticles] = useState<Set<string>>(new Set())
  const [articleBatchState, setArticleBatchState] = useState<Record<string, ArticleBatchEntry>>({})
  const [articleBatchRunning, setArticleBatchRunning] = useState(false)
  const [articleBatchMode, setArticleBatchMode] = useState<'publish' | 'draft' | null>(null)
  const articleBatchRef = useRef(false)
  const cancelArticleRef = useRef(false)

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
      return { ok: false, error: (activePlatform === 'shopify' ? t.rowShopify.errGeneric : t.rowWp.errGeneric) }
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
      {activePlatform !== 'none' && (
        <div className="mb-4">
          <ContentHubPlatformCard projectId={projectId}>
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm text-slate-600 dark:text-slate-300">{t.manageConnection}</span>
              <Link href={`/projects/${projectId}#content-section`} className="text-sm font-medium text-indigo-700 dark:text-indigo-300 hover:underline">
                {t.manageConnectionCta}
              </Link>
            </div>
          </ContentHubPlatformCard>
        </div>
      )}

      {/* Primary action */}
      <div className="flex justify-end mb-4">
        <Button onClick={handleCreateTopic}>
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
          <Button onClick={handleCreateTopic}><Plus size={16} /> {t.newTopicButton}</Button>
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
              {/* The column carries the row's PUBLICATION state, which is
                  WordPress or Shopify depending on the active platform.
                  Labelling it "WordPress" for a Shopify project was simply
                  wrong; a neutral heading is used whenever the row is not
                  WordPress. */}
              <Th>{isShopify ? t.table.publication : t.table.wordpressUrl}</Th>
              <Th>{t.table.actions}</Th>
            </tr>
          </TableHead>
          <TableBody>
            {filteredArticles.length === 0 ? (
              <EmptyRow colSpan={10} message={t.table.emptyTitle} />
            ) : (
              (articlesExpanded ? filteredArticles : filteredArticles.slice(0, 3)).map((a) => {
                const selectableArticle = !alreadyExported(a)
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
    </>
  )
}
