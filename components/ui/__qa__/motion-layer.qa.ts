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
 *  M2) the count reaches its value: the effect that starts the count is not the
 *      effect that runs its frames (merged, the phase change cancelled the frame
 *      loop and the hero stuck at "0.0", "3.3"), the first frame is clamped at 0
 *      (a frame stamped a hair before the start drew "-0.6"), and it ends on the
 *      value itself; with reduced motion, or for a zero, it is simply the value;
 *  M3) useFirstEntrance plays once: on the first data, then off for good;
 *  M4) Crossfade: the skeleton while loading, then the content fading in over the
 *      skeleton fading out, and only when it WAS loading (a later render never fades);
 *  M5) the position chip buckets a position as Google's pages do (1-3, 4-10,
 *      11-20, beyond, not found), and the sparkline draws nothing from one point;
 *  M6) the keywords hero's figures come from the rows the table shows: tracked,
 *      checked, per-page buckets, the average of the positions found, what moved.
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
    if (!all.some((e) => /if \(phase === 'wait' && seen\) setPhase\('run'\)/.test(e.body) && !/requestAnimationFrame/.test(e.body))) out.push('nothing starts the count when seen')
    if (!/if \(reduced \|\| target === 0\) \{ setPhase\('done'\); return \}/.test(src)) out.push('reduced motion still counts')
    return out
  }
  check('M2: the count is started by its own effect, clamped at 0, and ends on the value; reduced motion never counts', reaches(body).length === 0, reaches(body).join(', '))
  const merged = body
    .replace("    if (phase === 'wait' && seen) setPhase('run')\n", '')
    .replace("    if (phase !== 'run') return\n", "    if (phase === 'wait' && seen) setPhase('run')\n    if (phase !== 'run') return\n")
  check('MUT: the start merged back into the frame loop (the frozen "0.0") fails M2', reaches(merged).length > 0)
  check('MUT: an unclamped first frame (the "-0.6") fails M2', reaches(body.replace('Math.max(0, (now - start) / duration)', '(now - start) / duration')).length > 0)
  check('MUT: counting under reduced motion fails M2', reaches(body.replace('if (reduced || target === 0)', 'if (target === 0)')).length > 0)
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
  check('M5b: one point draws nothing; two draw a line that flips for Hebrew', spark([4]) === '' && /data-sparkline/.test(spark([9, 4])) && /rtl:-scale-x-100/.test(spark([9, 4])))
  check('MUT: a line that does not flip for Hebrew fails M5b', !/rtl:-scale-x-100/.test(spark([9, 4]).replace('rtl:-scale-x-100', '')))
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

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exitCode = 1
export {}
