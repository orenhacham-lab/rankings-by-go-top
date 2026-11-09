/**
 * THE PROMPT THAT WAS BUILT AND THROWN AWAY.
 *
 * `generateArticleForTopic` discovered an exhausted article allowance at its
 * Phase 3 reservation — after reading the topic, the project, the WordPress
 * connection, the writing guidance, the business context, the depth decision
 * and the internal-link guidance, and after assembling the whole prompt.
 *
 * Measured in Production on 9 November 2026, the day the team's free Vercel
 * Fluid Active CPU allowance ran out: the fifteen-minute content cron built
 * three full "deep" article prompts per run and threw all three away on
 * `quota_exceeded`, ninety-six runs a day.
 *
 * What this suite holds in place is that the early answer is CHEAP and SAFE:
 *   A1  an exhausted allowance is refused before the topic is ever read
 *   A2  a topic that already holds a reservation is NOT refused here, because
 *       Phase 3 still owes it the article that reservation paid for
 *   A3  an admin is not metered, so nothing short-circuits
 *   A4  an entitlement that could not be read is not an exhausted one
 *   A5  and `generateArticleForTopic` really does ask before reading the topic
 *
 * Run: npx tsx lib/content/__qa__/generation-quota-precheck.qa.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { FakeAdmin } from '@/lib/__qa__/_fake-admin'
import { withMutant } from '@/lib/reminders/__qa__/_mutant'
import { isArticleAllowanceSpent } from '@/lib/content/article-generation'
import type { AllowanceState } from '@/lib/billing/usage-allowance'

let pass = 0
let fail = 0
function check(name: string, ok: boolean) {
  if (ok) { pass++; console.log(`  ok   ${name}`) } else { fail++; console.log(`  FAIL ${name}`) }
}

const USER = 'user-1'
const TOPIC = 'topic-1'
const NOW = Date.UTC(2026, 10, 9, 8, 30)

/** A stand-in for the ledger read, which answers a fixed state and counts calls. */
function allowanceOf(state: AllowanceState) {
  const calls: unknown[] = []
  const read = (async (_admin: unknown, args: unknown) => { calls.push(args); return state }) as never
  return { read, calls }
}

const known = (remaining: number): AllowanceState =>
  ({ state: 'known', limit: 20, used: 20 - remaining, remaining, periodStart: null, periodEnd: null, plan: 'basic' })

/** Records every table the subject touched, so "cheap" is measured, not asserted. */
function recordingAdmin(rows: Record<string, Record<string, unknown>[]> = {}) {
  const admin = new FakeAdmin(rows)
  const touched: string[] = []
  const real = admin.from.bind(admin)
  ;(admin as unknown as { from: (n: string) => unknown }).from = (name: string) => { touched.push(name); return real(name) }
  return { admin, touched }
}

