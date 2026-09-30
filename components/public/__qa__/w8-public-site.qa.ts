/**
 * Wave 8, the public site (UX decisions C and D), both languages:
 *
 *   A) the menu says "בדיקת אתר חינמית" / "Free site check" (nav, mobile menu,
 *      and the home page's free-check eyebrow), and the nav still links it;
 *   B) contact: the nav's last item opens the three channels (WhatsApp, phone,
 *      email) from the one shared list, the mobile menu repeats them, the
 *      footer's contact column starts with WhatsApp, the About close offers the
 *      three as buttons, the floating WhatsApp button and the phone bar stay,
 *      and the English site's WhatsApp message is English;
 *   C) rhythm: the home bands run D S C D E D E D E D (D navy, E deeper navy, S surface,
 *      C canvas, B cobalt) so from the four-step flow down nothing is light and no two
 *      neighbours share a tone, and About runs D S D C B D; the heroes are navy with the
 *      nav in its inverse tone over them;
 *   D) type: the marketing steps are fluid and land on the sizes the design
 *      gives (hero 32 → 54, About hero 34 → 56, section 28 → 44, lead 17 → 21,
 *      numerals 44 → 56) and tailwind-merge knows them; Hebrew is never tracked
 *      wider or uppercased;
 *   E) the rank climb: exactly three uses on the home page (hero, flow, close),
 *      steps only (no curves), whole at rest, drawn only with no-preference;
 *   F) contrast: white on the cobalt band and the faintest light ink used on
 *      navy are AA (4.5:1).
 * Every group has a MUTATION CONTROL: the same check on a broken copy fails.
 *
 * Run: npx tsx components/public/__qa__/w8-public-site.qa.ts
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
const HEBREW = /[֐-׿]/

// Router hooks and the CSS module stubbed, as in landing-page.qa.ts.
let PATHNAME = '/'
const Mod: any = require('module')
Mod._extensions['.css'] = (m: any) => { m.exports = new Proxy({}, { get: (_t, k) => (k === '__esModule' ? false : String(k)) }) }
const origLoad = Mod._load
Mod._load = function (request: string, parent: any, isMain: boolean) {
  const real = origLoad.call(this, request, parent, isMain)
  if (request !== 'next/navigation') return real
  return new Proxy(real, {
    get: (t, k) => (k === 'usePathname' ? () => PATHNAME
      : k === 'useSearchParams' ? () => new URLSearchParams()
      : k === 'useRouter' ? () => ({ push() {}, replace() {}, refresh() {}, back() {}, prefetch() {} })
      : (t as any)[k]),
  })
}

/** The class attribute of each top-level child of <main>, in order. */
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr'])
function mainBands(html: string): string[] {
  const start = html.indexOf('<main')
  const s = html.slice(start)
  const re = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)([^>]*?)(\/?)>/g
  let depth = 0
  const out: string[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(s))) {
    const [, close, tag, attrs, self] = m
    const t = tag.toLowerCase()
    if (close) { depth--; if (depth === 0) break; continue }
    if (depth === 1) out.push(/class="([^"]*)"/.exec(attrs)?.[1] ?? '')
    if (!self && !VOID.has(t)) depth++
  }
  return out
}
function tone(cls: string): string {
  // E: the deeper navy (bg-contrast-deep), so two dark bands never touch in the same tone.
  if (/\bbg-contrast-deep\b/.test(cls)) return 'E'
  if (/\bheroDark\b|\bbg-contrast\b/.test(cls)) return 'D'
  if (/\bbandBrand\b/.test(cls)) return 'B'
  if (/\bbg-surface\b/.test(cls)) return 'S'
  if (/\bbg-canvas\b/.test(cls)) return 'C'
  return '?'
}
const tones = (html: string) => mainBands(html).map(tone).join(' ')

/** A CSS clamp(min, a rem + b vw, max) evaluated at a viewport width, in px. */
function clampAt(css: string, token: string, vw: number): number {
  const m = new RegExp(`--text-${token}: clamp\\(([\\d.]+)rem, ([\\d.]+)rem \\+ ([\\d.]+)vw, ([\\d.]+)rem\\);`).exec(css)
  if (!m) return NaN
  const [min, a, b, max] = m.slice(1).map(Number)
  return Math.min(max * 16, Math.max(min * 16, a * 16 + (b * vw) / 100))
}

