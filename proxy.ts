import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { explainAccess, type AccessDiagnostics } from '@/lib/subscription'

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // ── Setup mode guard ────────────────────────────────────────────
  // If Supabase isn't configured yet, the createServerClient call below
  // would throw. Detect this early and redirect everyone to /setup so
  // a non-technical user sees clear instructions instead of a crash.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const isConfigured =
    supabaseUrl &&
    supabaseAnonKey &&
    !supabaseUrl.includes('your_') &&
    !supabaseAnonKey.includes('your_')

  if (!isConfigured) {
    // Allow /setup itself and /api/setup/* through (needed for status checks)
    if (pathname === '/setup' || pathname.startsWith('/api/setup')) {
      return NextResponse.next()
    }
    // Redirect everything else to /setup
    const setupUrl = request.nextUrl.clone()
    setupUrl.pathname = '/setup'
    setupUrl.search = ''
    return NextResponse.redirect(setupUrl)
  }

  // ── Normal auth flow ────────────────────────────────────────────
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        )
        supabaseResponse = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        )
      },
    },
  })

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const isProtectedRoute =
    pathname.startsWith('/dashboard') ||
    pathname.startsWith('/clients') ||
    pathname.startsWith('/projects') ||
    pathname.startsWith('/keywords') ||
    pathname.startsWith('/scans') ||
    pathname.startsWith('/reports') ||
    pathname.startsWith('/billing') ||
    pathname.startsWith('/admin')

  if (!user && isProtectedRoute) {
    console.log('[route-guard]', JSON.stringify({
      decision: 'deny', reason: 'no_session', userId: null,
      host: request.nextUrl.hostname, path: request.nextUrl.pathname,
    }))
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/login'
    loginUrl.searchParams.set('next', pathname)
    return NextResponse.redirect(loginUrl)
  }

  if (user && pathname === '/login') {
    const nextParam = request.nextUrl.searchParams.get('next')
    const destination =
      nextParam && nextParam.startsWith('/') ? nextParam : '/dashboard'
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = destination
    redirectUrl.search = ''
    return NextResponse.redirect(redirectUrl)
  }

  // ── Subscription / trial wall ───────────────────────────────────
  // Only check page routes (not API, not /billing itself, not /setup)
  const needsSubscriptionCheck =
    user &&
    isProtectedRoute &&
    !pathname.startsWith('/billing') &&
    !pathname.startsWith('/admin') &&
    !pathname.startsWith('/api/')

  if (needsSubscriptionCheck) {
    // THE CLIENT MATTERS. `supabase` above is built with the ANON key and the
    // merchant's session, so PostgREST runs its queries as `authenticated`.
    // billing_governance is RLS-enabled with NO policies and REVOKEd from
    // anon/authenticated (supabase/migrations/20260901000000_billing_governance
    // .sql:85-87) — only service_role may read it. Passing the session client
    // here made the governance read fail on EVERY request, which collapsed the
    // entire Shopify branch to "denied" and sent Advanced merchants on an
    // active trial to /billing on every protected page. Every other caller of
    // resolveBillingAuthority in this codebase already passes a service-role
    // client; the middleware was the one exception. The user id below is the
    // one Supabase just verified from the session — never a request value — so
    // reading as service_role widens nothing.
    const entitlementClient = createEntitlementClient()
    if (!entitlementClient) {
      // The service-role key is missing: we cannot evaluate entitlement at all.
      // Fail closed (unchanged posture) but say so, so this is never confused
      // with a billing verdict.
      logAccessDecision(request, user.id, { allowed: false, reason: 'entitlement_client_unavailable', authority: 'unreadable' })
      return redirectToBilling(request)
    }

    const decision = await explainAccess(user.id, entitlementClient)
    logAccessDecision(request, user.id, decision)
    if (!decision.allowed) return redirectToBilling(request)
  }

  return supabaseResponse
}

function redirectToBilling(request: NextRequest) {
  const billingUrl = request.nextUrl.clone()
  billingUrl.pathname = '/billing'
  billingUrl.search = ''
  return NextResponse.redirect(billingUrl)
}

/**
 * A service-role Supabase client for the entitlement decision only. Returns
 * null (rather than throwing and 500-ing every page) when the key is absent.
 * The key is read server-side and never reaches the browser.
 *
 * DEPENDENCY, stated explicitly: this works because Supabase's `service_role`
 * carries BYPASSRLS. billing_governance has RLS enabled with NO policies, so a
 * role WITHOUT bypassrls reads zero rows even when it holds SELECT — see
 * supabase/migrations/__qa__/governance-rls-middleware.probe.sql, which
 * executes both cases against a disposable cluster (test 3 vs test 4). The
 * dependency is corroborated in Production, not assumed: /api/shopify/app-home
 * uses createAdminClient() and does read billing_authority for this account.
 * If it ever stopped holding, the guard degrades to `governanceRow: "missing"`
 * in the log below rather than failing silently.
 */
function createEntitlementClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) return null
  return createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
}

/**
 * Structured, non-secret diagnostics for every route-guard decision.
 *
 * Logged as ONE line of JSON so a denial can be explained from the platform log
 * without a repro. Deliberately contains NO cookie, token, secret, HMAC or
 * session payload, and no raw timestamp values — dates are reduced to
 * present/valid/future facts.
 */
function logAccessDecision(request: NextRequest, userId: string, d: AccessDiagnostics | { allowed: boolean; reason: string; authority: string }) {
  const full = d as Partial<AccessDiagnostics> & { allowed: boolean; reason: string; authority: string }
  console.log('[route-guard]', JSON.stringify({
    decision: full.allowed ? 'allow' : 'deny',
    reason: full.reason,
    userId,
    host: request.nextUrl.hostname,
    path: request.nextUrl.pathname,
    authority: full.authority,
    governanceRow: full.governanceRow ?? null,
    connectionFound: full.connectionFound ?? null,
    connectionStatus: full.connectionStatus ?? null,
    subscriptionStatus: full.subscriptionStatus ?? null,
    planHandle: full.planHandle ?? null,
    planHandleSupported: full.planHandleSupported ?? null,
    trialEndsAt: full.trialEndsAt ?? null,
    periodEndsAt: full.periodEndsAt ?? null,
    verifiedAt: full.verifiedAt ?? null,
  }))
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
