import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ensureDefaultClient } from '@/lib/clients/ensure-default-client'
import { sanitizeNextPath } from '@/lib/i18n/request-locale'
import { sendSignupNotification } from '@/lib/notifications/signup-email'

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
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const code = searchParams.get('code')
  const next = sanitizeNextPath(searchParams.get('next'))

  if (code) {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          },
        },
      }
    )

    const { error, data } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      // Notify the operator of a new signup. The helper only reports accounts
      // created in the last 30 minutes, from the verified user record.
      if (data?.user) {
        try {
          await sendSignupNotification(data.user)
        } catch (emailError) {
          console.error('[Signup] Failed to send notification email:', emailError instanceof Error ? emailError.name : 'unknown')
          // Don't fail the signup if email fails
        }
      }

      // Area C — email-confirmation path: auto-create the default client from signup
      // metadata now that the session exists. Server-authoritative + best-effort; the
      // `supabase` client above carries the just-established session (runs under RLS).
      // Runs BEFORE the redirect below so the client exists by the time the dashboard loads.
      try { await ensureDefaultClient(supabase, createAdminClient()) } catch { /* non-blocking */ }

      // Area G — preserve the signup-origin language through the email-confirmation
      // hop. The durable source is auth metadata (seeds the dashboard provider); this
      // just keeps the choice on the redirect URL so the param is never lost.
      const lang = searchParams.get('lang')
      const dest = new URL(next, origin)
      if (lang === 'en' || lang === 'he') dest.searchParams.set('lang', lang)
      return NextResponse.redirect(dest.toString())
    }
  }

  // Return to login on error
  return NextResponse.redirect(`${origin}/login?error=oauth`)
}
