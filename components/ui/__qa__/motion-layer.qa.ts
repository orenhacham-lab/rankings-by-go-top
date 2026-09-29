/**
 * WAVE 7 — THE MOTION LAYER AND THE KEYWORDS TAB'S NEW PIECES.
 *
 * The owner: "where are the animations?" The motion now has to be seen, and it
 * must never lie about a figure, never replay, and never move for someone who
 * asked for less motion.
 *
 *  M1) AnimatedNumber keeps the real, formatted value in the page from the first
 *      render (server and client): the count is drawn OVER it, so a screen reader,
 *      a copy or a print never reads a partial figure;
 *  M2) the count is seen and reaches its value: it starts once the block around it
 *      has finished entering (capped; a count that ran while its card was fading in
 *      looked like no count at all), the effect that starts the count is not the
 *      effect that runs its frames (merged, the phase change cancelled the frame
 *      loop and the hero stuck at "0.0", "3.3"), the first frame is clamped at 0
 *      (a frame stamped a hair before the start drew "-0.6"), and it ends on the
 *      value itself; with reduced motion, or for a zero, it is simply the value;
 *  M3) useFirstEntrance plays once: on the first data, then off for good;
 *  M4) Crossfade: the skeleton while loading, then the content fading in over the
 *      skeleton fading out, and only when it WAS loading (a later render never fades);
 *  M5) the position chip buckets a position as Google's pages do (1-3, 4-10,
 *      11-20, beyond, not found), and the sparkline draws nothing from one point;
 *  M7) a keyword that improved draws a line that RISES, left to right, in both
 *      languages: time is never mirrored and position 1 is at the top (sparklines,
 *      the history chart; the search-volume trend runs the same way);
 *  M6) the keywords hero's figures come from the rows the table shows: tracked,
 *      checked, per-page buckets, the average of the positions found, what moved;
 *  M8) the articles hero: the overview's counts, the publishing pace by week and
 *      the last 30 days from the rows; a zero status figure is left out (§7); each
 *      row's picture is decorative and falls back to a tile when it fails to load.
 *
 * Source guards strip comments first. Every guard has a mutation control.
 *
 * Run: npx tsx components/ui/__qa__/motion-layer.qa.ts
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { AnimatedNumber, Crossfade } from '../motion'
import { positionBucket } from '../PositionChip'
import Sparkline from '../Sparkline'
import { keywordStanding } from '../../keywords/KeywordsHero'
import type { ScanResult, TrackingTarget } from '../../../lib/supabase/types'
import { articleStanding, PACE_WEEKS } from '../../content/workspace/articles-standing'
import type { ArticleRow, Counts } from '../../content/workspace/types'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1')
const motion = strip(read('components/ui/motion.tsx'))

console.log('M1) the real figure is in the page from the first render')
{
  const html = renderToStaticMarkup(createElement(AnimatedNumber, { value: 34880, format: (n: number) => Math.round(n).toLocaleString('en-US') }))
  const real = (h: string) => h.includes('>34,880<') && !/color:\s*transparent/.test(h)
  check('M1: the first render shows the formatted value itself, not a 0 or a partial count', real(html), html)
  check('MUT: a first render of the count\'s 0 fails M1', !real(html.replace('>34,880<', '>0<')))
}

console.log('\nM2) the count reaches its value')
{
  // The effects of AnimatedNumber, as written.
  const body = motion.slice(motion.indexOf('export function AnimatedNumber'), motion.indexOf('const useIsoLayoutEffect'))
  const effects = (src: string) => [...src.matchAll(/use(?:Iso)?(?:Layout)?Effect\(\(\) => \{([\s\S]*?)\n {2}\}, \[([^\]]*)\]\)/g)].map((m) => ({ body: m[1], deps: m[2] }))
  const reaches = (src: string): string[] => {
    const out: string[] = []
    const all = effects(src)
    const loop = all.filter((e) => /requestAnimationFrame/.test(e.body))
    if (loop.length !== 1) out.push(`${loop.length} frame loops`)
    else {
      const [l] = loop
      if (/setPhase\('run'\)/.test(l.body)) out.push('the frame loop also starts the count (its phase change cancels it)')
      if (!/return \(\) => cancelAnimationFrame\(raf\)/.test(l.body)) out.push('the frame loop is not cancelled on unmount')
      if (!/Math\.max\(0, \(now - start\) \/ duration\)/.test(l.body)) out.push('the first frame is not clamped at 0')
      if (!/setFrame\(null\)/.test(l.body) || !/setPhase\('done'\)/.test(l.body)) out.push('the count does not end on the value')
    }
    if (!all.some((e) => /if \(phase !== 'wait' \|\| !seen\) return/.test(e.body) && /settled\(el\.current, ENTRANCE_WAIT_MS\)\.then\(start\)/.test(e.body) && /setPhase\('run'\)/.test(e.body) && !/requestAnimationFrame/.test(e.body))) out.push('nothing starts the count when seen and settled')
    if (!/if \(reduced \|\| target === 0\) \{ setPhase\('done'\); return \}/.test(src)) out.push('reduced motion still counts')
    return out
  }
  check('M2: the count is started by its own effect, clamped at 0, and ends on the value; reduced motion never counts', reaches(body).length === 0, reaches(body).join(', '))
  const merged = body
    .replace("    void settled(el.current, ENTRANCE_WAIT_MS).then(start)\n", '')
    .replace("    if (phase !== 'run') return\n", "    if (phase === 'wait' && seen) setPhase('run')\n    if (phase !== 'run') return\n")
  check('MUT: the start merged back into the frame loop (the frozen "0.0") fails M2', reaches(merged).length > 0)
  check('MUT: an unclamped first frame (the "-0.6") fails M2', reaches(body.replace('Math.max(0, (now - start) / duration)', '(now - start) / duration')).length > 0)
  check('MUT: counting under reduced motion fails M2', reaches(body.replace('if (reduced || target === 0)', 'if (target === 0)')).length > 0)
  check('MUT: a count that starts while its card is still fading in fails M2', reaches(body.replace('void settled(el.current, ENTRANCE_WAIT_MS).then(start)', 'start()')).length > 0)
  // The wait itself: only finite entrances around the figure, capped, never a loop.
  const settle = motion.slice(motion.indexOf('function settled('), motion.indexOf('export function useFirstEntrance'))
  const waits = (src: string) => /target\.contains\(node\)/.test(src) && /a\.playState === 'running' && timing\?\.iterations !== Infinity/.test(src) && /new Promise<void>\(\(resolve\) => setTimeout\(resolve, cap\)\)/.test(src)
  check('M2b: the count waits only for the finite entrances around it, and never longer than the cap', waits(settle))
  check('MUT: waiting on the hero\'s endless glow too fails M2b', !waits(settle.replace(" && timing?.iterations !== Infinity", '')))
  check('MUT: an uncapped wait fails M2b', !waits(settle.replace('new Promise<void>((resolve) => setTimeout(resolve, cap)),', '')))
}

console.log('\nM3) a table\'s rows enter once')
{
  const hook = motion.slice(motion.indexOf('export function useFirstEntrance'), motion.indexOf('export function useSlidingThumb'))
  const once = (src: string) =>
    /if \(state === 'before' && ready\) setState\('on'\)/.test(src)
    && /setTimeout\(\(\) => setState\('off'\), ms\)/.test(src)
    && /return state === 'on' \|\| \(state === 'before' && ready\)/.test(src)
    && !/setState\('before'\)/.test(src)
  check('M3: useFirstEntrance turns on with the first data and off for good (no way back to before)', once(hook))
  check('MUT: an entrance that re-arms on new data fails M3', !once(hook.replace("setTimeout(() => setState('off'), ms)", "setTimeout(() => setState('before'), ms)")))
}

console.log('\nM4) the skeleton crossfades into the content')
{
  const r = (loading: boolean) => renderToStaticMarkup(createElement(Crossfade, { loading, skeleton: createElement('i', null, 'SKEL') } as unknown as Parameters<typeof Crossfade>[0], createElement('b', null, 'DATA')))
  const loading = r(true)
  const ready = r(false)
  check('M4: loading shows the skeleton only; a first render with data shows the data, no fade and no skeleton',
    loading.includes('SKEL') && !loading.includes('DATA') && ready.includes('DATA') && !ready.includes('SKEL') && !ready.includes('fade-'), `${loading} | ${ready}`)
  const fades = (src: string) => /if \(wasLoading !== loading\) \{\s*setWasLoading\(loading\)\s*if \(!loading\) setLeaving\(true\)/.test(src)
    && /className=\{leaving \? 'fade-in' : undefined\}/.test(src) && /aria-hidden="true" className="fade-out/.test(src)
  const cf = motion.slice(motion.indexOf('export function Crossfade'))
  check('M4b: only a change from loading to ready fades (content in, the hidden skeleton out)', fades(cf))
  check('MUT: a crossfade on every render fails M4b', !fades(cf.replace('if (!loading) setLeaving(true)', 'setLeaving(true)')))
}

console.log('\nM5) position chips and sparklines')
{
  const cases: [number | null, boolean, string][] = [[1, true, 'top3'], [3, true, 'top3'], [4, true, 'page1'], [10, true, 'page1'], [11, true, 'page2'], [20, true, 'page2'], [21, true, 'beyond'], [null, true, 'none'], [5, false, 'none'], [0, true, 'none']]
  const wrong = (fn: typeof positionBucket) => cases.filter(([p, f, want]) => fn(p, f) !== want).map(([p, f, want]) => `${p}/${f}→${fn(p, f)} (want ${want})`)
  check('M5: a position is bucketed as Google\'s pages are', wrong(positionBucket).length === 0, wrong(positionBucket).join(', '))
  check('MUT: page one ending at 9 fails M5', wrong((p, f = true) => (!f || p == null || p <= 0 ? 'none' : p <= 3 ? 'top3' : p <= 9 ? 'page1' : p <= 20 ? 'page2' : 'beyond')).length > 0)
  const spark = (values: (number | null)[]) => renderToStaticMarkup(createElement(Sparkline, { values, invert: true, label: 'x' }))
  check('M5b: one point draws nothing; two draw a line', spark([4]) === '' && /data-sparkline/.test(spark([9, 4])))
}

console.log('\nM7) a keyword that improved draws a line that rises, left to right, in both languages')
{
  // The owner read the Hebrew trend lines as declines: mirrored for RTL, #4 → #2 fell
  // from left to right beside its green up arrow. Time runs left to right everywhere
  // and position 1 is at the top, so on screen the line climbs toward the right.
  /** The line's points as drawn on screen: [x, y] with y growing downward. */
  const onScreen = (html: string): [number, number][] => {
    const d = /<path d="(M[^"]+)" fill="none"/.exec(html)?.[1] ?? ''
    const pts = [...d.matchAll(/[ML]([\d.]+),([\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])] as [number, number])
    const cls = /<svg[^>]*class="([^"]*)"/.exec(html)?.[1] ?? ''
    // A mirror in either language would flip x on screen; say so rather than guess.
    return /scale-x-100|-scale-x|scale-x-\[-1\]|rotate-y/.test(cls) ? pts.map(([x, y]) => [-x, y]) : pts
  }
  const rises = (html: string) => {
    const pts = onScreen(html)
    if (pts.length < 2) return false
    const [first, last] = [pts[0], pts[pts.length - 1]]
    return last[0] > first[0] && last[1] < first[1]
  }
  const improved = renderToStaticMarkup(createElement(Sparkline, { values: [9, 6, 4, 2], invert: true, label: 'x' }))
  const dropped = renderToStaticMarkup(createElement(Sparkline, { values: [2, 4, 6, 9], invert: true, label: 'x' }))
  check('M7: #9 → #2 draws a line rising to the right; #2 → #9 does not', rises(improved) && !rises(dropped))
  check('MUT: mirroring the line for Hebrew (the reported bug) fails M7', !rises(improved.replace('class="shrink-0 overflow-visible', 'class="shrink-0 overflow-visible rtl:-scale-x-100')))
  const src = strip(read('components/ui/Sparkline.tsx'))
  const upright = (code: string) => /return invert \? pad \+ t \* \(height - pad \* 2\) : height - pad - t \* \(height - pad \* 2\)/.test(code)
    && !/scale-x|rotate-y/.test(code)
  check('M7b: the sparkline puts the best position at the top and never mirrors', upright(src))
  check('MUT: position 1 at the bottom fails M7b', !upright(src.replace('return invert ? pad + t * (height - pad * 2) : height - pad - t * (height - pad * 2)', 'return height - pad - t * (height - pad * 2)')))
  check('MUT: an rtl mirror on the sparkline fails M7b', !upright(src.replace("'shrink-0 overflow-visible'", "'shrink-0 overflow-visible rtl:-scale-x-100'")))

  // The charts: the history chart (positions) and the search-volume trend. Time is
  // never reversed, and the position axis is (#1 at the top).
  const charts = {
    history: strip(read('components/keywords/PositionHistoryChart.tsx')),
    volume: strip(read('components/keyword-research/TrendModal.tsx')),
  }
  const axes = (c: typeof charts): string[] => {
    const out: string[] = []
    for (const [name, code] of Object.entries(c)) {
      const x = /<XAxis\b[^>]*>/.exec(code)?.[0] ?? ''
      if (!x) out.push(`${name}: no time axis`)
      else if (/\breversed\b/.test(x)) out.push(`${name}: time runs backwards`)
    }
    const y = /<YAxis\b[^>]*>/.exec(c.history)?.[0] ?? ''
    if (!/<YAxis reversed\b/.test(y)) out.push('history: position 1 is not at the top')
    return out
  }
  check('M7c: the history and trend charts run time left to right, and #1 is at the top of the history', axes(charts).length === 0, axes(charts).join(', '))
  check('MUT: the history chart reversed for Hebrew fails M7c', axes({ ...charts, history: charts.history.replace('<XAxis dataKey="at"', '<XAxis reversed={isRTL} dataKey="at"') }).length > 0)
  check('MUT: the history chart with #1 at the bottom fails M7c', axes({ ...charts, history: charts.history.replace('<YAxis reversed ', '<YAxis ') }).length > 0)
  check('MUT: the volume trend reversed for Hebrew fails M7c', axes({ ...charts, volume: charts.volume.replace('<XAxis dataKey="label"', '<XAxis dataKey="label" reversed={isRTL}') }).length > 0)
}

