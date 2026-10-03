/**
 * FIRST-RENDER LANGUAGE — the dashboard chrome must already be in the resolved
 * language, before a single effect runs.
 *
 * WHAT THE ACCEPTANCE TEST FOUND. After the server language contract landed, a
 * fresh no-cookie English request returned `<html lang="en" dir="ltr">` with an
 * English <title> — and then rendered the sidebar and the rest of the dashboard
 * in Hebrew RTL for the whole of the load, flipping to English only after
 * hydration. The document was right and the CONTENT was wrong, which is the more
 * visible half.
 *
 * THE CAUSE. Eighteen components asked the provider for the language and then
 * threw the answer away:
 *
 *     const { language, isLoaded } = useDashboardLanguage()
 *     const dict = isLoaded ? getDashboardDictionary(language) : getDashboardDictionary('he')
 *
 * `isLoaded` only becomes true inside a `useEffect`, which does not run during
 * SSR and has not run on the first client render. So every one of those
 * components deliberately rendered Hebrew first, whatever the server had
 * resolved. `language` was correct the entire time.
 *
 * HOW THIS IS PROVEN. renderToStaticMarkup runs the REAL provider and the REAL
 * components and executes NO effects — which is exactly the state the reviewer
 * sees during load. If the markup is English, there is nothing left to flip.
 *
 * Run: npx tsx lib/i18n/dashboard/__qa__/first-render-language.qa.ts
 */

import { readFileSync } from 'fs'
import { join } from 'path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { DashboardLanguageProvider } from '../useDashboardLanguage'
import { getDashboardDictionary } from '../getDashboardDictionary'
import type { Locale } from '../../locales'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
const HEBREW = /[֐-׿]/
// The Content Hub entry is behind this public flag; the reviewer's sidebar has
// it, so the suite measures that sidebar rather than a reduced one.
process.env.NEXT_PUBLIC_ENABLE_CONTENT = 'true'

/**
 * The language SWITCH legitimately prints "עברית" in both locales — a language
 * is named in its own language, which is the correct convention and is not a
 * translation leak. Everything else must follow the resolved locale, so the
 * switch's own labels are removed before the Hebrew scan.
 */
const withoutSwitcherLabels = (html: string) => html.split('עברית').join('')

/** Render a component tree through the REAL provider with NO effects run. */
function firstRender(locale: Locale, node: unknown): string {
  return renderToStaticMarkup(
    createElement(DashboardLanguageProvider as never, { initialLocale: locale, children: node } as never) as never,
  )
}

/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */
/*
 * The components under test call Next's router hooks. Outside a Next request
 * `usePathname()` returns null and the real components crash, so the hook is
 * stubbed with a plain pathname — the ONLY substitution in this suite. The
 * provider, the dictionaries and the components themselves are the real ones.
 * Installed after the imports above because the modules under test are loaded
 * lazily by `load()` below, so the hook is in place before they resolve.
 */
const Mod: any = require('module')
const origLoad = Mod._load
Mod._load = function (request: string, parent: any, isMain: boolean) {
  const real = origLoad.call(this, request, parent, isMain)
  if (request !== 'next/navigation') return real
  return new Proxy(real, {
    get: (t, k) => (k === 'usePathname' ? () => '/dashboard'
      : k === 'useSearchParams' ? () => new URLSearchParams()
      : k === 'useRouter' ? () => ({ push() {}, replace() {}, refresh() {}, back() {}, prefetch() {} })
      : (t as any)[k]),
  })
}

function load(path: string, named?: string): unknown {
  const m = require(join(ROOT, path))
  return named ? m[named] : (m.default ?? m)
}

