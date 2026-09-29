/**
 * The twelve feature pages (wave 7): one template in the landing page's visual
 * language, the free check first, one language per page, honest pictures.
 *
 *   A) every page leads with the free site check and closes with it, then the
 *      trial, from the shared per-language calls to action;
 *   B) each page reads its own language: FEATURE_COMMON.<locale>, its own
 *      landing dictionary for the shared product pictures, no Hebrew on an
 *      English page and no English sentence on a Hebrew page;
 *   C) the template captions every product picture as an illustration, renders
 *      nothing waiting to be revealed (Rise starts 'static'), and uses the
 *      shared hero and CTA sweep;
 *   D) no page promises results or invents proof;
 *   E) the About page follows suit: the free check first in its hero and its
 *      close, from the same shared calls to action.
 * Each group ends with a MUTATION CONTROL.
 *
 * Run: npx tsx components/public/__qa__/feature-pages.qa.ts
 */
import { readFileSync } from 'fs'
import { join } from 'path'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const strip = (s: string) => s.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')

const FEATURES = ['ai-visibility-tracking', 'google-organic-rank-tracking', 'google-maps-rank-tracking', 'seo-geo-reports',
  'keyword-research', 'seo-geo-content-publishing']
const PAGES = FEATURES.flatMap((f) => [
  { rel: `app/(public)/features/${f}/page.tsx`, l: 'he' as const },
  { rel: `app/(public)/en/features/${f}/page.tsx`, l: 'en' as const },
])

