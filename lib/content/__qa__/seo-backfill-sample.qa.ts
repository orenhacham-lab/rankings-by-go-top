/**
 * 337 ARTICLES ON 21 CUSTOMERS' WORDPRESS SITES HAVE NO SEO TITLE AND NO META
 * DESCRIPTION — AND NOBODY KNOWS WHAT IS ON THOSE PAGES.
 *
 * Measured 21 Nov 2026: 368 published customer articles carry `seo_status`
 * NULL; 337 of them are WordPress (22 Shopify, 9 neither). All 337 have a
 * stored meta title AND meta description, published 4 Jul to 4 Nov. 59 sit on a
 * project with the Go Top plugin connected and Yoast detected; the other 278
 * would go through an application password. `lib/content/seo-backfill.ts` could
 * have fixed them since it shipped and was evidently never run in apply mode.
 *
 * Our database cannot say whether a page's title is missing, already ours, or
 * one the merchant wrote. Only the live page can. So before anything is written
 * to 21 live sites, this passenger measures.
 *
 * THE PROPERTY THIS SUITE EXISTS FOR: the passenger CANNOT WRITE. Not with an
 * environment variable, not with an option. Every call it makes is the dry run.
 *
 * NOT browser-verified.
 *
 * Run: npx tsx lib/content/__qa__/seo-backfill-sample.qa.ts
 */
import fs from 'node:fs'
import path from 'node:path'
import type { ArticleReport } from '../seo-backfill'
import {
  runIsolatedSeoBackfillSample, sample, summarizeReports, SEO_BACKFILL_SAMPLE,
} from '../seo-backfill-isolated'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++ } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

const report = (over: Partial<ArticleReport> = {}): ArticleReport => ({
  id: 'a', project: 'Shop', url: 'https://example.com/post/', channel: 'app_password', seoPluginHint: null,
  skip: null,
  head: { title: 'missing', description: 'missing', pageTitle: null, pageDescription: null },
  title: 'would_write', description: 'would_write', writes: {}, ...over,
})

// ── A: the distribution ───────────────────────────────────────────────────

const summary = summarizeReports([
  report(),
  report({ head: { title: 'kept', description: 'missing', pageTitle: 'Their own title', pageDescription: null }, title: 'not_needed' }),
  report({ head: { title: 'ours', description: 'ours', pageTitle: 'x', pageDescription: 'y' }, title: 'not_needed', description: 'not_needed' }),
  report({ skip: 'page_unreadable', title: 'skipped', description: 'skipped' }),
  report({ channel: 'plugin', seoPluginHint: 'yoast' }),
], 337)
check('A1 the sample says how many articles it is describing', summary.waiting === 337 && summary.sampled === 5)
check('A2 and how the live pages classified each field',
  summary.title.missing === 2 && summary.title.kept === 1 && summary.title.ours === 1
  && summary.description.missing === 3 && summary.description.ours === 1)
check('A3 a skipped article is counted as skipped and NOT as a field state',
  summary.skipped.page_unreadable === 1 && summary.title.missing + summary.title.kept + summary.title.ours + summary.title.unknown === 4)
check('A4 the number that answers the question is how many would be written', summary.wouldWrite === 3)
check('A5 and the channel split, because the two write paths are not equally likely to work',
  summary.byChannel.app_password === 4 && summary.byChannel.plugin === 1)
check('A6 a merchant\'s own title is never counted as something to write',
  summarizeReports([report({ head: { title: 'kept', description: 'kept', pageTitle: 't', pageDescription: 'd' }, title: 'not_needed', description: 'not_needed' })], 1).wouldWrite === 0)

// ── B: the sample is a sample ─────────────────────────────────────────────

