/**
 * THE CONTENT STRATEGY'S "WHY", PILLARS, PLAN AND LIST — the pure model and the screen's wiring.
 *
 *  I) what people look for: the same cue words as the recommendation engine's own
 *     classifier (coverage.ts searchNeedOf), kept in step by source;
 *  A) audiences: a keyword belongs to an audience only by a word no other audience uses;
 *  F) a topic's facts are the research's, or nothing: no volume invented, no card given
 *     a facts line that only guesses;
 *  P) the plan's searches count each keyword (and its close variants) once;
 *  C) pillars: grouped by the words the topics share, named as they write them, and
 *     shown only when the plan really has groups (never the niche itself as a pillar);
 *  H) what happens from here: one "now", done only behind it;
 *  S) the screen: every card shows its facts on the board, the list and the next
 *     article; the list view is the board's cards with the same actions, and the old
 *     screens fold under "advanced", unfolded by a link to one of their sections;
 *     the facts are read with one GET of the cached research; tokens only; no
 *     third-party icon service; smooth scrolling only without reduced motion.
 *
 * Every check has a mutation control.
 *
 * Run: npx tsx lib/content/strategy/__qa__/strategy-insights.qa.ts
 */
import { readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  audienceIndex, cardInsights, clustersWorthShowing, insightContext, keywordsByAudience, matchAudience, planIntentMix, planSearches,
  searchIntent, topicClusters, topicInsight, variantKey, type ClusterItem,
} from '../insights'
import { nextSteps } from '../../../../components/content-strategy/WhatHappensNext'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const show = (v: unknown) => JSON.stringify(v)
const ROOT = join(__dirname, '..', '..', '..', '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')