/** The page's body after the metadata: that is what a visitor reads. */
const body = (src: string) => strip(src.slice(src.indexOf('export default function')))
/** String literals in the body (single-quoted, double-quoted and template), plus JSX text. */
function words(src: string): string[] {
  const b = body(src)
  const lits = [...b.matchAll(/'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g)].map((m) => m[1] ?? m[2] ?? m[3] ?? '')
  const jsx = [...b.matchAll(/<p>([^<]+)<\/p>/g)].map((m) => m[1])
  return [...lits, ...jsx].filter((s) => s.trim().length > 0)
}

function main() {
  console.log('A) the free check first, then the trial')
  const ctasOk = (src: string) => {
    const b = body(src)
    return /primary: C\.check,\s*secondary: C\.trial,/.test(b.slice(b.indexOf('hero: {'), b.indexOf('sections: [')))
      && /cta: \{[\s\S]*primary: C\.check,\s*secondary: C\.trial,/.test(b)
      && !/authHref\('signup'|'\/en\/signup'/.test(b)
  }
  const badA = PAGES.filter((p) => !ctasOk(read(p.rel))).map((p) => p.rel)
  check(`A1: all ${PAGES.length} pages lead and close with the free check, then the trial`, badA.length === 0, badA.join(', '))
  const common = read('lib/i18n/public/feature-common.ts')
  const commonOk = (common: string) =>
    /check: \{ label: [^\n]+href: '\/free-check' \}/.test(common) && /check: \{ label: [^\n]+href: '\/en\/free-check' \}/.test(common)
    && /trial: \{ label: [^\n]+href: authHref\('signup', 'he'\) \}/.test(common) && /trial: \{ label: [^\n]+href: '\/en\/signup' \}/.test(common)
    && /TRIAL_CATALOG\.days/.test(common) && !/\b7 ימי|7-day/.test(common)
  check('A2: the shared calls to action point at each language\'s own free check and signup', commonOk(common))
  check('MUTATION CONTROL: an English free check pointing at the Hebrew page is caught',
    !commonOk(common.replace("href: '/en/free-check'", "href: '/free-check'")))
  const ai = read(PAGES[0].rel)
  check('MUTATION CONTROL: a hero that leads with the trial is caught', !ctasOk(ai.replace('primary: C.check,\n    secondary: C.trial,', 'primary: C.trial,\n    secondary: C.check,')))

  console.log('\nB) one language per page')
  const ownLanguage = (src: string, l: 'he' | 'en') => {
    const s = strip(src)
    const other = l === 'he' ? 'en' : 'he'
    const imports = new RegExp(`FEATURE_COMMON\\.${l}\\b`).test(s) && !new RegExp(`FEATURE_COMMON\\.${other}\\b`).test(s)
      && !(l === 'he' ? /landingEn|landing-en/ : /landingHe|landing-he/).test(s)
    const w = words(src).filter((x) => !/^[@./]/.test(x) && !/^(he|en|medium|low|high|contrast|h2|h3|next|lucide-react)$/.test(x))
    const lang = l === 'en'
      ? w.every((x) => !/[֐-׿]/.test(x))
      // A Hebrew sentence may name a product (ChatGPT, WordPress…); an all-Latin sentence is English.
      : w.every((x) => /[֐-׿]/.test(x) || !/[a-z]{3,}\s+[a-z]{3,}\s+[a-z]{3,}/i.test(x))
    return imports && lang
  }
  const badB = PAGES.filter((p) => !ownLanguage(read(p.rel), p.l)).map((p) => p.rel)
  check(`B1: every page reads its own language's copy and shows only that language`, badB.length === 0, badB.join(', '))
  check('MUTATION CONTROL: an English sentence on a Hebrew page is caught',
    !ownLanguage(ai.replace("title: 'מה מקבלים',", "title: 'What you get here',").replace("eyebrow: 'מה מקבלים',", "eyebrow: 'What you get with this',"), 'he'))
  const aiEn = read(PAGES[1].rel)
  check('MUTATION CONTROL: a Hebrew page reading the English landing words is caught',
    !ownLanguage(ai.replace('landingHe', 'landingEn').replace("landing-he'", "landing-en'"), 'he'))
  check('MUTATION CONTROL: a Hebrew word on an English page is caught', !ownLanguage(aiEn.replace("eyebrow: 'Questions',", "eyebrow: 'שאלות',"), 'en'))

  console.log('\nC) the template: honest pictures, complete at rest, the landing language')
  const tpl = read('components/public/FeaturePage.tsx')
  const tplOk = (s0: string) => {
    const s = strip(s0)
    return /<figcaption[^>]*>\{VISUAL_CAPTION\[locale\]\}<\/figcaption>/.test(s)
      && /he: 'המחשה של המוצר\. שמות ונתונים לדוגמה\.'/.test(s) && /en: 'Product illustration\. Names and figures are examples\.'/.test(s)
      && /<MarketingHero/.test(s) && !/<PageHero/.test(s) && !/components\/ui\/motion/.test(s)
      && (s.match(/arrow className=\{styles\.cta\}/g) ?? []).length === 2
  }
  check('C1: every picture is captioned as an illustration; shared hero, Rise and the CTA sweep', tplOk(tpl))
  const motion = read('components/public/landing/motion.tsx')
  check('C2: Rise starts static, so the server render is complete', /useState<Entrance>\('static'\)/.test(motion))
  check('MUTATION CONTROL: a picture without its caption is caught', !tplOk(tpl.replace('{VISUAL_CAPTION[locale]}', '')))

  console.log('\nD) no promised results, no invented proof')
  const PROMISE = [/guaranteed/i, /מובטח/, /#1\b/, /\d[\d,]*\+\s*(customers|businesses|clients|לקוחות|עסקים)/i, /trusted by/i, /מדויק לחלוטין/, /100%/]
  const honest = (src: string) => !PROMISE.some((re) => re.test(words(src).join('\n')))
  const badD = PAGES.filter((p) => !honest(read(p.rel))).map((p) => p.rel)
  check('D1: no page promises a ranking or claims customers it cannot show', badD.length === 0, badD.join(', '))
  check('MUTATION CONTROL: a "guaranteed first page" line is caught', !honest(aiEn.replace("title: 'Find out what ChatGPT says about your field',", "title: 'Guaranteed first page in 30 days',")))

  console.log('\nE) the About page: the free check first, too')
  const about = read('components/public/AboutPage.tsx')
  const aboutOk = (src: string) => {
    const s = strip(src)
    const pairs = [...s.matchAll(/<ButtonLink href=\{c\.(check|trial)\.href\}/g)].map((m) => m[1])
    return /const c = FEATURE_COMMON\[locale\]/.test(s) && pairs.join(',') === 'check,trial,check,trial'
      && !/<PageHero|components\/ui\/motion|signupHref/.test(s)
  }
  check('E1: the About hero and close lead with the free check, then the trial', aboutOk(about))
  check('MUTATION CONTROL: an About close that leads with the trial is caught',
    !aboutOk(about.replace(/(<CtaBand[\s\S]*?)<ButtonLink href=\{c\.check\.href\}([\s\S]*?)<ButtonLink href=\{c\.trial\.href\}/, '$1<ButtonLink href={c.trial.href}$2<ButtonLink href={c.check.href}')))

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}

main()

export {}
