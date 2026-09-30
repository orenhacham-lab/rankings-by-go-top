/**
 * A rescan of an EXISTING project never overwrites what its owner entered.
 *
 * The real stage A (fetch, model, searches, settings, competitors) runs end to
 * end over the Hebrew WordPress fixture, against projects that already hold
 * owner data, and every owner row is compared before and after:
 *
 *   1) a legacy project, created before the seeding scan, scanned for the
 *      first time (trigger 'create', as the settings band starts it) and then
 *      rescanned: its name, country, language and city (unmarked values), a
 *      profile with owner-marked fields (one of them deliberately emptied), an
 *      audience list holding an owner row, the owner's competitors (one active,
 *      one the owner removed and the scan would find again) and its tracked
 *      keywords;
 *   2) a project the scan seeded, then edited by its owner on the settings
 *      screen (a renamed business, a corrected niche, an emptied description,
 *      the whole audience list deleted, a scan competitor removed), rescanned.
 *
 * What the scan may do: fill a field that is empty and unmarked (marking it
 * 'scan'), refresh a field it wrote itself, and ADD competitors within the
 * three-active cap. Anything else is a violation.
 *
 * MUTATION CONTROLS: each guard in lib/seed-scan/settings.ts is removed from a
 * copy of the file, the copy is swapped in for the real module, the same two
 * scenarios run again, and the suite requires them to report a violation.
 * Seed keywords are added only by the owner's bulk action (addSeedKeywords),
 * and only the ones not tracked yet: checked with an action that would
 * overwrite an existing row if it were handed one.
 *
 * Run: npx tsx lib/seed-scan/__qa__/seed-rescan-owner-data.qa.ts
 */
/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

// ── The settings module, swappable for a broken copy (mutation controls) ────
const Mod: any = require('module')
const origLoad = Mod._load
let MUTANT: Record<string, unknown> | null = null
let REAL_SETTINGS: Record<string, unknown> | null = null
Mod._load = function (request: string, parent: any, isMain: boolean) {
  const real = origLoad.call(this, request, parent, isMain)
  let resolved = request
  try { resolved = String(Mod._resolveFilename(request, parent, isMain)) } catch { /* virtual */ }
  if (!resolved.endsWith(join('lib', 'seed-scan', 'settings.ts'))) return real
  REAL_SETTINGS = real
  return new Proxy(real, { get: (t, k) => (MUTANT && typeof k === 'string' && k in MUTANT ? MUTANT[k] : (t as any)[k]) })
}

const { FakeNetwork, fakeModel, fakeSearch, HE_WP, HE_WP_INSIGHT, HE_WP_RESULTS, heWordPressSite, installFakeDns, captureConsole, makeChecker, NOW, OTHER_PROJECT, OTHER_USER, PROJECT, projectRow, USER, world } =
  require('./_fixtures') as typeof import('./_fixtures')
const { runStageA } = require('../runner') as typeof import('../runner')
const { createSeedRun } = require('../store') as typeof import('../store')
const { initialSummary } = require('../summary') as typeof import('../summary')
const { addSeedKeywords } = require('../tracking') as typeof import('../tracking')
const { MAX_ACTIVE_COMPETITORS } = require('../settings') as typeof import('../settings')

type Row = Record<string, unknown>
type Tables = Record<string, Row[]>
const { check, finish } = makeChecker()
const SCOPE = { projectId: PROJECT, userId: USER }
const DAY = 24 * 3600 * 1000
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v))
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
const pick = (row: Row | undefined, keys: string[]) => Object.fromEntries(keys.map((k) => [k, row?.[k] ?? null]))

