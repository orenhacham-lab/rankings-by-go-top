import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { hasAccess } from '@/lib/subscription'

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
    const allowed = await hasAccess(user.id, supabase)
    if (!allowed) {
      const billingUrl = request.nextUrl.clone()
      billingUrl.pathname = '/billing'
      billingUrl.search = ''
      return NextResponse.redirect(billingUrl)
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