// ── I) intent ───────────────────────────────────────────────────────────────
console.log('\nI) what people are looking for')
{
  const regexes = (src: string) => Object.fromEntries(['COST_RE', 'HOWTO_RE', 'COMPARE_RE', 'SELECT_RE', 'LOCAL_RE']
    .map((n) => [n, (new RegExp(`const ${n} = (/.*/[a-z]*)`).exec(src) ?? [])[1] ?? null]))
  const order = (src: string) => (/function (?:searchNeedOf|searchIntent)\([^)]*\)[^{]*\{([\s\S]*?)\n\}/.exec(src)?.[1] ?? '').replace(/\s+/g, ' ')
    .replace(/SearchNeed|SearchIntent/g, '').match(/if \((\w+)\.test/g)?.join() ?? ''
  const engine = strip(read('lib/content/recommendations/coverage.ts'))
  const ours = strip(read('lib/content/strategy/insights.ts'))
  const same = (a: string, b: string) => show(regexes(a)) === show(regexes(b)) && Object.values(regexes(a)).every(Boolean) && order(a) === order(b) && order(a).length > 0
  check('I1: the same five cue lists, in the same order, as the engine\'s classifier', same(engine, ours), show([regexes(ours), order(ours)]))
  check('I1-MUT: a copy that drifts (one cue dropped) fails I1', !same(engine, ours.replace('|מחיר|', '|')))
  const cases: [string, string][] = [['כמה עולה נעלי ריצה', 'cost'], ['נעלי ריצה לעומת נעלי שטח', 'compare'], ['חנות נעלי ריצה', 'local'],
    ['איך לבחור נעלי ריצה', 'selection'], ['איך לנקות נעלי ריצה', 'howto'], ['נעלי ריצה', 'info'], ['running shoes price', 'cost']]
  const wrong = cases.filter(([k, want]) => searchIntent(k) !== want)
  check('I2: a price is cost, "vs" compare, a shop local, choosing selection (before how-to), how-to howto, the rest info', wrong.length === 0, show(wrong))
}

// ── A) audiences ────────────────────────────────────────────────────────────
console.log('\nA) who searches: an audience by a word only it uses')
{
  const idx = audienceIndex(['נשים שרצות למרחקים', 'רצי שטח מתחילים'])
  check('A1: "לנשים" is the women\'s audience (a Hebrew prefix letter does not hide the word)', matchAudience('נעלי ריצה לנשים', idx) === 0)
  check('A2: "שטח" is the trail runners\'', matchAudience('נעלי שטח', idx) === 1)
  check('A3: a keyword with no distinctive word belongs to no one', matchAudience('נעלי ריצה', idx) === null)
  const shared = audienceIndex(['נשים שאוהבות ריצה', 'גברים שאוהבים ריצה'])
  check('A4: a word every audience uses (the niche) names no audience', matchAudience('ריצה', shared) === null)
  const anyWord = (text: string, labels: string[]) => labels.findIndex((l) => l.split(' ').some((w) => text.includes(w)))
  check('A4-MUT: matching on any shared word gives the niche to the first audience', anyWord('ריצה', ['נשים שאוהבות ריצה', 'גברים שאוהבים ריצה']) === 0)
  const by = keywordsByAudience(['נשים שרצות למרחקים', 'רצי שטח מתחילים'], [
    { keyword: 'נעלי ריצה לנשים', avgMonthlySearches: 900 }, { keyword: 'בגדי ריצה נשים', avgMonthlySearches: 1200 },
    { keyword: 'נעלי שטח', avgMonthlySearches: 400 }, { keyword: 'נעלי ריצה', avgMonthlySearches: 9000 },
  ])
  check('A5: each keyword to at most one audience, most searched first; the niche keyword to none',
    show(by.map((a) => [a.keywords.map((k) => k.keyword), a.searches])) === show([[['בגדי ריצה נשים', 'נעלי ריצה לנשים'], 2100], [['נעלי שטח'], 400]]), show(by))
}

// ── F) facts ────────────────────────────────────────────────────────────────
console.log('\nF) a topic\'s facts are the research\'s, or nothing')
{
  const ctx = insightContext([
    { keyword: 'נעלי ריצה לנשים', avgMonthlySearches: 1900, competition: 'MEDIUM', competitors: ['rival.co.il', 'trail.co.il', 'kids.co.il', 'fourth.co.il'] },
    { keyword: 'נשים נעלי ריצה', avgMonthlySearches: 1600, competition: 'LOW' },
    { keyword: 'גרבי ריצה', avgMonthlySearches: null, competition: null },
  ], ['נשים שרצות למרחקים', 'רצי שטח מתחילים'])
  const known = topicInsight({ keyword: '  נעלי ריצה  לנשים ', title: 'מדריך נעלי ריצה לנשים' }, ctx)
  check('F1: its keyword\'s searches, competition and at most three competitors; its audience; its need',
    known.volume === 1900 && known.competition === 'MEDIUM' && show(known.rivals) === show(['rival.co.il', 'trail.co.il', 'kids.co.il'])
    && known.audience === 'נשים שרצות למרחקים' && known.intent === 'howto', show(known))
  const unknown = topicInsight({ keyword: 'תזונה לפני מרוץ', title: 'תזונה לפני מרוץ' }, ctx)
  check('F2: a keyword the research does not hold: no searches, no competition, no competitors', unknown.volume === null && unknown.competition === null && unknown.rivals.length === 0)
  const cards = [
    { key: 'k1', keyword: 'נעלי ריצה לנשים', title: 'A', origin: 'plan', column: 'ideas' },
    { key: 'k2', keyword: 'תזונה לפני מרוץ', title: 'B', origin: 'plan', column: 'ideas' },
    { key: 'k3', keyword: null, title: 'נשים נעלי ריצה', origin: 'ranking', column: 'ideas' },
    { key: 'k4', keyword: 'גרבי ריצה', title: 'C', origin: 'topic', column: 'planned' },
  ]
  const facts = cardInsights(cards, ctx)
  check('F3: only cards with a fact the research holds get a facts line (a ranking idea by its tracked keyword)',
    show([...facts.keys()]) === show(['k1', 'k3']) && facts.get('k3')?.volume === 1600, show([...facts.entries()]))
  const everyCard = new Map(cards.map((c) => [c.key, topicInsight({ keyword: c.keyword, title: c.title }, ctx)]))
  check('F3-MUT: facts for every card would show a lone guessed need on a card the research knows nothing about', everyCard.has('k2') && everyCard.get('k2')!.volume === null)
  check('F4: nothing is read yet: no facts at all', cardInsights(cards, null).size === 0 && planSearches(cards, null) === null)

  // ── P) the plan's searches ──
  console.log('\nP) the plan\'s searches: each keyword once')
  check('P1: close variants are one demand: 1,900, not 3,500', planSearches(cards, ctx) === 1900 && variantKey('נעלי ריצה לנשים') === variantKey('נשים נעלי ריצה'))
  const plainSum = cards.reduce((n, c) => n + (ctx.research.get((c.keyword ?? c.title).trim())?.avgMonthlySearches ?? 0), 0)
  check('P1-MUT: adding every card\'s figure counts the same demand twice', plainSum === 3500)
  check('P2: a plan none of whose keywords the research knows has no figure (never 0 dressed as data)', planSearches([cards[1]], ctx) === null)
  check('P3: the plan\'s content mix, largest first', show(planIntentMix(cards)) === show([{ intent: 'info', count: 4 }]))
}

// ── C) pillars ──────────────────────────────────────────────────────────────
console.log('\nC) pillars, when the plan has them')
{
  const mk = (key: string, keyword: string, volume: number | null = null, column = 'ideas'): ClusterItem => ({ key, keyword, title: keyword, volume, column })
  const items = [
    mk('a', 'נעלי שטח לנשים', 900), mk('b', 'נעלי שטח עמידות למים', 400), mk('c', 'איך לבחור נעלי שטח', 300, 'published'),
    mk('d', 'גרבי ריצה', 500), mk('e', 'גרבי ריצה למרתון', 200), mk('f', 'תזונה לפני מרוץ', 100),
  ]
  const r = topicClusters(items)
  check('C1: topics grouped by the words they share, named as the topics write them, with their searches; the rest counted',
    show(r.clusters.map((c) => [c.name, c.items.map((i) => i.key), c.searches])) === show([['נעלי שטח', ['a', 'b', 'c'], 1600], ['גרבי ריצה', ['d', 'e'], 700]]) && r.loose === 1,
    show(r))
  check('C2: every topic is in at most one pillar', new Set(r.clusters.flatMap((c) => c.items.map((i) => i.key))).size === r.clusters.reduce((n, c) => n + c.items.length, 0))
  const niche = topicClusters(['א', 'ב', 'ג', 'ד', 'ה'].map((x, i) => mk(`n${i}`, `נעלי ריצה ${x}${x}${x}`)))
  check('C3: a phrase in nearly every topic is the niche, not a pillar', niche.clusters.length === 0 && !clustersWorthShowing(niche.clusters), show(niche))
  // A running shop's plan: 7 of 13 topics say "running shoes"; that is the niche. The real pillars are a brand, socks and watches.
  const shopItems = [
    mk('s1', 'נעלי ריצה לכביש'), mk('s2', 'נעלי ריצה לשטח'), mk('s3', 'נעלי ריצה לנשים'), mk('s4', 'נעלי ריצה למתחילים'), mk('s5', 'נעלי ריצה הוקה'),
    mk('s6', 'גרבי ריצה'), mk('s7', 'גרבי ריצה למרתון'), mk('s8', 'שעון ריצה'), mk('s9', 'שעון ריצה לנשים'), mk('s10', 'נעלי ריצה'),
    mk('s11', 'הוקה בונדי 8'), mk('s12', 'הוקה קליפטון'), mk('s13', 'נעלי ריצה זולות'),
  ]
  const shop = topicClusters(shopItems)
  check('C3b: the niche phrase in 7 of 13 topics is not a pillar, even after a group takes one of them; the plan\'s real groups are',
    show(shop.clusters.map((c) => c.name)) === show(['הוקה קליפטון', 'גרבי ריצה', 'שעון ריצה']), show(shop.clusters.map((c) => [c.name, c.items.length])))
  // MUT: the module itself, with the niche judged against what is left of the pool (the first version).
  const src = read('lib/content/strategy/insights.ts')
  const broken = src.replace('if (e.items.length < need || niche.has(phrase)) continue', 'if (e.items.length < need || e.items.length > limit) continue')
  const mutPath = join(ROOT, 'lib/content/strategy/__qa__/.mut-insights.qa-tmp.ts')
  let mutNames = 'anchor missing'
  if (broken !== src) {
    writeFileSync(mutPath, broken)
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mut = require(mutPath) as typeof import('../insights')
      mutNames = show(mut.topicClusters(shopItems).clusters.map((c) => c.name))
    } finally { unlinkSync(mutPath) }
  }
  check('C3b-MUT: judging the niche against the remaining topics re-admits "running shoes" as a pillar', mutNames.includes('נעלי ריצה'), mutNames)
  const pairs = topicClusters([mk('p', 'גרבי ריצה'), mk('q', 'גרבי ריצה למרתון'), mk('r', 'תזונה לפני מרוץ'), mk('s', 'מתיחות אחרי אימון ארוך')])
  check('C4: one pair is not enough to show pillars; two groups, or one of three, is', !clustersWorthShowing(pairs.clusters) && clustersWorthShowing(r.clusters), show(pairs))
  check('C4-MUT: showing any group at all would show a lone pair as the plan\'s pillars', pairs.clusters.length > 0)
}

