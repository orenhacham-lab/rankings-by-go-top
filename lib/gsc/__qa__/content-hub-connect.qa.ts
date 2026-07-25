/**
 * K4 — GSC connect + per-project property assignment from the Content Hub.
 *
 * Reuses the existing user-scoped OAuth (connect/callback) and per-project property
 * routes — no duplicated OAuth/token logic, the per-user onConflict(user_id) upsert
 * preserved, reauth_required handled. The only new behavior is a return-to-hub
 * redirect, which must meet the K1 safety bar: server-built internal path from the
 * VALIDATED state's project id, after all verification, never a client URL.
 *
 * DB/OAuth-coupled routes → source-contract (same approach as K1's Shopify callback).
 */
import { readFileSync } from 'fs'
import { join } from 'path'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')

function main() {
  console.log('K4 — GSC connect/property from the Content Hub')

  const connect = strip(read('app/api/gsc/connect/route.ts'))
  const callback = strip(read('app/api/gsc/callback/route.ts'))
  const panel = strip(read('components/content/GscPanel.tsx'))
  const hub = strip(read('components/content/ContentHub.tsx'))
  const oauth = strip(read('lib/gsc/oauth.ts'))

  // ── connect: sets the return cookie ONLY for a hub origin; still fully gated.
  check('connect still enforces flag + ownership + oauth config (unchanged gates)',
    /isGscReadOnlyEnabled\(\)/.test(connect) && /authContentProject\(projectId\)/.test(connect) && /isGscOAuthConfigured\(\)/.test(connect))
  check('connect reuses createOAuthState (no new OAuth/state logic)', /createOAuthState\(auth\.admin, \{ userId: auth\.user\.id, projectId: auth\.project\.id \}\)/.test(connect))
  check('connect sets the hub-return cookie only when origin === hub', /returnHub = body\.origin === 'hub'/.test(connect) && /set\(GSC_RETURN_COOKIE, returnHub \? 'hub' : ''/.test(connect))
  check('a non-hub origin CLEARS any stale cookie (maxAge 0)', /maxAge: returnHub \? GSC_RETURN_COOKIE_TTL_S : 0/.test(connect))
  check('return cookie is httpOnly + sameSite lax (not a URL)', /httpOnly: true,[^\n]*sameSite: 'lax'/.test(connect))

  // ── callback: return path is server-built from the VALIDATED project id, after verification.
  check('callback reads the return cookie as a fixed enum (=== hub)', /request\.cookies\.get\(GSC_RETURN_COOKIE\)\?\.value === 'hub'/.test(callback))
  check('hub return path is /content?projectId built from the consumed projectId', /new URL\('\/content', origin\)[\s\S]{0,160}searchParams\.set\('projectId', projectId\)/.test(callback))
  check('projectId comes ONLY from the validated one-time state (never client input)',
    /consumeOAuthState\(admin, \{ rawState, userId: user\.id \}\)/.test(callback) && /projectId = consumed\?\.projectId/.test(callback))
  check('every terminal redirect CLEARS the cookie (maxAge 0)', /res\.cookies\.set\(GSC_RETURN_COOKIE, '',[^\n]*maxAge: 0/.test(callback))
  check('redirect host is always the request origin (no open redirect)', /new URL\([\s\S]{0,80}, origin\)/.test(callback) && !/req\.query|body\.|searchParams\.get\('returnTo'|redirect_uri=/.test(callback))

  // ── verification still precedes the success redirect (unchanged security).
  const successIdx = callback.lastIndexOf("back(projectId, { gsc: 'connected' })")
  check('state consume precedes success', callback.indexOf('consumeOAuthState') < successIdx)
  check('user auth precedes success', callback.indexOf('supabase.auth.getUser()') < successIdx)
  check('token exchange precedes success', callback.indexOf('exchangeCodeForTokens(code)') < successIdx)
  check('connection store (onConflict user_id) precedes success', callback.indexOf('storeConnectionFromTokens') < successIdx)

  // ── no duplicate gsc_connections: the per-user upsert path is unchanged.
  check('callback still stores via storeConnectionFromTokens (per-user onConflict preserved)', /storeConnectionFromTokens\(admin, user\.id/.test(callback))
  check('errors route through the SAME origin-aware back() (return to hub on failure too)',
    /return back\(projectId, \{ gsc_error/.test(callback))

  // ── panel reuse: connect origin + property assignment/reauth all preserved.
  check('GscPanel forwards origin (connectOrigin) in the connect body', /body: JSON\.stringify\(\{ projectId, origin: connectOrigin \}\)/.test(panel))
  check('GscPanel default origin is project (project page unchanged)', /connectOrigin = 'project'/.test(panel))
  check('per-project property assignment reused (POST /api/gsc/property)', /'\/api\/gsc\/property', \{ method: 'POST'/.test(panel))
  check('reauth_required is still handled in the panel', /reauth_required/.test(panel))
  check('existing-connection-no-property path is preserved (property picker)', /openPicker|\/api\/gsc\/properties\?projectId=/.test(panel))

  // ── hub mounts the reused panel with the hub origin (no duplicated GSC logic in the hub).
  check('hub mounts GscPanel with connectOrigin="hub"', /<GscPanel projectId=\{projectId\} connectOrigin="hub"/.test(hub))
  check('hub adds no GSC OAuth/token logic of its own', !/oauth|refresh_token|access_token|storeConnection/i.test(hub))

  // ── the return cookie constant lives in the shared oauth module.
  check('GSC_RETURN_COOKIE is defined once in lib/gsc/oauth', /export const GSC_RETURN_COOKIE =/.test(oauth))

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}
main()
