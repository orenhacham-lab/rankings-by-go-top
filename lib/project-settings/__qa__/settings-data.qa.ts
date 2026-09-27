/**
 * The settings screen's server side (lib/project-settings/data.ts), over a
 * project the REAL stage A has read. What is proved:
 *   - who may read and save: signed in, their own project, every query named
 *     by owner (rows of another owner are neither shown nor touched);
 *   - what the screen gets: the profile and audiences with their sources, the
 *     competitors the scan added, and the rescan state, with the seed route's
 *     own 24-hour rule (parity with checkSeedCaps' Retry-After);
 *   - the flag: off means no scan state at all, the manual sections intact;
 *     an administrator bypasses it; a failing admin check fails closed;
 *   - a table that cannot be read hides only what needs it;
 *   - a save marks exactly the fields it carries 'user', validates before it
 *     writes, reconciles the audience list row by row, and survives a scan
 *     writing in between (compare-and-set);
 *   - nothing the database says reaches a result.
 *
 * Run: npx tsx lib/project-settings/__qa__/settings-data.qa.ts
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { checkSeedCaps, RESCAN_COOLDOWN_MS } from '@/lib/seed-scan/http'
import type { ServiceRoleClient } from '@/lib/supabase/admin'
import { FakeAdmin } from '@/lib/__qa__/_fake-admin'
import { world } from '@/lib/seed-scan/__qa__/_fixtures'
import { loadSettings, markBusinessFieldsAsUser, prepareFirstScan, saveSection } from '../data'
import type { SettingsData } from '../types'
import {
  audienceRows,
  HOUR,
  makeChecker,
  NOW,
  OTHER_PROJECT,
  OTHER_USER,
  PROJECT,
  profileRow,
  projectRow,
  scannedTables,
  SCOPE,
  SECRET,
  settingsDeps,
  USER,
  type Tables,
} from './_settings-fixtures'

const { check, finish } = makeChecker()
type Row = Record<string, unknown>

const ROOT = join(__dirname, '..', '..', '..')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
const fail = () => ({ message: SECRET, code: 'XX000' })
const sources = (t: Tables) => (profileRow(t)?.field_sources ?? {}) as Record<string, string>
let allResults = ''
const seen = <T>(v: T): T => {
  allResults += `${JSON.stringify(v)}\n`
  return v
}
const data = (r: { ok: boolean }) => (r as unknown as { data: SettingsData }).data

async function main() {
  const base = await scannedTables()
  const runAt = String(base.project_seed_runs[0].created_at)

  // ── 1. Who may read ────────────────────────────────────────────────────────
  console.log('\n1) signed in, their own project, named by owner')
  {
    const { deps, log } = settingsDeps(structuredClone(base), { userId: null })
    const r = seen(await loadSettings(deps, PROJECT))
    check('signed out: unauthorized, no table read', !r.ok && r.code === 'unauthorized' && log.length === 0)
  }
  {
    const { deps } = settingsDeps(structuredClone(base), { sessionThrows: true })
    const r = seen(await loadSettings(deps, PROJECT))
    check('no session at all: unavailable', !r.ok && r.code === 'unavailable')
  }
  {
    const t = structuredClone(base)
    t.projects.push(projectRow({ id: OTHER_PROJECT, user_id: OTHER_USER }))
    t.project_profiles.push({ ...profileRow(t), project_id: OTHER_PROJECT, user_id: OTHER_USER })
    const { deps, log } = settingsDeps(t)
    const r = seen(await loadSettings(deps, OTHER_PROJECT))
    check("someone else's project: not_found, and nothing past the project read", !r.ok && r.code === 'not_found' && log.join() === 'projects', log.join())
    const bad = seen(await loadSettings(deps, 'not-a-uuid'))
    check('a malformed project id: not_found', !bad.ok && bad.code === 'not_found')
    const save = seen(await saveSection(deps, OTHER_PROJECT, { profile: { description: 'mine now' } }))
    check("a save to someone else's project: not_found, their profile untouched",
      !save.ok && save.code === 'not_found' && t.project_profiles.find((p) => p.project_id === OTHER_PROJECT)?.description !== 'mine now')
  }
  {
    // Rows under the same project id but another owner (RLS would hide them; the code names the owner too).
    const t = structuredClone(base)
    t.project_audiences.push({ id: 'foreign-1', project_id: PROJECT, user_id: OTHER_USER, label: 'FOREIGN', source: 'user', position: 0 })
    const { deps } = settingsDeps(t)
    const r = seen(await loadSettings(deps, PROJECT))
    check("another owner's rows are never shown", r.ok && JSON.stringify(data(r)).indexOf('FOREIGN') === -1)
    await saveSection(deps, PROJECT, { audiences: [{ label: 'Only one' }] })
    check("…and never touched by a save that replaces the list", t.project_audiences.some((a) => a.id === 'foreign-1'))
  }

  // ── 2. What the screen gets ────────────────────────────────────────────────
  console.log('\n2) the profile, the audiences, the scan\'s competitors and the rescan state')
  {
    const { deps } = settingsDeps(structuredClone(base))
    const r = seen(await loadSettings(deps, PROJECT))
    const d = r.ok ? data(r) : null
    const p = d?.profile.state === 'ok' ? d.profile.value : null
    check('the profile as the scan wrote it, every field marked scan',
      !!p && p.description === profileRow(base)?.description && p.commerce_type === 'service' && p.is_local === true &&
      p.detected_platform === 'WordPress' && ['description', 'commerce_type', 'niche', 'is_local'].every((k) => p.sources[k] === 'scan'), JSON.stringify(p))
    const a = d?.audiences.state === 'ok' ? d.audiences.value : []
    check('the audiences in order, each marked scan',
      JSON.stringify(a.map((x) => x.label)) === JSON.stringify(audienceRows(base).map((x) => x.label)) && a.length === 4 && a.every((x) => x.source === 'scan'))
    check('the competitors the scan added (a4), and only those',
      JSON.stringify([...(d?.scanCompetitors ?? [])].sort()) === JSON.stringify(['easy.co.il', 'pipes-pro.co.il', 'rival-plumber.co.il']), JSON.stringify(d?.scanCompetitors))
    check('the latest run: done, not live, and the next scan 24 hours after it started',
      d?.rescan?.latest?.status === 'done' && d.rescan.latest.live === false &&
      d.rescan.availableAt === new Date(new Date(runAt).getTime() + RESCAN_COOLDOWN_MS).toISOString(), JSON.stringify(d?.rescan))
  }
  {
    // Parity with the route's own rule, at two moments.
    for (const hours of [5, 23.5, 25]) {
      const at = new Date(NOW.getTime() + hours * HOUR)
      const t = structuredClone(base)
      const { deps } = settingsDeps(t, { now: at })
      const r = await loadSettings(deps, PROJECT)
      const view = r.ok ? data(r).rescan : null
      const caps = await checkSeedCaps(new FakeAdmin(t, {}, () => at.getTime()) as unknown as ServiceRoleClient, SCOPE, at, {})
      const routeOpens = !caps.ok && caps.code === 'rescan_too_soon' ? at.getTime() + (caps.retryAfterSeconds ?? 0) * 1000 : null
      const screenOpens = view?.availableAt ? new Date(view.availableAt).getTime() : null
      check(`+${hours}h: the screen's "next scan" matches the seed route's Retry-After`,
        routeOpens === null ? screenOpens === null && caps.ok : screenOpens !== null && Math.abs(routeOpens - screenOpens) < 1000,
        `${screenOpens} vs ${routeOpens}`)
    }
  }
  {
    const t = structuredClone(base)
    t.project_seed_runs.push({ ...t.project_seed_runs[0], id: 'run-live', status: 'running', created_at: new Date(NOW.getTime() + HOUR).toISOString(),
      lease_expires_at: new Date(NOW.getTime() + 2 * HOUR).toISOString(), finished_at: null })
    const live = await loadSettings(settingsDeps(t, { now: new Date(NOW.getTime() + HOUR) }).deps, PROJECT)
    const lapsed = await loadSettings(settingsDeps(t, { now: new Date(NOW.getTime() + 3 * HOUR) }).deps, PROJECT)
    check('a running run with its lease held is live; a lapsed lease is not',
      live.ok && data(live).rescan?.latest?.live === true && lapsed.ok && data(lapsed).rescan?.latest?.status === 'running' && data(lapsed).rescan?.latest?.live === false)
  }
  {
    const { tables } = world(projectRow())
    const r = await loadSettings(settingsDeps(tables).deps, PROJECT)
    check('never scanned: no latest run, may start now, no profile yet',
      r.ok && data(r).rescan?.latest === null && data(r).rescan?.availableAt === null && data(r).profile.state === 'ok' &&
      (data(r).profile as { value: unknown }).value === null && data(r).audiences.state === 'ok')
  }

  // ── 3. The flag ────────────────────────────────────────────────────────────
  console.log('\n3) the flag off: no scan state; the manual sections stay')
  {
    const off = await loadSettings(settingsDeps(structuredClone(base), { env: { ENABLE_SEED_SCAN: undefined } }).deps, PROJECT)
    check('ENABLE_SEED_SCAN unset: seedScan false, no rescan state, no scan competitors; profile and audiences still read',
      off.ok && data(off).seedScan === false && data(off).rescan === null && data(off).scanCompetitors.length === 0 &&
      data(off).profile.state === 'ok' && data(off).audiences.state === 'ok')
    const admin = await loadSettings(settingsDeps(structuredClone(base), { env: { ENABLE_SEED_SCAN: 'false' }, admins: [USER] }).deps, PROJECT)
    check('an administrator gets the scan with the flag off', admin.ok && data(admin).seedScan === true && data(admin).rescan !== null)
    const throws = await loadSettings(settingsDeps(structuredClone(base), { env: { ENABLE_SEED_SCAN: undefined }, isAdminThrows: true }).deps, PROJECT)
    check('the admin check failing: fails closed (seedScan false), the screen still loads', throws.ok && data(throws).seedScan === false)
    const t = structuredClone(base)
    const save = await saveSection(settingsDeps(t, { env: { ENABLE_SEED_SCAN: undefined } }).deps, PROJECT, { profile: { niche: 'hand set' } })
    check('saving works with the flag off', save.ok && profileRow(t)?.niche === 'hand set')
  }

  // ── 4. A table that cannot be read ─────────────────────────────────────────
  console.log('\n4) an unreadable table hides only what needs it')
  {
    const cases: [string, string, (d: SettingsData) => boolean][] = [
      ['project_profiles', 'the profile unavailable, the rest there', (d) => d.profile.state === 'unavailable' && d.audiences.state === 'ok' && d.rescan !== null],
      ['project_audiences', 'the audiences unavailable, the rest there', (d) => d.audiences.state === 'unavailable' && d.profile.state === 'ok' && d.rescan !== null],
      ['project_seed_runs', 'no rescan state, the profile and audiences there', (d) => d.rescan === null && d.profile.state === 'ok' && d.audiences.state === 'ok'],
      ['project_seed_steps', 'no scan competitors, everything else there', (d) => d.scanCompetitors.length === 0 && d.rescan !== null && d.profile.state === 'ok'],
    ]
    for (const [table, what, ok] of cases) {
      const r = seen(await loadSettings(settingsDeps(structuredClone(base), { hooks: { [table]: { select: fail } } }).deps, PROJECT))
      check(`${table} unreadable: ${what}`, r.ok && ok(data(r)), JSON.stringify(r).slice(0, 200))
    }
    const r = seen(await loadSettings(settingsDeps(structuredClone(base), { hooks: { projects: { select: fail } } }).deps, PROJECT))
    check('the project itself unreadable: unavailable', !r.ok && r.code === 'unavailable')
  }

  // ── 5. Saving ──────────────────────────────────────────────────────────────
  console.log('\n5) a save marks what it carries, validates first, and reconciles the list')
  {
    const t = structuredClone(base)
    const before = profileRow(t)!
    const r = seen(await saveSection(settingsDeps(t).deps, PROJECT, { profile: { description: '  Our own   words.\n\n\n\nSecond line.  ' } }))
    const s = sources(t)
    check('the edited field is saved, cleaned, and becomes user', r.ok && profileRow(t)?.description === 'Our own words.\n\nSecond line.' && s.description === 'user',
      JSON.stringify(profileRow(t)?.description))
    check('…the fields it did not carry keep their value and scan', s.commerce_type === 'scan' && s.niche === 'scan' && s.is_local === 'scan' &&
      profileRow(t)?.niche === before.niche && s.audiences === undefined)
    check('…and the save answers with the fresh data', r.ok && data(r).profile.state === 'ok' &&
      (data(r).profile as { value: { sources: Record<string, string> } }).value.sources.description === 'user')
  }
  {
    const t = structuredClone(base)
    const same = profileRow(t)!.commerce_type
    await saveSection(settingsDeps(t).deps, PROJECT, { profile: { commerce_type: same, is_local: null } })
    check('a confirmed value (even the one the scan found) and an emptied field both become user',
      sources(t).commerce_type === 'user' && sources(t).is_local === 'user' && profileRow(t)?.is_local === null && profileRow(t)?.commerce_type === same)
  }
  {
    const invalid: [string, unknown, string][] = [
      ['an unknown key', { profile: { detected_platform: 'Shopify' } }, 'invalid_request'],
      ['an unknown section', { profile: {}, competitors: [] }, 'invalid_request'],
      ['a commerce type the app does not have', { profile: { commerce_type: 'shop' } }, 'invalid_request'],
      ['is_local as text', { profile: { is_local: 'yes' } }, 'invalid_request'],
      ['a description over 1,500 characters', { profile: { description: 'x'.repeat(1_501) } }, 'invalid_request'],
      ['a niche over 120 characters', { profile: { niche: 'x'.repeat(121) } }, 'invalid_request'],
      ['six audiences', { audiences: Array.from({ length: 6 }, (_, i) => ({ label: `A${i}` })) }, 'too_many_audiences'],
      ['an empty audience', { audiences: [{ label: '   ' }] }, 'invalid_request'],
      ['an audience with another key', { audiences: [{ label: 'x', source: 'scan' }] }, 'invalid_request'],
      ['an audience id that is not an id', { audiences: [{ id: "x' or 1=1", label: 'x' }] }, 'invalid_request'],
      ['an audience over 300 characters', { audiences: [{ label: 'x'.repeat(301) }] }, 'invalid_request'],
      ['not an object', 'profile', 'invalid_request'],
    ]
    let all = true
    const fails: string[] = []
    for (const [name, body, code] of invalid) {
      const t = structuredClone(base)
      const before = JSON.stringify([t.project_profiles, t.project_audiences])
      const r = seen(await saveSection(settingsDeps(t).deps, PROJECT, body))
      const ok = !r.ok && r.code === code && JSON.stringify([t.project_profiles, t.project_audiences]) === before
      if (!ok) fails.push(name)
      all &&= ok
    }
    check(`refused before anything is written: ${invalid.map((i) => i[0]).join('; ')}`, all, fails.join(', '))
  }
  {
    const t = structuredClone(base)
    const rows = audienceRows(t)
    const list = [
      { id: String(rows[2].id), label: String(rows[2].label) },
      { id: String(rows[0].id), label: 'Edited by the owner' },
      { label: 'Added by the owner' },
      { label: 'added BY the owner' },
    ]
    const r = seen(await saveSection(settingsDeps(t).deps, PROJECT, { audiences: list }))
    const after = audienceRows(t)
    check('the list saved as sent, in order, a repeated label kept once',
      r.ok && JSON.stringify(after.map((a) => a.label)) === JSON.stringify([rows[2].label, 'Edited by the owner', 'Added by the owner']) &&
      after.map((a) => a.position).join() === '0,1,2', JSON.stringify(after.map((a) => [a.label, a.position, a.source])))
    check('an untouched row keeps its id and scan; an edited row keeps its id and becomes user; a new one is user',
      after[0].id === rows[2].id && after[0].source === 'scan' && after[1].id === rows[0].id && after[1].source === 'user' && after[2].source === 'user')
    check('the rows left out are removed', !after.some((a) => a.id === rows[1].id || a.id === rows[3].id))
    check('…and the list as a whole becomes the owner\'s (field_sources.audiences = user)', sources(t).audiences === 'user')
    const t2 = structuredClone(base)
    await saveSection(settingsDeps(t2).deps, PROJECT, { audiences: [] })
    check('an emptied list is saved as empty, and is the owner\'s', audienceRows(t2).length === 0 && sources(t2).audiences === 'user')
    const t3 = structuredClone(base)
    const before3 = JSON.stringify(t3.project_audiences)
    await saveSection(settingsDeps(t3).deps, PROJECT, { profile: { niche: 'n' } })
    check('a profile-only save leaves the list and its mark alone', JSON.stringify(t3.project_audiences) === before3 && sources(t3).audiences === undefined)
  }
  {
    // The scan writes between the save's read and its write: the compare-and-set loses once, re-reads, and merges.
    const t = structuredClone(base)
    const { deps, db } = settingsDeps(t, { now: new Date(NOW.getTime() + HOUR) })
    const from = db.from.bind(db)
    let raced = false
    ;(db as unknown as { from: (n: string) => unknown }).from = (name: string) => {
      const q = from(name) as unknown as { update: (p: Row) => unknown }
      if (name === 'project_profiles' && !raced) {
        const update = q.update.bind(q)
        q.update = (p: Row) => {
          raced = true
          const row = profileRow(t)!
          Object.assign(row, { niche: 'written by the scan meanwhile', updated_at: new Date(NOW.getTime() + 30 * 60_000).toISOString(),
            field_sources: { ...(row.field_sources as Row), niche: 'scan', city: 'scan' } })
          return update(p)
        }
      }
      return q
    }
    const r = seen(await saveSection(deps, PROJECT, { profile: { description: 'The owner wins' } }))
    check('a scan writing mid-save: the save re-reads and still lands', r.ok && raced && profileRow(t)?.description === 'The owner wins' && sources(t).description === 'user')
    check('…without undoing what the scan wrote to the other fields or their marks',
      profileRow(t)?.niche === 'written by the scan meanwhile' && sources(t).niche === 'scan' && sources(t).city === 'scan', JSON.stringify(sources(t)))
  }
  {
    const t = structuredClone(base)
    const r = seen(await saveSection(settingsDeps(t, { hooks: { project_profiles: { update: fail } } }).deps, PROJECT, { profile: { niche: 'x' } }))
    check('a write that fails: save_failed, nothing of the failure in the result', !r.ok && r.code === 'save_failed' && !JSON.stringify(r).includes(SECRET))
    const t2 = structuredClone(base)
    const r2 = seen(await saveSection(settingsDeps(t2, { hooks: { project_audiences: { insert: fail } } }).deps, PROJECT, { audiences: [{ label: 'new one' }] }))
    check('an audience write that fails: save_failed', !r2.ok && r2.code === 'save_failed')
  }
  {
    const { tables } = world(projectRow())
    const r = seen(await saveSection(settingsDeps(tables).deps, PROJECT, { profile: { niche: 'Hand made' } }))
    check('a project with no profile row yet: the save creates it for the owner, marked user',
      r.ok && profileRow(tables)?.niche === 'Hand made' && profileRow(tables)?.user_id === USER && sources(tables).niche === 'user')
  }

  // ── 6. The business card's marks, and the first scan ───────────────────────
  console.log('\n6) the business card marks what changed; a first scan keeps a hand-made project\'s values')
  {
    const t = structuredClone(base)
    const r = seen(await markBusinessFieldsAsUser(settingsDeps(t).deps, PROJECT, ['business_name', 'business_name']))
    check('the changed business field becomes user; the others stay scan', r.ok && sources(t).business_name === 'user' && sources(t).country === 'scan' && sources(t).language === 'scan')
    let all = true
    for (const bad of [[], ['name'], ['description'], 'business_name', ['business_name', 'country', 'language', 'city', 'city']]) {
      const r2 = seen(await markBusinessFieldsAsUser(settingsDeps(structuredClone(base)).deps, PROJECT, bad))
      all &&= !r2.ok && r2.code === 'invalid_request'
    }
    check('only business fields may be marked (not profile fields, not an empty list)', all)
  }
  {
    const { tables } = world(projectRow({ business_name: 'Hand Made Plumbing', country: 'US', language: 'en', city: null }))
    const r = await prepareFirstScan(settingsDeps(tables).deps, PROJECT)
    const s = sources(tables)
    check('before a first scan: the business values the owner set become user, an empty one does not',
      r.ok && s.business_name === 'user' && s.country === 'user' && s.language === 'user' && s.city === undefined, JSON.stringify(s))
    const again = structuredClone(base)
    const before = JSON.stringify(again.project_profiles)
    const r2 = await prepareFirstScan(settingsDeps(again).deps, PROJECT)
    check('a project scanned before needs nothing (its next run is a rescan)', r2.ok && JSON.stringify(again.project_profiles) === before)
    const { tables: t3 } = world(projectRow({ business_name: 'X' }))
    const r3 = seen(await prepareFirstScan(settingsDeps(t3, { hooks: { project_seed_runs: { select: fail } } }).deps, PROJECT))
    check('the runs unreadable: the scan must not start (unavailable), nothing written', !r3.ok && r3.code === 'unavailable' && t3.project_profiles.length === 0)
    const { tables: t4 } = world(projectRow({ user_id: OTHER_USER, business_name: 'X' }))
    const r4 = seen(await prepareFirstScan(settingsDeps(t4).deps, PROJECT))
    check("someone else's project: not_found, nothing written", !r4.ok && r4.code === 'not_found' && t4.project_profiles.length === 0)
  }

  check('SECRET_PROVIDER_TEXT never reached a result', !allResults.includes(SECRET))

  // ── 7. Source: as the owner, named by owner ────────────────────────────────
  console.log('\n7) data.ts reads and writes only as the owner, every query named by owner')
  {
    const src = strip(readFileSync(join(ROOT, 'lib/project-settings/data.ts'), 'utf8'))
    const chains = (s: string) =>
      [...s.matchAll(/\.from\('(\w+)'\)/g)].map((m) => {
        const rest = s.slice(m.index! + m[0].length, m.index! + m[0].length + 500)
        const end = rest.search(/\n\s*(const|let|if|return|for)\b|\n\s*\}\)?\n/)
        return { table: m[1], chain: end === -1 ? rest : rest.slice(0, end) }
      })
    const named = (s: string) => {
      const all = chains(s)
      return all.length >= 8 && all.every(({ table, chain }) =>
        /^\s*\.insert\(/.test(chain)
          ? /user_id: scope\.userId/.test(chain)
          : table === 'projects'
            ? /\.eq\('user_id', session\.userId\)/.test(chain)
            : /\.eq\('user_id', (scope|o\.scope)\.userId\)/.test(chain))
    }
    const noServiceRole = (s: string) => !/createAdminClient|ServiceRoleClient|SUPABASE_SERVICE_ROLE/.test(s)
    check('every query in data.ts names the owner (inserts carry user_id)', named(src), JSON.stringify(chains(src).filter((c) => !/user_id/.test(c.chain))))
    check('data.ts never touches the service role', noServiceRole(src))
    check('MUT: an audience read without the owner filter fails it',
      !named(src.replace(".select('id, label, source, position, created_at')\n    .eq('project_id', scope.projectId)\n    .eq('user_id', scope.userId)", ".select('id, label, source, position, created_at')\n    .eq('project_id', scope.projectId)")))
    check('MUT: an audience delete without the owner filter fails it', !named(src.replace(".in('id', removed)\n      .eq('project_id', scope.projectId)\n      .eq('user_id', scope.userId)", ".in('id', removed)\n      .eq('project_id', scope.projectId)")))
    check('MUT: the service role imported fails it', !noServiceRole(`import { createAdminClient } from '@/lib/supabase/admin'\n${src}`))
  }

  finish()
}


main().catch((err) => {
  console.error(err)
  process.exit(1)
})

export {}
