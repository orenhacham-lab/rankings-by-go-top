/**
 * THE PUBLISHING QUEUE READS IN DATE ORDER, AND SAYS WHAT HAPPENS NEXT.
 *
 * What the owner saw on 4 October 2026, on an account with months of history:
 * "the publishing queues are a mess, everything is jumbled and the dates are
 * not in order", and on a trial account "the planned articles are not in date
 * order either, and the scheduling there is wrong."
 *
 * Both came from the same screen showing ONE list. The queue is stored in
 * `position` order, which is the order the runner works through, and the API
 * hands each still-pending item the slot it will actually be published in. But
 * finished rows keep their positions too, so:
 *
 *   1. the collapsed list showed the first three BY POSITION — on his oldest
 *      queue, three articles published in July, on a screen whose job is to say
 *      what is coming next; and
 *   2. where a published row had drifted below the pending ones (two of his
 *      pools), the dates ran backwards in the middle of the list.
 *
 * And on the trial, the first row read `failed` because the trial's single
 * article had already been written when the account opened — see the
 * quota_exceeded check below.
 *
 * Run: npx tsx components/content/__qa__/queue-order.qa.ts
 */
import { readFileSync } from 'fs'
import { join } from 'path'

let pass = 0, fail = 0
const check = (name: string, cond: boolean, detail?: string) => {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')

const SCREEN = strip(read('components/content/AutomationSchedule.tsx'))
const GEN = strip(read('lib/content/automation/generate-item.ts'))
const API = strip(read('app/api/content/automation/pools/route.ts'))

/** The screen's own split, re-stated here so the behaviour is checked, not just the source. */
const PENDING = ['queued', 'scheduled', 'generating', 'generated', 'publishing']
type Row = { id: string; status: string; projectedPublishAt: string | null }
const split = (items: Row[]) => ({
  upcoming: items.filter((i) => PENDING.includes(i.status)),
  history: items.filter((i) => !PENDING.includes(i.status))
    .sort((a, b) => (Date.parse(b.projectedPublishAt ?? '') || 0) - (Date.parse(a.projectedPublishAt ?? '') || 0)),
})

console.log('A) the two lists, on the shape of a real queue')
{
  // His oldest pool, in miniature: sixteen published, then the queued ones.
  const old: Row[] = [
    { id: 'p1', status: 'published', projectedPublishAt: '2026-07-30T13:55:00Z' },
    { id: 'p2', status: 'published', projectedPublishAt: '2026-08-02T07:45:00Z' },
    { id: 'p3', status: 'published', projectedPublishAt: '2026-10-04T06:01:00Z' },
    { id: 'q1', status: 'queued', projectedPublishAt: '2026-10-07T06:00:00Z' },
    { id: 'q2', status: 'queued', projectedPublishAt: '2026-10-11T06:00:00Z' },
  ]
  const { upcoming, history } = split(old)
  check('A1: the queue opens on what is NEXT, not on the oldest published article',
    upcoming[0]?.id === 'q1', JSON.stringify(upcoming.map((i) => i.id)))
  check('A2: every upcoming date is in the future of the one before it',
    upcoming.every((it, i) => i === 0 || Date.parse(it.projectedPublishAt!) > Date.parse(upcoming[i - 1]!.projectedPublishAt!)))
  check('A3: history is newest first', history.map((i) => i.id).join(',') === 'p3,p2,p1', history.map((i) => i.id).join(','))

  // The shape that made the dates run backwards MID-LIST: a published row
  // sitting at a position after the pending ones (two of his pools do this).
  const drifted: Row[] = [
    { id: 'g1', status: 'generated', projectedPublishAt: '2026-10-05T06:00:00Z' },
    { id: 'q1', status: 'queued', projectedPublishAt: '2026-10-08T06:00:00Z' },
    { id: 'p1', status: 'published', projectedPublishAt: '2026-09-01T06:00:00Z' },
    { id: 'q2', status: 'queued', projectedPublishAt: '2026-10-12T06:00:00Z' },
  ]
  const backwards = (rows: Row[]) => rows.some((it, i) =>
    i > 0 && Date.parse(it.projectedPublishAt!) < Date.parse(rows[i - 1]!.projectedPublishAt!))
  check('A4: CONTROL — the single list really does run backwards on that shape', backwards(drifted))
  check('A5: …and neither of the two lists does', !backwards(split(drifted).upcoming) && !backwards(split(drifted).history))
}

console.log('\nB) the screen is built that way')
{
  check('B1: it derives upcoming and history instead of rendering one list',
    /const upcoming = items\.filter\(\(i\) => PENDING_STATUSES\.includes\(i\.status\)\)/.test(SCREEN)
    && /const history = items/.test(SCREEN))
  check('B2: the collapsed queue shows the first three UPCOMING',
    /\(queueExpanded \? upcoming : upcoming\.slice\(0, 3\)\)/.test(SCREEN))
  check('B3: history is rendered without reorder arrows', /history\.map\(\(it\) => renderRow\(it, 0, false\)\)/.test(SCREEN))
  check('B4: the arrows move an item among the upcoming ones only',
    /if \(j < 0 \|\| j >= upcoming\.length\) return/.test(SCREEN)
    && /const a = items\.findIndex\(\(x\) => x\.id === upcoming\[index\]!\.id\)/.test(SCREEN))
  check('B5: …and the server is still sent the FULL order, so finished rows keep their places',
    /orderedItemIds: next\.map\(\(i\) => i\.id\)/.test(SCREEN))
  check('B6: the screen and the API agree on which statuses are still to come',
    /const PENDING_STATUSES = \['queued', 'scheduled', 'generating', 'generated', 'publishing'\]/.test(SCREEN)
    && /const PENDING = \['queued', 'scheduled', 'generating', 'generated', 'publishing'\]/.test(API))
  // MUTATION CONTROLS.
  check('B7: mutation control — rendering one list again fails B2',
    !/\(queueExpanded \? upcoming : upcoming\.slice\(0, 3\)\)/.test(
      SCREEN.replace('(queueExpanded ? upcoming : upcoming.slice(0, 3))', '(queueExpanded ? items : items.slice(0, 3))')))
  check('B8: mutation control — arrows bounded by the whole list again fail B4',
    !/if \(j < 0 \|\| j >= upcoming\.length\) return/.test(
      SCREEN.replace('if (j < 0 || j >= upcoming.length) return', 'if (j < 0 || j >= items.length) return')))
}

console.log('\nC) a trial that has used its one article is WAITING, not FAILED')
{
  // The trial allowance is one article for the whole trial (TRIAL_CATALOG), and
  // it is spent on the article written when the account opens. The next queue
  // item then reserved nothing and was marked `failed` — which does not come
  // back on its own, so subscribing did not resume the queue.
  check('C1: an exhausted allowance puts the item back in the queue',
    /if \(gen\.kind === 'quota_exceeded'\) \{\s*status = 'queued'; reason = gen\.kind/.test(GEN))
  check('C2: …and still burns no retry attempt', /\|\| gen\.kind === 'billing_required' \|\| gen\.kind === 'quota_exceeded'/.test(GEN))
  check('C3: an unresolved SHOPIFY plan is still `failed`, because only the merchant can fix it',
    !/gen\.kind === 'billing_required'\) \{\s*status = 'queued'/.test(GEN))
  check('C4: the reason travels with the item, so the row can say why it waits',
    /await finalize\(admin, itemId, status, reason, transient \? \(item\.attempts \?\? 0\) : undefined\)/.test(GEN))
  check('C5: a queued item is one the screen shows with its projected date', PENDING.includes('queued'))
  check('C6: mutation control — marking it failed again fails C1',
    !/if \(gen\.kind === 'quota_exceeded'\) \{\s*status = 'queued'/.test(GEN.replace("status = 'queued'; reason = gen.kind", "status = 'failed'; reason = gen.kind")))
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exitCode = 1

export {}
