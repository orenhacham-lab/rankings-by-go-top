/**
 * What the progress screen and the research summary show, from the run the
 * seed route reports (lib/onboarding/summary-view.ts). Pure rules, so each is
 * checked on its own:
 *
 *   - which screen a run calls for, and which step is "now";
 *   - a password-locked store is NOT CHECKED: the AI-readiness block and tile
 *     are neutral, never failing and never 0/4, and the findings do not claim
 *     the site is clean; a pending check shows as pending;
 *   - the tiles' values and colours; competitors seen in search first;
 *   - the first five keywords are checked; each keyword's "why" is a property
 *     of the phrase itself;
 *   - "we just scanned", then hours, then days;
 *   - reading again: soon while stage A works, rarely when stalled, never after.
 *
 * Run: npx tsx lib/onboarding/__qa__/summary-view.qa.ts
 */
import { HE_WP, HE_WP_INSIGHT, makeChecker, NOW } from '@/lib/seed-scan/__qa__/_fixtures'
import type { SeedBusiness } from '@/lib/seed-scan/types'
import {
  activeStep,
  failureCode,
  findingsView,
  finishedSteps,
  geoView,
  initialSelection,
  keywordReason,
  MAX_POLL_MS,
  orderedCompetitors,
  POLL_MS,
  pollDelay,
  runPhase,
  scannedAgo,
  STAGE_B_GIVE_UP_MS,
  STAGE_B_POLL_MS,
  STALLED_POLL_MS,
  stageBState,
  storefrontLocked,
  tilesView,
} from '../summary-view'
import { BUSINESS, fullSummary, lockedSummary, runView } from './_fixtures'

const { check, finish } = makeChecker()


