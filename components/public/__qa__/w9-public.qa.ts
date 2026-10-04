/**
 * Wave 9 public items: the home hero's proportions, the recoloured bands, the
 * product's name (Go Top SEO) and the sign-up fields.
 *
 * Source guards with comments stripped; every group ends with a MUTATION
 * CONTROL (the same predicate on a deliberately broken copy must fail).
 *
 * Run: npx tsx components/public/__qa__/w9-public.qa.ts
 */
import { readdirSync, readFileSync, statSync } from 'fs'
import { join, relative } from 'path'
import { landingHe } from '../../../lib/i18n/public/landing-he'
import { landingEn } from '../../../lib/i18n/public/landing-en'
import { PUBLIC_LOCALES } from '../../../lib/i18n/locales'

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
    if (entry === '__qa__' || entry === 'node_modules' || entry === '.next') continue
    if (statSync(full).isDirectory()) out.push(...walk(relative(ROOT, full)))
    else if (/\.(ts|tsx|txt|xml)$/.test(entry)) out.push(relative(ROOT, full))
  }
  return out
}
/** A CSS clamp(min, a rem + b vw, max) evaluated at a viewport width, in px. */
function clampAt(css: string, token: string, vw: number): number {
  const m = new RegExp(`--text-${token}: clamp\\(([\\d.]+)rem, ([\\d.]+)rem \\+ ([\\d.]+)vw, ([\\d.]+)rem\\);`).exec(css)
  if (!m) return NaN
  const [min, a, b, max] = m.slice(1).map(Number)
  return Math.min(max * 16, Math.max(min * 16, a * 16 + (b * vw) / 100))
}

