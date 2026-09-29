/**
 * The landing page (wave 7): persuasive, animated, and COMPLETE AT REST.
 *
 *   A) the server render of both home pages carries every word of every
 *      section (hero, demo scene 1, outcomes, figures, the flow, the feature
 *      rows, audiences, the free-check preview, the FAQ and the close), the
 *      hero's free-check field is the first form, and nothing is rendered
 *      waiting to be revealed (no data-rise / data-flow other than "static");
 *   B) motion only starts on the client: the entrance hook starts 'static' and
 *      parks a block only after checking it is below the fold; the demo starts
 *      finished (t = Infinity) and never plays under reduced motion; every
 *      hiding rule in the CSS module sits inside prefers-reduced-motion:
 *      no-preference;
 *   C) the outcomes bento leaves no card alone on a row at five columns
 *      (3 + 2, then 2 + 3), and there are exactly three outcomes per language;
 *   D) honesty: the page's figures come from the product (six AI engines, the
 *      plan catalogue's trial and lowest price), the demo says its names and
 *      figures are illustrative, and no invented social proof appears.
 * Each group ends with a MUTATION CONTROL: the same check on a deliberately
 * broken copy must fail.
 *
 * Run: npx tsx components/public/__qa__/landing-page.qa.ts
 */
/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */
import { readFileSync } from 'fs'
import { join } from 'path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1').replace(/\{\/\*[\s\S]*?\*\/\}/g, '')

// ── A server render needs the router hooks and the CSS module stubbed ──────
const Mod: any = require('module')
Mod._extensions['.css'] = (m: any) => { m.exports = new Proxy({}, { get: (_t, k) => (k === '__esModule' ? false : String(k)) }) }
const origLoad = Mod._load
Mod._load = function (request: string, parent: any, isMain: boolean) {
  const real = origLoad.call(this, request, parent, isMain)
  if (request !== 'next/navigation') return real
  return new Proxy(real, {
    get: (t, k) => (k === 'usePathname' ? () => '/'
      : k === 'useSearchParams' ? () => new URLSearchParams()
      : k === 'useRouter' ? () => ({ push() {}, replace() {}, refresh() {}, back() {}, prefetch() {} })
      : (t as any)[k]),
  })
}

/** Every string leaf of a copy object (numbers too), for "is it all on the page?". */
function leaves(o: unknown, out: string[] = []): string[] {
  if (typeof o === 'string') out.push(o)
  else if (typeof o === 'number') out.push(String(o))
  else if (Array.isArray(o)) o.forEach((x) => leaves(x, out))
  // `status` is an enum the layout maps to an icon and tone, not words.
  else if (o && typeof o === 'object') Object.entries(o).forEach(([k, x]) => { if (k !== 'status') leaves(x, out) })
  return out
}
const unescape = (html: string) => html.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/<!-- -->/g, '')

/** The copy that must be visible at rest: everything except demo scenes 2 and 3 (they play after scene 1). */
function atRest(copy: any): string[] {
  const { demo, ...rest } = copy
  const { article: _a, ai: _b, describe, tabs, rail, rank, caption } = demo
  void _a; void _b
  const rankRest = { ...rank, toast: undefined, from: undefined }
  return [...leaves(rest), ...leaves([describe[0], tabs, rail, rankRest, caption])]
    // the signed-in label and the "{price}" pieces are not on a signed-out render
    .filter((s) => s !== copy.hero.dashboard && s !== copy.cta.dashboard)
}

function missing(html: string, copy: any): string[] {
  const text = unescape(html)
  return atRest(copy).filter((s) => !text.includes(s))
}

