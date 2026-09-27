/**
 * What the scan may write into a project's settings, and what it may not.
 *
 * The contract with the settings screen (lib/seed-scan/settings.ts), as the
 * migration states it: the scan fills only a field that is empty or marked
 * 'scan', and marks what it wrote 'scan'; an owner's edit marks it 'user'. So
 * a value the scan did not write is never overwritten — an existing project's
 * country, language and name stay on its very first scan — unless the flow
 * that created the project handed that field to the scan as a placeholder
 * (markScanOwnedFields). Audiences are replaced only when none came from the
 * owner. Competitors are only ever added.
 *
 * Every rule is checked in both directions, and the concurrency cases replay
 * an owner's save landing between the scan's read and its write.
 *
 * Run: npx tsx lib/seed-scan/__qa__/seed-settings.qa.ts
 */
import type { ServiceRoleClient } from '@/lib/supabase/admin'
import {
  addValidatedCompetitors,
  applyBusinessToSettings,
  cleanAudienceLabels,
  competitorDomainKey,
  markScanOwnedFields,
  projectLanguageFrom,
  readSeedProject,
  type SeedProject,
} from '../settings'
import type { SeedBusiness } from '../types'
import { makeChecker, NOW, OTHER_PROJECT, OTHER_USER, PROJECT, projectRow, USER, world, type Tables } from './_fixtures'

const { check, finish } = makeChecker()
const SCOPE = { projectId: PROJECT, userId: USER }

const BUSINESS: SeedBusiness = {
  companyName: 'Scan Name Ltd',
  description: 'What the scan understood about the business.',
  commerceType: 'service',
  niche: 'plumbing',
  isLocal: true,
  platform: 'WordPress',
  language: 'he-IL',
  country: 'il',
}

type Row = Record<string, unknown>

/** What the scan understood of an American store. */
const US_BUSINESS: SeedBusiness = { ...BUSINESS, companyName: 'Scan Name Inc', language: 'en-US', country: 'us' }

async function apply(tables: Tables, admin: ServiceRoleClient, audiences: string[] = ['Home owners', 'Landlords'], business: SeedBusiness = BUSINESS) {
  const project = (await readSeedProject(admin, SCOPE)) as SeedProject
  const result = await applyBusinessToSettings(admin, SCOPE, { project, business, audiences, now: NOW })
  return { result, profile: tables.project_profiles.find((p) => p.project_id === PROJECT && p.user_id === USER) as Row | undefined, project: tables.projects[0] }
}

const profileRow = (over: Row = {}): Row => ({
  project_id: PROJECT,
  user_id: USER,
  description: null,
  commerce_type: null,
  niche: null,
  is_local: null,
  detected_platform: null,
  field_sources: {},
  created_at: '2026-09-01T00:00:00.000Z',
  updated_at: '2026-09-01T00:00:00.000Z',
  ...over,
})