async function scan(tables: Tables, admin: any, trigger: 'create' | 'rescan', at: Date) {
  const created = await createSeedRun(admin, SCOPE, {
    trigger,
    stage: 'a',
    summary: initialSummary({ source: 'scan', domain: HE_WP.key, url: 'https://plumber-tlv.co.il/', locale: 'he' }),
    now: at,
  })
  if (!created.ok) throw new Error(`createSeedRun: ${created.reason}`)
  const net = new FakeNetwork(heWordPressSite())
  const { value } = await captureConsole(() => runStageA({
    admin, scope: SCOPE, runId: created.run.id, lease: created.lease,
    deps: { fetchImpl: net.fetch, insight: fakeModel({ ok: true, insight: HE_WP_INSIGHT }).fn, search: fakeSearch(HE_WP_RESULTS).fn, now: () => at },
  }))
  const run = tables.project_seed_runs.find((r) => r.id === created.run.id)
  return { result: value, status: run?.status }
}

const competitorsOf = (t: Tables) => t.ai_visibility_competitors.filter((c) => c.project_id === PROJECT && c.user_id === USER)
const domainCount = (t: Tables, d: string) => competitorsOf(t).filter((c) => c.domain === d || c.name === d).length

/** Owner data that must be exactly as it was; returns every difference found. */
function ownerViolations(before: Tables, after: Tables, spec: { projectKeys: string[]; profileKeys: string[]; audiences: boolean }): string[] {
  const out: string[] = []
  const p0 = before.projects.find((p) => p.id === PROJECT), p1 = after.projects.find((p) => p.id === PROJECT)
  if (!same(pick(p0, spec.projectKeys), pick(p1, spec.projectKeys))) out.push(`project ${JSON.stringify(pick(p0, spec.projectKeys))} → ${JSON.stringify(pick(p1, spec.projectKeys))}`)
  // Columns the scan never owns.
  const never = ['name', 'target_domain', 'keywords', 'description', 'user_id']
  if (!same(pick(p0, never), pick(p1, never))) out.push('a column the scan never owns changed')
  const f0 = before.project_profiles.find((p) => p.project_id === PROJECT), f1 = after.project_profiles.find((p) => p.project_id === PROJECT)
  if (!same(pick(f0, spec.profileKeys), pick(f1, spec.profileKeys))) out.push(`profile ${JSON.stringify(pick(f0, spec.profileKeys))} → ${JSON.stringify(pick(f1, spec.profileKeys))}`)
  for (const k of spec.profileKeys.concat(spec.projectKeys)) {
    const m0 = (f0?.field_sources as Row | undefined)?.[k], m1 = (f1?.field_sources as Row | undefined)?.[k]
    if (m0 === 'user' && m1 !== 'user') out.push(`the owner's mark on ${k} was dropped`)
  }
  if ((f0?.field_sources as Row | undefined)?.audiences === 'user' && (f1?.field_sources as Row | undefined)?.audiences !== 'user') out.push("the owner's mark on audiences was dropped")
  if (spec.audiences) {
    const a0 = before.project_audiences.filter((a) => a.project_id === PROJECT), a1 = after.project_audiences.filter((a) => a.project_id === PROJECT)
    if (!same(a0, a1)) out.push(`audiences ${a0.map((a) => a.label).join('/')} → ${a1.map((a) => a.label).join('/')}`)
  }
  for (const c of competitorsOf(before)) {
    const now = after.ai_visibility_competitors.find((x) => x.id === c.id)
    if (!same(c, now)) out.push(`competitor ${c.domain} changed or vanished`)
    if (domainCount(after, String(c.domain)) !== 1) out.push(`competitor ${c.domain} listed ${domainCount(after, String(c.domain))} times`)
  }
  const added = competitorsOf(after).filter((c) => !competitorsOf(before).some((b) => b.id === c.id))
  if (added.some((c) => c.is_active !== true)) out.push('an added competitor is not a plain active addition')
  if (added.length > 0 && competitorsOf(after).filter((c) => c.is_active).length > MAX_ACTIVE_COMPETITORS) out.push('the five-active cap was exceeded')
  if (!same(before.tracking_targets, after.tracking_targets)) out.push('tracked keywords changed')
  const others = (t: Tables) => Object.fromEntries(Object.entries(t).map(([n, rows]) => [n, rows.filter((r) => r.user_id === OTHER_USER)]))
  if (!same(others(before), others(after))) out.push("another user's rows changed")
  return out
}

