/**
 * W11 — the floating "free demo" button, on the public site and in the app.
 *
 * What this guards, and why each line is here:
 *
 *  A) GEOMETRY. The button joins a corner that already holds four things, and
 *     the whole point of the slot it took is that nothing covers anything else:
 *       WhatsAppFloat        end-6 / bottom-6,  z-[60], md and up
 *       AccessibilityWidget  start-4, md:bottom-24, z-[60]/[61]
 *       CookieConsent        left-24 / bottom-6 (desktop), left-3.5 / 76px (phone), z-[58]
 *       MobileContactBar     the bottom strip,  z-[55]
 *     So the demo pill takes end-6 / bottom-24 at z-[59] on md and up, and on a
 *     phone it is not a float at all — it is the primary action of
 *     MobileContactBar, because a pill at the end corner there would land on the
 *     privacy sheet. A1-A4 pin exactly that, so a later "let's move it down a
 *     bit" cannot silently bury the WhatsApp button or the cookie card.
 *
 *  B) EVERY FLOAT IS A FLOAT. `html[data-public-menu='open'] [data-public-float]`
 *     hides the floats while the nav menu is open (app/globals.css, guarded by
 *     lib/__qa__/w10-ui.qa.ts D4). A new float that forgets the attribute would
 *     sit over an open menu.
 *
 *  C) WORDS COME FROM THE DICTIONARIES, in all four languages, and the WhatsApp
 *     number comes from components/public/contact.ts — never typed in here. The
 *     app's message names the active project's site, as the top-bar contact menu
 *     already does.
 *
 *  D) WHO SEES IT. Public: only where the other public widgets render (so never
 *     for a signed-in user, never inside the app or the auth shells). App: only
 *     for customers, exactly like the contact pill and the rail's support row.
 *
 *  E) MOTION. The loop is the global `.float-y` / `.dot-ping`, both defined only
 *     inside `prefers-reduced-motion: no-preference`. A hand-rolled keyframe in
 *     the component would escape that.
 *
 * Every group has a mutation control.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { getPublicDictionary } from '@/lib/i18n/getPublicDictionary'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import { PUBLIC_LOCALES } from '@/lib/i18n/locales'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')

function main() {
  const float = strip(read('components/public/DemoFloat.tsx'))
  const widgets = strip(read('components/public/PublicSiteWidgets.tsx'))
  const bar = strip(read('components/public/MobileContactBar.tsx'))
  const wa = strip(read('components/public/WhatsAppFloat.tsx'))
  const cookie = strip(read('components/CookieConsent.tsx'))
  const appFloat = strip(read('components/guide/DemoFloatApp.tsx'))
  const appLayout = strip(read('app/(dashboard)/layout.tsx'))
  const css = read('app/globals.css')

  console.log('A) geometry: the demo pill clears everything else in that corner')
  {
    // The slot it must NOT take: the WhatsApp circle's own corner.
    const waOwns = /fixed bottom-6 end-6 z-\[60\]/.test(wa)
    check('A1: WhatsAppFloat still owns end-6 / bottom-6 at z-[60]', waOwns)

    const publicSlotOk = (f: string) => /'end-6 bottom-24 hidden md:flex'/.test(f) && /z-\[59\]/.test(f)
    check('A2: the public pill sits one step up (end-6 / bottom-24), z-[59], md and up', publicSlotOk(float))
    check('MUT: the pill in the WhatsApp button\'s own slot fails A2',
      !publicSlotOk(float.replace("'end-6 bottom-24 hidden md:flex'", "'end-6 bottom-6 hidden md:flex'")))
    check('MUT: the pill over the two always-reachable buttons fails A2',
      !publicSlotOk(float.replace('z-[59]', 'z-[61]')))

    // On a phone the demo is a bar action, not a float: the cookie sheet owns
    // that area (left-3.5, bottom 76px) and would be covered.
    check('A3: the privacy sheet still sits where a phone float would land', /left-3\.5 z-\[58\]/.test(cookie) && /76px \+ env\(safe-area-inset-bottom/.test(cookie))
    const phoneOk = (f: string, b: string) => /hidden md:flex/.test(f) && /data-mobile-demo/.test(b) && /buttonClasses\('primary', 'lg', 'min-w-0 flex-1'\)/.test(b)
    check('A4: on a phone the demo is MobileContactBar\'s one primary action', phoneOk(float, bar))
    check('MUT: a phone float instead of the bar action fails A4', !phoneOk(float.replace('hidden md:flex', 'flex'), bar))
    check('MUT: dropping the bar\'s demo action fails A4', !phoneOk(float, bar.replace('data-mobile-demo', 'data-mobile-zz')))

    // The bar keeps all three paths: WhatsApp and phone did not disappear, they
    // only lost their labels so the demo could carry words.
    const barKeepsAll = (b: string) => /whatsappHelpUrl\(t\.whatsappMessage\)/.test(b) && /href=\{PHONE_TEL\}/.test(b) && /whatsappHelpUrl\(t\.demoMessage\)/.test(b)
    check('A5: the bar still offers WhatsApp, phone AND the demo', barKeepsAll(bar))
    check('MUT: dropping the phone from the bar fails A5', !barKeepsAll(bar.replace('href={PHONE_TEL}', 'href="#"')))
    check('MUT: the demo replacing WhatsApp support fails A5', !barKeepsAll(bar.replace('whatsappHelpUrl(t.whatsappMessage)', 'whatsappHelpUrl(t.demoMessage)')))

    // The accessibility button's dock must stay free.
    check('A6: the pill is at the end corner, never the start one the accessibility button docks in', !/start-4/.test(float))
  }

  console.log('B) it is a float, and it behaves like one')
  {
    const marked = (f: string) => /data-public-float/.test(f)
    check('B1: the pill carries data-public-float, so the open nav menu hides it', marked(float))
    check('MUT: an unmarked float fails B1', !marked(float.replace('data-public-float', 'data-zz')))
    check('B2: globals.css still hides every marked float under an open menu',
      /html\[data-public-menu='open'\] \[data-public-float\]/.test(css) && /display: none !important/.test(css))
  }

  console.log('C) the words, in four languages, and the number from one place')
  {
    for (const locale of PUBLIC_LOCALES) {
      const t = getPublicDictionary(locale).contact
      check(`C1 (${locale}): label, aria and WhatsApp message are all filled`,
        !!t.demo?.trim() && !!t.demoAria?.trim() && !!t.demoMessage?.trim())
    }
    const fromContact = (f: string) => /from '\.\/contact'/.test(f) && /whatsappHelpUrl\(t\.demoMessage\)/.test(f) && !/wa\.me/.test(f) && !/972/.test(f)
    check('C2: the public pill builds its link through whatsappHelpUrl, with no number in sight', fromContact(float))
    check('MUT: a hard-coded wa.me link fails C2', !fromContact(float.replace("whatsappHelpUrl(t.demoMessage)", "'https://wa.me/972549489377'")))

    const appMsgOk = (a: string) => /whatsappHelpUrl\(t\.demoMessage\(domain\)\)/.test(a) && /target_domain/.test(a)
    check('C3: the app pill names the active project\'s site in the message', appMsgOk(appFloat))
    check('MUT: the app pill ignoring the project fails C3', !appMsgOk(appFloat.replace('t.demoMessage(domain)', 't.demoMessage(\'\')')))
    // Dashboard dictionaries: the message is a function of the domain in each language.
    for (const locale of ['he', 'en', 'es', 'pt-BR'] as const) {
      const t = getDashboardDictionary(locale).contact
      const named = t.demoMessage('example.com')
      check(`C4 (${locale}): the app message is filled and uses the domain when there is one`,
        !!t.demo?.trim() && !!t.demoAria?.trim() && named.includes('example.com') && !!t.demoMessage('').trim())
    }
  }

  console.log('D) who sees it')
  {
    const publicGated = /shouldRenderPublicWidgets/.test(widgets) && /<PublicDemoFloat \/>/.test(widgets)
    check('D1: the public pill renders only inside the gated widget set', publicGated)
    check('MUT: the pill mounted outside the gate fails D1', !(/shouldRenderPublicWidgets/.test(widgets) && /<PublicDemoFloat \/>/.test(widgets.replace('<PublicDemoFloat />', ''))))

    const appGated = /\{!isAdmin && <DemoFloatApp \/>\}/.test(appLayout)
    check('D2: the app pill is for customers only, like the contact pill', appGated)
    check('MUT: the pill shown to admins too fails D2', !/\{!isAdmin && <DemoFloatApp \/>\}/.test(appLayout.replace('{!isAdmin && <DemoFloatApp />}', '<DemoFloatApp />')))
  }

  console.log('E) motion lives in globals.css, under prefers-reduced-motion')
  {
    const usesGlobal = (f: string) => /float-y/.test(f) && /dot-ping/.test(f) && !/@keyframes/.test(f) && !/animation:/.test(f)
    check('E1: the pill uses the global float-y / dot-ping loops and defines no keyframes of its own', usesGlobal(float))
    check('MUT: a keyframe hand-rolled in the component fails E1', !usesGlobal(float + '\n@keyframes wobble { }'))

    // Both utilities must be INSIDE a no-preference block, not merely defined
    // somewhere in the file. The at-rule nests, so brace-match each one.
    const noPreferenceBlocks = (src: string): string[] => {
      const out: string[] = []
      const at = '@media (prefers-reduced-motion: no-preference)'
      for (let i = src.indexOf(at); i !== -1; i = src.indexOf(at, i + 1)) {
        const open = src.indexOf('{', i)
        if (open === -1) continue
        let depth = 0
        for (let j = open; j < src.length; j++) {
          if (src[j] === '{') depth++
          else if (src[j] === '}' && --depth === 0) { out.push(src.slice(open, j)); break }
        }
      }
      return out
    }
    const guardedIn = (src: string, re: RegExp) => noPreferenceBlocks(src).some((b) => re.test(b))
    check('E2: .float-y and .dot-ping are declared inside prefers-reduced-motion: no-preference',
      guardedIn(css, /\.float-y \{ animation: float-y/) && guardedIn(css, /\.dot-ping \{ animation: dot-ping/))
    check('MUT: the same utility declared outside the block fails E2',
      !guardedIn(css.replace(/@media \(prefers-reduced-motion: no-preference\)/g, '@media (min-width: 1px)'), /\.float-y \{ animation: float-y/))
    // The hero's one-off CTA sheen is held to the same rule in its own module.
    const landingCss = read('components/public/landing/landing.module.css')
    check('E3: the hero CTA sheen animates only under prefers-reduced-motion: no-preference',
      guardedIn(landingCss, /\.ctaSheen::before \{\s*animation: cta-sheen/) && !/^\s*animation: cta-sheen/m.test(landingCss.replace(/@media \(prefers-reduced-motion: no-preference\)[\s\S]*/, '')))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}

main()

export {}
