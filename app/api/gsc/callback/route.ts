/**
 * GET /api/gsc/callback — Google OAuth redirect target. The ONLY GET that mutates state,
 * and only by consuming its verified one-time state. Exchanges the code, stores/updates the
 * user's encrypted refresh token, and redirects back to the project. On a reconnect that
 * omits refresh_token, the previous valid encrypted refresh token is PRESERVED (never nulled).
 *
 * Never logs codes/tokens. Never returns tokens to the browser.
 */
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isGscReadOnlyEnabled } from '@/lib/gsc/config'
import { consumeOAuthState } from '@/lib/gsc/state-store'
import { exchangeCodeForTokens, GscOAuthError } from '@/lib/gsc/oauth'
import { storeConnectionFromTokens, GscServiceError } from '@/lib/gsc/service'

export const runtime = 'nodejs'

function back(origin: string, projectId: string | null, params: Record<string, string>): NextResponse {
  const url = new URL(projectId ? `/projects/${projectId}` : '/projects', origin)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  return NextResponse.redirect(url)
}

export async function GET(request: NextRequest) {
  const origin = new URL(request.url).origin
  if (!isGscReadOnlyEnabled()) return back(origin, null, { gsc_error: 'disabled' })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return back(origin, null, { gsc_error: 'unauthenticated' })

  const sp = new URL(request.url).searchParams
  const oauthError = sp.get('error')
  const code = sp.get('code')
  const rawState = sp.get('state')

  const admin = createAdminClient()
  // Always consume the state first (single-use), even on an OAuth error, so it can't be replayed.
  const consumed = rawState ? await consumeOAuthState(admin, { rawState, userId: user.id }) : null
  const projectId = consumed?.projectId ?? null
  if (!consumed) return back(origin, null, { gsc_error: 'invalid_state' })
  if (oauthError) return back(origin, projectId, { gsc_error: oauthError === 'access_denied' ? 'access_denied' : 'oauth_error' })
  if (!code) return back(origin, projectId, { gsc_error: 'missing_code' })

  let tokens
  try {
    tokens = await exchangeCodeForTokens(code)
  } catch (e) {
    const codeStr = e instanceof GscOAuthError ? e.code : 'oauth_error'
    return back(origin, projectId, { gsc_error: codeStr })
  }

  // Store the user's single connection via a real onConflict(user_id) upsert. This inspects
  // EVERY database result and throws on failure — so we only report `connected` when the
  // row was actually stored. Preserves the previous encrypted refresh token when Google
  // omits a new one. Never logs the code/tokens/ciphertext or the raw DB message.
  try {
    await storeConnectionFromTokens(admin, user.id, { refreshToken: tokens.refreshToken, scope: tokens.scope })
  } catch (e) {
    const codeStr = e instanceof GscServiceError && e.code === 'no_refresh_token' ? 'no_refresh_token' : 'connection_store_failed'
    return back(origin, projectId, { gsc_error: codeStr })
  }

  return back(origin, projectId, { gsc: 'connected' })
}
