/**
 * The promise the settings screen makes: "a field you edit is yours; a scan
 * that runs again does not overwrite it."
 *
 * The owner saves through the REAL settings data layer (lib/project-settings/
 * data.ts); then the REAL stage A runs again (lib/seed-scan/runner.ts, with
 * applyBusinessToSettings) with a model that now answers differently. What the
 * owner saved stays; what they left to the scan follows the scan. Each case
 * has its control: the same values written WITHOUT the marks the screen sets,
 * which the same scan does overwrite, so the marks are what keeps them.
 *
 * Run: npx tsx lib/project-settings/__qa__/settings-scan-respects-owner.qa.ts
 */
import type { BusinessInsight } from '@/lib/free-check'
import { world } from '@/lib/seed-scan/__qa__/_fixtures'
import { markScanOwnedFields } from '@/lib/seed-scan/settings'
import { markBusinessFieldsAsUser, saveSection } from '../data'
import {
  audienceRows,
  HE_WP_INSIGHT,
  HOUR,
  makeChecker,
  NOW,
  PROJECT,
  profileRow,
  projectRow,
  scan,
  scannedTables,
  SCOPE,
  seedAdmin,
  settingsDeps,
  type Tables,
} from './_settings-fixtures'

const { check, finish } = makeChecker()

/** What the model says on the next scan: every field different. */
const NEXT: BusinessInsight = {
  ...HE_WP_INSIGHT,
  business: {
    ...HE_WP_INSIGHT.business!,
    companyName: 'שם חדש מהסריקה',
    summary: 'תיאור אחר לגמרי שהסריקה השנייה כתבה.',
    niche: 'צנרת תעשייתית',
    commerceType: 'product',
    isLocal: false,
    country: 'US',
    language: 'en',
    audiences: ['קהל חדש אחד', 'קהל חדש שניים'],
  },
}

const labels = (t: Tables) => audienceRows(t).map((r) => String(r.label))
const sources = (t: Tables) => (profileRow(t)?.field_sources ?? {}) as Record<string, string>
const later = (hours: number) => new Date(NOW.getTime() + hours * HOUR)

/** The owner's edits, through the screen's own saves. */
async function ownerEdits(t: Tables) {
  const { deps } = settingsDeps(t, { now: later(1) })
  const rows = audienceRows(t)
  const a = await saveSection(deps, PROJECT, { profile: { description: 'Our own description.', niche: 'Our niche' } })
  const b = await saveSection(deps, PROJECT, {
    audiences: [{ id: String(rows[1].id), label: String(rows[1].label) }, { label: 'An audience we added' }],
  })
  // The business card saves the column through its own action, then marks it.
  t.projects[0].business_name = 'The Owner Named It'
  const c = await markBusinessFieldsAsUser(deps, PROJECT, ['business_name'])
  return a.ok && b.ok && c.ok
}

/** The same values, written straight to the rows with no marks: what the screen must NOT do. */
function unmarkedEdits(t: Tables) {
  const p = profileRow(t)!
  p.description = 'Our own description.'
  p.niche = 'Our niche'
  const rows = audienceRows(t)
  t.project_audiences = t.project_audiences.filter((r) => r.id === rows[1].id)
  t.project_audiences.push({ id: 'aud-owner', project_id: PROJECT, user_id: rows[1].user_id, label: 'An audience we added', source: 'scan', position: 1 })
  t.projects[0].business_name = 'The Owner Named It'
}

const OWNER_LIST = (base: Tables) => [String(audienceRows(base)[1].label), 'An audience we added']

