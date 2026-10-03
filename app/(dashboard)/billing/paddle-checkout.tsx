'use client'

/**
 * w21 — the Paddle overlay checkout (Paddle is the merchant of record). Only
 * ever MOUNTED when the server decided Paddle is on (lib/paddle/config.ts):
 * with the flag off this file is never rendered, so the Paddle script is
 * never loaded and the PayPal screen is unchanged.
 *
 * Paddle.js v2 API (as typed by Paddle's own @paddle/paddle-js 1.6):
 *   Paddle.Environment.set('sandbox'), Paddle.Initialize({ token, eventCallback }),
 *   Paddle.Checkout.open({ items: [{ priceId, quantity }], customer: { email },
 *   customData, settings: { displayMode: 'overlay', locale } }),
 *   and the 'checkout.completed' event.
 * The entitlement is NOT granted here: the signed webhook (/api/paddle/webhook)
 * grants it from Paddle's own record. This screen only says thank you and
 * reloads.
 */

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import Notice, { type NoticeTone } from '@/components/ui/Notice'
import Button from '@/components/ui/Button'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import { PADDLE_JS_SRC, type PaddleCheckoutConfig } from '@/lib/paddle/config'
import type { PlanCode } from '@/lib/plans/catalog'

export interface PaddleCheckoutProps extends PaddleCheckoutConfig {
  userId: string
  email: string | null
}

interface PaddleEvent { name?: string }
interface PaddleGlobal {
  Environment: { set(env: 'sandbox' | 'production'): void }
  Initialized?: boolean
  Initialize(options: { token: string; eventCallback?: (e: PaddleEvent) => void }): void
  Update(options: { eventCallback?: (e: PaddleEvent) => void }): void
  Checkout: { open(options: Record<string, unknown>): void }
}

type State = 'loading' | 'ready' | 'failed'

const PaddleContext = createContext<{ state: State; open: (plan: PlanCode) => void } | null>(null)

const SCRIPT_ID = 'paddle-js'

export function PaddleCheckoutProvider({ config, children }: { config: PaddleCheckoutProps; children: React.ReactNode }) {
  const { language } = useDashboardLanguage()
  const t = getDashboardDictionary(language).billing.paddle
  const [state, setState] = useState<State>('loading')
  const [message, setMessage] = useState<{ tone: NoticeTone; text: string } | null>(null)
  const messageRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (message) messageRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [message])

  const onEvent = useCallback((e: PaddleEvent) => {
    if (e?.name === 'checkout.completed') {
      setMessage({ tone: 'ok', text: t.completed })
      // The webhook grants the plan; give it a moment, then show the new state.
      setTimeout(() => window.location.reload(), 5000)
    } else if (e?.name === 'checkout.error') {
      console.error('[Paddle] checkout error', e)
      setMessage({ tone: 'bad', text: t.checkoutError })
    }
  }, [t])

  useEffect(() => {
    const w = window as unknown as { Paddle?: PaddleGlobal }
    const init = () => {
      const paddle = w.Paddle
      if (!paddle) { setState('failed'); return }
      try {
        if (config.environment === 'sandbox') paddle.Environment.set('sandbox')
        if (paddle.Initialized) paddle.Update({ eventCallback: onEvent })
        else paddle.Initialize({ token: config.clientToken, eventCallback: onEvent })
        setState('ready')
      } catch (err) {
        console.error('[Paddle] initialize failed', err)
        setState('failed')
      }
    }
    if (document.getElementById(SCRIPT_ID)) { init(); return }
    const script = document.createElement('script')
    script.id = SCRIPT_ID
    script.src = PADDLE_JS_SRC
    script.async = true
    script.onload = init
    script.onerror = () => { console.error('[Paddle] script failed to load'); setState('failed') }
    document.body.appendChild(script)
  }, [config.environment, config.clientToken, onEvent])

  const open = useCallback((plan: PlanCode) => {
    const paddle = (window as unknown as { Paddle?: PaddleGlobal }).Paddle
    const priceId = config.prices[plan]
    if (!paddle || !priceId) { setMessage({ tone: 'bad', text: t.unavailable }); return }
    setMessage(null)
    try {
      paddle.Checkout.open({
        items: [{ priceId, quantity: 1 }],
        ...(config.email ? { customer: { email: config.email } } : {}),
        // Linking only: the webhook trusts user_id only for an EXISTING user
        // and takes the plan from the price id, never from plan_code.
        customData: { user_id: config.userId, plan_code: plan },
        settings: { displayMode: 'overlay', locale: language === 'en' ? 'en' : 'he', allowLogout: false },
      })
    } catch (err) {
      console.error('[Paddle] checkout open failed', err)
      setMessage({ tone: 'bad', text: t.checkoutError })
    }
  }, [config, language, t])

  return (
    <PaddleContext.Provider value={{ state, open }}>
      {children}
      {state === 'failed' && !message && (
        <div className="mt-4" data-paddle-unavailable="">
          <Notice tone="info">{t.loadFailed}</Notice>
        </div>
      )}
      {message && (
        <div ref={messageRef} className="mt-4 scroll-mt-24" data-paddle-message={message.tone}>
          <Notice tone={message.tone} onDismiss={message.tone === 'ok' ? undefined : () => setMessage(null)}>{message.text}</Notice>
        </div>
      )}
    </PaddleContext.Provider>
  )
}

/** One plan's "Subscribe" button; opens the overlay for that plan's Paddle price. */
export function PaddlePlanButton({ plan, inverse = false }: { plan: PlanCode; inverse?: boolean }) {
  const ctx = useContext(PaddleContext)
  const { language } = useDashboardLanguage()
  const t = getDashboardDictionary(language).billing.paddle
  if (!ctx) return null
  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant={inverse ? 'secondary' : 'primary'}
        className="w-full"
        data-paddle-plan={plan}
        disabled={ctx.state !== 'ready'}
        onClick={() => ctx.open(plan)}
      >
        {ctx.state === 'loading' ? t.loading : t.subscribe}
      </Button>
      <p className={inverse ? 'text-center text-caption text-contrast-ink/60' : 'text-center text-caption text-muted'}>{t.taxNote}</p>
    </div>
  )
}

/** "Manage subscription": a one-time link to Paddle's customer portal, made on the server. */
export function PaddleManageButton() {
  const { language } = useDashboardLanguage()
  const t = getDashboardDictionary(language).billing.paddle
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const go = async () => {
    setBusy(true)
    setFailed(false)
    try {
      const res = await fetch('/api/paddle/portal', { method: 'POST' })
      const body = await res.json().catch(() => ({})) as { url?: unknown }
      if (!res.ok || typeof body.url !== 'string' || !/^https:\/\/([a-z0-9-]+\.)*paddle\.com\//i.test(body.url)) {
        console.error('[Paddle] portal link failed', res.status)
        setFailed(true)
        setBusy(false)
        return
      }
      window.location.assign(body.url)
    } catch (err) {
      console.error('[Paddle] portal link failed', err)
      setFailed(true)
      setBusy(false)
    }
  }
  return (
    <div data-paddle-manage="">
      <p className="mb-4 text-copy text-muted">{t.manageDescription}</p>
      <Button variant="secondary" onClick={go} disabled={busy}>{busy ? t.manageOpening : t.manageButton}</Button>
      {failed && <Notice tone="bad" className="mt-4">{t.manageError}</Notice>}
    </div>
  )
}
