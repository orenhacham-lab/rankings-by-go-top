/**
 * The fix the results box offers, and the two ways it can be wrong in a way
 * that costs a reader real traffic.
 *
 *  1. IT MUST NEVER WRITE `Disallow: /`. The whole box exists to UNDO a block.
 *     One stray slash turns the advice into the accident it was fixing, and the
 *     reader would paste it in good faith.
 *  2. IT MUST NOT OFFER A PASTE WHEN THE BLOCK IS IN THE CRAWLER'S OWN GROUP.
 *     Groups naming the same agent merge (RFC 9309), so the existing
 *     `Disallow: /` would stay in force and nothing would change — the reader
 *     follows the instruction, sees no effect, and rightly stops trusting the
 *     page. That case is an edit, and the line number has to be named.
 *
 * It also pins what is deliberately NOT offered: classic search crawlers,
 * crawlers whose operator says they may ignore robots.txt, and `train`
 * crawlers, which somebody usually blocked on purpose.
 *
 * Run: npx tsx lib/ai-crawlers/__qa__/fix-plan.qa.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { verdictsFor } from '../check'
import { buildFixPlan } from '../fix-plan'
import { parseRobots, isAllowed } from '../robots'
import { aiCrawlerCopy } from '../copy'
import type { PublicLocale } from '../../i18n/locales'

let passed = 0
let failed = 0
function check(name: string, ok: boolean) {
  if (ok) passed++
  else {
    failed++
    console.log('FAIL', name)
  }
}

const ROOT = join(__dirname, '..', '..', '..')
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
const CHECKER = stripComments(
  readFileSync(join(ROOT, 'components/ai-crawlers/AiCrawlerChecker.tsx'), 'utf8'),
)

const LOCALES: PublicLocale[] = ['he', 'en', 'es', 'fr', 'it', 'ja', 'pt-BR', 'de', 'nl', 'pl', 'ko']

/* ------------------------------------------------------------------ *
 * 1. It is wired into the results, once.
 * ------------------------------------------------------------------ */
check('the results render the fix box', /<FixPlan\s/.test(CHECKER))
check('exactly once', (CHECKER.match(/<FixPlan\s/g) ?? []).length === 1)
check('and it is built from the real plan', /buildFixPlan\(/.test(CHECKER))

/* ------------------------------------------------------------------ *
 * 2. A catch-all block: two lines, and they are the right two.
 * ------------------------------------------------------------------ */
const CATCH_ALL = 'User-agent: *\nDisallow: /\n'
const catchAll = buildFixPlan(verdictsFor(CATCH_ALL, '/'))
check('a catch-all block produces lines to paste', catchAll.lines !== '')
check('it covers the answer crawler people lose', catchAll.paste.includes('OAI-SearchBot'))
check('nothing is an edit when the block came from the wildcard', catchAll.edit.length === 0)
check('the lines never say Disallow: /', !catchAll.lines.includes('Disallow: /'))
check(
  'every line is a User-agent or an empty Disallow',
  catchAll.lines
    .split('\n')
    .filter((l) => l.trim() !== '')
    .every((l) => /^User-agent: \S+$/.test(l) || l === 'Disallow:'),
)
check('no comment line and no link of ours', !/#|gotopseo/.test(catchAll.lines))
check('ASCII only', !/[^\x20-\x7e\n]/.test(catchAll.lines))

/* The point of the box, read back through our own matcher rather than by eye. */
const after = parseRobots(CATCH_ALL + '\n' + catchAll.lines)
check(
  'pasting the lines really does lift the catch-all',
  isAllowed(after, 'OAI-SearchBot', '/').allowed && isAllowed(after, 'OAI-SearchBot', '/blog/x').allowed,
)
check('and leaves it in force for a training crawler', !isAllowed(after, 'GPTBot', '/').allowed)

/* ------------------------------------------------------------------ *
 * 3. A block inside the crawler's own group is an EDIT, with a line number.
 * ------------------------------------------------------------------ */
const OWN_GROUP = 'User-agent: OAI-SearchBot\nDisallow: /\n'
const own = buildFixPlan(verdictsFor(OWN_GROUP, '/'))
check('its own group produces no paste', !own.paste.includes('OAI-SearchBot'))
check('it produces an edit instead', own.edit.some((e) => e.token === 'OAI-SearchBot'))
check(
  'and names the deciding line',
  own.edit.find((e) => e.token === 'OAI-SearchBot')?.line === 2,
)
/* Proof that the paste really would have been useless here. */
const merged = parseRobots(OWN_GROUP + '\nUser-agent: OAI-SearchBot\nDisallow:\n')
check(
  'a second group would have merged and changed nothing',
  !isAllowed(merged, 'OAI-SearchBot', '/').allowed,
)

/* ------------------------------------------------------------------ *
 * 4. What is deliberately never offered.
 * ------------------------------------------------------------------ */
check('no classic search crawler is proposed', !catchAll.paste.some((t) => t === 'Googlebot' || t === 'Bingbot' || t === 'Applebot'))
check('no training crawler is proposed', !catchAll.paste.includes('GPTBot') && !catchAll.paste.includes('CCBot'))
check('no crawler that may ignore robots.txt is proposed', !catchAll.paste.includes('Perplexity-User'))
check('an open file needs no fix at all', (() => {
  const none = buildFixPlan(verdictsFor('', '/'))
  return none.lines === '' && none.edit.length === 0
})())
check('a training-only block needs no fix', (() => {
  const t = buildFixPlan(verdictsFor('User-agent: GPTBot\nDisallow: /\n', '/'))
  return t.lines === '' && t.edit.length === 0
})())

/* ------------------------------------------------------------------ *
 * 5. The copy, in all eleven locales.
 * ------------------------------------------------------------------ */
const KEYS = ['title', 'intro', 'pasteLead', 'editLead'] as const
const he = aiCrawlerCopy('he').fix
for (const locale of LOCALES) {
  const f = aiCrawlerCopy(locale).fix
  check(`${locale} has every fix string`, KEYS.every((k) => typeof f[k] === 'string' && f[k].trim() !== ''))
  check(`${locale} keeps both placeholders in editLead`, f.editLead.includes('{token}') && f.editLead.includes('{line}'))
  check(`${locale} explains why a paste would not work there`, f.editLead.length > 60)
  if (locale !== 'he') check(`${locale} is not falling back to Hebrew`, f.title !== he.title)
}

console.log(`${passed} passed, ${failed} failed`)
if (failed > 0) process.exitCode = 1
export {}
