'use client'

/**
 * Article editor — /content/articles/[id] (Phase 3A).
 * Edit a generated draft: fields + lean TipTap body + FAQ; Save draft;
 * Mark as ready (server-gated on required anchors). No publish/schedule.
 */

import { use, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Header from '@/components/layout/Header'
import { Card } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Badge from '@/components/ui/Badge'
import ArticleContentEditor from '@/components/content/ArticleContentEditor'
import { useToasts, ToastHost } from '@/components/content/Toast'
import { suggestInternalLinks, insertInternalLink, validateManualAnchor, type LinkCandidate, type LinkSuggestion } from '@/lib/content/internal-links'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import { AlertTriangle } from 'lucide-react'

type Faq = { question: string; answer: string }
type AuditCounts = { h2: number; h3: number; p: number; words: number; faq: number; tables: number; lists: number }
type AnchorQuality = { count: number; firstAnchorWordIndex: number; anchorTooEarly: boolean; anchorsTooClose: boolean; anchorsInSameParagraph: boolean; mechanicalAnchorPhrase: boolean }
type Audit = { score: number; blockers: string[]; warnings: string[]; counts: AuditCounts; tocReady?: boolean; anchorQuality?: AnchorQuality }

export default function ArticleEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { language } = useDashboardLanguage()
  const c = useMemo(() => getDashboardDictionary(language).contentHub, [language])
  const e = c.editor
  const isHebrew = language === 'he'
  const auditLabel = (code: string) => (e.auditCodes as Record<string, string>)[code] || code
  const toast = useToasts()
  const router = useRouter()

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

  // Internal linking (deterministic, manual). Candidates come from the server;
  // suggestions are computed client-side against the live editor content.
  const [linkCandidates, setLinkCandidates] = useState<LinkCandidate[]>([])
  const [linkSuggestions, setLinkSuggestions] = useState<LinkSuggestion[]>([])
  const [linkApproved, setLinkApproved] = useState<Set<string>>(new Set())
  const [addedLinks, setAddedLinks] = useState<Set<string>>(new Set())
  const [linksLoading, setLinksLoading] = useState(false)
  const [manualOpen, setManualOpen] = useState<Set<string>>(new Set())
  const [manualText, setManualText] = useState<Record<string, string>>({})
  const [manualError, setManualError] = useState<Record<string, string>>({})

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
      setImagePrompt(a.image_prompt ?? '')
      setFaq(Array.isArray(a.faq_json) ? a.faq_json : [])
      setStatus(a.status === 'ready' ? 'ready' : 'draft')
      setIsPublished(a.status === 'published')
      setAudit(data.audit ?? null)
      setFeaturedImageUrl(a.featured_image_url ?? null)
      setWpPostId(a.wp_post_id ?? null)
      setWpPostUrl(a.wp_post_url ?? null)
      setWpStatus(a.status === 'published' ? 'publish' : a.wp_post_id != null ? 'draft' : null)
      // Load internal-link candidates and compute suggestions against this body.
      try {
        const lr = await fetch(`/api/content/articles/${id}/internal-links`)
        if (lr.ok) {
          const ld = await lr.json()
          const cands: LinkCandidate[] = Array.isArray(ld.candidates) ? ld.candidates : []
          setLinkCandidates(cands)
          setLinkSuggestions(suggestInternalLinks(a.content_html ?? '', cands))
        }
      } catch {
        // Non-fatal — internal links are optional.
      }
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { if (enabled) load() }, [enabled, load])

  // Recompute suggestions against the current editor content (excludes anchors
  // already used and target URLs already linked in the body).
  const refreshLinks = useCallback(() => {
    setLinksLoading(true)
    try {
      setLinkSuggestions(suggestInternalLinks(contentHtml, linkCandidates))
      setLinkApproved(new Set())
    } finally {
      setLinksLoading(false)
    }
  }, [contentHtml, linkCandidates])

  function toggleApprove(targetId: string) {
    setLinkApproved((prev) => {
      const next = new Set(prev)
      if (next.has(targetId)) next.delete(targetId)
      else next.add(targetId)
      return next
    })
  }

  function insertLink(sug: LinkSuggestion): boolean {
    if (!sug.insertable || addedLinks.has(sug.targetId)) return false
    const next = insertInternalLink(contentHtml, sug.anchorText, sug.url)
    if (!next) {
      setMessage({ text: e.internal.addFailed, ok: false })
      return false
    }
    setContentHtml(next)
    setAddedLinks((prev) => new Set(prev).add(sug.targetId))
    return true
  }

  function addOneLink(sug: LinkSuggestion) {
    if (insertLink(sug)) {
      toast.success(e.internal.saveReminder)
      setMessage({ text: e.internal.saveReminder, ok: true })
    }
  }

  function addSelectedLinks() {
    let count = 0
    for (const sug of linkSuggestions) {
      if (linkApproved.has(sug.targetId) && insertLink(sug)) count++
    }
    if (count > 0) {
      const text = e.internal.addedMany.replace('{n}', String(count))
      toast.success(text)
      setMessage({ text: `${text} · ${e.internal.saveReminder}`, ok: true })
    }
  }

  function toggleManual(targetId: string) {
    setManualOpen((prev) => {
      const next = new Set(prev)
      if (next.has(targetId)) next.delete(targetId)
      else next.add(targetId)
      return next
    })
    setManualError((prev) => { const n = { ...prev }; delete n[targetId]; return n })
  }

  // Insert an editor-typed exact phrase. Same safety gate as auto anchors:
  // must be a 2–6 word content phrase present in safe prose (no headings/tables/
  // links). Never a generic single word.
  function submitManual(sug: LinkSuggestion) {
    const phrase = (manualText[sug.targetId] ?? '').trim()
    const v = validateManualAnchor(contentHtml, phrase)
    if (!v.ok) {
      const reasonMap: Record<string, string> = {
        words: e.internal.manualErrWords,
        generic: e.internal.manualErrGeneric,
        notfound: e.internal.manualErrNotfound,
      }
      setManualError((prev) => ({ ...prev, [sug.targetId]: reasonMap[v.reason ?? 'notfound'] ?? e.internal.manualErrNotfound }))
      return
    }
    const next = insertInternalLink(contentHtml, phrase, sug.url)
    if (!next) {
      setManualError((prev) => ({ ...prev, [sug.targetId]: e.internal.manualErrNotfound }))
      return
    }
    setContentHtml(next)
    setAddedLinks((prev) => new Set(prev).add(sug.targetId))
    setManualError((prev) => { const n = { ...prev }; delete n[sug.targetId]; return n })
    setManualOpen((prev) => { const n = new Set(prev); n.delete(sug.targetId); return n })
    toast.success(e.internal.saveReminder)
    setMessage({ text: e.internal.saveReminder, ok: true })
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
        setMessage({ text: data.error || e.saveError, ok: false })
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
    if (!window.confirm(c.confirmDeleteArticle)) return
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
    if (!window.confirm(e.imageRemoveConfirm)) return
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
    // Publishing goes live → confirm. Draft needs no dangerous confirmation.
    if (status === 'publish' && !window.confirm(e.wpPublishConfirm)) return
    // Already exported once → creating a NEW post requires explicit confirmation.
    let force = false
    if (wpPostId) {
      if (!window.confirm(status === 'publish' ? e.wpPublishNewConfirm : e.wpDraftNewConfirm)) return
      force = true
    }
    setWpBusy(status)
    setMessage(null)
    try {
      const res = await fetch(`/api/content/articles/${id}/wordpress`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, force }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.wp_post_id) {
        setWpPostId(data.wp_post_id)
        setWpPostUrl(data.wp_post_url ?? null)
        setWpStatus(data.wp_status === 'publish' ? 'publish' : 'draft')
        const base = status === 'publish' ? e.wpPublished : e.wpExported
        setMessage({ text: data.imageWarning ? `${base} · ${e.wpImageWarn}` : base, ok: true })
        toast.success(base)
        // Publish returns to the hub; draft keeps the user here to review/open.
        if (status === 'publish') setTimeout(() => router.push(backHref), 900)
        return
      }
      if (res.status === 409 && data.reason === 'already_exported') {
        setWpPostId(data.wp_post_id ?? wpPostId)
        setWpPostUrl(data.wp_post_url ?? wpPostUrl)
        setMessage({ text: e.wpAlreadyExported, ok: false })
        return
      }
      const reason = typeof data.reason === 'string' ? data.reason : 'unknown'
      setMessage({ text: (e.wpErrors as Record<string, string>)[reason] || e.wpFailed, ok: false })
    } catch {
      setMessage({ text: e.wpFailed, ok: false })
    } finally {
      setWpBusy(null)
    }
  }

  if (!enabled) {
    return <div className="py-20 text-center text-slate-400 text-sm">Not available.</div>
  }
  if (loading) {
    return <div className="py-20 text-center text-slate-400 text-sm">{e.loading}</div>
  }
  if (notFound) {
    return (
      <div className="py-20 text-center text-slate-500">
        <p className="mb-4">{e.notFound}</p>
        <Link href={backHref}><Button variant="outline">{e.back}</Button></Link>
      </div>
    )
  }

  const inputCls =
    'w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500'

  return (
    <div dir={isHebrew ? 'rtl' : 'ltr'}>
      <div className="flex items-center justify-between gap-3 mb-2">
        <Link href={backHref} className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline">{e.back}</Link>
        <Badge variant={status === 'ready' ? 'success' : 'neutral'}>{status === 'ready' ? e.statusReady : e.statusDraft}</Badge>
      </div>
      <Header title={title || '—'} />

      {message && (
        <div className={`mb-4 text-sm rounded-lg px-3 py-2 border ${message.ok ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-700 dark:text-green-300' : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300'}`}>
          {message.text}
        </div>
      )}

      {audit && (
        <Card className="mb-4 hover:translate-y-0">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">{e.auditTitle}</h3>
            <div className="flex items-center gap-2">
              <span className={`text-lg font-bold ${audit.score >= 80 ? 'text-green-600 dark:text-green-400' : audit.score >= 55 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'}`}>{audit.score}</span>
              <span className="text-xs text-slate-400">/ 100</span>
            </div>
          </div>

          <div className="grid grid-cols-3 sm:grid-cols-7 gap-2 mb-3 text-center">
            {[
              { l: e.auditWords, v: audit.counts.words },
              { l: 'H2', v: audit.counts.h2 },
              { l: 'H3', v: audit.counts.h3 },
              { l: e.auditParagraphs, v: audit.counts.p },
              { l: 'FAQ', v: audit.counts.faq },
              { l: e.auditTables, v: audit.counts.tables },
              { l: e.auditLists, v: audit.counts.lists },
            ].map((c) => (
              <div key={c.l} className="rounded-md bg-slate-50 dark:bg-slate-800/60 p-2">
                <div className="text-[10px] text-slate-500 dark:text-slate-400">{c.l}</div>
                <div className="text-sm font-semibold text-slate-800 dark:text-slate-100 tabular-nums">{c.v}</div>
              </div>
            ))}
          </div>

          <div className="mb-3 text-xs">
            <span className={audit.tocReady ? 'text-green-700 dark:text-green-400' : 'text-slate-500 dark:text-slate-400'}>
              {audit.tocReady ? `✓ ${e.tocReady}` : e.tocNotReady}
            </span>
          </div>

          {audit.anchorQuality && audit.anchorQuality.count > 0 && (() => {
            const aq = audit.anchorQuality
            const isBlock = aq.anchorTooEarly || aq.mechanicalAnchorPhrase
            const isWarn = aq.anchorsTooClose || aq.anchorsInSameParagraph
            const msg = aq.anchorTooEarly ? e.anchorEarly : aq.mechanicalAnchorPhrase ? e.anchorMechanical : isWarn ? e.anchorTooCloseMsg : e.anchorQualityOk
            const cls = isBlock ? 'text-red-700 dark:text-red-400' : isWarn ? 'text-amber-700 dark:text-amber-400' : 'text-green-700 dark:text-green-400'
            return (
              <div className="mb-3 text-xs">
                <span className={cls}>{`${e.anchorQualityLabel}: ${msg}`}</span>
                {aq.firstAnchorWordIndex >= 0 && (
                  <span className="text-slate-400 dark:text-slate-500"> · {e.anchorFirstPos}: {aq.firstAnchorWordIndex}</span>
                )}
              </div>
            )
          })()}

          {audit.blockers.length > 0 && (
            <div className="mb-2">
              <div className="flex items-center gap-1.5 text-sm font-medium text-red-700 dark:text-red-400 mb-1">
                <AlertTriangle size={14} /> {e.auditBlockers}
              </div>
              <ul className="text-xs text-red-600 dark:text-red-400 list-disc ps-5 space-y-0.5">
                {audit.blockers.map((b) => <li key={b}>{auditLabel(b)}</li>)}
              </ul>
            </div>
          )}
          {audit.warnings.length > 0 && (
            <div>
              <div className="text-sm font-medium text-amber-700 dark:text-amber-400 mb-1">{e.auditWarnings}</div>
              <ul className="text-xs text-amber-600 dark:text-amber-400 list-disc ps-5 space-y-0.5">
                {audit.warnings.map((w) => <li key={w}>{auditLabel(w)}</li>)}
              </ul>
            </div>
          )}
          {audit.blockers.length === 0 && audit.warnings.length === 0 && (
            <div className="text-sm text-green-700 dark:text-green-400">{e.auditAllGood}</div>
          )}
        </Card>
      )}

      <div className="space-y-4">
        <Card>
          <div className="space-y-3">
            <Input label={e.title} value={title} onChange={(ev) => setTitle(ev.target.value)} />
            <Input label={e.slug} value={slug} onChange={(ev) => setSlug(ev.target.value)} />
            <div>
              <Input label={e.metaTitle} value={metaTitle} onChange={(ev) => setMetaTitle(ev.target.value)} hint={`${metaTitle.length}/60 · ${e.metaTitleHint}`} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">{e.metaDescription}</label>
              <textarea value={metaDescription} onChange={(ev) => setMetaDescription(ev.target.value)} rows={2} className={inputCls} />
              <p className="text-xs text-slate-500 dark:text-slate-400">{metaDescription.length}/155 · {e.metaDescriptionHint}</p>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">{e.excerpt}</label>
              <textarea value={excerpt} onChange={(ev) => setExcerpt(ev.target.value)} rows={2} className={inputCls} />
            </div>
          </div>
        </Card>

        <Card>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">{e.content}</label>
          <ArticleContentEditor value={contentHtml} onChange={setContentHtml} dir={isHebrew ? 'rtl' : 'ltr'} />
        </Card>

        <Card>
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">{e.faqTitle}</h3>
            <Button size="sm" variant="outline" onClick={() => setFaq((p) => [...p, { question: '', answer: '' }])}>{e.addFaq}</Button>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">{e.faqSchemaReadyHint}</p>
          <div className="space-y-3">
            {faq.map((f, i) => (
              <div key={i} className="rounded-lg border border-slate-100 dark:border-slate-800 p-3 space-y-2">
                <Input label={e.faqQuestion} value={f.question} onChange={(ev) => setFaq((p) => p.map((x, idx) => idx === i ? { ...x, question: ev.target.value } : x))} />
                <div className="flex flex-col gap-1">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300">{e.faqAnswer}</label>
                  <textarea value={f.answer} onChange={(ev) => setFaq((p) => p.map((x, idx) => idx === i ? { ...x, answer: ev.target.value } : x))} rows={2} className={inputCls} />
                </div>
                <button type="button" onClick={() => setFaq((p) => p.filter((_, idx) => idx !== i))} className="text-xs text-red-600 dark:text-red-400 hover:underline">{e.removeFaq}</button>
              </div>
            ))}
          </div>
        </Card>

        <Card className="hover:translate-y-0">
          <Input label={e.imagePrompt} value={imagePrompt} onChange={(ev) => setImagePrompt(ev.target.value)} hint={e.imagePromptHint} />
        </Card>

        {/* Featured image — generate/regenerate/remove. */}
        <Card className="hover:translate-y-0">
          <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100 mb-2">{e.imageTitle}</h3>
          {featuredImageUrl ? (
            <div className="space-y-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={featuredImageUrl} alt={title} className="w-full max-h-72 object-cover rounded-lg border border-slate-200 dark:border-slate-700" />
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={generateImage} loading={imageBusy} disabled={imageBusy}>{imageBusy ? e.imageGenerating : e.imageRegenerate}</Button>
                <Button size="sm" variant="ghost" onClick={removeImage} disabled={imageBusy} className="text-red-600 dark:text-red-400">{e.imageRemove}</Button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-slate-500 dark:text-slate-400">{e.imageHint}</p>
              <Button size="sm" onClick={generateImage} loading={imageBusy} disabled={imageBusy}>{imageBusy ? e.imageGenerating : e.imageGenerate}</Button>
            </div>
          )}
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">{e.imageSafetyNote}</p>
        </Card>

        {/* WordPress export — draft (safe) or publish now (confirmed). */}
        <Card className="hover:translate-y-0">
          <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100 mb-2">{e.wpTitle}</h3>
          {!featuredImageUrl && <p className="text-xs text-amber-700 dark:text-amber-400 mb-2">{e.wpNoImageWarn}</p>}
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={() => exportWordPress('draft')} loading={wpBusy === 'draft'} disabled={!!wpBusy}>
              {wpBusy === 'draft' ? e.wpSendingDraft : e.wpSendDraft}
            </Button>
            <Button size="sm" variant="outline" onClick={() => exportWordPress('publish')} loading={wpBusy === 'publish'} disabled={!!wpBusy}>
              {wpBusy === 'publish' ? e.wpPublishing : e.wpPublishNow}
            </Button>
            {wpPostId && wpPostUrl && (
              <span className="inline-flex items-center gap-2 text-sm">
                <Badge variant={wpStatus === 'publish' ? 'success' : 'neutral'}>{wpStatus === 'publish' ? e.wpPublishedBadge : e.wpDraftBadge}</Badge>
                <a href={wpPostUrl} target="_blank" rel="noopener noreferrer" className="text-indigo-600 dark:text-indigo-400 hover:underline">
                  {wpStatus === 'publish' ? e.wpOpenLive : e.wpOpenDraft}
                </a>
              </span>
            )}
          </div>
        </Card>

        {/* Internal links — deterministic, manual, editor-controlled. */}
        <Card className="hover:translate-y-0">
          <div className="flex items-center justify-between gap-3 mb-1">
            <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">{e.internal.title}</h3>
            <Button size="sm" variant="ghost" onClick={refreshLinks} disabled={linksLoading}>{e.internal.refresh}</Button>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">{e.internal.hint}</p>
          {isPublished && (
            <p className="text-xs text-amber-700 dark:text-amber-400 mb-2">{e.internal.publishedNote}</p>
          )}
          {linksLoading ? (
            <p className="text-xs text-slate-400">{e.internal.loading}</p>
          ) : linkSuggestions.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400">{e.internal.none}</p>
          ) : (
            <div className="space-y-2">
              {linkSuggestions.map((sug) => {
                const done = addedLinks.has(sug.targetId)
                const manual = manualOpen.has(sug.targetId)
                return (
                  <div key={sug.targetId} className="rounded-lg border border-slate-100 dark:border-slate-800 p-3 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      {sug.insertable && !done ? (
                        <input
                          type="checkbox"
                          checked={linkApproved.has(sug.targetId)}
                          onChange={() => toggleApprove(sug.targetId)}
                          className="h-4 w-4 accent-indigo-600"
                        />
                      ) : (
                        <span className="h-4 w-4" aria-hidden />
                      )}
                      <div className="flex-1 min-w-[12rem]">
                        <div className="text-sm text-slate-800 dark:text-slate-100">{sug.targetTitle}</div>
                        <div className="flex flex-wrap items-center gap-2 mt-1">
                          {sug.insertable ? (
                            <span className="inline-flex items-center rounded-md bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[11px] text-slate-700 dark:text-slate-200">
                              {e.internal.anchorLabel}: {sug.anchorText}
                            </span>
                          ) : (
                            <span className="text-[11px] text-amber-700 dark:text-amber-400">{e.internal.noSafeAnchor}</span>
                          )}
                          {sug.weak && <Badge variant="neutral">{e.internal.weak}</Badge>}
                        </div>
                        <a href={sug.url} target="_blank" rel="noopener noreferrer" dir="ltr" className="inline-block text-left text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline break-all">{sug.url}</a>
                      </div>
                      {sug.insertable && (
                        <Button size="sm" variant="outline" onClick={() => addOneLink(sug)} disabled={done}>
                          {done ? e.internal.added : e.internal.addOne}
                        </Button>
                      )}
                      {!done && (
                        <Button size="sm" variant="ghost" onClick={() => toggleManual(sug.targetId)}>{e.internal.manualAnchor}</Button>
                      )}
                    </div>

                    {manual && !done && (
                      <div className="flex flex-wrap items-center gap-2 pl-6">
                        <input
                          type="text"
                          value={manualText[sug.targetId] ?? ''}
                          onChange={(ev) => setManualText((prev) => ({ ...prev, [sug.targetId]: ev.target.value }))}
                          placeholder={e.internal.manualPlaceholder}
                          className="flex-1 min-w-[12rem] rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-xs"
                        />
                        <Button size="sm" variant="outline" onClick={() => submitManual(sug)}>{e.internal.manualConfirm}</Button>
                        {manualError[sug.targetId] && <span className="text-[11px] text-red-600 dark:text-red-400 w-full">{manualError[sug.targetId]}</span>}
                      </div>
                    )}

                    {(sug.debug.found.length > 0 || sug.debug.rejected.length > 0) && (
                      <details className="pl-6">
                        <summary className="text-[11px] text-slate-400 cursor-pointer select-none">{e.internal.debugTitle}</summary>
                        <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 space-y-0.5" dir="auto">
                          <div>{e.internal.debugSelected}: {sug.debug.selected ? <span className="text-slate-700 dark:text-slate-200">{sug.debug.selected}</span> : e.internal.debugNone}</div>
                          {sug.debug.found.length > 0 && <div>{e.internal.debugFound}: {sug.debug.found.join(' · ')}</div>}
                          {sug.debug.rejected.length > 0 && <div>{e.internal.debugRejected}: {sug.debug.rejected.map((r) => `${r.phrase} (${r.reason})`).join(' · ')}</div>}
                        </div>
                      </details>
                    )}
                  </div>
                )
              })}
              <div className="flex items-center gap-3 pt-1">
                <Button size="sm" onClick={addSelectedLinks} disabled={linkApproved.size === 0}>
                  {e.internal.addSelected} ({linkApproved.size})
                </Button>
                {addedLinks.size > 0 && <span className="text-xs text-slate-500 dark:text-slate-400">{e.internal.saveReminder}</span>}
              </div>
            </div>
          )}
        </Card>

        <div className="flex flex-wrap items-center gap-2 pb-8">
          <Button onClick={() => save()} loading={saving} disabled={saving}>{saving ? e.saving : e.saveDraft}</Button>
          {/* Hidden once the article is published to WordPress — "ready" must not
              downgrade a live published article. */}
          {!isPublished && (
            <Button variant="outline" onClick={() => save('ready')} disabled={saving || (audit ? audit.blockers.length > 0 : false)}>{e.markReady}</Button>
          )}
          <Button variant="ghost" onClick={deleteArticle} className="text-red-600 dark:text-red-400">{c.deleteArticle}</Button>
        </div>

        {/* Single, prominent return to the Content Hub for this project. */}
        <div className="pb-10">
          <Link href={backHref} className="block">
            <Button variant="outline" className="w-full sm:w-auto">{e.backToHub}</Button>
          </Link>
        </div>
      </div>

      <ToastHost toasts={toast.toasts} dismiss={toast.dismiss} dir={isHebrew ? 'rtl' : 'ltr'} />
    </div>
  )
}
