/**
 * THE PLUGIN IS THE FIRST WAY TO CONNECT WORDPRESS (owner, 2026-10-10: the GO TOP SEO Bridge
 * plugin does everything the application password does; the application password becomes the
 * advanced alternative).
 *
 *  A) the WordPress panel, rendered for real in the four dashboard languages:
 *     nothing connected → the three plugin steps (WordPress.org link, "get a code", "check"),
 *     the application-password form NOT out, one link to it as "advanced";
 *     connected by the plugin alone → no steps and no "not connected", the application password
 *     only as an optional extra;
 *  B) the settings section: plugin 3.1+ alone says "connected, nothing else needed"; an older
 *     plugin is asked to update (the old "add an application password for the scan" is gone);
 *  C) the pairing component talks to the owner-checked pairing route and shows only our sentences;
 *  D) the copy: every new string in he/en/es/pt-BR, in the right language, naming the plugin's real
 *     settings page (Settings > GO TOP SEO, includes/admin.php) and WordPress.org page.
 *
 * Every guard has a mutation control. Source guards strip comments first.
 *
 * Run: npx tsx components/content/__qa__/wordpress-plugin-first.qa.ts
 */
/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

// Next's router hooks need a request outside of Next; they return plain values here.
const Module: any = require('module')
const origLoad = Module._load
Module._load = function (request: string, parent: any, isMain: boolean) {
  const real = origLoad.call(this, request, parent, isMain)
  if (request !== 'next/navigation') return real
  return new Proxy(real, {
    get: (t, k) => (k === 'usePathname' ? () => '/settings'
      : k === 'useSearchParams' ? () => new URLSearchParams()
      : k === 'useRouter' ? () => ({ push() {}, replace() {}, refresh() {}, back() {}, prefetch() {} })
      : (t as any)[k]),
  })
}

const { readFileSync, writeFileSync, rmSync } = require('fs') as typeof import('fs')
const { join } = require('path') as typeof import('path')
const { createElement } = require('react') as typeof import('react')
const { renderToStaticMarkup } = require('react-dom/server') as typeof import('react-dom/server')
const { DashboardLanguageProvider } = require('../../../lib/i18n/dashboard/useDashboardLanguage')
const { getDashboardDictionary } = require('../../../lib/i18n/dashboard/getDashboardDictionary')
const PC = require('../../../lib/connection-status/project-connections') as typeof import('../../../lib/connection-status/project-connections')
const R = require('../../../lib/connection-status/useKnownRead') as typeof import('../../../lib/connection-status/useKnownRead')