console.log('\nM6) the keywords hero counts what the table shows')
{
  const t = (id: string, active = true) => ({ id, is_active: active }) as unknown as TrackingTarget
  const r = (position: number | null, found: boolean, change: number | null) => ({ position, found, change_value: change }) as unknown as ScanResult
  const targets = [t('a'), t('b'), t('c'), t('d'), t('e', false), t('f')]
  const latest = { a: r(2, true, 3), b: r(7, true, -1), c: r(15, true, 0), d: r(null, false, null), e: r(40, true, 2) }
  const s = keywordStanding(targets, latest)
  const ok = s.tracked === 6 && s.active === 5 && s.checked === 5 && s.buckets.unchecked === 1
    && s.buckets.top3 === 1 && s.buckets.page1 === 1 && s.buckets.page2 === 1 && s.buckets.beyond === 1 && s.buckets.none === 1
    && s.found === 4 && s.average === (2 + 7 + 15 + 40) / 4 && s.up === 2 && s.down === 1
  check('M6: tracked 6 (5 active), 5 checked, one per bucket, average of the 4 found, 2 up and 1 down', ok, JSON.stringify(s))
  const none = keywordStanding([t('a')], {})
  check('M6b: a list never checked has no average and every keyword unchecked', none.average === null && none.checked === 0 && none.buckets.unchecked === 1)
  const src = strip(read('components/keywords/KeywordsHero.tsx'))
  const counted = (code: string) => /if \(r\.found && typeof r\.position === 'number' && r\.position > 0\) \{ sum \+= r\.position; found\+\+ \}/.test(code)
  check('M6c: only the positions found are averaged (a "not found" never counts as a position)', counted(src))
  check('MUT: averaging every checked keyword fails M6c', !counted(src.replace("if (r.found && typeof r.position === 'number' && r.position > 0) { sum += r.position; found++ }", "if (typeof r.position === 'number') { sum += r.position; found++ }")))
}

