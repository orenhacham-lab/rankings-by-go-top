'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { CalendarClock, ImagePlus, PenLine, Send, Sparkles, Trash2 } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input, { FIELD_LABEL_CLASSES } from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Textarea from '@/components/ui/Textarea'
import Segmented from '@/components/ui/Segmented'
import Checkbox from '@/components/ui/Checkbox'
import Notice from '@/components/ui/Notice'
import { cn } from '@/lib/utils'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import { formatDate } from '@/lib/i18n/format-date'
import { GBP_CTA_TYPES, GBP_SUMMARY_MAX, containsPhoneNumber, countPostChars, validatePostInput, type GbpCtaType, type GbpValidationCode } from '@/lib/gbp/validate'
import PostPreview from './PostPreview'
import { cropBox, cropStyle, type CropControls } from './crop'
import { gbpErrorText, gbpFieldText } from './error-text'
import type { GbpReadyStatus } from './types'

type Source = 'article' | 'topic' | 'free'
interface Picked { src: string; blob: Blob; w: number; h: number }
const DEFAULT_CROP: CropControls = { zoom: 1, px: 0.5, py: 0.5 }

function loadPicked(blob: Blob): Promise<Picked> {
  return new Promise((resolve, reject) => {
    const src = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => resolve({ src, blob, w: img.naturalWidth, h: img.naturalHeight })
    img.onerror = () => { URL.revokeObjectURL(src); reject(new Error('image')) }
    img.src = src
  })
}

const pad = (n: number) => String(n).padStart(2, '0')
function defaultLater(): { date: string; time: string } {
  const d = new Date(Date.now() + 24 * 60 * 60 * 1000)
  return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, time: '10:00' }
}

