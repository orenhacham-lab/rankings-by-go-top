'use client'

import { useEffect, useRef, useState } from 'react'
import { Check } from 'lucide-react'
import Button from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import Notice from '@/components/ui/Notice'
import { cn } from '@/lib/utils'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { LOCALE_PREFIX, PAYPAL_LOCALE } from '@/lib/i18n/locales'
import { VIDEO_STUDIO_COPY } from '@/lib/video-studio/copy'
import { VIDEO_UI_COPY } from '@/lib/video-studio/copy-ui'
import { CREDIT_PACKS, majorAmount, type PackId } from '@/lib/video-studio/packs'

interface PayPalPackWindow extends Window {
  paypal?: { Buttons: (o: {
    style: Record<string, string>
    createOrder: () => Promise<string>
    onApprove: (d: { orderID?: string }) => Promise<void>
    onError: () => void
  }) => { render: (el: HTMLElement) => Promise<void> } }
}

const PACK_IDS = Object.keys(CREDIT_PACKS) as PackId[]
/** A clip of 8 seconds costs 9 credits; the card says "about N clips" from this. */
const clipsIn = (credits: number) => Math.floor(credits / 9)

/**
 * Balance and credit packs. The server prices and verifies everything: this only shows the
 * numbers, opens the right checkout (PayPal in Israel, Creem elsewhere) and reports the result.
 */
export default function CreditPacks({ onBalance, refreshKey, needed }: { onBalance: (n: number | null) => void; refreshKey: number; needed: number }) {
  const { uiLocale } = useDashboardLanguage()
  const t = VIDEO_STUDIO_COPY[uiLocale].credits
  const u = VIDEO_UI_COPY[uiLocale]
  const [balance, setBalance] = useState<number | null>(null)
  const [canBuy, setCanBuy] = useState(false)
  const [provider, setProvider] = useState<'paypal' | 'creem' | null>(null)
  const [busy, setBusy] = useState<PackId | null>(null)
  const [ack, setAck] = useState(false)
  const [msg, setMsg] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null)
  const [version, setVersion] = useState(0)
  const slots = useRef<Partial<Record<PackId, HTMLDivElement | null>>>({})

  useEffect(() => {
    let live = true
    fetch('/api/video-studio/credits', { cache: 'no-store' }).then((r) => r.json()).then((b) => {
      if (!live || !b?.ok) return
      setBalance(b.balance); onBalance(b.balance); setCanBuy(!!b.canBuy); setProvider(b.provider === 'paypal' || b.provider === 'creem' ? b.provider : null)
    }).catch(() => undefined)
    return () => { live = false }
  }, [refreshKey, version, onBalance])

  // Back from Creem's checkout: the server reads the payment back and grants the credits once.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search)
    const checkoutId = q.get('pack') === 'creem' ? q.get('checkout_id') : null
    if (!checkoutId) return
    window.history.replaceState(null, '', window.location.pathname)
    void fetch('/api/video-studio/packs/creem/confirm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ checkoutId }) })
      .then((r) => r.json().catch(() => null)).then((b) => {
        if (b?.ok) { setMsg({ tone: 'ok', text: t.paid(b.credits) }); setVersion((v) => v + 1) } else setMsg({ tone: 'bad', text: t.payFailed })
      }).catch(() => setMsg({ tone: 'bad', text: t.payFailed }))
  }, [t])

  const buyWithCreem = async (pack: PackId) => {
    setBusy(pack)
    try {
      const r = await fetch('/api/video-studio/packs/creem/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pack }) })
      const b = await r.json().catch(() => null)
      if (r.ok && typeof b?.checkoutUrl === 'string') { window.location.assign(b.checkoutUrl); return }
      setMsg({ tone: 'bad', text: t.payFailed })
    } catch { setMsg({ tone: 'bad', text: t.payFailed }) }
    setBusy(null)
  }

  useEffect(() => {
    const clientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID
    if (!canBuy || provider !== 'paypal' || !ack || !clientId) return
    const render = () => {
      const w = window as PayPalPackWindow
      if (!w.paypal) return
      for (const id of PACK_IDS) {
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
  }, [canBuy, provider, ack, uiLocale, t])

  if (balance === null || !(canBuy || provider === 'creem')) {
    return msg ? <Notice tone={msg.tone === 'ok' ? 'ok' : 'bad'}>{msg.text}</Notice> : null
  }
  const short = needed > balance
  return (
    <section id="vs-packs" data-video-credits="" className="scroll-mt-6">
    <Card className={cn('space-y-5', short && 'ring-2 ring-commit/60')}>
      <div className="space-y-1">
        <h2 className="text-lead font-bold text-ink">{u.packsTitle}</h2>
        <p className="text-copy text-muted">{u.packsSub}</p>
      </div>
      <label className="flex cursor-pointer items-start gap-2.5 text-copy text-body">
        <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-1.5 size-4 accent-[var(--color-action)]" />
        <span>{t.ack}{' '}<a href={`${LOCALE_PREFIX[uiLocale]}/refund-policy`} target="_blank" rel="noopener" className="font-semibold text-action underline underline-offset-2">{t.policyLink}</a></span>
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        {PACK_IDS.map((id) => {
          const pack = CREDIT_PACKS[id]
          const best = id === 'p100'
          const price = provider === 'creem' ? `$${majorAmount(pack.amountMinor.USD)}` : `${majorAmount(pack.amountMinor.ILS)} ₪`
          const tax = provider === 'creem' ? t.taxUsd : t.vatIls
          return (
            <div key={id} className={cn('relative flex flex-col gap-3 rounded-card border p-5', best ? 'border-action bg-action-soft' : 'border-line bg-surface')}>
              {best && <span className="absolute -top-2.5 start-4 inline-flex items-center gap-1 rounded-pill bg-action px-2.5 py-0.5 text-caption font-semibold text-action-ink"><Check className="size-3" aria-hidden="true" />{u.packBest}</span>}
              <div>
                <p className="text-title font-bold leading-none text-ink tabular-nums">{pack.credits}</p>
                <p className="mt-1 text-caption text-muted">{u.packClips(clipsIn(pack.credits))}</p>
              </div>
              <p className="text-copy font-semibold text-ink tabular-nums">{price} <span className="text-caption font-normal text-muted">{tax}</span></p>
              {provider === 'creem' ? (
                <Button variant="commit" loading={busy === id} disabled={!ack || busy !== null} onClick={() => void buyWithCreem(id)}>{u.getCredits}</Button>
              ) : ack ? (
                <div ref={(el) => { slots.current[id] = el }} />
              ) : (
                <p className="text-caption text-muted">{u.ackNeeded}</p>
              )}
            </div>
          )
        })}
      </div>
      {msg && <Notice tone={msg.tone === 'ok' ? 'ok' : 'bad'}>{msg.text}</Notice>}
    </Card>
    </section>
  )
}
