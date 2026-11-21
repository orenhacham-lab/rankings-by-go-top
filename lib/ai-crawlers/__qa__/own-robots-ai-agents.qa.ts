/**
 * OUR OWN robots.txt, READ BY OUR OWN MATCHER.
 *
 * Run: npx tsx lib/ai-crawlers/__qa__/own-robots-ai-agents.qa.ts
 *
 * We publish a checker for this exact file (/ai-crawlers) and a dataset of the
 * tokens it understands, so our own file is the one that has to be right. On
 * 21 Nov 2026 it named two AI tokens — GPTBot and CCBot — and neither of them
 * is the one that fetches a page to ANSWER somebody: that is OAI-SearchBot and
 * ChatGPT-User. Perplexity, Claude, Gemini grounding and Apple were not named
 * at all, and `Crawl-delay: 1` sat after the `Sitemap:` line, outside every
 * group, where RFC 9309 gives it no owner.
 *
 * The danger in the fix is the rule the module's own header calls out: naming a
 * crawler makes the `*` group stop governing it, so a group that forgets a
 * Disallow OPENS that path to the crawler it just named. Group C is here for
 * that, and it is the reason this suite checks /admin before it checks /.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { isAllowed, parseRobots } from '../robots'
import { AI_CRAWLERS } from '../agents'

let passed = 0
let failed = 0
function check(name: string, ok: boolean) {
  if (ok) passed++
  else { failed++; console.log('FAIL', name) }
}

const ROOT = join(__dirname, '..', '..', '..')
const text = readFileSync(join(ROOT, 'public/robots.txt'), 'utf8')
const parsed = parseRobots(text)

/** The documented AI crawlers, which is what the public checker reports on. */
const documented = AI_CRAWLERS.filter((c) => c.documented && !c.classicSearch)

/** Tokens deliberately not named in our file, each for a stated reason. */
const NOT_NAMED = new Set([
  // Advertising crawlers: nothing on this site is served to them, and naming a
  // token we have no opinion about is noise in a file people read.
  'OAI-AdsBot', 'Meta-ExternalAds',
  // Agentic fetchers acting for a signed-in user, and the training-only
  // tokens: the `*` group already allows them everything public.
  'Claude-Agent', 'Google-Agent', 'Google-GeminiNotebook', 'Google-CloudVertexBot',
  'Meta-WebIndexer', 'Meta-ExternalFetcher', 'FacebookExternalHit',
  'MistralAI-Training', 'Kagibot', 'AI2Bot', 'Diffbot', 'ImagesiftBot', 'Timpibot',
  // Training and customer-asked crawlers with no visitors of their own to give.
  'KimiBot', 'ElevenlabsCrawler', 'ElevenlabsBot', 'QualifiedBot',
  'ExaSearchBot-Images', 'ExaUser', 'amazon-QBusiness',
  'Diffbot-User', 'HaikuBot', 'Haiku-SearchBot',
  'omgili', 'cohere-ai', 'Bytespider',
])

// ── A: the tokens that answer a user's question are named ──────────────────

const named = new Set(parsed.groups.flatMap((g) => g.agents).map((a) => a.toLowerCase()))
const MUST_NAME = [
  'GPTBot', 'OAI-SearchBot', 'ChatGPT-User',
  'ClaudeBot', 'Claude-SearchBot', 'Claude-User',
  'Google-Extended', 'GoogleOther',
  'PerplexityBot', 'Perplexity-User',
  'Applebot', 'Applebot-Extended',
  'Meta-ExternalAgent', 'Amazonbot', 'Amzn-SearchBot', 'Amzn-User',
  'MistralAI-Index', 'MistralAI-User', 'DuckAssistBot', 'CCBot',
  'Kimi-SearchBot', 'Kimi-User', 'ExaSearchBot', 'LinerBot', 'Liner-User',
]
for (const token of MUST_NAME) {
  check(`A1 named: ${token}`, named.has(token.toLowerCase()))
}
check('A2 every documented AI token is either named or on the stated exceptions list',
  documented.every((c) => named.has(c.token.toLowerCase()) || NOT_NAMED.has(c.token)))
check('A3 the exceptions list holds no token that IS named',
  [...NOT_NAMED].every((t) => !named.has(t.toLowerCase())))

// ── B: and they may read the public site ───────────────────────────────────

for (const token of MUST_NAME) {
  for (const path of ['/', '/articles', '/articles/some-slug', '/ai-crawlers', '/api/public/ai-crawlers']) {
    check(`B1 ${token} may read ${path}`, isAllowed(parsed, token, path).allowed)
  }
}

// ── C: NAMING A CRAWLER MUST NOT OPEN WHAT THE WILDCARD CLOSES ─────────────

for (const token of [...MUST_NAME, '*', 'Googlebot', 'SomeUnknownBot']) {
  for (const path of ['/admin', '/admin/users', '/dashboard', '/dashboard/content', '/api/content/automation/cron']) {
    check(`C1 ${token} is kept out of ${path}`, !isAllowed(parsed, token, path).allowed)
  }
}

// ── D: the file's own housekeeping ─────────────────────────────────────────

/** The file's directives, with comments and blank lines out of the way. */
const directives = text.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#')).join('\n')
check('D1 Crawl-delay is inside a group, not stranded after Sitemap',
  /User-agent: \*[\s\S]{0,200}?Crawl-delay: 1/.test(directives)
  && !/Sitemap:[\s\S]*Crawl-delay/.test(directives))
check('D2 the sitemap is still advertised', parsed.sitemaps.some((s) => s.endsWith('/sitemap.xml')))
check('D3 the AI group repeats every rule the wildcard group has, so nothing is inherited',
  (() => {
    const wildcard = parsed.groups.find((g) => g.agents.includes('*'))
    const ai = parsed.groups.find((g) => g.agents.includes('OAI-SearchBot'))
    if (!wildcard || !ai) return false
    const shape = (g: typeof wildcard) => g.rules.map((r) => `${r.kind} ${r.pattern}`).sort().join('|')
    return shape(ai) === shape(wildcard)
  })())

// ── MUTATION CONTROLS ─────────────────────────────────────────────────────

const OLD = `User-agent: *
Allow: /
Disallow: /admin
Disallow: /dashboard
Disallow: /api
Allow: /api/public/

User-agent: GPTBot
Allow: /
Disallow: /admin
Disallow: /dashboard
Disallow: /api
Allow: /api/public/

Sitemap: https://www.gotopseo.com/sitemap.xml

Crawl-delay: 1
`
const old = parseRobots(OLD)
check('MUTATION CONTROL: the old file leaves OAI-SearchBot unnamed',
  !new Set(old.groups.flatMap((g) => g.agents).map((a) => a.toLowerCase())).has('oai-searchbot'))
check('MUTATION CONTROL: a group that forgets Disallow opens /admin to the token it names',
  isAllowed(parseRobots('User-agent: *\nDisallow: /admin\n\nUser-agent: GPTBot\nAllow: /\n'), 'GPTBot', '/admin').allowed)
check('MUTATION CONTROL: a stranded Crawl-delay is caught by the D1 pattern',
  /Sitemap:[\s\S]*Crawl-delay/.test(OLD.split('\n').filter((l) => l && !l.startsWith('#')).join('\n')))
check('MUTATION CONTROL: a token on both lists is caught by A3',
  !['GPTBot'].every((t) => !new Set(['gptbot']).has(t.toLowerCase())))

console.log(`${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
export {}
