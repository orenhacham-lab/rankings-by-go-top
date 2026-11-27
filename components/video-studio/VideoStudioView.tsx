'use client'

import { useEffect, useRef, useState } from 'react'
import Header from '@/components/layout/Header'
import WorkspaceGate from '@/components/layout/WorkspaceGate'
import Notice from '@/components/ui/Notice'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { VIDEO_STUDIO_COPY } from '@/lib/video-studio/copy'
import { creditsFor } from '@/lib/video-studio/cost'
import { CREDIT_PACKS, majorAmount, type PackId } from '@/lib/video-studio/packs'
import { PAYPAL_LOCALE } from '@/lib/i18n/locales'
import { MAX_PROMPT_CHARS, MAX_REFERENCE_IMAGES, MAX_SECONDS, MIN_SECONDS } from '@/lib/video-studio/config'

interface Photo { id: number; data: string; mimeType: 'image/jpeg'; preview: string }
interface PayPalPackWindow extends Window {
  paypal?: { Buttons: (o: {
    style: Record<string, string>
    createOrder: () => Promise<string>
    onApprove: (d: { orderID?: string }) => Promise<void>
    onError: () => void
  }) => { render: (el: HTMLElement) => Promise<void> } }
}

/** Balance, and (Israel only) credit packs paid through PayPal. The server prices and verifies everything. */
function Credits({ onBalance, refreshKey }: { onBalance: (n: number) => void; refreshKey: number }) {
  const { uiLocale } = useDashboardLanguage()
  const t = VIDEO_STUDIO_COPY[uiLocale].credits
  const [balance, setBalance] = useState<number | null>(null)
  const [canBuy, setCanBuy] = useState(false)
  const [ack, setAck] = useState(false)
  const [msg, setMsg] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null)
  const [version, setVersion] = useState(0)
  const slots = useRef<Partial<Record<PackId, HTMLDivElement | null>>>({})

  useEffect(() => {
    let live = true
    fetch('/api/video-studio/credits', { cache: 'no-store' }).then((r) => r.json()).then((b) => {
      if (!live || !b?.ok) return
      setBalance(b.balance); onBalance(b.balance); setCanBuy(!!b.canBuy)
    }).catch(() => undefined)
    return () => { live = false }
  }, [refreshKey, version, onBalance])

  useEffect(() => {
    const clientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID
    if (!canBuy || !ack || !clientId) return
    const render = () => {
      const w = window as PayPalPackWindow
      if (!w.paypal) return
      for (const id of Object.keys(CREDIT_PACKS) as PackId[]) {
        const el = slots.current[id]
        if (!el || el.childElementCount) continue
        void w.paypal.Buttons({
          style: { shape: 'rect', color: 'gold', layout: 'horizontal', label: 'pay' },
          createOrder: async () => {
            const r = await fetch('/api/video-studio/packs/paypal/create', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pack: id }) })
            const b = await r.json().catch(() => null)
            if (!r.ok || !b?.orderId) throw new Error('create_failed')
            return b.orderId as string
          },
          onApprove: async (d) => {
            const r = await fetch('/api/video-studio/packs/paypal/capture', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderId: d.orderID }) })
            const b = await r.json().catch(() => null)
            if (r.ok && b?.ok) { setMsg({ tone: 'ok', text: t.paid(b.credits) }); setVersion((v) => v + 1) } else setMsg({ tone: 'bad', text: t.payFailed })
          },
          onError: () => setMsg({ tone: 'bad', text: t.payFailed }),
        }).render(el)
      }
    }
    const existing = document.getElementById('paypal-packs-sdk')
    if (existing) { render(); return }
    // intent=capture: the billing page's SDK is for subscriptions, this one is for one-time orders.
    const script = document.createElement('script')
    script.id = 'paypal-packs-sdk'
    script.src = `https://www.paypal.com/sdk/js?client-id=${clientId}&currency=ILS&intent=capture&locale=${PAYPAL_LOCALE[uiLocale]}`
    script.async = true
    script.onload = render
    document.body.appendChild(script)
  }, [canBuy, ack, uiLocale, t])

  if (balance === null) return null
  return (
    <section className="space-y-3" data-video-credits="">
      <p className="text-sm font-medium">{t.balance(balance)}</p>
      {canBuy && (
        <div className="space-y-2">
          <h2 className="text-sm font-medium">{t.buyTitle}</h2>
          <label className="flex items-start gap-2 text-xs"><input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-0.5" />{t.ack}</label>
          {ack && (Object.keys(CREDIT_PACKS) as PackId[]).map((id) => (
            <div key={id} className="space-y-1">
              <p className="text-sm">{t.pack(CREDIT_PACKS[id].credits, `${majorAmount(CREDIT_PACKS[id].amountMinor.ILS)} ₪`)}</p>
              <div ref={(el) => { slots.current[id] = el }} />
            </div>
          ))}
        </div>
      )}
      {msg && <Notice tone={msg.tone === 'ok' ? 'ok' : 'bad'}>{msg.text}</Notice>}
    </section>
  )
}

