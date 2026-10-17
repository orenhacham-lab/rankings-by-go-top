/**
 * How long the outbound channel keeps what it holds.
 *
 * This is not housekeeping: CPRA §1798.100(a)(3) makes us publish the period or
 * the criterion, the privacy text publishes these two numbers, and so a change
 * in behaviour here turns published text into a false statement. The guards
 * below pin the two rules, the 30-day floor that CAN-SPAM imposes on the first
 * one, and the things a redaction must and must not take.
 *
 * Every guard runs twice: against the real module, and against a deliberately
 * broken copy that must fail. A guard that cannot fail tests nothing.
 *
 * Run: npx tsx lib/outreach/__qa__/outreach-retention.qa.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { FakeAdmin } from '@/lib/__qa__/_fake-admin'
import { withMutant } from '@/lib/reminders/__qa__/_mutant'
import { PROSPECTS_TABLE } from '../prospects'
import { runIsolatedProspectRetention } from '../retention-isolated'
import {
  PROSPECT_REDACTION_DAYS,
  UNUSED_PROSPECT_DAYS,
  applyProspectRetention,
  isDueForRedaction,
  lastTouched,
  retentionCutoff,
} from '../retention'

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

const NOW = new Date('2026-12-01T12:00:00Z')
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000).toISOString()

const row = (over: Record<string, unknown> = {}) => ({
  id: 'p-1',
  email: 'owner@store.example',
  contact_name: 'A Person',
  email_hash: 'f'.repeat(64),
  unsub_token: 'a'.repeat(64),
  company: 'Store Example LLC',
  site_host: 'store.example',
  postal_address: '1 Main St, Nashville, TN 37201',
  status: 'sent_second',
  first_sent_at: daysAgo(60),
  second_sent_at: daysAgo(45),
  replied_at: null,
  redacted_at: null,
  created_at: daysAgo(70),
  ...over,
})

const list = (rows: Record<string, unknown>[], hooks: Record<string, { select?: () => { code: string }; update?: () => { code: string }; delete?: () => { code: string } }> = {}) =>
  new FakeAdmin({ [PROSPECTS_TABLE]: rows }, hooks)
const rowsOf = (f: FakeAdmin) => f.tables[PROSPECTS_TABLE] as Record<string, unknown>[]

async function main() {
  console.log('\noutreach retention — the periods the privacy text publishes')

  // ── The two numbers ────────────────────────────────────────────────────────
  check('N1: the address goes 30 days after the last message, not sooner',
    PROSPECT_REDACTION_DAYS === 30)
  check('N2: 30 days is the floor CAN-SPAM sets for the link, so it cannot be lower',
    PROSPECT_REDACTION_DAYS >= 30)
  check('N3: a prospect never written to is kept 90 days', UNUSED_PROSPECT_DAYS === 90)
  check('N4: the cutoff is that many days back, and a negative period is not the future',
    retentionCutoff(NOW, 30) === daysAgo(30) && retentionCutoff(NOW, -5) === NOW.toISOString())

  // ── Which row is due ───────────────────────────────────────────────────────
  check('L1: the last thing that happened is the latest of the three dates',
    lastTouched(row({ first_sent_at: daysAgo(60), second_sent_at: daysAgo(45), replied_at: daysAgo(10) }))
      === Date.parse(daysAgo(10)))
  check('L2: a reply after the second message pushes the clock out, it does not pull it in',
    !isDueForRedaction(row({ replied_at: daysAgo(5) }), NOW)
    && isDueForRedaction(row({ replied_at: daysAgo(31) }), NOW))
  check('L3: a date we cannot parse counts as nothing, so the row is kept, not emptied early',
    Number.isNaN(lastTouched(row({ first_sent_at: 'not a date', second_sent_at: null, replied_at: null })))
    && !isDueForRedaction(row({ first_sent_at: 'not a date', second_sent_at: null, replied_at: null }), NOW))
  check('D1: 45 days after the second message the row is due',
    isDueForRedaction(row(), NOW))
  check('D2: 29 days after the only message it is not',
    !isDueForRedaction(row({ first_sent_at: daysAgo(29), second_sent_at: null }), NOW))
  check('D3: exactly 30 days is due; one hour short is not',
    isDueForRedaction(row({ first_sent_at: daysAgo(30), second_sent_at: null }), NOW)
    && !isDueForRedaction(row({
      first_sent_at: new Date(NOW.getTime() - 29 * 24 * 60 * 60 * 1000 - 23 * 60 * 60 * 1000).toISOString(),
      second_sent_at: null,
    }), NOW))
  check('D4: a row already redacted is never due again',
    !isDueForRedaction(row({ email: null, contact_name: null, redacted_at: daysAgo(1) }), NOW))
  check('D5: a row nothing ever happened to is not this rule’s business',
    !isDueForRedaction(row({ first_sent_at: null, second_sent_at: null, replied_at: null }), NOW))

  // ── A pass ─────────────────────────────────────────────────────────────────
  const due = list([row()])
  const s1 = await applyProspectRetention(asAdmin(due), NOW)
  check('A1: the pass nulls the address and stamps the redaction',
    s1.redacted === 1 && rowsOf(due)[0]?.email === null && rowsOf(due)[0]?.redacted_at !== null)
  check('A2: it takes the contact’s name with the address',
    rowsOf(due)[0]?.contact_name === null)
  check('A3: it keeps what proves we already wrote to this business',
    rowsOf(due)[0]?.email_hash === 'f'.repeat(64)
    && rowsOf(due)[0]?.unsub_token === 'a'.repeat(64)
    && rowsOf(due)[0]?.company === 'Store Example LLC'
    && rowsOf(due)[0]?.second_sent_at === daysAgo(45))
  check('A4: it takes the published postal address too — in a one-person business that is a home',
    rowsOf(due)[0]?.postal_address === null)
  check('A5: the row is not deleted — the hash is what stops it being added again',
    rowsOf(due).length === 1)

  const notDue = list([row({ second_sent_at: daysAgo(3) })])
  const s2 = await applyProspectRetention(asAdmin(notDue), NOW)
  check('A6: a row inside its 30 days is left completely alone',
    s2.redacted === 0 && rowsOf(notDue)[0]?.email === 'owner@store.example'
    && rowsOf(notDue)[0]?.contact_name === 'A Person'
    && rowsOf(notDue)[0]?.postal_address === '1 Main St, Nashville, TN 37201')

  const unused = list([
    row({ id: 'u-1', first_sent_at: null, second_sent_at: null, status: 'new', created_at: daysAgo(91) }),
    row({ id: 'u-2', first_sent_at: null, second_sent_at: null, status: 'new', created_at: daysAgo(89) }),
  ])
  const s3 = await applyProspectRetention(asAdmin(unused), NOW)
  check('A7: a prospect never written to is deleted whole after 90 days',
    s3.unusedDeleted === 1 && rowsOf(unused).length === 1 && rowsOf(unused)[0]?.id === 'u-2')

  const written = list([row({ created_at: daysAgo(200) })])
  await applyProspectRetention(asAdmin(written), NOW)
  check('A8: a row we DID write to is never deleted by the 90-day rule, however old',
    rowsOf(written).length === 1)

  // ── Nothing silent ─────────────────────────────────────────────────────────
  const readBroken = list([row()], { [PROSPECTS_TABLE]: { select: () => ({ code: 'PGRST205' }) } })
  const s4 = await applyProspectRetention(asAdmin(readBroken), NOW)
  check('F1: a read that fails is reported and nothing is emptied',
    s4.failed.includes('redaction_read_failed') && s4.redacted === 0)
  const writeBroken = list([row()], { [PROSPECTS_TABLE]: { update: () => ({ code: 'PGRST500' }) } })
  const s5 = await applyProspectRetention(asAdmin(writeBroken), NOW)
  check('F2: a write that fails is reported, never counted as done',
    s5.failed.includes('redaction_write_failed') && s5.redacted === 0)
  const throwing = { from: () => { throw new Error('down') } }
  const s6 = await applyProspectRetention(throwing as any, NOW)
  check('F3: a client that throws does not crash the unattended pass',
    s6.failed.length === 2 && s6.redacted === 0 && s6.unusedDeleted === 0)

  // ── The route authenticates itself ─────────────────────────────────────────
  const routeSrc = stripComments(readFileSync(join(ROOT, 'app/api/outreach/retention/cron/route.ts'), 'utf8'))
  check('S1: the route checks CRON_SECRET before it does anything',
    routeSrc.indexOf('authorizeCronRequest') < routeSrc.indexOf('applyProspectRetention'))
  check('S2: it reads no session — proxy.ts does not cover /api/*',
    !/getUser|requireAdmin|cookies\(|auth\(/.test(routeSrc))
  const libSrc = stripComments(readFileSync(join(ROOT, 'lib/outreach/retention.ts'), 'utf8'))
  check('S3: no address, name or company can reach a log line',
    !/console\.(log|error|warn)\([^)]*\b(email|contact_name|company|postal_address|row)\b/.test(libSrc))
  const vercelJson = JSON.parse(readFileSync(join(ROOT, 'vercel.json'), 'utf8')) as
    { crons: { path: string; schedule: string }[] }
  const cron = vercelJson.crons.find((c) => c.path === '/api/outreach/retention/cron')
  check('S4: the pass is actually scheduled, once a day',
    cron !== undefined && /^\d+ \d+ \* \* \*$/.test(cron.schedule))
  // The published privacy text names three columns a redaction empties, so the
  // database rule has to name all three: a sweep that forgets one must fail at
  // the database rather than leave a home address behind.
  const migrationSrc = readFileSync(join(ROOT, 'supabase/migrations/20261012170000_outreach_prospects.sql'), 'utf8')
  const redactionRule = /outreach_prospects_redaction CHECK \(([\s\S]*?)\)\),/.exec(migrationSrc)?.[1] ?? ''
  check('S5: the database refuses a redaction that keeps the address, the name or the postal address',
    /email IS NULL/.test(redactionRule) && /contact_name IS NULL/.test(redactionRule)
    && /postal_address IS NULL/.test(redactionRule))
  check('S6: the postal address can be emptied at all — it is not NOT NULL',
    !/postal_address\s+text\s+NOT NULL/.test(migrationSrc))
  check('S7: a live row still has to carry one, which is what the NOT NULL used to say',
    /outreach_prospects_postal_present CHECK \(\s*redacted_at IS NOT NULL OR postal_address IS NOT NULL\)/
      .test(migrationSrc))

  // ── It actually runs, and we can see that it ran ──────────────────────────
  // The gate on sending the first wave was "the pass has run once in Production".
  // On 13 Oct 2026 that could not be answered: the route logged only when it had
  // changed something, the table was empty, and a Vercel daily cron on this plan
  // is best-effort. Both halves are pinned here.
  const logsEveryPass = (src: string) =>
    /console\.log\('\[outreach-retention\] pass complete', summary\)/.test(src)
    && !/if \([^)]*summary\.(redacted|unusedDeleted|failed)[\s\S]{0,120}console\.log\('\[outreach-retention\]/.test(src)
  check('S8: the route logs every pass, counts of zero included — a silent pass cannot be told from one that never fired',
    logsEveryPass(routeSrc))
  const automationSrc = stripComments(readFileSync(join(ROOT, 'app/api/content/automation/cron/route.ts'), 'utf8'))
  const ridesQuarterHour = (src: string) =>
    /import \{ runIsolatedProspectRetention \}/.test(src) && /await runIsolatedProspectRetention\(/.test(src)
  check('S9: the pass rides the 15-minute cron too, not only the daily entry that may never fire',
    ridesQuarterHour(automationSrc))
  const isoSrc = stripComments(readFileSync(join(ROOT, 'lib/outreach/retention-isolated.ts'), 'utf8'))
  check('S10: and nothing about a prospect reaches its log line either',
    !/console\.(log|error|warn)\([^)]*\b(email|contact_name|company|postal_address|row)\b/.test(isoSrc))

  const lines: unknown[][] = []
  const origLog = console.log
  const origError = console.error
  const capture = async (fn: () => Promise<unknown>) => {
    lines.length = 0
    console.log = (...a: unknown[]) => { lines.push(a) }
    console.error = (...a: unknown[]) => { lines.push(a) }
    try { return await fn() } finally { console.log = origLog; console.error = origError }
  }
  const zero = { redacted: 0, unusedDeleted: 0, failed: [] as string[] }

  const ranOutcome = await capture(() =>
    runIsolatedProspectRetention(async () => zero, { env: { VERCEL_ENV: 'production' } }))
  check('I1: a pass that changed nothing still prints its line — that is the evidence it ran',
    JSON.stringify(ranOutcome) === JSON.stringify({ status: 'ran', ...zero })
    && lines.length === 1 && String(lines[0]?.[0]).includes('[outreach-retention] pass complete'))

  let touched = false
  const outsideProd = await capture(() =>
    runIsolatedProspectRetention(async () => { touched = true; return zero }, { env: { VERCEL_ENV: 'preview' } }))
  check('I2: Preview shares the Production database, so a preview deployment sweeps nothing',
    JSON.stringify(outsideProd) === JSON.stringify({ status: 'not_production' }) && !touched && lines.length === 0)

  const threw = await capture(() =>
    runIsolatedProspectRetention(async () => { throw new Error('down') }, { env: { VERCEL_ENV: 'production' } }))
  check('I3: a pass that throws cannot fail the cron it rides, and says so',
    JSON.stringify(threw) === JSON.stringify({ status: 'error' })
    && lines.length === 1 && String(lines[0]?.[0]).includes('[outreach-retention] pass failed'))

  check('I4: the pass itself is idempotent, which is what makes every quarter hour safe',
    await (async () => {
      const f = list([row(), row({ id: 'p-2', first_sent_at: null, created_at: daysAgo(200) })])
      const first = await applyProspectRetention(asAdmin(f), NOW)
      const second = await applyProspectRetention(asAdmin(f), NOW)
      return first.redacted === 1 && first.unusedDeleted === 1
        && second.redacted === 0 && second.unusedDeleted === 0 && second.failed.length === 0
    })())

  // ── Mutation controls ──────────────────────────────────────────────────────
  const mutFloor = await withMutant<{ isDueForRedaction: typeof isDueForRedaction }, boolean>(
    'lib/outreach/retention.ts',
    [[/export const PROSPECT_REDACTION_DAYS = 30/, 'export const PROSPECT_REDACTION_DAYS = 7']],
    (m) => m.isDueForRedaction(row({ first_sent_at: daysAgo(10), second_sent_at: null }), NOW),
  )
  check('N2-MUT: a period shorter than the link’s 30 days would be caught', mutFloor)

  const mutName = await withMutant<{ applyProspectRetention: typeof applyProspectRetention }, boolean>(
    'lib/outreach/retention.ts',
    [[/              contact_name: null,\n/, '']],
    async (m) => {
      const f = list([row()])
      await m.applyProspectRetention(asAdmin(f), NOW)
      return rowsOf(f)[0]?.contact_name === 'A Person'
    },
  )
  check('A2-MUT: a redaction that kept the person’s name would be caught', mutName)

  const mutPostal = await withMutant<{ applyProspectRetention: typeof applyProspectRetention }, boolean>(
    'lib/outreach/retention.ts',
    [[/              postal_address: null,\n/, '']],
    async (m) => {
      const f = list([row()])
      await m.applyProspectRetention(asAdmin(f), NOW)
      return rowsOf(f)[0]?.postal_address === '1 Main St, Nashville, TN 37201'
    },
  )
  check('A4-MUT: a redaction that kept the published postal address would be caught', mutPostal)

  const mutLatest = await withMutant<{ isDueForRedaction: typeof isDueForRedaction }, boolean>(
    'lib/outreach/retention.ts',
    [[/  return times\.length === 0 \? Number\.NaN : Math\.max\(\.\.\.times\)/,
      '  return times.length === 0 ? Number.NaN : Math.min(...times)']],
    (m) => m.isDueForRedaction(row({ first_sent_at: daysAgo(60), second_sent_at: daysAgo(10) }), NOW),
  )
  check('L1-MUT: taking the earliest date instead of the latest would empty a row a month early', mutLatest)

  const mutUnused = await withMutant<{ applyProspectRetention: typeof applyProspectRetention }, boolean>(
    'lib/outreach/retention.ts',
    [[/      \.is\('first_sent_at', null\)\n      \.lt\('created_at', retentionCutoff\(now, UNUSED_PROSPECT_DAYS\)\)/,
      "      .lt('created_at', retentionCutoff(now, UNUSED_PROSPECT_DAYS))"]],
    async (m) => {
      const f = list([row({ created_at: daysAgo(200) })])
      await m.applyProspectRetention(asAdmin(f), NOW)
      return rowsOf(f).length === 0
    },
  )
  check('A8-MUT: without the "never written to" test the 90-day rule would delete a prospect we wrote to', mutUnused)

  check('S8-MUT: putting the line back behind "only when something changed" would be caught',
    !logsEveryPass(routeSrc.replace(
      "console.log('[outreach-retention] pass complete', summary)",
      "if (summary.redacted || summary.unusedDeleted) { console.log('[outreach-retention] pass complete', summary) }")))
  check('S9-MUT: dropping the pass from the 15-minute cron would be caught',
    !ridesQuarterHour(automationSrc.replace(/await runIsolatedProspectRetention\(\)/, '')))

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}
main().catch((e) => { console.error(e); process.exit(1) })
export {}
