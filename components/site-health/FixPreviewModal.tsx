'use client'

/**
 * "Fix it for me", shown before it happens. The modal asks the server for a
 * READ-ONLY preview (what is on the page now and what we propose), lets the
 * merchant change the proposal, and writes only when they press approve — the
 * one place in the app that sends `approved: true`. After the write it shows
 * what went to the site, with an undo that restores the previous value.
 *
 * Every failure is our own sentence (dictionary `siteHealth.errors`), with the
 * step-by-step card beneath it, so a refusal is never a dead end.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { CircleCheck, ImageIcon, Info, TriangleAlert, Undo2 } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import Textarea from '@/components/ui/Textarea'
import { Skeleton } from '@/components/ui/Skeleton'
import { cn } from '@/lib/utils'
import type { Finding, FindingPage, SiteHealthErrorCode, SitePlatform } from '@/lib/site-health/types'
import type { DashboardDictionary } from '@/lib/i18n/dashboard/he'
import type { useToasts } from '@/components/ui/Toast'
import { GuideSteps } from './FindingCard'

type Copy = DashboardDictionary['siteHealth']
type Limits = { min: number; max: number; target: number }

type PreviewBody =
  | { ok: true; field: 'title' | 'description'; via: 'seo_plugin' | 'wp_title'; before: string; after: string; expected: string; limits: Limits; serp: { title: string; description: string } }
  | { ok: true; field: 'alt'; images: { src: string; after: string }[]; expected: string }
  | { ok: true; field: 'link'; sourceUrl: string; sourceTitle: string; targetUrl: string; anchor: string; sentenceBefore: string; sentenceAfter: string; expected: string }
  | { ok: false; code: SiteHealthErrorCode }

type ApplyBody =
  | { ok: true; status: 'applied' | 'already'; undo: Record<string, unknown> | null }
  | { ok: false; code: SiteHealthErrorCode }

type Phase =
  | { kind: 'loading' }
  | { kind: 'error'; code: SiteHealthErrorCode }
  | { kind: 'ready'; preview: Extract<PreviewBody, { ok: true }> }
  | { kind: 'applied'; status: 'applied' | 'already'; undo: Record<string, unknown> | null; shown: string | null }

async function post<T>(body: Record<string, unknown>): Promise<T | null> {
  try {
    const res = await fetch('/api/site-health/fix', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    return (await res.json()) as T
  } catch {
    return null
  }
}

const hostOf = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, '') } catch { return url } }
const pathLabel = (url: string) => { try { const p = decodeURI(new URL(url).pathname); return p.replace(/\/+$/, '') || '/' } catch { return url } }

/** The image as the site serves it; when it will not load here, a quiet placeholder, never the browser's broken glyph. */
function Thumb({ src }: { src: string }) {
  const [failed, setFailed] = useState(false)
  if (failed) {
    return (
      <span className="grid size-16 shrink-0 place-items-center rounded-control border border-line bg-sunk text-muted" aria-hidden="true">
        <ImageIcon size={20} strokeWidth={1.75} />
      </span>
    )
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- the merchant's own image, on their own host
    <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} className="size-16 shrink-0 rounded-control border border-line bg-sunk object-cover" />
  )
}

function LengthMeter({ n, limits, copy }: { n: number; limits: Limits; copy: Copy }) {
  const state = n > limits.max ? 'long' : n < limits.min ? 'short' : 'good'
  const pct = Math.min(100, Math.round((n / limits.max) * 100))
  return (
    <div className="mt-2" aria-live="polite">
      <div className="h-1 w-full overflow-hidden rounded-pill bg-sunk" dir="ltr" aria-hidden="true">
        <div
          className={cn('h-full rounded-pill transition-[width,background-color] duration-200 ease-snappy', state === 'good' ? 'bg-ok' : state === 'long' ? 'bg-bad' : 'bg-warn')}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-1.5 flex flex-wrap justify-between gap-x-3 text-caption">
        <span className="text-muted">{copy.preview.length(n, limits.min, limits.max)}</span>
        <span className={cn('font-medium', state === 'good' ? 'text-ok' : state === 'long' ? 'text-bad' : 'text-warn')}>
          {state === 'good' ? copy.preview.good : state === 'long' ? copy.preview.tooLong : copy.preview.tooShort}
        </span>
      </p>
    </div>
  )
}

