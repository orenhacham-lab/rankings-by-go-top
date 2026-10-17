/**
 * GET /api/gsc/callback — Google OAuth redirect target. The ONLY GET that mutates state,
 * and only by consuming its verified one-time state. Exchanges the code, stores/updates the
 * user's encrypted refresh token, and redirects back to the project. On a reconnect that
 * omits refresh_token, the previous valid encrypted refresh token is PRESERVED (never nulled).
 *
 * Never logs codes/tokens. Never returns tokens to the browser.
 */
import { NextResponse, after, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isGscReadOnlyEnabled } from '@/lib/gsc/config'
import { consumeOAuthState } from '@/lib/gsc/state-store'
import { exchangeCodeForTokens, GscOAuthError, GSC_RETURN_COOKIE } from '@/lib/gsc/oauth'
import { storeConnectionFromTokens, GscServiceError } from '@/lib/gsc/service'
import { startBackgroundGscSync } from '@/lib/gsc/background-sync'
import { SETTINGS_GSC_ANCHOR } from '@/lib/content/content-hub-setup'

export const runtime = 'nodejs'
// The first sync runs in after(), which lives inside this function's duration.
export const maxDuration = 300

export async function GET(request: NextRequest) {
  const origin = new URL(request.url).origin

  // Where to return after the flow: the project's settings, the one screen that mounts
  // the panel reading `gsc`/`gsc_error`, straight to its Search Console section. The
  // path is fixed and the project comes from the VALIDATED state below, never from any
  // client-supplied URL. The content workspace's Search Console screen, the other
  // return address (K4, chosen by a 'hub' value of the return cookie), is gone: Search
  // Console feeds the other screens now, so a hub connect returns here too. Every
  // terminal redirect still clears that cookie so a stale value can't affect anything.
  const back = (projectId: string | null, params: Record<string, string>): NextResponse => {
    const url = projectId ? new URL('/settings', origin) : new URL('/projects', origin)
    if (projectId) url.searchParams.set('projectId', projectId)
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
    // Settings is a long screen; the result shows in its Search Console section.
    if (projectId) url.hash = SETTINGS_GSC_ANCHOR
    const res = NextResponse.redirect(url)
    res.cookies.set(GSC_RETURN_COOKIE, '', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 0 })
    return res
  }

  if (!isGscReadOnlyEnabled()) return back(null, { gsc_error: 'disabled' })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return back(null, { gsc_error: 'unauthenticated' })

  const sp = new URL(request.url).searchParams
  const oauthError = sp.get('error')
  const code = sp.get('code')
  const rawState = sp.get('state')

  const admin = createAdminClient()
  // Always consume the state first (single-use), even on an OAuth error, so it can't be replayed.
  const consumed = rawState ? await consumeOAuthState(admin, { rawState, userId: user.id }) : null
  const projectId = consumed?.projectId ?? null
  if (!consumed) return back(null, { gsc_error: 'invalid_state' })
  if (oauthError) return back(projectId, { gsc_error: oauthError === 'access_denied' ? 'access_denied' : 'oauth_error' })
  if (!code) return back(projectId, { gsc_error: 'missing_code' })

  let tokens
  try {
    tokens = await exchangeCodeForTokens(code)
  } catch (e) {
    const codeStr = e instanceof GscOAuthError ? e.code : 'oauth_error'
    return back(projectId, { gsc_error: codeStr })
  }

  // Store the user's single connection via a real onConflict(user_id) upsert. This inspects
  // EVERY database result and throws on failure — so we only report `connected` when the
  // row was actually stored. Preserves the previous encrypted refresh token when Google
  // omits a new one. Never logs the code/tokens/ciphertext or the raw DB message.
  try {
    await storeConnectionFromTokens(admin, user.id, { refreshToken: tokens.refreshToken, scope: tokens.scope })
  } catch (e) {
    const codeStr = e instanceof GscServiceError && e.code === 'no_refresh_token' ? 'no_refresh_token' : 'connection_store_failed'
    return back(projectId, { gsc_error: codeStr })
  }

  // Connected: link the matching property and run the first sync on the server, after the
  // redirect has been sent (not awaited, so the redirect is not delayed, and it keeps going
  // if the user leaves the page). The user's project is re-checked inside; a second trigger
  // (a pick, the button, a reconnect) never runs a second sync at the same time.
  if (projectId) {
    const userId = user.id
    after(() => startBackgroundGscSync({ admin: createAdminClient(), userId, projectId, autoAssign: true }))
  }

  return back(projectId, { gsc: 'connected' })
}