async function main() {
  const base = await scannedTables()

  console.log('\n1) a rescan after the owner edited: their fields stay, the rest follow the scan')
  {
    const t = structuredClone(base)
    check('the owner\'s saves went through', await ownerEdits(t))
    await scan(t, { trigger: 'rescan', at: later(25), insight: NEXT })
    const run = t.project_seed_runs.at(-1)
    check('the rescan ran to the end', run?.status === 'done' && run?.trigger === 'rescan', String(run?.status))
    const p = profileRow(t)!
    check('the description and niche the owner saved are kept', p.description === 'Our own description.' && p.niche === 'Our niche' && sources(t).description === 'user')
    check('the commerce type and local flag, left to the scan, follow the new scan', p.commerce_type === 'product' && p.is_local === false && sources(t).commerce_type === 'scan')
    check('the audience list the owner shaped is kept as is', JSON.stringify(labels(t)) === JSON.stringify(OWNER_LIST(base)), JSON.stringify(labels(t)))
    check('the business name the owner changed is kept', t.projects[0].business_name === 'The Owner Named It')

    const c = structuredClone(base)
    unmarkedEdits(c)
    await scan(c, { trigger: 'rescan', at: later(25), insight: NEXT })
    check('CONTROL: the same values without the marks are overwritten by the same rescan',
      profileRow(c)?.description === 'תיאור אחר לגמרי שהסריקה השנייה כתבה.' && profileRow(c)?.niche === 'צנרת תעשייתית' &&
      JSON.stringify(labels(c)) === JSON.stringify(['קהל חדש אחד', 'קהל חדש שניים']), `${profileRow(c)?.description} ${JSON.stringify(labels(c))}`)
  }

  console.log('\n2) a first-seed run (create) after the owner edited')
  {
    const t = structuredClone(base)
    await ownerEdits(t)
    await scan(t, { trigger: 'create', at: later(25), insight: NEXT })
    check('the business name the owner changed survives a create run', t.projects[0].business_name === 'The Owner Named It')
    check('…while the country and language, left to the scan, follow it', t.projects[0].country === 'US' && t.projects[0].language === 'en')
    check('…and the owner\'s profile fields and list are kept',
      profileRow(t)?.description === 'Our own description.' && JSON.stringify(labels(t)) === JSON.stringify(OWNER_LIST(base)))

    const c = structuredClone(base)
    unmarkedEdits(c)
    await scan(c, { trigger: 'create', at: later(25), insight: NEXT })
    check('CONTROL: without the mark, a create run replaces the business name', c.projects[0].business_name === 'שם חדש מהסריקה', String(c.projects[0].business_name))
  }

  console.log('\n3) an emptied list stays empty')
  {
    const t = structuredClone(base)
    await saveSection(settingsDeps(t).deps, PROJECT, { audiences: [] })
    await scan(t, { trigger: 'rescan', at: later(25), insight: NEXT })
    check('the owner removed every audience: a rescan does not refill the list', labels(t).length === 0)

    const c = structuredClone(base)
    c.project_audiences = []
    await scan(c, { trigger: 'rescan', at: later(25), insight: NEXT })
    check('CONTROL: an empty list without the owner\'s mark is refilled by the rescan', labels(c).length === 2)
  }

  console.log('\n4) the first scan of a project set up by hand')
  {
    // The seed contract keeps any value it did not write (not empty, not marked
    // 'scan'), so a hand-set market needs no mark from this screen; a creation
    // placeholder handed to the scan (markScanOwnedFields) is replaced.
    const t = world(projectRow({ business_name: 'Hand Made Plumbing', country: 'GB', language: 'en', city: 'London' })).tables
    await scan(t, { trigger: 'create', at: later(1), insight: NEXT })
    const p = t.projects[0]
    check('the first (create) run keeps every value the owner had set, with no mark needed',
      p.business_name === 'Hand Made Plumbing' && p.country === 'GB' && p.language === 'en' && p.city === 'London', JSON.stringify(p))
    check('…and still fills the profile it had nothing in', profileRow(t)?.description === 'תיאור אחר לגמרי שהסריקה השנייה כתבה.')
    const c = world(projectRow({ business_name: 'Hand Made Plumbing', country: 'IL', language: 'he' })).tables
    await markScanOwnedFields(seedAdmin(c, NOW), SCOPE, ['country', 'language'], NOW)
    await scan(c, { trigger: 'create', at: later(1), insight: NEXT })
    check('CONTROL: placeholders handed to the scan are replaced; the owner\'s name is not',
      c.projects[0].country === 'US' && c.projects[0].language === 'en' && c.projects[0].business_name === 'Hand Made Plumbing', JSON.stringify(c.projects[0]))
  }

  finish()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

export {}