function main() {
  console.log('A) the hero: proportions, the badge first, a clear check form and trial button')
  {
    const css = read('app/globals.css')
    const sizeOk = (c: string) => { const a = clampAt(c, 'hero', 1440), b = clampAt(c, 'hero', 390); return a >= 52 && a <= 56 && b >= 32 && b <= 34 }
    check(`A1: the headline is ${Math.round(clampAt(css, 'hero', 1440))}px at 1440 and ${Math.round(clampAt(css, 'hero', 390))}px at 390`, sizeOk(css))
    check('MUT: the old 76px headline fails A1', !sizeOk(css.replace('clamp(2rem, 1.4893rem + 2.0952vw, 3.5rem)', 'clamp(2.5rem, 1.6643rem + 3.4286vw, 4.75rem)')))
    const marketing = strip(read('components/public/marketing.tsx'))
    const landing = strip(read('components/public/LandingPage.tsx'))
    const form = strip(read('components/free-check/FreeCheckHeroForm.tsx'))
    const badgeOk = (m: string, l: string) => /prominent \? 'min-h-10[^']*text-copy font-bold sm:h-11[^']*sm:text-lead'/.test(m)
      && /border-contrast-ink bg-contrast-ink text-contrast/.test(m) && /<Eyebrow icon=\{Sparkles\} inverse prominent>\{copy\.hero\.eyebrow\}/.test(l)
    check('A2: the hero badge is a prominent solid pill (bigger, light on navy, bold)', badgeOk(marketing, landing))
    check('MUT: the small translucent badge back fails A2', !badgeOk(marketing, landing.replace('inverse prominent>', 'inverse>')))
    const ctaOk = (l: string, f: string) => /variant="inverse" size="lg" arrow className="h-14 border-2 border-white\/60/.test(l) && /h-16 border-transparent/.test(f) && /h-16 px-8/.test(f) && /max-w-2xl/.test(f)
    check('A3: the check form is 64px tall and the trial link a 56px outlined button', ctaOk(landing, form))
    check('MUT: the trial as a bare link fails A3', !ctaOk(landing.replace('variant="inverse" size="lg" arrow', 'variant="ghost-inverse" arrow'), form))
    check('MUT: the small field fails A3', !ctaOk(landing, form.replace('h-16 border-transparent', 'h-14 border-transparent')))
    check('A4: the badge reads "automatic" in both languages', landingHe.hero.eyebrow === 'קידום אוטומטי בגוגל ובמנועי AI, במערכת אחת' && /Automatic promotion/.test(landingEn.hero.eyebrow))
    const gapOk = (l: string) => /relative z-10 pt-12 sm:pt-16 lg:pt-20/.test(l) && !/-mt-(?:12|\[7\.5rem\])/.test(l)
    check('A5: the box after the hero has air above it (no overlap into the hero)', gapOk(landing))
    check('MUT: the glued overlap back fails A5', !gapOk(landing.replace('relative z-10 pt-12 sm:pt-16 lg:pt-20', 'relative z-10 -mt-12 lg:-mt-[7.5rem]')))
  }

  console.log('\nB) recoloured bands')
  {
    const landing = strip(read('components/public/LandingPage.tsx'))
    const about = strip(read('components/public/AboutPage.tsx'))
    const sec = (src: string, marker: string) => { const i = src.indexOf(marker); const s = src.lastIndexOf('<section', i); return src.slice(s, i + marker.length) }
    const homeOk = (l: string) => /bg-contrast/.test(sec(l, 'data-check-tone="dark"')) && /bg-contrast/.test(sec(l, 'data-features-tone="dark"')) && !/bandBrand/.test(l)
    check('B1: home "not sure yet" has the same ground as "everything in one place" (bg-contrast)', homeOk(landing))
    check('MUT: the cobalt band back fails B1', !homeOk(landing.replace('data-check-tone="dark"', 'data-check-tone="brand"').replace(/(<section className=")[^"]*(" data-check-tone="brand")/, '$1bandBrand$2')))
    const aboutOk = (a: string) => /bg-contrast/.test(sec(a, 'data-about-choose')) && /bg-contrast/.test(sec(a, 'data-about-gaps')) && /bg-canvas/.test(sec(a, 'data-final-cta')) && !/bandBrand/.test(a)
    check('B2: About "why choose" = the ground of "what was missing"; the close = the ground of "our approach" (canvas)', aboutOk(about))
    check('MUT: a navy close fails B2', !aboutOk(about.replace('bg-canvas py-20 text-center', 'bg-contrast py-20 text-center')))
  }

  console.log('\nC) the product name is Go Top SEO')
  {
    const SKIP = /(^|\/)(supabase|docs|scripts|node_modules)\//
    const files = [...walk('app'), ...walk('components'), ...walk('lib'), ...walk('public')].filter((f) => !SKIP.test(f) && !/^lib\/shopify\//.test(f))
    const OLD = /Rankings by Go Top/
    const allowed = (f: string, line: string) =>
      (/alternateName: \['Rankings by Go Top'\]/.test(line)) || (f === 'app/llms.txt/route.ts' || f === 'public/llms.txt') && /\(previously Rankings by Go Top\)/.test(line)
    const offenders = (name: string, src: string) => {
      const text = /\.(ts|tsx)$/.test(name) ? strip(src) : src
      return text.split('\n').filter((l) => OLD.test(l) && !allowed(name, l)).map((l) => `${name}: ${l.trim().slice(0, 80)}`)
    }
    const bad = files.flatMap((f) => offenders(f, read(f)))
    check(`C1: no customer-visible "Rankings by Go Top" in ${files.length} files (except the schema alternateName and the llms.txt "previously" line)`, bad.length === 0, bad.slice(0, 3).join(' | '))
    check('MUT: the old name put back into a page is caught', offenders('app/x.tsx', "export const t = 'Pricing - Rankings by Go Top'").length === 1)
    check('MUT: the allowed alternateName is not flagged', offenders('app/layout.tsx', "alternateName: ['Rankings by Go Top'],").length === 0)
    const lockups = ['components/layout/Sidebar.tsx', 'components/PublicNav.tsx', 'components/Footer.tsx', 'components/public/landing/HeroDemo.tsx'].map((f) => strip(read(f)))
    const lockOk = (l: string[]) => l.every((s) => !/>\s*by Go Top\s*</.test(s) && !/>Rankings</.test(s) && !/Rankings by /.test(s))
    check('C2: no "Rankings / by Go Top" logo text is left in the rail, the public nav, the footer or the demo', lockOk(lockups))
    check('MUT: a two-line "Rankings / by Go Top" lockup back is caught', !lockOk([...lockups, '<span>Rankings</span><span>by Go Top</span>']))
    const schema = strip(read('app/api/schema/route.ts')), layout = strip(read('app/layout.tsx')), llms = read('app/llms.txt/route.ts')
    const schemaOk = (s: string) => /name: 'Go Top SEO',\s*alternateName: \['Rankings by Go Top'\]/.test(s)
      && /publisher: \{ '@type': 'Organization', name: 'GO TOP', url: 'https:\/\/www\.gotop\.co\.il' \}/.test(s)
    check('C3: schema — Go Top SEO with alternateName, publisher GO TOP (www.gotop.co.il)', schemaOk(schema) && schemaOk(layout))
    check('MUT: the old name as the schema name fails C3', !schemaOk(schema.replace(/name: 'Go Top SEO',(\s*)alternateName/g, "name: 'Rankings by Go Top',$1alternateName")))
    check('C4: llms.txt says "Go Top SEO (previously Rankings by Go Top)"', llms.includes('Name: Go Top SEO (previously Rankings by Go Top)'))
    const shopify = [read('app/shopify/app/ConnectorHomeClient.tsx'), read('app/shopify/link/page.tsx')]
    check('C5: the two Shopify embedded screens read "Go Top SEO" (text only, English)', />Go Top SEO<\/h1>/.test(shopify[0]) && /create a Go Top SEO account/.test(shopify[1]))
    check('C6: the agency credit stays "מבית GO TOP" / "By GO TOP"', read('lib/i18n/public/he.ts').includes("credit: 'מבית GO TOP'") && read('lib/i18n/public/en.ts').includes("credit: 'By GO TOP'"))
  }

  console.log('\nD) sign-up: fields, matching passwords, metadata, the free-check claim and the email confirmation')
  {
    const src = strip(read('app/(auth)/signup/page.tsx'))
    const fieldsOk = (s: string) => /full_name: formData\.fullName\.trim\(\)/.test(s) && /company_name: formData\.company\.trim\(\)/.test(s) && /phone: formData\.phone\.trim\(\)/.test(s)
      && /formData\.confirmPassword !== formData\.password/.test(s) && /error=\{fieldErrors\.confirmPassword\}/.test(s) && /passwordMismatch/.test(s)
    check('D1: name, company, phone go into the signUp metadata; a confirmation that differs is an inline error', fieldsOk(src))
    check('MUT: no confirmation check fails D1', !fieldsOk(src.replace('formData.confirmPassword !== formData.password', 'false')))
    check('MUT: no phone in the metadata fails D1', !fieldsOk(src.replace('phone: formData.phone.trim().slice(0, 30),', '')))
    const optionalOk = (s: string) => !/errors\.company/.test(s) && /companyOptional/.test(s)
    check('D2: the company is optional, the free check is not required', optionalOk(src) && !/free_check|freeCheck.*required/.test(src))
    check('MUT: a required company fails D2', !optionalOk(src.replace('return errors', "errors.company = 'x'\n    return errors")))
    const claimOk = (s: string) => /keepSeedClaim\(claimParam\)/.test(s) && /seedClaimDestination\(\)/.test(s) && /CLAIM_START_PATH/.test(s) && /if \(!authData\.session\)/.test(s) && /emailConfirmationRequired/.test(s) && /emailRedirectTo/.test(s) && /ensure-default/.test(s)
    check('D3: the free-check claim, the email confirmation and the default client are unchanged', claimOk(src))
    check('MUT: dropping the claim fails D3', !claimOk(src.replace('keepSeedClaim(claimParam)', 'void 0')))
    const dict = src.slice(src.indexOf('const SIGNUP_UI'), src.indexOf('} as const'))
    // One entry per language the form ships, derived from PUBLIC_LOCALES rather
    // than pinned at two — Spanish joined the form on 4 October 2026, and a
    // hard-coded 2 would have read that as a missing string.
    const langs = PUBLIC_LOCALES.filter((l) => dict.includes(`  ${l}: {`)).length
    const keys = ['fullName', 'company', 'phone', 'confirmPassword', 'passwordMismatch', 'phoneInvalid', 'fullNameInvalid']
    const both = langs >= 2 && keys.every((k) => (dict.match(new RegExp(`\\b${k}:`, 'g')) ?? []).length === langs)
    check(`D4: every new string exists in all ${langs} of the form's dictionaries`, both,
      keys.filter((k) => (dict.match(new RegExp(`\\b${k}:`, 'g')) ?? []).length !== langs).join(', '))
    check('MUT: a key missing from one language fails D4', !['fullName', 'company', 'phone', 'confirmPassword', 'passwordMismatch', 'phoneInvalid', 'fullNameInvalid'].every((k) => (dict.replace("phone: 'טלפון',", '').match(new RegExp(`\\b${k}:`, 'g')) ?? []).length === 2))
  }

  console.log('\nE) the cookie notice: the w9 shape, and the consent contract that replaced the accept-only flag')
  {
    const c = strip(read('components/CookieConsent.tsx'))
    // E1 USED TO PIN the single-button flag `cookie-consent-accepted`, read and
    // written in this component. That flag was the whole of the old consent
    // logic, and it was replaced on purpose: the notice offered no way to
    // refuse, so the click it stored is not consent under GDPR Art. 4(11) and
    // Google Tag Manager loaded regardless of it. What the guard protects now
    // is the contract that replaced it, in lib/consent/:
    //   - the decision is read from, and written to, the consent store, never
    //     to the legacy flag, which is cleared instead of honoured;
    //   - refusing is a button next to accepting, not a link or a second step;
    //   - every decision is reported to the audit log (Art. 7(1) proof).
    const store = strip(read('lib/consent/client-store.ts'))
    const contractOk = (comp: string, st: string) =>
      /clearLegacyConsent\(\)/.test(comp)
      && /decide\('accept_all', CONSENT_GRANTED\)/.test(comp)
      && /decide\('reject_all', CONSENT_DENIED\)/.test(comp)
      && /writeConsent\(action, next\)/.test(comp)
      // The decision has to be logged under the language it was READ in, so the
      // argument must be derived from the page rather than a constant. It used to
      // pin `isEnglish ? 'en' : 'he'` literally, which broke the moment a third
      // public language arrived; what matters is that a language is passed and
      // that it is not hard-coded.
      && /reportConsent\(record, (?!['"])[A-Za-z]/.test(comp)
      && /onClick=\{handleReject\}/.test(comp)
      // the legacy flag is only ever REMOVED, never read as a grant
      && /removeItem\(LEGACY_CONSENT_KEY\)/.test(st)
      && !/getItem\(LEGACY_CONSENT_KEY\)/.test(st)
      // storage that throws must read as "no decision", so the visitor is asked
      && /catch \{\n?\s*return null \/\/ storage blocked: no decision on record, so ask/.test(read('lib/consent/client-store.ts'))
    check('E1: the decision goes through the consent store, refusing is its own button, and every decision is logged', contractOk(c, store))
    check('MUT: dropping the reject button fails E1', !contractOk(c.replace('onClick={handleReject}', 'onClick={handleAccept}'), store))
    check('MUT: honouring the old accept-only flag as a grant fails E1',
      !contractOk(c, store.replace('window.localStorage.removeItem(LEGACY_CONSENT_KEY)', 'window.localStorage.getItem(LEGACY_CONSENT_KEY)')))
    check('MUT: dropping the audit-log report fails E1', !contractOk(c.replace(/reportConsent\(record, [^)]*\)/g, 'void 0'), store))
    check('MUT: logging every decision under one hard-coded language fails E1',
      !contractOk(c.replace(/reportConsent\(record, [^)]*\)/g, "reportConsent(record, 'he')"), store))
    check('E2: the popup is at the left in both languages (physical left-*, no start/end)', /left-24/.test(c) && /left-3\.5/.test(c) && !/\b(?:start|end)-\d/.test(c))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}
main()

export {}
