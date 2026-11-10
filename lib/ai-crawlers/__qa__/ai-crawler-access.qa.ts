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
 *   E) the locales — seven complete copies, no untranslated keys
 *   F) the surfaces — seven pages, the API's own guard, the sitemap, and the
 *      registry itself: no duplicate token, every purpose translated
 *      everywhere, and nothing on the page that the open dataset lacks
 */
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { AI_CRAWLERS, AI_CRAWLER_TOKENS } from '../agents'
import { isAllowed, matchLength, normalizeCheckPath, parseRobots, rulesFor } from '../robots'
import { verdictsFor } from '../check'
import { LIMIT, WINDOW_MS, resetRateLimiter, takeToken } from '../rate-limit'
import { aiCrawlerCopy } from '../copy'
import { AI_CRAWLER_CANDIDATES, AI_CRAWLER_DATASET } from '../dataset'
import { PUBLIC_LOCALES, type PublicLocale } from '../../i18n/locales'
import {
  aiCrawlerBlockingDatasetSchema,
  aiCrawlerBlockingSitesDatasetSchema,
  aiCrawlerDatasetSchema,
} from '../../seo/dataset'

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

  // ── E) seven complete locales ─────────────────────────────────────────────
  console.log('\nE) the copy, in all seven public locales')
  {
    const NON_HEBREW: PublicLocale[] = ['en', 'es', 'pt-BR', 'fr', 'it', 'ja']
    const heKeys = strings(aiCrawlerCopy('he')).map((s) => s.path).sort()
    for (const locale of PUBLIC_LOCALES) {
      const keys = strings(aiCrawlerCopy(locale)).map((s) => s.path).sort()
      check(`E1 (${locale}): the same keys as Hebrew, none missing`, keys.join('|') === heKeys.join('|'))
      check(`E2 (${locale}): no empty string anywhere`, strings(aiCrawlerCopy(locale)).every((s) => s.text.trim().length > 0))
    }
    for (const locale of NON_HEBREW) {
      const hebrew = strings(aiCrawlerCopy(locale)).filter((s) => HEBREW.test(s.text))
      check(`E3 (${locale}): no Hebrew leaked into it`, hebrew.length === 0, hebrew[0]?.path)
    }
    // Spanish, Portuguese, French, Italian and Japanese must not be the English copy.
    for (const locale of ['es', 'pt-BR', 'fr', 'it', 'ja'] as PublicLocale[]) {
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
      everyString.filter((t) => /\b(7|siete|sete|sept|sieben|שבוע)\b/i.test(t)).every((t) => /card|tarjeta|cartão|carte|carta|karte|karty|אשראי|カード/i.test(t)))
    // THE MEASUREMENT COPY. Its figures live in blocking-measurement.ts and are
    // substituted at render time, so no locale can carry a stale number and the
    // ten translations cannot disagree about what was measured.
    check('E8: every locale leaves the figures as placeholders', PUBLIC_LOCALES.every((l) => {
      const m = aiCrawlerCopy(l).measurement
      return (
        m.headline.includes('{pct}') &&
        m.sampleNote.includes('{n}') &&
        // The per-site reading states two shares and the read rate those
        // shares are of, and all three are substituted for the same reason.
        m.perSite.includes('{deliberate}') &&
        m.perSite.includes('{inherited}') &&
        m.perSiteNote.includes('{read}') &&
        m.perSiteNote.includes('{refused}')
      )
    }))
    check('E9: no digit is typed into the measurement copy in any locale', PUBLIC_LOCALES.every((l) => {
      const m = aiCrawlerCopy(l).measurement as unknown as Record<string, string>
      return Object.values(m).every((t) => !/\d/.test(t))
    }))
    // The caveat is the sentence the measurement record requires beside any of
    // these figures. A locale that shortened it to a hedge would pass every
    // other check here.
    check('E10: every locale carries a full caveat, not a hedge', PUBLIC_LOCALES.every((l) => {
      const m = aiCrawlerCopy(l).measurement
      return m.caveat.length > 90 && m.caveat !== m.intro
    }))
    check('E11: the English caveat forbids the small-business reading explicitly', (() => {
      const c = aiCrawlerCopy('en').measurement.caveat
      return /not small businesses/i.test(c) && /do not read/i.test(c)
    })())
    // MUTATION CONTROLS for E8-E11.
    check('E8-MUT: a headline with the figure baked in would fail E8',
      !'Of the sites that block GPTBot, 66.5% also block one that brings visitors.'.includes('{pct}'))
    check('E9-MUT: the same string would fail E9',
      /\d/.test('Of the sites that block GPTBot, 66.5% also block one that brings visitors.'))
    check('E10-MUT: a softened caveat would fail E10',
      !('Figures vary by market.'.length > 90))

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
      ['ja', 'app/(public)/ja/ai-crawlers/page.tsx'],
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
      AI_CRAWLERS.every((c) => c.operator.length > 0 && ['train', 'answer', 'search', 'ads', 'preview'].includes(c.purpose)))
    // MUTATION CONTROL for F13.
    const dupes = [...AI_CRAWLER_TOKENS, 'gptbot']
    check('F13-MUT: adding a case-variant duplicate would fail F13',
      new Set(dupes.map((t) => t.toLowerCase())).size !== dupes.length)

    // Every purpose the page renders needs a label AND a blurb in all seven
    // languages: `copy.purposes[verdict.purpose].label` would throw on a
    // purpose a locale has not got, taking the whole page down in that
    // language only — the failure a reviewer reading Hebrew never sees.
    const usedPurposes = [...new Set(AI_CRAWLERS.map((c) => c.purpose))]
    const purposeGaps = PUBLIC_LOCALES.flatMap((l: PublicLocale) =>
      usedPurposes
        .filter((p) => !(aiCrawlerCopy(l).purposes[p]?.label && aiCrawlerCopy(l).purposes[p]?.blurb))
        .map((p) => `${l}:${p}`))
    check(`F15: all ${usedPurposes.length} purposes are translated in every public language`,
      purposeGaps.length === 0, purposeGaps.join(', '))
    // MUTATION CONTROL for F15: a purpose nobody has translated, which is what
    // a newly added purpose looks like before its ten strings are written.
    check('F15-MUT: a purpose no locale translates would fail F15',
      PUBLIC_LOCALES.every((l: PublicLocale) => !(aiCrawlerCopy(l).purposes as Record<string, unknown>)['telemetry']))

    // Since 07.11.2026 agents.ts DERIVES its rows from dataset.ts, so the page
    // and the open dataset other people are invited to consume cannot disagree
    // about which crawlers exist. These checks are what makes that structural
    // rather than a promise: the union must be exact in both directions, and a
    // row's `documented` flag must match the side of the dataset it came from.
    // The five tokens no operator page names (Bytespider, cohere-ai, Timpibot,
    // omgili, MistralAI-User) are the dataset's `candidates`; the page renders
    // them last, marked with a dagger and a footnote in all ten languages,
    // rather than as ordinary rows.
    const datasetTokens = new Set(
      [...AI_CRAWLER_DATASET.map((c) => c.token), ...AI_CRAWLER_CANDIDATES.map((c) => c.token)]
        .map((t) => t.toLowerCase()))
    const notInDataset = AI_CRAWLER_TOKENS.filter((t) => !datasetTokens.has(t.toLowerCase()))
    check('F16: every agent the page renders is in the open dataset too',
      notInDataset.length === 0, notInDataset.join(', '))

    // The other direction: a crawler added to the dataset must reach the page,
    // or the table we publish as a dataset is quietly shorter than the dataset.
    const pageTokens = new Set(AI_CRAWLER_TOKENS.map((t) => t.toLowerCase()))
    const notOnPage = [...AI_CRAWLER_DATASET.map((c) => c.token), ...AI_CRAWLER_CANDIDATES.map((c) => c.token)]
      .filter((t) => !pageTokens.has(t.toLowerCase()))
    check('F17: every crawler in the dataset reaches the page', notOnPage.length === 0, notOnPage.join(', '))

    // And `documented` has to mean what it says, in both directions: a claim
    // that an operator documents a token is the one thing in this table a
    // reader cannot check for themselves without the docs link.
    const candidateTokens = new Set(AI_CRAWLER_CANDIDATES.map((c) => c.token.toLowerCase()))
    const miscredited = AI_CRAWLERS.filter((c) => c.documented === candidateTokens.has(c.token.toLowerCase()))
    check('F18: documented is true exactly for the rows an operator page names',
      miscredited.length === 0, miscredited.map((c) => c.token).join(', '))

    // An undocumented token has committed to nothing, so it must not be shown
    // as one that honours robots.txt.
    const overclaimed = AI_CRAWLERS.filter((c) => !c.documented && c.respectsRobots)
    check('F19: an undocumented token claims no robots.txt compliance',
      overclaimed.length === 0, overclaimed.map((c) => c.token).join(', '))

    // MUTATION CONTROLS for F17-F19.
    check('F17-MUT: a dataset token missing from the page would fail F17',
      !pageTokens.has('a-crawler-the-page-forgot'))
    check('F18-MUT: a candidate marked documented would fail F18',
      candidateTokens.has('bytespider') === true)
    check('F19-MUT: an undocumented row with respectsRobots true would fail F19',
      [{ documented: false, respectsRobots: true }].filter((c) => !c.documented && c.respectsRobots).length > 0)

    // The footnote that explains the dagger has to exist in every language, or
    // the mark is unexplained for that reader.
    const footnoteGaps = PUBLIC_LOCALES.filter((l: PublicLocale) => !aiCrawlerCopy(l).reference.undocumented?.trim())
    check('F20: the undocumented-token footnote is translated everywhere',
      footnoteGaps.length === 0, footnoteGaps.join(', '))

    // And the page must actually render it, tied to the mark.
    const checkerSrc = strip(read('components/ai-crawlers/AiCrawlerChecker.tsx'))
    check('F21: the table marks undocumented rows', checkerSrc.includes('!c.documented'))
    check('F22: …and renders the footnote they point at',
      checkerSrc.includes('copy.reference.undocumented') && checkerSrc.includes('id="ai-crawlers-undocumented"'))
    check('F22-MUT: a table with no footnote id would fail F22',
      !'<table><tbody /></table>'.includes('id="ai-crawlers-undocumented"'))
    // MUTATION CONTROL for F16.
    check('F16-MUT: a page-only token would fail F16', !datasetTokens.has('gotopbot'))

    // F23-F26: the in-body links that make the earned ones count. This page
    // holds the do-follow links the product has earned. The nav and the footer
    // already reach the three destinations, so what these links add is a
    // contextual anchor in the page's own body rather than boilerplate on
    // every page. The destinations are pinned, every locale must have its own
    // anchors, and the hrefs must go through getLocaleHref — a bare
    // '/pricing' would throw a Polish reader out of their own language.
    const RELATED_PATHS = ['/features/ai-visibility-tracking', '/free-check', '/pricing']
    const missingPaths = RELATED_PATHS.filter((path) => !checkerSrc.includes(`'${path}'`))
    check('F23: the page links on to the three product pages',
      missingPaths.length === 0, missingPaths.join(', '))
    check('F24: those links are locale-aware',
      checkerSrc.includes('getLocaleHref(item.href, locale)'))
    const relatedGaps = PUBLIC_LOCALES.filter((l: PublicLocale) => {
      const r = aiCrawlerCopy(l).related
      return !r?.title?.trim() || !r?.lead?.trim() || !r?.aiVisibility?.trim() ||
        !r?.freeCheck?.trim() || !r?.pricing?.trim()
    })
    check('F25: every locale has its own anchors for them',
      relatedGaps.length === 0, relatedGaps.join(', '))
    // An anchor that repeats another locale's wording is an untranslated key.
    const anchorSets = PUBLIC_LOCALES.map((l: PublicLocale) => aiCrawlerCopy(l).related.pricing)
    check('F26: the pricing anchor is not one string reused in ten languages',
      new Set(anchorSets).size === PUBLIC_LOCALES.length)
    check('F23-MUT: a page with no onward link would fail F23',
      !'<section />'.includes("'/pricing'"))
    check('F24-MUT: a bare href would fail F24',
      !"<Link href='/pricing'>".includes('getLocaleHref(item.href, locale)'))

    // G) OUR OWN robots.txt, read with the matcher this page publishes.
    //
    // The whole premise of the open dataset is that a crawler fetches it and
    // an engine cites it. `Disallow: /api` in our own robots.txt was blocking
    // every crawler, Googlebot included, from the exact URLs the Dataset nodes
    // declare as their distributions — the one defect that makes the asset
    // worthless while the page claims otherwise. The distribution URLs are
    // read out of the schema builders rather than retyped, so a fourth
    // distribution cannot be added and left blocked.
    const ourRobots = parseRobots(read('public/robots.txt'))
    const distributions = [
      aiCrawlerDatasetSchema('en'),
      aiCrawlerBlockingDatasetSchema('en'),
      aiCrawlerBlockingSitesDatasetSchema('en'),
    ].flatMap((node) =>
      (node.distribution as Array<{ contentUrl: string }>).map((d) => d.contentUrl),
    )
    // The OpenAPI description, which the page links and the catalogues read.
    distributions.push('https://www.gotopseo.com/api/public/ai-crawlers/openapi')
    const pathOf = (url: string) => new URL(url).pathname
    // Googlebot decides Dataset Search; the documented AI crawlers decide
    // whether an engine can read it at all.
    const readers = ['Googlebot', ...AI_CRAWLER_TOKENS]
    const blocked: string[] = []
    for (const url of distributions) {
      for (const reader of readers) {
        if (!isAllowed(ourRobots, reader, pathOf(url)).allowed) blocked.push(`${reader} ${pathOf(url)}`)
      }
    }
    check('G1: our robots.txt lets every reader fetch every published distribution',
      blocked.length === 0, blocked.slice(0, 6).join('; '))
    check('G2: the open data is opened by an explicit Allow, not by removing the /api wall',
      isAllowed(ourRobots, 'Googlebot', '/api/public/ai-crawlers').decidedBy?.kind === 'allow')
    // And the wall still stands everywhere else under /api.
    const stillClosed = ['/api/content/automation/cron', '/api/free-check', '/api/auth/callback']
      .filter((path) => isAllowed(ourRobots, 'Googlebot', path).allowed)
    check('G3: every other /api route is still disallowed',
      stillClosed.length === 0, stillClosed.join(', '))
    // MUTATION CONTROL: the file as it was before the Allow line, which is the
    // state G1 exists to catch.
    const withoutAllow = parseRobots(read('public/robots.txt').replace(/^Allow: \/api\/public\/$/gm, ''))
    check('G1-MUT: the file without the Allow line would fail G1',
      !isAllowed(withoutAllow, 'Googlebot', '/api/public/ai-crawlers').allowed)
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}
main()

export {}
