'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { CalendarClock, RotateCcw, Upload, X } from 'lucide-react'
import Button from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import Input, { FIELD_LABEL_CLASSES } from '@/components/ui/Input'
import Textarea from '@/components/ui/Textarea'
import Switch from '@/components/ui/Switch'
import { NoticeBox } from '@/components/ui/Notice'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { FIELD_CLASSES } from '@/components/ui/Input'
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
  /** A new article's author: the signed-in admin's own name, never an email. */
  defaultAuthor?: string
}

/** Our words for a failed save; the route's own `error` text is never shown. */
function saveErrorCopy(status: number): string {
  if (status === 409) return 'הכתובת הזו כבר בשימוש במאמר אחר. בחרו כתובת אחרת.'
  if (status === 400) return 'חסרים כותרת, כתובת או תוכן. מלאו אותם ונסו שוב.'
  if (status === 401) return 'פג תוקף ההתחברות. היכנסו מחדש ונסו שוב.'
  return 'לא הצלחנו לשמור את המאמר. נסו שוב בעוד רגע.'
}

/** Our words for a failed upload (the upload route checks type and size). */
function uploadErrorCopy(status: number): string {
  if (status === 400) return 'אפשר להעלות תמונת JPG, PNG או WEBP עד 5MB.'
  if (status === 401) return 'פג תוקף ההתחברות. היכנסו מחדש ונסו שוב.'
  return 'לא הצלחנו להעלות את התמונה. נסו שוב.'
}

/** "28 בספטמבר 2026, 14:30": the Hebrew way to read a date and time. */
const DATE_TIME_HE = new Intl.DateTimeFormat('he-IL', { dateStyle: 'long', timeStyle: 'short' })

function slugify(str: string) {
  return str
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export default function ArticleForm({ initial, defaultAuthor = '' }: Props) {
  const router = useRouter()
  const isEdit = !!initial?.id

  const [form, setForm] = useState<ArticleData>({
    id: initial?.id,
    title: initial?.title ?? '',
    slug: initial?.slug ?? '',
    excerpt: initial?.excerpt ?? '',
    content: initial?.content ?? '',
    author: initial?.author ?? defaultAuthor,
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
  const [deleteFailed, setDeleteFailed] = useState(false)
  const { confirm, dialog: confirmDialog } = useConfirm()

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
        setUploadError(uploadErrorCopy(res.status))
        return
      }
      set('featured_image_url', json.url)
    } catch {
      setUploadError(uploadErrorCopy(0))
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
      await res.json().catch(() => null)
      setError(saveErrorCopy(res.status))
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!form.id) return
    const ok = await confirm({
      title: 'למחוק את המאמר?',
      body: 'המאמר יוסר מהאתר ומהרשימה. אי אפשר לבטל את המחיקה.',
      confirmLabel: 'מחיקת המאמר',
      cancelLabel: 'ביטול',
      tone: 'danger',
    })
    if (!ok) return
    setDeleteFailed(false)
    const res = await fetch(`/api/articles/${form.id}`, { method: 'DELETE' })
    if (res.ok) {
      router.push('/admin/articles')
      router.refresh()
    } else {
      setDeleteFailed(true)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-4xl space-y-8" dir="rtl">
      {error && <NoticeBox tone="bad" language="he">{error}</NoticeBox>}
      {deleteFailed && <NoticeBox tone="bad" language="he" onDismiss={() => setDeleteFailed(false)}>לא הצלחנו למחוק את המאמר. נסו שוב בעוד רגע.</NoticeBox>}

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
          <Input id="article-author" label="כותב/ת" value={form.author} onChange={e => set('author', e.target.value)} required placeholder="שם הכותב/ת" />
          <DateTimeField id="article-published-at" label="תאריך ושעת פרסום" value={form.published_at} onChange={v => set('published_at', v)} />
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
      {confirmDialog}
    </form>
  )
}

/**
 * The publish date and time, read the Hebrew way ("28 בספטמבר 2026, 14:30")
 * instead of the browser's own "mm/dd/yyyy, --:-- --" pattern. The field shows
 * the formatted value; choosing opens the browser's date-and-time picker from
 * a native input kept under it (so the value is still a datetime-local string).
 * Where a browser cannot open that picker on request, the native field itself
 * is shown instead.
 */
function DateTimeField({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (v: string) => void }) {
  const nativeRef = useRef<HTMLInputElement>(null)
  // Every current browser can open the picker on request; an older one gets the native field.
  const [canPick, setCanPick] = useState(() => typeof HTMLInputElement === 'undefined' || 'showPicker' in HTMLInputElement.prototype)

  const date = value ? new Date(value) : null
  const shown = date && !Number.isNaN(date.getTime()) ? DATE_TIME_HE.format(date) : ''
  const open = () => {
    try { nativeRef.current?.showPicker() } catch { setCanPick(false) }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className={FIELD_LABEL_CLASSES}>{label}</label>
      <div className="relative">
        {canPick ? (
          <button
            id={id}
            type="button"
            onClick={open}
            aria-haspopup="dialog"
            data-datetime-display
            className={cn(FIELD_CLASSES, 'flex h-10 items-center gap-2 pe-10 text-start', !shown && 'text-muted')}
          >
            <CalendarClock aria-hidden className="size-4 shrink-0 text-muted" />
            <span className="min-w-0 truncate">{shown || 'בחירת תאריך ושעה'}</span>
          </button>
        ) : null}
        <input
          ref={nativeRef}
          id={canPick ? undefined : id}
          type="datetime-local"
          value={value}
          onChange={e => onChange(e.target.value)}
          tabIndex={canPick ? -1 : undefined}
          aria-hidden={canPick || undefined}
          className={canPick ? 'pointer-events-none absolute inset-0 h-full w-full opacity-0' : cn(FIELD_CLASSES, 'h-10')}
        />
        {canPick && value && (
          <button
            type="button"
            onClick={() => onChange('')}
            className="absolute inset-y-0 end-1 my-auto inline-flex size-8 items-center justify-center rounded-control text-muted transition-colors duration-150 ease-snappy hover:bg-sunk hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-action/20"
          >
            <X aria-hidden className="size-4" />
            <span className="sr-only">ניקוי התאריך</span>
          </button>
        )}
      </div>
    </div>
  )
}