async function main() {
  console.log('1) A field the owner edited survives every rescan')
  {
    const { tables, admin } = world(projectRow(), {
      project_profiles: [profileRow({ description: 'Written by the owner', niche: 'old scan niche', field_sources: { description: 'user', niche: 'scan' } })],
    })
    const { result, profile } = await apply(tables, admin)
    check('the apply succeeds', result.ok)
    check("the owner's description is untouched and still marked user", profile?.description === 'Written by the owner' && (profile?.field_sources as Row).description === 'user')
    check('a scan-owned field is refreshed and stays scan', profile?.niche === 'plumbing' && (profile?.field_sources as Row).niche === 'scan')
    check('empty fields are filled and marked scan',
      profile?.commerce_type === 'service' && profile?.detected_platform === 'WordPress' && (profile?.field_sources as Row).commerce_type === 'scan')
    check('the report says which were kept', result.ok && result.report.profile.keptUser.includes('description'))
  }
  {
    const { tables, admin } = world(projectRow(), { project_profiles: [profileRow({ description: 'Mine', field_sources: { description: 'user' } })] })
    const { profile } = await apply(tables, admin)
    check('…on a project that was never scanned too', profile?.description === 'Mine')
  }
  {
    // A value no scan wrote and nobody marked (a profile saved before marks existed).
    const { tables, admin } = world(projectRow(), { project_profiles: [profileRow({ commerce_type: 'product', is_local: false, field_sources: {} })] })
    const { result, profile } = await apply(tables, admin)
    check('a profile value the scan did not write stays, unmarked',
      profile?.commerce_type === 'product' && profile?.is_local === false && !(profile?.field_sources as Row).commerce_type && !(profile?.field_sources as Row).is_local)
    check('…the report says kept (value)', result.ok && result.report.profile.keptValue.join(',') === 'commerce_type,is_local', result.ok ? result.report.profile.keptValue.join(',') : '')
  }

  console.log("\n2) Project columns: empty or 'scan' fills; any other value stays; 'user' always stays")
  {
    const { tables, admin } = world(projectRow({ business_name: null, country: null, language: null }))
    const { result, profile, project } = await apply(tables, admin)
    check('an empty column fills', project.business_name === 'Scan Name Ltd' && project.country === 'IL' && project.language === 'he', JSON.stringify(project))
    check('…country upper-cased, language reduced to its primary subtag', project.country === 'IL' && project.language === 'he')
    check('…and each is marked scan', ['business_name', 'country', 'language'].every((f) => (profile?.field_sources as Row)[f] === 'scan'))
    check('city is never guessed', project.city === null && !((profile?.field_sources as Row).city))
    check('the report lists them as written', result.ok && result.report.project.written.join(',') === 'business_name,country,language', result.ok ? result.report.project.written.join(',') : '')
  }
  {
    const { tables, admin } = world(projectRow({ business_name: 'Typed At Signup', country: 'US' }))
    const { result, profile, project } = await apply(tables, admin)
    check('a column that already has a value stays', project.business_name === 'Typed At Signup' && project.country === 'US')
    check('…and is not claimed as scan', !((profile?.field_sources as Row).business_name) && !((profile?.field_sources as Row).country))
    check('…while the empty one still fills', project.language === 'he')
    check('the report says kept (value)', result.ok && result.report.project.keptValue.includes('business_name'))
  }
  {
    // Every project that exists today has no run yet: its first scan must not
    // move the market its rank checks run in, or the name they match.
    const { tables, admin } = world(projectRow({ business_name: 'Acme Plumbing Inc', country: 'US', language: 'en' }))
    const { result, profile, project } = await apply(tables, admin)
    check('an existing project keeps US, en and its name on its first scan',
      project.business_name === 'Acme Plumbing Inc' && project.country === 'US' && project.language === 'en', JSON.stringify(project))
    check('…none of them marked scan, and the report says so',
      ['business_name', 'country', 'language'].every((f) => !(profile?.field_sources as Row)[f])
      && result.ok && result.report.project.keptValue.join(',') === 'business_name,country,language' && result.report.project.written.length === 0)
  }
  {
    // Created from a URL: the create route put IL / he in as placeholders and
    // handed them to the scan; the store turns out to be American.
    const { tables, admin } = world(projectRow({ business_name: null, country: 'IL', language: 'he' }))
    check('the creation flow hands its placeholders to the scan', await markScanOwnedFields(admin, SCOPE, ['country', 'language'], NOW))
    const { result, profile, project } = await apply(tables, admin, [], US_BUSINESS)
    check("a project whose placeholders were marked gets the scan's values",
      project.country === 'US' && project.language === 'en' && project.business_name === 'Scan Name Inc', JSON.stringify(project))
    check('…each marked scan, so a rescan keeps them current', ['business_name', 'country', 'language'].every((f) => (profile?.field_sources as Row)[f] === 'scan')
      && result.ok && result.report.project.written.join(',') === 'business_name,country,language')
  }
  {
    const { tables, admin } = world(projectRow({ business_name: 'Owner Name', country: null, language: 'he' }), {
      project_profiles: [profileRow({ field_sources: { business_name: 'user', country: 'user', language: 'user' } })],
    })
    // A creation flow that marks everything cannot take a field from the owner.
    await markScanOwnedFields(admin, SCOPE, ['business_name', 'country', 'language'], NOW)
    const { profile, project } = await apply(tables, admin, [], US_BUSINESS)
    check('a user-marked column is never written, not even when empty, nor after a creation flow marked it',
      project.business_name === 'Owner Name' && project.country === null && project.language === 'he'
      && ['business_name', 'country', 'language'].every((f) => (profile?.field_sources as Row)[f] === 'user'))
  }
  {
    const before = projectRow({ business_name: null })
    const { tables, admin } = world({ ...before })
    await apply(tables, admin)
    const after = tables.projects[0]
    const changed = Object.keys(before).filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]))
    check('nothing else on the project is ever touched', changed.every((k) => ['business_name', 'country', 'language', 'city'].includes(k)), changed.join(','))
  }

  console.log('\n3) Audiences: the owner\'s list is left alone; the scan\'s own rows are replaced')
  {
    const { tables, admin } = world(projectRow(), {
      project_audiences: [
        { id: 'a1', project_id: PROJECT, user_id: USER, position: 0, label: 'Owner audience', source: 'user' },
        { id: 'a2', project_id: PROJECT, user_id: USER, position: 1, label: 'Old scan audience', source: 'scan' },
      ],
    })
    const { result } = await apply(tables, admin)
    check('one user audience → all audiences untouched, scan rows too',
      tables.project_audiences.length === 2 && tables.project_audiences.map((a) => a.label).join('|') === 'Owner audience|Old scan audience' && result.ok && result.report.audiences === 'kept_user')
  }
  {
    const { tables, admin } = world(projectRow(), {
      project_audiences: [
        { id: 'a2', project_id: PROJECT, user_id: USER, position: 0, label: 'Old scan audience', source: 'scan' },
        { id: 'x1', project_id: OTHER_PROJECT, user_id: OTHER_USER, position: 0, label: 'Someone else', source: 'scan' },
      ],
    })
    const labels = ['Home owners', 'home OWNERS', 'Landlords', 'Builders', 'Cafes', 'Schools', 'Clinics', '  ']
    const { result } = await apply(tables, admin, labels)
    const mine = tables.project_audiences.filter((a) => a.project_id === PROJECT)
    check('only scan rows → replaced by up to five new ones, de-duplicated, in order',
      mine.length === 5 && mine.map((a) => a.label).join('|') === 'Home owners|Landlords|Builders|Cafes|Schools' && mine.every((a) => a.source === 'scan' && a.user_id === USER),
      mine.map((a) => a.label).join('|'))
    check('…positions 0-4', mine.map((a) => a.position).join(',') === '0,1,2,3,4')
    check("…another project's audiences are untouched", tables.project_audiences.some((a) => a.id === 'x1'))
    check('…report: replaced', result.ok && result.report.audiences === 'replaced')
  }
  {
    const { tables, admin } = world(projectRow(), { project_audiences: [{ id: 'a2', project_id: PROJECT, user_id: USER, position: 0, label: 'Old scan audience', source: 'scan' }] })
    await apply(tables, admin, [])
    check('an empty answer replaces nothing', tables.project_audiences.length === 1 && tables.project_audiences[0].label === 'Old scan audience')
  }
  check('cleanAudienceLabels trims, collapses and caps at five', cleanAudienceLabels([' a  b ', 'A B', 'c', 'd', 'e', 'f', 'g']).join('|') === 'a b|c|d|e|f')

  console.log('\n4) An owner\'s save landing between the scan\'s read and write wins')
  {
    const { tables, fake } = world(projectRow(), { project_profiles: [profileRow({ niche: 'scan niche', field_sources: { niche: 'scan' } })] })
    // Replay: the settings screen saves (and marks niche 'user') after the scan
    // read the profile, before its write lands.
    const from = fake.from.bind(fake)
    let raced = false
    ;(fake as unknown as { from: (n: string) => unknown }).from = (name: string) => {
      const q = from(name) as unknown as { update: (p: Row) => unknown }
      if (name === 'project_profiles' && !raced) {
        const update = q.update.bind(q)
        q.update = (payload: Row) => {
          raced = true
          Object.assign(tables.project_profiles[0], { niche: 'Owner niche', field_sources: { niche: 'user' }, updated_at: '2026-09-27T10:00:05.000Z' })
          return update(payload)
        }
      }
      return q
    }
    const admin = fake as unknown as ServiceRoleClient
    const project = (await readSeedProject(admin, SCOPE)) as SeedProject
    const result = await applyBusinessToSettings(admin, SCOPE, { project, business: BUSINESS, audiences: [], now: NOW })
    const profile = tables.project_profiles[0]
    check('the scan\'s stale write matched nothing and it re-read', raced && result.ok)
    check("the owner's value and 'user' mark stand", profile.niche === 'Owner niche' && (profile.field_sources as Row).niche === 'user', JSON.stringify(profile))
    check('the scan still wrote the fields the owner did not touch', profile.description === BUSINESS.description && (profile.field_sources as Row).description === 'scan')
  }
  {
    const { tables, admin } = world(projectRow({ business_name: null, country: null }))
    const project = (await readSeedProject(admin, SCOPE)) as SeedProject
    // The owner names the business after the scan read the project.
    tables.projects[0].business_name = 'Owner Typed This'
    const result = await applyBusinessToSettings(admin, SCOPE, { project, business: BUSINESS, audiences: [], now: NOW })
    const profile = tables.project_profiles[0]
    check("a column the owner filled meanwhile keeps the owner's value", tables.projects[0].business_name === 'Owner Typed This')
    check('…is not marked scan', !((profile.field_sources as Row).business_name))
    check('…and the other columns are still written', tables.projects[0].country === 'IL' && (profile.field_sources as Row).country === 'scan' && result.ok)
  }
  {
    const hooks = { project_profiles: { insert: () => ({ code: '23505' }) } }
    const { admin } = world(projectRow(), {}, hooks)
    const project = (await readSeedProject(admin, SCOPE)) as SeedProject
    const result = await applyBusinessToSettings(admin, SCOPE, { project, business: BUSINESS, audiences: [], now: NOW })
    check('a profile row that keeps appearing (23505) ends in a bounded failure, not a loop', result.ok === false)
  }
  {
    const hooks = { project_audiences: { delete: () => ({ code: 'XX000', message: 'boom' }) } }
    const { admin } = world(projectRow(), {}, hooks)
    const project = (await readSeedProject(admin, SCOPE)) as SeedProject
    const result = await applyBusinessToSettings(admin, SCOPE, { project, business: BUSINESS, audiences: ['A'], now: NOW })
    check('a failed write is reported as a failure', result.ok === false)
  }

  console.log('\n5) Competitors are only ever added')
  {
    const existing = [
      { id: 'c1', user_id: USER, project_id: PROJECT, name: 'Active Co', domain: 'active.com', aliases: [], is_active: true, created_at: 'x', updated_at: 'x' },
      { id: 'c2', user_id: USER, project_id: PROJECT, name: 'removed.com', domain: 'removed.com', aliases: [], is_active: false, created_at: 'x', updated_at: 'x' },
      { id: 'c3', user_id: OTHER_USER, project_id: OTHER_PROJECT, name: 'x.com', domain: 'x.com', aliases: [], is_active: true, created_at: 'x', updated_at: 'x' },
    ]
    const snapshot = JSON.stringify(existing)
    const { tables, admin } = world(projectRow(), { ai_visibility_competitors: existing.map((r) => ({ ...r })) })
    const report = await addValidatedCompetitors(admin, SCOPE, ['https://www.Removed.com/about', 'new-one.com', 'x.com', 'third.com', 'fourth.com'], NOW)
    const mine = tables.ai_visibility_competitors.filter((r) => r.project_id === PROJECT)
    check('a competitor the owner removed is never added back', report !== 'error' && report.alreadyListed.includes('removed.com'))
    check("another project's competitor does not count as listed here", report !== 'error' && report.inserted.includes('x.com'))
    check('only up to three active per project (1 existing + 2 new)', report !== 'error' && report.inserted.join(',') === 'new-one.com,x.com' && report.overCap.join(',') === 'third.com,fourth.com',
      report === 'error' ? 'error' : JSON.stringify(report))
    check('the existing rows are unchanged, and none deleted', JSON.stringify(tables.ai_visibility_competitors.slice(0, 3)) === snapshot)
    check('new rows are owned by this user and project, active', mine.filter((r) => !['c1', 'c2'].includes(r.id as string)).every((r) => r.user_id === USER && r.is_active === true && r.domain === r.name))
  }
  {
    const { admin } = world(projectRow(), {}, { ai_visibility_competitors: { insert: () => ({ code: 'XX000' }) } })
    check('an insert failure is reported, not thrown', (await addValidatedCompetitors(admin, SCOPE, ['a.com'], NOW)) === 'error')
  }
  check('domains are compared the way the competitors route stores them', competitorDomainKey('HTTPS://www.Example.com/path') === 'example.com' && competitorDomainKey('  ') === null)
  {
    // A run of slashes before a line separator made `/\/.*$/` backtrack quadratically.
    const t0 = performance.now()
    const key = competitorDomainKey('example.com' + '/'.repeat(30_000) + '\u2028x')
    const ms = performance.now() - t0
    check('a hostile path after the domain is cut in linear time', key === 'example.com' && ms < 50, `${ms.toFixed(1)} ms`)
  }
  check('languages reduce to the primary subtag', projectLanguageFrom('he-IL') === 'he' && projectLanguageFrom('EN_us') === 'en' && projectLanguageFrom('hebrew') === null && projectLanguageFrom(null) === null)

  console.log('\n6) Every read and write names the owner')
  {
    const { tables, admin } = world(projectRow(), {
      projects: [projectRow(), projectRow({ id: OTHER_PROJECT, user_id: OTHER_USER, business_name: null })],
      project_profiles: [profileRow({ project_id: OTHER_PROJECT, user_id: OTHER_USER, description: 'theirs' })],
    })
    const wrongOwner = { projectId: OTHER_PROJECT, userId: USER }
    check('a project is not readable under another owner', (await readSeedProject(admin, wrongOwner)) === null)
    const before = JSON.stringify(tables)
    const theirs = tables.projects[1] as unknown as SeedProject
    const result = await applyBusinessToSettings(admin, wrongOwner, { project: theirs, business: BUSINESS, audiences: ['A'], now: NOW })
    check("settings for a project the scope does not own are refused, and nothing is written",
      result.ok === false && JSON.stringify(tables) === before)
    check('placeholders of a project the scope does not own are not marked, and nothing is written',
      (await markScanOwnedFields(admin, wrongOwner, ['country'], NOW)) === false && JSON.stringify(tables) === before)
  }

  console.log('\n7) markScanOwnedFields: a creation flow hands its placeholders to the scan')
  {
    const { tables, admin } = world(projectRow({ country: 'IL', language: 'he' }))
    const marked = await markScanOwnedFields(admin, SCOPE, ['country', 'language'], NOW)
    const profile = tables.project_profiles[0]
    check('no profile yet: one is created holding only the marks', marked && tables.project_profiles.length === 1
      && JSON.stringify(profile.field_sources) === '{"country":"scan","language":"scan"}'
      && profile.description === undefined && profile.scanned_at === undefined && profile.user_id === USER, JSON.stringify(profile))
    check('the project itself is not written', tables.projects[0].country === 'IL' && tables.projects[0].language === 'he')
    check('asking again changes nothing', (await markScanOwnedFields(admin, SCOPE, ['country', 'language'], NOW)) && tables.project_profiles.length === 1)
  }
  {
    const { tables, admin } = world(projectRow(), { project_profiles: [profileRow({ niche: 'n', field_sources: { niche: 'user', language: 'user' } })] })
    const marked = await markScanOwnedFields(admin, SCOPE, ['country', 'language', 'description' as never, 'name' as never], NOW)
    check("an existing profile: the marks are merged in, the owner's kept, and only the project's four columns can be handed over",
      marked && JSON.stringify(tables.project_profiles[0].field_sources) === '{"niche":"user","language":"user","country":"scan"}' && tables.project_profiles[0].niche === 'n',
      JSON.stringify(tables.project_profiles[0].field_sources))
  }
  {
    const { tables, fake } = world(projectRow(), { project_profiles: [profileRow({ field_sources: {} })] })
    // The owner saves settings (and marks country) between the read and the write.
    const from = fake.from.bind(fake)
    let raced = false
    ;(fake as unknown as { from: (n: string) => unknown }).from = (name: string) => {
      const q = from(name) as unknown as { update: (p: Row) => unknown }
      if (name === 'project_profiles' && !raced) {
        const update = q.update.bind(q)
        q.update = (payload: Row) => {
          raced = true
          Object.assign(tables.project_profiles[0], { field_sources: { country: 'user' }, updated_at: '2026-09-27T10:00:05.000Z' })
          return update(payload)
        }
      }
      return q
    }
    const marked = await markScanOwnedFields(fake as unknown as ServiceRoleClient, SCOPE, ['country', 'language'], NOW)
    check("an owner's save landing meanwhile wins: the write re-reads, and the owner's mark stands",
      raced && marked && JSON.stringify(tables.project_profiles[0].field_sources) === '{"country":"user","language":"scan"}', JSON.stringify(tables.project_profiles[0].field_sources))
  }
  {
    const { admin } = world(projectRow(), {}, { project_profiles: { insert: () => ({ code: '23505' }) } })
    check('a profile row that keeps appearing (23505) ends in a bounded failure', (await markScanOwnedFields(admin, SCOPE, ['country'], NOW)) === false)
    const failing = world(projectRow(), {}, { project_profiles: { select: () => ({ code: 'XX000' }) } })
    check('a failed read is a failure, and nothing is written', (await markScanOwnedFields(failing.admin, SCOPE, ['country'], NOW)) === false && failing.tables.project_profiles.length === 0)
    check('nothing asked, nothing to do', await markScanOwnedFields(admin, SCOPE, [], NOW))
  }

  finish()
}

main().catch((err) => {
  console.error('suite crashed', err)
  process.exit(1)
})
export {}