async function main() {
  const { LandingPage } = require(join(ROOT, 'components/public/LandingPage.tsx'))
  const pages = [
    { locale: 'he', signup: '/signup?lang=he', pricing: '/pricing' },
    { locale: 'en', signup: '/en/signup', pricing: '/en/pricing' },
  ] as const
  const copies: Record<string, any> = {
    he: require(join(ROOT, 'lib/i18n/public/landing-he.ts')).landingHe,
    en: require(join(ROOT, 'lib/i18n/public/landing-en.ts')).landingEn,
  }
  const pageUses = (src: string, locale: 'he' | 'en') => new RegExp(`<LandingPage locale="${locale}" copy=\\{landing${locale === 'he' ? 'He' : 'En'}\\}`).test(strip(src))
  check('A0: both home pages render the one layout with their own dictionary', pageUses(read('app/page.tsx'), 'he') && pageUses(read('app/(public)/en/page.tsx'), 'en'))
  check('MUTATION CONTROL: the English page handed the Hebrew words is caught', !pageUses(read('app/(public)/en/page.tsx').replace('copy={landingEn}', 'copy={landingHe}'), 'en'))

  console.log('A) the server render is the whole page, finished')
  const html: Record<string, string> = {}
  for (const p of pages) {
    html[p.locale] = renderToStaticMarkup(createElement(LandingPage as never, {
      locale: p.locale, copy: copies[p.locale], signedIn: false, signupHref: p.signup, pricingHref: p.pricing,
    } as never) as never)
    const miss = missing(html[p.locale], copies[p.locale])
    check(`A1 (${p.locale}): every word of every section is in the server HTML`, miss.length === 0, miss.slice(0, 4).join(' | '))
    const firstForm = html[p.locale].indexOf('<form')
    check(`A2 (${p.locale}): the first form on the page is the hero's free-check field`, firstForm !== -1 && html[p.locale].indexOf('id="hero-free-check-url"') > firstForm
      && html[p.locale].indexOf('id="hero-free-check-url"') < html[p.locale].indexOf('role="tablist"'))
    const waiting = html[p.locale].match(/data-(?:rise|flow)="(?!static")[^"]*"/g) ?? []
    check(`A3 (${p.locale}): nothing is rendered waiting to be revealed`, waiting.length === 0 && /data-rise="static"/.test(html[p.locale]), waiting.slice(0, 3).join(' '))
    check(`A4 (${p.locale}): the free check is the page's main action (hero, flow, preview and close all lead to it)`,
      (html[p.locale].match(new RegExp(`href="${p.locale === 'en' ? '/en' : ''}/free-check"`, 'g')) ?? []).length >= 3)
  }
  {
    const broken = { ...copies.he, faq: { ...copies.he.faq, items: [...copies.he.faq.items, { q: 'שאלה שלא מוצגת', a: 'x' }] } }
    check('MUTATION CONTROL: copy that the layout does not render is caught', missing(html.he, broken).length > 0)
    check('MUTATION CONTROL: a block rendered hidden (data-rise="wait") is caught',
      (html.he.replace('data-rise="static"', 'data-rise="wait"').match(/data-(?:rise|flow)="(?!static")[^"]*"/g) ?? []).length === 1)
  }

  console.log('\nB) motion starts on the client only, and never under reduced motion')
  const motion = strip(read('components/public/landing/motion.tsx'))
  const demo = strip(read('components/public/landing/HeroDemo.tsx'))
  const css = read('components/public/landing/landing.module.css').replace(/\/\*[\s\S]*?\*\//g, '')
  const entranceOk = (src: string) => /useState<Entrance>\('static'\)/.test(src)
    // Reduced motion (which arrives AFTER the first run, with the server's answer) sends the
    // block back to its finished state, so a counter parked below the fold never stays at 0 (w7 P0-2).
    && /if \(reduced\) \{ setState\('static'\); return \}\s*const el = ref\.current\s*if \(!el \|\| typeof IntersectionObserver === 'undefined'\) return/.test(src)
    && /if \(reduced\) \{ setShown\(value\); return \}/.test(src)
    && /if \(rect\.top < window\.innerHeight \* 0\.92\) return/.test(src)
    && src.indexOf("setState('wait')") > src.indexOf('if (rect.top < window.innerHeight * 0.92) return')
  check('B1: a block starts finished, and is parked only by the client, only below the fold, never with reduced motion', entranceOk(motion))
  check('MUTATION CONTROL: an entrance that starts hidden is caught', !entranceOk(motion.replace("useState<Entrance>('static')", "useState<Entrance>('wait')")))
  check('MUTATION CONTROL: an entrance that ignores reduced motion is caught', !entranceOk(motion.replace("if (reduced) { setState('static'); return }", '')))
  check('MUTATION CONTROL (w7 P0-2): the old early return that left a parked counter at 0 is caught',
    !entranceOk(motion.replace("if (reduced) { setState('static'); return }\n    const el = ref.current\n    if (!el || typeof", 'const el = ref.current\n    if (!el || reduced || typeof')))
  check('MUTATION CONTROL (w7 P0-2): a counter that draws 0 under reduced motion is caught', !entranceOk(motion.replace('if (reduced) { setShown(value); return }', '')))
  const demoOk = (src: string) => /useState<\{ scene: number; t: number; held: number \}>\(\{ scene: 0, t: Infinity, held: 0 \}\)/.test(src)
    && /const playing = !reduced && !hovered && visible/.test(src)
    && /setClock\(\{ scene: i, t: reduced \? Infinity : 0, held: 0 \}\)/.test(src)
    && /if \(!playing\) return/.test(src)
  check('B2: the demo renders scene 1 finished, pauses on hover and off screen, and never plays under reduced motion', demoOk(demo))
  check('MUTATION CONTROL: a demo that starts at t = 0 (blank first paint) is caught', !demoOk(demo.replace('{ scene: 0, t: Infinity, held: 0 }', '{ scene: 0, t: 0, held: 0 }')))
  check('MUTATION CONTROL: a demo that plays under reduced motion is caught', !demoOk(demo.replace('const playing = !reduced && !hovered && visible', 'const playing = !hovered && visible')))
  /**
   * Every rule that hides or offsets CONTENT sits inside a no-preference block.
   * Decoration drawn by a pseudo-element (the CTA's light sweep) may rest at
   * opacity 0: it carries no content.
   */
  const withoutKeyframes = (s: string) => s.replace(/@keyframes[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '')
  const hidingOutsideNoPref = (src: string) => {
    const s = withoutKeyframes(src)
    const out: string[] = []
    const stack: { noPref: boolean; selector: string }[] = []
    const re = /([^{};]*)\{|\}|(opacity:\s*0\s*;|transform:\s*(?:scale[XY]\(0\)|translateY\(\d+px\)))/g
    let m: RegExpExecArray | null
    while ((m = re.exec(s))) {
      if (m[0].endsWith('{')) {
        const head = (m[1] ?? '').trim()
        stack.push({ noPref: /^@media[^{]*prefers-reduced-motion:\s*no-preference/.test(head), selector: head })
      } else if (m[0] === '}') stack.pop()
      else if (m[2]) {
        const selector = stack[stack.length - 1]?.selector ?? ''
        if (!stack.some((f) => f.noPref) && !/::(?:after|before)/.test(selector)) out.push(`${selector} → ${m[2]}`)
      }
    }
    return out
  }
  const hiding = hidingOutsideNoPref(css)
  check('B3: every hidden or offset starting pose in the CSS is inside prefers-reduced-motion: no-preference', hiding.length === 0, hiding.join(' | '))
  check('MUTATION CONTROL: a hidden pose outside the media query is caught',
    hidingOutsideNoPref(css + "\n.rise[data-rise='wait'] { opacity: 0; }\n").length === 1)

  console.log('\nC) the outcomes bento leaves no card alone on a row')
  const landing = strip(read('components/public/LandingPage.tsx'))
  const bentoOk = (src: string, outcomes: number) => {
    const grid = /<div className="grid grid-cols-1 gap-4 sm:gap-5 lg:grid-cols-5" data-outcomes-grid>/.test(src)
    const itemSpans = /className=\{i === 0 \? 'h-full lg:col-span-3' : 'h-full lg:col-span-2'\}/.test(src)
    const stats = /<Rise delay=\{160\} className="h-full lg:col-span-3">/.test(src)
    if (!grid || !itemSpans || !stats) return false
    const spans = [...Array.from({ length: outcomes }, (_, i) => (i === 0 ? 3 : 2)), 3]
    let used = 0
    for (const s of spans) { if (used + s > 5) { if (used !== 5) return false; used = 0 } used += s }
    return used === 5
  }
  const n = (l: string) => copies[l].outcomes.items.length
  check(`C1: ${n('he')} (he) and ${n('en')} (en) outcomes plus the figures fill both rows at five columns`, n('he') === n('en') && bentoOk(landing, n('he')))
  check('MUTATION CONTROL: a fourth outcome (a card alone on a row) is caught', !bentoOk(landing, 4))
  check('MUTATION CONTROL: the figures card narrowed to two columns is caught', !bentoOk(landing.replace('<Rise delay={160} className="h-full lg:col-span-3">', '<Rise delay={160} className="h-full lg:col-span-2">'), 3))
  const noRail = (src: string) => !/border-s-\[?\d/.test(src)
  check('C2: no start rail bends round a landing card', noRail(landing))
  check('MUTATION CONTROL: a rail on a landing card is caught', !noRail(landing + ' border-s-[3px] '))

  console.log('\nD) honesty: figures from the product, the demo labelled, no invented proof')
  const { PLAN_CATALOG, TRIAL_CATALOG } = require(join(ROOT, 'lib/plans/catalog.ts'))
  const { SCORED_ENGINES } = require(join(ROOT, 'lib/ai-visibility/score.ts'))
  const minILS = Math.min(...Object.values(PLAN_CATALOG).map((p: any) => p.priceILS))
  const minUSD = Math.min(...Object.values(PLAN_CATALOG).map((p: any) => p.priceUSD))
  for (const l of ['he', 'en']) {
    const c = copies[l]
    const stats = c.outcomes.stats.map((s: any) => s.value)
    check(`D1 (${l}): the figures are the engines the product scores (${SCORED_ENGINES.length}) and the trial length (${TRIAL_CATALOG.days})`,
      stats[0] === SCORED_ENGINES.length && stats[3] === TRIAL_CATALOG.days && c.demo.ai.engines.length === SCORED_ENGINES.length)
    check(`D2 (${l}): the "plans from" price is the catalogue's lowest`, l === 'he' ? c.cta.pricing.includes(`₪${minILS}`) : c.cta.pricing.includes(`$${minUSD}`), c.cta.pricing)
  }
  const labelled = (c: any) => /להמחשה|illustrative/i.test(c.demo.caption) && /להמחשה|illustrative/i.test(c.features.note)
  check('D3: the demo and the feature pictures say their names and figures are illustrative', labelled(copies.he) && labelled(copies.en))
  check('MUTATION CONTROL: an unlabelled demo is caught', !labelled({ ...copies.he, demo: { ...copies.he.demo, caption: 'הדגמה של המערכת.' } }))
  const INVENTED = /לקוחות מרוצים|אלפי|\d[\d,]*\+|as seen|trusted by|customers love|happy customers|\d+%\s*(?:more|יותר)|TheMarker|Forbes/i
  const invented = (c: any) => leaves({ ...c, demo: undefined, features: undefined }).filter((s) => INVENTED.test(s))
  check('D4: no invented social proof, totals or press in either language', invented(copies.he).length === 0 && invented(copies.en).length === 0,
    [...invented(copies.he), ...invented(copies.en)].slice(0, 3).join(' | '))
  check('MUTATION CONTROL: a "1000+ customers" claim is caught', invented({ ...copies.en, hero: { ...copies.en.hero, eyebrow: 'Trusted by 1000+ businesses' } }).length === 1)

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}
main().catch((e) => { console.error(e); process.exit(1) })

export {}