function lum(hex: string) {
  const c = hex.replace('#', '').match(/../g)!.map((x) => parseInt(x, 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)))
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
}
const ratio = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }
const mix = (fg: string, bg: string, alpha: number) => '#' + [0, 2, 4].map((i) => Math.round(parseInt(fg.slice(1 + i, 3 + i), 16) * alpha + parseInt(bg.slice(1 + i, 3 + i), 16) * (1 - alpha)).toString(16).padStart(2, '0')).join('')

async function main() {
  const { he } = require(join(ROOT, 'lib/i18n/public/he.ts'))
  const { en } = require(join(ROOT, 'lib/i18n/public/en.ts'))
  const landingHe = require(join(ROOT, 'lib/i18n/public/landing-he.ts')).landingHe
  const landingEn = require(join(ROOT, 'lib/i18n/public/landing-en.ts')).landingEn
  const nav = strip(read('components/PublicNav.tsx'))

  console.log('A) the menu says "free SITE check"')
  {
    const labelsOk = (h: any, e: any, lh: any, le: any) => h.nav.freeCheck === 'בדיקת אתר חינמית' && e.nav.freeCheck === 'Free site check'
      && lh.check.eyebrow === h.nav.freeCheck && le.check.eyebrow === e.nav.freeCheck
    check('A1: nav.freeCheck and the home free-check eyebrow read "בדיקת אתר חינמית" / "Free site check"', labelsOk(he, en, landingHe, landingEn))
    check('A2: the nav (desktop and mobile share one list) links /free-check with that label', /\{ href: `\$\{prefix\}\/free-check`, label: dict\.nav\.freeCheck \}/.test(nav))
    check('MUTATION CONTROL: the old "בדיקה חינמית" menu label is caught', !labelsOk({ ...he, nav: { ...he.nav, freeCheck: 'בדיקה חינמית' } }, en, landingHe, landingEn))
    check('MUTATION CONTROL: the old English "Free check" is caught', !labelsOk(he, { ...en, nav: { ...en.nav, freeCheck: 'Free check' } }, landingHe, landingEn))
  }

  console.log('\nB) contact: nav menu, mobile rows, footer, About close, floating button')
  {
    const { contactChannels, WHATSAPP_NUMBER, PHONE_TEL } = require(join(ROOT, 'components/public/contact.ts'))
    const chOk = (list: any[], lang: 'he' | 'en') => list.map((c) => c.id).join(',') === 'whatsapp,phone,email'
      && list[0].href.startsWith(`https://wa.me/${WHATSAPP_NUMBER}?text=`) && list[0].external === true
      && list[1].href === PHONE_TEL && list[2].href === 'mailto:oren@gotop.co.il'
      && (lang === 'en' ? !HEBREW.test(decodeURIComponent(list[0].href)) && !HEBREW.test(JSON.stringify(list)) : HEBREW.test(decodeURIComponent(list[0].href)))
    check('B1: one list, WhatsApp → phone → email, the existing number and address; the English WhatsApp message is English',
      chOk(contactChannels(he.contact), 'he') && chOk(contactChannels(en.contact), 'en'))
    check('MUTATION CONTROL: an English site opening WhatsApp with the Hebrew message is caught',
      !chOk(contactChannels({ ...en.contact, whatsappMessage: he.contact.whatsappMessage }), 'en'))
    const navOk = (src: string) => /<ContactMenu locale=\{locale\} linkClassName=\{linkClass\(false\)\} \/>\s*<\/nav>/.test(src)
      && /<ContactRows locale=\{locale\} onPick=\{\(\) => setMobileOpen\(false\)\} \/>/.test(src)
      && /\{dict\.nav\.contact\}/.test(src)
    check('B2: the desktop nav ends with the contact menu, and the mobile menu lists the same rows under a "צרו קשר" heading', navOk(nav))
    check('MUTATION CONTROL: a nav without the contact item is caught', !navOk(nav.replace('<ContactMenu locale={locale} linkClassName={linkClass(false)} />', '')))

    const { ContactRows } = require(join(ROOT, 'components/public/ContactMenu.tsx'))
    const rows = (l: 'he' | 'en') => renderToStaticMarkup(createElement(ContactRows as never, { locale: l } as never) as never)
    const rowsOk = (html: string, lang: 'he' | 'en') => (html.match(/data-contact-channel="(whatsapp|phone|email)"/g) ?? []).length === 3
      && /href="https:\/\/wa\.me\/972549489377[^"]*" target="_blank" rel="noopener noreferrer"/.test(html)
      && html.includes('href="tel:+972549489377"') && html.includes('href="mailto:oren@gotop.co.il"')
      && (lang === 'he' ? html.includes('טלפון') && html.includes('מייל') : !HEBREW.test(html.replace(/text=[^"]*/, '')) && html.includes('Call') && html.includes('Email'))
    check('B3: the rows render the three channels in each language (English fully English)', rowsOk(rows('he'), 'he') && rowsOk(rows('en'), 'en'))
    check('MUTATION CONTROL: a Hebrew word in the English rows is caught', !rowsOk(rows('en').replace('Email', 'מייל'), 'en'))

    const { Footer } = require(join(ROOT, 'components/Footer.tsx'))
    const footer = (l: 'he' | 'en') => renderToStaticMarkup(createElement(Footer as never, { locale: l } as never) as never)
    const footOk = (html: string) => { const wa = html.indexOf('data-footer-whatsapp'), mail = html.indexOf('mailto:oren@gotop.co.il'), tel = html.indexOf('tel:0549489377')
      return wa !== -1 && mail > wa && tel > wa && /href="https:\/\/wa\.me\/972549489377/.test(html) }
    check('B4: the footer\'s contact column starts with WhatsApp, then the email and the phone', footOk(footer('he')) && footOk(footer('en')))
    check('MUTATION CONTROL: a footer without the WhatsApp row is caught', !footOk(footer('he').replace('data-footer-whatsapp', 'data-x')))
    // The credit to the agency site (the owner, 2026-09-29): a plain, followed link to https://gotop.co.il.
    const creditOk = (html: string, text: string) => { const m = /<a href="https:\/\/gotop\.co\.il"([^>]*)data-footer-credit="[^"]*">([^<]*)<\/a>/.exec(html)
      return !!m && m[2] === text && !/rel="[^"]*nofollow/.test(m[1]) }
    check('B4b: the footer credits "מבית GO TOP" / "By GO TOP", a followed link to https://gotop.co.il', creditOk(footer('he'), 'מבית GO TOP') && creditOk(footer('en'), 'By GO TOP'))
    check('MUTATION CONTROL: a nofollow credit is caught', !creditOk(footer('he').replace('<a href="https://gotop.co.il"', '<a href="https://gotop.co.il" rel="nofollow"'), 'מבית GO TOP'))

    const widgets = strip(read('components/public/PublicSiteWidgets.tsx'))
    const floatOk = /<WhatsAppFloat hidden=\{cookieOpen\} \/>/.test(widgets) && /<MobileContactBar \/>/.test(widgets)
      && /href=\{whatsappHelpUrl\(t\.whatsappMessage\)\}/.test(strip(read('components/public/WhatsAppFloat.tsx')))
      && /href=\{whatsappHelpUrl\(t\.whatsappMessage\)\}/.test(strip(read('components/public/MobileContactBar.tsx')))
    check('B5: the floating WhatsApp button and the phone contact bar stay, in the page\'s language', floatOk)
  }

  console.log('\nC) the rhythm of dark, light and cobalt bands')
  const { LandingPage } = require(join(ROOT, 'components/public/LandingPage.tsx'))
  const heAbout = require(join(ROOT, 'app/(public)/about/page.tsx'))
  const enAbout = require(join(ROOT, 'app/(public)/en/about/page.tsx'))
  const home: Record<string, string> = {}
  const about: Record<string, string> = {}
  for (const l of ['he', 'en'] as const) {
    PATHNAME = l === 'en' ? '/en' : '/'
    home[l] = renderToStaticMarkup(createElement(LandingPage as never, { locale: l, copy: l === 'he' ? landingHe : landingEn, signedIn: false, signupHref: l === 'he' ? '/signup?lang=he' : '/en/signup', pricingHref: l === 'he' ? '/pricing' : '/en/pricing' } as never) as never)
    PATHNAME = l === 'en' ? '/en/about' : '/about'
    about[l] = renderToStaticMarkup(createElement((l === 'he' ? heAbout : enAbout).default as never) as never)
  }
  {
    const HOME = 'D S C D E D E D E D'
    const ABOUT = 'D S D C D C'
    check(`C1: the home bands are ${HOME} in both languages`, tones(home.he) === HOME && tones(home.en) === HOME, `${tones(home.he)} / ${tones(home.en)}`)
    const fromFlow = (t: string) => t.split(' ').slice(4)
    const noTwins = (t: string[]) => t.every((x, i) => i === 0 || x !== t[i - 1])
    check('C2: from the four-step flow down NOTHING is light (owner) and no two neighbouring bands share a tone (E D E D E D)', noTwins(fromFlow(tones(home.he))) && fromFlow(tones(home.he)).join(' ') === 'E D E D E D' && !/[CS]/.test(fromFlow(tones(home.he)).join('')) && fromFlow(tones(home.en)).join(' ') === 'E D E D E D')
    check(`C3: About is ${ABOUT} (no longer a light hero and four light card grids)`, tones(about.he) === ABOUT && tones(about.en) === ABOUT, `${tones(about.he)} / ${tones(about.en)}`)
    check('MUTATION CONTROL: the old all-light flow-to-FAQ run is caught',
      tones(home.he.replace(/class="relative isolate overflow-hidden bg-contrast py-16/, 'class="relative isolate overflow-hidden bg-surface py-16')) !== HOME)
    check('MUTATION CONTROL: an About band turned light again is caught', tones(about.he.replace('data-about-gaps', 'x').replace(/bandBloom relative isolate overflow-hidden bg-contrast/, 'bandBloom relative isolate overflow-hidden bg-canvas')) !== ABOUT)
    const invOk = (src: string) => /<PublicNav locale=\{locale\} tone="inverse" \/>/.test(strip(src))
    check('C4: home and About put the nav in its inverse tone over their navy heroes', invOk(read('components/public/LandingPage.tsx')) && invOk(read('components/public/AboutPage.tsx')))
    const scrollOk = (src: string) => /const scrollThreshold = tone === 'inverse' \? 80 : 8/.test(src) && /const onDark = tone === 'inverse' && !scrolled && !mobileOpen/.test(src)
    check('C5: the inverse nav is white ink over the hero and turns canvas with a blur after 80px of scroll', scrollOk(nav))
    check('MUTATION CONTROL: a nav that stays transparent-white while the menu is open is caught', !scrollOk(nav.replace(' && !mobileOpen', '')))
    const heroOk = (html: string) => /<h1 class="text-hero text-contrast-ink">/.test(html) && html.indexOf('data-hero-signals') > html.indexOf('<h1')
    check('C6: the home hero: the text-hero headline in light ink, the signal stack at its end', heroOk(home.he) && heroOk(home.en))
    // Software terms, not agency service phrasing (the owner, 2026-09-29: the SaaS site must not compete with gotop.co.il).
    check('C7: the About hero: text-hero-page, the agreed software headline ("11 שנה של קידום אתרים, במערכת אחת שעובדת בשבילכם.")', /<h1 class="text-hero-page text-balance text-contrast-ink">11 שנה של קידום אתרים,<span class="block text-rail-tagline">במערכת אחת שעובדת בשבילכם\.<\/span>/.test(about.he)
      && about.en.includes('11 years of SEO,<span class="block text-rail-tagline">in one platform that works for you.</span>'))
    const AGENCY = /חברת קידום|שירותי קידום|SEO agency|SEO services/i
    const h1s = (html: string) => (/<h1[\s\S]*?<\/h1>/.exec(html)?.[0] ?? '')
    check('C7b: no hero headline on home or About uses agency service phrasing', [home.he, home.en, about.he, about.en].every((h) => !AGENCY.test(h1s(h))))
    check('MUTATION CONTROL: a "חברת קידום אתרים" headline is caught', AGENCY.test(h1s(about.he.replace('11 שנה של קידום אתרים,', 'חברת קידום אתרים,'))))
    const aboutContact = (html: string) => (html.slice(html.indexOf('data-about-contact')).match(/data-contact-channel="(whatsapp|phone|email)"/g) ?? []).length === 3
    check('C8: the About close offers WhatsApp, call and email as three buttons', aboutContact(about.he) && aboutContact(about.en))
    const hebrewIn = (html: string) => (html.replace(/text=[^"&]*/g, '').replace(/<a [^>]*hrefLang="he"[^>]*>[\s\S]*?<\/a>/gi, '').match(/[^<>]*[\u0590-\u05FF][^<>]*/g) ?? [])
    check('C9: the English pages carry no Hebrew outside the language switch', hebrewIn(about.en).length === 0 && hebrewIn(home.en).length === 0,
      JSON.stringify([...hebrewIn(home.en), ...hebrewIn(about.en)].slice(0, 4)))
    check('MUTATION CONTROL: a Hebrew word on the English About is caught', hebrewIn(about.en.replace('>Email<', '>מייל<')).length === 1)
  }

  console.log('\nD) type: the marketing steps')
  {
    const css = read('app/globals.css')
    const at = (t: string, w: number) => Math.round(clampAt(css, t, w))
    const sizesOk = (c: string) => [['hero', 32, 54], ['hero-page', 34, 56], ['h2-mkt', 28, 44], ['lead-mkt', 17, 21], ['numeral', 44, 56]]
      .every(([t, a, b]) => Math.round(clampAt(c, t as string, 390)) === a && Math.round(clampAt(c, t as string, 1440)) === b)
    check(`D1: hero ${at('hero', 390)}→${at('hero', 1440)}, About ${at('hero-page', 390)}→${at('hero-page', 1440)}, section ${at('h2-mkt', 390)}→${at('h2-mkt', 1440)}, lead ${at('lead-mkt', 390)}→${at('lead-mkt', 1440)}, numerals ${at('numeral', 390)}→${at('numeral', 1440)} px`, sizesOk(css))
    check('MUTATION CONTROL: the old 76px hero at 1440 (the owner found it huge) is caught', !sizesOk(css.replace('clamp(2rem, 1.4893rem + 2.0952vw, 3.5rem)', 'clamp(2.5rem, 1.6643rem + 3.4286vw, 4.75rem)')))
    const { cn } = require(join(ROOT, 'lib/utils.ts'))
    const mergeOk = ['hero', 'hero-page', 'h2-mkt', 'lead-mkt', 'numeral', 'eyebrow'].every((t) => cn(`text-${t} text-ink`) === `text-${t} text-ink`)
    check('D2: tailwind-merge keeps a marketing size beside a colour (it does not drop text-hero for text-ink)', mergeOk)
    const tracked = (src: string) => (strip(src).match(/(?<![a-z]:)(?:\buppercase\b|\btracking-wide\b)/g) ?? []).length
    const files = ['components/public/LandingPage.tsx', 'components/public/AboutPage.tsx', 'components/public/marketing.tsx']
    check('D3: no eyebrow on home, About or the shared intro is uppercased or tracked wider in Hebrew (ltr: only)', files.every((f) => tracked(read(f)) === 0), files.map((f) => tracked(read(f))).join(','))
    check('MUTATION CONTROL: a bare "uppercase tracking-wide" eyebrow is caught', tracked('<p className="text-overline uppercase tracking-wide">') === 2)
  }

  console.log('\nE) the rank climb')
  {
    const uses = (html: string) => (html.match(/data-rank-climb="([a-z]+)"/g) ?? []).map((m) => m.slice(17, -1)).join(',')
    check('E1: exactly three uses on the home page: hero, flow, close (and none on About)', uses(home.he) === 'hero,flow,cta' && uses(home.en) === 'hero,flow,cta' && uses(about.he) === '', `${uses(home.he)} | ${uses(about.he)}`)
    const flowInside = home.he.indexOf('data-flow="static"') !== -1 && home.he.indexOf('data-rank-climb="flow"') > home.he.indexOf('data-flow="static"')
    check('E2: the flow\'s climb sits inside the Flow frame, so it draws as the section scrolls in', flowInside)
    const paths = [...home.he.matchAll(/data-rank-climb="[a-z]+"[\s\S]*?<path d="([^"]+)"/g)].map((m) => m[1])
    const stepsOnly = (ds: string[]) => ds.length === 3 && ds.every((d) => /^M[\d.]+ [\d.]+( [HV][\d.]+)+$/.test(d) && /V/.test(d))
    check('E3: every climb is steps only (horizontal and vertical segments, never a curve)', stepsOnly(paths), paths.join(' | ').slice(0, 200))
    check('MUTATION CONTROL: a smooth curve is caught', !stepsOnly([paths[0], paths[1], 'M0 10 C 20 20 40 0 60 10']))
    const lcss = read('components/public/landing/landing.module.css').replace(/\/\*[\s\S]*?\*\//g, '')
    const drawOk = (c: string) => {
      const noPref = c.split(/@media \(prefers-reduced-motion: no-preference\)/)
      const outside = noPref[0] + noPref.slice(1).map((chunk) => { let depth = 0; for (let i = 0; i < chunk.length; i++) { if (chunk[i] === '{') depth++; if (chunk[i] === '}') { depth--; if (depth === 0) return chunk.slice(i + 1) } } return '' }).join('')
      return /\.climbPath \{\s*stroke-dasharray: 1;\s*stroke-dashoffset: 0;\s*\}/.test(c)
        && !/\.climbDraw\s*\{[^}]*animation/.test(outside) && !/\.climbFlow\s*\{[^}]*stroke-dashoffset: 1/.test(outside)
        && /\.climbDraw \{\s*animation: climb-draw/.test(c)
    }
    check('E4: whole at rest (dashoffset 0); the draw runs only under prefers-reduced-motion: no-preference', drawOk(lcss))
    check('MUTATION CONTROL: a draw outside the media query (a reduced-motion visitor would see it animate) is caught', !drawOk(lcss + '\n.climbDraw { animation: climb-draw 2s both; }\n'))
    check('MUTATION CONTROL: a climb that rests undrawn is caught', !drawOk(lcss.replace(/(\.climbPath \{\s*stroke-dasharray: 1;\s*)stroke-dashoffset: 0;/, '$1stroke-dashoffset: 1;')))
  }

  console.log('\nF) contrast on the dark and cobalt bands (AA 4.5:1)')
  {
    const css = read('app/globals.css')
    const tok = (n: string) => new RegExp(`--color-${n}: (#[0-9a-f]{6});`).exec(css)![1]
    const action = tok('action'), actionInk = tok('action-ink'), navy = tok('contrast'), ink = tok('contrast-ink')
    check(`F1: white on the cobalt band ${ratio(actionInk, action).toFixed(2)}:1`, ratio(actionInk, action) >= 4.5)
    const alphas = ['components/public/LandingPage.tsx', 'components/public/AboutPage.tsx', 'components/public/landing/HeroSignals.tsx']
      .flatMap((f) => [...strip(read(f)).matchAll(/text-contrast-ink\/(\d+)/g)].map((m) => Number(m[1])))
    const faintest = Math.min(...alphas)
    const worst = ratio(mix(ink, navy, faintest / 100), navy)
    check(`F2: the faintest light text on navy (contrast-ink/${faintest}) is ${worst.toFixed(2)}:1`, worst >= 4.5)
    check('MUTATION CONTROL: contrast-ink/40 on navy is caught', ratio(mix(ink, navy, 0.4), navy) < 4.5)
    const brandTextOk = (src: string) => !/data-check-tone="brand"[\s\S]{0,4000}text-action-ink\/\d/.test(strip(src))
    check('F3: every text on the cobalt band is full white (no faded white below 4.5:1)', brandTextOk(read('components/public/LandingPage.tsx')))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}
main().catch((e) => { console.error(e); process.exit(1) })

export {}
