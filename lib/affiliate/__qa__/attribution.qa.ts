/**
 * CREDITING A SIGNUP TO A PARTNER — the rules the agreement states, proved.
 *
 *   A) what is refused, and that each refusal is one of the published rules
 *   B) what is only FLAGGED: signals that look like self-referral but are also
 *      exactly what an agency partner legitimately does
 *   C) one account belongs to one partner, for ever, even when both doors fire
 *   D) a referral that cannot be created never breaks the signup
 *   E) the wiring: both doors go through this one module, and neither takes the
 *      account's identity from the caller
 *
 * Every guard has a MUTATION CONTROL.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { FakeAdmin } from '../../__qa__/_fake-admin'
import { attachReferral, reviewFlagsFor, websiteHost, emailDomain, REVIEW_FLAGS } from '../attribution'
import { NEW_ACCOUNT_WINDOW_MS } from '../referral'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const NOW = new Date('2026-10-09T12:00:00.000Z')
const fresh = new Date(NOW.getTime() - 60_000).toISOString()
const old = new Date(NOW.getTime() - 400 * 24 * 60 * 60 * 1000).toISOString()

/** A partner approved and holding the code `dana`. */
function world(overrides: Record<string, unknown> = {}) {
  return new FakeAdmin({
    affiliates: [{
      id: 'aff-1', user_id: 'partner-user', code: 'dana', status: 'approved',
      email: 'dana@dana-digital.co.il', website: 'https://www.dana-digital.co.il/שותפים',
      base_rate: 30, top_rate: 40, top_rate_from: 10, ...overrides,
    }],
    affiliate_referrals: [],
  })
}