// ── Scenario 1: a legacy project, first scan then a rescan ──────────────────
async function legacyProject() {
  const ts = '2025-03-01T08:00:00.000Z' // stored as the instant; the fixture answers it in PostgREST's form
  const { tables, admin } = world(
    projectRow({ business_name: 'העסק של הבעלים', country: 'US', language: 'en', city: 'חיפה', created_at: '2025-03-01T08:00:00.000Z' }),
    {
      project_profiles: [{
        project_id: PROJECT, user_id: USER,
        description: null, // emptied by the owner on purpose
        commerce_type: null, is_local: null, // never filled: the scan may fill these
        niche: 'נישה שהבעלים כתב',
        detected_platform: 'Wix', // an unmarked value from before the scan existed
        field_sources: { description: 'user', niche: 'user' },
        created_at: ts, updated_at: ts,
      }],
      project_audiences: [
        { id: 'aud-1', project_id: PROJECT, user_id: USER, label: 'לקוחות שהבעלים הוסיף', source: 'user', position: 0, created_at: ts },
        { id: 'aud-2', project_id: PROJECT, user_id: USER, label: 'קהל ישן מסריקה', source: 'scan', position: 1, created_at: ts },
        { id: 'aud-x', project_id: OTHER_PROJECT, user_id: OTHER_USER, label: 'someone else', source: 'user', position: 0, created_at: ts },
      ],
      ai_visibility_competitors: [
        { id: 'c-1', user_id: USER, project_id: PROJECT, name: 'המתחרה של הבעלים', domain: 'owner-rival.co.il', aliases: ['OR'], is_active: true, created_at: ts, updated_at: ts },
        // Removed by the owner — and the scan will find it again in the searches.
        { id: 'c-2', user_id: USER, project_id: PROJECT, name: 'rival-plumber.co.il', domain: 'rival-plumber.co.il', aliases: [], is_active: false, created_at: ts, updated_at: ts },
        { id: 'c-x', user_id: OTHER_USER, project_id: OTHER_PROJECT, name: 'x', domain: 'x.co.il', aliases: [], is_active: true, created_at: ts, updated_at: ts },
      ],
      tracking_targets: [
        { id: 't-1', project_id: PROJECT, user_id: USER, keyword: 'אינסטלטור בתל אביב', notes: 'owner note', preferred_landing_page: '/owner-page', created_at: ts },
      ],
    },
  )
  const spec = { projectKeys: ['business_name', 'country', 'language', 'city'], profileKeys: ['description', 'niche', 'detected_platform'], audiences: true }
  const before = clone(tables)
  const first = await scan(tables, admin, 'create', NOW)
  const afterFirst = clone(tables)
  const second = await scan(tables, admin, 'rescan', new Date(NOW.getTime() + DAY))
  return {
    tables, before, afterFirst, first, second,
    violations: [...ownerViolations(before, afterFirst, spec).map((v) => `first scan: ${v}`), ...ownerViolations(afterFirst, tables, spec).map((v) => `rescan: ${v}`)],
  }
}

// ── Scenario 2: seeded by the scan, edited by the owner, rescanned ──────────
async function editedAfterSeed() {
  const { tables, admin } = world(projectRow(), { tracking_targets: [] })
  const first = await scan(tables, admin, 'create', NOW)
  // The owner's edits, as lib/project-settings/data.ts and the competitors route write them.
  const edit = new Date(NOW.getTime() + DAY / 2).toISOString()
  const project = tables.projects.find((p) => p.id === PROJECT) as Row
  project.business_name = 'השם שהבעלים בחר'
  const profile = tables.project_profiles.find((p) => p.project_id === PROJECT) as Row
  profile.niche = 'נישה מתוקנת'
  profile.description = null
  profile.field_sources = { ...(profile.field_sources as Row), business_name: 'user', niche: 'user', description: 'user', audiences: 'user' }
  profile.updated_at = edit
  tables.project_audiences = tables.project_audiences.filter((a) => a.project_id !== PROJECT)
  const easy = tables.ai_visibility_competitors.find((c) => c.domain === 'easy.co.il') as Row
  if (easy) { easy.is_active = false; easy.updated_at = edit }
  const before = clone(tables)
  const second = await scan(tables, admin, 'rescan', new Date(NOW.getTime() + DAY))
  const spec = { projectKeys: ['business_name'], profileKeys: ['niche', 'description'], audiences: true }
  return { tables, before, first, second, easyFound: !!easy, violations: ownerViolations(before, tables, spec).map((v) => `rescan: ${v}`) }
}

