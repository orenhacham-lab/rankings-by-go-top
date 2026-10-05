'use client'

/**
 * Article editor — /content/articles/[id] (Phase 3A).
 * Edit a generated draft: fields + lean TipTap body + FAQ; Save draft;
 * Mark as ready (server-gated on required anchors). No publish/schedule.
 */

import { use, useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Textarea from '@/components/ui/Textarea'
import EmptyState from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import Badge from '@/components/ui/Badge'
import BackLink from '@/components/ui/BackLink'
import Notice from '@/components/ui/Notice'
import ArticleContentEditor from '@/components/content/ArticleContentEditor'
import ArticleInlineImagesPanel from '@/components/content/ArticleInlineImagesPanel'
import ArticleBodyPreview from '@/components/content/ArticleBodyPreview'
import ArticleReadView from '@/components/content/ArticleReadView'
import WordPressPublishSettings, { type WpExportStatus } from '@/components/content/WordPressPublishSettings'
import ArticleEditorPublishGate, { usePublishPlatform } from '@/components/content/ArticleEditorPublishGate'
import ArticleTopBar, { type ArticleViewerTab } from '@/components/content/ArticleTopBar'
import ArticleSchemaPanel from '@/components/content/ArticleSchemaPanel'
import ArticleAiVisibilityCard, { CitedBadge, type ArticleVisibilityData } from '@/components/content/ArticleAiVisibilityCard'
import { articleHtmlForCopy, browserClipboardEnv, copyHtml, featuredImageFileName } from '@/lib/content/article-export'
import { injectInlineImages } from '@/lib/content/inline-images-compose'
import type { StructuredDataInput } from '@/lib/content/structured-data'
import ShopifyPublishSettings from '@/components/content/ShopifyPublishSettings'
import ArticleInternalLinkApplyPanel from '@/components/content/ArticleInternalLinkApplyPanel'
import ArticleAutoLinksCard from '@/components/content/ArticleAutoLinksCard'
import { autoLinksShown, hasAutoLinks } from '@/lib/content/auto-internal-links/entries'
import type { ComposableInlineImage } from '@/lib/content/inline-images-compose'
import { useToasts, ToastHost } from '@/components/content/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { insertInternalLink, anchorExistsInBody, isUrlAlreadyLinked } from '@/lib/content/internal-links'
import type { PlannedInternalLink } from '@/lib/content/brief-notes'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import { AlertCircle, Check, FileQuestion, TriangleAlert } from 'lucide-react'

type Faq = { question: string; answer: string }
type AuditCounts = { h2: number; h3: number; p: number; words: number; faq: number; tables: number; lists: number }
type AnchorQuality = { count: number; firstAnchorWordIndex: number; anchorTooEarly: boolean; anchorsTooClose: boolean; anchorsInSameParagraph: boolean; mechanicalAnchorPhrase: boolean }
type Audit = { score: number; blockers: string[]; warnings: string[]; counts: AuditCounts; tocReady?: boolean; anchorQuality?: AnchorQuality }

export default function ArticleEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { language, uiLocale } = useDashboardLanguage()
  const c = useMemo(() => getDashboardDictionary(uiLocale).contentHub, [uiLocale])
  const e = c.editor
  const isHebrew = language === 'he'
  const auditLabel = (code: string) => (e.auditCodes as Record<string, string>)[code] || code
  const toast = useToasts()
  const router = useRouter()
  // Every question this page asks goes through the app's own dialog, never the browser's.
  const { confirm, dialog: confirmDialog } = useConfirm()
  const cf = c.confirms

  const enabled = process.env.NEXT_PUBLIC_ENABLE_CONTENT === 'true'

  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null)
  const [projectId, setProjectId] = useState<string | null>(null)

  // Back link returns to the Content Hub for THIS article's project.
  const backHref = projectId ? `/content?projectId=${projectId}` : '/content'

  const [title, setTitle] = useState('')
  const [slug, setSlug] = useState('')
  const [metaTitle, setMetaTitle] = useState('')
  const [metaDescription, setMetaDescription] = useState('')
  const [excerpt, setExcerpt] = useState('')
  const [contentHtml, setContentHtml] = useState('')
  const [imagePrompt, setImagePrompt] = useState('')
  const [faq, setFaq] = useState<Faq[]>([])
  const [status, setStatus] = useState<'draft' | 'ready'>('draft')
  const [isPublished, setIsPublished] = useState(false)
  const [audit, setAudit] = useState<Audit | null>(null)
  const [featuredImageUrl, setFeaturedImageUrl] = useState<string | null>(null)
  const [imageBusy, setImageBusy] = useState(false)
  const [wpPostId, setWpPostId] = useState<number | null>(null)
  const [wpPostUrl, setWpPostUrl] = useState<string | null>(null)
  const [wpStatus, setWpStatus] = useState<'draft' | 'publish' | null>(null)
  const [wpBusy, setWpBusy] = useState<'draft' | 'publish' | null>(null)
  /** The article is a live post on the WordPress site (not a draft there). */
  const wpLive = !!wpPostId && wpStatus === 'publish'
  // Phase 4D — current inline-image rows (emitted by the panel) so the body
  // preview composes figures without mutating stored content_html.
  const [inlineImages, setInlineImages] = useState<ComposableInlineImage[]>([])
  // Phase 4E — WordPress taxonomy selection (loaded from the article) + the
  // taxonomy/SEO status from the latest export.
  const [wpPrimaryCategoryId, setWpPrimaryCategoryId] = useState<number | null>(null)
  const [wpCategoryIds, setWpCategoryIds] = useState<number[]>([])
  const [wpTagIds, setWpTagIds] = useState<number[]>([])
  const [wpExportStatus, setWpExportStatus] = useState<WpExportStatus>(null)
  // Phase 4F.2 — Shopify publishing selection + result (loaded from the article).
  const [shopifyBlogId, setShopifyBlogId] = useState<string | null>(null)
  const [shopifyTags, setShopifyTags] = useState<string[]>([])
  const [shopifyArticleUrl, setShopifyArticleUrl] = useState<string | null>(null)
  const [shopifyStatus, setShopifyStatus] = useState<string | null>(null)
  const [shopifyLastError, setShopifyLastError] = useState<string | null>(null)

  // Internal linking — editor is QA-only: verify each planned anchor exists and
  // insert its link. Planning/selection happens pre-generation in the brief.
  const [addedLinks, setAddedLinks] = useState<Set<string>>(new Set())
  const [plannedLinks, setPlannedLinks] = useState<PlannedInternalLink[]>([])
  // Wave 8 — the links the automatic step added at generation (internal_links_json,
  // source 'auto'). An article that has them does not need the older planned-link
  // panels below: those stay for older articles only.
  const [linksJson, setLinksJson] = useState<unknown>(null)
  const autoLinked = hasAutoLinks(linksJson)

  // Phase 2E.3 apply-panel SESSION state, lifted here so a successful apply's
  // outcome + session rollback survive the contentHtml resync re-render (the
  // panel itself may re-render/remount; this parent does not). Session-only —
  // reset on navigation/reload, never persisted.
  const [ilpApplyOutcome, setIlpApplyOutcome] = useState<{ applied: number; skipped: number; snapshotId: string | null } | null>(null)
  const [ilpRollbackAvailable, setIlpRollbackAvailable] = useState(false)
  const [ilpNotice, setIlpNotice] = useState<string | null>(null)
  // Session-only preview summary (from the last manual preview) — powers the
  // client-side "mark ready" guard. Never fetched automatically.
  const [ilpPreviewSummary, setIlpPreviewSummary] = useState<{ hasPreview: boolean; approvedLinks: number; wouldInsert: number; wouldSkip: number } | null>(null)

  // C1 / C3 / C9 — the top bar's tab, copy/download state, and the article's
  // publication facts (live URL, dates, stored AI citations, suggested question).
  const [tab, setTab] = useState<ArticleViewerTab>('article')
  // The article opens as the reader sees it; the edit form is one click away
  // and stays mounted (hidden) so its panels and unsaved edits survive.
  const [editing, setEditing] = useState(false)
  const [copying, setCopying] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [visibility, setVisibility] = useState<(ArticleVisibilityData & {
    schema: { publisherName: string | null; publisherUrl: string | null; language: 'he' | 'en'; sameAs?: string[] }
    dates: { published: string | null; modified: string | null }
  }) | null>(null)
  const detected = usePublishPlatform(projectId, !!projectId)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/content/articles/${id}`)
      if (res.status === 404) { setNotFound(true); return }
      if (!res.ok) return
      const data = await res.json()
      const a = data.article
      setProjectId(a.project_id ?? null)
      setTitle(a.title ?? '')
      setSlug(a.slug ?? '')
      setMetaTitle(a.meta_title ?? '')
      setMetaDescription(a.meta_description ?? '')
      setExcerpt(a.excerpt ?? '')
      setContentHtml(a.content_html ?? '')
      setLinksJson(Array.isArray(a.auto_internal_links) ? a.auto_internal_links : null)
      setImagePrompt(a.image_prompt ?? '')
      setFaq(Array.isArray(a.faq_json) ? a.faq_json : [])
      setStatus(a.status === 'ready' ? 'ready' : 'draft')
      setIsPublished(a.status === 'published')
      setAudit(data.audit ?? null)
      setFeaturedImageUrl(a.featured_image_url ?? null)
      setWpPostId(a.wp_post_id ?? null)
      setWpPostUrl(a.wp_post_url ?? null)
      setWpPrimaryCategoryId(typeof a.wp_primary_category_id === 'number' ? a.wp_primary_category_id : null)
      setWpCategoryIds(Array.isArray(a.wp_category_ids) ? a.wp_category_ids : [])
      setWpTagIds(Array.isArray(a.wp_tag_ids) ? a.wp_tag_ids : [])
      setShopifyBlogId(a.shopify_blog_id ?? null)
      setShopifyTags(Array.isArray(a.shopify_tags) ? a.shopify_tags : [])
      setShopifyArticleUrl(a.shopify_article_url ?? null)
      setShopifyStatus(a.shopify_status ?? null)
      setShopifyLastError(a.shopify_last_error ?? null)
      setWpStatus(a.status === 'published' ? 'publish' : a.wp_post_id != null ? 'draft' : null)
      // Load the article's approved planned internal links (editor is QA-only).
      try {
        const lr = await fetch(`/api/content/articles/${id}/internal-links`)
        if (lr.ok) {
          const ld = await lr.json()
          setPlannedLinks(Array.isArray(ld.plannedLinks) ? ld.plannedLinks : [])
        }
      } catch {
        // Non-fatal — internal links are optional.
      }
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { if (enabled) load() }, [enabled, load])

  const loadVisibility = useCallback(async () => {
    try {
      const res = await fetch(`/api/content/articles/${id}/visibility`)
      if (res.ok) setVisibility(await res.json())
    } catch { /* optional: the viewer works without it */ }
  }, [id])
  useEffect(() => { if (enabled && !loading && !notFound) void loadVisibility() }, [enabled, loading, notFound, loadVisibility])

  // Phase 2E.3: after a successful internal-link apply/rollback the server has
  // already written content_html/internal_links_json. Re-sync ONLY content_html
  // from the server so the open editor reflects it — without clobbering other
  // unsaved field edits (title/meta/faq/etc.). Uses the existing article GET.
  const linkPlanningOn = process.env.NEXT_PUBLIC_ENABLE_INTERNAL_LINK_PLANNING === 'true'
  const resyncContentHtml = useCallback(async () => {
    try {
      const res = await fetch(`/api/content/articles/${id}`)
      if (!res.ok) return
      const data = await res.json().catch(() => ({}))
      if (typeof data.article?.content_html === 'string') setContentHtml(data.article.content_html)
    } catch {
      // Non-fatal — the server write already succeeded; a manual refresh re-syncs.
    }
  }, [id])

  // ---- Planned internal links — editor QA/insertion -----------------------
  function plannedStatus(link: PlannedInternalLink): 'linked' | 'ready' | 'missing' {
    if (isUrlAlreadyLinked(contentHtml, link.targetUrl)) return 'linked'
    return anchorExistsInBody(contentHtml, link.anchorText) ? 'ready' : 'missing'
  }
  function insertPlanned(link: PlannedInternalLink) {
    const next = insertInternalLink(contentHtml, link.anchorText, link.targetUrl)
    if (!next) { setMessage({ text: e.internal.addFailed, ok: false }); return }
    setContentHtml(next)
    setAddedLinks((prev) => new Set(prev).add(`plan:${link.targetId}`))
    toast.success(e.internal.saveReminder)
    setMessage({ text: e.internal.saveReminder, ok: true })
  }
  function copyAnchor(text: string) {
    try { void navigator.clipboard?.writeText(text); toast.success(e.internal.copied) } catch { /* clipboard unavailable */ }
  }

  function bodyPayload(nextStatus?: 'draft' | 'ready') {
    return {
      title,
      slug,
      meta_title: metaTitle,
      meta_description: metaDescription,
      excerpt,
      content_html: contentHtml,
      image_prompt: imagePrompt,
      faq_json: faq.filter((f) => f.question.trim() && f.answer.trim()),
      ...(nextStatus ? { status: nextStatus } : {}),
    }
  }

  async function save(nextStatus?: 'draft' | 'ready') {
    // Client-side guard only (does NOT change ready/publish backend behavior):
    // if the last manual preview this session found approved links not yet
    // applied, confirm before marking ready. Never triggers a fetch.
    if (nextStatus === 'ready' && linkPlanningOn && !autoLinked && ilpPreviewSummary && ilpPreviewSummary.wouldInsert > 0) {
      if (!(await confirm({ title: cf.readyTitle, body: c.editor.linkApply.readyHasUnappliedConfirm, confirmLabel: e.markReady }))) return
    }
    setSaving(true)
    setMessage(null)
    try {
      const res = await fetch(`/api/content/articles/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyPayload(nextStatus)),
      })
      const data = await res.json().catch(() => ({}))
      if (res.status === 409 && data.error === 'quality_blockers') {
        setAudit(data.audit ?? null)
        setMessage({ text: e.readyBlocked, ok: false })
        return
      }
      if (!res.ok) {
        // Never the server's own error text: our sentence (design contract §8).
        setMessage({ text: e.saveError, ok: false })
        return
      }
      if (data.article?.status) setStatus(data.article.status === 'ready' ? 'ready' : 'draft')
      if (data.audit) setAudit(data.audit)
      const okText = nextStatus === 'ready' ? e.markedReady : e.saved
      setMessage({ text: okText, ok: true })
      toast.success(okText)
      // After "mark ready", return to the Content Hub for this project.
      if (nextStatus === 'ready') setTimeout(() => router.push(backHref), 900)
    } catch {
      setMessage({ text: e.saveError, ok: false })
    } finally {
      setSaving(false)
    }
  }

  async function deleteArticle() {
    if (!(await confirm({ title: cf.deleteArticleTitle, body: c.confirmDeleteArticle, confirmLabel: cf.deleteAction, tone: 'danger' }))) return
    try {
      const res = await fetch(`/api/content/articles/${id}`, { method: 'DELETE' })
      if (res.ok) { window.location.href = backHref; return }
      setMessage({ text: c.deleteFailed, ok: false })
    } catch {
      setMessage({ text: c.deleteFailed, ok: false })
    }
  }

  async function generateImage() {
    setImageBusy(true)
    setMessage(null)
    try {
      const res = await fetch(`/api/content/articles/${id}/image`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.featured_image_url) {
        setFeaturedImageUrl(data.featured_image_url)
        setMessage({ text: e.imageGenerated, ok: true })
        toast.success(e.imageGenerated)
        return
      }
      const reason = typeof data.reason === 'string' ? data.reason : 'unknown'
      setMessage({ text: (e.imageErrors as Record<string, string>)[reason] || e.imageFailed, ok: false })
    } catch {
      setMessage({ text: e.imageFailed, ok: false })
    } finally {
      setImageBusy(false)
    }
  }

  async function removeImage() {
    if (!(await confirm({ title: e.imageRemoveConfirm, confirmLabel: cf.deleteAction, tone: 'danger' }))) return
    setImageBusy(true)
    setMessage(null)
    try {
      const res = await fetch(`/api/content/articles/${id}/image`, { method: 'DELETE' })
      if (res.ok) { setFeaturedImageUrl(null); setMessage({ text: e.imageRemoved, ok: true }); toast.success(e.imageRemoved); return }
      setMessage({ text: e.imageFailed, ok: false })
    } catch {
      setMessage({ text: e.imageFailed, ok: false })
    } finally {
      setImageBusy(false)
    }
  }

  async function exportWordPress(status: 'draft' | 'publish') {
    if (wpBusy) return // one export at a time
    // A live post: "publish" updates it in place and keeps it live; "draft" would take it OFF the
    // site, so it is never a quiet click (the card offers no draft button for a live post at all).
    const wasLive = wpLive
    if (wasLive && status === 'draft') {
      if (!(await confirm({ title: e.wpUnpublishTitle, body: e.wpUnpublishConfirm, confirmLabel: e.wpUnpublishAction, tone: 'danger' }))) return
    } else if (wasLive) {
      if (!(await confirm({ title: e.wpUpdateLiveTitle, body: e.wpUpdateLiveConfirm, confirmLabel: e.wpUpdateLiveAction }))) return
    } else if (status === 'publish' && !(await confirm({ title: cf.publishTitle, body: e.wpPublishConfirm, confirmLabel: cf.publishAction }))) return
    // Phase 4E — once exported, a re-export UPDATES the same post in place
    // (idempotent: no duplicate post/taxonomy). A brand-new separate post is no
    // longer the default; the existing post is reconciled by wp_post_id.
    const isUpdate = !!wpPostId
    setWpBusy(status)
    setMessage(null)
    try {
      const res = await fetch(`/api/content/articles/${id}/wordpress`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, ...(isUpdate ? { update: true } : {}), ...(wasLive && status === 'draft' ? { unpublish: true } : {}) }),
      })
      // F — read content-type + parse the JSON body EVEN on a non-ok response, so a
      // typed { error, message, diagnosticId } is surfaced instead of a generic 500.
      const contentType = res.headers.get('content-type') || ''
      const hasJsonBody = contentType.includes('application/json')
      const data = hasJsonBody ? await res.json().catch(() => ({})) : {}
      if (!res.ok && process.env.NODE_ENV !== 'production') {
        // Safe Preview browser log — never the raw response body.
        console.warn('[content-wp-export] client failure', { status: res.status, contentType, errorCode: data.error ?? null, diagnosticId: data.diagnosticId ?? null, hasJsonBody })
      }
      if (res.ok && data.wp_post_id) {
        setWpPostId(data.wp_post_id)
        setWpPostUrl(data.wp_post_url ?? null)
        setWpStatus(data.wp_status === 'publish' ? 'publish' : 'draft')
        // Phase 4E — surface taxonomy + SEO-meta status from the export.
        setWpExportStatus({
          seoPlugin: data.seoPlugin,
          seoStatus: data.seoStatus,
          taxonomyWarning: data.taxonomyWarning,
          invalidCategoryIds: data.taxonomy?.invalidCategoryIds,
          invalidTagIds: data.taxonomy?.invalidTagIds,
        })
        let base: string = wasLive && status === 'publish' ? e.wpUpdated : status === 'publish' ? e.wpPublished : e.wpExported
        if (data.imageWarning) base = `${base} · ${e.wpImageWarn}`
        if (data.taxonomyWarning) base = `${base} · ${e.wpTax.taxonomyWarning}`
        if (data.seoStatus && data.seoStatus !== 'verified') base = `${base} · ${e.wpTax.seoMetaWarn}`
        // Phase 3E — subtle note when the article's primary keyword was added.
        if (status === 'publish' && data.keywordAdded) base = `${base} · ${e.wpKeywordAdded}`
        setMessage({ text: base, ok: true })
        toast.success(base)
        // A first publish returns to the hub; a draft or an update of the live post keeps the user here.
        if (status === 'publish' && !wasLive) setTimeout(() => router.push(backHref), 900)
        return
      }
      if (res.status === 409 && data.reason === 'already_exported') {
        setWpPostId(data.wp_post_id ?? wpPostId)
        setWpPostUrl(data.wp_post_url ?? wpPostUrl)
        setMessage({ text: e.wpAlreadyExported, ok: false })
        return
      }
      // Part 2 — prefer the route's typed, safe Hebrew message (never a generic
      // browser 500). Fall back to the local reason map for legacy reasons.
      const reason = typeof data.reason === 'string' ? data.reason : 'unknown'
      const typedMessage = typeof data.message === 'string' && data.message.trim() ? data.message : null
      const diagnosticId = typeof data.diagnosticId === 'string' ? data.diagnosticId : null
      let text = typedMessage || (e.wpErrors as Record<string, string>)[reason] || e.wpFailed
      // Show the diagnosticId when present and not already embedded in the message.
      if (diagnosticId && !text.includes(diagnosticId)) text = `${text} (${diagnosticId})`
      setMessage({ text, ok: false })
    } catch {
      setMessage({ text: e.wpFailed, ok: false })
    } finally {
      setWpBusy(null)
    }
  }

  // ---- C1: copy the article / download the featured image -----------------
  async function copyArticle() {
    setCopying(true)
    try {
      const html = articleHtmlForCopy(title, injectInlineImages(contentHtml, inlineImages, 'preview'))
      const how = await copyHtml(html, browserClipboardEnv())
      if (how === 'none') { setMessage({ text: e.topBar.copyFailed, ok: false }); return }
      toast.success(e.topBar.copied)
    } finally {
      setCopying(false)
    }
  }

  async function downloadImage() {
    if (!featuredImageUrl) return
    setDownloading(true)
    try {
      const res = await fetch(featuredImageUrl)
      if (!res.ok) throw new Error('image')
      const blob = await res.blob()
      const href = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = href
      a.download = featuredImageFileName(slug, blob.type)
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(href), 1000)
    } catch {
      // A storage host that refuses a cross-origin read: open the image instead.
      window.open(featuredImageUrl, '_blank', 'noopener,noreferrer')
      setMessage({ text: e.topBar.downloadFailed, ok: false })
    } finally {
      setDownloading(false)
    }
  }

  // The top bar's "publish": the platform's own panel owns the choices (blog,
  // draft or live, confirmation), so the bar takes the owner there.
  function goToPublish() {
    setTab('article')
    requestAnimationFrame(() => {
      const el = document.getElementById('publish')
      if (!el) return
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      el.focus({ preventScroll: true })
    })
  }

  if (!enabled) {
    return <div className="py-20 text-center text-muted text-copy">{getDashboardDictionary(uiLocale).common.notAvailable}</div>
  }
  if (loading) {
    return (
      <div role="status" aria-busy="true" className="space-y-4">
        <span className="sr-only">{e.loading}</span>
        <Skeleton className="h-16 rounded-card" />
        <Skeleton className="h-44 rounded-card" />
        <Skeleton className="h-72 rounded-card" />
      </div>
    )
  }
  if (notFound) {
    return (
      <Card padding={false}>
        <EmptyState icon={<FileQuestion />} title={e.notFound} action={<BackLink href={backHref}>{e.back}</BackLink>} />
      </Card>
    )
  }

  const publishedUrl = visibility?.publishedUrl ?? (isPublished ? (shopifyArticleUrl || wpPostUrl) : null)
  const schemaInput: StructuredDataInput = {
    headline: title,
    description: metaDescription || excerpt,
    imageUrl: featuredImageUrl,
    datePublished: visibility?.dates.published ?? null,
    dateModified: visibility?.dates.modified ?? null,
    url: publishedUrl,
    language: visibility?.schema.language ?? language,
    publisher: visibility ? { name: visibility.schema.publisherName, url: visibility.schema.publisherUrl, sameAs: visibility.schema.sameAs ?? [] } : null,
    faq,
  }

  /** The AI visibility card (a published article with visibility data). */
  const aiCard = isPublished && visibility ? (
    <div className={editing ? 'mb-4' : ''}>
      <ArticleAiVisibilityCard
        t={e.aiVisibility}
        language={language}
        projectId={projectId}
        data={visibility}
        onNotify={(text, ok) => { if (ok) toast.success(text); else setMessage({ text, ok }) }}
        onTracked={() => void loadVisibility()}
      />
    </div>
  ) : null

  /** The quality checks: on top while editing, beside the article (side panel) while reading. */
  const renderAudit = (side: boolean) => audit && (
    <Card className={side ? '' : 'mb-4'} data-audit-card={side ? 'side' : 'top'}>
      <div className={`${side ? 'mb-2' : 'mb-4'} flex items-center justify-between gap-3`}>
        <h3 className="text-section font-semibold text-ink">{e.auditTitle}</h3>
        <div className={`inline-flex items-baseline gap-1 rounded-pill px-3 py-1 ${audit.score >= 80 ? 'bg-ok-soft text-ok' : audit.score >= 55 || isPublished ? 'bg-warn-soft text-warn' : 'bg-bad-soft text-bad'}`}>
          <span className="text-section font-semibold tabular-nums">{audit.score}</span>
          <span className="text-caption">/ 100</span>
        </div>
      </div>

      {/* The article's anatomy as one compact definition list (final review R23):
          seven grey tiles made a count of lists look as weighty as the score. */}
      {/* In the side panel the score explains itself first: it measures structure, not the writing. */}
      {side && <p className="mb-3 text-caption text-muted text-pretty" data-audit-explain="">{e.auditExplain}</p>}
      <dl data-audit-counts="" className={`mb-4 grid grid-cols-2 gap-x-6 border-y border-line py-3 ${side ? '' : 'sm:grid-cols-4 lg:grid-cols-7'}`}>
        {[
          { l: e.auditWords, v: audit.counts.words },
          { l: e.auditH2, v: audit.counts.h2 },
          { l: e.auditH3, v: audit.counts.h3 },
          { l: e.auditParagraphs, v: audit.counts.p },
          { l: e.auditFaq, v: audit.counts.faq },
          { l: e.auditTables, v: audit.counts.tables },
          { l: e.auditLists, v: audit.counts.lists },
        ].map((c) => (
          <div key={c.l} className={`flex items-baseline justify-between gap-3 py-1.5 ${side ? '' : 'lg:flex-col lg:items-start lg:gap-0.5'}`}>
            <dt className="text-caption text-muted">{c.l}</dt>
            <dd className="text-copy font-semibold tabular-nums text-ink">{c.v.toLocaleString(language)}</dd>
          </div>
        ))}
      </dl>

      <p className={`mb-3 inline-flex items-center gap-1.5 text-caption ${audit.tocReady ? 'text-ok' : 'text-muted'}`}>
        {audit.tocReady && <Check aria-hidden="true" className="size-4 shrink-0" />}
        {audit.tocReady ? e.tocReady : e.tocNotReady}
      </p>

      {audit.anchorQuality && audit.anchorQuality.count > 0 && (() => {
        const aq = audit.anchorQuality
        const isBlock = aq.anchorTooEarly || aq.mechanicalAnchorPhrase
        const isWarn = aq.anchorsTooClose || aq.anchorsInSameParagraph
        const msg = aq.anchorTooEarly ? e.anchorEarly : aq.mechanicalAnchorPhrase ? e.anchorMechanical : isWarn ? e.anchorTooCloseMsg : e.anchorQualityOk
        const cls = isBlock && !isPublished ? 'text-bad' : isBlock || isWarn ? 'text-warn' : 'text-ok'
        return (
          <div className="mb-3 text-caption">
            <span className={cls}>{`${e.anchorQualityLabel}: ${msg}`}</span>
            {aq.firstAnchorWordIndex >= 0 && (
              <span className="text-muted"> · {e.anchorFirstPos}: {aq.firstAnchorWordIndex}</span>
            )}
          </div>
        )
      })()}

      {audit.blockers.length > 0 && (
        // On a published article nothing is blocked any more: the same items
        // read as advice, in the warning tone, not as a red "must fix".
        <AuditList
          tone={isPublished ? 'warn' : 'bad'}
          title={isPublished ? e.auditBlockersPublished : e.auditBlockers}
          items={audit.blockers.map((b) => auditLabel(b))}
          moreLabel={getDashboardDictionary(uiLocale).uiKit.noticeMore}
        />
      )}
      {audit.warnings.length > 0 && (
        <AuditList tone="warn" title={e.auditWarnings} items={audit.warnings.map((w) => auditLabel(w))} moreLabel={getDashboardDictionary(uiLocale).uiKit.noticeMore} />
      )}
      {audit.blockers.length === 0 && audit.warnings.length === 0 && (
        <Notice tone="ok">{e.auditAllGood}</Notice>
      )}
    </Card>
  )

  return (
    <div dir={isHebrew ? 'rtl' : 'ltr'}>
      <ArticleTopBar
        t={e.topBar}
        title={title}
        statusLabel={isPublished ? e.topBar.published : status === 'ready' ? e.statusReady : e.statusDraft}
        statusTone={isPublished ? 'success' : status === 'ready' ? 'info' : 'neutral'}
        backHref={backHref}
        projectId={projectId}
        detected={detected}
        isPublished={isPublished}
        publishedUrl={publishedUrl}
        featuredImageUrl={featuredImageUrl}
        citedBadge={visibility ? <CitedBadge t={e.aiVisibility} engines={visibility.citations.map((x) => x.engine)} /> : null}
        onPublish={goToPublish}
        onCopy={() => void copyArticle()}
        copying={copying}
        onDownloadImage={() => void downloadImage()}
        downloading={downloading}
        tab={tab}
        onTabChange={setTab}
        quiet={editing}
      />

      {message && (
        <Notice tone={message.ok ? 'ok' : 'bad'} className="mb-4" onDismiss={() => setMessage(null)}>
          {message.text}
        </Notice>
      )}

      <div id="article-panel-schema" role="tabpanel" aria-labelledby="article-tab-schema" hidden={tab !== 'schema'} className="mb-6">
        {tab === 'schema' && (
          <ArticleSchemaPanel
            t={e.schema}
            failText={e.topBar.copyFailed}
            input={schemaInput}
            isWebhook={detected.platform === 'webhook'}
            onNotify={(text, ok) => { if (ok) toast.success(text); else setMessage({ text, ok }) }}
          />
        )}
      </div>

      <div id="article-panel-article" role="tabpanel" aria-labelledby="article-tab-article" hidden={tab !== 'article'}>
      {/* Editing: the checks sit on top, as the list of what to fix while writing. */}
      {editing && aiCard}
      {editing && audit && renderAudit(false)}

      {!editing ? (
        // Reading: the article comes first. The quality checks and the AI card sit beside it on a
        // wide screen and under it on a phone, where the score explains what it measures, so a low
        // number is not read as "the article is bad" before the article itself was seen.
        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start lg:gap-6" data-article-layout="read">
          <div className="min-w-0">
            <ArticleReadView
              t={e.readView}
              faqTitle={e.faqTitle}
              title={title}
              metaTitle={metaTitle}
              metaDescription={metaDescription}
              slug={slug}
              publishedUrl={publishedUrl}
              featuredImageUrl={featuredImageUrl}
              html={contentHtml}
              images={inlineImages}
              faq={faq}
              dir={isHebrew ? 'rtl' : 'ltr'}
              onEdit={() => setEditing(true)}
              projectId={projectId}
            />
          </div>
          {(audit || aiCard || autoLinksShown(linksJson, contentHtml).length > 0) && (
            <aside aria-label={e.sidePanelLabel} className="mb-4 space-y-4 lg:sticky lg:top-24" data-article-side="">
              {audit && renderAudit(true)}
              <ArticleAutoLinksCard
                t={e.autoLinks}
                articleId={id}
                linksJson={linksJson}
                html={contentHtml}
                isPublished={isPublished}
                onRemoved={(next) => { setContentHtml(next.html); setLinksJson(next.linksJson) }}
                onNotify={(text, ok) => { if (ok) toast.success(text); else setMessage({ text, ok }) }}
              />
              {aiCard}
            </aside>
          )}
        </div>
      ) : (
        <Notice tone="info" className="mb-4" action={{ label: e.readView.done, onClick: () => setEditing(false) }}>
          {e.readView.editingNote}
        </Notice>
      )}

      <div className="space-y-4">
        <div hidden={!editing} className="space-y-4">
        <div data-editor-metadata="">
        <Card>
          <div className="space-y-3">
            <Input label={e.title} value={title} onChange={(ev) => setTitle(ev.target.value)} />
            <Input label={e.slug} value={slug} onChange={(ev) => setSlug(ev.target.value)} />
            <div>
              <Input label={e.metaTitle} value={metaTitle} onChange={(ev) => setMetaTitle(ev.target.value)} hint={`${metaTitle.length}/60 · ${e.metaTitleHint}`} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Textarea id="article-meta-description" label={e.metaDescription} value={metaDescription} onChange={(ev) => setMetaDescription(ev.target.value)} rows={2} />
              <p className="text-caption text-muted">{metaDescription.length}/155 · {e.metaDescriptionHint}</p>
            </div>
            <Textarea id="article-excerpt" label={e.excerpt} value={excerpt} onChange={(ev) => setExcerpt(ev.target.value)} rows={2} />
          </div>
        </Card>
        </div>

        <div data-editor-content="">
        <Card>
          <h3 className="mb-3 text-section font-semibold text-ink">{e.content}</h3>
          <ArticleContentEditor value={contentHtml} onChange={setContentHtml} dir={isHebrew ? 'rtl' : 'ltr'} />
        </Card>
        </div>

        <div data-editor-faq="">
        <Card>
          <div className="mb-1 flex items-center justify-between gap-3">
            <h3 className="text-section font-semibold text-ink">{e.faqTitle}</h3>
            <Button size="sm" variant="secondary" onClick={() => setFaq((p) => [...p, { question: '', answer: '' }])}>{e.addFaq}</Button>
          </div>
          <p className="text-caption text-muted mb-3">{e.faqSchemaReadyHint}</p>
          <div className="list-enter space-y-3">
            {faq.map((f, i) => (
              <div key={i} className="space-y-3 rounded-inset border border-line bg-sunk/40 p-4">
                <Input label={e.faqQuestion} value={f.question} onChange={(ev) => setFaq((p) => p.map((x, idx) => idx === i ? { ...x, question: ev.target.value } : x))} />
                <Textarea id={`article-faq-answer-${i}`} label={e.faqAnswer} value={f.answer} onChange={(ev) => setFaq((p) => p.map((x, idx) => idx === i ? { ...x, answer: ev.target.value } : x))} rows={2} />
                <Button type="button" size="sm" variant="ghost" onClick={() => setFaq((p) => p.filter((_, idx) => idx !== i))} className="text-bad hover:bg-bad-soft hover:text-bad">{e.removeFaq}</Button>
              </div>
            ))}
          </div>
        </Card>
        </div>

        <Card>
          <Input label={e.imagePrompt} value={imagePrompt} onChange={(ev) => setImagePrompt(ev.target.value)} hint={e.imagePromptHint} />
        </Card>

        {/* Featured image — generate/regenerate/remove. */}
        <div data-editor-image="">
        <Card>
          <h3 className="text-section font-semibold text-ink mb-2">{e.imageTitle}</h3>
          {featuredImageUrl ? (
            <div className="space-y-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={featuredImageUrl} alt={title} className="w-full max-h-72 object-cover rounded-control border border-line" />
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={generateImage} loading={imageBusy} disabled={imageBusy}>{imageBusy ? e.imageGenerating : e.imageRegenerate}</Button>
                <Button size="sm" variant="ghost" onClick={removeImage} disabled={imageBusy} className="text-bad">{e.imageRemove}</Button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-caption text-muted">{e.imageHint}</p>
              <Button size="sm" variant="secondary" onClick={generateImage} loading={imageBusy} disabled={imageBusy}>{imageBusy ? e.imageGenerating : e.imageGenerate}</Button>
            </div>
          )}
          <p className="text-caption text-muted mt-2">{e.imageSafetyNote}</p>
        </Card>
        </div>

        {/* Phase 4D — inline article images (in-body <figure>s, separate from the
            featured image). Manages its own rows via the inline-images API and
            emits them so the body preview below composes figures on demand. */}
        <ArticleInlineImagesPanel
          articleId={id}
          dict={e.inline}
          dir={isHebrew ? 'rtl' : 'ltr'}
          onNotify={(text, ok) => { setMessage({ text, ok }); if (ok) toast.success(text) }}
          onImagesChange={(imgs) => setInlineImages(imgs)}
        />

        {/* Read-only body preview with inline figures composed in (content_html
            itself stays image-free). Refreshes on any image add/edit/move/etc. */}
        {inlineImages.length > 0 && (
          <Card>
            <ArticleBodyPreview
              html={contentHtml}
              images={inlineImages}
              dir={isHebrew ? 'rtl' : 'ltr'}
              label={e.inline.preview}
              emptyHint={e.inline.previewEmpty}
            />
          </Card>
        )}

        </div>

        {/* Phase 4F.1 — platform gate: WordPress publishing controls render only
            for a WordPress project. A Shopify project sees an info card; neither
            → connect prompt; both → conflict. Detection uses the project's
            connection state (never the WordPress post id). */}
        <section id="publish" tabIndex={-1} aria-label={e.topBar.publish} className="scroll-mt-40 rounded-card focus:outline-none focus-visible:ring-4 focus-visible:ring-action/20">
        <ArticleEditorPublishGate
          projectId={projectId}
          articleId={id}
          detected={detected}
          shopifyPanel={projectId && (
            <ShopifyPublishSettings
              projectId={projectId}
              articleId={id}
              initialBlogId={shopifyBlogId}
              initialTags={shopifyTags}
              initialArticleUrl={shopifyArticleUrl}
              initialStatus={shopifyStatus}
              initialLastError={shopifyLastError}
            />
          )}
        >
          {/* Phase 4E — WordPress taxonomy + SEO settings (categories/tags/plugin). */}
          {projectId && (
            <WordPressPublishSettings
              projectId={projectId}
              articleId={id}
              dict={e.wpTax}
              dir={isHebrew ? 'rtl' : 'ltr'}
              initialPrimaryCategoryId={wpPrimaryCategoryId}
              initialCategoryIds={wpCategoryIds}
              initialTagIds={wpTagIds}
              lastExport={wpExportStatus}
              onNotify={(text, ok) => { setMessage({ text, ok }); if (ok) toast.success(text) }}
            />
          )}

          {/* WordPress export — draft (safe) or publish now (confirmed). */}
          <Card>
            <h3 className="text-section font-semibold text-ink mb-2">{e.wpTitle}</h3>
            {!featuredImageUrl && <Notice tone="warn" className="mb-3">{e.wpNoImageWarn}</Notice>}
            {wpLive && <p className="mb-3 text-caption text-muted" data-wp-live-note="">{e.wpLiveNote}</p>}
            <div className="flex flex-wrap items-center gap-2">
              {/* Bordered: the top bar's publish call is the page's one primary, and it leads here.
                  A live post gets ONE action, "update the live post": sending a live post as a
                  draft would take the page off the site. */}
              {wpLive ? (
                <Button size="sm" variant="secondary" onClick={() => exportWordPress('publish')} loading={wpBusy === 'publish'} disabled={!!wpBusy} data-wp-update-live="">
                  {wpBusy === 'publish' ? e.wpUpdatingLive : e.wpUpdateLive}
                </Button>
              ) : (
                <>
                  <Button size="sm" variant="secondary" onClick={() => exportWordPress('draft')} loading={wpBusy === 'draft'} disabled={!!wpBusy} data-wp-send-draft="">
                    {wpBusy === 'draft' ? e.wpSendingDraft : e.wpSendDraft}
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => exportWordPress('publish')} loading={wpBusy === 'publish'} disabled={!!wpBusy} data-wp-publish="">
                    {wpBusy === 'publish' ? e.wpPublishing : e.wpPublishNow}
                  </Button>
                </>
              )}
              {wpPostId && wpPostUrl && (
                <span className="inline-flex items-center gap-2 text-copy">
                  <Badge variant={wpStatus === 'publish' ? 'success' : 'neutral'}>{wpStatus === 'publish' ? e.wpPublishedBadge : e.wpDraftBadge}</Badge>
                  <a href={wpPostUrl} target="_blank" rel="noopener noreferrer" className="font-medium text-action hover:underline">
                    {wpStatus === 'publish' ? e.wpOpenLive : e.wpOpenDraft}
                  </a>
                </span>
              )}
            </div>
          </Card>
        </ArticleEditorPublishGate>
        </section>

        <div hidden={!editing} className="space-y-4">
        {/* Planned internal links — QA/insertion only. Hidden entirely when the
            article has no planned links (no ad-hoc suggestions here anymore). */}
        {plannedLinks.length > 0 && !autoLinked && (
          <Card>
            <h3 className="text-section font-semibold text-ink">{e.internal.planQaTitle}</h3>
            <p className="text-caption text-muted mb-2">{e.internal.planQaHint}</p>
            {isPublished && (
              <Notice tone="warn" className="mb-3">{e.internal.publishedNote}</Notice>
            )}
            <div className="space-y-2">
              {plannedLinks.map((link) => {
                const key = `plan:${link.targetId}`
                const done = addedLinks.has(key)
                const st = done ? 'linked' : plannedStatus(link)
                return (
                  <div key={key} className="space-y-1.5 rounded-inset border border-line p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="flex-1 min-w-[12rem]">
                        <div className="text-copy text-ink">{link.targetTitle}</div>
                        <span className="inline-flex items-center rounded-control bg-sunk px-2 py-0.5 text-caption text-body mt-1">
                          {e.internal.anchorLabel}: {link.anchorText}
                        </span>
                        <a href={link.targetUrl} target="_blank" rel="noopener noreferrer" dir="ltr" title={link.targetUrl} className="mt-1 block max-w-64 truncate text-start text-caption text-muted hover:text-action hover:underline">{link.targetUrl}</a>
                      </div>
                      {st === 'linked' && <Badge variant="success">{e.internal.statusLinked}</Badge>}
                      {st === 'ready' && (
                        <Button size="sm" variant="secondary" onClick={() => insertPlanned(link)}>{e.internal.addOne}</Button>
                      )}
                      {st === 'missing' && (
                        <Button size="sm" variant="ghost" onClick={() => copyAnchor(link.anchorText)}>{e.internal.copy}</Button>
                      )}
                    </div>
                    <p className={`text-caption ${st === 'missing' ? 'font-medium text-ink' : 'text-muted'}`}>
                      {st === 'ready' ? e.internal.statusReady : st === 'linked' ? e.internal.statusLinked : e.internal.statusMissing}
                    </p>
                  </div>
                )
              })}
            </div>
          </Card>
        )}

        {/* Phase 2E.3 — automation/draft apply flow (distinct from the QA card
            above). Flag-gated, collapsed by default, draft-only, manual only. */}
        {linkPlanningOn && projectId && !autoLinked && (
          <ArticleInternalLinkApplyPanel
            projectId={projectId}
            generatedArticleId={id}
            status={status}
            isPublished={isPublished}
            contentHtml={contentHtml}
            uiLocale={uiLocale}
            onContentReplaced={resyncContentHtml}
            applyOutcome={ilpApplyOutcome}
            rollbackAvailable={ilpRollbackAvailable}
            notice={ilpNotice}
            onApplyOutcomeChange={setIlpApplyOutcome}
            onRollbackAvailableChange={setIlpRollbackAvailable}
            onNoticeChange={setIlpNotice}
            onPreviewSummaryChange={setIlpPreviewSummary}
          />
        )}


        </div>

        {/* The save bar stays in reach while the editor scrolls. */}
        <div hidden={!editing} data-article-save-bar="" className="sticky bottom-4 z-10 rounded-card border border-line bg-surface/95 p-4 shadow-pop backdrop-blur-md">
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => save()} loading={saving} disabled={saving}>{saving ? e.saving : e.saveDraft}</Button>
            {/* Hidden once the article is published to WordPress — "ready" must not
                downgrade a live published article. */}
            {!isPublished && (
              <Button variant="secondary" onClick={() => save('ready')} disabled={saving || (audit ? audit.blockers.length > 0 : false)}>{e.markReady}</Button>
            )}
            <Button variant="ghost" onClick={deleteArticle} className="ms-auto text-bad hover:bg-bad-soft hover:text-bad">{c.deleteArticle}</Button>
          </div>
          {/* Client-side neutral hint — no fetch. Nudges a manual preview before
              marking ready when the planning feature is on and nothing was applied. */}
          {linkPlanningOn && !autoLinked && !isPublished && status === 'draft' && !ilpApplyOutcome && (
            <p className="mt-2 text-caption text-muted">{c.editor.linkApply.readyHint}</p>
          )}
        </div>

        {/* Single return to the project's articles. */}
        <div className="pt-4 pb-10">
          <BackLink href={backHref}>{e.backToHub}</BackLink>
        </div>
      </div>
      </div>

      <ToastHost toasts={toast.toasts} dismiss={toast.dismiss} dir={isHebrew ? 'rtl' : 'ltr'} />
      {confirmDialog}
    </div>
  )
}