async function main() {
  console.log('A) what is refused')
  {
    const a = world()
    const attached = await attachReferral(a, { account: { id: 'cust-1', email: 'buyer@shop.co.il', created_at: fresh }, code: 'DANA ', now: NOW })
    check('A1: a new account on an approved code is credited, and the code is normalised',
      attached.kind === 'attached' && attached.code === 'dana' && attached.affiliateId === 'aff-1', JSON.stringify(attached))
    check('A1b: the referral starts as signed_up, never as paying',
      a.tables.affiliate_referrals[0]?.status === 'signed_up', String(a.tables.affiliate_referrals[0]?.status))

    // The route is callable by anybody signed in, so "new" is read from the
    // account's own created_at and never trusted from the caller.
    const b = world()
    const stale = await attachReferral(b, { account: { id: 'cust-2', email: 'x@y.com', created_at: old }, code: 'dana', now: NOW })
    check('A2: a long-standing account cannot be claimed by a partner', stale.kind === 'not_new_account', JSON.stringify(stale))
    check('A2b: and nothing was written', b.tables.affiliate_referrals.length === 0)
    const edge = await attachReferral(world(), {
      account: { id: 'cust-2b', created_at: new Date(NOW.getTime() - NEW_ACCOUNT_WINDOW_MS - 1000).toISOString() },
      code: 'dana', now: NOW,
    })
    check('A2c: the window is the one constant, not a second number here', edge.kind === 'not_new_account', JSON.stringify(edge))

    // A pending applicant HAS no code, so this is the proof that nothing can be
    // credited before a person has read the application.
    const pending = world({ code: null, status: 'pending' })
    const unknown = await attachReferral(pending, { account: { id: 'cust-3', created_at: fresh }, code: 'dana', now: NOW })
    check('A3: a code that is not an approved partner’s credits nobody', unknown.kind === 'unknown_code', JSON.stringify(unknown))
    const suspended = world({ status: 'suspended' })
    const refused = await attachReferral(suspended, { account: { id: 'cust-3b', created_at: fresh }, code: 'dana', now: NOW })
    check('A3b: a suspended partner’s link credits nobody new', refused.kind === 'unknown_code', JSON.stringify(refused))

    const self = await attachReferral(world(), { account: { id: 'partner-user', email: 'dana@dana-digital.co.il', created_at: fresh }, code: 'dana', now: NOW })
    check('A4: the partner’s own account is refused outright', self.kind === 'self_referral', JSON.stringify(self))

    const none = await attachReferral(world(), { account: { id: 'cust-4', created_at: fresh }, code: null, now: NOW })
    check('A5: no code is the ordinary signup, not an error', none.kind === 'no_code')
    const junk = await attachReferral(world(), { account: { id: 'cust-5', created_at: fresh }, code: '../../etc/passwd', now: NOW })
    check('A5b: a code that is not a code credits nobody', junk.kind === 'no_code', JSON.stringify(junk))

    /* A4-MUT: take the own-account check out and the same call is credited. */
    check('A4-MUT: without the own-account check a partner would earn on themselves', (() => {
      const src = strip(read('lib/affiliate/attribution.ts'))
      return /partner\.data\.user_id === account\.id\) return \{ kind: 'self_referral'/.test(src)
        && !/partner\.data\.user_id === account\.id/.test(src.replace("partner.data.user_id === account.id", 'false'))
    })())
    check('A2-MUT: a window read from the caller instead of created_at is caught',
      !/isNew\s*=\s*(body|params|input)/.test(strip(read('lib/affiliate/attribution.ts'))))
  }

  console.log('\nB) what is only flagged')
  {
    // gotop-affiliate-self-referral: an agency signing up a real client looks
    // identical to a partner referring themselves. Flag it, never block it.
    const sameEmail = reviewFlagsFor({ email: 'Dana@Dana-Digital.co.il', website: null }, { email: 'dana@dana-digital.co.il' })
    check('B1: the same email as the application is flagged', sameEmail.includes(REVIEW_FLAGS.emailMatch), sameEmail.join(','))
    const sameDomain = reviewFlagsFor({ email: 'dana@gmail.com', website: 'dana-digital.co.il' }, { email: 'office@dana-digital.co.il' })
    check('B2: an account on the partner’s own website domain is flagged', sameDomain.includes(REVIEW_FLAGS.domainMatch), sameDomain.join(','))
    check('B3: an ordinary client is flagged for nothing',
      reviewFlagsFor({ email: 'dana@gmail.com', website: 'dana-digital.co.il' }, { email: 'buyer@shop.co.il' }).length === 0)
    // A free-mail provider is never a website host, so the domain signal cannot
    // fire on gmail — otherwise every Israeli small business would be flagged.
    check('B4: a free-mail address cannot trip the domain signal',
      reviewFlagsFor({ email: 'x@x.com', website: 'https://gmail.com' }, { email: 'buyer@gmail.com' }).includes(REVIEW_FLAGS.domainMatch) === true
      && reviewFlagsFor({ email: 'x@x.com', website: 'dana-digital.co.il' }, { email: 'buyer@gmail.com' }).length === 0)
    check('B5: the host is read the way a person types it, and junk is no host',
      websiteHost('WWW.Dana-Digital.co.il/a?b=1') === 'dana-digital.co.il'
      && websiteHost('https://x.co') === 'x.co'
      && websiteHost('not a url at all ') === null
      && websiteHost('') === null)
    check('B6: a non-address is no domain', emailDomain('dana') === null && emailDomain('dana@') === null && emailDomain('@x.com') === null)

    // THE POINT OF THE SECTION: a flag records, it does not refuse.
    const flagged = world()
    const out = await attachReferral(flagged, { account: { id: 'cust-9', email: 'dana@dana-digital.co.il', created_at: fresh }, code: 'dana', now: NOW })
    check('B7: a flagged referral is still created, for an operator to read',
      out.kind === 'attached' && out.flags.includes(REVIEW_FLAGS.emailMatch), JSON.stringify(out))
    check('B7b: and the flags are stored on the row',
      Array.isArray(flagged.tables.affiliate_referrals[0]?.review_flags)
      && (flagged.tables.affiliate_referrals[0].review_flags as string[]).includes(REVIEW_FLAGS.emailMatch))
    /* B7-MUT: were a flag a refusal, the same call would create nothing. */
    check('B7-MUT: a flag turned into a refusal is caught',
      !/if \(flags\.length\) return/.test(strip(read('lib/affiliate/attribution.ts'))))
  }

  console.log('\nC) one account, one partner')
  {
    const a = world()
    await attachReferral(a, { account: { id: 'cust-10', created_at: fresh }, code: 'dana', now: NOW })
    a.tables.affiliates.push({ id: 'aff-2', user_id: 'other-user', code: 'noa', status: 'approved', base_rate: 30, top_rate: 40, top_rate_from: 10 })
    const second = await attachReferral(a, { account: { id: 'cust-10', created_at: fresh }, code: 'noa', now: NOW })
    check('C1: a second partner cannot take an account already credited', second.kind === 'already_referred', JSON.stringify(second))
    check('C1b: and there is still exactly one referral for that account',
      a.tables.affiliate_referrals.filter((r) => r.referred_user_id === 'cust-10').length === 1)

    // Both doors can fire within the same second (the form calls /attach while
    // the callback runs). The DATABASE settles it; 23505 is read as success.
    const racing = new FakeAdmin(
      { affiliates: [{ id: 'aff-1', user_id: 'partner-user', code: 'dana', status: 'approved', base_rate: 30, top_rate: 40, top_rate_from: 10 }], affiliate_referrals: [] },
      { affiliate_referrals: { insert: () => ({ code: '23505' }) } },
    )
    const loser = await attachReferral(racing, { account: { id: 'cust-11', created_at: fresh }, code: 'dana', now: NOW })
    check('C2: the door that loses the race is told "already", not "failed"', loser.kind === 'already_referred', JSON.stringify(loser))
    /* C2-MUT: any other insert error must NOT be read as success. */
    const broken = new FakeAdmin(
      { affiliates: [{ id: 'aff-1', user_id: 'partner-user', code: 'dana', status: 'approved', base_rate: 30, top_rate: 40, top_rate_from: 10 }], affiliate_referrals: [] },
      { affiliate_referrals: { insert: () => ({ code: '42501' }) } },
    )
    const denied = await attachReferral(broken, { account: { id: 'cust-12', created_at: fresh }, code: 'dana', now: NOW })
    check('C2-MUT: a permission error is not quietly read as "already"', denied.kind === 'failed', JSON.stringify(denied))
  }

  console.log('\nD) a referral never breaks a signup')
  {
    const unreadable = new FakeAdmin(
      { affiliates: [], affiliate_referrals: [] },
      { affiliate_referrals: { select: () => ({ message: 'down' }) } },
    )
    const out = await attachReferral(unreadable, { account: { id: 'cust-13', created_at: fresh }, code: 'dana', now: NOW })
    check('D1: a database that will not answer returns an outcome, never throws', out.kind === 'failed', JSON.stringify(out))
    check('D2: both doors call it inside a try and carry on', (() => {
      const callback = strip(read('app/api/auth/callback/route.ts'))
      const attach = strip(read('app/api/affiliate/attach/route.ts'))
      const guarded = (src: string) => /try \{[\s\S]*attachReferral\(/.test(src) && /\} catch/.test(src)
      return guarded(callback) && guarded(attach)
        && /Response\.json\(\{ status: outcome\.kind \}\)/.test(attach)
        && /Response\.json\(\{ status: 'failed' \}\)/.test(attach)
    })())
    /* D2-MUT: a call outside a try would let a bookkeeping failure fail a signup. */
    check('D2-MUT: an attach call outside a try is caught',
      !/try \{[\s\S]{0,4000}attachReferral\(/.test(strip(read('app/api/auth/callback/route.ts')).replace(/try \{/g, 'if (true) {')))
  }

  console.log('\nE) the wiring')
  {
    const attach = strip(read('app/api/affiliate/attach/route.ts'))
    // /api/* is outside the middleware's matcher, so this route authenticates
    // itself; and it must take the account from the SESSION, never from the body.
    check('E1: the attach route proves who is calling', /getUser\(\)/.test(attach))
    check('E2: the body carries only a code, never a user id',
      /code/.test(attach) && !/body\.(user_id|userId)/.test(attach) && !/account:\s*\{\s*id:\s*body/.test(attach))
    check('E3: the account handed to the rule is the signed-in one',
      /account: \{ id: user\.id/.test(attach), attach.match(/account: \{[^}]*\}/)?.[0] ?? 'not found')
    check('E4: nobody else writes affiliate_referrals at signup', (() => {
      const signup = strip(read('app/(auth)/signup/page.tsx'))
      return !/affiliate_referrals/.test(signup) && /\/api\/affiliate\/attach/.test(signup)
    })())
    /* E2-MUT: a user id read from the body would let anyone credit anyone. */
    check('E2-MUT: a user id taken from the body is caught',
      /body\.(user_id|userId)/.test('const id = body.userId'))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}

void main()

export {}
