/**
 * ONE LANGUAGE WITH NOTHING TO WRITE DOES NOT SILENCE THE OTHER NINE — offline.
 *
 * 10 and 11 Nov 2026. Spanish ran out of plan rows: 29 of its keywords are
 * parked as failed and its research added nothing new, so `blog_plan` held no
 * planned Spanish row at all. Spanish was also the hungriest language (last
 * article 9 Nov 06:03), and the window asked for ONE language per pass: every
 * pass of both mornings chose Spanish, found an empty queue, ended the pass,
 * and the nine languages behind it — each with a queue of its own — never got a
 * turn. 10 Nov published seven articles and stopped at 05:31, the minute the
 * order reached Spanish. 11 Nov published nothing at all, in any language.
 *
 * A: the day's queue is every remaining language, hungriest first, not one.
 * B: the window walks it, so an empty queue costs its own slot and no more.
 * C: what still ends the pass — a language in flight, a spent generation, the
 *    deadline — because each of those is a reason not to write another article.
 * Each group ends with a MUTATION CONTROL: the pre-fix behaviour, on the data
 * of the two silent mornings.
 */
process.env.NEXT_PUBLIC_SPANISH_SITE_ENABLED = 'true'
process.env.NEXT_PUBLIC_PORTUGUESE_SITE_ENABLED = 'true'
process.env.NEXT_PUBLIC_FRENCH_SITE_ENABLED = 'true'
process.env.NEXT_PUBLIC_ITALIAN_SITE_ENABLED = 'true'
process.env.NEXT_PUBLIC_JAPANESE_SITE_ENABLED = 'true'
process.env.NEXT_PUBLIC_GERMAN_SITE_ENABLED = 'true'
process.env.BLOG_AUTO_PUBLISH_ENABLED = 'true'

import { readFileSync } from 'node:fs'
import { localesToWrite, nextLocaleToWrite, runBlogDailyWindow, starvationOrder } from '@/lib/blog/auto/daily-window'
import { localesForDay } from '@/lib/blog/auto/rotation'
import { MAX_ATTEMPTS, PLAN_TABLE, STALE_LOCK_MS } from '@/lib/blog/auto/store'
import { TOPUP_FLOOR } from '@/lib/blog/auto/runner'
import { FakeAdmin } from '@/lib/__qa__/_fake-admin'
import type { createAdminClient } from '@/lib/supabase/admin'