type Phase = { kind: 'idle' } | { kind: 'working' } | { kind: 'done'; url: string } | { kind: 'error'; text: string }

/** Shrinks a photo to at most 1280 px on its long side, as JPEG, so six of them fit in one request. */
async function shrink(file: File): Promise<{ data: string; preview: string } | null> {
  try {
    const bmp = await createImageBitmap(file)
    const scale = Math.min(1, 1280 / Math.max(bmp.width, bmp.height))
    const c = document.createElement('canvas')
    c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale)
    c.getContext('2d')?.drawImage(bmp, 0, 0, c.width, c.height)
    const url = c.toDataURL('image/jpeg', 0.82)
    return { data: url.split(',')[1] ?? '', preview: url }
  } catch { return null }
}

function Screen({ projectId }: { projectId: string }) {
  const { uiLocale } = useDashboardLanguage()
  const t = VIDEO_STUDIO_COPY[uiLocale]
  const [photos, setPhotos] = useState<Photo[]>([])
  const [prompt, setPrompt] = useState('')
  const [seconds, setSeconds] = useState(5)
  const [aspect, setAspect] = useState<'9:16' | '16:9'>('9:16')
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })
  const next = useRef(1)
  const [refreshKey, setRefreshKey] = useState(0)
  const [, setBalance] = useState(0)

  async function onFiles(files: FileList | null) {
    if (!files) return
    const room = MAX_REFERENCE_IMAGES - photos.length
    const added: Photo[] = []
    for (const f of Array.from(files).slice(0, Math.max(0, room))) {
      const s = await shrink(f)
      if (s) added.push({ id: next.current++, data: s.data, mimeType: 'image/jpeg', preview: s.preview })
    }
    setPhotos((p) => [...p, ...added])
  }

  async function create() {
    setPhase({ kind: 'working' })
    const res = await fetch('/api/video-studio/generate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, prompt, seconds, aspect, images: photos.map((p) => ({ data: p.data, mimeType: p.mimeType })) }),
    }).catch(() => null)
    const body = res ? await res.json().catch(() => null) : null
    setRefreshKey((k) => k + 1)
    if (res?.ok && body?.ok && typeof body.url === 'string') { setPhase({ kind: 'done', url: body.url }); return }
    const code = typeof body?.error === 'string' ? body.error : ''
    const known = ['insufficient_credits', 'daily_limit', 'too_many_images', 'images_too_large', 'invalid_request'] as const
    const key = (known as readonly string[]).includes(code) ? (code as (typeof known)[number]) : (['invalid_prompt', 'invalid_seconds', 'invalid_aspect'].includes(code) ? 'invalid_request' : 'failed')
    setPhase({ kind: 'error', text: t.errors[key] })
  }

  const working = phase.kind === 'working'
  return (
    <div className="max-w-2xl space-y-6">
      <Credits onBalance={setBalance} refreshKey={refreshKey} />
      <section className="space-y-2">
        <h2 className="text-sm font-medium">{t.photos}</h2>
        <p className="text-xs text-muted-foreground">{t.photosHint}</p>
        <div className="flex flex-wrap gap-2">
          {photos.map((p) => (
            <div key={p.id} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.preview} alt="" className="size-20 rounded-md object-cover" />
              <button type="button" className="absolute inset-x-0 bottom-0 bg-black/60 text-[10px] text-white" onClick={() => setPhotos((l) => l.filter((x) => x.id !== p.id))}>{t.remove}</button>
            </div>
          ))}
        </div>
        {photos.length < MAX_REFERENCE_IMAGES && (
          <label className="inline-block cursor-pointer rounded-md border px-3 py-2 text-sm">
            {t.addPhotos}
            <input type="file" accept="image/*" multiple className="sr-only" onChange={(e) => { void onFiles(e.target.files); e.target.value = '' }} />
          </label>
        )}
        {photos.length === 0 && <p className="text-xs text-muted-foreground">{t.noPhotos}</p>}
      </section>

      <section className="space-y-2">
        <label className="text-sm font-medium" htmlFor="vs-prompt">{t.prompt}</label>
        <textarea id="vs-prompt" value={prompt} maxLength={MAX_PROMPT_CHARS} rows={3} placeholder={t.promptPlaceholder}
          onChange={(e) => setPrompt(e.target.value)} className="w-full rounded-md border bg-background p-2 text-sm" />
      </section>

      <section className="flex flex-wrap items-end gap-6">
        <div className="space-y-1">
          <label className="text-sm font-medium" htmlFor="vs-seconds">{t.seconds}</label>
          <input id="vs-seconds" type="number" min={MIN_SECONDS} max={MAX_SECONDS} value={seconds}
            onChange={(e) => setSeconds(Math.min(MAX_SECONDS, Math.max(MIN_SECONDS, Math.round(Number(e.target.value) || MIN_SECONDS))))}
            className="w-24 rounded-md border bg-background p-2 text-sm" />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium" htmlFor="vs-aspect">{t.format}</label>
          <select id="vs-aspect" value={aspect} onChange={(e) => setAspect(e.target.value as '9:16' | '16:9')} className="rounded-md border bg-background p-2 text-sm">
            <option value="9:16">{t.vertical}</option>
            <option value="16:9">{t.horizontal}</option>
          </select>
        </div>
      </section>

      <p className="text-sm text-muted-foreground">{t.cost(creditsFor(seconds))}</p>
      <button type="button" disabled={working || !prompt.trim()} onClick={() => void create()}
        className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50">
        {working ? t.creating : t.create}
      </button>
      {working && <p className="text-xs text-muted-foreground" role="status">{t.creatingHint}</p>}
      {phase.kind === 'error' && <Notice tone="bad">{phase.text}</Notice>}
      {phase.kind === 'done' && (
        <section className="space-y-2">
          <h2 className="text-sm font-medium">{t.resultTitle}</h2>
          <video src={phase.url} controls playsInline className="max-h-[70vh] rounded-md" />
          <a href={phase.url} download="clip.mp4" className="inline-block rounded-md border px-3 py-2 text-sm">{t.download}</a>
          <p className="text-xs text-muted-foreground">{t.keptFor}</p>
        </section>
      )}
    </div>
  )
}

export default function VideoStudioView() {
  const { uiLocale } = useDashboardLanguage()
  const t = VIDEO_STUDIO_COPY[uiLocale]
  return (
    <div>
      <Header title={t.title} subtitle={t.subtitle} />
      <WorkspaceGate>{(project) => <Screen key={project.id} projectId={project.id} />}</WorkspaceGate>
    </div>
  )
}
