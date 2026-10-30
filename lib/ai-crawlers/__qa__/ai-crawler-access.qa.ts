/**
 * The AI crawler access checker — the contract that the answer it gives a
 * stranger is the answer a crawler would give itself.
 *
 * This page is a LINKABLE ASSET: its whole value is that someone else cites
 * it. A tool that is cited and wrong is worse than no tool, so the robots.txt
 * matcher is pinned here against the four RFC 9309 rules that are easy to get
 * wrong, each with the weakened implementation that gets it wrong as a
 * MUTATION CONTROL beside it.
 *
 * Six groups:
 *   A) the parser — groups, comments, stray fields
 *   B) the matcher — the four rules, each with its control
 *   C) the run — what a missing, unreadable or lying robots.txt produces
 *   D) the rate limiter — a window that actually closes
 *   E) the locales — six complete copies, no untranslated keys
 *   F) the surfaces — six pages, the API's own guard, the sitemap
 */
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { AI_CRAWLERS, AI_CRAWLER_TOKENS } from '../agents'
import { isAllowed, matchLength, normalizeCheckPath, parseRobots, rulesFor } from '../robots'
import { verdictsFor } from '../check'
import { LIMIT, WINDOW_MS, resetRateLimiter, takeToken } from '../rate-limit'
import { aiCrawlerCopy } from '../copy'
import { PUBLIC_LOCALES, type PublicLocale } from '../../i18n/locales'

let pass = 0,
  fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) {
    pass++
    console.log(`  ✓ ${name}`)
  } else {
    fail++
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

const ROOT = join(__dirname, '..', '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
/** Source guards match on code, so comments are stripped first (repo convention). */
const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const HEBREW = /\p{Script=Hebrew}/u

/** Every string reachable in a nested copy object, with its path. */
function strings(value: unknown, path = ''): Array<{ path: string; text: string }> {
  if (typeof value === 'string') return [{ path, text: value }]
  if (Array.isArray(value)) return value.flatMap((v, i) => strings(v, `${path}[${i}]`))
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([k, v]) => strings(v, path ? `${path}.${k}` : k))
  }
  return []
}

