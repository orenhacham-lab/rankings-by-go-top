/**
 * THE SCAN MAPS UP TO FIVE REAL COMPETITORS — the guard.
 *
 * Root cause (production scans, 2026-09-29/30): a4 sends three searches, one
 * per seed keyword. A domain the model did not name was kept only when it
 * ranked in TWO of the three. The keywords are usually different product lines
 * (coffee machines / vacuums / LED lighting), so almost nobody ranks for two:
 * deby-electric.co.il got 23 ranking domains and mapped ONE competitor;
 * gotop.co.il got 26 and mapped ONE.
 *
 *   A) the production result lists now map five, the two-search domains first,
 *      then the best-placed of each search, rank by rank;
 *   B) the exclusions still hold: the site itself, social/video/search, and now
 *      government/academic sites (campus.gov.il, tau.ac.il);
 *   C) never more than five are shown; a model suggestion no search showed is
 *      still dropped; an empty search shows nobody;
 *   D) a4 offers candidates past the fifth, so a domain the owner removed (never
 *      added again) leaves its place to the next one, still within five active;
 *   E) no extra search: a4 still sends one search per seed keyword.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { FakeAdmin } from '@/lib/__qa__/_fake-admin'
import { rankCompetitors, MAX_COMPETITORS, MAX_COMPETITOR_CANDIDATES } from '@/lib/seed-scan/steps'
import { isNonCompetitor } from '@/lib/seed-scan/serper'
import { addValidatedCompetitors } from '@/lib/seed-scan/settings'

let passed = 0
let failed = 0
function check(name: string, ok: boolean, got?: unknown) {
  if (ok) passed++
  else { failed++; console.log('FAIL', name, got === undefined ? '' : JSON.stringify(got)) }
}
const names = (cs: { domain: string }[]) => cs.map((c) => c.domain).join(',')

// A) production result lists (read-only copy of the scans' a4 details)
const DEBY = [
  ['nespresso.com', 'coffeeman.co.il', 'payngo.co.il', 'sapore.co.il', 'coffee4u.co.il', 'bigelectric.co.il', 'shop.super-pharm.co.il', 'vero-cafe.co.il', 'traklin.co.il', 'espresso-club.co.il'],
  ['dyson.co.il', 'zap.co.il', 'traklin.co.il', 'p1000.co.il', '100-100.co.il'],
  ['led4light.co.il', 'lighting.co.il', 'ledmarket.co.il', 'dealteora.co.il', 'wlight.co.il', 'deby-electric.co.il', 'erco.co.il', 'ace.co.il'],
]
const deby = rankCompetitors({ candidates: [], results: DEBY, siteKey: 'deby-electric.co.il' })
check('A1: deby-electric maps five, the two-search one first', deby.length === 5 && deby[0].domain === 'traklin.co.il' && deby[0].seenIn === 2, names(deby))
check('A2: then the top result of each search, then the second', names(deby) === 'traklin.co.il,nespresso.com,dyson.co.il,led4light.co.il,coffeeman.co.il', names(deby))
check('A3: every one is validated by a search and marked a search find', deby.every((c) => c.validated && c.source === 'search' && c.seenIn >= 1))

const GOTOP = [
  ['danielzrihen.co.il', 'fantastic.co.il', 'ozlevy.com', 'adactive.co.il', 'ekd.co.il', 'siteit.co.il', 'catom.co.il', 'move-up.co.il', 'seolinks.co.il', 'youtube.com'],
  ['business.google.com', 'danielzrihen.co.il', 'youtube.com', 'support.google.com', 'digitalvibe.co.il', 'w3c.org.il', 'biz.midrag.co.il', 'drshivuk.co.il', 'extra.co.il', 'adsagency.co.il'],
  ['campus.gov.il', 'johnbryce.co.il', 'habetzefer.co.il', 'study.co.il', 'stra.co.il', 'fingrow.co.il', 'jolt.co.il', 'leos.co.il', 'lastartup.co.il', 'hackeru.co.il'],
]
const gotop = rankCompetitors({ candidates: ['webiz.co.il'], results: GOTOP, siteKey: 'gotop.co.il' })
check('A4: gotop maps five', gotop.length === 5 && gotop[0].domain === 'danielzrihen.co.il', names(gotop))

// B) exclusions
check('B1: google surfaces, youtube and a .gov.il campus are never picked', !gotop.some((c) => /google|youtube|gov\.il/.test(c.domain)), names(gotop))
check('B2: the site itself is never picked', !deby.some((c) => c.domain === 'deby-electric.co.il'))
check('B3: gov / academic / military are non-competitors', ['campus.gov.il', 'gov.il', 'tau.ac.il', 'mit.edu', 'army.mil', 'data.gov.uk'].every(isNonCompetitor))
check('B4: ordinary .co.il / .org.il / .com stores are not', !['coffeeman.co.il', 'w3c.org.il', 'govstore.com', 'education.co.il', 'shop.co.il'].some(isNonCompetitor))

// C) caps and validation
check('C1: never more than five shown', MAX_COMPETITORS === 5 && rankCompetitors({ candidates: [], results: GOTOP, siteKey: 'x.co.il' }).length === 5)
check('C2: a model suggestion no search showed is dropped', !gotop.some((c) => c.domain === 'webiz.co.il'))
check('C3: a model suggestion a search showed comes first', rankCompetitors({ candidates: ['ekd.co.il'], results: GOTOP, siteKey: 'gotop.co.il' })[0]?.domain === 'ekd.co.il')
check('C4: searches that show nobody leave an empty list', rankCompetitors({ candidates: [], results: [[], []], siteKey: 'a.co.il' }).length === 0)
check('C5: a domain is never listed twice', new Set(deby.map((c) => c.domain)).size === deby.length)
const twelve = rankCompetitors({ candidates: [], results: DEBY, siteKey: 'deby-electric.co.il', limit: MAX_COMPETITOR_CANDIDATES })
check('C6: the candidate list starts with exactly the five shown', MAX_COMPETITOR_CANDIDATES > MAX_COMPETITORS && names(twelve.slice(0, 5)) === names(deby) && twelve.length === MAX_COMPETITOR_CANDIDATES, names(twelve))

// D) a removed competitor leaves its place to the next one, within five active
;(async () => {
  const scope = { projectId: 'p1', userId: 'u1' }
  const db = new FakeAdmin({ ai_visibility_competitors: [
    { id: 'r1', user_id: 'u1', project_id: 'p1', name: 'traklin.co.il', domain: 'traklin.co.il', is_active: false },
    { id: 'o1', user_id: 'u2', project_id: 'p9', name: 'x.co.il', domain: 'x.co.il', is_active: true },
  ] })
  const rep = await addValidatedCompetitors(db as never, scope as never, twelve.map((c) => c.domain), new Date('2026-10-01T00:00:00Z'))
  const active = db.tables.ai_visibility_competitors.filter((r) => r.project_id === 'p1' && r.is_active)
  check('D1: five active after the scan although the owner removed the first', rep !== 'error' && active.length === 5 && rep.alreadyListed.includes('traklin.co.il') && !active.some((r) => r.domain === 'traklin.co.il'), rep)
  check('D2: the sixth candidate took the removed one\'s place', active.some((r) => r.domain === twelve[5].domain), active.map((r) => r.domain))
  check('D3: another owner\'s rows are untouched and do not count', db.tables.ai_visibility_competitors.filter((r) => r.project_id === 'p9').length === 1)

  // E) source: a4 passes the long list, shows five, no extra search
  const root = join(__dirname, '..', '..', '..')
  const src = readFileSync(join(root, 'lib/seed-scan/steps.ts'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
  const a4 = src.slice(src.indexOf('async function a4Search('), src.indexOf('async function a4Search(') + 2500)
  check('E1: a4 ranks to MAX_COMPETITOR_CANDIDATES, shows MAX_COMPETITORS, adds the ranked list',
    /limit:\s*MAX_COMPETITOR_CANDIDATES/.test(a4) && /ranked\.slice\(0,\s*MAX_COMPETITORS\)/.test(a4) && /addCompetitors\([^)]*ranked\.map\(/.test(a4))
  check('E2: still one search per seed keyword (no extra paid call)', /queries\.map\(\(q\) => searchOnce\(/.test(a4) && (a4.match(/searchOnce\(/g) || []).length === 1)

  console.log(`${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
})()
export {}
