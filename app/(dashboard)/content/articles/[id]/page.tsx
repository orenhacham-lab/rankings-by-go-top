'use client'

/**
 * Article editor — /content/articles/[id] (Phase 3A).
 * Edit a generated draft: fields + lean TipTap body + FAQ; Save draft;
 * Mark as ready (server-gated on required anchors). No publish/schedule.
 */

import { use, useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/layout/Header'
import { Card } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Badge from '@/components/ui/Badge'
import ArticleContentEditor from '@/components/content/ArticleContentEditor'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import { AlertTriangle } from 'lucide-react'

type Faq = { question: string; answer: string }
type AnchorPlacement = { anchorText: string; targetUrl: string; required: boolean; placed: boolean }

export default function ArticleEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const { language } = useDashboardLanguage()
  const e = useMemo(() => getDashboardDictionary(language).contentHub.editor, [language])
  const isHebrew = language === 'he'

  const enabled = process.env.NEXT_PUBLIC_ENABLE_CONTENT === 'true'

  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null)

  const [title, setTitle] = useState('')
  const [slug, setSlug] = useState('')
  const [metaTitle, setMetaTitle] = useState('')
  const [metaDescription, setMetaDescription] = useState('')
  const [excerpt, setExcerpt] = useState('')
  const [contentHtml, setContentHtml] = useState('')
  const [imagePrompt, setImagePrompt] = useState('')
  const [faq, setFaq] = useState<Faq[]>([])
  const [status, setStatus] = useState<'draft' | 'ready'>('draft')
  const [missingRequired, setMissingRequired] = useState<AnchorPlacement[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/content/articles/${id}`)
      if (res.status === 404) { setNotFound(true); return }
      if (!res.ok) return
      const data = await res.json()
      const a = data.article
      setTitle(a.title ?? '')
      setSlug(a.slug ?? '')
      setMetaTitle(a.meta_title ?? '')
      setMetaDescription(a.meta_description ?? '')
      setExcerpt(a.excerpt ?? '')
      setContentHtml(a.content_html ?? '')
      setImagePrompt(a.image_prompt ?? '')
      setFaq(Array.isArray(a.faq_json) ? a.faq_json : [])
      setStatus(a.status === 'ready' ? 'ready' : 'draft')
      setMissingRequired(data.anchorValidation?.missingRequired ?? [])
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { if (enabled) load() }, [enabled, load])

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
      if (res.status === 409 && data.error === 'required_anchors_missing') {
        setMissingRequired(data.anchorValidation?.missingRequired ?? [])
        setMessage({ text: e.readyBlocked, ok: false })
        return
      }
      if (!res.ok) {
        setMessage({ text: data.error || e.saveError, ok: false })
        return
      }
      if (data.article?.status) setStatus(data.article.status === 'ready' ? 'ready' : 'draft')
      if (data.anchorValidation?.missingRequired) setMissingRequired(data.anchorValidation.missingRequired)
      setMessage({ text: e.saved, ok: true })
    } catch {
      setMessage({ text: e.saveError, ok: false })
    } finally {
      setSaving(false)
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
        <Link href="/content"><Button variant="outline">{e.back}</Button></Link>
      </div>
    )
  }

  const inputCls =
    'w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500'

  return (
    <div dir={isHebrew ? 'rtl' : 'ltr'}>
      <div className="flex items-center justify-between gap-3 mb-2">
        <Link href="/content" className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline">{e.back}</Link>
        <Badge variant={status === 'ready' ? 'success' : 'neutral'}>{status === 'ready' ? e.statusReady : e.statusDraft}</Badge>
      </div>
      <Header title={title || '—'} />

      {message && (
        <div className={`mb-4 text-sm rounded-lg px-3 py-2 border ${message.ok ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-700 dark:text-green-300' : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300'}`}>
          {message.text}
        </div>
      )}

      {missingRequired.length > 0 && (
        <div className="mb-4 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-3">
          <div className="flex items-center gap-2 text-sm font-medium text-amber-800 dark:text-amber-300 mb-1">
            <AlertTriangle size={16} /> {e.anchorWarningsTitle}
          </div>
          <ul className="text-xs text-amber-700 dark:text-amber-400 list-disc ps-5 space-y-0.5">
            {missingRequired.map((a, i) => (
              <li key={i}>{e.anchorMissingRequired}: <span className="font-medium">{a.anchorText}</span> → {a.targetUrl}</li>
            ))}
          </ul>
        </div>
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
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">{e.faqTitle}</h3>
            <Button size="sm" variant="outline" onClick={() => setFaq((p) => [...p, { question: '', answer: '' }])}>{e.addFaq}</Button>
          </div>
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
          <Input label={e.imagePrompt} value={imagePrompt} onChange={(ev) => setImagePrompt(ev.target.value)} />
        </Card>

        <div className="flex flex-wrap items-center gap-2 pb-8">
          <Button onClick={() => save()} loading={saving} disabled={saving}>{saving ? e.saving : e.saveDraft}</Button>
          <Button variant="outline" onClick={() => save('ready')} disabled={saving || missingRequired.length > 0}>{e.markReady}</Button>
          <span className="text-xs text-slate-400 dark:text-slate-600 px-2" title={e.comingSoon}>{e.publish} · {e.comingSoon}</span>
          <span className="text-xs text-slate-400 dark:text-slate-600 px-2" title={e.comingSoon}>{e.schedule} · {e.comingSoon}</span>
          <Link href="/content" className="ms-auto"><Button variant="ghost">{e.back}</Button></Link>
        </div>
      </div>
    </div>
  )
}
