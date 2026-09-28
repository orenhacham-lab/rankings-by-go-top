'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { RotateCcw, Upload } from 'lucide-react'
import Button from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import Input, { FIELD_LABEL_CLASSES } from '@/components/ui/Input'
import Textarea from '@/components/ui/Textarea'
import Switch from '@/components/ui/Switch'
import { NoticeBox } from '@/components/ui/Notice'
import { cn } from '@/lib/utils'

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

  return (
    <form onSubmit={handleSubmit} className="max-w-4xl space-y-8" dir="rtl">
      {error && <NoticeBox tone="bad" language="he">{error}</NoticeBox>}

      <Card className="space-y-5 p-5 sm:p-6">
        <Input id="article-title" label="כותרת המאמר" value={form.title} onChange={e => set('title', e.target.value)} required placeholder="כותרת המאמר" />

        <div className="flex flex-col gap-1.5">
          <label htmlFor="article-slug" className={FIELD_LABEL_CLASSES}>כתובת המאמר</label>
          <div className="flex gap-2">
            <div className="min-w-0 flex-1">
              <Input
                id="article-slug"
                value={form.slug}
                onChange={e => { setSlugManual(true); set('slug', e.target.value) }}
                required
                dir="ltr"
                placeholder="my-article-slug"
              />
            </div>
            {slugManual && (
              <Button type="button" variant="secondary" onClick={() => { setSlugManual(false); set('slug', slugify(form.title)) }} className="h-10 shrink-0">
                <RotateCcw aria-hidden className="size-4" />
                איפוס אוטומטי
              </Button>
            )}
          </div>
          <p className="text-caption text-muted">יופיע בכתובת <span dir="ltr">/articles/{form.slug || '...'}</span></p>
        </div>

        <Textarea id="article-excerpt" label="תקציר" value={form.excerpt} onChange={e => set('excerpt', e.target.value)} rows={2} placeholder="תיאור קצר שיופיע ברשימת המאמרים" />

        <div className="flex flex-col gap-1.5">
          <span className={FIELD_LABEL_CLASSES}>תוכן המאמר</span>
          <ArticleEditor value={form.content} onChange={v => set('content', v)} />
        </div>
      </Card>

      <Card className="space-y-5 p-5 sm:p-6">
        <h2 className="text-section font-semibold text-ink">תמונה ראשית</h2>

        {form.featured_image_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={form.featured_image_url}
            alt={form.featured_image_alt || 'תצוגה מקדימה'}
            className="max-h-48 rounded-inset border border-line object-cover"
          />
        )}

        <div className="space-y-1.5">
          <label
            className={cn(
              'inline-flex h-9 cursor-pointer items-center gap-2 rounded-control border border-line bg-surface px-4 text-copy font-semibold text-ink shadow-control transition-colors duration-150 ease-snappy hover:border-line-strong hover:bg-sunk/60 focus-within:ring-4 focus-within:ring-action/20',
              uploading && 'pointer-events-none opacity-60',
            )}
          >
            <Upload aria-hidden className="size-4" />
            {uploading ? 'מעלה...' : 'העלאת תמונה מהמחשב'}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleImageUpload}
              disabled={uploading}
              className="sr-only"
            />
          </label>
          <p className="text-caption text-muted">קבצים נתמכים: JPG, PNG, WEBP, עד 5MB</p>
          {uploadError && <p className="text-caption text-bad">{uploadError}</p>}
        </div>

        <Input id="article-image-url" type="url" label="או כתובת של תמונה" value={form.featured_image_url} onChange={e => set('featured_image_url', e.target.value)} placeholder="https://..." />
        <Input id="article-image-alt" label="טקסט חלופי לתמונה" hint="מומלץ לנגישות ולקידום" value={form.featured_image_alt} onChange={e => set('featured_image_alt', e.target.value)} placeholder="תיאור התמונה" />
      </Card>

      <Card className="space-y-5 p-5 sm:p-6">
        <h2 className="text-section font-semibold text-ink">הגדרות קידום</h2>
        <Input id="article-meta-title" label={`כותרת לתוצאות החיפוש (${form.meta_title.length}/60)`} value={form.meta_title} onChange={e => set('meta_title', e.target.value)} maxLength={70} placeholder="ברירת מחדל: כותרת המאמר" />
        <Textarea id="article-meta-description" label={`תיאור לתוצאות החיפוש (${form.meta_description.length}/160)`} value={form.meta_description} onChange={e => set('meta_description', e.target.value)} maxLength={180} rows={3} placeholder="ברירת מחדל: תקציר המאמר" />
      </Card>

      <Card className="space-y-5 p-5 sm:p-6">
        <h2 className="text-section font-semibold text-ink">פרסום</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5">
          <Input id="article-author" label="כותב/ת" value={form.author} onChange={e => set('author', e.target.value)} dir="ltr" />
          <Input id="article-published-at" type="datetime-local" label="תאריך פרסום" value={form.published_at} onChange={e => set('published_at', e.target.value)} dir="ltr" />
        </div>
        <Switch checked={form.is_published} onChange={(next) => set('is_published', next)} label="פרסום המאמר" description="מאמר מפורסם מופיע באתר הציבורי" />
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" loading={saving}>
          {saving ? 'שומר...' : isEdit ? 'שמירת השינויים' : 'יצירת המאמר'}
        </Button>
        <Button type="button" variant="secondary" onClick={() => router.back()}>
          ביטול
        </Button>
        {isEdit && (
          <Button type="button" variant="ghost" onClick={handleDelete} className="ms-auto text-bad hover:bg-bad-soft hover:text-bad">
            מחיקת המאמר
          </Button>
        )}
      </div>
    </form>
  )
}
