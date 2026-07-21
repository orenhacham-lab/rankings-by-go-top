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
import { encryptGscToken, GSC_ENCRYPTION_VERSION } from '@/lib/gsc/token-crypto'
import type { GscConnection } from '@/lib/supabase/types'

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

  // Upsert the user's single connection. Preserve the existing refresh token when the
  // reconnect response omits one.
  const { data: existingRow } = await admin.from('gsc_connections').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(1).maybeSingle()
  const existing = existingRow as GscConnection | null
  const encryptedRefresh = tokens.refreshToken ? encryptGscToken(tokens.refreshToken) : (existing?.encrypted_refresh_token ?? null)
  if (!encryptedRefresh) return back(origin, projectId, { gsc_error: 'no_refresh_token' })

  const patch = {
    user_id: user.id,
    encrypted_refresh_token: encryptedRefresh,
    encryption_version: GSC_ENCRYPTION_VERSION,
    granted_scope: tokens.scope || existing?.granted_scope || null,
    status: 'connected' as const,
    last_error_code: null,
    last_error_message: null,
    updated_at: new Date().toISOString(),
  }
  if (existing) await admin.from('gsc_connections').update(patch).eq('id', existing.id)
  else await admin.from('gsc_connections').insert(patch)

  return back(origin, projectId, { gsc: 'connected' })
}