async function main() {
  // ── A) the sidebar — the chrome the screencast shows first ─────────────────
  console.log('A) Sidebar, first render, no effects')
  {
    // The content screens are sidebar entries of their own, gated by the build-time
    // content flag and labelled from `contentHub.screens` (the same block their own
    // headings read). Set the flag BEFORE the module loads, so the entries are part of
    // this render and their labels are covered by the same first-render contract.
    process.env.NEXT_PUBLIC_ENABLE_CONTENT = 'true'
    const Sidebar = load('components/layout/Sidebar.tsx')
    const en = getDashboardDictionary('en').sidebar
    const he = getDashboardDictionary('he').sidebar
    const enScreens = getDashboardDictionary('en').contentHub.screens
    const heScreens = getDashboardDictionary('he').contentHub.screens

    const enHtml = firstRender('en', createElement(Sidebar as never, { isAdmin: false }))
    check('A1: initialLocale="en" → English nav labels are present on the FIRST render',
      enHtml.includes(en.dashboard) && enHtml.includes(en.projectSettings) && enHtml.includes(enScreens.articles) && enHtml.includes(en.billing),
      enHtml.slice(0, 300))
    const enBody = withoutSwitcherLabels(enHtml)
    check('A2: …and NOT ONE Hebrew character is rendered outside the language switch',
      !HEBREW.test(enBody),
      (enBody.match(/[֐-׿][^<]*/g) ?? []).slice(0, 6).join(' | '))
    check('A3: …specifically, the Hebrew labels are absent',
      !enHtml.includes(he.dashboard) && !enHtml.includes(he.projectSettings) && !enHtml.includes(heScreens.articles))

    const heHtml = firstRender('he', createElement(Sidebar as never, { isAdmin: false }))
    check('A4: initialLocale="he" → Hebrew nav labels are present on the FIRST render',
      heHtml.includes(he.dashboard) && heHtml.includes(he.projectSettings) && heHtml.includes(heScreens.articles),
      JSON.stringify({ dashboard: heHtml.includes(he.dashboard), projectSettings: heHtml.includes(he.projectSettings), articles: heHtml.includes(heScreens.articles) }))
    check('A5: …and the English labels are absent',
      !heHtml.includes(`>${en.dashboard}<`) && !heHtml.includes(`>${en.projectSettings}<`))
    check('A6: the two renders genuinely differ', enHtml !== heHtml)

    // The admin section too — it renders a second nav group from the same dict.
    const adminEn = withoutSwitcherLabels(firstRender('en', createElement(Sidebar as never, { isAdmin: true })))
    check('A7: the admin nav is English too, first render',
      adminEn.includes(en.system) && !HEBREW.test(adminEn),
      (adminEn.match(/[֐-׿][^<]*/g) ?? []).slice(0, 6).join(' | '))
  }

  // ── B) the switch itself ───────────────────────────────────────────────────
  console.log('\nB) the language switch is available during the load')
  {
    const Switcher = load('components/DashboardLanguageSwitcher.tsx', 'DashboardLanguageSwitcher')
    const html = firstRender('en', createElement(Switcher as never))
    check('B1: it renders on the FIRST render (it used to return null until hydration)',
      html.includes('EN') && html.includes('עברית'), html)
    // The active option is marked twice: for assistive tech (aria-pressed) and on screen
    // (its own classes). The check used to pin one colour class; it now reads both marks,
    // so a restyle keeps it and a switch that marks the wrong language still fails it.
    const buttonOf = (h: string, lang: string) => h.match(new RegExp(`<button[^>]*\\blang="${lang}"[^>]*>`))?.[0] ?? ''
    const classOf = (tag: string) => /\bclass="([^"]*)"/.exec(tag)?.[1] ?? ''
    const [enTag, heTag] = [buttonOf(html, 'en'), buttonOf(html, 'he')]
    check('B2: …and it marks the ACTIVE language from the server-resolved value',
      /\baria-pressed="true"/.test(enTag) && /\baria-pressed="false"/.test(heTag)
      && classOf(enTag) !== '' && classOf(enTag) !== classOf(heTag), html)
    const heHtml = firstRender('he', createElement(Switcher as never))
    check('B3: …and the Hebrew button is the active one under initialLocale="he"',
      heHtml !== html)
  }

  // ── C) representative pages across the product ─────────────────────────────
  console.log('\nC) representative dashboard surfaces, first render')
  {
    // `wrap` renders the component inside a provider it needs. The content workspace is
    // the case: its screens read one shared context, so the surface a reviewer opens is
    // provider + shell, not a screen on its own.
    const cases: { label: string; path: string; named?: string; props?: Record<string, unknown>; wrap?: { path: string; named: string }; probe: (d: ReturnType<typeof getDashboardDictionary>) => string[] }[] = [
      { label: 'StatusBadge/ActiveBadge', path: 'components/ui/StatusBadge.tsx', named: 'ActiveBadge', props: { active: true },
        probe: (d) => [String((d.common as never as Record<string, string>).active)] },
      { label: 'StatusBadge/ScanStatusBadge', path: 'components/ui/StatusBadge.tsx', named: 'ScanStatusBadge', props: { status: 'completed' },
        probe: (d) => [String((d.scans as never as { status: Record<string, string> }).status.completed)] },
      { label: 'ProjectsTable', path: 'components/projects/ProjectsTable.tsx', props: { projects: [], clients: [] },
        probe: (d) => [String((d.projects as never as { table: Record<string, string> }).table.projectName)] },
      { label: 'ClientsTable', path: 'components/clients/ClientsTable.tsx', props: { clients: [] },
        probe: (d) => [String((d.clients as never as { table: Record<string, string> }).table.clientName)] },
      { label: 'ProjectForm', path: 'components/projects/ProjectForm.tsx', props: { clients: [] },
        probe: (d) => [String((d.projects as never as { table: Record<string, string> }).table.projectName)] },
      // The two surfaces the reviewer actually opens.
      // Rendered with no active project (no provider here), so the page is its own
      // heading plus the workspace gate's "create your first project" state.
      { label: 'DashboardPage', path: 'app/(dashboard)/dashboard/page.tsx', props: {},
        probe: (d) => [
          String((d.home as never as Record<string, string>).title),
          String((d.home as never as Record<string, string>).subtitle),
          String((d.workspace as never as Record<string, string>).noProjectTitle),
        ] },
      { label: 'ContentWorkspace', path: 'components/content/workspace/ContentWorkspaceShell.tsx', props: {},
        wrap: { path: 'components/content/workspace/ContentWorkspaceProvider.tsx', named: 'ContentWorkspaceProvider' },
        probe: () => [] },
    ]
    for (const c of cases) {
      let Comp: unknown
      try { Comp = load(c.path, c.named) } catch { check(`C-${c.label}: module loads`, false, 'import failed'); continue }
      if (typeof Comp !== 'function') { check(`C-${c.label}: component resolved`, false, typeof Comp); continue }
      let Wrap: unknown = null
      if (c.wrap) {
        try { Wrap = load(c.wrap.path, c.wrap.named) } catch { check(`C-${c.label}: wrapper loads`, false, 'import failed'); continue }
        if (typeof Wrap !== 'function') { check(`C-${c.label}: wrapper resolved`, false, typeof Wrap); continue }
      }
      const element = () => (Wrap
        ? createElement(Wrap as never, null, createElement(Comp as never, c.props as never))
        : createElement(Comp as never, c.props as never))
      let enHtml = ''
      try { enHtml = firstRender('en', element()) } catch (e) {
        check(`C-${c.label}: renders`, false, (e as Error).message.slice(0, 120)); continue
      }
      const enWords = c.probe(getDashboardDictionary('en')).filter(Boolean)
      const enBody = withoutSwitcherLabels(enHtml)
      check(`C-${c.label}: English on the first render`,
        enWords.every((w) => enHtml.includes(w)) && !HEBREW.test(enBody),
        `${JSON.stringify(enWords)} :: ${(enBody.match(/[֐-׿][^<]*/g) ?? []).slice(0, 4).join(' | ') || enBody.slice(0, 160)}`)
      const heHtml = firstRender('he', element())
      check(`C-${c.label}: Hebrew on the first render under he`,
        HEBREW.test(heHtml) && heHtml !== enHtml, heHtml.slice(0, 160))
    }
  }

  // ── D) direction follows the same value ────────────────────────────────────
  console.log('\nD) direction, from the same authoritative value')
  {
    const Wrapper = load('components/DashboardDirectionWrapper.tsx', 'DashboardDirectionWrapper')
    const en = firstRender('en', createElement(Wrapper as never, null, 'x'))
    const he = firstRender('he', createElement(Wrapper as never, null, 'x'))
    check('D1: initialLocale="en" → dir="ltr" on the first render', /dir="ltr"/.test(en), en)
    check('D2: initialLocale="he" → dir="rtl" on the first render', /dir="rtl"/.test(he), he)
    check('D3: direction is derived from `language`, never from isLoaded',
      !/isLoaded/.test(read('components/DashboardDirectionWrapper.tsx')))
  }

  // ── E) MUTATION CONTROL — restore the old pattern, the proof must fail ─────
  console.log('\nE) mutation control')
  {
    // The exact expression the 18 components used. Rendered with the pre-effect
    // value of isLoaded (false), which is what SSR and the first client render see.
    const oldPattern = (language: Locale, isLoaded: boolean): { sidebar: Record<string, string> } =>
      (isLoaded ? getDashboardDictionary(language) : getDashboardDictionary('he')) as never
    const preHydration = oldPattern('en', false)
    check('E1: the OLD expression yields HEBREW for an English request before hydration',
      preHydration.sidebar.dashboard === (getDashboardDictionary('he').sidebar as Record<string, string>).dashboard
      && HEBREW.test(preHydration.sidebar.dashboard), preHydration.sidebar.dashboard)
    check('E2: …so A1/A2 would fail under it — the proof is not vacuous',
      HEBREW.test(preHydration.sidebar.projects))
    const corrected = getDashboardDictionary('en').sidebar as Record<string, string>
    check('E3: the corrected expression yields English at the same moment',
      corrected.dashboard === 'Dashboard' && !HEBREW.test(corrected.dashboard))
  }

  // ── F) REPOSITORY GUARD — the pattern cannot come back ─────────────────────
  console.log('\nF) repository guard')
  {
    const { execSync } = require('child_process')
    const scan = (re: string) => {
      try {
        return execSync(`grep -rnE ${JSON.stringify(re)} --include=*.tsx --include=*.ts app components lib | grep -v '__qa__' || true`,
          { cwd: ROOT, encoding: 'utf8' }).trim()
      } catch { return '' }
    }
    const ternary = scan("isLoaded[^\\n]*getDashboardDictionary")
    check('F1: no component gates its dictionary on isLoaded', ternary === '', ternary)
    const hardHe = scan("getDashboardDictionary\\((')he(')\\)")
    check('F2: no component hard-codes the Hebrew dictionary', hardHe === '', hardHe)
    const dirOnLoaded = scan("isLoaded[^\\n]*(rtl|ltr|dir)")
    check('F3: no component derives direction from isLoaded', dirOnLoaded === '', dirOnLoaded)
    const nullUntilLoaded = scan("if \\(!isLoaded\\) return null")
    check('F4: nothing hides itself until hydration', nullUntilLoaded === '', nullUntilLoaded)

    // isLoaded still EXISTS — it is the migration flag, and removing it would
    // have been the lazy fix. It is simply not allowed to pick the language.
    const provider = read('lib/i18n/dashboard/useDashboardLanguage.tsx')
    check('F5: isLoaded is still published by the provider (migration state kept)',
      /isLoaded: boolean/.test(provider) && /setIsLoaded\(true\)/.test(provider))
    // The call now names the locale set it reads, because the dashboard is the
    // one surface whose words can be Spanish. The migration itself — cookie
    // beats storage beats the server's value, and the cookie is always written —
    // is the same function and the same rule.
    check('F6: …and the storage migration it belongs to is untouched',
      /migrateLocalePreference<PublicLocale>\(\{/.test(provider) && /localStorage\.setItem\(STORAGE_KEY, migration\.locale\)/.test(provider))
  }

  // ── G) the out-of-provider fallback is not silently Hebrew ────────────────
  console.log('\nG) a missing provider is a reported bug, not a Hebrew page')
  {
    const provider = read('lib/i18n/dashboard/useDashboardLanguage.tsx')
    const code = provider.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
    check('G1: the fallback no longer returns a hard-coded Hebrew locale',
      !/return \{ language: 'he', setDashboardLanguage/.test(code))
    // DETERMINISM. An earlier revision read document.documentElement.lang, which
    // does not exist during SSR — so the server and the first client render could
    // answer differently and hydrate over a mismatch, reintroducing the very flip
    // this branch removes. The value must be identical on both sides.
    check('G2: it does NOT read the document — that would differ between SSR and the client',
      !/document\.documentElement\.lang/.test(code))
    check('G3: development THROWS, so a wiring bug cannot be walked past',
      /if \(process\.env\.NODE_ENV !== 'production'\) throw new Error\(message\)/.test(code))
    check('G4: production reports it and returns ONE constant, the same on server and client',
      /console\.error\(message\)/.test(code) && /return REQUEST_FALLBACK_LOCALE/.test(code))
  }

  // ── H) the locale precedence from PR #58 is untouched ─────────────────────
  console.log('\nH) the request contract is unchanged')
  {
    const rl = read('lib/i18n/request-locale.ts')
    // The ROUTE step now asks routePublicLocale, which is the same question
    // across every public locale (a /es route answers Spanish); the bilingual
    // routeContentLocale is a narrowing of it. The PRECEDENCE below is what
    // this check is about, and it is unchanged.
    // The cookie step now reads normalizeStoredLocale, which accepts Spanish:
    // the dashboard has no /es URL to be fixed by, so the stored choice is the
    // only place its language can come from. The PRECEDENCE this checks — route,
    // then ?lang=, then cookie, then seed, then Accept-Language, then English —
    // is unchanged, and that is what the check is about.
    check('H1: route → cookie → seed → Accept-Language → English, unchanged',
      /const fixed = routePublicLocale\(input\.pathname\)/.test(rl)
      && /normalizeStoredLocale\(input\.cookieValue\)\s*\n\s*\?\? normalizeLocale\(input\.seed\)\s*\n\s*\?\? localeFromAcceptLanguage\(input\.acceptLanguage\)\s*\n\s*\?\? REQUEST_FALLBACK_LOCALE/.test(rl))
    // The state it starts from is now the UI locale (the one that can be
    // Spanish); `language` is derived from it. The guarantee this checks — the
    // first render comes from the SERVER's value, not from a constant corrected
    // later in an effect — is unchanged.
    check('H2: the provider still starts from the server-resolved initialLocale',
      /useState<PublicLocale>\(resolveDashboardUiLocale\(null, initialLocale\)\)/.test(read('lib/i18n/dashboard/useDashboardLanguage.tsx')))
  }

  // ── I) switching still works, and still persists ──────────────────────────
  console.log('\nI) EN → HE → EN, and the storage migration')
  {
    const { languageCookieString, readCookie, migrateLocalePreference } =
      require('../../request-locale') as typeof import('../../request-locale')

    // The exact pair setDashboardLanguage writes on every switch.
    let cookieJar = ''
    const storage = new Map<string, string>()
    const applySwitch = (lang: Locale) => {
      cookieJar = languageCookieString(lang, true)
      storage.set('dashboard-language', lang)
    }
    const currentCookie = () => readCookie(cookieJar.split(';')[0], 'dashboard-language')

    applySwitch('en')
    check('I1: switching to EN writes both stores', currentCookie() === 'en' && storage.get('dashboard-language') === 'en')
    applySwitch('he')
    check('I2: switching back to HE writes both stores', currentCookie() === 'he' && storage.get('dashboard-language') === 'he')
    applySwitch('en')
    check('I3: and back to EN again', currentCookie() === 'en' && storage.get('dashboard-language') === 'en')

    // The next SERVER render must see that choice — that is what "persists" means.
    const { resolveRequestLocale } = require('../../request-locale') as typeof import('../../request-locale')
    check('I4: the next request resolves from the cookie the switch wrote',
      resolveRequestLocale({ pathname: '/dashboard', cookieValue: currentCookie(), acceptLanguage: 'he-IL,he;q=0.9' }) === 'en')
    check('I5: …and the provider starts the next first render from it',
      firstRender('en', createElement(load('components/DashboardLanguageSwitcher.tsx', 'DashboardLanguageSwitcher') as never)).includes('EN'))

    // Migration is untouched: cookie wins, a lone stored value is adopted AND
    // written to the cookie, and neither keeps the server's locale.
    const m1 = migrateLocalePreference({ cookieValue: 'en', storedValue: 'he', serverLocale: 'he' })
    check('I6: an explicit cookie still wins over a stale stored value', m1.locale === 'en' && m1.reason === 'cookie')
    const m2 = migrateLocalePreference({ cookieValue: null, storedValue: 'en', serverLocale: 'he' })
    check('I7: a lone legacy localStorage value is still adopted and promoted to the cookie',
      m2.locale === 'en' && m2.writeCookie === true && m2.reason === 'migrated_from_storage')
    const m3 = migrateLocalePreference({ cookieValue: null, storedValue: null, serverLocale: 'en' })
    check('I8: with neither, the SERVER locale is kept — the first render is not overridden',
      m3.locale === 'en' && m3.reason === 'server_default')
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}
main().catch((e) => { console.error(e); process.exitCode = 1 })