// ── H) what happens next ────────────────────────────────────────────────────
console.log('\nH) what happens from here')
{
  const st = (c: Parameters<typeof nextSteps>[0]) => nextSteps(c).map((s) => s.state).join()
  check('H1: ideas waiting: approving is now, the rest after it', st({ ideas: 3, planned: 2, written: 0, published: 1 }) === 'now,later,later,later')
  check('H2: no idea waiting, topics planned: approving is done, writing is now', st({ ideas: 0, planned: 2, written: 0, published: 1 }) === 'done,now,later,later')
  check('H3: nothing waiting anywhere, articles live: every step with work behind it is done, measuring stays open', st({ ideas: 0, planned: 0, written: 0, published: 4 }) === 'done,done,done,later')
  check('H4: an empty plan: nothing done, nothing now', st({ ideas: 0, planned: 0, written: 0, published: 0 }) === 'later,later,later,later')
  const naive = (c: { ideas: number; planned: number; written: number; published: number }) => [c.ideas, c.planned, c.written].map((w) => (w > 0 ? 'now' : 'done')).join()
  check('H-MUT: marking every step with work "now" (and every other "done") would call publishing done while topics wait', naive({ ideas: 3, planned: 2, written: 0, published: 1 }) === 'now,now,done')
}

// ── S) the screen ───────────────────────────────────────────────────────────
console.log('\nS) the screen')
{
  const screen = strip(read('components/content-strategy/ContentStrategyScreen.tsx'))
  const wired = (s: string) => /const \{ ctx \} = useStrategyInsights\(projectId, strategy\.seed\.audiences\)/.test(s)
    && /cardInsights\(board\.cards, ctx\)/.test(s) && /<StrategyBoard [^>]*insights=\{insights\}/.test(s)
    && /<StrategyListView [^>]*act=\{act\} insights=\{insights\}/.test(s) && /insight=\{nextInsight\}/.test(s)
  check('S1: the facts reach the board, the list and the next article', wired(screen))
  check('S1-MUT: a board without the facts fails S1', !wired(screen.replace('act={act} insights={insights} />\n        ) : strategy', 'act={act} />\n        ) : strategy')))
  const list = screen.slice(screen.indexOf('function StrategyListView'), screen.indexOf('export default function'))
  const folds = (s: string) => /const open = choice \?\? linked/.test(s) && /const linked = isStrategyAnchor\(anchor\)/.test(s)
    && /useSyncExternalStore\(subscribeHash, readHash, noHash\)/.test(s) && /\{open && \(\s*<div id="strategy-advanced"/.test(s)
    && /aria-expanded=\{open\}/.test(s) && /<StrategyList cards=\{cards\} lang=\{lang\} dict=\{dict\} act=\{act\} insights=\{insights\} \/>/.test(s)
  check('S2: the list is the board\'s cards with the same actions; the old screens mount only unfolded, and a link to their section unfolds them', folds(list))
  check('S2-MUT: a fold that ignores the link (the queue link would land nowhere) fails S2', !folds(list.replace('choice ?? linked', 'choice ?? false')))
  check('S2-MUT2: old screens mounted while folded fail S2', !folds(list.replace('{open && (\n          <div id="strategy-advanced"', '{(\n          <div id="strategy-advanced"')))
  const rows = strip(read('components/content-strategy/StrategyList.tsx'))
  const sameActions = (s: string) => /<IdeaButtons card=\{card\} dict=\{dict\} act=\{act\} inline \/>/.test(s)
    && /href=\{`\/content\/articles\/\$\{encodeURIComponent\(card\.articleId\)\}`\}/.test(s) && /STRATEGY_COLUMNS\.map/.test(s)
  check('S3: a row acts as its card: approve and reject; an article opens; every stage listed', sameActions(rows))
  check('S3-MUT: a list without the idea actions fails S3', !sameActions(rows.replace('<IdeaButtons card={card} dict={dict} act={act} inline />', 'null')))
  const hook = strip(read('components/content-strategy/useStrategyInsights.ts'))
  const oneRead = (s: string) => (s.match(/fetch\(/g) ?? []).length === 1 && !/method:/.test(s)
    && /`\/api\/keyword-research\/scan\?projectId=\$\{encodeURIComponent\(projectId\)\}`/.test(s)
  check('S4: the facts cost one GET of the cached research (scan-route.qa.ts: cache only, no provider)', oneRead(hook))
  check('S4-MUT: a POST (a new research per view) fails S4', !oneRead(hook.replace("{ cache: 'no-store' }", "{ method: 'POST' }")))

  const files = ['PlanOverview', 'TopicClusters', 'WhatHappensNext', 'StrategyList', 'TopicFacts', 'StrategyBoard', 'ContentStrategyScreen', 'NextArticleCard']
    .map((n) => ({ n, src: strip(read(`components/content-strategy/${n}.tsx`)) }))
  const RAW = /\b(?:text|bg|border|ring|from|to|via)-(?:slate|gray|zinc|neutral|stone|blue|sky|indigo|amber|yellow|red|green|emerald)-\d{2,3}\b/
  const raw = (fs: { n: string; src: string }[]) => fs.filter((f) => RAW.test(f.src)).map((f) => f.n)
  check('S5: the tab\'s parts use the design tokens only (no raw palette colour)', raw(files).length === 0, show(raw(files)))
  check('S5-MUT: a raw slate colour fails S5', raw([{ n: 'x', src: files[0].src.replace('text-muted', 'text-slate-500') }]).length === 1)
  const THIRD = /google\.com\/s2\/favicons|gstatic\.com\/favicon|icons\.duckduckgo|icon\.horse|clearbit|favicon\.io|faviconkit/
  const kr = ['LandscapeRivals', 'LandscapeAudiences', 'ResearchLandscape', 'SectionNav'].map((n) => strip(read(`components/keyword-research/${n}.tsx`)))
  const all = [...files.map((f) => f.src), ...kr]
  check('S6: site icons are the one SiteAvatar (SiteIcon: from the sites themselves), never a third-party icon service',
    !all.some((s) => THIRD.test(s)) && /<SiteAvatar\b/.test(kr[0]) && /<SiteAvatar\b/.test(files.find((f) => f.n === 'TopicFacts')!.src)
    && /<SiteIcon\b/.test(strip(read('components/ui/SiteAvatar.tsx'))))
  check('S6-MUT: an icon from a favicon service fails S6', THIRD.test('https://www.google.com/s2/favicons?domain=x.com'))
  const nav = strip(read('components/keyword-research/SectionNav.tsx'))
  const calm = (s: string) => /prefers-reduced-motion: reduce/.test(s) && /\? 'auto' : 'smooth'/.test(s)
  check('S7: scrolling is smooth only without reduced motion (the section nav and the list\'s links)', calm(nav) && calm(list))
  check('S7-MUT: an always-smooth scroll fails S7', !calm(list.replace("? 'auto' : 'smooth'", "? 'smooth' : 'smooth'")))
  const css = read('app/globals.css')
  const staggered = [...files.map((f) => f.src), ...kr].filter((s) => /animationDelay/.test(s))
  const stillWhenAsked = (srcs: string[]) => srcs.length >= 4 && srcs.every((s) => !/(?<!motion-safe:)animate-pop-in/.test(s) && /motion-safe:animate-pop-in/.test(s))
    && /@media \(prefers-reduced-motion: reduce\)[\s\S]*?animation-duration: 1ms/.test(css)
  check('S8: staggered entrances run only for those who allow motion (a delay would outlast the global reduced-motion rule)', stillWhenAsked(staggered), String(staggered.length))
  check('S8-MUT: a staggered card that always animates fails S8', !stillWhenAsked(staggered.map((s, i) => (i === 0 ? s.replace('motion-safe:animate-pop-in', 'animate-pop-in') : s))))
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)

export {}
