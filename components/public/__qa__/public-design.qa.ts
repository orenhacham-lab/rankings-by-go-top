/**
 * WP5 — the public site and /free-check stay on the app's design tokens (§13).
 *
 * Source guards, comments stripped before matching:
 *   A) no raw Tailwind palette, gradient text, off-scale type/radius/shadow,
 *      looping attention animation or emoji/arrow glyph in any public file;
 *   B) every feature page is its metadata plus the one FeaturePage template,
 *      and every legal document uses the one LegalDoc layout;
 *   C) pricing: ONE primary button (the recommended plan), no scaled card;
 *   D) the overlays never sit on the hero: on a phone the cookie notice is a
 *      slim sheet laid exactly over the contact bar's strip (with bottom padding
 *      for anything it needs beyond it), and both keep the start slot free for
 *      the accessibility button, which docks there instead of floating over the
 *      hero's buttons; from md the notice is a corner card (WhatsApp steps
 *      aside), and from 1400px it sits in the top end margin beside the centred
 *      hero instead of over its product frame (final review R27).
 *   E) the landing's feature rows alternate text and picture (wave 7; the old
 *      five-reason grid's rule moved to landing-page.qa.ts, group C).
 * Each group ends with a MUTATION CONTROL: the same check run on a deliberately
 * broken copy of the source must fail.
 *
 * Run: npx tsx components/public/__qa__/public-design.qa.ts
 */
import { readdirSync, readFileSync, statSync } from 'fs'
import { join, relative } from 'path'
import { he as publicHe } from '../../../lib/i18n/public/he'
import { en as publicEn } from '../../../lib/i18n/public/en'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1').replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
function walk(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(join(ROOT, dir))) {
    const full = join(ROOT, dir, entry)
    if (entry === '__qa__' || entry === 'node_modules') continue
    if (statSync(full).isDirectory()) out.push(...walk(relative(ROOT, full)))
    else if (/\.(ts|tsx)$/.test(entry)) out.push(relative(ROOT, full))
  }
  return out
}

const PUBLIC_FILES = [
  'app/page.tsx',
  ...walk('app/(public)'),
  ...walk('app/(legal)'),
  ...walk('components/public'),
  ...walk('components/free-check'),
  'components/PublicNav.tsx',
  'components/Footer.tsx',
  'components/CookieConsent.tsx',
  'components/LanguageSwitcher.tsx',
  'components/Breadcrumbs.tsx',
]

