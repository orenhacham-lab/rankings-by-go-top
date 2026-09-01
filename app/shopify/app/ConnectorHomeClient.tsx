'use client'

import { useEffect, useState, useCallback } from 'react'

interface ShopifyGlobal {
  idToken: () => Promise<string>
}
interface ShopifyWindow extends Window {
  shopify?: ShopifyGlobal
}

interface AppHomeData {
  connected: boolean
  shopDomain: string
  appUrl: string
  connectionStatus?: 'untested' | 'connected' | 'failed'
  configOk?: boolean
  connectionLastError?: string | null
  project?: { businessName: string | null; targetDomain: string | null } | null
  dashboardUrl?: string
  /** Hotfix — admin billing bypass. true means: no Billing card, no plan-
   *  selection control — the admin may connect/use this store for testing
   *  and publishing, but is never Shopify billing-governed. `billing` is
   *  always null alongside isAdmin: true (see /api/shopify/app-home). */
  isAdmin?: boolean
  /** Reinstall entry: the stored connection is an app_uninstalled tombstone,
   *  so its Admin API token is dead and a fresh managed install (token
   *  exchange) is required before anything works again. */
  /** Which provider bills this store: 'shopify' | 'website' | 'unavailable'. */
  billingProvider?: 'shopify' | 'website' | 'unavailable'
  needsInstall?: boolean
  needsInstallReason?: string
  billing?: {
    status: 'active' | 'none' | 'unknown'
    planHandle: string | null
    trialEndsAt: string | null
    currentPeriodEnd: string | null
    verificationError: string | null
  }
  migrationStatus?: 'pending' | 'shopify_confirmed' | 'completed' | 'paypal_cancel_failed' | null
  lastPublish?: { status: string | null; lastError: string | null; lastSyncedAt: string | null } | null
}

const APP_BRIDGE_WAIT_MS = 10_000

/** Poll for window.shopify (App Bridge CDN script) to be ready, or time out. */
function waitForAppBridge(): Promise<ShopifyGlobal | null> {
  return new Promise((resolve) => {
    const start = Date.now()
    const tick = () => {
      const w = window as ShopifyWindow
      if (w.shopify?.idToken) return resolve(w.shopify)
      if (Date.now() - start > APP_BRIDGE_WAIT_MS) return resolve(null)
      setTimeout(tick, 150)
    }
    tick()
  })
}

// Top-level (frame-breaking) navigation — required for any URL outside this
// app's own iframe scope (Shopify's hosted pricing page, the full Rankings
// dashboard). Same policy as every other Shopify pricing-redirect call site.
function navigateTopLevel(url: string) {
  if (window.top) window.top.location.href = url
  else window.location.href = url
}

/**
 * The ONE resume endpoint this client will ever post the linking handoff to.
 * The server sends its own copy back as `resumePath`; this constant exists so
 * the client can assert the two match exactly before submitting, which means a
 * tampered or unexpected response can never redirect the merchant elsewhere.
 * Mirrors PENDING_LINK_RESUME_PATH in lib/shopify/pending-link.ts.
 */
const LINK_RESUME_PATH = '/api/shopify/link/resume'

/**
 * Hand the signed pending-link handoff to the app's own origin as a TOP-LEVEL
 * form POST.
 *
 * Why a form and not `window.top.location.href`: the handoff must not travel in
 * a URL. In a GET it would sit in browser history, in the Referer of the next
 * request and in every intermediary's access log. A form POST with
 * target="_top" breaks out of the Shopify Admin iframe exactly the same way,
 * but carries the value in a urlencoded body instead — and because the
 * resulting document IS first-party gotopseo.com, the pending-link cookie that
 * response sets is a first-party cookie the browser accepts. That is the whole
 * point: the cookie could not be set from the embedded fetch() response, which
 * is third-party for this origin and gets dropped by modern Chrome.
 *
 * The value is never written to localStorage, sessionStorage or the URL.
 */
function submitLinkHandoffTopLevel(appUrl: string, resumePath: string, handoff: string) {
  const form = document.createElement('form')
  form.method = 'POST'
  form.action = `${appUrl}${resumePath}`
  form.target = '_top'
  const field = document.createElement('input')
  field.type = 'hidden'
  field.name = 'handoff'
  field.value = handoff
  form.appendChild(field)
  document.body.appendChild(form)
  form.submit()
  form.remove()
}

