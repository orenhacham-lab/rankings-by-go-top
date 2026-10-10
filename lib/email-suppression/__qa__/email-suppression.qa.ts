/**
 * The suppression gate: it must fail CLOSED, it must be one list across channels,
 * and a suppression must never be liftable from here.
 *
 * Every guard runs twice: against the real module, and against a deliberately
 * broken copy that must fail. A guard that cannot fail tests nothing.
 *
 * Run: npx tsx lib/email-suppression/__qa__/email-suppression.qa.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { FakeAdmin } from '@/lib/__qa__/_fake-admin'
import { withMutant } from '@/lib/reminders/__qa__/_mutant'
import {
  SUPPRESSION_TABLE, filterSendable, hashEmail, isSuppressed, normalizeEmail, redact, suppress,
} from '../index'

let pass = 0
let fail = 0
function check(name: string, ok: boolean) {
  if (ok) { pass++; console.log(`  ok   ${name}`) } else { fail++; console.log(`  FAIL ${name}`) }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const asAdmin = (f: FakeAdmin) => f as any
const ROOT = join(__dirname, '..', '..', '..')
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

async function main() {
  console.log('\nemail suppression — the gate before every send')

  // ── Normalization and the key ──────────────────────────────────────────────
  check('N1: the address is trimmed and lower-cased', normalizeEmail('  Owner@Shop.COM ') === 'owner@shop.com')
  check('N2: the hash is a lower-case SHA-256 in hex', /^[0-9a-f]{64}$/.test(hashEmail('owner@shop.com')))
  check('N3: case and spacing do not change the key',
    hashEmail(' OWNER@shop.com ') === hashEmail('owner@shop.com'))
  check('N4: a different address is a different key',
    hashEmail('owner@shop.com') !== hashEmail('owner@other.com'))

  // ── The gate ───────────────────────────────────────────────────────────────
  const listed = new FakeAdmin({ [SUPPRESSION_TABLE]: [{ email_hash: hashEmail('out@shop.com') }] })
  check('G1: an address on the list is suppressed',
    (await isSuppressed(asAdmin(listed), 'out@shop.com')).suppressed)
  check('G2: a listed address is suppressed whatever its case or spacing',
    (await isSuppressed(asAdmin(listed), ' OUT@Shop.com ')).suppressed)
  const fresh = await isSuppressed(asAdmin(listed), 'new@shop.com')
  check('G3: an address not on the list may be sent to', fresh.suppressed === false)

  // ── Fail closed: the whole point ───────────────────────────────────────────
  const broken = new FakeAdmin({ [SUPPRESSION_TABLE]: [] }, { [SUPPRESSION_TABLE]: { select: () => ({ code: 'PGRST500', message: 'down' }) } })
  const onError = await isSuppressed(asAdmin(broken), 'new@shop.com')
  check('F1: an unreadable list suppresses, it does not allow',
    onError.suppressed && onError.reason === 'unreadable')
  const missing = new FakeAdmin({ [SUPPRESSION_TABLE]: [] }, { [SUPPRESSION_TABLE]: { select: () => ({ code: '42P01', message: 'no such table' }) } })
  check('F2: a table that is not installed yet suppresses too',
    (await isSuppressed(asAdmin(missing), 'new@shop.com')).suppressed)
  const thrower = { from: () => { throw new Error('boom') } }
  check('F3: a thrown error suppresses',
    (await isSuppressed(thrower as any, 'new@shop.com')).suppressed)
  for (const bad of ['', '   ', 'not-an-address', '@shop.com', `${'a'.repeat(315)}@shop.com`]) {
    check(`F4: an unsendable address is refused (${JSON.stringify(bad.slice(0, 20))})`,
      (await isSuppressed(asAdmin(listed), bad)).suppressed)
  }

  // ── The batch gate drops, never passes through ─────────────────────────────
  const batch = await filterSendable(asAdmin(listed), ['out@shop.com', 'new@shop.com', 'bad'])
  check('B1: the batch keeps only what the gate cleared', batch.length === 1 && batch[0] === 'new@shop.com')
  check('B2: an unreadable list clears nothing in a batch',
    (await filterSendable(asAdmin(broken), ['a@shop.com', 'b@shop.com'])).length === 0)

  // ── Writing a suppression ──────────────────────────────────────────────────
  const store = new FakeAdmin({ [SUPPRESSION_TABLE]: [] })
  const wrote = await suppress(asAdmin(store), { email: ' Owner@Shop.com ', source: 'unsubscribe_link', channel: 'outbound_prospect' })
  const row = store.tables[SUPPRESSION_TABLE][0] as Record<string, unknown>
  check('W1: the write succeeds', wrote.status === 'ok')
  check('W2: the stored plaintext is normalized', row?.email === 'owner@shop.com')
  check('W3: the stored key is the hash of the normalized address', row?.email_hash === hashEmail('owner@shop.com'))
  check('W4: the source and channel are recorded',
    row?.source === 'unsubscribe_link' && row?.channel === 'outbound_prospect')
  check('W5: an address suppressed in one channel is suppressed for the gate',
    (await isSuppressed(asAdmin(store), 'owner@shop.com')).suppressed)
  const failedWrite = new FakeAdmin({ [SUPPRESSION_TABLE]: [] }, { [SUPPRESSION_TABLE]: { upsert: () => ({ code: 'PGRST500' }) } })
  check('W6: a failed write is reported, never swallowed',
    (await suppress(asAdmin(failedWrite), { email: 'a@shop.com', source: 'manual', channel: 'marketing' })).status === 'failed')
  check('W7: an unsendable address is not written',
    (await suppress(asAdmin(store), { email: 'nope', source: 'manual', channel: 'marketing' })).status === 'failed')

  // ── Redaction keeps the gate working ───────────────────────────────────────
  const red = await redact(asAdmin(store), 'owner@shop.com')
  const after = store.tables[SUPPRESSION_TABLE][0] as Record<string, unknown>
  check('R1: a deletion request redacts the plaintext', red.status === 'ok' && after?.email === null)
  check('R2: redaction is stamped', typeof after?.redacted_at === 'string')
  check('R3: the key survives, so the opt-out still holds',
    after?.email_hash === hashEmail('owner@shop.com')
    && (await isSuppressed(asAdmin(store), 'owner@shop.com')).suppressed)

  // ── The source says what it must ───────────────────────────────────────────
  const src = stripComments(readFileSync(join(ROOT, 'lib/email-suppression/index.ts'), 'utf8'))
  check('S1: the helper never deletes a suppression', !/\.delete\(/.test(src))
  const migration = stripComments(readFileSync(join(ROOT, 'supabase/migrations/20261009180000_email_suppressions.sql'), 'utf8'))
  check('S2: no role is granted DELETE on the table',
    /GRANT SELECT, INSERT, UPDATE ON TABLE public\.email_suppressions TO service_role/.test(migration)
    && !/GRANT[^;]*DELETE[^;]*email_suppressions/.test(migration))
  check('S3: RLS is on and the browser roles are revoked',
    /ALTER TABLE public\.email_suppressions ENABLE ROW LEVEL SECURITY/.test(migration)
    && /REVOKE ALL ON TABLE public\.email_suppressions FROM PUBLIC, anon, authenticated, service_role/.test(migration))
  check('S4: no policy lets a browser role read the list',
    !/CREATE POLICY[^;]*email_suppressions[^;]*TO (authenticated|anon)/.test(migration))
  check('S5: the key is unique', /CREATE UNIQUE INDEX[^;]*email_suppressions_hash_key/.test(migration))

  // ── Mutation controls ──────────────────────────────────────────────────────
  const mutOpen = await withMutant<{ isSuppressed: typeof isSuppressed }, boolean>(
    'lib/email-suppression/index.ts',
    [[/    if \(error\) return \{ suppressed: true, reason: 'unreadable' \}/, "    if (error) return { suppressed: false }"]],
    async (m) => (await m.isSuppressed(asAdmin(broken), 'new@shop.com')).suppressed === false,
  )
  check('F1-MUT: a gate that opened on an error would be caught (F1 can fail)', mutOpen)

  const mutThrow = await withMutant<{ isSuppressed: typeof isSuppressed }, boolean>(
    'lib/email-suppression/index.ts',
    [[/  \} catch \{\n    return \{ suppressed: true, reason: 'unreadable' \}\n  \}/, "  } catch {\n    return { suppressed: false }\n  }"]],
    async (m) => (await m.isSuppressed(thrower as any, 'new@shop.com')).suppressed === false,
  )
  check('F3-MUT: a swallowed throw that allowed the send would be caught', mutThrow)

  const mutCase = await withMutant<{ hashEmail: typeof hashEmail }, boolean>(
    'lib/email-suppression/index.ts',
    [[/  return email\.trim\(\)\.toLowerCase\(\)/, '  return email.trim()']],
    (m) => m.hashEmail(' OWNER@shop.com ') !== m.hashEmail('owner@shop.com'),
  )
  check('N3-MUT: dropping the lower-casing would split the key (N3 can fail)', mutCase)

  const mutBatch = await withMutant<{ filterSendable: typeof filterSendable }, boolean>(
    'lib/email-suppression/index.ts',
    [[/    if \(!check\.suppressed\) sendable\.push\(email\)/, '    sendable.push(email)']],
    async (m) => (await m.filterSendable(asAdmin(listed), ['out@shop.com', 'new@shop.com'])).length === 2,
  )
  check('B1-MUT: a batch that passed everything through would be caught', mutBatch)

  const mutRedact = await withMutant<{ redact: typeof redact }, boolean>(
    'lib/email-suppression/index.ts',
    [[/      \.update\(\{ email: null, redacted_at: new Date\(\)\.toISOString\(\) \}\)/, '      .update({ redacted_at: new Date().toISOString() })']],
    async (m) => {
      const s = new FakeAdmin({ [SUPPRESSION_TABLE]: [{ email_hash: hashEmail('x@shop.com'), email: 'x@shop.com', redacted_at: null }] })
      await m.redact(asAdmin(s), 'x@shop.com')
      return (s.tables[SUPPRESSION_TABLE][0] as Record<string, unknown>).email === 'x@shop.com'
    },
  )
  check('R1-MUT: a redaction that kept the plaintext would be caught', mutRedact)

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}
main().catch((e) => { console.error(e); process.exit(1) })
export {}
