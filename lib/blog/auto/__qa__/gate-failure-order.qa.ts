/**
 * A LANGUAGE THAT KEEPS FAILING THE GATES DOES NOT TAKE THE WHOLE MORNING.
 *
 * 12 Nov 2026, the first morning after the starved-queue fix. Spanish published
 * at 04:01 UTC and Portuguese at 05:01, and then French took every pass that
 * followed — 05:46, 06:01, 06:17, 06:32 — and ended each one with nothing:
 * three `truth:percentage_claim` and one `publish:slug_taken`. It took them
 * because it had not published since 9 Nov and so sorted first on hunger every
 * time, and a gate failure ends the pass by design (the Gemini call behind it
 * is already spent). Eight languages that had not been tried at all waited
 * behind it.
 *
 * A: today's refusals come before hunger in the order.
 * B: `gateFailuresTodayByLocale` counts today's refusals and only those.
 * C: the day's queue is built with them, so the morning moves on.
 * Each group ends with a MUTATION CONTROL: the pre-fix behaviour, on the real
 * data of that morning.
 */
process.env.NEXT_PUBLIC_SPANISH_SITE_ENABLED = 'true'
process.env.NEXT_PUBLIC_PORTUGUESE_SITE_ENABLED = 'true'
process.env.NEXT_PUBLIC_FRENCH_SITE_ENABLED = 'true'
process.env.NEXT_PUBLIC_ITALIAN_SITE_ENABLED = 'true'
process.env.NEXT_PUBLIC_JAPANESE_SITE_ENABLED = 'true'
process.env.NEXT_PUBLIC_GERMAN_SITE_ENABLED = 'true'
process.env.NEXT_PUBLIC_DUTCH_SITE_ENABLED = 'true'
process.env.NEXT_PUBLIC_POLISH_SITE_ENABLED = 'true'
process.env.BLOG_AUTO_PUBLISH_ENABLED = 'true'

import { readFileSync } from 'node:fs'
import { localesToWrite, starvationOrder, startOfUtcDay } from '@/lib/blog/auto/daily-window'
import { localesForDay } from '@/lib/blog/auto/rotation'
import { PLAN_TABLE, gateFailuresTodayByLocale } from '@/lib/blog/auto/store'
import { FakeAdmin } from '@/lib/__qa__/_fake-admin'
import type { createAdminClient } from '@/lib/supabase/admin'

