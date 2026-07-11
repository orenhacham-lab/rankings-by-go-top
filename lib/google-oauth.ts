/**
 * Google OAuth utilities for direct OAuth flow (not through Supabase)
 * This allows using your own Google OAuth app instead of Supabase's
 */

export function getGoogleOAuthUrl(
  clientId: string,
  redirectUri: string,
  state: string,
  nextPath: string
): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state: state,
    prompt: 'consent',
    access_type: 'offline',
  })

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
}

export function generateState(): string {
  const randomState = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
  return `custom-google_${randomState}`
}

export function saveStateToSession(state: string, nextPath: string): void {
  if (typeof window !== 'undefined') {
    sessionStorage.setItem('oauth_state', state)
    sessionStorage.setItem('oauth_next', nextPath)
  }
}

export function getStateFromSession(): { state: string | null; nextPath: string | null } {
  if (typeof window !== 'undefined') {
    const state = sessionStorage.getItem('oauth_state')
    const nextPath = sessionStorage.getItem('oauth_next')
    // Clear after retrieval
    sessionStorage.removeItem('oauth_state')
    sessionStorage.removeItem('oauth_next')
    return { state, nextPath: nextPath || '/dashboard' }
  }
  return { state: null, nextPath: '/dashboard' }
}