async function main() {
  console.log('— A: the allowance read that comes first —')

  {
    const { read } = allowanceOf(known(0))
    const { admin, touched } = recordingAdmin()
    const spent = await isArticleAllowanceSpent(admin as never, { userId: USER, topicId: TOPIC, nowMs: NOW, readAllowance: read })
    check('A1: an exhausted allowance is spent', spent === true)
    check('A1b: and nothing but the reservation ledger was read',
      touched.length === 1 && touched[0] === 'usage_reservations')
  }

  {
    const { read } = allowanceOf(known(3))
    const { admin, touched } = recordingAdmin()
    const spent = await isArticleAllowanceSpent(admin as never, { userId: USER, topicId: TOPIC, nowMs: NOW, readAllowance: read })
    check('A1c: an allowance with articles left is not spent, and reads no table at all',
      spent === false && touched.length === 0)
  }

  {
    // The retry Phase 3 answers with `already_consumed`: the credit is gone
    // BECAUSE this topic spent it, and the article it paid for is owed.
    const { read } = allowanceOf(known(0))
    const { admin } = recordingAdmin({
      usage_reservations: [{ id: 'r1', user_id: USER, usage_type: 'article', idempotency_key: `topic:${TOPIC}`, status: 'consumed' }],
    })
    const spent = await isArticleAllowanceSpent(admin as never, { userId: USER, topicId: TOPIC, nowMs: NOW, readAllowance: read })
    check('A2: a topic holding its own reservation is never refused here', spent === false)
  }

  {
    // Somebody else's topic spent the last credit; this one really has none.
    const { read } = allowanceOf(known(0))
    const { admin } = recordingAdmin({
      usage_reservations: [{ id: 'r1', user_id: USER, usage_type: 'article', idempotency_key: 'topic:other', status: 'consumed' }],
    })
    const spent = await isArticleAllowanceSpent(admin as never, { userId: USER, topicId: TOPIC, nowMs: NOW, readAllowance: read })
    check('A2b: and another topic\'s reservation does not excuse this one', spent === true)
  }

  {
    const { read } = allowanceOf({ state: 'unmetered' })
    const { admin, touched } = recordingAdmin()
    check('A3: an admin is not metered, so nothing is spent',
      (await isArticleAllowanceSpent(admin as never, { userId: USER, topicId: TOPIC, nowMs: NOW, readAllowance: read })) === false
      && touched.length === 0)
  }

  for (const reason of ['entitlement_unavailable', 'no_period'] as const) {
    const { read } = allowanceOf({ state: 'unknown', reason })
    const { admin } = recordingAdmin()
    check(`A4: "${reason}" is not an exhausted allowance`,
      (await isArticleAllowanceSpent(admin as never, { userId: USER, topicId: TOPIC, nowMs: NOW, readAllowance: read })) === false)
  }

  {
    const { read, calls } = allowanceOf(known(0))
    const { admin } = recordingAdmin()
    await isArticleAllowanceSpent(admin as never, { userId: USER, topicId: TOPIC, nowMs: NOW, readAllowance: read })
    const args = calls[0] as { usageType?: string; nowMs?: number; limitFor?: (l: { maxArticlesPerPeriodAccountWide: number }) => number }
    check('A4b: it reads the ARTICLE ledger, on the clock it was given, against the account-wide article limit',
      args?.usageType === 'article' && args?.nowMs === NOW
      && args?.limitFor?.({ maxArticlesPerPeriodAccountWide: 7 } as never) === 7)
  }

  console.log('\n— A5: the call site —')

  const source = readFileSync(join(__dirname, '..', 'article-generation.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  const askedAt = source.indexOf('isArticleAllowanceSpent(admin')
  const topicReadAt = source.indexOf("from('article_topics')")
  const reservedAt = source.indexOf('reserveUsage(admin')
  check('A5: generateArticleForTopic asks before it reads the topic',
    askedAt > 0 && topicReadAt > 0 && askedAt < topicReadAt)
  check('A5b: and the atomic reservation is still there, after it',
    reservedAt > topicReadAt)

  console.log('\n— mutation controls —')

  const mutNoPrecheck = await withMutant<{ isArticleAllowanceSpent: typeof isArticleAllowanceSpent }, boolean>(
    'lib/content/article-generation.ts',
    [[/  if \(allowance\.state !== 'known' \|\| allowance\.remaining > 0\) return false\n/, '  return false\n']],
    async (m) => {
      const { read } = allowanceOf(known(0))
      const { admin } = recordingAdmin()
      return (await m.isArticleAllowanceSpent(admin as never, { userId: USER, topicId: TOPIC, nowMs: NOW, readAllowance: read })) === true
    },
  )
  check('A1-MUT: without the exhaustion test the prompt would be built again',
    mutNoPrecheck === false)

  const mutNoOwnCheck = await withMutant<{ isArticleAllowanceSpent: typeof isArticleAllowanceSpent }, boolean>(
    'lib/content/article-generation.ts',
    [[/  return !ownReservation\n/, '  return true\n']],
    async (m) => {
      const { read } = allowanceOf(known(0))
      const { admin } = recordingAdmin({
        usage_reservations: [{ id: 'r1', user_id: USER, usage_type: 'article', idempotency_key: `topic:${TOPIC}`, status: 'consumed' }],
      })
      return (await m.isArticleAllowanceSpent(admin as never, { userId: USER, topicId: TOPIC, nowMs: NOW, readAllowance: read })) === false
    },
  )
  check('A2-MUT: without the own-reservation test a paid-for article would be refused',
    mutNoOwnCheck === false)

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}
main().catch((e) => { console.error(e); process.exit(1) })
export {}
