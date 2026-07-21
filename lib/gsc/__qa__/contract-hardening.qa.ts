/**
 * Stage E1 contract-hardening regression.
 *
 * Blocker 1 — project disconnect (unassign) removes ONLY the project's property and never
 *             revokes the shared user connection; global revoke fails closed while any
 *             project still depends on the connection.
 * Blocker 2 — a non-covering property is never assignable; confirmMismatch is gone.
 * Blocker 3 — every changed DB mutation inspects its error; the OAuth callback only reports
 *             `connected` after the connection is actually stored, and preserves the prior
 *             refresh token when Google omits one.
 *
 * Mix of service-logic checks (in-memory admin fake) and source-contract guards (the route/
 * UI wiring — the established static-guard pattern in this repo).
 */
import crypto from 'crypto'
import { readFileSync } from 'fs'
import { join } from 'path'
import { storeConnectionFromTokens, countProjectsUsingConnection, GscServiceError } from '../service'
import { propertyCoversProjectUrl } from '../property-match'
import { FakeAdmin } from './_fake-admin'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
async function expectError(fn: () => Promise<unknown>): Promise<GscServiceError | null> {
  try { await fn(); return null } catch (e) { return e instanceof GscServiceError ? e : null }
}
const ROOT = join(__dirname, '..', '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

async function main() {
  console.log('GSC Stage E1 contract hardening')
  process.env.GSC_TOKEN_ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex')

  // ── Blocker 1: shared-connection safety (service logic) ────────────────────
  // Two projects (A, B) share ONE user connection.
  const tables = {
    gsc_connections: [{ id: 'conn1', user_id: 'A', status: 'connected', encrypted_refresh_token: 'v1:existing' }],
    project_gsc_properties: [
      { project_id: 'projA', connection_id: 'conn1', site_url: 'sc-domain:a.com' },
      { project_id: 'projB', connection_id: 'conn1', site_url: 'sc-domain:a.com' },
    ],
    gsc_query_page_metrics: [{ sync_run_id: 'r1', project_id: 'projA', query: 'q', page: 'p' }],
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = new FakeAdmin(tables) as any

  check('dependents counted while both projects assigned', (await countProjectsUsingConnection(admin, 'conn1')) === 2)

  // (1)(2) Project disconnect = delete only projA's assignment row.
  const { error: delErr } = await admin.from('project_gsc_properties').delete().eq('project_id', 'projA')
  check('project unassign delete returns no error', !delErr)
  check('(1) only project A assignment removed', !tables.project_gsc_properties.some((r) => r.project_id === 'projA'))
  check('(2) project B still assigned to the SAME connection', tables.project_gsc_properties.some((r) => r.project_id === 'projB' && r.connection_id === 'conn1'))
  check('shared connection preserved after project unassign', tables.gsc_connections.length === 1 && tables.gsc_connections[0].encrypted_refresh_token === 'v1:existing')
  check('historical metrics preserved after project unassign', tables.gsc_query_page_metrics.length === 1)

  // (3) One dependent remains (projB) → global revoke must be blocked.
  check('(3) dependent count is 1 with project B still assigned', (await countProjectsUsingConnection(admin, 'conn1')) === 1)

  // (4) Remove projB too → zero dependents → global revoke allowed.
  await admin.from('project_gsc_properties').delete().eq('project_id', 'projB')
  check('(4) zero dependents once no project assigns the connection', (await countProjectsUsingConnection(admin, 'conn1')) === 0)

  // ── Blocker 2: non-covering never assignable (logic) ───────────────────────
  check('(5) non-covering property does NOT cover project (server would 409)', propertyCoversProjectUrl('sc-domain:example.com', 'https://notexample.com') === false)
  check('(6) covering DOMAIN property is assignable', propertyCoversProjectUrl('sc-domain:example.com', 'https://www.example.com/x') === true)
  check('(7) covering URL-PREFIX property is assignable', propertyCoversProjectUrl('https://www.example.com/', 'https://www.example.com/blog') === true)

  // ── Blocker 3: callback DB failures never report connected (service logic) ─
  // (8) upsert failure → connection_store_failed (never connected).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const upsertFail = new FakeAdmin({ gsc_connections: [] }, { gsc_connections: { upsert: () => ({ message: 'db down' }) } }) as any
  const e8 = await expectError(() => storeConnectionFromTokens(upsertFail, 'A', { refreshToken: 'rt', scope: 's' }))
  check('(8) DB upsert failure throws connection_store_failed', e8?.code === 'connection_store_failed')
  // (9) lookup (select) failure → connection_store_failed.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lookupFail = new FakeAdmin({ gsc_connections: [] }, { gsc_connections: { select: () => ({ message: 'db down' }) } }) as any
  const e9 = await expectError(() => storeConnectionFromTokens(lookupFail, 'A', { refreshToken: 'rt', scope: 's' }))
  check('(9) DB lookup failure throws connection_store_failed', e9?.code === 'connection_store_failed')

  // (10) Existing token preserved when Google omits refresh_token.
  const preserveTables = { gsc_connections: [{ id: 'c1', user_id: 'A', status: 'connected', encrypted_refresh_token: 'v1:keepme', granted_scope: 'old' }] }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const preserveAdmin = new FakeAdmin(preserveTables) as any
  await storeConnectionFromTokens(preserveAdmin, 'A', { scope: 'new' }) // no refreshToken
  check('(10) previous encrypted refresh token preserved on reconnect', preserveTables.gsc_connections[0].encrypted_refresh_token === 'v1:keepme')
  check('(10) reconnect still marks connected + updates scope', preserveTables.gsc_connections[0].status === 'connected' && preserveTables.gsc_connections[0].granted_scope === 'new')
  check('(10) upsert did not create a duplicate row', preserveTables.gsc_connections.length === 1)
  // With a new refresh token, it IS replaced.
  await storeConnectionFromTokens(preserveAdmin, 'A', { refreshToken: 'brand-new', scope: 'new' })
  check('(10) a new refresh token DOES replace the stored one', preserveTables.gsc_connections[0].encrypted_refresh_token !== 'v1:keepme' && preserveTables.gsc_connections[0].encrypted_refresh_token.startsWith('v1:'))

  // ── Source-contract guards (route/UI wiring) ───────────────────────────────
  const conn = read('app/api/gsc/connection/route.ts')
  check('connection route returns connection_in_use + dependentProjectCount', /error: 'connection_in_use', dependentProjectCount/.test(conn))
  check('connection route checks dependents via countProjectsUsingConnection', /countProjectsUsingConnection\(/.test(conn))
  check('connection route revokes ONLY after the dependent check', conn.indexOf('dependentProjectCount > 0') < conn.indexOf('revokeToken(') && conn.indexOf('dependentProjectCount > 0') < conn.indexOf("status: 'revoked'"))
  check('connection route error-checks the revoke update', /if \(error\) return Response\.json\(\{ ok: false, error: 'revoke_failed'/.test(conn))

  const prop = read('app/api/gsc/property/route.ts')
  check('property route no longer reads confirmMismatch', !/confirmMismatch/.test(prop))
  check('property route rejects non-covering with property_does_not_cover_project', /error: 'property_does_not_cover_project'/.test(prop))
  check('property route has NO url_mismatch/requiresConfirmation override', !/property_url_mismatch/.test(prop) && !/requiresConfirmation/.test(prop))
  check('property DELETE error-checks the unassign', /if \(error\) return Response\.json\(\{ ok: false, error: 'unassign_failed'/.test(prop))

  const cb = read('app/api/gsc/callback/route.ts')
  check('callback stores via storeConnectionFromTokens', /storeConnectionFromTokens\(/.test(cb))
  check('callback reports connected ONLY after a successful store', cb.indexOf('storeConnectionFromTokens(') < cb.indexOf("gsc: 'connected'"))
  check('callback maps a store failure to connection_store_failed', /connection_store_failed/.test(cb))
  check('callback returns connected exactly once (no fail-open second path)', (cb.match(/gsc: 'connected'/g) || []).length === 1)
  check('callback never logs (no console.* with code/tokens)', !/console\./.test(cb))

  const svc = read('lib/gsc/service.ts')
  check('finishRun inspects its DB error', /if \(error\) throw new GscServiceError\('run_finalize_failed'/.test(svc))
  check('reclaimStaleRuns inspects its DB error', /if \(error\) throw new GscServiceError\('stale_reclaim_failed'/.test(svc))
  check('storeConnectionFromTokens inspects lookup + upsert errors', /lookupErr\)/.test(svc) && /upsertErr\)/.test(svc))

  const panel = read('components/content/GscPanel.tsx')
  check('UI project disconnect calls DELETE /api/gsc/property', /fetch\(`\/api\/gsc\/property\?projectId=\$\{projectId\}`, \{ method: 'DELETE' \}\)/.test(panel))
  check('UI global revoke calls DELETE /api/gsc/connection', /fetch\(`\/api\/gsc\/connection\?projectId=\$\{projectId\}`, \{ method: 'DELETE' \}\)/.test(panel))
  check('UI global revoke is a de-emphasized <button>, not a primary Button', /<button type="button" onClick=\{handleGlobalRevoke\}/.test(panel))
  check('UI global revoke handles connection_in_use with the count', /connection_in_use.*dependentProjectCount|dependentProjectCount.*connection_in_use/s.test(panel))
  check('UI has no confirmMismatch flow', !/confirmMismatch/.test(panel))
  check('UI disables assign for non-covering + unverified', /disabled=\{isUnverified \|\| !p\.covers/.test(panel))

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}
main()