function main() {
  console.log('AI crawler access checker')

  // ── A) the parser ─────────────────────────────────────────────────────────
  console.log('\nA) parsing robots.txt')
  {
    const file = [
      '# a comment',
      'User-agent: GPTBot',
      'User-agent: ClaudeBot',
      'Disallow: /private/',
      '',
      'User-agent: *',
      'Disallow: /',
      'Allow: /blog/   # trailing comment',
      '',
      'Sitemap: https://example.com/sitemap.xml',
    ].join('\n')
    const parsed = parseRobots(file)

    check('A1: a run of User-agent lines opens ONE shared group', parsed.groups[0].agents.length === 2)
    check('A2: …and both names are kept as written', parsed.groups[0].agents.join(',') === 'GPTBot,ClaudeBot')
    check('A3: a User-agent after a rule starts a NEW group', parsed.groups.length === 2 && parsed.groups[1].agents[0] === '*')
    check('A4: a trailing comment is stripped from the value', parsed.groups[1].rules[1].pattern === '/blog/')
    check('A5: the line number is kept, 1-based', parsed.groups[0].rules[0].line === 4)
    check('A6: Sitemap is global, not a rule', parsed.sitemaps.length === 1 && parsed.groups[1].rules.length === 2)
    check('A7: a file with no User-agent line is reported empty', parseRobots('# nothing here\nSitemap: x').empty)
    check('A8: a rule before any User-agent belongs to nobody', parseRobots('Disallow: /\nUser-agent: *\nAllow: /x').groups[0].rules.length === 1)
    // MUTATION CONTROL: a parser that opens a new group per User-agent line —
    // the common shortcut — splits the shared group and loses ClaudeBot's rule.
    const weakGroups = (() => {
      const out: Array<{ agent: string; rules: number }> = []
      for (const raw of file.split('\n')) {
        const line = raw.split('#')[0].trim()
        if (/^user-agent:/i.test(line)) out.push({ agent: line.split(':')[1].trim(), rules: 0 })
        else if (/^(dis)?allow:/i.test(line) && out.length) out[out.length - 1].rules++
      }
      return out
    })()
    check('A-MUT: a group-per-line parser leaves GPTBot with zero rules', weakGroups[0].rules === 0)
    check('A-MUT: …while the real parser gives it one', rulesFor(parsed, 'GPTBot').rules.length === 1)
  }

  // ── B) the matcher: the four rules ────────────────────────────────────────
  console.log('\nB) the four RFC 9309 rules')
  {
    // RULE 1 — group selection is EXACT, not a prefix.
    const r1 = parseRobots('User-agent: Google-Extended\nDisallow: /')
    check('B1: an exact token match selects the group', !isAllowed(r1, 'Google-Extended', '/').allowed)
    check('B1b: …and a DIFFERENT token sharing a prefix is untouched', isAllowed(r1, 'Googlebot', '/').allowed)
    check('B1c: matching is case-insensitive', !isAllowed(r1, 'google-extended', '/').allowed)
    // MUTATION CONTROL: a prefix matcher reports Googlebot as blocked.
    const weakPrefix = (token: string) => r1.groups.some((g) => g.agents.some((a) => token.toLowerCase().startsWith(a.toLowerCase().slice(0, 6))))
    check('B1-MUT: a prefix matcher wrongly claims Googlebot is in that group', weakPrefix('Googlebot'))
    check('B1-MUT: the real matcher does not', rulesFor(r1, 'Googlebot').source === 'none')

    // RULE 2 — `*` is a FALLBACK, never merged into a named group.
    const r2 = parseRobots('User-agent: *\nDisallow: /\n\nUser-agent: GPTBot\nDisallow: /tmp/')
    check('B2: a named group wins outright', rulesFor(r2, 'GPTBot').source === 'agent')
    check('B2b: …so GPTBot is ALLOWED at / although * disallows it', isAllowed(r2, 'GPTBot', '/').allowed)
    check('B2c: …and a crawler with no group of its own falls back to *', !isAllowed(r2, 'CCBot', '/').allowed)
    // MUTATION CONTROL: merging both groups blocks GPTBot at /.
    const merged = { ...r2, groups: [{ agents: ['GPTBot'], rules: r2.groups.flatMap((g) => g.rules) }] }
    check('B2-MUT: merging * into the named group blocks GPTBot at /', !isAllowed(merged, 'GPTBot', '/').allowed)

    // RULE 3 — longest match wins, Allow breaks a tie.
    const r3 = parseRobots('User-agent: *\nDisallow: /blog/\nAllow: /blog/public/')
    check('B3: the longer Allow beats the shorter Disallow', isAllowed(r3, 'CCBot', '/blog/public/x').allowed)
    check('B3b: …and the Disallow still holds elsewhere under it', !isAllowed(r3, 'CCBot', '/blog/private/x').allowed)
    const tie = parseRobots('User-agent: *\nDisallow: /x\nAllow: /x')
    check('B3c: an exact tie resolves to Allow', isAllowed(tie, 'CCBot', '/x/y').allowed)
    // MUTATION CONTROL: first-rule-wins reports /blog/public/x as blocked.
    const firstWins = (path: string) => {
      for (const rule of r3.groups[0].rules) if (matchLength(rule.pattern, path) !== null) return rule.kind === 'allow'
      return true
    }
    check('B3-MUT: a first-rule-wins matcher blocks /blog/public/x', !firstWins('/blog/public/x'))

    // RULE 4 — an empty `Disallow:` allows everything.
    const r4 = parseRobots('User-agent: GPTBot\nDisallow:')
    check('B4: an empty Disallow is no restriction at all', isAllowed(r4, 'GPTBot', '/anything').allowed)
    check('B4b: …and the group is still the crawler’s own', rulesFor(r4, 'GPTBot').source === 'agent')
    // MUTATION CONTROL: treating '' as a zero-length prefix blocks everything.
    check('B4-MUT: reading "" as a prefix would match every path', ''.length === 0 && '/anything'.startsWith(''))

    // Wildcards and the end anchor.
    check('B5: * inside a pattern spans anything', matchLength('/*.pdf', '/docs/a.pdf') !== null)
    check('B5b: $ anchors to the end', matchLength('/a$', '/a') !== null && matchLength('/a$', '/ab') === null)
    check('B5c: a pattern is a PREFIX, never a substring', matchLength('/blog', '/my/blog') === null)
    check('B6: no rule at all means allowed', isAllowed(parseRobots(''), 'GPTBot', '/').allowed)

    // The path field.
    check('B7: an empty path is the home page', normalizeCheckPath('') === '/' && normalizeCheckPath(undefined) === '/')
    check('B7b: a bare word becomes a path', normalizeCheckPath('blog') === '/blog')
    check('B7c: a pasted URL keeps only its path', normalizeCheckPath('https://example.com/blog/x?a=1') === '/blog/x?a=1')
    check('B7d: a fragment is dropped', normalizeCheckPath('/a#b') === '/a')
  }

  // ── C) one run ────────────────────────────────────────────────────────────
  console.log('\nC) a whole run')
  {
    const verdicts = verdictsFor('User-agent: GPTBot\nDisallow: /\n', '/')
    const gpt = verdicts.find((v) => v.token === 'GPTBot')!
    check('C1: every registered agent gets a verdict', verdicts.length === AI_CRAWLERS.length)
    check('C2: the blocked one is blocked', gpt.allowed === false)
    check('C3: …and it names the line that decided', gpt.rule?.pattern === '/' && gpt.rule?.line === 2)
    check('C4: everyone else is allowed', verdicts.filter((v) => !v.allowed).length === 1)
    check('C5: an empty robots.txt allows everyone', verdictsFor('', '/').every((v) => v.allowed))
    check('C6: the classic search crawlers are flagged as such', verdicts.filter((v) => v.classicSearch).length === 3)
    check('C7: an agent that ignores robots.txt is marked', verdicts.some((v) => !v.respectsRobots))

    // The per-path promise: the SAME file answers differently for two paths.
    const blog = verdictsFor('User-agent: *\nDisallow: /blog/\n', '/blog/post')
    const home = verdictsFor('User-agent: *\nDisallow: /blog/\n', '/')
    check('C8: a path-scoped Disallow blocks that path', blog.every((v) => !v.allowed))
    check('C9: …and leaves the home page open', home.every((v) => v.allowed))
  }

  // ── D) the rate limiter ───────────────────────────────────────────────────
  console.log('\nD) the rate limit')
  {
    resetRateLimiter()
    const t0 = 1_000_000
    let lastAllowed = true
    for (let i = 0; i < LIMIT; i++) lastAllowed = takeToken('k', t0).allowed
    check('D1: the whole allowance is granted', lastAllowed)
    check('D2: one more is refused', !takeToken('k', t0).allowed)
    check('D3: a different client is unaffected', takeToken('other', t0).allowed)
    check('D4: the window closes', takeToken('k', t0 + WINDOW_MS + 1).allowed)
    // MUTATION CONTROL: a limiter that forgets to compare `resetAt` against
    // `now` — a plain counter per key — never lets the window close, so the
    // client stays locked out forever. Run side by side with the real one.
    const weak = new Map<string, number>()
    const weakTake = (key: string) => {
      const n = (weak.get(key) ?? 0) + 1
      weak.set(key, n)
      return n <= LIMIT
    }
    for (let i = 0; i < LIMIT + 1; i++) weakTake('w')
    check('D-MUT: a counter with no expiry is still refusing after the window', !weakTake('w'))
    check('D-MUT: …while the real limiter has let it through (D4)', takeToken('w', t0 + WINDOW_MS * 2).allowed)
    resetRateLimiter()
  }

  // ── E) six complete locales ───────────────────────────────────────────────
  console.log('\nE) the copy, in all six public locales')
  {
    const LATIN: PublicLocale[] = ['en', 'es', 'pt-BR', 'fr', 'it']
    const heKeys = strings(aiCrawlerCopy('he')).map((s) => s.path).sort()
    for (const locale of PUBLIC_LOCALES) {
      const keys = strings(aiCrawlerCopy(locale)).map((s) => s.path).sort()
      check(`E1 (${locale}): the same keys as Hebrew, none missing`, keys.join('|') === heKeys.join('|'))
      check(`E2 (${locale}): no empty string anywhere`, strings(aiCrawlerCopy(locale)).every((s) => s.text.trim().length > 0))
    }
    for (const locale of LATIN) {
      const hebrew = strings(aiCrawlerCopy(locale)).filter((s) => HEBREW.test(s.text))
      check(`E3 (${locale}): no Hebrew leaked into it`, hebrew.length === 0, hebrew[0]?.path)
    }
    // Spanish, Portuguese, French and Italian must not be the English copy.
    for (const locale of ['es', 'pt-BR', 'fr', 'it'] as PublicLocale[]) {
      const same = strings(aiCrawlerCopy(locale)).filter((s, i) => s.text === strings(aiCrawlerCopy('en'))[i]?.text)
      // Product names and the User-agent column legitimately match, so the bar
      // is that the PROSE differs, not that every string does.
      check(`E4 (${locale}): it is a translation, not the English copy`, same.length < 6, `${same.length} identical strings`)
    }
    check('E5: every error code the API can send has a sentence', (() => {
      const codes = ['invalid_url', 'blocked_url', 'unreachable', 'rate_limited', 'internal']
      return PUBLIC_LOCALES.every((l) => codes.every((c) => (aiCrawlerCopy(l).form.errors as Record<string, string>)[c]?.length > 0))
    })())
    // TRUTH LIMITS (channels-charter.md): no invented numbers, no promises.
    const everyString = PUBLIC_LOCALES.flatMap((l) => strings(aiCrawlerCopy(l)).map((s) => s.text))
    check('E6: no percentage is claimed anywhere', !everyString.some((t) => /\d\s?%/.test(t)))
    check('E7: the trial is stated as 7 days with no card, or not at all',
      everyString.filter((t) => /\b(7|siete|sete|sept|sieben|שבוע)\b/i.test(t)).every((t) => /card|tarjeta|cartão|carte|carta|אשראי/i.test(t)))
    // MUTATION CONTROL for E1: a key check that compares only the COUNT of
    // strings — the shortcut — passes while a locale has the wrong keys, so
    // E1's full path comparison is doing real work. Build a French copy with
    // one key renamed and show the two checks disagree.
    const broken = JSON.parse(JSON.stringify(aiCrawlerCopy('fr'))) as Record<string, unknown>
    const groups = broken.groups as Record<string, string>
    groups.aiCrawlers = groups.ai
    delete groups.ai
    const brokenKeys = strings(broken).map((s) => s.path).sort()
    check('E-MUT: a count-only key check passes a renamed key', brokenKeys.length === heKeys.length)
    check('E-MUT: …while E1’s path comparison catches it', brokenKeys.join('|') !== heKeys.join('|'))
  }

  // ── F) the surfaces ───────────────────────────────────────────────────────
  console.log('\nF) the pages, the route and the sitemap')
  {
    const PAGES: Array<[PublicLocale, string]> = [
      ['he', 'app/(public)/ai-crawlers/page.tsx'],
      ['en', 'app/(public)/en/ai-crawlers/page.tsx'],
      ['es', 'app/(public)/es/ai-crawlers/page.tsx'],
      ['pt-BR', 'app/(public)/pt-BR/ai-crawlers/page.tsx'],
      ['fr', 'app/(public)/fr/ai-crawlers/page.tsx'],
      ['it', 'app/(public)/it/ai-crawlers/page.tsx'],
    ]
    for (const [locale, rel] of PAGES) {
      check(`F1 (${locale}): the page exists`, existsSync(join(ROOT, rel)))
      if (!existsSync(join(ROOT, rel))) continue
      const src = strip(read(rel))
      // THE LANGUAGE MUST NOT SWITCH BETWEEN PAGES: nav, body and footer all
      // take the page's own locale, so a visitor on /fr stays in French.
      check(`F2 (${locale}): nav, checker and footer all take this locale`,
        src.includes(`<PublicNav locale="${locale}" />`) &&
        src.includes(`locale="${locale}"`) &&
        src.includes(`<Footer locale="${locale}" />`))
      check(`F3 (${locale}): it declares its own canonical`, src.includes(`canonical: 'https://www.gotopseo.com${locale === 'he' ? '' : `/${locale}`}/ai-crawlers'`))
      check(`F4 (${locale}): and the shared hreflang set`, src.includes("buildHreflangAlternates('/ai-crawlers', '/en/ai-crawlers', '/es/ai-crawlers')"))
    }

    const route = strip(read('app/api/ai-crawlers/route.ts'))
    // proxy.ts excludes /api/*, so this route authenticates NOTHING and must
    // carry its own admission, its own limit and coarse errors instead.
    check('F5: the route admits the URL through the SSRF guard', route.includes('normalizeCheckUrl('))
    check('F6: …takes a rate-limit token before fetching', route.indexOf('takeToken(') < route.indexOf('runAiCrawlerCheck('))
    check('F7: …refuses restricted jurisdictions', route.includes('restrictionForRequest('))
    check('F8: …never caches a per-caller answer', route.includes("'cache-control': 'no-store'"))
    check('F9: …and never returns provider text, only codes',
      !/code:\s*(err|String\(err|e\.message)/.test(route) && route.includes('function fail(code: AiCrawlerErrorCode'))
    check('F10: the fetch goes through the shared capped fetcher',
      strip(read('lib/ai-crawlers/check.ts')).includes("from '@/lib/free-check/site-fetch'"))

    const sitemap = strip(read('app/sitemap.xml/route.ts'))
    check('F11: Hebrew and English are in the sitemap',
      sitemap.includes('${baseUrl}/ai-crawlers') && sitemap.includes('${baseUrl}/en/ai-crawlers'))
    check('F12: …and the translated mirror lists it once for every language',
      sitemap.includes("{ path: '/ai-crawlers'"))

    // The registry itself: a duplicate token would render two identical rows
    // and double-count the summary.
    check('F13: no duplicate user-agent token', new Set(AI_CRAWLER_TOKENS.map((t) => t.toLowerCase())).size === AI_CRAWLER_TOKENS.length)
    check('F14: every agent names an operator and a purpose',
      AI_CRAWLERS.every((c) => c.operator.length > 0 && ['train', 'answer', 'search'].includes(c.purpose)))
    // MUTATION CONTROL for F13.
    const dupes = [...AI_CRAWLER_TOKENS, 'gptbot']
    check('F13-MUT: adding a case-variant duplicate would fail F13',
      new Set(dupes.map((t) => t.toLowerCase())).size !== dupes.length)
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}
main()

export {}