async function main() {
  installFakeDns()

  console.log('1) A legacy project with owner data: its first scan, then a rescan')
  const s1 = await legacyProject()
  check('both runs finish', s1.first.status === 'done' && s1.second.status === 'done', `${s1.first.status} ${s1.second.status}`)
  check('NOTHING the owner entered changed — project columns, marked and unmarked profile fields, audiences, competitors, keywords', s1.violations.length === 0, s1.violations.join(' | '))
  const prof = s1.tables.project_profiles.find((p) => p.project_id === PROJECT) as Row
  const marks = prof.field_sources as Row
  check('the fields that were empty and unmarked are filled, and marked scan', prof.commerce_type === 'service' && prof.is_local === true && marks.commerce_type === 'scan' && marks.is_local === 'scan', JSON.stringify(marks))
  check('…the field the owner emptied stays empty, still theirs', prof.description === null && marks.description === 'user')
  check('…an unmarked value from before the scan is not claimed by it', prof.detected_platform === 'Wix' && marks.detected_platform === undefined)
  const project = s1.tables.projects.find((p) => p.id === PROJECT) as Row
  check("…and the project's own name, country, language and city are the owner's", project.business_name === 'העסק של הבעלים' && project.country === 'US' && project.language === 'en' && project.city === 'חיפה')
  const active = competitorsOf(s1.tables).filter((c) => c.is_active).map((c) => c.domain).sort().join(',')
  // Wave 9: the cap is five active (was three), so the scan's fourth rival is added too.
  check('competitors: only added, up to five active; the one the owner removed stays removed, once',
    active === 'easy.co.il,owner-rival.co.il,pipes-pro.co.il,zap.co.il' && domainCount(s1.tables, 'rival-plumber.co.il') === 1
    && competitorsOf(s1.tables).find((c) => c.id === 'c-2')?.is_active === false, active)
  check('the rescan adds nothing more once the cap is reached', competitorsOf(s1.afterFirst).length === competitorsOf(s1.tables).length)

  console.log('\n2) Seeded by the scan, then edited on the settings screen, then rescanned')
  const s2 = await editedAfterSeed()
  check('the seed filled the settings (so there is something to protect) and the rescan finishes',
    s2.first.status === 'done' && s2.second.status === 'done' && s2.easyFound && s2.before.project_profiles.length === 1, `${s2.first.status} ${s2.second.status}`)
  check("NOTHING the owner edited changed — the renamed business, the corrected niche, the emptied description, the deleted audiences, the removed competitor", s2.violations.length === 0, s2.violations.join(' | '))
  check('…the deleted audience list stays empty', s2.tables.project_audiences.filter((a) => a.project_id === PROJECT).length === 0)
  check('…the removed competitor is not brought back', domainCount(s2.tables, 'easy.co.il') === 1 && competitorsOf(s2.tables).find((c) => c.domain === 'easy.co.il')?.is_active === false)
  const p2 = s2.tables.project_profiles.find((p) => p.project_id === PROJECT) as Row
  check('…while fields the scan owns stay the scan\'s (refreshing them is allowed)', (p2.field_sources as Row).commerce_type === 'scan' && (p2.field_sources as Row).country === 'scan')

  console.log('\n3) Seed keywords: added only by the owner\'s action, never over a tracked one')
  {
    const ts = '2025-03-01T08:00:00.000Z' // stored as the instant; the fixture answers it in PostgREST's form
    const owner = { id: 't-1', project_id: PROJECT, user_id: USER, keyword: 'פתיחת סתימות', notes: 'owner note', preferred_landing_page: '/owner-page', created_at: ts }
    const { tables, admin } = world(projectRow(), { tracking_targets: [clone(owner)] })
    const handed: string[][] = []
    // An action that OVERWRITES a row it is handed (upsert by keyword): so a keyword the seed passed on would change the owner's row.
    const action = async (fd: FormData) => {
      const list = String(fd.get('keywords')).split('\n')
      handed.push(list)
      for (const k of list) {
        const row = tables.tracking_targets.find((r) => r.keyword === k)
        if (row) Object.assign(row, { notes: '', preferred_landing_page: '' })
        else tables.tracking_targets.push({ id: `t-${k}`, project_id: PROJECT, user_id: USER, keyword: k, notes: '', preferred_landing_page: '', created_at: NOW.toISOString() })
      }
    }
    const res = await addSeedKeywords(admin as never, SCOPE, { keywords: ['פתיחת סתימות', ' איתור נזילות ', 'איתור נזילות'], targetDomain: HE_WP.target }, action as never)
    check('only the untracked keyword is handed to the action, once', same(handed, [['איתור נזילות']]), JSON.stringify(handed))
    check("the owner's tracked keyword is untouched (its note and landing page kept)", same(tables.tracking_targets.find((r) => r.id === 't-1'), owner))
    check('…and the new one is added', res.outcome.code === 'keywords_added' && tables.tracking_targets.length === 2, JSON.stringify(res.outcome))
    const control = clone(owner) as Row
    const probe = new FormData(); probe.set('keywords', 'פתיחת סתימות')
    const tablesBefore = clone(tables.tracking_targets)
    await action(probe)
    check('MUTATION CONTROL: had the tracked keyword been handed on, the owner\'s row WOULD have changed', !same(tables.tracking_targets.find((r) => r.id === 't-1'), control) && !same(tablesBefore, tables.tracking_targets))
  }

  console.log('\n4) MUTATION CONTROLS: each guard removed from a copy of settings.ts')
  {
    const src = readFileSync(join(__dirname, '..', 'settings.ts'), 'utf8')
    const dir = mkdtempSync(join(tmpdir(), 'seed-settings-mutant-'))
    const MUTANTS: [string, string, string][] = [
      ["an owner-marked field ('user') is no longer kept", "  if (source === 'user') return 'keptUser'\n", ''],
      ['an unmarked existing value is no longer kept', "  if (source !== 'scan' && !isEmpty(current)) return 'keptValue'\n", ''],
      ['an audience list holding an owner row is replaced', "  if (rows.some((r) => r.source === 'user')) return 'kept_user'\n", ''],
      ["the owner's saved audience list (audiences: 'user') is replaced", "sources.audiences === 'user' ? 'kept_user'", "false ? 'kept_user'"],
      ['a competitor already listed (the one the owner removed) is added again', '    if (known.has(domain)) { report.alreadyListed.push(domain); continue }\n', ''],
    ]
    try {
      for (const [label, from, to] of MUTANTS) {
        if (src.split(from).length !== 2) { check(`MUTATION CONTROL: ${label} — the guard is where the control expects it`, false, JSON.stringify(from)); continue }
        const file = join(dir, `settings-${MUTANTS.findIndex((m) => m[0] === label)}.ts`)
        writeFileSync(file, src.replace(from, to))
        MUTANT = require(file)
        const caught = [...(await legacyProject()).violations, ...(await editedAfterSeed()).violations]
        MUTANT = null
        check(`MUTATION CONTROL: ${label} → the scenarios report it`, caught.length > 0, caught.slice(0, 2).join(' | '))
      }
    } finally {
      MUTANT = null
      rmSync(dir, { recursive: true, force: true })
    }
    check('…and with the real module back, both scenarios are clean again', (await legacyProject()).violations.length === 0 && (await editedAfterSeed()).violations.length === 0 && REAL_SETTINGS !== null)
  }

  Mod._load = origLoad
  finish()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

export {}
