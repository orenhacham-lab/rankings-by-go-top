/**
 * THE ROUTE GUARD'S READS MUST OVERLAP, AND MUST DECIDE THE SAME THING.
 *
 * explainAccess runs inside the middleware, which Vercel executes at the edge
 * nearest the reader while the database sits in one region. Its three reads
 * (profiles, the Shopify governance chain, subscriptions) used to run one
 * after another, so a protected page paid three cross-continent round trips
 * before it started rendering. They are independent of each other, so they now
 * start together.
 *
 * A) proves the overlap is real, not incidental: the fake client refuses to
 *    answer ANY read until all three have been issued. Sequential code can
 *    never satisfy that, so this test hangs-then-fails the moment someone puts
 *    an `await` back between them. That is its own mutation control, and A-MUT
 *    runs the sequential shape explicitly to show the harness catches it.
 * B) pins every verdict the guard can reach, so "faster" cannot quietly mean
 *    "different".
 * C) pins the fail-safe: a read that REJECTS (not merely errors) must not
 *    throw out of the middleware, because that would 500 every page.
 */
import { FakeAdmin } from './_fake-admin'
import { explainAccess } from '../subscription'

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: string) {
  if (ok) { passed++; console.log(`  PASS ${name}`) }
  else { failed++; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`) }
}

const NOW = new Date('2026-11-15T12:00:00Z')
const FUTURE = '2026-12-15T00:00:00Z'
const PAST = '2026-10-15T00:00:00Z'
const USER = 'u1'

type Rows = Record<string, Record<string, unknown>[]>

/** A website account with one subscription row, and nothing Shopify about it. */
function websiteWorld(sub: Record<string, unknown> | null): Rows {
  return {
    profiles: [{ id: USER, role: 'user' }],
    billing_governance: [{ user_id: USER, signup_origin: 'website', billing_authority: 'website', authority_reason: 'website_signup' }],
    shopify_connections: [],
    subscriptions: sub ? [{ id: 's1', user_id: USER, created_at: '2026-10-01T00:00:00Z', ...sub }] : [],
  }
}

/**
 * A client that answers nothing until `expected` different tables have been
 * asked for. If the caller awaits one read before issuing the next, the first
 * read never resolves and the await below times out.
 */
function gatedAdmin(rows: Rows, expected: number) {
  const real = new FakeAdmin(rows)
  const asked: string[] = []
  let open!: () => void
  const gate = new Promise<void>((resolve) => { open = resolve })
  const client = {
    from(table: string) {
      asked.push(table)
      if (new Set(asked).size >= expected) open()
      const q = real.from(table) as unknown as Record<string, unknown>
      const wrap = (target: Record<string, unknown>): Record<string, unknown> => new Proxy(target, {
        get(t, prop: string) {
          const v = t[prop]
          if (typeof v !== 'function') return v
          if (prop === 'maybeSingle' || prop === 'single' || prop === 'then') {
            return (...args: unknown[]) => gate.then(() => (v as (...a: unknown[]) => unknown).apply(t, args))
          }
          return (...args: unknown[]) => {
            const out = (v as (...a: unknown[]) => unknown).apply(t, args)
            return out === t ? wrap(t) : out
          }
        },
      })
      return wrap(q)
    },
  }
  return { client, asked }
}

/** Reject rather than hang, so a regression fails loudly instead of stalling. */
function withDeadline<T>(p: Promise<T>, ms: number): Promise<T | 'timed-out'> {
  return Promise.race([p, new Promise<'timed-out'>((r) => setTimeout(() => r('timed-out'), ms))])
}

async function main() {
  console.log('A) the three reads overlap')
  {
    const { client, asked } = gatedAdmin(websiteWorld({ status: 'active', current_period_end: FUTURE }), 3)
    const out = await withDeadline(explainAccess(USER, client as never, () => NOW), 2000)
    check('A1: all three reads are in flight before any of them answers', out !== 'timed-out',
      `tables asked: ${asked.join(', ')}`)
    check('A2: …and they are the three the guard is documented to make',
      new Set(asked).size === 3 && asked.includes('profiles') && asked.includes('billing_governance') && asked.includes('subscriptions'),
      asked.join(', '))
    check('A3: …and the verdict is unchanged', out !== 'timed-out' && out.allowed === true && out.reason === 'website_active',
      out === 'timed-out' ? 'timed out' : out.reason)

    // MUTATION CONTROL — the sequential shape this change replaced, run
    // against the same gate. It must NOT get through.
    const seq = gatedAdmin(websiteWorld({ status: 'active', current_period_end: FUTURE }), 3)
    type Chain = { select: (c: string) => Chain; eq: (c: string, v: unknown) => Chain; maybeSingle: () => Promise<unknown> }
    const sequential = async () => {
      const read = (table: string, col: string) =>
        (seq.client.from(table) as unknown as Chain).select('*').eq(col, USER).maybeSingle()
      await read('profiles', 'id')
      await read('billing_governance', 'user_id')
      await read('subscriptions', 'user_id')
      return 'finished'
    }
    const mut = await withDeadline(sequential() as Promise<string>, 500)
    check('A-MUT: reads awaited one after another never clear the gate', mut === 'timed-out', String(mut))
  }

  console.log('\nB) every verdict is the one it was before')
  {
    const decide = async (rows: Rows) => explainAccess(USER, new FakeAdmin(rows) as never, () => NOW)

    const admin = await decide({ ...websiteWorld(null), profiles: [{ id: USER, role: 'admin' }] })
    check('B1: an admin is allowed, and still reported as admin authority',
      admin.allowed === true && admin.reason === 'admin' && admin.authority === 'admin', admin.reason)

    const none = await decide(websiteWorld(null))
    check('B2: no subscription row denies', none.allowed === false && none.reason === 'website_no_subscription', none.reason)

    const trialOn = await decide(websiteWorld({ status: 'trial', trial_ends_at: FUTURE }))
    check('B3: a trial that has not ended allows', trialOn.allowed === true && trialOn.reason === 'website_trial_active', trialOn.reason)

    const trialOff = await decide(websiteWorld({ status: 'trial', trial_ends_at: PAST }))
    check('B4: an ended trial denies', trialOff.allowed === false && trialOff.reason === 'website_trial_expired', trialOff.reason)

    const active = await decide(websiteWorld({ status: 'active', current_period_end: FUTURE }))
    check('B5: an active period allows', active.allowed === true && active.reason === 'website_active', active.reason)

    const lapsed = await decide(websiteWorld({ status: 'active', current_period_end: PAST }))
    check('B6: a lapsed period denies', lapsed.allowed === false && lapsed.reason === 'website_period_expired', lapsed.reason)

    const cancelledIn = await decide(websiteWorld({ status: 'cancelled', current_period_end: FUTURE }))
    check('B7: a cancelled subscription keeps the period it paid for',
      cancelledIn.allowed === true && cancelledIn.reason === 'website_cancelled_in_period', cancelledIn.reason)

    const cancelledOut = await decide(websiteWorld({ status: 'cancelled', current_period_end: PAST }))
    check('B8: …and not a day longer', cancelledOut.allowed === false && cancelledOut.reason === 'website_cancelled_expired', cancelledOut.reason)

    // Shopify governance still outranks the subscriptions table, and the
    // subscriptions row present here must NOT be what decides.
    const shopifyRows: Rows = {
      profiles: [{ id: USER, role: 'user' }],
      billing_governance: [{ user_id: USER, signup_origin: 'shopify_app_store', billing_authority: 'shopify', authority_reason: 'shopify_app_store_install' }],
      shopify_connections: [],
      subscriptions: [{ id: 's1', user_id: USER, status: 'active', current_period_end: FUTURE, created_at: '2026-10-01T00:00:00Z' }],
    }
    const governed = await decide(shopifyRows)
    check('B9: a Shopify-governed account with no connection is denied, by Shopify authority',
      governed.allowed === false && governed.authority === 'shopify' && governed.reason === 'connection_missing',
      `${governed.authority}/${governed.reason}`)

    const missingGov = await decide({ ...websiteWorld({ status: 'active', current_period_end: FUTURE }), billing_governance: [] })
    check('B10: an absent governance row is still reported as missing, not present',
      missingGov.allowed === true && missingGov.governanceRow === 'missing', String(missingGov.governanceRow))
  }

  console.log('\nC) a read that rejects must not throw out of the middleware')
  {
    const rows = websiteWorld({ status: 'active', current_period_end: FUTURE })
    const real = new FakeAdmin(rows)
    const thrower = {
      from(table: string) {
        if (table !== 'subscriptions') return real.from(table)
        const q = real.from(table) as unknown as Record<string, unknown>
        return new Proxy(q, {
          get(t, prop: string) {
            const v = t[prop]
            if (typeof v !== 'function') return v
            if (prop === 'maybeSingle') return () => Promise.reject(new Error('connection reset'))
            return (...args: unknown[]) => {
              const out = (v as (...a: unknown[]) => unknown).apply(t, args)
              return out === t ? new Proxy(t, this as never) : out
            }
          },
        })
      },
    }
    let threw = false
    let verdict: Awaited<ReturnType<typeof explainAccess>> | null = null
    try { verdict = await explainAccess(USER, thrower as never, () => NOW) } catch { threw = true }
    check('C1: a rejecting subscriptions read does not throw', threw === false)
    check('C2: …and is treated as no subscription, which denies rather than grants',
      verdict !== null && verdict.allowed === false && verdict.reason === 'website_no_subscription',
      verdict ? verdict.reason : 'threw')

    // The same for the governance chain: a rejection there must deny, never
    // fall through to the website branch and grant.
    const govThrower = {
      from(table: string) {
        if (table !== 'billing_governance') return real.from(table)
        const q = real.from(table) as unknown as Record<string, unknown>
        return new Proxy(q, {
          get(t, prop: string) {
            const v = t[prop]
            if (typeof v !== 'function') return v
            if (prop === 'maybeSingle' || prop === 'then') return () => Promise.reject(new Error('connection reset'))
            return (...args: unknown[]) => {
              const out = (v as (...a: unknown[]) => unknown).apply(t, args)
              return out === t ? new Proxy(t, this as never) : out
            }
          },
        })
      },
    }
    let govThrew = false
    let govVerdict: Awaited<ReturnType<typeof explainAccess>> | null = null
    try { govVerdict = await explainAccess(USER, govThrower as never, () => NOW) } catch { govThrew = true }
    check('C3: a rejecting governance read does not throw either', govThrew === false)
    check('C4: …and fails CLOSED, as an unreadable authority',
      govVerdict !== null && govVerdict.allowed === false,
      govVerdict ? `${govVerdict.authority}/${govVerdict.reason}` : 'threw')
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) process.exitCode = 1
}

void main()

export {}
