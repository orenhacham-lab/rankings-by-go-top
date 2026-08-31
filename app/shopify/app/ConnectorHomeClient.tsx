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
   * `next` is an internal path chosen by the server (never a URL from this
   * client), so this cannot become an open redirect. It is opened top-level
   * because /shopify/link signs the merchant in to Rankings, which needs a
   * first-party context.
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
      const json = (await res.json()) as { alreadyConnected?: boolean; next?: string | null }
      if (json.alreadyConnected) { setInstallBusy(false); retry(); return }
      if (json.next) navigateTopLevel(`${data?.appUrl ?? ''}${json.next}`)
      else setInstallBusy(false)
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
            ? `The app was reinstalled on this store (${data.shopDomain}), so it needs to be authorised again. Continue to finish setting it up.`
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