/** A search result as Google draws it, from the values the fix would leave on the page. */
function SearchResultMock({ url, title, description, caption }: { url: string; title: string; description: string; caption: string }) {
  return (
    <div className="rounded-inset border border-line bg-surface p-4" data-site-health="serp">
      <p className="text-overline font-semibold uppercase tracking-wide text-muted">{caption}</p>
      <p className="mt-2 truncate text-caption text-muted" dir="ltr">{hostOf(url)} › {pathLabel(url).split('/').filter(Boolean).join(' › ')}</p>
      <p className="mt-1 line-clamp-1 text-[1.0625rem] leading-6 font-medium text-action">{title}</p>
      {description && <p className="mt-0.5 line-clamp-2 text-copy text-body">{description}</p>}
    </div>
  )
}

export default function FixPreviewModal({
  projectId, finding, page, platform, copy, toasts, onClose, onFixed,
}: {
  projectId: string
  finding: Finding
  page: FindingPage
  platform: SitePlatform
  copy: Copy
  toasts: ReturnType<typeof useToasts>
  onClose: () => void
  onFixed: (on: boolean) => void
}) {
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' })
  const [value, setValue] = useState('')
  const [alts, setAlts] = useState<{ src: string; after: string }[]>([])
  const [busy, setBusy] = useState(false)
  const [undoFailed, setUndoFailed] = useState(false)
  const field = finding.field

  useEffect(() => {
    let cancelled = false
    void post<PreviewBody>({
      projectId, action: 'preview', field, url: page.url, kind: finding.id,
      ...(field === 'link' && page.value ? { keyword: page.value } : {}),
    }).then((body) => {
      if (cancelled) return
      if (!body || !body.ok) { setPhase({ kind: 'error', code: body && !body.ok ? body.code : 'wordpress_unreachable' }); return }
      if (body.field === 'title' || body.field === 'description') setValue(body.after)
      if (body.field === 'alt') setAlts(body.images)
      setPhase({ kind: 'ready', preview: body })
    })
    return () => { cancelled = true }
  }, [projectId, field, page.url, page.value, finding.id])

  const approve = useCallback(async () => {
    if (phase.kind !== 'ready' || busy) return
    const p = phase.preview
    const base = { projectId, action: 'apply', approved: true, field: p.field, url: page.url, expected: p.expected }
    const body = p.field === 'alt' ? { ...base, images: alts }
      : p.field === 'link' ? { ...base, sourceUrl: p.sourceUrl, anchor: p.anchor }
        : { ...base, via: p.via, after: value }
    // The dialog sits in the browser's top layer, above any toast: while it is open
    // it carries the result itself, and the toast confirms it once it closes.
    setBusy(true)
    const r = await post<ApplyBody>(body)
    setBusy(false)
    if (!r || !r.ok) { setPhase({ kind: 'error', code: r && !r.ok ? r.code : 'wordpress_unreachable' }); return }
    onFixed(true)
    const shown = p.field === 'title' || p.field === 'description' ? value : p.field === 'link' ? p.anchor : null
    setPhase({ kind: 'applied', status: r.status, undo: r.undo, shown })
  }, [phase, busy, projectId, page.url, alts, value, onFixed])

  const undo = useCallback(async () => {
    if (phase.kind !== 'applied' || !phase.undo || busy) return
    setBusy(true)
    setUndoFailed(false)
    const r = await post<ApplyBody>({ ...phase.undo, projectId, action: 'apply', approved: true })
    setBusy(false)
    if (!r || !r.ok) { setUndoFailed(true); return }
    onFixed(false)
    onClose()
    toasts.success(copy.toast.undone)
  }, [phase, busy, toasts, copy.toast, projectId, onFixed, onClose])

  /** Closing after a change: the toast says what stays on the site. */
  const close = useCallback(() => {
    onClose()
    if (phase.kind === 'applied' && phase.status === 'applied') toasts.success(copy.toast.saved)
  }, [onClose, phase, toasts, copy.toast])

  const title = field ? copy.preview.title[field] : copy.stepsTitle
  const trimmed = value.replace(/\s+/g, ' ').trim()

  const footer = useMemo(() => {
    if (phase.kind === 'ready') {
      return (
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-2 text-caption text-muted">
            <Info size={14} strokeWidth={2} aria-hidden="true" className="shrink-0" />
            {copy.preview.noChange}
          </p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button variant="ghost" onClick={onClose} disabled={busy}>{copy.preview.cancel}</Button>
            <Button onClick={approve} loading={busy} disabled={(phase.preview.field === 'title' || phase.preview.field === 'description') && !trimmed} data-approve-fix="">
              {copy.preview.approve}
            </Button>
          </div>
        </div>
      )
    }
    if (phase.kind === 'applied') {
      return (
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          {phase.undo && (
            <Button variant="secondary" onClick={undo} loading={busy} data-undo-fix="">
              <Undo2 size={16} strokeWidth={2} aria-hidden="true" className="rtl:-scale-x-100" />
              {copy.preview.undo}
            </Button>
          )}
          <Button onClick={close} disabled={busy}>{copy.preview.close}</Button>
        </div>
      )
    }
    return (
      <div className="flex justify-end">
        <Button variant="secondary" onClick={onClose}>{copy.preview.close}</Button>
      </div>
    )
  }, [phase, busy, trimmed, copy, onClose, close, approve, undo])

  return (
    <Modal open onClose={busy ? () => {} : close} title={title} size="lg">
      <div className="space-y-5" data-fix-phase={phase.kind}>
        <div className="flex min-w-0 items-baseline gap-2 text-copy">
          <span className="shrink-0 font-semibold text-ink">{copy.preview.page}:</span>
          <span className="min-w-0 truncate text-body" dir="ltr" title={page.url}>{pathLabel(page.url)}</span>
        </div>

        {phase.kind === 'loading' && (
          <div role="status" aria-busy="true" className="space-y-3">
            <span className="sr-only">{copy.preview.loading}</span>
            <p className="text-copy text-muted" aria-hidden="true">{copy.preview.loading}</p>
            <div className="grid gap-3 md:grid-cols-2">
              <Skeleton className="h-28 rounded-inset" />
              <Skeleton className="h-28 rounded-inset" />
            </div>
            <Skeleton className="h-20 rounded-inset" />
          </div>
        )}

        {phase.kind === 'error' && (
          <div className="space-y-4">
            <p role="alert" className="rounded-inset border border-warn/25 bg-warn-soft px-4 py-3 text-copy text-ink">{copy.errors[phase.code]}</p>
            <GuideSteps steps={copy.guides[finding.guide][platform]} title={copy.stepsTitle} />
          </div>
        )}

        {phase.kind === 'ready' && (phase.preview.field === 'title' || phase.preview.field === 'description') && (() => {
          const p = phase.preview
          const f = p.field
          return (
            <>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-inset border border-line bg-sunk/60 p-4" data-side="before">
                  <p className="text-overline font-semibold uppercase tracking-wide text-muted">{copy.preview.before}</p>
                  <p className={cn('mt-2 text-copy text-pretty', p.before ? 'text-body' : 'italic text-muted')}>{p.before || copy.preview.empty}</p>
                  {p.before && <p className="mt-2 text-caption text-muted">{copy.chars(p.before.length)}</p>}
                </div>
                <div className="rounded-inset border border-action/30 bg-action-soft/40 p-4" data-side="after">
                  <label htmlFor="site-health-after" className="text-overline font-semibold uppercase tracking-wide text-action">{copy.preview.after}</label>
                  <Textarea
                    id="site-health-after"
                    aria-label={copy.preview.editLabel[f]}
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    rows={f === 'title' ? 2 : 4}
                    className="mt-2 bg-surface"
                  />
                  <LengthMeter n={trimmed.length} limits={p.limits} copy={copy} />
                </div>
              </div>
              <p className="text-caption text-muted">{copy.preview.editHint}</p>
              <SearchResultMock
                url={page.url}
                caption={copy.preview.googleLook}
                title={f === 'title' ? trimmed : p.serp.title}
                description={f === 'description' ? trimmed : p.serp.description}
              />
              <p className="flex gap-2 rounded-inset bg-info-soft px-4 py-3 text-copy text-ink">
                <Info size={16} strokeWidth={2} aria-hidden="true" className="mt-1 shrink-0 text-info" />
                {p.via === 'seo_plugin' ? copy.preview.viaSeo : copy.preview.viaTitle}
              </p>
            </>
          )
        })()}

        {phase.kind === 'ready' && phase.preview.field === 'alt' && (
          <>
            <p className="flex gap-2 rounded-inset bg-info-soft px-4 py-3 text-copy text-ink">
              <Info size={16} strokeWidth={2} aria-hidden="true" className="mt-1 shrink-0 text-info" />
              {copy.preview.altNote}
            </p>
            <ul className="divide-y divide-line overflow-hidden rounded-inset border border-line" role="list">
              {alts.map((img, i) => (
                <li key={img.src} className="flex items-start gap-4 p-4">
                  <Thumb src={img.src} />
                  <div className="min-w-0 flex-1">
                    <p className="text-caption text-muted">
                      {copy.preview.before}: <span className="italic">{copy.preview.empty}</span>
                    </p>
                    <label htmlFor={`alt-${i}`} className="sr-only">{copy.preview.editLabel.alt}</label>
                    <Textarea
                      id={`alt-${i}`}
                      rows={1}
                      value={img.after}
                      onChange={(e) => setAlts((list) => list.map((x, j) => (j === i ? { ...x, after: e.target.value } : x)))}
                      className="mt-1.5"
                    />
                  </div>
                </li>
              ))}
            </ul>
            <p className="text-caption text-muted">{copy.preview.editHint}</p>
          </>
        )}

        {phase.kind === 'ready' && phase.preview.field === 'link' && (() => {
          const p = phase.preview
          const i = p.sentenceAfter.toLowerCase().indexOf(p.anchor.toLowerCase())
          return (
            <>
              <p className="text-copy text-body">
                {copy.preview.linkFrom}: <span className="font-semibold text-ink">{p.sourceTitle}</span>
              </p>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-inset border border-line bg-sunk/60 p-4" data-side="before">
                  <p className="text-overline font-semibold uppercase tracking-wide text-muted">{copy.preview.before}</p>
                  <p className="mt-2 text-copy text-body text-pretty">{p.sentenceBefore}</p>
                </div>
                <div className="rounded-inset border border-action/30 bg-action-soft/40 p-4" data-side="after">
                  <p className="text-overline font-semibold uppercase tracking-wide text-action">{copy.preview.after}</p>
                  <p className="mt-2 text-copy text-body text-pretty">
                    {i >= 0 ? (
                      <>
                        {p.sentenceAfter.slice(0, i)}
                        <span className="font-medium text-action underline decoration-action/40 underline-offset-4">{p.sentenceAfter.slice(i, i + p.anchor.length)}</span>
                        {p.sentenceAfter.slice(i + p.anchor.length)}
                      </>
                    ) : p.sentenceAfter}
                  </p>
                </div>
              </div>
              <p className="flex gap-2 rounded-inset bg-info-soft px-4 py-3 text-copy text-ink">
                <Info size={16} strokeWidth={2} aria-hidden="true" className="mt-1 shrink-0 text-info" />
                {copy.preview.linkNote}
              </p>
            </>
          )
        })()}

        {phase.kind === 'applied' && (
          <div className="flex flex-col items-center gap-3 rounded-inset border border-ok/20 bg-ok-soft px-6 py-8 text-center motion-safe:animate-pop-in" data-fix-result={phase.status}>
            <span className="grid size-12 place-items-center rounded-full bg-surface text-ok shadow-card ring-8 ring-ok/10">
              <CircleCheck size={24} strokeWidth={2} aria-hidden="true" />
            </span>
            <p className="text-section font-semibold text-ink">{phase.status === 'already' ? copy.preview.already : copy.preview.applied}</p>
            {phase.status === 'applied' && <p className="max-w-md text-copy text-body">{copy.preview.appliedBody}</p>}
            {phase.shown && <p className="max-w-md rounded-control bg-surface px-3 py-2 text-copy font-medium text-ink ring-1 ring-line">{phase.shown}</p>}
          </div>
        )}
        {phase.kind === 'applied' && undoFailed && (
          <p role="alert" className="flex items-start gap-2 rounded-inset border border-bad/20 bg-bad-soft px-4 py-3 text-copy text-ink">
            <TriangleAlert size={16} strokeWidth={2} aria-hidden="true" className="mt-0.5 shrink-0 text-bad" />
            {copy.preview.undoFailed}
          </p>
        )}

        <div className="border-t border-line pt-4">{footer}</div>
      </div>
    </Modal>
  )
}
