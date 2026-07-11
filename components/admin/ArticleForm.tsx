'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'

const ArticleEditor = dynamic(() => import('./ArticleEditor'), { ssr: false })

interface ArticleData {
  id?: string
  title: string
  slug: string
  excerpt: string
  content: string
  author: string
  is_published: boolean
  published_at: string
  featured_image_url: string
  featured_image_alt: string
  meta_title: string
  meta_description: string
}

interface Props {
  initial?: Partial<ArticleData>
}

function slugify(str: string) {
  return str
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export default function ArticleForm({ initial }: Props) {
  const router = useRouter()
  const isEdit = !!initial?.id

  const [form, setForm] = useState<ArticleData>({
    id: initial?.id,
    title: initial?.title ?? '',
    slug: initial?.slug ?? '',
    excerpt: initial?.excerpt ?? '',
    content: initial?.content ?? '',
    author: initial?.author ?? 'orenhacham@gmail.com',
    is_published: initial?.is_published ?? false,
    published_at: initial?.published_at ? initial.published_at.slice(0, 16) : '',
    featured_image_url: initial?.featured_image_url ?? '',
    featured_image_alt: initial?.featured_image_alt ?? '',
    meta_title: initial?.meta_title ?? '',
    meta_description: initial?.meta_description ?? '',
  })

  const [slugManual, setSlugManual] = useState(isEdit)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-selecting the same file
    if (!file) return

    setUploadError('')
    setUploading(true)
    try {
      const data = new FormData()
      data.append('file', file)
      const res = await fetch('/api/articles/upload', { method: 'POST', body: data })
      const json = await res.json()
      if (!res.ok) {
        setUploadError(json.error ?? 'שגיאה בהעלאת התמונה')
        return
      }
      set('featured_image_url', json.url)
    } catch {
      setUploadError('שגיאה בהעלאת התמונה')
    } finally {
      setUploading(false)
    }
  }

  useEffect(() => {
    if (!slugManual) {
      setForm(f => ({ ...f, slug: slugify(f.title) }))
    }
  }, [form.title, slugManual])

  const set = (field: keyof ArticleData, value: string | boolean) =>
    setForm(f => ({ ...f, [field]: value }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError('')

    const payload = {
      ...form,
      published_at: form.published_at ? new Date(form.published_at).toISOString() : null,
    }

    const url = isEdit ? `/api/articles/${form.id}` : '/api/articles'
    const method = isEdit ? 'PUT' : 'POST'

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (res.ok) {
      router.push('/admin/articles')
      router.refresh()
    } else {
      const data = await res.json()
      setError(data.error ?? 'שגיאה לא ידועה')
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!form.id) return
    if (!window.confirm('למחוק את המאמר? פעולה זו אינה הפיכה.')) return
    const res = await fetch(`/api/articles/${form.id}`, { method: 'DELETE' })
    if (res.ok) {
      router.push('/admin/articles')
      router.refresh()
    }
  }

  const inputCls = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
  const labelCls = 'block text-sm font-medium text-slate-700 mb-1'

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-4xl" dir="rtl">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>
      )}

      {/* Title */}
      <div>
        <label className={labelCls}>כותרת המאמר *</label>
        <input type="text" value={form.title} onChange={e => set('title', e.target.value)} required className={inputCls} placeholder="כותרת המאמר" />
      </div>

      {/* Slug */}
      <div>
        <label className={labelCls}>Slug (URL) *</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={form.slug}
            onChange={e => { setSlugManual(true); set('slug', e.target.value) }}
            required
            className={inputCls}
            dir="ltr"
            placeholder="my-article-slug"
          />
          {slugManual && (
            <button type="button" onClick={() => { setSlugManual(false); set('slug', slugify(form.title)) }} className="px-3 py-2 text-xs border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50 whitespace-nowrap">
              איפוס אוטומטי
            </button>
          )}
        </div>
        <p className="text-xs text-slate-500 mt-1">יופיע ב-URL: /articles/{form.slug || '...'}</p>
      </div>

      {/* Excerpt */}
      <div>
        <label className={labelCls}>תקציר</label>
        <textarea value={form.excerpt} onChange={e => set('excerpt', e.target.value)} rows={2} className={inputCls} placeholder="תיאור קצר שיופיע ברשימת המאמרים" />
      </div>

      {/* Content */}
      <div>
        <label className={labelCls}>תוכן המאמר *</label>
        <ArticleEditor value={form.content} onChange={v => set('content', v)} />
      </div>

      {/* Featured Image */}
      <div className="border border-slate-200 rounded-xl p-4 space-y-4">
        <h3 className="text-sm font-semibold text-slate-700">תמונה ראשית</h3>

        {/* Preview */}
        {form.featured_image_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={form.featured_image_url}
            alt={form.featured_image_alt || 'תצוגה מקדימה'}
            className="max-h-48 rounded-lg border border-slate-200 object-cover"
          />
        )}

        {/* Upload (primary) */}
        <div>
          <label className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 cursor-pointer transition-colors disabled:opacity-60">
            {uploading ? 'מעלה...' : '⬆️ העלה תמונה מהמחשב'}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleImageUpload}
              disabled={uploading}
              className="hidden"
            />
          </label>
          <p className="text-xs text-slate-500 mt-1">קבצים נתמכים: JPG, PNG, WEBP · עד 5MB</p>
          {uploadError && <p className="text-xs text-red-600 mt-1">{uploadError}</p>}
        </div>

        {/* Manual URL (secondary) */}
        <div>
          <label className={labelCls}>או הדבק כתובת תמונה (URL)</label>
          <input type="url" value={form.featured_image_url} onChange={e => set('featured_image_url', e.target.value)} className={inputCls} dir="ltr" placeholder="https://..." />
        </div>

        {/* Alt text */}
        <div>
          <label className={labelCls}>טקסט חלופי לתמונה (alt) <span className="text-slate-400 font-normal">— מומלץ ל-SEO ונגישות</span></label>
          <input type="text" value={form.featured_image_alt} onChange={e => set('featured_image_alt', e.target.value)} className={inputCls} placeholder="תיאור התמונה" />
        </div>
      </div>

      {/* SEO */}
      <div className="border border-slate-200 rounded-xl p-4 bg-slate-50 space-y-4">
        <h3 className="text-sm font-semibold text-slate-700">הגדרות SEO</h3>
        <div>
          <label className={labelCls}>Meta Title <span className="text-slate-400 font-normal">({form.meta_title.length}/60)</span></label>
          <input type="text" value={form.meta_title} onChange={e => set('meta_title', e.target.value)} maxLength={70} className={inputCls} placeholder="כותרת SEO (ברירת מחדל: כותרת המאמר)" />
        </div>
        <div>
          <label className={labelCls}>Meta Description <span className="text-slate-400 font-normal">({form.meta_description.length}/160)</span></label>
          <textarea value={form.meta_description} onChange={e => set('meta_description', e.target.value)} maxLength={180} rows={3} className={inputCls} placeholder="תיאור SEO (ברירת מחדל: תקציר המאמר)" />
        </div>
      </div>

      {/* Publish settings */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>כותב/ת</label>
          <input type="text" value={form.author} onChange={e => set('author', e.target.value)} className={inputCls} dir="ltr" />
        </div>
        <div>
          <label className={labelCls}>תאריך פרסום</label>
          <input type="datetime-local" value={form.published_at} onChange={e => set('published_at', e.target.value)} className={inputCls} dir="ltr" />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <label className="relative inline-flex items-center cursor-pointer">
          <input type="checkbox" checked={form.is_published} onChange={e => set('is_published', e.target.checked)} className="sr-only peer" />
          <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-500 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
        </label>
        <span className="text-sm text-slate-700">פרסם מאמר</span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3 pt-2">
        <button type="submit" disabled={saving} className="px-6 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-60 transition-colors">
          {saving ? 'שומר...' : isEdit ? 'שמור שינויים' : 'צור מאמר'}
        </button>
        <button type="button" onClick={() => router.back()} className="px-4 py-2.5 border border-slate-300 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors">
          ביטול
        </button>
        {isEdit && (
          <button type="button" onClick={handleDelete} className="mr-auto px-4 py-2.5 border border-red-300 text-red-600 rounded-lg text-sm font-medium hover:bg-red-50 transition-colors">
            מחק מאמר
          </button>
        )}
      </div>
    </form>
  )
}
