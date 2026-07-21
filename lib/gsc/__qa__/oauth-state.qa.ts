/**
 * Stage E1 — one-time OAuth state security. Only the sha256 hash is stored (raw state
 * never at rest); consume succeeds exactly once, and rejects reuse, expiry, and a
 * user-id mismatch. All enforced atomically in the consuming UPDATE.
 */
import crypto from 'crypto'
import { createOAuthState, consumeOAuthState } from '../state-store'
import { FakeAdmin } from './_fake-admin'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

async function main() {
  console.log('GSC OAuth state (single-use / expiry / user-binding)')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = new FakeAdmin() as any
  const userId = 'user-1', projectId = 'proj-1'

  const raw = await createOAuthState(admin, { userId, projectId })
  check('createOAuthState returns a 64-hex raw state', /^[0-9a-f]{64}$/.test(raw))
  const stored = admin.tables['gsc_oauth_states'][0]
  check('stores only the sha256 HASH, never the raw state', stored.state_hash === crypto.createHash('sha256').update(raw).digest('hex') && stored.state_hash !== raw)
  check('raw state is not persisted in any column', !JSON.stringify(stored).includes(raw))
  check('state is bound to user + project', stored.user_id === userId && stored.project_id === projectId)

  // First consume succeeds and returns the bound project.
  const first = await consumeOAuthState(admin, { rawState: raw, userId })
  check('first consume succeeds → bound projectId', first?.projectId === projectId)
  // Second consume (replay) fails — single use.
  const replay = await consumeOAuthState(admin, { rawState: raw, userId })
  check('replay is rejected (single-use)', replay === null)

  // User mismatch: a different user cannot consume another user's state.
  const raw2 = await createOAuthState(admin, { userId, projectId })
  const mismatch = await consumeOAuthState(admin, { rawState: raw2, userId: 'attacker' })
  check('user-id mismatch is rejected', mismatch === null)
  // And the legitimate user can still consume it afterward (mismatch didn't consume it).
  const legit = await consumeOAuthState(admin, { rawState: raw2, userId })
  check('legitimate user still consumes after a mismatch attempt', legit?.projectId === projectId)

  // Expiry: force the stored row into the past.
  const raw3 = await createOAuthState(admin, { userId, projectId })
  const row3 = admin.tables['gsc_oauth_states'].find((r: Record<string, unknown>) => r.state_hash === crypto.createHash('sha256').update(raw3).digest('hex'))
  row3.expires_at = new Date(Date.now() - 1000).toISOString()
  const expired = await consumeOAuthState(admin, { rawState: raw3, userId })
  check('expired state is rejected', expired === null)

  // Unknown / empty state.
  check('unknown state → null', (await consumeOAuthState(admin, { rawState: 'deadbeef', userId })) === null)
  check('empty state → null', (await consumeOAuthState(admin, { rawState: '', userId })) === null)

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}
main()