const PALETTE = 'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose'
const OFF_TOKEN: { label: string; re: RegExp }[] = [
  { label: 'raw palette colour', re: new RegExp(`\\b(?:bg|text|border|ring|from|to|via|fill|stroke|divide|placeholder|outline|decoration|shadow)-(?:${PALETTE})-\\d{2,3}\\b`) },
  { label: 'bare white/black utility', re: /\b(?:bg|text|border)-(?:white|black)\b(?!\/)/ },
  { label: 'gradient fill or gradient text', re: /\bbg-gradient-to-|\bbg-clip-text\b/ },
  { label: 'dark: twin (tokens already switch)', re: /\bdark:/ },
  { label: 'off-scale type size', re: /\btext-(?:xs|sm|base|lg|xl|[2-9]xl)\b|\btext-\[\d/ },
  { label: 'off-scale radius', re: /\brounded-(?:sm|md|lg|xl|2xl|3xl|full)\b/ },
  { label: 'off-scale shadow', re: /\bshadow-(?:sm|md|lg|xl|2xl)\b/ },
  { label: 'attention animation / scale-on-hover / transition-all', re: /\banimate-(?:pulse|ping|bounce)\b|\bhover:scale-|\btransition-all\b/ },
  // ✓ ✗ ★ arrows and pictographs: status is a lucide icon, never a glyph.
  { label: 'emoji or glyph icon', re: /[←-⇿☀-➿⬀-⯿✓✗★]|[\u{1F300}-\u{1FAFF}]/u },
]
function offTokens(src: string): string[] {
  const s = strip(src)
  return OFF_TOKEN.filter(({ re }) => re.test(s)).map(({ label, re }) => `${label}: ${(re.exec(s) ?? [''])[0]}`)
}

function main() {
  console.log('A) public files stay on tokens')
  {
    const offenders = PUBLIC_FILES.flatMap((f) => offTokens(read(f)).map((o) => `${f} → ${o}`))
    check(`A1: none of ${PUBLIC_FILES.length} public files uses an off-token class, gradient text or glyph icon`,
      offenders.length === 0, offenders.slice(0, 6).join(' | '))
    check('A2: the file list really covers the site (pages, feature pages, widgets, free check)',
      PUBLIC_FILES.length >= 50 && PUBLIC_FILES.includes('components/free-check/FreeCheckExperience.tsx')
      && PUBLIC_FILES.includes('app/(public)/en/features/keyword-research/page.tsx'), String(PUBLIC_FILES.length))
    const hero = read('components/public/FeaturePage.tsx')
    check('MUTATION CONTROL: a text-blue-600 accent is caught', offTokens(hero + '\n<span className="text-blue-600">x</span>').length === 1)
    check('MUTATION CONTROL: gradient headline text is caught', offTokens('<span className="bg-gradient-to-r from-action to-info bg-clip-text">x</span>').length === 1)
    check('MUTATION CONTROL: a ✓ glyph list item is caught', offTokens('<li>✓ Reports</li>').length === 1)
    check('MUTATION CONTROL: the old 🍪 cookie emoji is caught', offTokens('<span>🍪</span>').length === 1)
    check('MUTATION CONTROL: rounded-2xl + shadow-xl card is caught', offTokens('<div className="rounded-2xl shadow-xl" />').length === 2)
    check('…while the same text inside a comment is ignored', offTokens('// was text-blue-600 and ✓\n<div className="text-action" />').length === 0)
  }

  console.log('\nB) one template for the feature pages, one layout for the documents')
  const FEATURES = ['ai-visibility-tracking', 'google-organic-rank-tracking', 'google-maps-rank-tracking', 'seo-geo-reports',
    'keyword-research', 'seo-geo-content-publishing']
  const featurePages = FEATURES.flatMap((f) => [`app/(public)/features/${f}/page.tsx`, `app/(public)/en/features/${f}/page.tsx`])
  const usesTemplate = (src: string, locale: string) => {
    const s = strip(src)
    return /export const metadata/.test(s) && new RegExp(`<FeaturePage locale="${locale}" content=\\{CONTENT\\} />`).test(s)
      && !/<section\b/.test(s)
  }
  {
    const bad = featurePages.filter((p) => !usesTemplate(read(p), p.includes('/en/') ? 'en' : 'he'))
    check(`B1: all ${featurePages.length} feature pages keep their metadata and render the FeaturePage template`, bad.length === 0, bad.join(', '))
    const DOCS: [string, string][] = [
      ['app/(public)/terms/page.tsx', 'he'], ['app/(public)/en/terms/page.tsx', 'en'],
      ['app/(legal)/privacy/page.tsx', 'he'], ['app/(public)/en/privacy/page.tsx', 'en'],
      ['app/(legal)/accessibility/page.tsx', 'he'], ['app/(public)/en/accessibility/page.tsx', 'en'],
    ]
    const docs = DOCS.filter(([p, l]) => !new RegExp(`<LegalDoc\\s+locale="${l}"`).test(strip(read(p))) || /className="(?!mt-\d")/.test(strip(read(p))))
    check('B2: the six legal documents use LegalDoc and carry no styling of their own (spacing only)', docs.length === 0, docs.map(([p]) => p).join(', '))
    const sitemaps = ['app/(public)/sitemap/page.tsx', 'app/(public)/en/sitemap/page.tsx'].filter((p) => !/<LegalFrame\b/.test(read(p)))
    check('B3: both sitemaps sit in the same document frame', sitemaps.length === 0, sitemaps.join(', '))
    const organic = read(featurePages[1])
    check('MUTATION CONTROL: a feature page that hand-builds a <section> again is caught',
      !usesTemplate(organic.replace('export default function', '<section />\nexport default function'), 'he'))
    check('MUTATION CONTROL: a feature page that drops its metadata is caught',
      !usesTemplate(organic.replace('export const metadata', 'const metadata'), 'he'))
  }

  console.log('\nC) pricing: one primary button, on the recommended plan')
  const pricingOk = (src: string) => {
    const s = strip(src)
    return (s.match(/variant=\{highlighted \? 'primary' : 'secondary'\}/g) ?? []).length === 1
      && !/\bscale-\d|lg:scale-/.test(s)
      && /const HIGHLIGHTED_PLAN: PlanCode = 'advanced'/.test(s)
  }
  {
    for (const p of ['app/(public)/pricing/page.tsx', 'app/(public)/en/pricing/page.tsx']) {
      check(`C1: ${p} gives the plan grid exactly one primary (the highlighted plan) and no scaled card`, pricingOk(read(p)))
    }
    const he = read('app/(public)/pricing/page.tsx')
    check('MUTATION CONTROL: every card primary again is caught',
      !pricingOk(he.replace("variant={highlighted ? 'primary' : 'secondary'}", "variant=\"primary\"")))
    check('MUTATION CONTROL: the old lg:scale-105 highlighted card is caught',
      !pricingOk(he.replace("'relative flex flex-col", "'relative lg:scale-105 flex flex-col")))
  }

  console.log('\nD) the overlays never sit on the hero')
  const SLOT = 'ps-[4.25rem]'
  const DOCKED = "'bottom-[calc(0.75rem+env(safe-area-inset-bottom,0px))] md:bottom-24'"
  const overlaysOk = (widgets: string, cookie: string, a11y: string, whatsapp: string, bar: string) => {
    const w = strip(widgets), c = strip(cookie), a = strip(a11y), wa = strip(whatsapp), b = strip(bar)
    return /<WhatsAppFloat hidden=\{cookieOpen\} \/>/.test(w)
      && /<AccessibilityWidget \/>/.test(w)
      && /<CookieConsent onOpenChange=\{setCookieOpen\} \/>/.test(w)
      // phone: a slim sheet over the contact bar's strip, the start slot left for the accessibility button
      && /inset-x-0 bottom-0 flex items-center gap-3 rounded-t-card/.test(c) && c.includes(SLOT) && /z-\[58\]/.test(c)
      && /md:end-6/.test(c) && /md:max-\[1399px\]:bottom-6/.test(c)
      // 1400px+: the top end margin beside the hero, not over its product frame
      && /min-\[1400px\]:bottom-auto min-\[1400px\]:top-24/.test(c)
      // bottom padding while the sheet shows, for what it needs beyond the bar
      && /body\.style\.paddingBottom = phone \? `\$\{Math\.max\(0, sheet\.offsetHeight - barH\)\}px` : ''/.test(c)
      && /onOpenChange\?\.\(/.test(c)
      // the accessibility button: 40px, start corner, docked in the strip below md, floating from md
      && /fixed start-4 z-\[60\] flex size-10/.test(a) && a.includes(DOCKED) && !/\braised\b/.test(a)
      // the contact bar keeps the same slot free, under the sheet
      && b.includes(SLOT) && /z-\[55\]/.test(b) && /md:hidden/.test(b)
      && /if \(hidden\) return null/.test(wa)
  }
  {
    const widgets = read('components/public/PublicSiteWidgets.tsx')
    const cookie = read('components/CookieConsent.tsx')
    const a11y = read('components/public/AccessibilityWidget.tsx')
    const whatsapp = read('components/public/WhatsAppFloat.tsx')
    const bar = read('components/public/MobileContactBar.tsx')
    check('D1: sheet, contact bar and accessibility button share one bottom strip; the desktop card clears the hero', overlaysOk(widgets, cookie, a11y, whatsapp, bar))
    check('D2: the contact bar stays under the cookie sheet (z-55 < z-58)', /z-\[55\]/.test(strip(bar)))
    check('MUTATION CONTROL: WhatsApp no longer stepping aside is caught',
      !overlaysOk(widgets.replace('<WhatsAppFloat hidden={cookieOpen} />', '<WhatsAppFloat />'), cookie, a11y, whatsapp, bar))
    check('MUTATION CONTROL: the accessibility button floating over the hero again (bottom-48 over the sheet) is caught',
      !overlaysOk(widgets, cookie, a11y.replace(DOCKED, "raised ? 'bottom-48 sm:bottom-24' : 'bottom-24'"), whatsapp, bar))
    check('MUTATION CONTROL: a contact bar that no longer keeps the slot free is caught',
      !overlaysOk(widgets, cookie, a11y, whatsapp, bar.replace(SLOT, 'px-4')))
    check('MUTATION CONTROL: the desktop card back in the bottom corner over the hero frame is caught',
      !overlaysOk(widgets, cookie.replace("'min-[1400px]:bottom-auto min-[1400px]:top-24',", ''), a11y, whatsapp, bar))
    check('MUTATION CONTROL: no bottom padding while the sheet shows is caught',
      !overlaysOk(widgets, cookie.replace("body.style.paddingBottom = phone ?", 'void (phone ?'), a11y, whatsapp, bar))
    check('MUTATION CONTROL: a full-width phone banner without the sheet shape is caught',
      !overlaysOk(widgets, cookie.replace('rounded-t-card', 'rounded-none'), a11y, whatsapp, bar))
    const short = (l: 'he' | 'en') => (l === 'he' ? publicHe : publicEn).cookie.short
    const shortOk = (h: string, e: string) => [h, e].every((x) => x.length > 0 && x.length <= 60)
    check('D3: the phone sheet has its own short sentence (two lines beside the button), in both languages', shortOk(short('he'), short('en')), `${short('he').length}/${short('en').length}`)
    check('MUTATION CONTROL: the long desktop sentence in the phone sheet is caught', !shortOk('אנו משתמשים בעוגיות כדי לשפר את חוויית הגלישה. המשך השימוש באתר מהווה הסכמה לשימוש בהן בהתאם ל', short('en')))
  }

  console.log('\nE) the landing page\'s feature rows alternate their picture side (wave 7)')
  // The old five-reason grid is gone; its "no card alone on a row" rule now
  // guards the outcomes bento in landing-page.qa.ts (group C).
  const alternates = (src: string) => {
    const s = strip(src)
    return /<Rise className=\{cn\(i % 2 === 1 && 'lg:order-2'\)\}>/.test(s) && /<Rise delay=\{120\} className=\{cn\(i % 2 === 1 && 'lg:order-1'\)\}>\{visual\}<\/Rise>/.test(s)
      && /grid grid-cols-1 items-center gap-8 lg:grid-cols-2 lg:gap-14/.test(s)
  }
  {
    const landing = read('components/public/LandingPage.tsx')
    check('E1: text and picture swap sides on every other feature row (from lg), stacked on a phone', alternates(landing))
    check('MUTATION CONTROL: rows that all put the picture on the same side are caught', !alternates(landing.replace("className={cn(i % 2 === 1 && 'lg:order-2')}", 'className=""')))
    const noRail = (src: string) => !/border-s-\[?\d/.test(strip(src))
    check('E2: no start rail bends round a landing card', noRail(landing))
    check('MUTATION CONTROL: a rail on the "with Go Top" card is caught', !noRail(landing.replace('rounded-card border border-line bg-surface p-5 shadow-pop sm:p-6', 'rounded-card border border-line border-s-[3px] border-s-action bg-surface p-5 shadow-pop sm:p-6')))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}
main()

export {}