/**
 * One group of quality findings (final review R3): a neutral panel on the card's own
 * surface. The tone lives only on the icon and the title, never as a tinted box, so a
 * long list of advice does not paint half the page orange. Three items show; the
 * rest open behind "N more", as in the Notice primitive.
 */
function AuditList({ tone, title, items, moreLabel }: { tone: 'warn' | 'bad'; title: string; items: string[]; moreLabel: string }) {
  const [open, setOpen] = useState(false)
  const shown = open ? items : items.slice(0, 3)
  const hidden = items.length - shown.length
  const Icon = tone === 'bad' ? AlertCircle : TriangleAlert
  return (
    <section data-audit-list={tone} className="mb-3 rounded-inset border border-line bg-surface px-4 py-3">
      <h4 className="flex items-center gap-2 text-copy font-semibold text-ink">
        <Icon aria-hidden="true" className={tone === 'bad' ? 'size-4 shrink-0 text-bad' : 'size-4 shrink-0 text-warn'} />
        {title}
      </h4>
      <ul className="mt-2 list-disc space-y-1 ps-10 text-copy text-body marker:text-muted">
        {shown.map((item, i) => <li key={i}>{item}</li>)}
      </ul>
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-1.5 ms-6 rounded-control text-caption font-semibold text-action underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-action/20"
        >
          {moreLabel.replace('{n}', String(hidden))}
        </button>
      )}
    </section>
  )
}
