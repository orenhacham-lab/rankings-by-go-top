/**
 * W6d: the seeding scan's terms widen the suggestion business scope.
 *
 *   npx tsx lib/ai-visibility/__qa__/seed-scope.qa.ts
 *
 * A) the real functions over FakeAdmin. A seeded running-shoe project keeps
 *    "What are the best running shoes for beginners?"; an unseeded one still
 *    drops it, with the scope unchanged (the same object).
 * B) only additive: the base topics come first, excluded terms and the
 *    category stay the same, an empty scope stays empty, a short term never
 *    loosens the filter, and the bounds match b5's.
 * C) the reads are owner-filtered and fail closed to the old scope.
 * D) source guards on the route and on the helper.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { FakeAdmin } from '@/lib/__qa__/_fake-admin'
import { extractBusinessScope, filterSuggestionsByBusinessScope, isWithinBusinessScope, type BusinessScope } from '@/lib/ai-visibility/suggestion-cache'
import { readSeedScopeTerms, widenBusinessScope, SEED_SCOPE_AUDIENCES } from '@/lib/ai-visibility/seed-scope'
import { initialSummary } from '@/lib/seed-scan/summary'

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: string) {
  if (ok) { passed++; console.log(`  ✓ ${name}`) } else { failed++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const say = (s: string) => console.log(s)

const ROOT = join(__dirname, '..', '..', '..')
/** Source with comments stripped, so a guard never matches a comment. */
const code = (rel: string) => readFileSync(join(ROOT, rel), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')

const OWNER = 'user-owner'
const OTHER = 'user-other'
const SEEDED = 'project-seeded'
const PLAIN = 'project-plain'
const QUESTION = 'What are the best running shoes for beginners?'

function summary(seedKeywords: string[]) {
  return { ...initialSummary({ source: 'scan', domain: 'runshop.example', url: 'https://runshop.example/', locale: 'en' }), seedKeywords }
}
function tables() {
  return {
    project_profiles: [
      { project_id: SEEDED, user_id: OWNER, niche: 'running shoes', description: 'An online store for road and trail running shoes, socks and gear.' },
      // Another owner's row for the plain project: must never be read for it.
      { project_id: PLAIN, user_id: OTHER, niche: 'running shoes' },
    ],
    project_audiences: [
      { project_id: SEEDED, user_id: OWNER, position: 0, label: 'Road runners' },
      { project_id: SEEDED, user_id: OWNER, position: 1, label: 'Trail runners' },
      { project_id: PLAIN, user_id: OTHER, position: 0, label: 'beginners' },
    ],
    project_seed_runs: [
      { project_id: SEEDED, user_id: OWNER, created_at: '2026-09-20T10:00:00Z', summary: summary(['old keyword']) },
      { project_id: SEEDED, user_id: OWNER, created_at: '2026-09-27T10:00:00Z', summary: summary(['trail running shoes', 'running socks']) },
      { project_id: PLAIN, user_id: OTHER, created_at: '2026-09-27T10:00:00Z', summary: summary(['best running']) },
    ],
  }
}
const project = (id: string) => ({ id, user_id: OWNER, business_name: 'Run Shop', ai_business_profile: null })
const admin = (t: Record<string, Record<string, unknown>[]>, hooks = {}) => new FakeAdmin(t, hooks) as never

async function main() {
  say('A) the real functions: seeded keeps the question, unseeded still drops it')
  {
    const seededBase = extractBusinessScope(project(SEEDED))
    const seededTerms = await readSeedScopeTerms(admin(tables()), SEEDED, OWNER)
    const seeded = widenBusinessScope(seededBase, seededTerms)
    check('the seed profile is read: niche, audiences in order, the newest run\'s seed keywords',
      seededTerms.niche === 'running shoes' && seededTerms.audiences.join('|') === 'Road runners|Trail runners' && seededTerms.keywords.join('|') === 'trail running shoes|running socks',
      JSON.stringify(seededTerms))
    check(`seeded running-shoe project: "${QUESTION}" is kept`, isWithinBusinessScope(QUESTION, seeded)
      && filterSuggestionsByBusinessScope([{ question: QUESTION }], seeded).length === 1)
    check('…and the scope is the old one plus the scan\'s terms, in that order',
      seeded.allowedTopics.join('|') === 'Run Shop|running shoes|Road runners|Trail runners|trail running shoes|running socks', seeded.allowedTopics.join('|'))

    const plainBase = extractBusinessScope(project(PLAIN))
    const plainTerms = await readSeedScopeTerms(admin(tables()), PLAIN, OWNER)
    const plain = widenBusinessScope(plainBase, plainTerms)
    check('unseeded project: no terms (another owner\'s rows for it are not read)',
      plainTerms.niche === null && plainTerms.audiences.length === 0 && plainTerms.keywords.length === 0, JSON.stringify(plainTerms))
    check('…the scope is exactly today\'s (the same object, ["Run Shop"])', plain === plainBase && JSON.stringify(plain) === JSON.stringify(extractBusinessScope(project(PLAIN))))
    check(`…and "${QUESTION}" is still dropped`, !isWithinBusinessScope(QUESTION, plain)
      && filterSuggestionsByBusinessScope([{ question: QUESTION }], plain).length === 0)
    const hebrew = 'איזה חנות מוכרת נעלי ריצה?'
    check('…Hebrew behaves as today too (a generic opener is kept, a specific phrase is not)',
      isWithinBusinessScope(hebrew, plain) && !isWithinBusinessScope('המלצה על נעלי ריצה למתחילים', plain))
  }

  say('\nB) only additive')
  {
    const base: BusinessScope = { allowedTopics: ['Run Shop', 'Sneakers'], excludedTerms: ['golf'], businessCategory: 'sports_store' }
    const wide = widenBusinessScope(base, { niche: 'running shoes', audiences: ['sneakers', 'Road runners'], keywords: [] })
    check('the base topics stay first and unchanged; a term already there (any case) is not repeated',
      wide.allowedTopics.join('|') === 'Run Shop|Sneakers|running shoes|Road runners', wide.allowedTopics.join('|'))
    check('excluded terms and the category are untouched', JSON.stringify(wide.excludedTerms) === '["golf"]' && wide.businessCategory === 'sports_store')
    check('an excluded term still drops a question that matches the niche',
      filterSuggestionsByBusinessScope([{ question: 'Which running shoes are good for golf?' }], wide).length === 0)
    check('the base object is not mutated', base.allowedTopics.join('|') === 'Run Shop|Sneakers')
    const empty: BusinessScope = { allowedTopics: [], excludedTerms: [], businessCategory: null }
    const stillEmpty = widenBusinessScope(empty, { niche: 'running shoes', audiences: [], keywords: [] })
    check('an empty scope (no constraint) is never narrowed by seed terms', stillEmpty === empty && isWithinBusinessScope('Where can I buy a lawn mower?', stillEmpty))
    const short = widenBusinessScope(base, { niche: 'AI', audiences: ['a', ' '], keywords: ['go'] })
    check('a one- or two-letter term is never added (it would match almost any question)', short === base)
    const many = Array.from({ length: 9 }, (_, i) => ({ project_id: SEEDED, user_id: OWNER, position: i, label: `Audience ${i}` }))
    const t = { ...tables(), project_audiences: many, project_seed_runs: [{ project_id: SEEDED, user_id: OWNER, created_at: '2026-09-27T10:00:00Z', summary: summary(['k1', 'k22', 'k333', 'k4444', 'k55555', 'k666666', 'k7777777']) }] }
    const bounded = await readSeedScopeTerms(admin(t), SEEDED, OWNER)
    check(`at most ${SEED_SCOPE_AUDIENCES} audiences and 5 seed keywords, as b5 reads them`,
      bounded.audiences.length === SEED_SCOPE_AUDIENCES && bounded.audiences[0] === 'Audience 0' && bounded.keywords.join('|') === 'k1|k22|k333|k4444|k55555', JSON.stringify(bounded))
    const bad = await readSeedScopeTerms(admin({ ...tables(), project_seed_runs: [{ project_id: SEEDED, user_id: OWNER, created_at: '2026-09-27T10:00:00Z', summary: { seedKeywords: ['running shoes'] } }] }), SEEDED, OWNER)
    check('a summary that is not a valid snapshot gives no keywords', bad.keywords.length === 0 && bad.niche === 'running shoes')
  }

  say('\nC) owner filter and failures')
  {
    const t = tables()
    t.project_profiles.unshift({ project_id: SEEDED, user_id: OTHER, niche: 'golf clubs' })
    t.project_audiences.unshift({ project_id: SEEDED, user_id: OTHER, position: 0, label: 'Golfers' })
    t.project_seed_runs.push({ project_id: SEEDED, user_id: OTHER, created_at: '2026-09-28T10:00:00Z', summary: summary(['golf balls']) })
    const own = await readSeedScopeTerms(admin(t), SEEDED, OWNER)
    check('every table is read for the owner only (another user\'s niche, audience and newer run are ignored)',
      own.niche === 'running shoes' && !own.audiences.includes('Golfers') && own.keywords.join('|') === 'trail running shoes|running socks', JSON.stringify(own))
    const err = () => ({ code: 'XX000', message: 'boom' })
    const failing = await readSeedScopeTerms(admin(tables(), { project_profiles: { select: err }, project_audiences: { select: err }, project_seed_runs: { select: err } }), SEEDED, OWNER)
    const base = extractBusinessScope(project(SEEDED))
    check('read errors mean no terms, so the route keeps today\'s scope', failing.niche === null && failing.audiences.length === 0 && failing.keywords.length === 0
      && widenBusinessScope(base, failing) === base, JSON.stringify(failing))
    const thrower = { from() { throw new Error('connection reset') } } as never
    const thrown = await readSeedScopeTerms(thrower, SEEDED, OWNER)
    check('a thrown client error also means no terms', thrown.niche === null && thrown.audiences.length === 0 && thrown.keywords.length === 0)
  }

  say('\nD) source guards')
  {
    const route = code('app/api/ai-visibility/enriched-suggestions/route.ts')
    const call = route.indexOf('widenBusinessScope(')
    check('the route widens the scope it already had, with the seed terms of the signed-in owner',
      /const businessScope = widenBusinessScope\(\s*extractBusinessScope\(project as Record<string, unknown>\),\s*await readSeedScopeTerms\(admin, projectId, user\.id\),?\s*\)/.test(route))
    check('…only after the project\'s ownership is checked', call > route.indexOf("if ('error' in result)") && route.indexOf("if ('error' in result)") > 0
      && /if \(\(project as \{ user_id\?: string \}\)\.user_id !== user\.id\)/.test(route))
    check('…and every scope check in the route uses that one scope', (route.match(/extractBusinessScope\(/g) ?? []).length === 1
      && (route.match(/filterSuggestionsByBusinessScope\(\s*\w+,\s*businessScope,/g) ?? []).length === 2)
    const helper = code('lib/ai-visibility/seed-scope.ts')
    check('the helper filters all three reads by project and owner', (helper.match(/\.eq\('project_id', projectId\)\s*\.eq\('user_id', userId\)/g) ?? []).length === 3)
    check('the helper only reads (no insert, update, upsert or delete)', !/\.(insert|update|upsert|delete)\(/.test(helper))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) process.exitCode = 1
}

main().catch((e) => { console.error(e); process.exitCode = 1 })

export {}
