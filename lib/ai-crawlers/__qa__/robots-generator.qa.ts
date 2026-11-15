/**
 * The robots.txt generator on /ai-crawlers: what it emits, and the two things
 * about it that would be harmful if they ever drifted.
 *
 *  1. IT NEVER OFFERS A CLASSIC SEARCH CRAWLER. A tick box that blocks
 *     Googlebot de-indexes the reader's site. The component filters
 *     `classicSearch` out; if that filter is deleted, the first group of checks
 *     below fails rather than the site shipping a de-indexing switch.
 *  2. THE OUTPUT IS MACHINE TEXT ONLY. One group per blocked token, `Disallow:
 *     /` under each, nothing localised and no comment lines, because a
 *     robots.txt with Hebrew or Japanese prose in it is noise to every reader
 *     it has, human or not.
 *
 * It also pins the copy contract: every public locale carries the whole `generator`
 * block, and `outputNote` — the sentence that warns a named group REPLACES the
 * catch-all group for that crawler (RFC 9309, rule 2 in ../robots.ts) — is
 * present in every one of them. A locale that loses that sentence hands its
 * readers a file that quietly opens the paths their `*` group was closing.
 *
 * Run: npx tsx lib/ai-crawlers/__qa__/robots-generator.qa.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { AI_CRAWLERS } from '../agents'
import { aiCrawlerCopy } from '../copy'
import { parseRobots, isAllowed } from '../robots'
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

const SRC = stripComments(
  readFileSync(join(ROOT, 'components/ai-crawlers/AiRobotsGenerator.tsx'), 'utf8'),
)

/** Every locale with an /ai-crawlers page. A new locale adds one entry here. */
const LOCALES: PublicLocale[] = ['he', 'en', 'es', 'fr', 'it', 'ja', 'pt-BR', 'de', 'nl', 'pl', 'ko']

/* ------------------------------------------------------------------ *
 * 1. The generator is wired into the page at all, and only once.
 * ------------------------------------------------------------------ */
const CHECKER = stripComments(
  readFileSync(join(ROOT, 'components/ai-crawlers/AiCrawlerChecker.tsx'), 'utf8'),
)
check('the checker renders the generator', /<AiRobotsGenerator\s/.test(CHECKER))
check('it renders it exactly once', (CHECKER.match(/<AiRobotsGenerator\s/g) ?? []).length === 1)

/* ------------------------------------------------------------------ *
 * 2. No classic search crawler can be reached by the controls.
 * ------------------------------------------------------------------ */
check(
  'the offered list filters out classicSearch',
  /AI_CRAWLERS\.filter\(\s*\(c\)\s*=>\s*!c\.classicSearch\s*\)/.test(SRC),
)
const classic = AI_CRAWLERS.filter((c) => c.classicSearch).map((c) => c.token)
check('the reference table still has classic crawlers to exclude', classic.length > 0)

/* The real behavioural check: ask the exported builder for them. */
async function behaviour() {
  const { buildRobotsBlock } = await import('../../../components/ai-crawlers/AiRobotsGenerator')

  for (const token of classic) {
    check(
      `asking for ${token} emits nothing`,
      buildRobotsBlock([token]) === '',
    )
  }

  const ai = AI_CRAWLERS.filter((c) => !c.classicSearch).map((c) => c.token)
  check('there are AI crawlers to offer', ai.length >= 5)

  /* ---------------------------------------------------------------- *
   * 3. Shape of the output.
   * ---------------------------------------------------------------- */
  check('nothing blocked emits nothing', buildRobotsBlock([]) === '')

  const one = buildRobotsBlock([ai[0]])
  check('one crawler emits one group', one === `User-agent: ${ai[0]}\nDisallow: /\n`)

  const two = buildRobotsBlock([ai[0], ai[1]])
  check(
    'two crawlers emit two groups, never a merged User-agent run',
    (two.match(/^User-agent: /gm) ?? []).length === 2,
  )
  check('the groups are separated by a blank line', two.includes('Disallow: /\n\nUser-agent: '))

  const all = buildRobotsBlock(ai)
  check('every token asked for appears', ai.every((t) => all.includes(`User-agent: ${t}\n`)))
  check('order follows the reference table', buildRobotsBlock([ai[1], ai[0]]) === two)
  check('an unknown token is ignored', buildRobotsBlock(['NotACrawler']) === '')
  check('a token is never emitted twice', (all.match(/^User-agent: /gm) ?? []).length === ai.length)
  check(
    'every User-agent line is followed by its own Disallow line',
    all
      .split('\n')
      .every((l, i, ls) => !l.startsWith('User-agent: ') || ls[i + 1] === 'Disallow: /'),
  )

  /* The output is machine text: no localised prose, no comments, nothing but
     the two directives this generator claims to write. */
  check('no comment lines', !/^#/m.test(all))
  check('ASCII only', !/[^\x20-\x7e\n]/.test(all))
  check(
    'only User-agent and Disallow lines',
    all
      .split('\n')
      .filter((l) => l.trim() !== '')
      .every((l) => /^User-agent: \S+$/.test(l) || l === 'Disallow: /'),
  )

  /* ---------------------------------------------------------------- *
   * 4. The emitted file means what the UI promised, read back by our own
   *    RFC 9309 matcher rather than by eye.
   * ---------------------------------------------------------------- */
  const blockedOne = ai[0]
  const allowedOne = ai[1]
  const parsed = parseRobots(buildRobotsBlock([blockedOne]))
  check(
    'the blocked crawler is blocked by the emitted file',
    !isAllowed(parsed, blockedOne, '/').allowed,
  )
  check(
    'a crawler that was left alone stays allowed',
    isAllowed(parsed, allowedOne, '/').allowed,
  )
  check(
    'the home page is covered, not only deep paths',
    !isAllowed(parsed, blockedOne, '/').allowed && !isAllowed(parsed, blockedOne, '/blog/x').allowed,
  )

  /* ---------------------------------------------------------------- *
   * 5. The copy contract, in all ten locales.
   * ---------------------------------------------------------------- */
  const KEYS = [
    'title',
    'intro',
    'allowAll',
    'blockAll',
    'outputTitle',
    'outputNote',
    'nothingBlocked',
    'copy',
    'copied',
  ] as const
  for (const locale of LOCALES) {
    const g = aiCrawlerCopy(locale).generator
    check(`${locale} has every generator string`, KEYS.every((k) => typeof g[k] === 'string' && g[k].trim() !== ''))
    check(`${locale} warns that a named group replaces the catch-all`, g.outputNote.length > 80)
    check(`${locale} names robots.txt in the output note`, /robots\.txt/.test(g.outputNote))
  }
  /* Hebrew is the fallback, so an untranslated locale would pass the checks
     above while reading Hebrew to a Dutch visitor. */
  const he = aiCrawlerCopy('he').generator
  for (const locale of LOCALES.filter((l) => l !== 'he')) {
    check(`${locale} is not falling back to Hebrew`, aiCrawlerCopy(locale).generator.title !== he.title)
  }

  console.log(`${passed} passed, ${failed} failed`)
  if (failed > 0) process.exitCode = 1
}

void behaviour()

export {}