export default function PostComposer({ projectId, status, onPosted }: { projectId: string; status: GbpReadyStatus; onPosted: () => void }) {
  const { language } = useDashboardLanguage()
  const t = getDashboardDictionary(language).mapsPosts
  const c = t.composer
  const canPublish = status.connection?.status === 'connected' && !!status.location
  const blockedReason = status.connection?.status !== 'connected' ? t.errors.not_connected : !status.location ? t.errors.no_location : null

  const [source, setSource] = useState<Source>(status.articles.length > 0 ? 'article' : 'topic')
  const [articleId, setArticleId] = useState('')
  const [topic, setTopic] = useState('')
  const [summary, setSummary] = useState('')
  const [drafting, setDrafting] = useState(false)
  const [drafted, setDrafted] = useState(false)
  const [picked, setPicked] = useState<Picked | null>(null)
  const [crop, setCrop] = useState<CropControls>(DEFAULT_CROP)
  const [prepared, setPrepared] = useState<{ path: string; url: string } | null>(null)
  const [preparing, setPreparing] = useState(false)
  const [ctaType, setCtaType] = useState<'' | GbpCtaType>('')
  const [ctaUrl, setCtaUrl] = useState('')
  const [allowOther, setAllowOther] = useState(false)
  const [when, setWhen] = useState<'now' | 'later'>('now')
  const [later, setLater] = useState(defaultLater)
  const [fieldErrors, setFieldErrors] = useState<GbpValidationCode[]>([])
  const [sending, setSending] = useState(false)
  const [notice, setNotice] = useState<{ tone: 'ok' | 'bad' | 'info'; text: string } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => () => { if (picked) URL.revokeObjectURL(picked.src) }, [picked])

  const article = status.articles.find((a) => a.id === articleId) ?? null
  const chars = countPostChars(summary)
  const over = chars > GBP_SUMMARY_MAX
  const hasPhone = chars > 0 && containsPhoneNumber(summary)
  const errFor = (...codes: GbpValidationCode[]) => {
    const hit = fieldErrors.find((e) => codes.includes(e))
    return hit ? gbpFieldText(t, hit) : undefined
  }
  const scheduledIso = useMemo(() => {
    if (when !== 'later' || !later.date || !later.time) return null
    const d = new Date(`${later.date}T${later.time}`)
    return Number.isNaN(d.getTime()) ? 'invalid' : d.toISOString()
  }, [when, later])

  const pickArticle = (id: string) => {
    setArticleId(id)
    const a = status.articles.find((x) => x.id === id)
    if (a?.url && !ctaUrl) { setCtaUrl(a.url); if (!ctaType) setCtaType('LEARN_MORE') }
  }

  const draft = async () => {
    setDrafting(true); setNotice(null)
    const res = await fetch('/api/gbp/draft', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, language, ...(source === 'article' ? { articleId } : { topic }) }),
    }).catch(() => null)
    const body = res ? await res.json().catch(() => ({})) : {}
    setDrafting(false)
    if (!res || !res.ok || typeof body.summary !== 'string') { setNotice({ tone: 'bad', text: gbpErrorText(t, body.error ?? 'draft_unavailable') }); return }
    setSummary(body.summary)
    setDrafted(true)
    setFieldErrors([])
  }

  const choose = async (blob: Blob) => {
    setNotice(null)
    try {
      const p = await loadPicked(blob)
      setPicked(p); setCrop(DEFAULT_CROP); setPrepared(null)
    } catch { setNotice({ tone: 'bad', text: t.errors.image_invalid }) }
  }
  const fromArticle = async () => {
    if (!article?.imageUrl) return
    const res = await fetch(article.imageUrl).catch(() => null)
    if (!res || !res.ok) { setNotice({ tone: 'bad', text: t.errors.image_invalid }); return }
    await choose(await res.blob())
  }
  const changeCrop = (patch: Partial<CropControls>) => { setCrop((cur) => ({ ...cur, ...patch })); setPrepared(null) }

  /** Send the crop to the server, which writes the real 1200×900 JPEG. */
  const prepare = async (): Promise<{ path: string; url: string } | null> => {
    if (!picked) return null
    if (prepared) return prepared
    setPreparing(true)
    const box = cropBox(picked.w, picked.h, crop)
    const form = new FormData()
    form.set('projectId', projectId)
    form.set('file', picked.blob)
    form.set('crop', JSON.stringify({ x: box.x, y: box.y, w: box.w }))
    const res = await fetch('/api/gbp/image', { method: 'POST', body: form }).catch(() => null)
    const body = res ? await res.json().catch(() => ({})) : {}
    setPreparing(false)
    if (!res || !res.ok || typeof body.imagePath !== 'string') { setNotice({ tone: 'bad', text: gbpErrorText(t, body.error ?? 'image_upload_failed') }); return null }
    const out = { path: body.imagePath as string, url: body.imageUrl as string }
    setPrepared(out)
    return out
  }

  const submit = async () => {
    setNotice(null)
    const local = validatePostInput({
      summary, ctaType: ctaType || null, ctaUrl: ctaType === 'CALL' ? null : ctaUrl, siteUrl: status.siteUrl, allowOtherSite: allowOther,
      scheduledAt: when === 'later' ? (scheduledIso ?? 'invalid') : null,
    })
    if (!local.ok) { setFieldErrors(local.errors); return }
    setFieldErrors([])
    setSending(true)
    const image = picked ? await prepare() : null
    if (picked && !image) { setSending(false); return }
    const res = await fetch('/api/gbp/posts', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId, language, summary, ctaType: ctaType || null, ctaUrl: ctaType === 'CALL' ? null : ctaUrl, allowOtherSite: allowOther,
        imagePath: image?.path ?? null, scheduledAt: local.value.scheduledAt, sourceArticleId: source === 'article' ? articleId || null : null,
      }),
    }).catch(() => null)
    const body = res ? await res.json().catch(() => ({})) : {}
    setSending(false)
    if (!res || !res.ok) {
      if (Array.isArray(body.fields)) setFieldErrors(body.fields as GbpValidationCode[])
      else setNotice({ tone: 'bad', text: gbpErrorText(t, body.error) })
      return
    }
    if (body.outcome === 'failed') setNotice({ tone: 'bad', text: gbpErrorText(t, body.errorCode) })
    else if (body.outcome === 'retrying') setNotice({ tone: 'info', text: c.retrying })
    else if (body.outcome === 'scheduled') setNotice({ tone: 'ok', text: c.scheduled(formatDate(language).dateTime(local.value.scheduledAt)) })
    else setNotice({ tone: 'ok', text: c.published })
    if (body.outcome !== 'failed') {
      setSummary(''); setDrafted(false); setPicked(null); setPrepared(null); setTopic('')
    }
    onPosted()
  }

  const ctaOptions = [{ value: '', label: c.ctaNone }, ...GBP_CTA_TYPES.map((v) => ({ value: v, label: c.ctaTypes[v] }))]

  return (
    <Card className="p-5 sm:p-6">
      <div className="mb-4 flex items-start gap-3">
        <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-inset bg-action-soft text-action">
          <PenLine aria-hidden="true" className="size-5" />
        </span>
        <div>
          <p className="text-overline font-semibold uppercase tracking-wide text-muted">{c.overline}</p>
          <h2 className="text-section font-semibold text-ink">{c.title}</h2>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:gap-8">
        <div className="min-w-0 space-y-6">
          {/* Source + AI draft */}
          <section className="space-y-3">
            <p className={FIELD_LABEL_CLASSES}>{c.sourceLabel}</p>
            <Segmented<Source> ariaLabel={c.sourceLabel} value={source} onChange={setSource} options={[
              { value: 'article', label: c.sourceArticle },
              { value: 'topic', label: c.sourceTopic },
              { value: 'free', label: c.sourceFree },
            ]} />
            {source === 'article' && (status.articles.length === 0 ? (
              <p className="text-caption text-muted">{c.noArticles}</p>
            ) : (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="min-w-0 flex-1">
                  <Select id="gbp-article" label={c.articleLabel} value={articleId} onChange={(e) => pickArticle(e.target.value)}
                    options={[{ value: '', label: c.articlePlaceholder }, ...status.articles.map((a) => ({ value: a.id, label: a.title }))]} />
                </div>
                <Button variant="secondary" onClick={draft} loading={drafting} disabled={!articleId || drafting}>
                  <Sparkles aria-hidden="true" className="size-4" />
                  {drafting ? c.drafting : c.draft}
                </Button>
              </div>
            ))}
            {source === 'topic' && (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="min-w-0 flex-1">
                  <Input id="gbp-topic" label={c.topicLabel} placeholder={c.topicPlaceholder} value={topic} maxLength={300} onChange={(e) => setTopic(e.target.value)} />
                </div>
                <Button variant="secondary" onClick={draft} loading={drafting} disabled={!topic.trim() || drafting}>
                  <Sparkles aria-hidden="true" className="size-4" />
                  {drafting ? c.drafting : c.draft}
                </Button>
              </div>
            )}
          </section>

          {/* Text + counter */}
          <section className="space-y-1.5">
            <Textarea id="gbp-summary" label={c.textLabel} placeholder={c.textPlaceholder} rows={8} value={summary}
              onChange={(e) => setSummary(e.target.value)} error={errFor('summary_empty', 'summary_too_long', 'summary_has_phone')}
              aria-describedby="gbp-summary-counter" />
            <div className="flex flex-wrap items-center justify-between gap-2">
              {/* The standing hint steps aside once the field shows its own error. */}
              {!errFor('summary_empty', 'summary_too_long', 'summary_has_phone') && (
                <p className={cn('text-caption', hasPhone ? 'text-warn' : 'text-muted')}>{c.phoneHint}</p>
              )}
              <p id="gbp-summary-counter" aria-live="polite" className={cn('ms-auto text-caption tabular-nums', over ? 'font-semibold text-bad' : chars > GBP_SUMMARY_MAX * 0.9 ? 'text-warn' : 'text-muted')}>
                {c.counter(chars, GBP_SUMMARY_MAX)}
              </p>
            </div>
            {drafted && <Notice tone="info">{c.draftNote}</Notice>}
          </section>

          {/* Photo */}
          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className={FIELD_LABEL_CLASSES}>{c.imageLabel}</p>
              <div className="flex flex-wrap gap-2">
                <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" tabIndex={-1} aria-hidden="true"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) void choose(f); e.target.value = '' }} />
                <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()}>
                  <ImagePlus aria-hidden="true" className="size-4" />
                  {picked ? c.imageReplace : c.imageUpload}
                </Button>
                {source === 'article' && article?.imageUrl && (
                  <Button variant="ghost" size="sm" onClick={fromArticle}>{c.imageFromArticle}</Button>
                )}
                {picked && (
                  <Button variant="ghost" size="sm" onClick={() => { setPicked(null); setPrepared(null) }}>
                    <Trash2 aria-hidden="true" className="size-4" />
                    {c.imageRemove}
                  </Button>
                )}
              </div>
            </div>
            <p className="text-caption text-muted">{c.imageHint}</p>
            {picked && (
              <div className="grid gap-4 rounded-inset border border-line bg-sunk p-4 sm:grid-cols-[12rem_minmax(0,1fr)]">
                <div className="relative aspect-[4/3] overflow-hidden rounded-control bg-surface">
                  {/* eslint-disable-next-line @next/next/no-img-element -- local object URL */}
                  <img src={picked.src} alt={c.imageAlt} className="absolute max-w-none select-none" style={cropStyle(picked.w, picked.h, crop)} draggable={false} />
                </div>
                <div className="space-y-3">
                  {([['zoom', c.imageZoom, 1, 3, 0.01], ['px', c.imageHorizontal, 0, 1, 0.01], ['py', c.imageVertical, 0, 1, 0.01]] as const).map(([key, label, min, max, step]) => (
                    <label key={key} className="flex flex-col gap-1.5">
                      <span className="text-caption text-muted">{label}</span>
                      <input type="range" min={min} max={max} step={step} value={crop[key]} onChange={(e) => changeCrop({ [key]: Number(e.target.value) })}
                        className="h-1.5 w-full cursor-pointer accent-[var(--color-action)]" />
                    </label>
                  ))}
                  <div className="flex items-center gap-3">
                    <Button size="sm" variant="secondary" onClick={() => void prepare()} loading={preparing} disabled={!!prepared || preparing}>
                      {preparing ? c.imagePreparing : prepared ? c.imageReady : c.imageApply}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* Button */}
          <section className="space-y-3">
            <div className="grid gap-4 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
              <Select id="gbp-cta" label={c.ctaLabel} value={ctaType} options={ctaOptions}
                onChange={(e) => setCtaType(e.target.value as '' | GbpCtaType)} error={errFor('cta_type_invalid')} />
              {ctaType && ctaType !== 'CALL' && (
                <Input id="gbp-cta-url" type="url" label={c.ctaUrlLabel} placeholder={c.ctaUrlPlaceholder} value={ctaUrl} onChange={(e) => setCtaUrl(e.target.value)}
                  hint={c.ctaUrlHint} error={errFor('cta_url_required', 'cta_url_invalid', 'cta_url_not_https', 'cta_url_other_site', 'cta_url_too_long', 'cta_url_not_allowed')} />
              )}
              {ctaType === 'CALL' && <p className="self-end text-caption text-muted sm:pb-2.5">{c.ctaCallHint}</p>}
            </div>
            {ctaType && ctaType !== 'CALL' && (
              <Checkbox checked={allowOther} onChange={setAllowOther} label={c.allowOtherSite} description={c.allowOtherSiteHint} />
            )}
          </section>

          {/* When */}
          <section className="space-y-3">
            <p className={FIELD_LABEL_CLASSES}>{c.whenLabel}</p>
            <Segmented<'now' | 'later'> ariaLabel={c.whenLabel} value={when} onChange={setWhen} options={[
              { value: 'now', label: c.whenNow, icon: Send },
              { value: 'later', label: c.whenLater, icon: CalendarClock },
            ]} />
            {when === 'later' && (
              <div className="grid max-w-md grid-cols-2 gap-4">
                <Input id="gbp-date" type="date" label={c.dateLabel} value={later.date} onChange={(e) => setLater((l) => ({ ...l, date: e.target.value }))} />
                <Input id="gbp-time" type="time" label={c.timeLabel} value={later.time} onChange={(e) => setLater((l) => ({ ...l, time: e.target.value }))} />
              </div>
            )}
            {errFor('schedule_invalid', 'schedule_in_past', 'schedule_too_far') && (
              <p className="text-caption text-bad">{errFor('schedule_invalid', 'schedule_in_past', 'schedule_too_far')}</p>
            )}
          </section>

          {notice && <Notice tone={notice.tone} onDismiss={() => setNotice(null)}>{notice.text}</Notice>}

          <div className="flex flex-wrap items-center gap-3 border-t border-line pt-5">
            <Button onClick={submit} loading={sending} disabled={!canPublish || sending || over}>
              {when === 'later' ? <CalendarClock aria-hidden="true" className="size-4" /> : <Send aria-hidden="true" className="size-4" />}
              {sending ? c.sending : when === 'later' ? c.schedule : c.publish}
            </Button>
            {!canPublish && blockedReason && <p className="text-caption text-muted">{blockedReason}</p>}
          </div>
        </div>

        <aside className="min-w-0 lg:sticky lg:top-6 lg:self-start">
          <p className="mb-3 text-overline font-semibold uppercase tracking-wide text-muted">{t.preview.title}</p>
          <PostPreview
            businessName={status.location?.title ?? status.businessName}
            summary={summary}
            imageSrc={picked?.src ?? null}
            imageStyle={picked ? cropStyle(picked.w, picked.h, crop) : undefined}
            ctaType={ctaType || null}
          />
        </aside>
      </div>
    </Card>
  )
}