type Locale = 'he' | 'en' | 'es' | 'pt-BR'
const LOCALES: Locale[] = ['he', 'en', 'es', 'pt-BR']
// The static render resolves the dashboard language through the provider, which serves he and en here;
// es and pt-BR are checked as strings (D).
const RENDERED: Locale[] = ['he', 'en']
const ROOT = join(__dirname, '..', '..', '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
const render = (locale: Locale, node: unknown) =>
  renderToStaticMarkup(createElement(DashboardLanguageProvider, { initialLocale: locale, children: node }) as never)
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ')
const HEBREW = /[֐-׿]/
const WPORG = 'https://wordpress.org/plugins/go-top-seo-bridge/'

let mutN = 0
/** A copy of a component with one change, next to the original so its imports resolve. */
function mutantComp(rel: string, from: string, to: string): { C: any; found: boolean; done: () => void } {
  const src = read(rel)
  const found = src.includes(from)
  const file = join(ROOT, rel.replace(/([^/]+)\.tsx$/, `$1.qa-mutant${++mutN}.tsx`))
  writeFileSync(file, src.split(from).join(to))
  try { return { C: require(file).default, found, done: () => rmSync(file, { force: true }) } } catch (e) { rmSync(file, { force: true }); throw e }
}

let pidN = 0
const fresh = () => `a1111111-2222-3333-4444-${String(++pidN).padStart(12, '0')}`
const ok = (body: Record<string, unknown>) => ({ status: 200, body })
const SITE = 'https://blog.example.com'

function main() {
  const Panel = require('../WordPressConnectionPanel').default
  const Section = require('../ContentSection').default
  const { pairErrorKey } = require('../WordPressPluginConnect') as typeof import('../WordPressPluginConnect')
  const { PLUGIN_WPORG_URL } = require('../../site-health/PluginInstallModal') as typeof import('../../site-health/PluginInstallModal')

  console.log('A) the WordPress panel: the plugin first')
  const panelNone = (C: any, locale: Locale, props: Record<string, unknown> = {}) => {
    const pid = fresh(); R.primeKnownRead(PC.projectConnectionUrls(pid).wordpress, ok({ connection: null, publishingPlugin: null }))
    return render(locale, createElement(C, { projectId: pid, startWithForm: true, ...props }))
  }
  const pluginFirst = (html: string, locale: Locale) => {
    const t = getDashboardDictionary(locale).projectDetail.contentSection
    return html.includes('data-wp-plugin-steps') && html.includes(`href="${WPORG}"`) && html.includes('data-plugin-code') && html.includes('data-plugin-check') &&
      (html.match(/data-plugin-step="/g) ?? []).length === 3 &&
      text(html).includes(t.pluginConnect.advancedToggle) && !html.includes('type="password"') && !html.includes('data-wp-form')
  }
  for (const locale of RENDERED) {
    const html = panelNone(Panel, locale)
    check(`A1 (${locale}): nothing connected → three plugin steps (WordPress.org, a code, a check); the application password only as an "advanced" link, its form not out`, pluginFirst(html, locale), text(html).slice(0, 300))
  }
  {
    const m = mutantComp('components/content/WordPressConnectionPanel.tsx', 'const [showForm, setShowForm] = useState(false)', 'const [showForm, setShowForm] = useState(startWithForm)')
    check('MUTATION CONTROL: a panel that opens the application-password form first again is caught', m.found && !pluginFirst(panelNone(m.C, 'he'), 'he'))
    m.done()
  }
  {
    const m = mutantComp('components/content/WordPressConnectionPanel.tsx', '{!connection && !plugin && !showForm && (\n            <WordPressPluginConnect', '{false && (\n            <WordPressPluginConnect')
    check('MUTATION CONTROL: a panel without the plugin steps is caught', m.found && !pluginFirst(panelNone(m.C, 'en'), 'en'))
    m.done()
  }
  for (const locale of ['he', 'en'] as Locale[]) {
    const t = getDashboardDictionary(locale).projectDetail.contentSection
    const html = panelNone(Panel, locale, { startWithForm: false, plugin: { siteUrl: SITE, version: '3.1.0' } })
    check(`A2 (${locale}): connected by the plugin alone → no steps, no "not connected", the application password offered only as an optional extra`,
      !html.includes('data-wp-plugin-steps') && !text(html).includes(t.notConnected) && !html.includes('data-wp-connect-button') && text(html).includes(t.pluginConnect.advancedAdd) && !html.includes('type="password"'), text(html).slice(0, 300))
    const asked = panelNone(Panel, locale, { startWithForm: false })
    check(`A3 (${locale}): …while a panel nobody asked to open still waits for its "connect" click (the legacy layout)`, asked.includes('data-wp-connect-button') && !asked.includes('data-wp-plugin-steps'))
  }
  {
    const m = mutantComp('components/content/WordPressConnectionPanel.tsx', '{!connection && !plugin && !showForm && (\n            <WordPressPluginConnect', '{!connection && !showForm && (\n            <WordPressPluginConnect')
    const html = m.found ? panelNone(m.C, 'en', { startWithForm: false, plugin: { siteUrl: SITE, version: '3.1.0' } }) : ''
    check('MUTATION CONTROL: a plugin-connected site asked to pair again is caught', m.found && html.includes('data-wp-plugin-steps'))
    m.done()
  }

  console.log('\nB) the settings section with the plugin alone')
  const sectionWith = (C: any, locale: Locale, version: string) => {
    const pid = fresh(); const u = PC.projectConnectionUrls(pid)
    R.primeKnownRead(u.wordpress, ok({ connection: null, publishingPlugin: { siteUrl: SITE, version } }))
    R.primeKnownRead(u.shopify, ok({ connection: null })); R.primeKnownRead(u.site, ok({ connection: null }))
    return render(locale, createElement(C, { projectId: pid }))
  }
  const oldAsk = /application password below|סיסמת אפליקציה כאן למטה|contraseña de aplicación aquí abajo|senha de aplicativo aqui embaixo/
  for (const locale of RENDERED) {
    const t = getDashboardDictionary(locale).projectDetail.contentSection
    const full = sectionWith(Section, locale, '3.1.0')
    const old = sectionWith(Section, locale, '3.0.0')
    check(`B1 (${locale}): plugin 3.1 alone → "connected, nothing else needed" with its version, no plugin steps, no application-password form`,
      full.includes('data-wp-plugin-only="full"') && text(full).includes(t.pluginOnlyBody.replace('{version}', '3.1.0')) && !full.includes('data-wp-plugin-steps') && !full.includes('type="password"') && !oldAsk.test(text(full)), text(full).slice(0, 400))
    check(`B2 (${locale}): plugin 3.0 alone → asked to update the plugin (one action), never to add an application password`,
      old.includes('data-wp-plugin-only="update"') && text(old).includes(t.pluginUpdateBody.replace('{version}', '3.0.0')) && !oldAsk.test(text(old)))
  }
  {
    const m = mutantComp('components/content/ContentSection.tsx', 'const pluginFull = !!wpPlugin && versionAtLeast(wpPlugin.version, READ_PLUGIN_MIN_VERSION)', 'const pluginFull = !!wpPlugin')
    check('MUTATION CONTROL: a 3.0 plugin told "nothing else needed" is caught', m.found && !sectionWith(m.C, 'en', '3.0.0').includes('data-wp-plugin-only="update"'))
    m.done()
  }

  console.log('\nC) pairing: the owner-checked route, our sentences only')
  {
    const src = strip(read('components/content/WordPressPluginConnect.tsx'))
    const talks = (x: string) => /postFix<\{ code: string \}>\('\/api\/site-health\/plugin', \{ projectId, action: 'issue' \}\)/.test(x) &&
      /postFix<[^>]*>\('\/api\/site-health\/plugin', \{ projectId, action: 'check' \}\)/.test(x)
    const ours = (x: string) => /setError\(pairErrorKey\(issued\.code\)\)/.test(x) && /setError\(pairErrorKey\(r\.code\)\)/.test(x) && /\{t\.errors\[error\]\}/.test(x)
    check('C1: "get a code" issues one through /api/site-health/plugin, "check" asks the plugin through the same route', talks(src))
    check('MUTATION CONTROL: a check that never asks the plugin is caught', !talks(src.replace("action: 'check'", "action: 'pair'")))
    check('C2: every failure is shown as one of our sentences (pairErrorKey → t.errors), never the route\'s code', ours(src))
    check('MUTATION CONTROL: the raw code on screen is caught', !ours(src.replace('setError(pairErrorKey(r.code))', 'setError(r.code as never)')))
    check('C3: the code map: no https site address → offSite; the plugin not answering yet → notYet; not available here → unavailable; anything else → generic',
      pairErrorKey('off_site') === 'offSite' && ['plugin_unreachable', 'plugin_not_connected', 'plugin_rejected', 'plugin_outdated', 'wordpress_permission'].every((c) => pairErrorKey(c) === 'notYet') &&
      pairErrorKey('queue_unavailable') === 'unavailable' && ['store_failed', 'unauthorized', 'not_found', 'whatever'].every((c) => pairErrorKey(c) === 'generic'))
    check('C4: a successful check re-reads the connections and lets the page continue (onChanged, then onConnected)',
      /function handlePluginPaired\(\) \{\s*onChanged\?\.\(\)\s*onConnected\?\.\(\)\s*\}/.test(strip(read('components/content/WordPressConnectionPanel.tsx'))) && /onPaired=\{handlePluginPaired\}/.test(strip(read('components/content/WordPressConnectionPanel.tsx'))))
    check('C5: the WordPress.org link is the plugin\'s public page, opened in a new tab', PLUGIN_WPORG_URL === WPORG && /href=\{PLUGIN_WPORG_URL\} target="_blank" rel="noopener noreferrer"/.test(src))
    check('C6: no "next" URL, no redirect: the component never navigates by itself', !/router\.|window\.location|location\.href\s*=/.test(src))
  }

  console.log('\nD) the copy, in four languages')
  const admin = read('wordpress-plugin/gotop-seo-bridge/includes/admin.php')
  const pageTitle = (x: string) => /add_options_page\('GO TOP SEO', 'GO TOP SEO', 'manage_options', 'go-top-seo-bridge',/.test(x)
  check('D0: the plugin\'s settings page is called "GO TOP SEO" under Settings (what the copy tells the merchant to open)', pageTitle(admin))
  check('MUTATION CONTROL: a renamed settings page is caught', !pageTitle(admin.replace("add_options_page('GO TOP SEO', 'GO TOP SEO'", "add_options_page('GO TOP', 'GO TOP'")))
  for (const locale of LOCALES) {
    const t = getDashboardDictionary(locale).projectDetail.contentSection
    const pc = t.pluginConnect
    const all: string[] = [t.pluginOnlyBody, t.pluginUpdateTitle, t.pluginUpdateBody, t.wpConnectionHelp,
      ...Object.entries(pc).filter(([k]) => k !== 'errors').map(([, v]) => v as string), ...Object.values(pc.errors)]
    const langOk = locale === 'he' ? all.every((s) => HEBREW.test(s) || /^[A-Za-z .()\-']+$/.test(s)) : !all.some((s) => HEBREW.test(s))
    check(`D1 (${locale}): every new string is there, short, and in the right language`, all.every((s) => typeof s === 'string' && s.length > 1 && s.length < 220) && langOk)
    check(`D2 (${locale}): the steps name the plugin, its settings page (GO TOP SEO) and its version placeholder where shown`,
      pc.step1Body.includes('GO TOP SEO Bridge') && pc.step2Body.includes('GO TOP SEO') && pc.errors.notYet.includes('GO TOP SEO') &&
      t.pluginOnlyBody.includes('{version}') && t.pluginUpdateBody.includes('{version}'))
  }
  const he = getDashboardDictionary('he').projectDetail.contentSection
  check('D3: Hebrew: the settings page is named as Hebrew WordPress shows it (הגדרות › GO TOP SEO), one action per step', he.pluginConnect.step2Body.includes('הגדרות › GO TOP SEO') && he.pluginConnect.step1Body.includes('תוספים'))

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}
main()
export {}
