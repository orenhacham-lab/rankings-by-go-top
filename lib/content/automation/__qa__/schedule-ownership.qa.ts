/**
 * WHO SETS THE PUBLISHING RHYTHM — nobody but an admin.
 *
 * THE DEFECT (owner, 4 October 2026, with a screenshot of the trial account
 * arcmedia.co.il): "on a trial account the user can change the publishing
 * cadence; they should have no option to pick the cadence or to create an
 * article, it all runs on the schedule the plan gives", and then: "not only on
 * a trial — customers with a subscription don't control this either, it is set
 * by the plan."
 *
 * A paid plan was already read-only on the screen, because readPublishRhythm
 * answered with a plan rhythm and the runner preferred it over the pool's own
 * columns. A TRIAL answered NO_RHYTHM — the same branch as an admin — so the
 * trial saw the cadence picker, the save button and "create the article now",
 * and the PATCH route accepted whatever came back. Its two dates were set when
 * the account opened (the first the next working day, the second a week
 * later), and a save could move them.
 *
 * THE FIX is a flag, not a rhythm: `trial` on PublishRhythm says the schedule
 * is not this account's to change, while `plan` stays null so NOTHING about the
 * scheduling itself changes. The screen withholds the controls, and the PATCH
 * route drops the schedule fields — the screen is not the enforcement, since
 * proxy.ts's matcher excludes /api/*.
 *
 * Each group ends with a MUTATION CONTROL.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { FakeAdmin } from '../../../__qa__/_fake-admin'
import { readPublishRhythm } from '../plan-rhythm'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

const ROOT = join(__dirname, '..', '..', '..', '..')
const read = (p: string) => { try { return readFileSync(join(ROOT, p), 'utf8') } catch { return '' } }
/** Source guards match on code, so comments are stripped first (repo convention). */
const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const USER = 'u-trial'
/** The real shape of arcmedia.co.il's account on 4 October 2026: a trial row
 *  with no billing period of its own — the trial window IS the period, and the
 *  whole allowance over it is one article. */
const trialRows = () => ({
  profiles: [{ id: USER, role: 'user' }],
  subscriptions: [{
    id: 's1', user_id: USER, status: 'trial',
    trial_ends_at: new Date(Date.now() + 5 * 864e5).toISOString(),
    current_period_start: null, current_period_end: null, plan_code: null,
  }],
  usage_reservations: [],
  article_pools: [],
})