console.log('\nM8) the articles hero and rows')
{
  const DAY = 24 * 60 * 60 * 1000
  const now = Date.parse('2026-09-29T12:00:00Z')
  const row = (id: string, publishedDaysAgo: number | null) => ({ id, published_at: publishedDaysAgo === null ? null : new Date(now - publishedDaysAgo * DAY).toISOString() }) as unknown as ArticleRow
  const counts: Counts = { total: 6, draft: 1, ready: 1, scheduled: 0, publishing: 0, published: 4, failed: 0 }
  const rows = [row('a', 1), row('b', 3), row('c', 20), row('d', 50), row('e', null), row('f', -2)]
  const s = articleStanding(counts, rows, now)
  const expectWeekly = new Array(PACE_WEEKS).fill(0); expectWeekly[PACE_WEEKS - 1] = 2; expectWeekly[PACE_WEEKS - 3] = 1; expectWeekly[PACE_WEEKS - 8] = 1
  const ok = (x: typeof s) => x.total === 6 && x.published === 4 && x.publishedLast30 === 3
    && x.lastPublishedAt === new Date(now - DAY).toISOString() && JSON.stringify(x.weekly) === JSON.stringify(expectWeekly)
  check('M8: 4 live (1, 3, 20, 50 days ago): 3 in 30 days, last one a day ago, weeks oldest first; a future date and a draft count nowhere', ok(s), JSON.stringify(s))
  check('MUT: a pace newest-first fails M8', !ok({ ...s, weekly: [...s.weekly].reverse() }))
  check('M8b: nothing published: no last date and a flat pace', (() => { const n = articleStanding({ ...counts, published: 0 }, [row('x', null)], now); return n.lastPublishedAt === null && n.weekly.every((w) => w === 0) })())

  const hero = strip(read('components/content/workspace/ArticlesHero.tsx'))
  const zeroless = (code: string) => /\]\.filter\(\(f\) => f\.key === 'total' \|\| f\.value > 0\)/.test(code) && /\.slice\(0, 4\)/.test(code)
  check('M8c: the hero shows the total always and a status figure only when it counts something, four at most (§7)', zeroless(hero))
  check('MUT: a hero that shows every status, zeros too, fails M8c', !zeroless(hero.replace(".filter((f) => f.key === 'total' || f.value > 0)", '')))

  const screen = strip(read('components/content/workspace/ArticlesScreen.tsx'))
  const thumb = (code: string) => /<img src=\{src\} alt="" [^>]*onError=\{\(\) => setFailed\(true\)\}/.test(code)
    && /if \(!src \|\| failed\)/.test(code) && /data-article-thumb="image" className=/.test(code) && /<span aria-hidden="true" data-article-thumb="image"/.test(code)
  check('M8d: a row\'s picture is decorative (alt="", aria-hidden) and a broken one falls back to the document tile', thumb(screen))
  check('MUT: a picture with no fallback fails M8d', !thumb(screen.replace(' onError={() => setFailed(true)}', '')))
  const hero1 = (code: string) => /<TableBody enter=\{rowsEnter\}>/.test(code) && /const rowsEnter = useFirstEntrance\(filteredArticles\.length > 0\)/.test(code)
    && /className="bar-rise sticky/.test(code) && !/<StatTile\b/.test(code)
  check('M8e: the rows enter once, the bulk bar rises (no-preference only, D3), and the stat tiles gave way to the hero', hero1(screen))
  check('MUT: rows that enter on every render fail M8e', !hero1(screen.replace('<TableBody enter={rowsEnter}>', '<TableBody enter>')))
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exitCode = 1
export {}
