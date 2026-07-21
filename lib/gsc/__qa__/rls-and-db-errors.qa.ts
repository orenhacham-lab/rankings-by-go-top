/**
 * Stage E1 final hardening — RLS ownership contract + fail-closed DB reads.
 *
 * RLS checks are DETERMINISTIC migration-contract assertions (parse the policy SQL): they
 * prove the policy text requires project ownership + connection ownership + selected_by,
 * and that the OAuth-state policies bind user_id = auth.uid(). Real Postgres RLS still
 * requires live acceptance AFTER the migration is applied — these guard the intent so the
 * clauses can't silently regress.
 *
 * The DB-error checks EXECUTE the service against an in-memory admin fake whose reads/writes
 * are forced to error, proving a database failure is never interpreted as "no connection /
 * no property / empty snapshot / already disconnected", and that no token/ciphertext/raw DB
 * message escapes.
 */
import crypto from 'crypto'
import { readFileSync } from 'fs'
import { join } from 'path'
import { loadUserConnection, loadProjectProperty, authorizeProjectGsc, getAccessTokenForConnection, latestSucceededRun, sanitizeConnection, GscServiceError } from '../service'
import { encryptGscToken } from '../token-crypto'
import { FakeAdmin } from './_fake-admin'
import type { GscConnection } from '@/lib/supabase/types'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
async function expectError(fn: () => Promise<unknown>): Promise<GscServiceError | null> {
  try { await fn(); return null } catch (e) { return e instanceof GscServiceError ? e : null }
}
const ROOT = join(__dirname, '..', '..', '..')

/** Extract the body of a `CREATE POLICY <name> ... ;` statement from the migration SQL. */
function policy(sql: string, name: string): string {
  const m = sql.match(new RegExp(`CREATE POLICY ${name} ON[\\s\\S]*?;`))
  return m ? m[0] : ''
}