type Admin = ReturnType<typeof createAdminClient>
let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name} ${detail === undefined ? '' : JSON.stringify(detail)}`) }
}

/** Where each language stood on the morning of 11 Nov 2026. */
const LAST_PUBLISHED: Record<string, string> = {
  es: '2026-11-09T06:03:11Z', 'pt-BR': '2026-11-09T06:16:40Z', fr: '2026-11-09T06:32:45Z',
  nl: '2026-11-10T04:01:54Z', pl: '2026-11-10T04:17:54Z', he: '2026-11-10T04:32:21Z',
  en: '2026-11-10T04:46:34Z', de: '2026-11-10T05:02:17Z', ja: '2026-11-10T05:17:55Z',
  it: '2026-11-10T05:31:48Z',
}

const article = (locale: string, publishedAt: string) => ({ locale, is_published: true, published_at: publishedAt })
/**
 * A row that COUNTS as planned but cannot be claimed, because its attempts are
 * spent. That is how a queue is exhausted here without calling the keyword
 * research: a queue under TOPUP_FLOOR would reach for the network.
 */
const spent = (locale: string, i: number) => ({
  id: `${locale}-${i}`, locale, topic: `t${i}`, primary_keyword: `k${i}`, secondary_keywords: [],
  monthly_searches: 900 - i, status: 'planned', attempts: MAX_ATTEMPTS, last_error: 'truth:percentage_claim',
  locked_at: null, article_id: null, article_slug: null,
})
/** Every language's queue full of rows it cannot write: nothing to write, no network. */
const allExhausted = () => localesForDay().flatMap((l) =>
  Array.from({ length: TOPUP_FLOOR + 1 }, (_, i) => spent(l, i)))

const yesterdayArticles = () =>
  Object.entries(LAST_PUBLISHED).map(([locale, at]) => article(locale, at))

const fake = (rows: Record<string, unknown>[], articles: Record<string, unknown>[] = []) =>
  new FakeAdmin({ [PLAN_TABLE]: rows, articles })

const IN_WINDOW = Date.parse('2026-11-11T04:05:00Z')
const far = () => Date.now() + 600_000
const ENV = { VERCEL_ENV: 'production' } as unknown as NodeJS.ProcessEnv

async function main() {
  console.log('A) the day\'s queue is every language still owed an article')
  {
    const order = starvationOrder(localesForDay(), LAST_PUBLISHED)
    check('A1: Spanish was the hungriest language on 11 Nov', order[0] === 'es', order)

    const { locales, busy } = await localesToWrite(
      fake(allExhausted(), yesterdayArticles()) as unknown as Admin, IN_WINDOW)
    check('A2: and the queue holds every language, not only Spanish',
      locales.length === localesForDay().length && !busy, locales)
    check('A3: in hunger order, Spanish first and Italian last',
      locales[0] === 'es' && locales[locales.length - 1] === 'it', locales)

    const afterThree = await localesToWrite(
      fake(allExhausted(), [...yesterdayArticles(),
        article('es', '2026-11-11T04:01:00Z'), article('fr', '2026-11-11T04:02:00Z')]) as unknown as Admin,
      IN_WINDOW)
    check('A4: a language that published today is off the queue',
      !afterThree.locales.includes('es') && !afterThree.locales.includes('fr')
      && afterThree.locales.length === localesForDay().length - 2, afterThree.locales)

    // MUTATION CONTROL — what the window used to ask for.
    const one = await nextLocaleToWrite(
      fake(allExhausted(), yesterdayArticles()) as unknown as Admin, IN_WINDOW)
    check('MUTATION: asking for one language answers Spanish alone (so A2 would fail)',
      one.locale === 'es' && !one.busy, one)
  }

  console.log('B) the window walks it instead of stopping at the first')
  {
    const result = await runBlogDailyWindow(
      fake(allExhausted(), yesterdayArticles()) as unknown as Admin,
      { env: ENV, now: IN_WINDOW, deadlineAt: far() })
    check('B1: a pass where nothing can be written tries every language',
      result.state === 'ran' && result.locale === 'it', result)
    // claim_lost, not queue_empty: the rows are there and counted, they just
    // cannot be claimed, so the keyword research is never even reached.
    check('B2: and reports the reason it could not write',
      result.summary?.skipped === 'claim_lost' && result.summary?.published === null, result.summary)

    // The real 11 Nov shape: Spanish exhausted, the rest able to write. The
    // first language the window reaches that CAN write ends the pass, so the
    // assertion is that it gets past Spanish at all.
    const onlySpanishStuck = [
      ...Array.from({ length: TOPUP_FLOOR + 1 }, (_, i) => spent('es', i)),
    ]
    const past = await localesToWrite(
      fake(onlySpanishStuck, yesterdayArticles()) as unknown as Admin, IN_WINDOW)
    check('B3: Spanish keeps its first turn — it is not skipped, only passed',
      past.locales[0] === 'es', past.locales)
    check('B4: and Portuguese and French are behind it, not lost',
      past.locales[1] === 'pt-BR' && past.locales[2] === 'fr', past.locales)

    // MUTATION CONTROL — one language per pass, on the 11 Nov data: the pass
    // ends on Spanish and the nine behind it never run.
    check('MUTATION: one language per pass ends the morning on Spanish (so B1 would fail)',
      (await nextLocaleToWrite(fake(allExhausted(), yesterdayArticles()) as unknown as Admin, IN_WINDOW)).locale === 'es')
  }

  console.log('C) what still ends a pass')
  {
    const busy = await localesToWrite(
      fake([{ ...spent('es', 0), status: 'generating', locked_at: new Date().toISOString() }],
        yesterdayArticles()) as unknown as Admin, IN_WINDOW)
    check('C1: a language being written right now stops the pass, as before',
      busy.busy && busy.locales.length === 0, busy)

    const staleLock = await localesToWrite(
      fake([{ ...spent('es', 0), status: 'generating', locked_at: new Date(Date.now() - STALE_LOCK_MS - 60_000).toISOString() }],
        yesterdayArticles()) as unknown as Admin, IN_WINDOW)
    check('C2: a lock left by a killed run does not',
      !staleLock.busy && staleLock.locales[0] === 'es', staleLock)

    const noTime = await runBlogDailyWindow(
      fake(allExhausted(), yesterdayArticles()) as unknown as Admin,
      { env: ENV, now: IN_WINDOW, deadlineAt: Date.now() - 1 })
    check('C3: a pass out of time writes nothing, whatever the queue holds',
      noTime.state === 'no_time' && noTime.locale === 'es', noTime)

    const done = await runBlogDailyWindow(
      fake(allExhausted(), localesForDay().map((l) => article(l, '2026-11-11T04:10:00Z'))) as unknown as Admin,
      { env: ENV, now: IN_WINDOW, deadlineAt: far() })
    check('C4: a finished morning is still reported once, not walked',
      done.state === 'all_done', done)

    const src = readFileSync('lib/blog/auto/daily-window.ts', 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    check('C5: only an empty queue is passed over — a gate failure keeps its reserve pass',
      /NOTHING_TO_WRITE\s*=\s*new Set\(\['queue_empty', 'claim_lost'\]\)/.test(src),
      src.match(/.{0,60}NOTHING_TO_WRITE.{0,60}/)?.[0])

    // MUTATION CONTROL — a loop that continued on a gate failure would spend
    // every language's generation in one pass.
    check('MUTATION: a truth failure is not in that set (so C5 would fail if it were)',
      !/NOTHING_TO_WRITE[^)]*truth/.test(src))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}
main()

export {}
