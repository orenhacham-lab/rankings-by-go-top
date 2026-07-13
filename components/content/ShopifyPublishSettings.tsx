'use client'

/**
 * Phase 4F.2 — Shopify Blog Article publishing panel (article editor).
 *
 * Shows the connected store + publishing-permission status, an "Authorize
 * publishing" CTA when write_content is missing, a target-blog selector, tags,
 * draft/published choice + optional publish date, and the latest Shopify status
 * / URL / error. Actions create-or-update the SAME article idempotently. No raw
 * tokens/GIDs shown beyond the selector value. WordPress UI is untouched.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Badge from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'

type Blog = { id: string; title: string; handle: string }
type Conn = { shop_domain: string; can_publish: boolean; granted_scopes: string[] } | null

export default function ShopifyPublishSettings({
  projectId, articleId,
  initialBlogId, initialTags, initialArticleUrl, initialStatus, initialLastError,
}: {
  projectId: string
  articleId: string
  initialBlogId: string | null
  initialTags: string[]
  initialArticleUrl: string | null
  initialStatus: string | null
  initialLastError: string | null
}) {
  const { language } = useDashboardLanguage()
  const t = useMemo(() => getDashboardDictionary(language).contentHub.editor.shopifyPublish, [language])
  const dir: 'rtl' | 'ltr' = language === 'he' ? 'rtl' : 'ltr'

  const [conn, setConn] = useState<Conn>(null)
  const [loading, setLoading] = useState(true)
  const [blogs, setBlogs] = useState<Blog[]>([])
  const [blogsError, setBlogsError] = useState<string | null>(null)
  const [blogId, setBlogId] = useState<string>(initialBlogId ?? '')
  const [tags, setTags] = useState<string>((initialTags ?? []).join(', '))
  const [publishDate, setPublishDate] = useState<string>('')
  const [saving, setSaving] = useState(false)
  const [busy, setBusy] = useState<'draft' | 'publish' | 'update' | null>(null)
  const [status, setStatus] = useState<string | null>(initialStatus)
  const [articleUrl, setArticleUrl] = useState<string | null>(initialArticleUrl)
  const [lastError, setLastError] = useState<string | null>(initialLastError)
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null)

  const canPublish = !!conn?.can_publish
  const hasArticle = !!articleUrl || status === 'draft' || status === 'published'

  const mapErr = useCallback((code: unknown): string => {
    const k = String(code || '')
    return (t.errors as Record<string, string>)[k] || t.errors.exact_failure
  }, [t])

  const loadConn = useCallback(async () => {
    try {
      const res = await fetch(`/api/shopify/connection?projectId=${projectId}`)
      const data = res.ok ? await res.json().catch(() => ({})) : {}
      setConn(data.connection ?? null)
    } catch { /* leave */ } finally { setLoading(false) }
  }, [projectId])

  const loadBlogs = useCallback(async () => {
    setBlogsError(null)
    try {
      const res = await fetch(`/api/shopify/blogs?projectId=${projectId}`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setBlogsError(mapErr(data.reason || data.error)); return }
      const list: Blog[] = Array.isArray(data.blogs) ? data.blogs : []
      setBlogs(list)
      // One blog → preselect it (still shown by name).
      if (list.length === 1 && !blogId) setBlogId(list[0].id)
    } catch { setBlogsError(t.errors.exact_failure) }
  }, [projectId, blogId, mapErr, t])

  useEffect(() => { loadConn() }, [loadConn])
  useEffect(() => { if (canPublish) loadBlogs() }, [canPublish, loadBlogs])

  function authorize() {
    if (!conn) return
    window.location.href = `/api/shopify/oauth/start?projectId=${encodeURIComponent(projectId)}&shop=${encodeURIComponent(conn.shop_domain)}&intent=publish`
  }

  async function saveSelection() {
    setSaving(true); setMessage(null)
    try {
      const res = await fetch(`/api/content/articles/${articleId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shopify_blog_id: blogId || null, shopify_tags: tags.split(',').map((s) => s.trim()).filter(Boolean) }),
      })
      setMessage(res.ok ? { text: t.saved, ok: true } : { text: t.saveError, ok: false })
    } catch { setMessage({ text: t.saveError, ok: false }) } finally { setSaving(false) }
  }

  async function publish(kind: 'draft' | 'publish' | 'update') {
    if (!blogId) { setMessage({ text: t.errors.no_shopify_blog, ok: false }); return }
    // Persist the current selection first so the server uses the chosen blog/tags.
    await saveSelection()
    setBusy(kind); setMessage(null)
    try {
      const statusParam = kind === 'draft' ? 'draft' : 'publish'
      const res = await fetch(`/api/content/articles/${articleId}/shopify`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: statusParam, ...(publishDate ? { publishDate } : {}) }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.ok) {
        setStatus(data.shopify_status ?? statusParam)
        setArticleUrl(data.shopify_article_url ?? null)
        setLastError(null)
        let text: string = kind === 'update' ? t.updated : (statusParam === 'publish' ? t.published : t.draftSent)
        if (Array.isArray(data.imageWarnings) && data.imageWarnings.length) text = `${text} · ${t.imageWarn}`
        setMessage({ text, ok: true })
      } else {
        const detail = typeof data.detail === 'string' && data.detail ? ` (${data.detail.slice(0, 160)})` : ''
        setLastError(mapErr(data.reason || data.error) + detail)
        setMessage({ text: mapErr(data.reason || data.error) + detail, ok: false })
      }
    } catch { setMessage({ text: t.errors.exact_failure, ok: false }) } finally { setBusy(null) }
  }

  if (loading) return <Card className="hover:translate-y-0"><p className="text-xs text-slate-400">{t.loading}</p></Card>

  return (
    <Card className="hover:translate-y-0">
      <div className="flex items-center justify-between gap-2 mb-2" dir={dir}>
        <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">{t.title}</h3>
        <Badge variant={canPublish ? 'success' : 'warning'}>{canPublish ? t.canPublish : t.readOnly}</Badge>
      </div>

      <div className="text-sm text-slate-700 dark:text-slate-200 mb-3" dir={dir}>{conn?.shop_domain}</div>

      {!canPublish ? (
        // write_content missing → clear CTA. Read-only connection stays usable.
        <div className="space-y-2" dir={dir}>
          <p className="text-sm text-amber-700 dark:text-amber-400">{t.needWriteScope}</p>
          <Button size="sm" onClick={authorize}>{t.authorize}</Button>
        </div>
      ) : (
        <div className="space-y-3" dir={dir}>
          {/* Target blog */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-600 dark:text-slate-300">{t.targetBlog}</label>
            {blogsError ? (
              <p className="text-xs text-amber-700 dark:text-amber-400">{blogsError}</p>
            ) : blogs.length === 0 ? (
              <p className="text-xs text-amber-700 dark:text-amber-400">{t.errors.no_shopify_blog}</p>
            ) : blogs.length === 1 ? (
              <div className="text-sm text-slate-700 dark:text-slate-200">{blogs[0].title}</div>
            ) : (
              <select value={blogId} onChange={(e) => setBlogId(e.target.value)} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">
                <option value="">{t.selectBlog}</option>
                {blogs.map((b) => <option key={b.id} value={b.id}>{b.title}</option>)}
              </select>
            )}
          </div>

          <Input label={t.tags} placeholder={t.tagsPlaceholder} value={tags} onChange={(e) => setTags(e.target.value)} />
          <Input label={t.publishDate} type="date" value={publishDate} onChange={(e) => setPublishDate(e.target.value)} />

          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={saveSelection} loading={saving} disabled={saving}>{t.saveSelection}</Button>
          </div>

          <div className="flex flex-wrap gap-2 pt-1 border-t border-slate-100 dark:border-slate-800">
            {!hasArticle ? (
              <>
                <Button size="sm" onClick={() => publish('draft')} loading={busy === 'draft'} disabled={!!busy || !blogId}>{t.sendDraft}</Button>
                <Button size="sm" variant="outline" onClick={() => publish('publish')} loading={busy === 'publish'} disabled={!!busy || !blogId}>{t.publishNow}</Button>
              </>
            ) : (
              <>
                <Button size="sm" onClick={() => publish('update')} loading={busy === 'update'} disabled={!!busy || !blogId}>{t.updateArticle}</Button>
                <Button size="sm" variant="outline" onClick={() => publish('publish')} loading={busy === 'publish'} disabled={!!busy || !blogId}>{t.publishNow}</Button>
              </>
            )}
            {status && <Badge variant={status === 'published' ? 'success' : status === 'remote_missing' ? 'danger' : 'neutral'}>{(t.status as Record<string, string>)[status] || status}</Badge>}
            {articleUrl && <a href={articleUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline self-center">{t.openArticle}</a>}
          </div>

          {lastError && <p className="text-xs text-red-600 dark:text-red-400">{lastError}</p>}
        </div>
      )}

      {message && <p className={`mt-2 text-xs ${message.ok ? 'text-green-700 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>{message.text}</p>}
    </Card>
  )
}
