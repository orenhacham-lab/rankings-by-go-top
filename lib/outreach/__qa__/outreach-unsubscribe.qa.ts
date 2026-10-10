/**
 * The unsubscribe link of an outbound prospecting email.
 *
 * CAN-SPAM makes this link the law's own escape hatch, so it must work for someone with
 * no account, work for at least 30 days, never redirect, and never claim success it did
 * not achieve. The signature is what stops a stranger filling the list with addresses we
 * never wrote to.
 *
 * Every guard runs twice: against the real module, and against a deliberately broken
 * copy that must fail. A guard that cannot fail tests nothing.
 *
 * Run: npx tsx lib/outreach/__qa__/outreach-unsubscribe.qa.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { FakeAdmin } from '@/lib/__qa__/_fake-admin'
import { withMutant } from '@/lib/reminders/__qa__/_mutant'
import { SUPPRESSION_TABLE, hashEmail } from '@/lib/email-suppression'
import { makeOutreachUnsubscribeToken, readOutreachUnsubscribeToken } from '../unsubscribe-token'
import { handleOutreachUnsubscribe, unsubscribeByToken, unsubscribePage } from '../http'

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

const ENV = { CRON_SECRET: 'test-secret-value' }
const OTHER = { CRON_SECRET: 'a-different-secret' }
const EMPTY: Record<string, string | undefined> = {}
const ADDR = 'owner@store.example'

const emptyList = () => new FakeAdmin({ [SUPPRESSION_TABLE]: [] })
const deps = (f: FakeAdmin, env: Record<string, string | undefined> = ENV) => ({ admin: () => asAdmin(f), env })
const rows = (f: FakeAdmin) => f.tables[SUPPRESSION_TABLE] as Record<string, unknown>[]
const req = (token: string | null, method = 'GET') =>
  new Request(`https://app.example/api/outreach/unsubscribe${token === null ? '' : `?t=${encodeURIComponent(token)}`}`, { method })

async function main() {
  console.log('\noutreach unsubscribe — the link CAN-SPAM requires')

  // ── The token ──────────────────────────────────────────────────────────────
  const token = makeOutreachUnsubscribeToken(ADDR, ENV)!
  check('T1: a token is issued and reads back the address it names',
    readOutreachUnsubscribeToken(token, ENV) === ADDR)
  check('T2: the address is normalized before it is signed and after it is read',
    readOutreachUnsubscribeToken(makeOutreachUnsubscribeToken('  Owner@Store.EXAMPLE ', ENV)!, ENV) === ADDR)
  check('T3: no secret configured issues no token', makeOutreachUnsubscribeToken(ADDR, EMPTY) === null)
  check('T4: no secret configured accepts no token (fail closed)',
    readOutreachUnsubscribeToken(token, EMPTY) === null)
  check('T5: a token signed with another secret is refused',
    readOutreachUnsubscribeToken(token, OTHER) === null)
  check('T6: an edited signature is refused',
    readOutreachUnsubscribeToken(`${token.split('.')[0]}.AAAA${token.split('.')[1]!.slice(4)}`, ENV) === null)
  check('T7: an edited address with the old signature is refused',
    readOutreachUnsubscribeToken(
      `${Buffer.from('victim@elsewhere.example', 'utf8').toString('base64url')}.${token.split('.')[1]}`, ENV) === null)
  check('T8: a bare address with no signature is refused',
    readOutreachUnsubscribeToken(ADDR, ENV) === null)
  check('T9: a token of the wrong shape is refused',
    readOutreachUnsubscribeToken(`${token}.extra`, ENV) === null)
  check('T10: a non-string is refused', readOutreachUnsubscribeToken(null, ENV) === null
    && readOutreachUnsubscribeToken(42, ENV) === null)
  check('T11: an absurdly long token is refused',
    readOutreachUnsubscribeToken(`${'a'.repeat(700)}.${token.split('.')[1]}`, ENV) === null)
  check('T12: an address that is not an address gets no token',
    makeOutreachUnsubscribeToken('not-an-address', ENV) === null
    && makeOutreachUnsubscribeToken('', ENV) === null)
  check('T13: one address has exactly one token (padded encodings refused)',
    readOutreachUnsubscribeToken(
      `${Buffer.from(ADDR, 'utf8').toString('base64')}.${token.split('.')[1]}`, ENV) === null)
  check('T14: the token carries no expiry, so an old link still works',
    !/\bexpir|\bttl\b|Date\.now|new Date\(/i.test(stripComments(readFileSync(join(ROOT, 'lib/outreach/unsubscribe-token.ts'), 'utf8'))))

  // ── What the link does ─────────────────────────────────────────────────────
  const listA = emptyList()
  check('U1: a valid token suppresses the address', await unsubscribeByToken(token, deps(listA)) === 'done')
  check('U2: exactly one row is written, keyed by the hash of the address',
    rows(listA).length === 1 && rows(listA)[0].email_hash === hashEmail(ADDR))
  check('U3: the row records how it arrived and from which channel',
    rows(listA)[0].source === 'unsubscribe_link' && rows(listA)[0].channel === 'outbound_prospect')
  check('U4: unsubscribing twice is the same as once',
    await unsubscribeByToken(token, deps(listA)) === 'done' && rows(listA).length === 1)

  const listB = emptyList()
  check('U5: an invalid token changes nothing',
    await unsubscribeByToken('nonsense', deps(listB)) === 'invalid' && rows(listB).length === 0)
  check('U6: with no secret configured nothing is suppressed',
    await unsubscribeByToken(token, deps(listB, EMPTY)) === 'invalid' && rows(listB).length === 0)

  const failingWrite = () => new FakeAdmin({ [SUPPRESSION_TABLE]: [] }, { [SUPPRESSION_TABLE]: { upsert: () => ({ code: 'PGRST500' }) } })
  const broken = failingWrite()
  check('U7: a write that fails is reported, never as success',
    await unsubscribeByToken(token, deps(broken)) === 'unavailable')
  const throwing = { admin: () => { throw new Error('down') }, env: ENV }
  check('U8: a client that throws is reported, never as success',
    await unsubscribeByToken(token, throwing as any) === 'unavailable')

  // ── The route ──────────────────────────────────────────────────────────────
  const listC = emptyList()
  const okRes = await handleOutreachUnsubscribe(req(token), deps(listC))
  const okBody = await okRes.text()
  check('R1: the link answers 200 and the address is on the list',
    okRes.status === 200 && rows(listC).length === 1)
  check('R2: one-click POST from a mail client works the same',
    (await handleOutreachUnsubscribe(req(makeOutreachUnsubscribeToken('second@store.example', ENV)!, 'POST'), deps(listC))).status === 200
    && rows(listC).length === 2)
  check('R3: a missing token answers 400 and writes nothing',
    (await handleOutreachUnsubscribe(req(null), deps(emptyList()))).status === 400)
  check('R4: a tampered token answers 400',
    (await handleOutreachUnsubscribe(req('aaa.bbb'), deps(emptyList()))).status === 400)
  check('R5: a failed write answers 503, so no one is told they are removed',
    (await handleOutreachUnsubscribe(req(token), deps(failingWrite()))).status === 503)
  check('R6: the answer is a page, never a redirect',
    okRes.status < 300 && okRes.headers.get('location') === null)
  check('R7: the page never echoes the address back',
    !okBody.includes(ADDR) && !okBody.includes('owner'))
  check('R8: the page is not cached and not indexed',
    okRes.headers.get('cache-control') === 'no-store'
    && (okRes.headers.get('x-robots-tag') ?? '').includes('noindex')
    && okBody.includes('noindex,nofollow'))
  check('R9: the page says the removal covers every kind of email we send',
    /every kind of email/i.test(unsubscribePage('done')))
  check('R10: a failure page offers the reply-"no" fallback, not a false success',
    /reply/i.test(unsubscribePage('unavailable')) && !/unsubscribed/i.test(unsubscribePage('unavailable')))

  // ── The route file authenticates itself ────────────────────────────────────
  const routeSrc = stripComments(readFileSync(join(ROOT, 'app/api/outreach/unsubscribe/route.ts'), 'utf8'))
  const httpSrc = stripComments(readFileSync(join(ROOT, 'lib/outreach/http.ts'), 'utf8'))
  check('S1: the route reads no session — proxy.ts does not cover /api/*',
    !/getUser|requireAdmin|cookies\(|auth\(/.test(routeSrc))
  check('S2: nothing in the handler redirects, so there is no way off the site',
    !/Response\.redirect|['"]location['"]|NextResponse\.redirect/i.test(httpSrc))
  check('S3: the handler only ever adds to the list — it never deletes or lifts',
    !/\.delete\(|redact\(/.test(httpSrc))

  // ── Mutation controls ──────────────────────────────────────────────────────
  const mutSig = await withMutant<{ readOutreachUnsubscribeToken: typeof readOutreachUnsubscribeToken }, boolean>(
    'lib/outreach/unsubscribe-token.ts',
    [[/  if \(got\.length !== want\.length \|\| !timingSafeEqual\(got, want\)\) return null/, '  if (false) return null']],
    (m) => m.readOutreachUnsubscribeToken(
      `${Buffer.from('victim@elsewhere.example', 'utf8').toString('base64url')}.AAAA`, ENV) === 'victim@elsewhere.example',
  )
  check('T7-MUT: a token whose signature was not checked would let anyone suppress a stranger', mutSig)

  const mutSecret = await withMutant<{
    makeOutreachUnsubscribeToken: typeof makeOutreachUnsubscribeToken
    readOutreachUnsubscribeToken: typeof readOutreachUnsubscribeToken
  }, boolean>(
    'lib/outreach/unsubscribe-token.ts',
    [[/  const secret = env\.CRON_SECRET\n  if \(!secret\) return null/, "  const secret = env.CRON_SECRET ?? 'fallback'"]],
    (m) => {
      const minted = m.makeOutreachUnsubscribeToken(ADDR, EMPTY)
      return minted !== null && m.readOutreachUnsubscribeToken(minted, EMPTY) === ADDR
    },
  )
  check('T4-MUT: a key that falls back when no secret is set would stop failing closed', mutSecret)

  const mutCanon = await withMutant<{ readOutreachUnsubscribeToken: typeof readOutreachUnsubscribeToken }, boolean>(
    'lib/outreach/unsubscribe-token.ts',
    [[/  if \(Buffer\.from\(normalized, 'utf8'\)\.toString\('base64url'\) !== encoded\) return null/, '']],
    (m) => m.readOutreachUnsubscribeToken(`${Buffer.from(ADDR, 'utf8').toString('base64')}.${token.split('.')[1]}`, ENV) === ADDR,
  )
  check('T13-MUT: without the canonical-encoding check one address would have many tokens', mutCanon)

  const mutFail = await withMutant<{ unsubscribeByToken: typeof unsubscribeByToken }, boolean>(
    'lib/outreach/http.ts',
    [[/    return result\.status === 'ok' \? 'done' : 'unavailable'/, "    return 'done'"]],
    async (m) => await m.unsubscribeByToken(token, deps(failingWrite())) === 'done',
  )
  check('U7-MUT: a handler that reported success on a failed write would be caught', mutFail)

  const mutEcho = await withMutant<{ unsubscribePage: typeof unsubscribePage }, boolean>(
    'lib/outreach/http.ts',
    [[/<h1 style="margin:0 0 12px;font-size:22px;">\$\{title\}<\/h1>/, '<h1 style="margin:0 0 12px;font-size:22px;">${title} owner@store.example</h1>']],
    (m) => m.unsubscribePage('done').includes(ADDR),
  )
  check('R7-MUT: a page that echoed the address back would be caught', mutEcho)

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}
main().catch((e) => { console.error(e); process.exit(1) })
export {}