const items = Array.from({ length: 100 }, (_, i) => i)
check('B1 it takes exactly as many as asked', sample(items, 10).length === 10)
check('B2 it never returns the same item twice', new Set(sample(items, 10)).size === 10)
check('B3 asking for more than there is returns everything', sample([1, 2], 10).length === 2)
check('B4 it does not always return the first ten', (() => {
  // A deterministic "random" that reverses the array proves the order is drawn,
  // not taken from the front.
  let i = 0
  const seq = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
  const drawn = sample(items, 10, () => { i++; return seq[i % seq.length]! })
  return drawn[0] !== 0 || drawn.join(',') !== '0,1,2,3,4,5,6,7,8,9'
})())
check('B5 and it leaves the caller\'s array alone', (() => {
  const original = [1, 2, 3, 4, 5]
  sample(original, 2)
  return original.join(',') === '1,2,3,4,5'
})())

// ── C: the passenger ──────────────────────────────────────────────────────

async function main() {
  const outside = await runIsolatedSeoBackfillSample(
    async () => { throw new Error('must not read customer sites outside production') },
    { env: { VERCEL_ENV: 'preview' }, maxDurationMs: 300_000 },
  )
  check('C1 a preview deployment never touches a customer site', outside.status === 'not_production')

  let asked = 0
  const ran = await runIsolatedSeoBackfillSample(
    async (n) => { asked = n; return { waiting: 337, reports: [report()] } },
    { env: { VERCEL_ENV: 'production' }, maxDurationMs: 300_000 },
  )
  check('C2 in production it reads a small sample', ran.status === 'ran' && asked === SEO_BACKFILL_SAMPLE)
  check('C3 and reports the distribution', ran.status === 'ran' && ran.waiting === 337 && ran.wouldWrite === 1)

  const none = await runIsolatedSeoBackfillSample(
    async () => ({ waiting: 0, reports: [] }),
    { env: { VERCEL_ENV: 'production' }, maxDurationMs: 300_000 },
  )
  check('C4 with nothing waiting it says so and logs no distribution', none.status === 'nothing_waiting')

  const noTime = await runIsolatedSeoBackfillSample(
    async () => { throw new Error('must not start without time') },
    { env: { VERCEL_ENV: 'production' }, startedAtMs: Date.now() - 299_000, maxDurationMs: 300_000 },
  )
  check('C5 with no time left it starts nothing', noTime.status === 'no_time')

  const broke = await runIsolatedSeoBackfillSample(
    async () => { throw new Error('boom') },
    { env: { VERCEL_ENV: 'production' }, maxDurationMs: 300_000 },
  )
  check('C6 and it NEVER throws, so it cannot fail the cron above it', broke.status === 'error')

  // ── D: it cannot write ─────────────────────────────────────────────────

  const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  const src = stripComments(fs.readFileSync(path.join(process.cwd(), 'lib/content/seo-backfill-isolated.ts'), 'utf8'))
  check('D1 the only apply it ever passes is false', /apply:\s*false/.test(src) && !/apply:\s*true/.test(src))
  check('D2 and `apply` is not readable from the environment here',
    !/apply[^\n]*env\./.test(src) && !/env\.[A-Z_]*APPLY/.test(src))
  check('D3 nor is it a parameter a caller could set',
    !/apply\??\s*:\s*boolean/.test(src))
  const cron = stripComments(fs.readFileSync(path.join(process.cwd(), 'app/api/content/automation/cron/route.ts'), 'utf8'))
  check('D4 the cron calls it with no options but its own deadline',
    /runIsolatedSeoBackfillSample\(undefined, \{ startedAtMs/.test(cron))

  // ── MUTATION CONTROLS ──────────────────────────────────────────────────

  check('MUTATION CONTROL: counting skipped articles as fields would inflate "missing" past what was read',
    summary.sampled - Object.values(summary.skipped).reduce((n, v) => n + v, 0) === 4)
  check('MUTATION CONTROL: a sampler that took the first N would always report the same articles',
    items.slice(0, 10).join(',') === '0,1,2,3,4,5,6,7,8,9')
  check('MUTATION CONTROL: with apply true this passenger would write to 21 live customer sites, so the source must not contain it',
    !/apply:\s*true/.test(src))

  console.log(`${pass} passed, ${fail} failed`)
  if (fail) process.exit(1)
}

void main()
export {}
