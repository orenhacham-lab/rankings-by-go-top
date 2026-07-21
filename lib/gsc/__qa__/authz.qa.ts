/**
 * Stage E1 — server-side authorization. authorizeProjectGsc requires an assigned property
 * AND that the referenced connection belongs to the SAME user (a project owner cannot use
 * another user's connection, even if its id is referenced). getAccessTokenForConnection
 * refuses a revoked connection or one with no stored refresh token — before any network.
 */
import { authorizeProjectGsc, getAccessTokenForConnection, GscServiceError } from '../service'
import { FakeAdmin } from './_fake-admin'
import type { GscConnection } from '@/lib/supabase/types'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
async function expectError(fn: () => Promise<unknown>): Promise<GscServiceError | null> {
  try { await fn(); return null } catch (e) { return e instanceof GscServiceError ? e : null }
}

async function main() {
  console.log('GSC authorization (two owners)')
  // Owner A owns proj-A + connection conn-A; Owner B owns proj-B + connection conn-B.
  const tables = {
    projects: [{ id: 'proj-A', user_id: 'A' }, { id: 'proj-B', user_id: 'B' }],
    gsc_connections: [
      { id: 'conn-A', user_id: 'A', status: 'connected', encrypted_refresh_token: 'v1:aa:bb:cc' },
      { id: 'conn-B', user_id: 'B', status: 'connected', encrypted_refresh_token: 'v1:aa:bb:cc' },
    ],
    project_gsc_properties: [
      { project_id: 'proj-A', connection_id: 'conn-A', site_url: 'sc-domain:a.com' },
    ],
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = new FakeAdmin(tables) as any

  // Happy path: owner A authorizes proj-A via conn-A.
  const ok = await authorizeProjectGsc(admin, 'proj-A', 'A')
  check('owner authorizes own project + own connection', ok.property.project_id === 'proj-A' && ok.connection.id === 'conn-A')

  // No property assigned → no_property_assigned.
  const noProp = await expectError(() => authorizeProjectGsc(admin, 'proj-B', 'B'))
  check('project without an assigned property is rejected', noProp?.code === 'no_property_assigned' && noProp?.status === 409)

  // FORGED reference: point proj-B's assignment at owner A's connection, then have B call.
  tables.project_gsc_properties.push({ project_id: 'proj-B', connection_id: 'conn-A', site_url: 'sc-domain:a.com' })
  const foreign = await expectError(() => authorizeProjectGsc(admin, 'proj-B', 'B'))
  check('cannot use another user\'s connection (foreign connection_id) → forbidden', foreign?.code === 'forbidden' && foreign?.status === 403)

  // getAccessTokenForConnection early guards (no network reached).
  const revoked = await expectError(() => getAccessTokenForConnection(admin, { id: 'c', user_id: 'A', status: 'revoked', encrypted_refresh_token: 'v1:aa:bb:cc' } as GscConnection))
  check('revoked connection → connection_revoked (no refresh attempted)', revoked?.code === 'connection_revoked')
  const noToken = await expectError(() => getAccessTokenForConnection(admin, { id: 'c', user_id: 'A', status: 'connected', encrypted_refresh_token: null } as unknown as GscConnection))
  check('missing stored token → reauth_required', noToken?.code === 'reauth_required')

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}
main()