type Admin = ReturnType<typeof createAdminClient>
let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name} ${detail === undefined ? '' : JSON.stringify(detail)}`) }
}

/** Where each language stood when French started taking the passes. */
const LAST_PUBLISHED: Record<string, string> = {
  fr: '2026-11-09T06:32:45Z',
  nl: '2026-11-10T04:01:54Z', pl: '2026-11-10T04:17:54Z', he: '2026-11-10T04:32:21Z',
  en: '2026-11-10T04:46:34Z', de: '2026-11-10T05:02:17Z', ja: '2026-11-10T05:17:55Z',
  it: '2026-11-10T05:31:48Z',
  es: '2026-11-12T04:01:43Z', 'pt-BR': '2026-11-12T05:01:56Z',
}

/** 06:40 UTC on 12 Nov, inside the window, after the four French passes. */
const NOW = Date.parse('2026-11-12T06:40:00Z')
const TODAY = startOfUtcDay(NOW)

const article = (locale: string, publishedAt: string) => ({ locale, is_published: true, published_at: publishedAt })
const yesterdayArticles = () => Object.entries(LAST_PUBLISHED).map(([locale, at]) => article(locale, at))

/** A row left carrying the refusal that released it, as releasePlanRow leaves it. */
const refused = (locale: string, i: number, at: string, reason = 'truth:percentage_claim') => ({
  id: `${locale}-f${i}`, locale, topic: `t${i}`, primary_keyword: `k${i}`, secondary_keywords: [],
  monthly_searches: 900 - i, status: 'planned', attempts: 1, last_error: reason,
  locked_at: null, updated_at: at, article_id: null, article_slug: null,
})
/** A row nobody has touched today: planned, never refused. */
const clean = (locale: string, i: number) => ({
  id: `${locale}-c${i}`, locale, topic: `t${i}`, primary_keyword: `ck${i}`, secondary_keywords: [],
  monthly_searches: 800 - i, status: 'planned', attempts: 0, last_error: null,
  locked_at: null, updated_at: '2026-11-05T04:00:00Z', article_id: null, article_slug: null,
})

const fake = (rows: Record<string, unknown>[], articles: Record<string, unknown>[] = []) =>
  new FakeAdmin({ [PLAN_TABLE]: rows, articles })

/** The real morning: French refused four times today, everyone else untouched. */
const THAT_MORNING = () => [
  refused('fr', 1, '2026-11-12T05:46:15Z'),
  refused('fr', 2, '2026-11-12T06:01:58Z', 'publish:slug_taken'),
  refused('fr', 3, '2026-11-12T06:17:41Z'),
  refused('fr', 4, '2026-11-12T06:32:35Z'),
  // Yesterday's refusals, which must not count against anyone today.
  refused('it', 9, '2026-11-11T05:20:00Z'),
  refused('ja', 9, '2026-11-11T05:40:00Z'),
  ...localesForDay().map((l, i) => clean(l, i)),
]

async function main() {
  console.log('A) today\'s refusals come before hunger')
  {
    const hungerOnly = starvationOrder(localesForDay(), LAST_PUBLISHED, {})
    check('A1: with nothing refused, French is first — it is the hungriest',
      hungerOnly[0] === 'fr', hungerOnly)

    const withFailures = starvationOrder(localesForDay(), LAST_PUBLISHED, { fr: 4 })
    check('A2: after four refusals French is last, and an untried language leads',
      withFailures[0] === 'nl' && withFailures[withFailures.length - 1] === 'fr', withFailures)

    const tie = starvationOrder(localesForDay(), LAST_PUBLISHED, { fr: 1, nl: 1, pl: 1 })
    check('A3: languages refused the same number of times fall back to hunger',
      tie.indexOf('fr') < tie.indexOf('nl') && tie.indexOf('nl') < tie.indexOf('pl'), tie)

    const tomorrow = starvationOrder(localesForDay(), LAST_PUBLISHED, {})
    check('A4: the count resets with the day, so French is first again next morning',
      tomorrow[0] === 'fr', tomorrow)

    check('A5: a language that published today sorts last on hunger',
      withFailures.indexOf('pt-BR') > withFailures.indexOf('he'), withFailures)

    // MUTATION CONTROL — the order as it read before this fix.
    const preFix = starvationOrder(localesForDay(), LAST_PUBLISHED)
    check('MUTATION: ignoring today\'s refusals puts French first again (so A2 would fail)',
      preFix[0] === 'fr', preFix)
  }

  console.log('B) the refusal count reads today, and only today')
  {
    const counted = await gateFailuresTodayByLocale(fake(THAT_MORNING()) as unknown as Admin, TODAY)
    check('B1: French is counted four times', counted.fr === 4, counted)
    check('B2: yesterday\'s refusals are not counted against Italian or Japanese',
      counted.it === undefined && counted.ja === undefined, counted)
    check('B3: a language with nothing refused is absent, not zero-filled',
      !('nl' in counted) && !('he' in counted), counted)

    // MUTATION CONTROL — the same read without the day boundary.
    const sinceAlways = await gateFailuresTodayByLocale(
      fake(THAT_MORNING()) as unknown as Admin, '2026-01-01T00:00:00.000Z')
    check('MUTATION: reading from the start of time counts yesterday too (so B2 would fail)',
      sinceAlways.it === 1 && sinceAlways.ja === 1 && sinceAlways.fr === 4, sinceAlways)
  }

  console.log('C) the day\'s queue is built with it')
  {
    const { locales, busy } = await localesToWrite(
      fake(THAT_MORNING(), yesterdayArticles()) as unknown as Admin, NOW)
    check('C1: Spanish and Portuguese, which published today, are off the queue',
      !locales.includes('es') && !locales.includes('pt-BR'), locales)
    check('C2: the next language is one that has not been tried, not French',
      locales[0] === 'nl' && !busy, locales)
    check('C3: French is still on the queue, last — it gets a turn once the others have had theirs',
      locales[locales.length - 1] === 'fr', locales)
    check('C4: every language still owed an article is on it',
      locales.length === localesForDay().length - 2, locales)

    // MUTATION CONTROL — the same morning with no refusal on record.
    const noRefusals = await localesToWrite(
      fake(localesForDay().map((l, i) => clean(l, i)), yesterdayArticles()) as unknown as Admin, NOW)
    check('MUTATION: with no refusals on record French leads the queue (so C2 would fail)',
      noRefusals.locales[0] === 'fr', noRefusals.locales)
  }

  console.log('D) the source says what it does')
  {
    const window = readFileSync('lib/blog/auto/daily-window.ts', 'utf8')
    const store = readFileSync('lib/blog/auto/store.ts', 'utf8')
    check('D1: the order is built from the refusal count, not hunger alone',
      /starvationOrder\(localesForDay\(\), lastPublished, failuresToday\)/.test(window), null)
    check('D2: the count comes from the start of the UTC day',
      /gateFailuresTodayByLocale\(admin, startOfDay\)/.test(window), null)
    check('D3: the read excludes rows with no refusal on them',
      /\.not\('last_error', 'is', null\)/.test(store), null)
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}

void main()

export {}