function main() {
  console.log('\n1) Which screen, which step')
  check('no run → none', runPhase(null) === 'none')
  check('running → progress; running with a lapsed lease → stalled',
    runPhase(runView({ status: 'running' })) === 'progress' && runPhase(runView({ status: 'running', stalled: true })) === 'stalled')
  check('failed → failed; done and partial → summary', runPhase(runView({ status: 'failed' })) === 'failed'
    && runPhase(runView({ status: 'done' })) === 'summary' && runPhase(runView({ status: 'partial' })) === 'summary')
  check('stage B, whatever its status → started (the summary, with "Start" behind us)',
    runPhase(runView({ stage: 'b', status: 'running' })) === 'started' && runPhase(runView({ stage: 'b', status: 'failed' })) === 'started')
  check('before the first read, the first step is "now"', activeStep(null) === 'a1' && finishedSteps(null) === 0)
  check('the running step is "now"', activeStep(runView({ status: 'running' }, { a2: 'running', a3: 'pending', a4: 'pending' })) === 'a2')
  check('with nothing running, the first unfinished step is "now"', activeStep(runView({ status: 'running' }, { a1: 'done', a2: 'skipped', a3: 'pending', a4: 'pending' })) === 'a3')
  check('all four finished → no step (the summary is being put together)', activeStep(runView({ status: 'running' })) === null)
  check('finished steps count done, skipped and failed alike',
    finishedSteps(runView({ status: 'running' }, { a1: 'done', a2: 'skipped', a3: 'failed', a4: 'running' })) === 3)
  check("a failed run's code: its own, else its first failed step's",
    failureCode(runView({ status: 'failed', errorCode: 'site_blocked' })) === 'site_blocked'
    && failureCode({ ...runView({ status: 'failed' }), steps: runView().steps.map((s) => (s.step === 'a1' ? { ...s, status: 'failed' as const, errorCode: 'site_unreachable' } : s)) }) === 'site_unreachable'
    && failureCode(null) === null)

  console.log('\n2) A password-locked store is not checked, never failing')
  {
    const locked = lockedSummary()
    const run = runView({ summary: locked }, { a2: 'skipped', a3: 'skipped' })
    check('storefront_locked is recognised from geo alone, and from the snapshot flag alone',
      storefrontLocked(locked) && storefrontLocked(fullSummary({ storefrontLocked: true })) && storefrontLocked({ ...locked, storefrontLocked: false }))
    check('AI readiness → locked (not measured, not failed)', geoView(locked, 'skipped').kind === 'locked' && geoView(locked, 'failed').kind === 'locked')
    const tiles = tilesView(locked, run)
    const geoTile = tiles.find((t) => t.id === 'geo')!
    check('the AI tile is "not checked", neutral, with no value at all', geoTile.state === 'notChecked' && geoTile.tone === 'neutral' && geoTile.value === null)
    check('no tile anywhere says 0/4', tiles.every((t) => t.value !== '0/4' && !(t.value ?? '').includes('/')))
    check('the findings are "not checked" too: a locked store is never called clean', findingsView(locked, 'skipped').kind === 'locked')
    const fixes = tiles.find((t) => t.id === 'fixes')!
    check('…and the fixes tile is not "0" but "not checked"', fixes.state === 'notChecked' && fixes.value === null && fixes.tone === 'neutral')
    check('a measured locked store (it opened later) shows its measurement',
      geoView({ ...locked, geo: { ...fullSummary().geo } }, 'done').kind === 'measured')
  }
  {
    const pending = fullSummary({ geo: { state: 'pending', unavailableReason: null, passed: 0, total: 0, signals: [] } })
    const run = runView({ status: 'running', summary: pending }, { a3: 'running', a4: 'pending' })
    check('geo pending → pending while a3 has not failed', geoView(pending, 'running').kind === 'pending' && geoView(pending, null).kind === 'pending')
    check('…and its tile says pending, neutral, no value', (() => {
      const t = tilesView(pending, run).find((x) => x.id === 'geo')!
      return t.state === 'pending' && t.tone === 'neutral' && t.value === null
    })())
    check('geo pending after a3 failed → failed (said as "we could not finish"), still no 0/4', geoView(pending, 'failed').kind === 'failed'
      && tilesView(pending, runView({ summary: pending }, { a3: 'failed' })).find((x) => x.id === 'geo')!.value === null)
    check('findings while a3 runs → pending; a3 failed → failed', findingsView(pending, 'running').kind === 'pending' && findingsView(pending, 'failed').kind === 'failed')
  }
  {
    const unavailable = fullSummary({ geo: { state: 'unavailable', unavailableReason: null, passed: 0, total: 0, signals: [] } })
    check('geo unavailable for another reason (a claim with no measurement) → not checked, not failing', geoView(unavailable, 'done').kind === 'notChecked')
    check('a measurement of zero signals → not checked, never 0/0', geoView(fullSummary({ geo: { state: 'measured', unavailableReason: null, passed: 0, total: 0, signals: [] } }), 'done').kind === 'notChecked')
  }

  console.log('\n3) Tiles, findings, competitors')
  {
    const s = fullSummary()
    const tiles = tilesView(s, runView())
    const by = Object.fromEntries(tiles.map((t) => [t.id, t]))
    check('four tiles, in the plan\'s order', tiles.map((t) => t.id).join(',') === 'keywords,fixes,geo,articles')
    check('keywords 5 (ok), fixes 3 (bad: a blocker), AI 3/4 (warn), articles 5 (ok)',
      by.keywords.value === '5' && by.keywords.tone === 'ok' && by.fixes.value === '3' && by.fixes.tone === 'bad'
      && by.geo.value === '3/4' && by.geo.tone === 'warn' && by.articles.value === '5' && by.articles.tone === 'ok', JSON.stringify(tiles))
    check('4/4 is ok, 0/4 measured is bad', tilesView(fullSummary({ geo: { ...s.geo, passed: 4 } }), runView()).find((t) => t.id === 'geo')!.tone === 'ok'
      && tilesView(fullSummary({ geo: { ...s.geo, passed: 0 } }), runView()).find((t) => t.id === 'geo')!.tone === 'bad')
    const view = findingsView(s, 'done')
    check('findings, blockers first', view.kind === 'list' && view.findings.map((f) => f.severity).join(',') === 'blocker,warning,info')
    check('no findings after a finished check → clean ("the site is clear of the issues we check"), fixes 0 (ok)',
      findingsView(fullSummary({ findings: [] }), 'done').kind === 'clean' && tilesView(fullSummary({ findings: [] }), runView()).find((t) => t.id === 'fixes')!.value === '0')
    check('findings known only by count (a claimed free check) are counted, never called clean',
      (() => {
        const v = findingsView(fullSummary({ findings: [], findingsOmitted: 2 }), 'done')
        return v.kind === 'list' && v.omitted === 2 && tilesView(fullSummary({ findings: [], findingsOmitted: 2 }), runView()).find((t) => t.id === 'fixes')!.value === '2'
      })())
    check('no keywords and no topics → 0, neutral', (() => {
      const t = tilesView(fullSummary({ seedKeywords: [], topics: [] }), runView())
      return t[0].value === '0' && t[0].tone === 'neutral' && t[3].value === '0' && t[3].tone === 'neutral'
    })())
    check('competitors seen in real searches first, the most-seen first; suggestions after',
      orderedCompetitors(s).map((c) => c.domain).join(',') === 'rival-plumber.co.il,pipes-pro.co.il,never-seen.co.il')
  }

  console.log('\n4) Keywords')
  check('the first five seed keywords start checked', initialSelection(['a', 'b', 'c', 'd', 'e', 'f', 'g']).join('') === 'abcde'
    && initialSelection(HE_WP_INSIGHT.keywords).length === 5 && initialSelection([]).length === 0)
  const reason = (k: string, b: SeedBusiness | null = BUSINESS, domain = HE_WP.key) => keywordReason(k, b, domain)
  const cases: [string, string, ReturnType<typeof keywordReason>][] = [
    ['the business\'s own name', 'אינסטלציה מהירה תל אביב', 'brand'],
    ['the domain\'s own name', 'plumber tlv reviews', 'brand'],
    ['a Hebrew question', 'איך פותחים סתימה בכיור', 'question'],
    ['an English question', 'how to fix a leaking tap', 'question'],
    ['a question mark', 'דוד שמש לא מחמם?', 'question'],
    ['a local search', 'אינסטלטור ליד הבית', 'local'],
    ['an English local search', 'plumber near me', 'local'],
    ['close to a purchase', 'מחיר תיקון דוד', 'buying'],
    ['…with a Hebrew prefix on the word', 'דוד שמש במחיר', 'buying'],
    ['a repair (a service to hire)', 'תיקון דוד שמש', 'buying'],
    ['the niche itself', 'אינסטלציה לבית', 'niche'],
    ['a long specific phrase', 'צנרת נחושת לבניין משותף ישן', 'specific'],
    ['a plain description of the offer', 'פתיחת סתימות', 'core'],
  ]
  for (const [label, keyword, expected] of cases) check(`why "${keyword}": ${label} → ${expected}`, reason(keyword) === expected, reason(keyword))
  check('a name shorter than four letters is not taken for a brand (every word would match)', reason('ab shop', { ...BUSINESS, companyName: 'ab' }, 'ab.com') !== 'brand')
  check('no business at all still gives a reason', reason('פתיחת סתימות', null) === 'core')

  console.log('\n5) When the site was read')
  check('under an hour → just now', scannedAgo(new Date(NOW.getTime() - 59 * 60_000).toISOString(), NOW)?.kind === 'justNow')
  check('3 hours → hours 3', JSON.stringify(scannedAgo(new Date(NOW.getTime() - 3 * 3600_000 - 60_000).toISOString(), NOW)) === '{"kind":"hours","value":3}')
  check('2 days → days 2', JSON.stringify(scannedAgo(new Date(NOW.getTime() - 50 * 3600_000).toISOString(), NOW)) === '{"kind":"days","value":2}')
  check('a clock a little behind the scan → just now, never negative', scannedAgo(new Date(NOW.getTime() + 60_000).toISOString(), NOW)?.kind === 'justNow')
  check('never read, or unreadable → nothing said', scannedAgo(null, NOW) === null && scannedAgo('not a date', NOW) === null)

  console.log('\n6) Reading the run again')
  check('stage A working → every 1.5s', pollDelay(runView({ status: 'running' }), 0) === POLL_MS && POLL_MS === 1500)
  check('stalled → every 15s', pollDelay(runView({ status: 'running', stalled: true }), 0) === STALLED_POLL_MS && STALLED_POLL_MS === 15_000)
  check('ended (summary, failed, stage B finished or failed) or no run → not at all',
    pollDelay(runView(), 0) === null && pollDelay(runView({ status: 'failed' }), 0) === null
      && pollDelay(runView({ stage: 'b', status: 'done' }), 0) === null && pollDelay(runView({ stage: 'b', status: 'failed' }), 0) === null && pollDelay(null, 0) === null)
  // P1-12: the summary's bar follows stage B, so it is read again, rarely, while stage B works.
  check('stage B working → every 20s, so the bar can say when it is ready',
    pollDelay(runView({ stage: 'b', status: 'running' }), 0) === STAGE_B_POLL_MS && STAGE_B_POLL_MS === 20_000)
  check('stage B stalled past the cron\'s day → not read again',
    pollDelay(runView({ stage: 'b', status: 'running', stalled: true, startedAt: new Date(Date.now() - STAGE_B_GIVE_UP_MS - 60_000).toISOString() }), 0) === null)

  console.log('\n7) Stage B, as the summary\'s bar says it')
  const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString()
  check('stage A → no stage B state', stageBState(runView(), NOW) === null)
  check('stage B running → running', stageBState(runView({ stage: 'b', status: 'running' }), NOW) === 'running')
  check('stage B stalled, inside the cron\'s day → still running', stageBState(runView({ stage: 'b', status: 'running', stalled: true, startedAt: ago(3600_000) }), NOW) === 'running')
  check('stage B stalled past the cron\'s day → failed, said honestly', stageBState(runView({ stage: 'b', status: 'running', stalled: true, startedAt: ago(24 * 3600_000 + 60_000) }), NOW) === 'failed' && STAGE_B_GIVE_UP_MS === 24 * 3600_000)
  check('stage B done or partial → done', stageBState(runView({ stage: 'b', status: 'done' }), NOW) === 'done' && stageBState(runView({ stage: 'b', status: 'partial' }), NOW) === 'done')
  check('stage B failed → failed', stageBState(runView({ stage: 'b', status: 'failed' }), NOW) === 'failed')
  check('a start just accepted → read soon, whatever the previous run was', pollDelay(null, 0, true) === POLL_MS && pollDelay(runView({ status: 'failed' }), 0, true) === POLL_MS)
  check('failed reads back off: 3s, 6s, 12s, then 15s at most',
    [1, 2, 3, 4, 9].map((f) => pollDelay(runView({ status: 'running' }), f)).join(',') === '3000,6000,12000,15000,15000' && MAX_POLL_MS === 15_000)
  check('…but a run that has ended is not read again after a failure', pollDelay(runView(), 3) === null)

  finish()
}

main()

export {}