async function main() {
  console.log('Who sets the publishing rhythm')

  console.log('\nA) the rhythm a trial account reads')
  {
    const admin = new FakeAdmin(trialRows())
    const rhythm = await readPublishRhythm(admin as never, USER)
    check('A1: a trial is marked as a trial', rhythm.trial === true)
    check('A2: its whole allowance is one article over the trial window',
      rhythm.allowance?.limit === 1 && rhythm.allowance?.remaining === 1)
    // THE POINT OF THE SEPARATION: the flag must not become a rhythm, or the
    // runner would start preferring it and move the two dates the trial was
    // given when the account opened.
    check('A3: it carries NO plan rhythm, so the scheduling itself is untouched', rhythm.plan === null)
    const admin2 = new FakeAdmin({ ...trialRows(), profiles: [{ id: USER, role: 'admin' }] })
    const adminRhythm = await readPublishRhythm(admin2 as never, USER)
    check('A4: an admin is not a trial and keeps its own schedule', adminRhythm.trial === false && adminRhythm.plan === null)
    check('A5: an unknown user is neither', (await readPublishRhythm(new FakeAdmin(trialRows()) as never, null)).trial === false)
    // MUTATION CONTROL — and the reason the flag had to be added at all.
    check('A-MUT: a check that read "no plan rhythm" as "the account’s own choice" cannot tell the trial from the admin',
      rhythm.plan === adminRhythm.plan && rhythm.trial !== adminRhythm.trial)
  }

  console.log('\nB) what the server tells the screen, and what it accepts back')
  {
    const list = strip(read('app/api/content/automation/pools/route.ts'))
    check('B1: a paid plan is reported as the plan’s', /if \(rhythm\.plan\) return \{ source: 'plan' as const/.test(list))
    check('B2: a trial is reported as a trial, not as the owner’s own choice', /if \(rhythm\.trial\) return \{ source: 'trial' as const \}/.test(list))
    check('B3: …and only what is neither falls through to the picker', /return \{ source: 'owner' as const \}/.test(list))
    const patch = strip(read('app/api/content/automation/pools/[id]/route.ts'))
    check('B4: the PATCH route decides whose schedule it is before it builds the patch',
      /const scheduleIsTheirs = !scheduleRhythm\.plan && !scheduleRhythm\.trial/.test(patch))
    const gate = patch.indexOf('if (scheduleIsTheirs) {')
    // The gate's own closing brace, not the first one an inner `if` happens to
    // bring: the block ends where the ungated fields begin.
    const closes = patch.indexOf("\n  }\n  if ('name' in body", gate)
    check('B5-gate: the gated block is closed before the ungated fields', gate > 0 && closes > gate, `${gate}..${closes}`)
    for (const field of ['cadence', 'intervalDays', 'publishDays', 'publishTime']) {
      const at = patch.indexOf(`'${field}' in body`)
      check(`B5-${field}: ${field} is only read inside that gate`, at > gate && at < closes, `${at} / ${gate}..${closes}`)
    }
    // Pause, resume and the queue's name are NOT a schedule change and stay.
    check('B6: pausing and resuming stay outside the gate', patch.indexOf("'isActive' in body") > closes)
    check('B7: a trial keeps the slot it was given rather than having it recomputed from an empty weekday list',
      /const keepStoredSlot = scheduleRhythm\.trial && !scheduleRhythm\.plan && pool\.next_publish_at/.test(patch))
    // MUTATION CONTROL
    const ungated = patch.replace('if (scheduleIsTheirs) {', '')
    check('B-MUT: without the gate, the cadence read is no longer inside it',
      !/if \(scheduleIsTheirs\) \{/.test(ungated))
  }

  console.log('\nC) what the screen offers')
  {
    const src = strip(read('components/content/AutomationSchedule.tsx'))
    check('C1: the screen locks on anything that is not the account’s own choice',
      /const scheduleLocked = rhythm !== null && rhythm\.source !== 'owner'/.test(src))
    check('C2: the cadence picker is behind it', /\{scheduleLocked \? \(/.test(src))
    check('C3: so is the save button', /\{!scheduleLocked && <Button size="sm" onClick=\{\(\) => saveSettings\(\)\}/.test(src))
    check('C4: and so is "create the article now", which would jump the schedule',
      /\{!scheduleLocked && \(it\.status === 'queued'/.test(src))
    // "Publish now" is a different rule and stays: it belongs to the project's
    // FIRST article only (canPublishFirstNow), which is the owner's own design
    // for the trial — the first article is written and offered immediately.
    check('C5: "publish now" is still the first article’s, and is not gated by this',
      /canPublishFirstNow\(\{ articles: articlesForFirst/.test(src) && !/scheduleLocked[^\n]*canPublishFirstNow/.test(src))
    check('C6: the three languages all say what a trial’s rhythm is', (['he', 'en', 'es'] as const)
      .every((l) => /trialRhythmLine: '[^']{40,}'/.test(read(`lib/i18n/dashboard/${l}.ts`))))
    // MUTATION CONTROL
    check('C-MUT: the old condition, which locked only a paid plan, fails C1',
      !/const scheduleLocked = rhythm !== null && rhythm\.source !== 'owner'/.test("const planRhythm = rhythm?.source === 'plan' ? rhythm : null"))
  }

  console.log('\nD) one project\u2019s share of the account\u2019s allowance')
  {
    // The allowance is the ACCOUNT's and the screen is one PROJECT's. Showing
    // all of it on every project promised each of them the whole plan: an
    // account on Basic (4 a month) with two projects projected four dates on
    // each, while the ledger — account-wide — would only ever publish four
    // between them.
    const list = strip(read('app/api/content/automation/pools/route.ts'))
    check('D1: the route divides the allowance by the account\u2019s active queues',
      /const queues = Math\.max\(1, rhythm\.plan\?\.activeQueues \?\? 1\)/.test(list)
      && /const shareOf = \(n: number\) => Math\.floor\(Math\.max\(0, n\) \/ queues\)/.test(list))
    check('D2: it rounds DOWN, so a projection never promises an article the cycle will not produce',
      /Math\.floor\(Math\.max\(0, n\) \/ queues\)/.test(list))
    check('D3: the share is used for the projection, the cycle size and the spread',
      /articlesLeft = rhythm\.allowance \? shareOf\(rhythm\.allowance\.remaining\) \+ readyNow/.test(list)
      && /perCycle: shareOf\(rhythm\.allowance\.limit\)/.test(list)
      && /remaining: shareOf\(rhythm\.allowance\.remaining\)/.test(list))
    check('D4: articles already generated belong to this project and are added after the split',
      /shareOf\(rhythm\.allowance\.remaining\) \+ readyNow/.test(list))
    // An account with no plan rhythm — an admin, or a trial — has one queue's
    // worth by definition, so nothing about those two changes.
    const share = (n: number, queues: number) => Math.floor(Math.max(0, n) / Math.max(1, queues))
    check('D5: one project on Basic still sees the whole 4', share(4, 1) === 4)
    check('D6: two projects on Basic see 2 each, which is the 4 the ledger will publish', share(4, 2) === 2 && share(4, 2) * 2 === 4)
    check('D7: an admin and a trial have no plan rhythm, so their count is unchanged', share(1, 1) === 1)
    // MUTATION CONTROL
    check('D-MUT: the old line, which showed the account\u2019s whole remaining on every project, fails D3',
      !/articlesLeft = rhythm\.allowance \? shareOf\(rhythm\.allowance\.remaining\) \+ readyNow/
        .test('const articlesLeft = rhythm.allowance ? rhythm.allowance.remaining + readyNow : 0'))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}

main()

export {}
