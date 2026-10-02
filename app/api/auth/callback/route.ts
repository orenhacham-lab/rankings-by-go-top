import { createServerClient } from '@supabase/ssr'
import type { SupabaseClient, User } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ensureDefaultClient } from '@/lib/clients/ensure-default-client'
import { sanitizeNextPath } from '@/lib/i18n/request-locale'
import { sendSignupNotification } from '@/lib/notifications/signup-email'
import { RESET_PASSWORD_PATH, recoveryFailureUrl } from '@/lib/auth/password-reset'
import { SEED_CLAIM_COOKIE } from '@/lib/onboarding/claim-cookie'
import { afterSignupPath } from '@/lib/onboarding/claim-start'
import { GOOGLE_FLOW_COOKIE, completeGoogleSignIn, googleDirectConfig, googleFlowCookieOptions, matchGoogleState } from '@/lib/auth/google-direct'
import { googleSignInFailureUrl } from '@/lib/auth/google-signin'

/**
 * Supabase auth callback (email confirmation and Supabase-hosted OAuth, PKCE).
 *
 * SECURITY. This route used to also run a hand-rolled "custom Google OAuth"
 * branch, selected by any `state` starting with `custom-google_`. That branch
 * signed users in by giving their account the password
 * `google_<first 20 chars of the Google account id>` — a value that is not
 * secret — and, for an EXISTING account with the same email, overwrote the
 * user's own password with it and force-confirmed the email. It never checked
 * Google's `verified_email`, and `state` was never compared with anything, so
 * it was also open to login CSRF. Nothing in the app starts that flow any more
 * (lib/google-oauth.ts had no importers), so the branch is removed entirely
 * rather than patched: a `custom-google_` state now simply fails like any
 * other invalid code.
 *
 * THE SITE'S OWN GOOGLE CLIENT (lib/auth/google-direct.ts) returns here too,
 * because this is the redirect URI registered on that client. Its branch runs
 * ONLY when the request carries a `state` AND the flow cookie its start route
 * set: the state must match the signed cookie (constant time), the cookie is
 * cleared whatever happens, the code is exchanged server-side with the PKCE
 * verifier, and Supabase signs the visitor in from Google's id_token
 * (signInWithIdToken, with the nonce). No password, no admin API. A signed-in
 * visitor then takes exactly the same path as every other sign-in below.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const code = searchParams.get('code')
  const next = sanitizeNextPath(searchParams.get('next'))

  const state = searchParams.get('state')
  const flowCookie = request.cookies.get(GOOGLE_FLOW_COOKIE)?.value
  if (state && flowCookie) return googleDirectCallback(request, state, flowCookie)

  if (code) {
    const cookieStore = await cookies()
    const supabase = supabaseFor(cookieStore)

    const { error, data } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) return signedIn(supabase, data?.user ?? null, { cookieStore, next, lang: searchParams.get('lang'), origin })
  }

  // Return to login on error — in the language the visitor signed up in, where
  // the login page now says the link was invalid or expired instead of showing
  // an unexplained empty form.
  const lang = searchParams.get('lang')
  // A password-recovery link that could not be exchanged (expired, used
  // twice) goes back to the request form, which says so and offers a new one.
  if (next === RESET_PASSWORD_PATH) return NextResponse.redirect(recoveryFailureUrl(origin, lang).toString())
  const failed = new URL(lang === 'en' ? '/en/login' : '/login', origin)
  failed.searchParams.set('error', 'oauth')
  if (lang === 'he') failed.searchParams.set('lang', 'he')
  return NextResponse.redirect(failed.toString())
}

type CookieStore = Awaited<ReturnType<typeof cookies>>

/**
 * Every successful sign-in ends here, whichever door it came through: the
 * signup notice, the default client, the free check's claim, the language.
 */
async function signedIn(
  supabase: SupabaseClient,
  user: User | null,
  { cookieStore, next, lang, origin }: { cookieStore: CookieStore; next: string; lang: string | null; origin: string },
): Promise<NextResponse> {
  // Notify the operator of a new signup. The helper only reports accounts
  // created in the last 30 minutes, from the verified user record.
  if (user) {
    try {
      await sendSignupNotification(user)
    } catch (emailError) {
      console.error('[Signup] Failed to send notification email:', emailError instanceof Error ? emailError.name : 'unknown')
      // Don't fail the signup if email fails
    }
  }

  // Area C — auto-create the default client from signup metadata now that the
  // session exists. Server-authoritative + best-effort; `supabase` carries the
  // just-established session (runs under RLS). Runs BEFORE the redirect below
  // so the client exists by the time the dashboard loads.
  try { await ensureDefaultClient(supabase, createAdminClient()) } catch { /* non-blocking */ }

  // Area G — preserve the signup-origin language through the hop. The durable
  // source is auth metadata (seeds the dashboard provider); this just keeps
  // the choice on the redirect URL so the param is never lost.
  // A sign-up that carried a free-check claim opens the project made from
  // that scan instead of an empty dashboard (lib/onboarding/claim-start.ts).
  // The claim cookie arrives with the navigation, in any tab of this browser.
  // Only the default landing is replaced, and only by one fixed internal path;
  // any other `next` is kept as it was.
  const landing = afterSignupPath({ next, claimCookie: cookieStore.get(SEED_CLAIM_COOKIE)?.value, env: process.env })
  const dest = new URL(landing, origin)
  if (lang === 'en' || lang === 'he') dest.searchParams.set('lang', lang)
  return NextResponse.redirect(dest.toString())
}

function supabaseFor(cookieStore: CookieStore): SupabaseClient {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        },
      },
    }
  )
}

/**
 * Google's return to the site's own client. Any failure lands on the sign-in
 * form with one generic line in the visitor's language, and clears the flow
 * cookie; the log names a reason code, never a token, a code or
 * Google's/Supabase's own text.
 */
async function googleDirectCallback(request: NextRequest, state: string, flowCookie: string): Promise<NextResponse> {
  const { searchParams, origin } = request.nextUrl
  const config = googleDirectConfig()
  const flow = config ? matchGoogleState(config, flowCookie, state) : null
  const fail = (reason: string) => {
    console.error('[google-signin] refused:', reason)
    const res = NextResponse.redirect(googleSignInFailureUrl(origin, flow?.lang ?? null))
    res.cookies.set(GOOGLE_FLOW_COOKIE, '', googleFlowCookieOptions(0))
    return res
  }
  if (!config) return fail('not_configured')
  if (!flow) return fail('state_mismatch')
  const code = searchParams.get('code')
  if (!code) return fail(searchParams.get('error') === 'access_denied' ? 'access_denied' : 'no_code')

  const cookieStore = await cookies()
  // Single use: the flow cookie goes with this response, whatever happens next.
  cookieStore.set(GOOGLE_FLOW_COOKIE, '', googleFlowCookieOptions(0))
  const supabase = supabaseFor(cookieStore)
  const result = await completeGoogleSignIn({ config, flow, code, origin, supabase })
  if (!result.ok) return fail(result.reason)
  return signedIn(supabase, result.user, { cookieStore, next: flow.next, lang: flow.lang, origin })
}