async function main() {
  console.log('GSC RLS ownership + fail-closed DB reads')
  const sql = readFileSync(join(ROOT, 'supabase/migrations/20260812_add_gsc_readonly.sql'), 'utf8')

  // ── Blocker 1: RLS ownership contract (deterministic) ──────────────────────
  const insP = policy(sql, 'project_gsc_properties_insert')
  const updP = policy(sql, 'project_gsc_properties_update')
  const projOwn = /project_id IN \(SELECT id FROM public\.projects WHERE user_id = auth\.uid\(\)\)/
  const connOwn = /connection_id IN \(SELECT id FROM public\.gsc_connections WHERE user_id = auth\.uid\(\)\)/
  const selBy = /selected_by = auth\.uid\(\)/

  check('(1) INSERT requires project ownership', projOwn.test(insP))
  check('(2) INSERT requires connection ownership', connOwn.test(insP))
  check('(3) INSERT requires selected_by = auth.uid()', selBy.test(insP))
  check('(1) UPDATE WITH CHECK requires project ownership', projOwn.test(updP.split('WITH CHECK')[1] ?? ''))
  check('(2) UPDATE WITH CHECK requires connection ownership', connOwn.test(updP.split('WITH CHECK')[1] ?? ''))
  check('(3) UPDATE WITH CHECK requires selected_by = auth.uid()', selBy.test(updP.split('WITH CHECK')[1] ?? ''))
  check('UPDATE USING still guards ownership of the existing row', projOwn.test((updP.split('WITH CHECK')[0] ?? '')))
  check('(4) a foreign connection_id cannot satisfy the policy (ownership-scoped subquery, not UUID equality)', connOwn.test(insP) && connOwn.test(updP))
  // No admin bypass sneaked in.
  check('no admin override in the property policies', !/is_admin|role = 'admin'|OR true/i.test(insP + updP))

  // (5) OAuth-state policies bind user_id = auth.uid() for INSERT + UPDATE.
  const stInsert = policy(sql, 'gsc_oauth_states_insert')
  const stUpdate = policy(sql, 'gsc_oauth_states_update')
  check('(5) OAuth-state INSERT requires user_id = auth.uid()', /user_id = auth\.uid\(\)/.test(stInsert))
  check('(5) OAuth-state UPDATE requires user_id = auth.uid() (USING + WITH CHECK)', (stUpdate.match(/user_id = auth\.uid\(\)/g) || []).length >= 2)
  check('service_role policy remains for oauth states', /gsc_oauth_states_service[\s\S]*service_role/.test(sql))

  // ── Blocker 2: fail-closed DB reads (executed) ─────────────────────────────
  process.env.GSC_TOKEN_ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex')
  process.env.GOOGLE_GSC_CLIENT_ID = 'cid'; process.env.GOOGLE_GSC_CLIENT_SECRET = 'sec'; process.env.GOOGLE_GSC_REDIRECT_URI = 'https://a/cb'

  // (8) loadUserConnection DB failure ≠ "no connection".
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const connFail = new FakeAdmin({ gsc_connections: [] }, { gsc_connections: { select: () => ({ message: 'db down' }) } }) as any
  const e8 = await expectError(() => loadUserConnection(connFail, 'A'))
  check('(8) loadUserConnection DB failure throws (not null)', e8?.code === 'connection_read_failed')
  // Sanity: a genuinely empty result still returns null (not an error).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const connEmpty = new FakeAdmin({ gsc_connections: [] }) as any
  check('(8b) genuinely-missing connection still returns null', (await loadUserConnection(connEmpty, 'A')) === null)

  // (9) loadProjectProperty DB failure ≠ "no property".
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const propFail = new FakeAdmin({ project_gsc_properties: [] }, { project_gsc_properties: { select: () => ({ message: 'db down' }) } }) as any
  const e9 = await expectError(() => loadProjectProperty(propFail, 'proj'))
  check('(9) loadProjectProperty DB failure throws (not null)', e9?.code === 'property_read_failed')

  // (10) authorizeProjectGsc connection-read failure ≠ "connection missing".
  const authTables = { project_gsc_properties: [{ project_id: 'proj', connection_id: 'c1', site_url: 's' }], gsc_connections: [] }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const authFail = new FakeAdmin(authTables, { gsc_connections: { select: () => ({ message: 'db down' }) } }) as any
  const e10 = await expectError(() => authorizeProjectGsc(authFail, 'proj', 'A'))
  check('(10) authorizeProjectGsc connection-read failure throws connection_read_failed (not connection_missing)', e10?.code === 'connection_read_failed')

  // (11) latestSucceededRun DB failure ≠ "empty snapshot".
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const runFail = new FakeAdmin({ gsc_sync_runs: [] }, { gsc_sync_runs: { select: () => ({ message: 'db down' }) } }) as any
  const e11 = await expectError(() => latestSucceededRun(runFail, 'proj', 28))
  check('(11) latestSucceededRun DB failure throws (not empty)', e11?.code === 'run_read_failed')

  // (6)(7) invalid_grant → reauth_required update; failure → reauth_state_store_failed.
  const token = encryptGscToken('refresh-token-value')
  const connRow = { id: 'c1', user_id: 'A', status: 'connected', encrypted_refresh_token: token } as GscConnection
  const origFetch = globalThis.fetch
  // Force the Google token endpoint to return invalid_grant (no real network).
  globalThis.fetch = (async () => ({ ok: false, status: 400, async json() { return { error: 'invalid_grant' } }, async text() { return '{"error":"invalid_grant"}' } })) as unknown as typeof fetch
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const okAdmin = new FakeAdmin({ gsc_connections: [{ ...connRow }] }) as any
    const e6 = await expectError(() => getAccessTokenForConnection(okAdmin, connRow))
    check('(6) invalid_grant with a successful status update → reauth_required', e6?.code === 'reauth_required')
    check('(6) never returns a token on invalid_grant', e6 !== null)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updFailAdmin = new FakeAdmin({ gsc_connections: [{ ...connRow }] }, { gsc_connections: { update: () => ({ message: 'db down' }) } }) as any
    const e7 = await expectError(() => getAccessTokenForConnection(updFailAdmin, connRow))
    check('(7) invalid_grant with a FAILED status update → reauth_state_store_failed', e7?.code === 'reauth_state_store_failed')
  } finally { globalThis.fetch = origFetch }

  // (12) No token / ciphertext / raw DB message escapes.
  const sanitized = sanitizeConnection(connRow)
  check('(12) sanitizeConnection omits the encrypted token entirely', sanitized !== null && !('encrypted_refresh_token' in (sanitized as object)) && !JSON.stringify(sanitized).includes(token))
  // Typed service errors carry sanitized messages (no "db down" leak) and routes return e.code only.
  check('(12) service DB-error messages are sanitized (no raw DB text)', (e8?.message ?? '').includes('Could not') && !(e8?.message ?? '').includes('db down'))
  const routes = ['app/api/gsc/status/route.ts', 'app/api/gsc/metrics/route.ts', 'app/api/gsc/properties/route.ts', 'app/api/gsc/property/route.ts', 'app/api/gsc/connection/route.ts']
    .map((r) => readFileSync(join(ROOT, r), 'utf8'))
  check('(12) routes return error codes, never e.message', routes.every((s) => /error: e\.code/.test(s) && !/error: e\.message/.test(s)))
  const svc = readFileSync(join(ROOT, 'lib/gsc/service.ts'), 'utf8')
  check('(12) service never logs tokens/ciphertext/DB messages (no console.*)', !/console\./.test(svc))

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}
main()