export default function ConnectorHomeClient() {
  const [state, setState] = useState<'loading' | 'no_app_bridge' | 'auth_failed' | 'error' | 'ready'>('loading')
  const [data, setData] = useState<AppHomeData | null>(null)
  const [managePlanBusy, setManagePlanBusy] = useState(false)
  const [installBusy, setInstallBusy] = useState(false)
  const [installError, setInstallError] = useState<string | null>(null)

  /**
   * First-time setup under Shopify-managed installation. Sends a FRESH App
   * Bridge session token to /api/shopify/embedded-install, which verifies it
   * and exchanges it server-side for an offline access token — there is no
   * authorization redirect, so nothing is ever navigated to Shopify and
   * nothing can be blocked by iframe framing rules.
   *
   * The continuation is an internal path chosen by the server (never a URL
   * from this client, and checked against LINK_RESUME_PATH below), so this
   * cannot become an open redirect. It is opened TOP-LEVEL because the pending
   * link has to be established in a first-party gotopseo.com context: the
   * cookie cannot be set on this fetch response, which the browser treats as
   * third-party inside the Shopify Admin iframe.
   */
  const startEmbeddedInstall = async () => {
    setInstallError(null)
    setInstallBusy(true)
    try {
      const bridge = await waitForAppBridge()
      if (!bridge) { setInstallError('Please open this app from Shopify Admin.'); setInstallBusy(false); return }
      const token = await bridge.idToken()
      const res = await fetch('/api/shopify/embedded-install', { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) { setInstallError('We couldn’t finish setting up this store. Please try again.'); setInstallBusy(false); return }
      const json = (await res.json()) as { alreadyConnected?: boolean; resumePath?: string | null; handoff?: string | null }
      if (json.alreadyConnected) { setInstallBusy(false); retry(); return }
      // Both halves must be present AND the path must be exactly the one this
      // client knows about — anything else is not submitted at all.
      if (json.resumePath === LINK_RESUME_PATH && json.handoff) {
        submitLinkHandoffTopLevel(data?.appUrl ?? '', LINK_RESUME_PATH, json.handoff)
        return
      }
      setInstallError('We couldn’t finish setting up this store. Please try again.')
      setInstallBusy(false)
    } catch {
      setInstallError('We couldn’t finish setting up this store. Please try again.')
      setInstallBusy(false)
    }
  }

  // Phase 2 (blocker fix) — never a pre-built Shopify URL: fetches a FRESH
  // App Bridge session token (recommended to re-fetch per request rather
  // than cache) and exchanges it at /api/shopify/billing/start-intent,
  // which authenticates the request, mints a single-use billing intent, and
  // returns a just-in-time redirect URL.
  const startBillingIntent = async () => {
    setManagePlanBusy(true)
    try {
      const bridge = await waitForAppBridge()
      if (!bridge) { setManagePlanBusy(false); return }
      const token = await bridge.idToken()
      const res = await fetch('/api/shopify/billing/start-intent', { headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) { setManagePlanBusy(false); return }
      const json = (await res.json()) as { redirectUrl?: string }
      if (json.redirectUrl) navigateTopLevel(json.redirectUrl)
      else setManagePlanBusy(false)
    } catch {
      setManagePlanBusy(false)
    }
  }

  const load = useCallback(async () => {
    const bridge = await waitForAppBridge()
    if (!bridge) { setState('no_app_bridge'); return }
    let token: string
    try {
      token = await bridge.idToken()
    } catch {
      setState('auth_failed')
      return
    }
    try {
      const res = await fetch('/api/shopify/app-home', { headers: { Authorization: `Bearer ${token}` } })
      if (res.status === 401) { setState('auth_failed'); return }
      if (!res.ok) { setState('error'); return }
      const json = (await res.json()) as AppHomeData
      setData(json)
      setState('ready')
    } catch {
      setState('error')
    }
  }, [])

  useEffect(() => { const t = setTimeout(load, 0); return () => clearTimeout(t) }, [load])

  const retry = () => { setState('loading'); load() }

  if (state === 'loading') {
    return <Centered>Loading…</Centered>
  }
  if (state === 'no_app_bridge') {
    return <Centered>This page must be opened from within Shopify Admin.</Centered>
  }
  if (state === 'auth_failed') {
    return (
      <Centered>
        <p>We couldn&apos;t verify your Shopify session.</p>
        <button onClick={retry} style={buttonStyle}>Try again</button>
      </Centered>
    )
  }
  if (state === 'error' || !data) {
    return (
      <Centered>
        <p>Something went wrong loading your connection status.</p>
        <button onClick={retry} style={buttonStyle}>Try again</button>
      </Centered>
    )
  }

  if (!data.connected) {
    return (
      <Centered>
        <h2 style={{ marginBottom: 8 }}>
          {data.needsInstall ? 'Reconnect this store to Rankings' : 'Connect this store to Rankings'}
        </h2>
        <p style={{ color: '#616161', marginBottom: 16 }}>
          {data.needsInstall
            ? data.needsInstallReason === 'credential_revoked'
              ? `This store's authorisation is no longer accepted by Shopify (${data.shopDomain}), so it needs to be granted again. Continue to finish setting it up.`
              : `The app was reinstalled on this store (${data.shopDomain}), so it needs to be authorised again. Continue to finish setting it up.`
            : `This store (${data.shopDomain}) isn't linked to a Rankings project yet. Continue to finish setting it up — you'll sign in (or sign up) and choose which project to publish to.`}
        </p>
        {installError && <p style={{ color: '#b71c1c', fontSize: 13, marginBottom: 12 }}>{installError}</p>}
        <button onClick={startEmbeddedInstall} disabled={installBusy} style={buttonStyle}>
          {installBusy ? 'Setting up…' : data.needsInstall ? 'Reconnect store' : 'Continue setup'}
        </button>
      </Centered>
    )
  }

  const billing = data.billing

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '32px 20px' }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Rankings by Go Top</h1>
      <p style={{ color: '#616161', marginBottom: 24 }}>{data.shopDomain}</p>

      <Card title="Connection">
        <Row label="Status" value={statusLabel(data.connectionStatus)} />
        <Row label="Rankings project" value={data.project?.businessName || data.project?.targetDomain || '—'} />
        {data.connectionStatus !== 'connected' && data.connectionLastError && (
          <p style={{ color: '#b71c1c', fontSize: 13, marginTop: 8 }}>{data.connectionLastError}</p>
        )}
      </Card>

      {data.isAdmin ? (
        <Card title="Access">
          <p style={{ color: '#202223', fontSize: 14 }}>
            Admin account — full access. This account has full access to the system and does not require a billing plan.
          </p>
        </Card>
      ) : data.billingProvider === 'website' ? (
        /* This merchant registered on the website and connected Shopify as a
           publishing destination, so the website bills them. No Shopify plan
           control is offered, and app-home made no Partner billing call for
           them at all. Connecting a store never moves billing by itself. */
        <Card title="Billing">
          <p style={{ color: '#202223', fontSize: 14 }}>
            Billing for this account is managed on the Rankings website, not through Shopify.
            Your store is connected here as a publishing destination.
          </p>
        </Card>
      ) : data.billingProvider === 'unavailable' ? (
        <Card title="Billing">
          <p style={{ color: '#8a6d3b', fontSize: 14 }}>
            We couldn&apos;t confirm which billing provider manages this account, so plan changes are
            paused for a moment. Nothing has changed — reopen this page shortly.
          </p>
        </Card>
      ) : (
        <Card title="Billing">
          <Row label="Plan" value={billing?.status === 'active' ? (billing.planHandle ?? '—') : billing?.status === 'none' ? 'No active plan' : 'Could not verify'} />
          {billing?.currentPeriodEnd && <Row label="Renews" value={new Date(billing.currentPeriodEnd).toLocaleDateString()} />}
          {data.migrationStatus === 'pending' && (
            <p style={{ color: '#8a6d3b', fontSize: 13, marginTop: 8 }}>Finishing linking your previous billing — this can take a moment.</p>
          )}
          {data.migrationStatus === 'paypal_cancel_failed' && (
            <p style={{ color: '#b71c1c', fontSize: 13, marginTop: 8 }}>Your plan is active, but we&apos;re still finalizing your previous billing. Contact us if this persists.</p>
          )}
          <button onClick={startBillingIntent} disabled={managePlanBusy} style={{ ...buttonStyle, marginTop: 12 }}>
            {managePlanBusy ? 'Redirecting…' : billing?.status === 'active' ? 'Manage plan' : 'Choose a plan'}
          </button>
        </Card>
      )}

      <Card title="Last publish">
        {data.lastPublish ? (
          <>
            <Row label="Status" value={data.lastPublish.status ?? '—'} />
            <Row label="When" value={data.lastPublish.lastSyncedAt ? new Date(data.lastPublish.lastSyncedAt).toLocaleString() : '—'} />
            {data.lastPublish.lastError && <p style={{ color: '#b71c1c', fontSize: 13, marginTop: 8 }}>{data.lastPublish.lastError}</p>}
          </>
        ) : (
          <p style={{ color: '#616161', fontSize: 14 }}>No articles published yet.</p>
        )}
      </Card>

      {data.dashboardUrl && (
        <button onClick={() => navigateTopLevel(data.dashboardUrl!)} style={{ ...buttonStyle, width: '100%', marginTop: 8 }}>
          Open full dashboard
        </button>
      )}
    </div>
  )
}

function statusLabel(status?: string) {
  if (status === 'connected') return 'Connected'
  if (status === 'failed') return 'Needs attention'
  if (status === 'untested') return 'Untested'
  return '—'
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '60vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 24 }}>
      {children}
    </div>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e1e3e5', borderRadius: 8, padding: 16, marginBottom: 16 }}>
      <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: '#202223' }}>{title}</h2>
      {children}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, padding: '4px 0' }}>
      <span style={{ color: '#616161' }}>{label}</span>
      <span style={{ color: '#202223', fontWeight: 500 }}>{value}</span>
    </div>
  )
}

const buttonStyle: React.CSSProperties = {
  background: '#008060',
  color: '#fff',
  border: 'none',
  borderRadius: 6,
  padding: '10px 16px',
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
}
