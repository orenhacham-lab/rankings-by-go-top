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
import { publishErrorKey } from '@/lib/shopify/publish-error-display'

type Blog = { id: string; title: string; handle: string }
type Conn = { shop_domain: string; can_publish: boolean; granted_scopes: string[]; default_blog_id: string | null } | null

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
  const { language, uiLocale } = useDashboardLanguage()
  const t = useMemo(() => getDashboardDictionary(uiLocale).contentHub.editor.shopifyPublish, [uiLocale])
  const dir: 'rtl' | 'ltr' = language === 'he' ? 'rtl' : 'ltr'

  const [conn, setConn] = useState<Conn>(null)
  const [loading, setLoading] = useState(true)
  const [blogs, setBlogs] = useState<Blog[]>([])
  const [blogsError, setBlogsError] = useState<string | null>(null)
  const [blogId, setBlogId] = useState<string>(initialBlogId ?? '')
  const [usingDefault, setUsingDefault] = useState(false)
  const [tags, setTags] = useState<string>((initialTags ?? []).join(', '))
  const [publishDate, setPublishDate] = useState<string>('')
  const [saving, setSaving] = useState(false)
  const [busy, setBusy] = useState<'draft' | 'publish' | 'update' | null>(null)
  const [status, setStatus] = useState<string | null>(initialStatus)
  const [articleUrl, setArticleUrl] = useState<string | null>(initialArticleUrl)
  // The stored value is a diagnostic code; show its translation, never the raw text.
  const [lastError, setLastError] = useState<string | null>(
    initialLastError ? ((t.errors as Record<string, string>)[publishErrorKey(initialLastError) ?? ''] || t.errors.exact_failure) : null,
  )
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
      // Effective blog when the article has no explicit selection: the project
      // default (if set), else the single blog. The article override always wins.
      if (!blogId) {
        const fallback = (conn?.default_blog_id && list.some((b) => b.id === conn.default_blog_id)) ? conn.default_blog_id : (list.length === 1 ? list[0].id : '')
        if (fallback) { setBlogId(fallback); setUsingDefault(!!conn?.default_blog_id && fallback === conn.default_blog_id) }
      }
    } catch { setBlogsError(t.errors.exact_failure) }
  }, [projectId, blogId, conn, mapErr, t])

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
        // `detail` is a provider/diagnostic code (e.g. no_subscription) — not shown.
        const text = mapErr(publishErrorKey(data.reason || data.error))
        setLastError(text)
        setMessage({ text, ok: false })
      }
    } catch { setMessage({ text: t.errors.exact_failure, ok: false }) } finally { setBusy(null) }
  }

  if (loading) return <Card><p className="text-caption text-muted">{t.loading}</p></Card>

  return (
    <Card>
      <div className="flex items-center justify-between gap-2 mb-2" dir={dir}>
        <h3 className="text-section font-semibold text-ink">{t.title}</h3>
        <Badge variant={canPublish ? 'success' : 'warning'}>{canPublish ? t.canPublish : t.readOnly}</Badge>
      </div>

      <div className="text-copy text-body mb-3" dir={dir}>{conn?.shop_domain}</div>

      {!canPublish ? (
        // write_content missing → clear CTA. Read-only connection stays usable.
        <div className="space-y-2" dir={dir}>
          <p className="text-copy text-warn">{t.needWriteScope}</p>
          <Button size="sm" onClick={authorize}>{t.authorize}</Button>
        </div>
      ) : (
        <div className="space-y-3" dir={dir}>
          {/* Target blog */}
          <div className="flex flex-col gap-1">
            <label className="text-caption font-medium text-body">{t.targetBlog}</label>
            {blogsError ? (
              <p className="text-caption text-warn">{blogsError}</p>
            ) : blogs.length === 0 ? (
              <p className="text-caption text-warn">{t.errors.no_shopify_blog}</p>
            ) : blogs.length === 1 ? (
              <div className="text-copy text-body">{blogs[0].title}</div>
            ) : (
              <select value={blogId} onChange={(e) => { setBlogId(e.target.value); setUsingDefault(false) }} className="w-full px-3 py-2 text-copy rounded-control border border-line bg-surface text-ink">
                <option value="">{t.selectBlog}</option>
                {blogs.map((b) => <option key={b.id} value={b.id}>{b.title}</option>)}
              </select>
            )}
            {usingDefault && <p className="text-caption text-muted">{t.usingProjectDefault}</p>}
          </div>

          <Input label={t.tags} placeholder={t.tagsPlaceholder} value={tags} onChange={(e) => setTags(e.target.value)} />
          <Input label={t.publishDate} type="date" value={publishDate} onChange={(e) => setPublishDate(e.target.value)} />

          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={saveSelection} loading={saving} disabled={saving}>{t.saveSelection}</Button>
          </div>

          <div className="flex flex-wrap gap-2 pt-1 border-t border-line">
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
            {articleUrl && <a href={articleUrl} target="_blank" rel="noopener noreferrer" className="text-copy text-action hover:underline self-center">{t.openArticle}</a>}
          </div>

          {lastError && <p className="text-caption text-bad">{lastError}</p>}
        </div>
      )}

      {message && <p className={`mt-2 text-caption ${message.ok ? 'text-ok' : 'text-bad'}`}>{message.text}</p>}
    </Card>
  )
}
