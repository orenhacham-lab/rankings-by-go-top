'use client'

/**
 * Phase 4D — inline article images editor panel.
 *
 * Manages the article's inline images (max 3) via /api/content/articles/:id/
 * inline-images. Each image is attached to an eligible H2 section and composed
 * into the body at publish/preview time — this panel never edits content_html.
 * Per-image controls: generate/regenerate, edit prompt/alt/caption, move to
 * another section, delete. "Add inline image" creates a new entry for a chosen
 * eligible section. No auto-generation on article creation.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { Card } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Badge from '@/components/ui/Badge'

type EligibleSection = { sectionId: string; title: string }
type InlineImage = {
  id: string
  section_id: string
  prompt: string | null
  alt_text: string | null
  caption: string | null
  storage_url: string | null
  wp_media_url: string | null
  status: string
  last_error: string | null
  position: number
}

// Client-side upload guardrails for Replace (server re-validates independently).
const REPLACE_ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
const REPLACE_MAX_SIZE = 5 * 1024 * 1024 // 5MB — matches the existing project upload convention.

type Dict = {
  title: string; hint: string; migrationRequired: string; add: string; adding: string
  max: string; noEligible: string; empty: string; section: string; selectSection: string
  promptLabel: string; promptPlaceholder: string; altLabel: string; altPlaceholder: string
  captionLabel: string; captionPlaceholder: string; generate: string; generating: string
  regenerate: string; replace: string; replacing: string; save: string; saving: string
  move: string; remove: string; removeConfirm: string; saved: string; created: string
  removed: string; generated: string; replaced: string; failed: string; statusPending: string
  statusGenerating: string; statusReady: string; statusUploaded: string; statusFailed: string
  errors: Record<string, string>
}

const inputCls =
  'w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500'

export default function ArticleInlineImagesPanel({
  articleId,
  dict,
  dir,
  onNotify,
  onImagesChange,
}: {
  articleId: string
  dict: Dict
  dir: 'rtl' | 'ltr'
  onNotify?: (text: string, ok: boolean) => void
  /** Emits the current image rows so the parent can compose the body preview. */
  onImagesChange?: (images: InlineImage[]) => void
}) {
  const t = dict
  const [loading, setLoading] = useState(true)
  const [migrationRequired, setMigrationRequired] = useState(false)
  const [images, setImages] = useState<InlineImage[]>([])
  const [sections, setSections] = useState<EligibleSection[]>([])
  const [max, setMax] = useState(3)
  // Per-image local drafts (prompt/alt/caption) so edits don't clobber on refetch.
  const [drafts, setDrafts] = useState<Record<string, { prompt: string; alt: string; caption: string }>>({})
  const [busy, setBusy] = useState<string | null>(null) // imageId or 'add'
  const [addSection, setAddSection] = useState('')
  // Hidden file input reused by every row's Replace action; targets one image id.
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const replaceTargetRef = useRef<string | null>(null)

  const notify = useCallback((text: string, ok: boolean) => onNotify?.(text, ok), [onNotify])

  // Keep the parent's body-preview in sync with the current image rows so any
  // add/generate/regenerate/replace/move/delete/edit refreshes the preview.
  useEffect(() => { onImagesChange?.(images) }, [images, onImagesChange])
  const errText = useCallback((code: unknown) => t.errors[typeof code === 'string' ? code : 'unknown'] || t.errors.unknown, [t])

  const applyImages = useCallback((rows: InlineImage[]) => {
    setImages(rows)
    setDrafts((prev) => {
      const next = { ...prev }
      for (const r of rows) {
        if (!next[r.id]) next[r.id] = { prompt: r.prompt || '', alt: r.alt_text || '', caption: r.caption || '' }
      }
      return next
    })
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/content/articles/${articleId}/inline-images`)
      if (res.status === 503) { setMigrationRequired(true); return }
      if (!res.ok) return
      const data = await res.json()
      setMigrationRequired(false)
      applyImages(Array.isArray(data.images) ? data.images : [])
      setSections(Array.isArray(data.eligibleSections) ? data.eligibleSections : [])
      if (typeof data.max === 'number') setMax(data.max)
    } catch {
      // Non-fatal — a manual reload re-syncs.
    } finally {
      setLoading(false)
    }
  }, [articleId, applyImages])

  useEffect(() => { load() }, [load])

  const usedSections = new Set(images.map((i) => i.section_id))
  const openSections = sections.filter((s) => !usedSections.has(s.sectionId))
  const atMax = images.length >= max

  function sectionTitle(id: string): string {
    return sections.find((s) => s.sectionId === id)?.title || id
  }
  function statusLabel(s: string): { text: string; variant: 'success' | 'neutral' | 'danger' } {
    if (s === 'failed') return { text: t.statusFailed, variant: 'danger' }
    if (s === 'generating' || s === 'uploading') return { text: t.statusGenerating, variant: 'neutral' }
    if (s === 'uploaded') return { text: t.statusUploaded, variant: 'success' }
    if (s === 'ready') return { text: t.statusReady, variant: 'success' }
    return { text: t.statusPending, variant: 'neutral' }
  }

  async function addImage() {
    if (!addSection) { notify(errText('section_required'), false); return }
    setBusy('add')
    try {
      const res = await fetch(`/api/content/articles/${articleId}/inline-images`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sectionId: addSection }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { notify(errText(data.error), false); return }
      setAddSection('')
      await load()
      notify(t.created, true)
    } catch { notify(t.failed, false) } finally { setBusy(null) }
  }

  async function generate(id: string) {
    setBusy(id)
    try {
      const res = await fetch(`/api/content/articles/${articleId}/inline-images/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'regenerate' }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { notify(errText(data.error), false); return }
      const img = data.image as InlineImage | undefined
      if (img) applyImages(images.map((i) => (i.id === id ? img : i)))
      if (img && img.status === 'failed') notify(img.last_error || t.failed, false)
      else notify(t.generated, true)
    } catch { notify(t.failed, false) } finally { setBusy(null) }
  }

  async function saveDetails(id: string) {
    const d = drafts[id]
    if (!d) return
    setBusy(id)
    try {
      const res = await fetch(`/api/content/articles/${articleId}/inline-images/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: d.prompt, altText: d.alt, caption: d.caption }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { notify(errText(data.error), false); return }
      const img = data.image as InlineImage | undefined
      if (img) applyImages(images.map((i) => (i.id === id ? img : i)))
      notify(t.saved, true)
    } catch { notify(t.failed, false) } finally { setBusy(null) }
  }

  async function move(id: string, sectionId: string) {
    setBusy(id)
    try {
      const res = await fetch(`/api/content/articles/${articleId}/inline-images/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sectionId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { notify(errText(data.error), false); return }
      const img = data.image as InlineImage | undefined
      if (img) applyImages(images.map((i) => (i.id === id ? img : i)))
      notify(t.saved, true)
    } catch { notify(t.failed, false) } finally { setBusy(null) }
  }

  // Replace = manual upload of a user-chosen file (distinct from AI Regenerate).
  function pickReplacement(id: string) {
    replaceTargetRef.current = id
    if (fileInputRef.current) { fileInputRef.current.value = ''; fileInputRef.current.click() }
  }
  async function onReplaceFileSelected(ev: React.ChangeEvent<HTMLInputElement>) {
    const id = replaceTargetRef.current
    const file = ev.target.files?.[0]
    ev.target.value = ''
    if (!id || !file) return
    if (!REPLACE_ALLOWED_TYPES.includes(file.type)) { notify(errText('invalid_type'), false); return }
    if (file.size > REPLACE_MAX_SIZE) { notify(errText('file_too_large'), false); return }
    setBusy(id)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch(`/api/content/articles/${articleId}/inline-images/${id}`, { method: 'PUT', body: fd })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { notify(errText(data.error), false); return }
      const img = data.image as InlineImage | undefined
      if (img) applyImages(images.map((i) => (i.id === id ? img : i)))
      notify(t.replaced, true)
    } catch { notify(t.failed, false) } finally { setBusy(null) }
  }

  async function remove(id: string) {
    if (!window.confirm(t.removeConfirm)) return
    setBusy(id)
    try {
      const res = await fetch(`/api/content/articles/${articleId}/inline-images/${id}`, { method: 'DELETE' })
      if (!res.ok) { const data = await res.json().catch(() => ({})); notify(errText(data.error), false); return }
      setImages((prev) => prev.filter((i) => i.id !== id))
      notify(t.removed, true)
    } catch { notify(t.failed, false) } finally { setBusy(null) }
  }

  if (loading) {
    return (
      <Card className="hover:translate-y-0">
        <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100 mb-1">{t.title}</h3>
        <p className="text-xs text-slate-400 dark:text-slate-500">…</p>
      </Card>
    )
  }

  return (
    <Card className="hover:translate-y-0" >
      {/* Single hidden input reused by every row's Replace action. */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={onReplaceFileSelected}
      />
      <div className="flex items-center justify-between gap-2 mb-1">
        <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">{t.title}</h3>
        <Badge variant="neutral">{images.length}/{max}</Badge>
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">{t.hint}</p>

      {migrationRequired ? (
        <p className="text-xs text-amber-700 dark:text-amber-400">{t.migrationRequired}</p>
      ) : (
        <>
          <div className="space-y-4">
            {images.length === 0 && (
              <p className="text-xs text-slate-400 dark:text-slate-500">{t.empty}</p>
            )}
            {[...images].sort((a, b) => a.position - b.position).map((img) => {
              const d = drafts[img.id] || { prompt: '', alt: '', caption: '' }
              const st = statusLabel(img.status)
              const url = img.wp_media_url || img.storage_url
              const isBusy = busy === img.id
              // Sections this image may move to: open ones + its own current section.
              const moveTargets = sections.filter((s) => s.sectionId === img.section_id || !usedSections.has(s.sectionId))
              return (
                <div key={img.id} className="rounded-lg border border-slate-100 dark:border-slate-800 p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <Badge variant={st.variant}>{st.text}</Badge>
                    <span className="text-[11px] text-slate-400 dark:text-slate-500">{t.section}: {sectionTitle(img.section_id)}</span>
                  </div>

                  {url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={url} alt={img.alt_text || ''} className="w-full max-h-56 object-cover rounded-lg border border-slate-200 dark:border-slate-700" />
                  )}
                  {img.status === 'failed' && img.last_error && (
                    <p className="text-[11px] text-red-600 dark:text-red-400 break-words">{img.last_error}</p>
                  )}

                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-slate-600 dark:text-slate-300">{t.section}</label>
                    <select
                      className={inputCls}
                      value={img.section_id}
                      disabled={isBusy}
                      onChange={(ev) => { if (ev.target.value !== img.section_id) move(img.id, ev.target.value) }}
                    >
                      {moveTargets.map((s) => <option key={s.sectionId} value={s.sectionId}>{s.title}</option>)}
                    </select>
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-slate-600 dark:text-slate-300">{t.promptLabel}</label>
                    <textarea
                      rows={2} className={inputCls} placeholder={t.promptPlaceholder} value={d.prompt} disabled={isBusy}
                      onChange={(ev) => setDrafts((p) => ({ ...p, [img.id]: { ...d, prompt: ev.target.value } }))}
                    />
                  </div>
                  <Input label={t.altLabel} value={d.alt} placeholder={t.altPlaceholder} disabled={isBusy}
                    onChange={(ev) => setDrafts((p) => ({ ...p, [img.id]: { ...d, alt: ev.target.value } }))} />
                  <Input label={t.captionLabel} value={d.caption} placeholder={t.captionPlaceholder} disabled={isBusy}
                    onChange={(ev) => setDrafts((p) => ({ ...p, [img.id]: { ...d, caption: ev.target.value } }))} />

                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button size="sm" onClick={() => generate(img.id)} loading={isBusy} disabled={isBusy}>
                      {isBusy ? t.generating : (url ? t.regenerate : t.generate)}
                    </Button>
                    {/* Replace = upload a chosen file; separate from AI Regenerate. */}
                    <Button size="sm" variant="outline" onClick={() => pickReplacement(img.id)} disabled={isBusy}>{t.replace}</Button>
                    <Button size="sm" variant="outline" onClick={() => saveDetails(img.id)} disabled={isBusy}>{t.save}</Button>
                    <Button size="sm" variant="ghost" onClick={() => remove(img.id)} disabled={isBusy} className="text-red-600 dark:text-red-400">{t.remove}</Button>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Add a new inline image to an open eligible section. */}
          <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800">
            {atMax ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">{t.max}</p>
            ) : openSections.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">{t.noEligible}</p>
            ) : (
              <div className="flex flex-wrap items-end gap-2">
                <div className="flex flex-col gap-1 flex-1 min-w-[12rem]">
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-300">{t.section}</label>
                  <select className={inputCls} value={addSection} disabled={busy === 'add'} onChange={(ev) => setAddSection(ev.target.value)} dir={dir}>
                    <option value="">{t.selectSection}</option>
                    {openSections.map((s) => <option key={s.sectionId} value={s.sectionId}>{s.title}</option>)}
                  </select>
                </div>
                <Button size="sm" onClick={addImage} loading={busy === 'add'} disabled={busy === 'add' || !addSection}>
                  {busy === 'add' ? t.adding : t.add}
                </Button>
              </div>
            )}
          </div>
        </>
      )}
    </Card>
  )
}
