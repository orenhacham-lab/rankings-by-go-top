/**
 * Stage E1 — OAuth authorization URL contract. The ONLY requested scope is
 * webmasters.readonly (never the writable webmasters scope, never profile/email).
 * access_type=offline + include_granted_scopes=true; redirect_uri comes from server env.
 */
export {} // module scope (uses only dynamic import) — avoids global-script name collisions
let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

async function main() {
  console.log('GSC OAuth authorization URL')
  process.env.GOOGLE_GSC_CLIENT_ID = 'test-client-id.apps.googleusercontent.com'
  process.env.GOOGLE_GSC_CLIENT_SECRET = 'test-secret'
  process.env.GOOGLE_GSC_REDIRECT_URI = 'https://app.example.com/api/gsc/callback'
  const { buildAuthUrl } = await import('../oauth')
  const { GSC_READONLY_SCOPE } = await import('../config')

  const url = new URL(buildAuthUrl('opaque-state-123'))
  const scope = url.searchParams.get('scope') ?? ''

  check('endpoint is Google accounts o/oauth2/v2/auth', url.origin + url.pathname === 'https://accounts.google.com/o/oauth2/v2/auth')
  check('scope is EXACTLY webmasters.readonly', scope === GSC_READONLY_SCOPE && scope === 'https://www.googleapis.com/auth/webmasters.readonly')
  check('does NOT request the writable webmasters scope', !/\/auth\/webmasters(\s|$|[^.])/.test(scope) && !scope.includes('auth/webmasters '))
  check('scope has no profile/email/openid', !/profile|email|openid/.test(scope))
  check('access_type=offline (refresh token)', url.searchParams.get('access_type') === 'offline')
  check('include_granted_scopes=true', url.searchParams.get('include_granted_scopes') === 'true')
  check('response_type=code (authorization-code flow)', url.searchParams.get('response_type') === 'code')
  check('redirect_uri comes from server env', url.searchParams.get('redirect_uri') === 'https://app.example.com/api/gsc/callback')
  check('client_id from server env', url.searchParams.get('client_id') === 'test-client-id.apps.googleusercontent.com')
  check('state is passed through opaquely', url.searchParams.get('state') === 'opaque-state-123')
  check('client_secret is NOT in the auth URL', !url.search.includes('test-secret'))

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}
main()
