/**
 * Site health, wave 8 — the plugin 2.1.0 and the smarter fixes, EXECUTED:
 *
 *   T) TITLES. A suggestion is never the current title (trimmed, case folded); a "too short" or missing
 *      title becomes 50–60 characters with the page's main keyword; model answers are only candidates
 *      and each is validated; when none passes there is NO automatic title.
 *   D) DESCRIPTIONS. 120–140 characters, never the current one, validated, else no automatic fix.
 *   F) FAQ. Questions and answers come from the page's own text, in its language; an answer with words
 *      or numbers the page does not have is dropped; a thin page says so and the model is not asked.
 *   H) ONE MAIN HEADING. The plan demotes only content headings the visitor really gets, keeps exactly
 *      one, and refuses builder pages, unsimple markup, theme headings and anything it cannot prove.
 *   P) THE PLUGIN 2.1.0, run for real (./plugin-harness.php) behind the app's own client (a replay
 *      bridge): h1_demote writes H2 with the words unchanged and undoes to the exact content; a builder
 *      page is refused; llms.txt is served only for GET/HEAD /llms.txt, never over a real file, and
 *      undone; its text check is the same in PHP and TypeScript.
 *   C) 2.0.0 INSTALLS. The real 2.0.0 plugin (from git) still takes every 2.0.0 fix from this app;
 *      the new types read `needs_update` for it and are never sent; the screen offers the update.
 *   B) "FIX {n} SAFE ITEMS". The server refuses anything outside the safe set (type, home page,
 *      equal/out-of-range values, a page fixed in the last 30 days, more than 25 pages) with
 *      not_bulk_safe and writes nothing; a batch is undone as a whole for 14 days, only its own jobs.
 *   S) SHOPIFY stays read-only; its llms.txt card says plainly it cannot be placed automatically.
 *   U) THE SCREEN. The row modes (update / copy), the strip's safe button, and both dictionaries.
 *
 * Every guard has a MUTATION CONTROL (a broken copy must fail it).
 * Run: npx tsx lib/site-fix/__qa__/site-fix-w8.qa.ts
 */
/* eslint-disable @typescript-eslint/no-require-imports */
import { execFileSync, spawnSync } from 'child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { FakeAdmin } from '../../__qa__/_fake-admin'
import * as API from '../api'
import * as CHANNEL from '../channel'
import * as H1 from '../h1'
import * as SUGGEST from '../suggest'
import * as BULK from '../bulk'
import * as RULES from '../../site-health/rules'
import { llmsTextOk } from '../whitelist'
import { pairingCode } from '../plugin-auth'
import type { PluginPost } from '../plugin-client'
import type { LivePage } from '../preview'
import { FIX_TYPES, type FixCapabilities, type FixJobView } from '../types'
import AutoFixStrip from '../../../components/site-health/AutoFixStrip'
import FindingCard from '../../../components/site-health/FindingCard'
import { getDashboardDictionary } from '../../i18n/dashboard/getDashboardDictionary'
import type { Finding } from '../../site-health/types'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const PLUGIN = join(ROOT, 'wordpress-plugin', 'gotop-seo-bridge')
const HARNESS = join(__dirname, 'plugin-harness.php')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

/** A copy of one module with one change, its imports pointed back at the repo. */
function mutant<T>(rel: string, from: string, to: string): { mod: T | null; found: boolean } {
  const src = read(rel)
  const found = src.includes(from)
  if (!found) return { mod: null, found }
  // Inside the repo, so a component's packages (react, lucide-react) resolve from node_modules.
  const dir = mkdtempSync(join(ROOT, 'lib', 'site-fix', '__qa__', '.mutant-'))
  try {
    const here = join(ROOT, rel, '..')
    const body = src.split(from).join(to)
      .replace(/from '@\/([^']+)'/g, (_m, p) => `from '${join(ROOT, p)}'`)
      .replace(/from '\.\/([^']+)'/g, (_m, p) => `from '${join(here, p)}'`)
    const file = join(dir, rel.split('/').pop()!)
    writeFileSync(file, rel.endsWith('.tsx') ? `import React from 'react'\n${body}` : body)
    return { mod: require(file) as T, found }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

// ── The plugin, run for real ────────────────────────────────────────────────
type Step = Record<string, unknown>
type Res = { status?: number; body?: Record<string, unknown>; content?: string; meta?: Record<string, string>; value?: unknown }
function run(steps: Step[], dir = PLUGIN, env: Record<string, string> = {}): Res[] {
  const tmp = mkdtempSync(join(tmpdir(), 'site-fix-w8-harness-'))
  try {
    const file = join(tmp, 'calls.json')
    writeFileSync(file, JSON.stringify(steps))
    const r = spawnSync('php', [HARNESS, dir, file], { encoding: 'utf8', env: { ...process.env, ...env } })
    if (r.status !== 0) throw new Error(`harness failed: ${r.stderr || r.stdout}`.slice(0, 600))
    return JSON.parse(r.stdout) as Res[]
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}
function mutantPlugin(file: string, from: string, to: string): { dir: string; found: boolean; done: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'site-fix-w8-plugin-'))
  cpSync(PLUGIN, dir, { recursive: true })
  const path = join(dir, file)
  const src = readFileSync(path, 'utf8')
  writeFileSync(path, src.split(from).join(to))
  return { dir, found: src.includes(from), done: () => rmSync(dir, { recursive: true, force: true }) }
}
/** The plugin as it was released (2.0.0), from git history: what the owner has installed today. */
function plugin200(): { dir: string; done: () => void } | null {
  const dir = mkdtempSync(join(tmpdir(), 'site-fix-w8-200-'))
  try {
    const MAIN = 'wordpress-plugin/gotop-seo-bridge/gotop-seo-bridge.php'
    const commits = execFileSync('git', ['rev-list', 'HEAD', '--', MAIN], { cwd: ROOT, encoding: 'utf8' }).trim().split('\n')
    const at = commits.find((c) => /Version:\s+2\.0\.0/.test(execFileSync('git', ['show', `${c}:${MAIN}`], { cwd: ROOT, encoding: 'utf8' })))
    if (!at) throw new Error('no 2.0.0 in history')
    const tree = execFileSync('git', ['ls-tree', '-r', '--name-only', at, 'wordpress-plugin/gotop-seo-bridge'], { cwd: ROOT, encoding: 'utf8' }).trim().split('\n')
    for (const f of tree) {
      const out = join(dir, f.replace('wordpress-plugin/gotop-seo-bridge/', ''))
      mkdirSync(join(out, '..'), { recursive: true })
      writeFileSync(out, execFileSync('git', ['show', `${at}:${f}`], { cwd: ROOT }))
    }
    return { dir, done: () => rmSync(dir, { recursive: true, force: true }) }
  } catch {
    rmSync(dir, { recursive: true, force: true })
    return null
  }
}

const U = '11111111-1111-4111-8111-111111111111'
const P = 'a1111111-2222-4333-8444-555555555555'
const SITE = 'https://shop.example.org'
const KEY = { keyId: 'gtk_0123456789abcdef', secret: 'A'.repeat(43) }
const pairStep: Step = { rest: '/gotop/v1/pair', body: JSON.stringify({ code: pairingCode(KEY) }), can: ['manage_options'] }
let idN = 0
const newId = () => `${String(++idN).padStart(8, '0')}-aaaa-4bbb-8ccc-${String(idN).padStart(12, '0')}`

/**
 * The app's plugin client talking to the REAL plugin: every call replays the whole conversation in
 * one harness run (same state, fresh nonces store), and answers with the last result.
 */
function bridge(setup: Step[], opts: { dir?: string; env?: Record<string, string> } = {}) {
  const steps: Step[] = [pairStep, ...setup]
  const calls: string[] = []
  const post = (async (_site: string, route: string, body: string, o: { headers: Record<string, string> }) => {
    calls.push(route)
    steps.push({ rest: `/gotop/v1${route}`, headers: o.headers, body })
    const res = run(steps, opts.dir, opts.env)
    const last = res[res.length - 1]
    return { status: last.status ?? 500, body: JSON.stringify(last.body ?? {}) }
  }) as unknown as PluginPost
  const peek = (extra: Step[]) => run([...steps, ...extra], opts.dir, opts.env).slice(steps.length)
  return { post, calls, peek }
}

const link = (version: string) => ({
  project_id: P, user_id: U, site_url: SITE, key_id: KEY.keyId, secret_encrypted: 'enc:secret', secret_hint: '••••AAAA',
  status: 'connected', plugin_version: version, seo_plugin: 'none', last_seen_at: null, last_error_code: null,
})
type Row = Record<string, unknown>
const rows = (version = '2.1.0', over: Record<string, Row[]> = {}): Record<string, Row[]> => ({
  projects: [{ id: P, user_id: U, target_domain: 'shop.example.org', business_name: 'Boot Shop', name: 'Boots' }],
  project_profiles: [{ project_id: P, user_id: U, detected_platform: 'wordpress' }],
  site_fix_plugin_links: [link(version)],
  site_fix_jobs: [] as Row[],
  site_fix_audit: [] as Row[],
  ...over,
})
function depsFor(admin: FakeAdmin, over: Partial<API.FixesDeps> = {}): API.FixesDeps {
  return {
    userId: U, ip: '203.0.113.9', admin: admin as never,
    decrypt: (s) => (s === 'enc:secret' ? KEY.secret : 'app-pass'),
    encrypt: (s) => `enc:${s.length}`,
    wp: {} as API.FixesDeps['wp'], readLive: async () => null, newId, ...over,
  }
}
const live = (over: Partial<LivePage>): LivePage => ({ title: null, description: null, h1: null, canonical: null, schemaTypes: [], html: '', ...over })
const bodyOf = (a: API.Answer) => a.body as Record<string, unknown> & { ok?: boolean; code?: string; job?: FixJobView }

const STORY = `${SITE}/story/`
const STORY_HTML = '<!-- wp:heading {"level":1} -->\n<h1 class="wp-block-heading">Our story</h1>\n<!-- /wp:heading -->\n<p>We started in a small workshop in Haifa &amp; still sew every pair there.</p>\n<h1 id="visit">Visit us</h1>\n<p>Open Sunday to Thursday.</p>'
const storyPost = (meta: Record<string, string> = {}): Step => ({ setpost: 41, url: STORY, title: 'Our story', content: STORY_HTML, meta })

async function main() {
  console.log('Site health wave 8 — plugin 2.1.0, suggestions, one-click safe fixes\n')
  const hasPhp = spawnSync('php', ['-v'], { encoding: 'utf8' }).status === 0

  // ── T) titles ─────────────────────────────────────────────────────────────
  console.log('T) titles')
  {
    const input: RULES.TitleInput = { kind: 'title_short', current: 'Boots', h1: 'Leather hiking boots', siteName: 'Boot Shop', keyword: 'Leather hiking boots', path: '/boots' }
    check('T1: the current title, re-spaced and re-cased, is never a suggestion', RULES.titleProblem('  BOOTS ', input) === 'same_as_current')
    check('T2: a "too short" fix under 50 characters is refused', RULES.titleProblem('Leather hiking boots | Boot Shop', input) === 'length')
    check('T3: a 50–60 title without the main keyword is refused', RULES.titleProblem('Handmade footwear for every trail, sewn in Haifa | Boots', input) === 'no_keyword')
    const good = 'Leather hiking boots, handmade in Haifa | Boot Shop'
    check('T4: a 50–60 title with the keyword passes', RULES.titleProblem(good, input) === null, String(good.length))
    let asked = 0
    const echo: SUGGEST.Generate = async () => { asked++; return JSON.stringify({ titles: ['Boots', 'boots ', 'Leather hiking boots'] }) }
    const none = await SUGGEST.suggestSeoTitle(input, echo)
    check('T5: model answers that equal the current title or are too short give NO automatic title (asked twice, then null)', none === null && asked === 2, `${none} asked=${asked}`)
    const picked = await SUGGEST.suggestSeoTitle(input, async () => JSON.stringify({ titles: ['Boots', 'Handmade footwear for every trail, sewn in Haifa | Boots', good] }))
    check('T6: the first model answer that passes is taken', picked === good, String(picked))
    const noModel = await SUGGEST.suggestSeoTitle(input)
    check('T7: without a model and without enough words on the page: null (no automatic fix)', noModel === null)
    const longIn: RULES.TitleInput = { kind: 'title_long', current: 'Handmade leather boots for hiking and everyday wear in all seasons | Boot Shop Ltd', h1: null, siteName: 'Boot Shop', keyword: null, path: '/boots' }
    const longS = await SUGGEST.suggestSeoTitle(longIn)
    check('T8: a long title becomes 30–60 characters, different from the current one', !!longS && longS.length >= 30 && longS.length <= 60 && !RULES.sameText(longS, longIn.current), String(longS))
    const m = mutant<typeof RULES>('lib/site-health/rules.ts', "  if (sameText(v, input.current)) return 'same_as_current'\n", '')
    check('MUTATION CONTROL: a title check that lets the current title through is caught by T1', m.found && !!m.mod && m.mod.titleProblem('  BOOTS ', input) !== 'same_as_current')
  }

  // ── D) descriptions ───────────────────────────────────────────────────────
  console.log('\nD) descriptions')
  {
    const text = 'Our boots are handmade in Tel Aviv from full-grain leather by a small team. Each pair is resoled for free for two full years after you buy it. Order online and we ship in two days.'
    const s1 = await SUGGEST.suggestMetaDescription({ current: null, text, title: 'Boots' })
    check('D1: from the page, 120–140 characters', !!s1 && s1.length >= 120 && s1.length <= 140, `${s1?.length} ${s1}`)
    const other = 'Full-grain leather hiking boots, handmade in Tel Aviv by a small team, resoled for free for two years and shipped in two days.'
    const s2 = await SUGGEST.suggestMetaDescription({ current: s1, text, title: 'Boots' }, async () => JSON.stringify({ descriptions: [` ${String(s1).toUpperCase()} `, other] }))
    check('D2: never the current description: a model answer equal to it is skipped, the next valid one taken', s2 === other, `${other.length} ${s2}`)
    const s2b = await SUGGEST.suggestMetaDescription({ current: s1, text, title: 'Boots' })
    check('D2b: without another valid one: no automatic description (null), never the current one', s2b === null, String(s2b))
    check('D3: 119 and 141 characters are refused; 120 and 140 pass', RULES.descriptionProblem('x'.repeat(119), null) === 'length' && RULES.descriptionProblem('x'.repeat(141), null) === 'length'
      && RULES.descriptionProblem('x'.repeat(120), null) === null && RULES.descriptionProblem('x'.repeat(140), null) === null)
    const tooLong = 'y'.repeat(150)
    const s3 = await SUGGEST.suggestMetaDescription({ current: null, text: 'Short page. Only a line.', title: 'Boots' }, async () => JSON.stringify({ descriptions: [tooLong] }))
    check('D4: a page too short to describe and a model answer out of range give no automatic description', s3 === null, String(s3))
    const m = mutant<typeof RULES>('lib/site-health/rules.ts', 'export const DESCRIPTION_GOAL = { min: 120, max: 140 } as const', 'export const DESCRIPTION_GOAL = { min: 120, max: 160 } as const')
    check('MUTATION CONTROL: a description range widened to 160 is caught by D3', m.found && !!m.mod && m.mod.descriptionProblem('x'.repeat(141), null) === null)
  }

  // ── F) FAQ ────────────────────────────────────────────────────────────────
  console.log('\nF) FAQ from the page')
  const PAGE = [
    'We make leather hiking boots by hand in our Haifa workshop. Every pair is cut from full-grain leather and stitched with waxed thread.',
    'Shipping inside Israel takes two to four business days, and shipping to Europe takes seven to ten business days.',
    'Every pair can be resoled for free during the first two years after purchase. Send the boots to the workshop and we return them within fourteen days.',
    'Sizes run from 36 to 47. If a pair does not fit, you can exchange it within 30 days as long as the boots were not worn outside.',
    'To care for the leather, clean it with a damp cloth and apply our natural wax every three months. Keep the boots away from direct heat when they dry.',
    'The workshop is open to visitors from Sunday to Thursday, and you can try every model on before you buy.',
  ].join(' ')
  {
    let asked = 0
    const thin = await SUGGEST.suggestFaq({ text: 'Boots. Contact us.', title: 'Boots' }, async () => { asked++; return '{"items":[]}' })
    check('F1: a thin page says so (thin_content) and the model is not asked', !thin.ok && thin.code === 'thin_content' && asked === 0)
    const answer = JSON.stringify({ items: [
      { q: 'How long does shipping to Europe take?', a: 'Shipping to Europe takes seven to ten business days.' },
      { q: 'Can the boots be resoled?', a: 'Every pair can be resoled for free during the first two years after purchase.' },
      { q: 'Do you offer a lifetime warranty?', a: 'Yes, all boots carry a lifetime warranty and a free cleaning kit worth 99 dollars.' },
      { q: 'What sizes do you make?', a: 'Sizes run from 36 to 49.' },
    ] })
    const ok = await SUGGEST.suggestFaq({ text: PAGE, title: 'Boots' }, async () => answer)
    const qs = ok.ok ? ok.items.map((i) => i.q) : []
    check('F2: answers the page states are kept', ok.ok && qs.includes('How long does shipping to Europe take?') && qs.includes('Can the boots be resoled?'), JSON.stringify(qs))
    check('F3: an invented answer (warranty, 99) and a wrong number (49) are dropped', ok.ok && !qs.includes('Do you offer a lifetime warranty?') && !qs.includes('What sizes do you make?'), JSON.stringify(qs))
    check('F4: an English page gets an English heading', ok.ok && ok.heading === 'Frequently asked questions')
    const invented = await SUGGEST.suggestFaq({ text: PAGE, title: 'Boots' }, async () => JSON.stringify({ items: [
      { q: 'Do you offer a lifetime warranty?', a: 'Yes, all boots carry a lifetime warranty and a free cleaning kit worth 99 dollars.' },
      { q: 'Is there a store in Tel Aviv?', a: 'Our flagship store is on Dizengoff street in Tel Aviv.' },
    ] }))
    check('F5: when nothing is grounded: no_valid_suggestion (the form stays empty, nothing is invented)', !invented.ok && invented.code === 'no_valid_suggestion')
    const HE = 'אנחנו מייצרים מגפי הליכה מעור בעבודת יד בסדנה שלנו בחיפה. כל זוג נחתך מעור מלא ונתפר בחוט שעווה. משלוח בתוך ישראל לוקח שניים עד ארבעה ימי עסקים, ומשלוח לאירופה לוקח שבעה עד עשרה ימי עסקים. כל זוג אפשר לחדש בחינם בשנתיים הראשונות אחרי הקנייה. שולחים את המגפיים לסדנה ואנחנו מחזירים אותם תוך ארבעה עשר יום. המידות הן מ-36 עד 47. אם הזוג לא מתאים, אפשר להחליף אותו תוך 30 יום כל עוד המגפיים לא נעלו בחוץ. כדי לשמור על העור מנקים אותו במטלית לחה ומורחים שעווה טבעית כל שלושה חודשים. הסדנה פתוחה למבקרים מיום ראשון עד חמישי, ואפשר למדוד כל דגם לפני הקנייה. אנחנו עונים לשאלות בטלפון ובוואטסאפ בשעות הפתיחה של הסדנה ושמחים לעזור בבחירת המידה.'
    const he = await SUGGEST.suggestFaq({ text: HE, title: 'מגפיים' }, async () => JSON.stringify({ items: [
      { q: 'כמה זמן לוקח משלוח לאירופה?', a: 'משלוח לאירופה לוקח שבעה עד עשרה ימי עסקים.' },
      { q: 'אפשר לחדש את המגפיים?', a: 'כל זוג אפשר לחדש בחינם בשנתיים הראשונות אחרי הקנייה.' },
    ] }))
    check('F6: a Hebrew page: Hebrew heading, Hebrew answers from the page are kept', he.ok && he.heading === 'שאלות נפוצות' && he.items.length === 2, JSON.stringify(he))
    const m = mutant<typeof SUGGEST>('lib/site-fix/suggest.ts', '    if (!grounded(a, text)) continue\n', '')
    const mm = m.mod ? await m.mod.suggestFaq({ text: PAGE, title: 'Boots' }, async () => answer) : null
    check('MUTATION CONTROL: an FAQ that skips the grounding check is caught by F3', m.found && !!mm && mm.ok && mm.items.some((i) => i.q === 'Do you offer a lifetime warranty?'))
    const t = mutant<typeof SUGGEST>('lib/site-fix/suggest.ts', '  if (thinContent(text)) return { ok: false, code: \'thin_content\', heading, language }\n', '')
    let asked2 = 0
    const tt = t.mod ? await t.mod.suggestFaq({ text: 'Boots. Contact us.', title: 'Boots' }, async () => { asked2++; return '{"items":[]}' }) : null
    check('MUTATION CONTROL: an FAQ that asks the model about a thin page is caught by F1', t.found && !!tt && (tt.ok || tt.code !== 'thin_content' || asked2 > 0))
  }

  // ── H) the heading plan ───────────────────────────────────────────────────
  console.log('\nH) one main heading: only where provably safe')
  {
    const plan = H1.planH1Demotion
    const a = plan({ contentH1: ['Our story', 'Visit us'], liveH1: ['Story page', 'Our story', 'Visit us'], builder: false })
    check('H1: the theme\'s heading stays; both content headings become H2', a.ok && a.keepFrom === 'theme' && a.keep === 'Story page' && a.demote.map((d) => d.n).join() === '0,1', JSON.stringify(a))
    const b = plan({ contentH1: ['Our story', 'Visit us', 'Our team'], liveH1: ['Our story', 'Visit us', 'Our team'], builder: false })
    check('H2: no theme heading: the content\'s first stays, the rest become H2', b.ok && b.keepFrom === 'content' && b.keep === 'Our story' && b.demote.map((d) => d.n).join() === '1,2', JSON.stringify(b))
    check('H3: a page-builder page is never changed', !plan({ contentH1: ['A', 'B'], liveH1: ['A', 'B'], builder: true }).ok)
    const theme = plan({ contentH1: [], liveH1: ['Logo', 'Story page'], builder: false })
    check('H4: headings from the theme or a template: instructions (theme)', !theme.ok && theme.reason === 'theme')
    const two = plan({ contentH1: ['Our story', 'Visit us'], liveH1: ['Logo', 'Story page', 'Our story', 'Visit us'], builder: false })
    check('H5: the theme itself has two main headings: instructions (theme)', !two.ok && two.reason === 'theme')
    const unproven = plan({ contentH1: ['Our story', 'Hidden heading'], liveH1: ['Our story', 'Visit us'], builder: false })
    check('H6: a content heading the visitor does not get: unproven', !unproven.ok && unproven.reason === 'unproven')
    check('H7: markup we cannot read (null) is never changed', (() => { const r = plan({ contentH1: null, liveH1: ['A', 'B'], builder: false }); return !r.ok && r.reason === 'markup' })())
    const m = mutant<typeof H1>('lib/site-fix/h1.ts', "  if (left.length >= 2) return { ok: false, reason: 'theme' }\n", '')
    const mt = m.mod ? m.mod.planH1Demotion({ contentH1: ['Our story', 'Visit us'], liveH1: ['Logo', 'Story page', 'Our story', 'Visit us'], builder: false }) : null
    check('MUTATION CONTROL: a plan that changes the page while the theme keeps two headings is caught by H5', m.found && !!mt && mt.ok)
  }

  // ── P) the plugin 2.1.0, for real ─────────────────────────────────────────
  console.log('\nP) the plugin 2.1.0, run for real behind the app')
  if (!hasPhp) {
    check('P0: php is on this machine (the plugin checks need it)', false, 'php not found')
  } else {
    // H1: preview → approve → the post → undo, through the app's own client and API.
    {
      const b = bridge([storyPost()])
      const admin = new FakeAdmin(rows())
      const deps = depsFor(admin, { pluginPost: b.post, readLive: async (u) => (u === STORY ? live({ h1: 'Story page', h1s: ['Story page', 'Our story', 'Visit us'] }) : null) })
      const pv = bodyOf(await API.handleFixesPost({ projectId: P, action: 'preview', type: 'h1_demote', kind: 'h1_multiple', url: STORY }, deps))
      const heads = pv.headings as { n: number; text: string }[] | undefined
      check('P1: the preview reads the content\'s headings from the plugin and keeps the theme\'s', pv.ok === true && pv.keep === 'Story page' && JSON.stringify(heads) === JSON.stringify([{ n: 0, text: 'Our story' }, { n: 1, text: 'Visit us' }]), JSON.stringify(pv))
      const ap = bodyOf(await API.handleFixesPost({ projectId: P, action: 'approve', approved: true, kind: 'h1_multiple', pageUrl: STORY, fix: { type: 'h1_demote', headings: heads }, expected: pv.expected, via: null, before: null }, deps))
      const after = b.peek([{ post: 41 }])[0].content ?? ''
      check('P2: approved: applied, and the post holds H2 with the same words, attributes and block', ap.job?.status === 'applied'
        && after.includes('<h2 class="wp-block-heading">Our story</h2>') && after.includes('<h2 id="visit">Visit us</h2>') && after.includes('<!-- wp:heading {"level":2} -->') && !/<h1\b/.test(after), after)
      const words = (s: string) => s.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
      check('P3: the text a visitor reads is unchanged', words(after.replace(/<!--[\s\S]*?-->/g, '')) === words(STORY_HTML.replace(/<!--[\s\S]*?-->/g, '')))
      const un = bodyOf(await API.handleFixesPost({ projectId: P, action: 'undo', jobId: ap.job?.id }, deps))
      const back = b.peek([{ post: 41 }])[0].content
      check('P4: undo puts back the exact content', un.ok === true && back === STORY_HTML, String(back))
    }
    // A builder page: the preview says why; the plugin refuses even a direct write.
    {
      const b = bridge([storyPost({ _elementor_edit_mode: 'builder' })])
      const admin = new FakeAdmin(rows())
      const deps = depsFor(admin, { pluginPost: b.post, readLive: async () => live({ h1s: ['Story page', 'Our story', 'Visit us'] }) })
      const pv = bodyOf(await API.handleFixesPost({ projectId: P, action: 'preview', type: 'h1_demote', kind: 'h1_multiple', url: STORY }, deps))
      check('P5: a page-builder page: h1_not_safe with the reason "builder" (instructions instead)', pv.ok === false && pv.code === 'h1_not_safe' && pv.reason === 'builder', JSON.stringify(pv))
      const ap = bodyOf(await API.handleFixesPost({ projectId: P, action: 'approve', approved: true, kind: 'h1_multiple', pageUrl: STORY, fix: { type: 'h1_demote', headings: [{ n: 1, text: 'Visit us' }] }, expected: null, via: null, before: null }, deps))
      const after = b.peek([{ post: 41 }])[0].content
      check('P6: …and the plugin refuses a direct write to it (h1_not_safe), nothing changes', ap.job?.status === 'failed' && ap.job?.errorCode === 'h1_not_safe' && after === STORY_HTML, JSON.stringify(ap.job))
      const m = mutantPlugin('includes/fixes.php', "if (gotop_seo_bridge_builder_page($post->ID, $content)) { return array('ok' => false, 'code' => 'builder_page'); }", '')
      try {
        const mb = bridge([storyPost({ _elementor_edit_mode: 'builder' })], { dir: m.dir })
        const md = depsFor(new FakeAdmin(rows()), { pluginPost: mb.post })
        await API.handleFixesPost({ projectId: P, action: 'approve', approved: true, kind: 'h1_multiple', pageUrl: STORY, fix: { type: 'h1_demote', headings: [{ n: 1, text: 'Visit us' }] }, expected: null, via: null, before: null }, md)
        check('MUTATION CONTROL: a plugin without the builder check is caught by P6', m.found && mb.peek([{ post: 41 }])[0].content !== STORY_HTML)
      } finally { m.done() }
    }
    // Words changed since the preview: nothing is written.
    {
      const r = run([pairStep, storyPost(), { rest: '/gotop/v1/fix', ...signedFix({ job_id: newId(), type: 'h1_demote', url: STORY, value: { headings: [{ n: 1, text: 'Visit us today' }] } }) }, { post: 41 }])
      check('P7: headings whose words changed since the preview are refused (changed_since_preview), nothing written', r[2].body?.code === 'changed_since_preview' && r[3].content === STORY_HTML, JSON.stringify(r[2].body))
    }
    // llms.txt: preview → approve → served → undo.
    {
      const b = bridge([])
      const admin = new FakeAdmin(rows())
      const pages: Record<string, LivePage> = {
        [`${SITE}/`]: live({ title: 'Boot Shop | Handmade boots', description: 'Handmade leather hiking boots from our Haifa workshop, resoled free for two years.', links: [`${SITE}/about/`, `${SITE}/blog/waterproof-boots/`, `${SITE}/cart/?x=1`] }),
        [`${SITE}/about/`]: live({ title: 'About us | Boot Shop', h1: 'About us', description: 'Who we are and how every pair is made by hand.' }),
        [`${SITE}/blog/waterproof-boots/`]: live({ title: 'Waterproof boots', h1: 'Waterproof boots', description: 'How to keep leather boots dry on the trail.' }),
      }
      const deps = depsFor(admin, { pluginPost: b.post, readLive: async (u) => pages[u] ?? null, readText: async () => ({ status: 404, text: '<html>Not found</html>' }) })
      const pv = bodyOf(await API.handleFixesPost({ projectId: P, action: 'preview', type: 'llms_txt', kind: 'llms_missing', url: `${SITE}/` }, deps))
      const text = String(pv.text ?? '')
      check('P8: the preview builds the text from the site: name, one line, key pages with a line each', pv.ok === true && pv.copyOnly === false && text.startsWith('# Boot Shop\n') && text.includes('> Handmade leather hiking boots')
        && text.includes(`(${SITE}/about/): Who we are`) && !text.includes('cart'), text)
      check('P9: the text passes the same check the plugin runs', llmsTextOk(text) === text)
      const edited = `${text}\nExtra line the merchant added.\n`
      const ap = bodyOf(await API.handleFixesPost({ projectId: P, action: 'approve', approved: true, kind: 'llms_missing', pageUrl: `${SITE}/`, fix: { type: 'llms_txt', text: edited }, expected: null, via: null, before: null }, deps))
      const served = b.peek([{ llms: '/llms.txt' }, { llms: '/llms.txt', method: 'HEAD' }, { llms: '/llms.txt', method: 'POST' }, { llms: '/llms.txt.bak' }, { llms: '/blog/llms.txt' }])
      check('P10: approved (with the merchant\'s edit): WordPress answers it at /llms.txt', ap.job?.status === 'applied' && served[0].value === llmsTextOk(edited), JSON.stringify(served[0]))
      check('P11: only GET/HEAD of exactly /llms.txt; nothing else is answered', served[1].value !== null && served[2].value === null && served[3].value === null && served[4].value === null)
      const un = bodyOf(await API.handleFixesPost({ projectId: P, action: 'undo', jobId: ap.job?.id }, deps))
      check('P12: undo removes it (the site answers nothing again)', un.ok === true && b.peek([{ llms: '/llms.txt' }])[0].value === null)
      const real = bodyOf(await API.handleFixesPost({ projectId: P, action: 'preview', type: 'llms_txt', kind: 'llms_missing', url: `${SITE}/` },
        { ...deps, readText: async () => ({ status: 200, text: '# Our own llms.txt\n\n- [Home](https://shop.example.org/)\n' }) }))
      check('P13: a site that already has an llms.txt: llms_exists, nothing offered', real.ok === false && real.code === 'llms_exists')
    }
    // A real llms.txt file on the server always wins.
    {
      const root = mkdtempSync(join(tmpdir(), 'site-fix-w8-root-'))
      try {
        writeFileSync(join(root, 'llms.txt'), '# Real file\n')
        const TEXT = '# Boot Shop\n\n> Handmade boots.\n'
        const r = run([pairStep, { rest: '/gotop/v1/fix', ...signedFix({ job_id: newId(), type: 'llms_txt', url: `${SITE}/`, value: { text: TEXT } }) }, { option: 'gotop_seo_bridge_llms' }], PLUGIN, { GOTOP_HARNESS_ROOT: root })
        check('P14: with an llms.txt file on the server the plugin refuses (file_exists) and stores nothing', r[1].status === 409 && r[1].body?.code === 'file_exists' && r[2].value === null, JSON.stringify(r[1]))
        // Stored first, file added later: the file is never shadowed.
        const noFile = mkdtempSync(join(tmpdir(), 'site-fix-w8-root2-'))
        const steps = [pairStep, { rest: '/gotop/v1/fix', ...signedFix({ job_id: newId(), type: 'llms_txt', url: `${SITE}/`, value: { text: TEXT } }) }]
        const before = run([...steps, { llms: '/llms.txt' }], PLUGIN, { GOTOP_HARNESS_ROOT: noFile })
        writeFileSync(join(noFile, 'llms.txt'), '# Added later\n')
        const later = run([...steps, { llms: '/llms.txt' }], PLUGIN, { GOTOP_HARNESS_ROOT: noFile })
        rmSync(noFile, { recursive: true, force: true })
        check('P15: a file added after the fix wins: the plugin stops answering', before[2].value === TEXT && later[2].value === null, `${JSON.stringify(before[2])} ${JSON.stringify(later[2])}`)
        const m = mutantPlugin('includes/llms.php', "    if (gotop_seo_bridge_llms_file_exists()) { return array('ok' => false, 'code' => 'file_exists'); }\n", '')
        try {
          const mr = run([pairStep, { rest: '/gotop/v1/fix', ...signedFix({ job_id: newId(), type: 'llms_txt', url: `${SITE}/`, value: { text: TEXT } }) }], m.dir, { GOTOP_HARNESS_ROOT: root })
          check('MUTATION CONTROL: a plugin that writes over a real llms.txt is caught by P14', m.found && mr[1].body?.ok === true)
        } finally { m.done() }
      } finally { rmSync(root, { recursive: true, force: true }) }
    }
    // The text check: PHP and TypeScript agree on every sample.
    {
      const samples = [
        '# Shop\n\n> About the shop.\n\n- [Home](https://shop.example.org/): the start\n',
        '# Shop\r\n\r\n> Windows line ends are fine.\r\n',
        '# Shop\n\n<script>alert(1)</script>\n',
        '# Shop\n\n- a -> b arrow in the middle\n',
        'Shop without a heading line at the top of it\n',
        '# Tiny\n',
        `# Shop\n\n${'x'.repeat(2001)}\n`,
        '# חנות מגפיים\n\n> מגפי עור בעבודת יד מחיפה.\n\n- [אודות](https://shop.example.org/about/): מי אנחנו\n',
        '# Shop\n\n> > nested quote is fine\n',
        '# Shop\n\nA bell \u0007 character inside the text\n',
      ]
      const php = spawnSync('php', ['-r', `define('ABSPATH', sys_get_temp_dir() . '/gotop-w8-none/'); function add_action() {} require '${join(PLUGIN, 'includes', 'llms.php')}'; echo json_encode(array_map('gotop_seo_bridge_llms_text_ok', json_decode(stream_get_contents(STDIN), true)), JSON_UNESCAPED_UNICODE);`], { input: JSON.stringify(samples), encoding: 'utf8' })
      const phpOut = JSON.parse(php.stdout || '[]') as (string | null)[]
      const tsOut = samples.map((s) => llmsTextOk(s))
      check('P16: the llms.txt text check is the same in the plugin and the app (10 samples)', JSON.stringify(phpOut) === JSON.stringify(tsOut), `${JSON.stringify(phpOut)}\n${JSON.stringify(tsOut)}`)
      check('P17: …markup, a stray ">", a missing "# " heading, a 2001-byte line and control characters are refused', tsOut[2] === null && tsOut[3] === null && tsOut[4] === null && tsOut[6] === null && tsOut[9] === null && tsOut[0] !== null && tsOut[7] !== null)
    }
  }

  // ── C) 2.0.0 installs ─────────────────────────────────────────────────────
  console.log('\nC) the installed 2.0.0 keeps working; new types wait for the update')
  {
    const ctx = (version: string): CHANNEL.FixContext => ({ shopify: false, wordpressDetected: true, creds: null, plugin: link(version) as never, pluginLink: { siteUrl: SITE, keyId: KEY.keyId, secret: KEY.secret }, webhook: null, siteUrls: [SITE] })
    const c200 = CHANNEL.resolveCapabilities(ctx('2.0.0'), true)
    const old = FIX_TYPES.filter((t) => t !== 'h1_demote' && t !== 'llms_txt')
    check('C1: with 2.0.0 every 2.0.0 type still goes through the plugin', old.every((t) => c200.channelFor[t] === 'plugin'), JSON.stringify(c200.channelFor))
    check('C2: …and h1_demote / llms_txt read needs_update (never sent to the old plugin)', c200.channelFor.h1_demote === 'needs_update' && c200.channelFor.llms_txt === 'needs_update')
    const c210 = CHANNEL.resolveCapabilities(ctx('2.1.0'), true)
    check('C3: with 2.1.0 they go through the plugin', c210.channelFor.h1_demote === 'plugin' && c210.channelFor.llms_txt === 'plugin' && c210.pluginLatest === '2.1.0')
    const m = mutant<typeof CHANNEL>('lib/site-fix/channel.ts', "pluginSupports(version, type) ? 'plugin' : 'needs_update'", "'plugin'")
    check('MUTATION CONTROL: sending the new types to a 2.0.0 plugin is caught by C2', m.found && !!m.mod && m.mod.resolveCapabilities(ctx('2.0.0'), true).channelFor.h1_demote === 'plugin')

    const statusCalls: string[] = []
    const oldStatus = (async (_s: string, route: string) => {
      statusCalls.push(route)
      if (route === '/status') return { status: 200, body: JSON.stringify({ ok: true, version: '2.0.0', seo_plugin: 'none', fix_types: old }) }
      return { status: 200, body: JSON.stringify({ ok: true, item: {} }) }
    }) as unknown as PluginPost
    const admin = new FakeAdmin(rows('2.0.0'))
    const deps = depsFor(admin, { pluginPost: oldStatus })
    const pv = await API.handleFixesPost({ projectId: P, action: 'preview', type: 'h1_demote', kind: 'h1_multiple', url: STORY }, deps)
    const ap = await API.handleFixesPost({ projectId: P, action: 'approve', approved: true, kind: 'h1_multiple', pageUrl: STORY, fix: { type: 'h1_demote', headings: [{ n: 1, text: 'Visit us' }] }, expected: null, via: null, before: null }, deps)
    check('C4: preview and approve of h1_demote on 2.0.0: needs_update (409); the version is read again first; no fix is sent',
      pv.status === 409 && bodyOf(pv).code === 'needs_update' && ap.status === 409 && bodyOf(ap).code === 'needs_update' && statusCalls.includes('/status') && !statusCalls.includes('/fix') && !statusCalls.includes('/inspect'), `${pv.status} ${JSON.stringify(ap.body)} ${statusCalls}`)
    const llmsOld = bodyOf(await API.handleFixesPost({ projectId: P, action: 'preview', type: 'llms_txt', kind: 'llms_missing', url: `${SITE}/` },
      depsFor(new FakeAdmin(rows('2.0.0')), { pluginPost: oldStatus, readText: async () => ({ status: 404, text: '' }),
        readLive: async (u) => (u === `${SITE}/` ? live({ title: 'Boot Shop', description: 'Handmade leather boots from Haifa.', links: [`${SITE}/about/`] }) : live({ title: 'About us', h1: 'About us', description: 'Who we are.' })) })))
    check('C5: llms.txt on 2.0.0: the same text, as a copy to place by hand (copyOnly)', llmsOld.ok === true && llmsOld.copyOnly === true && String(llmsOld.text).startsWith('# Boot Shop'), JSON.stringify(llmsOld))

    const p200 = hasPhp ? plugin200() : null
    if (!p200) {
      check('C6: the released 2.0.0 plugin can be read from git', false, 'git show origin/main failed')
    } else {
      try {
        const b = bridge([], { dir: p200.dir })
        const deps200 = depsFor(new FakeAdmin(rows('2.0.0')), { pluginPost: b.post, readLive: async () => live({ title: 'About us', description: 'We make boots by hand in Haifa.' }) })
        const ap200 = bodyOf(await API.handleFixesPost({ projectId: P, action: 'approve', approved: true, kind: 'title_long', pageUrl: `${SITE}/about/`, fix: { type: 'seo_title', value: 'About Boot Shop, handmade boots from Haifa' }, expected: null, via: null, before: 'About us' }, deps200))
        const meta = b.peek([{ post: 11 }])[0].meta ?? {}
        check('C6: the released 2.0.0 plugin still applies a title from this app (and keeps undo)', ap200.job?.status === 'applied' && Object.values(meta).includes('About Boot Shop, handmade boots from Haifa') && ap200.job?.canUndo === true, JSON.stringify(ap200.job))
        const direct = run([pairStep, storyPost(), { rest: '/gotop/v1/fix', ...signedFix({ job_id: newId(), type: 'h1_demote', url: STORY, value: { headings: [{ n: 1, text: 'Visit us' }] } }) }, { post: 41 }], p200.dir)
        check('C7: …and would refuse h1_demote itself (not_allowed), so the gate above is the only path', direct[2].body?.code === 'not_allowed' && direct[3].content === STORY_HTML)
      } finally { p200.done() }
    }
  }

  // ── B) the safe batch, on the server ──────────────────────────────────────
  console.log('\nB) "Fix {n} safe items": the server enforces the safe set')
  {
    const BATCH = '0b0b0b0b-1111-4222-8333-444444444444'
    const OTHER = '0c0c0c0c-1111-4222-8333-444444444444'
    const TITLE = 'Handmade leather hiking boots for every season | Boot Shop'
    const DESC = 'Handmade leather hiking boots from our Haifa workshop. Every pair is resoled for free for two years, and we ship in two days.'
    const fixCalls: string[] = []
    const plugin = (async (_s: string, route: string) => {
      fixCalls.push(route)
      if (route === '/fix') return { status: 200, body: JSON.stringify({ ok: true, status: 'applied', fix_id: 'f', post_id: 11, previous: 'Old' }) }
      if (route === '/undo') return { status: 200, body: JSON.stringify({ ok: true, status: 'reverted' }) }
      return { status: 404, body: '{}' }
    }) as unknown as PluginPost
    const job = (over: Row): Row => ({
      id: newId(), user_id: U, project_id: P, fix_type: 'seo_title', finding_kind: 'title_short', page_url: `${SITE}/p/`, payload: { value: 'x' }, before_value: 'Old', after_summary: 'x',
      channel: 'plugin', status: 'applied', error_code: null, undo: { expected: null, via: null }, remote_ref: null, approved_by: U,
      approved_at: new Date(Date.now() - 86_400_000).toISOString(), approved_ip: null, applied_at: new Date(Date.now() - 86_400_000).toISOString(), reverted_at: null,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...over,
    })
    const bulkApprove = async (deps: API.FixesDeps, page: string, fix: Record<string, unknown>, before: string | null, kind = 'title_short', batch = BATCH) =>
      API.handleFixesPost({ projectId: P, action: 'approve', approved: true, kind, pageUrl: page, fix, expected: before, via: null, before, bulk: { batch } }, deps)
    const cases = async (api: typeof API) => {
      const admin = new FakeAdmin(rows('2.1.0', { site_fix_jobs: [job({ page_url: `${SITE}/recent/`, undo: { batch: OTHER } })] }))
      const deps = depsFor(admin, { pluginPost: plugin })
      const h = api.handleFixesPost
      const call = (page: string, fix: Record<string, unknown>, before: string | null, kind = 'title_short') =>
        h({ projectId: P, action: 'approve', approved: true, kind, pageUrl: page, fix, expected: before, via: null, before, bulk: { batch: BATCH } }, deps)
      const sent = fixCalls.length
      const r = {
        faq: await call(`${SITE}/a/`, { type: 'faq_block', heading: 'FAQ', items: [{ q: 'Do you ship?', a: 'Yes, in two days.' }] }, null, 'faq_missing'),
        canonical: await call(`${SITE}/a/`, { type: 'canonical', value: `${SITE}/a/` }, null, 'canonical_missing'),
        home: await call(`${SITE}/`, { type: 'seo_title', value: TITLE }, 'Home'),
        same: await call(`${SITE}/b/`, { type: 'seo_title', value: TITLE }, ` ${TITLE.toUpperCase()} `),
        short: await call(`${SITE}/b/`, { type: 'seo_title', value: 'Boots | Boot Shop' }, 'Boots'),
        longDesc: await call(`${SITE}/b/`, { type: 'meta_description', value: `${DESC} ${'More words here.'.repeat(2)}` }, null, 'description_missing'),
        recent: await call(`${SITE}/recent/`, { type: 'seo_title', value: TITLE }, 'Old'),
      }
      const refusedWithoutWrite = fixCalls.length === sent
      const ok1 = await call(`${SITE}/b/`, { type: 'seo_title', value: TITLE }, 'Boots')
      const ok2 = await call(`${SITE}/b/`, { type: 'meta_description', value: DESC }, null, 'description_missing')
      return { r, refusedWithoutWrite, ok1, ok2, admin }
    }
    const got = await cases(API)
    const refused = Object.entries(got.r).filter(([, a]) => !(a.status === 409 && bodyOf(a).code === 'not_bulk_safe')).map(([k]) => k)
    check('B1: refused as not_bulk_safe: FAQ, canonical, the home page, the current title again, a short title, a 160+ description, a page fixed 1 day ago', refused.length === 0, refused.join(','))
    check('B2: …and nothing was sent to the site for them', got.refusedWithoutWrite)
    check('B3: a safe title and then a safe description on the same page (same batch) are applied, marked with the batch',
      bodyOf(got.ok1).job?.status === 'applied' && bodyOf(got.ok2).job?.status === 'applied' && bodyOf(got.ok1).job?.batchId === BATCH, JSON.stringify([got.ok1.body, got.ok2.body]))
    {
      const full = Array.from({ length: 25 }, (_, i) => job({ page_url: `${SITE}/full-${i}/`, undo: { batch: BATCH }, approved_at: new Date().toISOString() }))
      const admin = new FakeAdmin(rows('2.1.0', { site_fix_jobs: full }))
      const deps = depsFor(admin, { pluginPost: plugin })
      const r26 = await bulkApprove(deps, `${SITE}/twenty-six/`, { type: 'seo_title', value: TITLE }, 'Boots')
      const same = await bulkApprove(deps, `${SITE}/full-3/`, { type: 'meta_description', value: DESC }, null, 'description_missing')
      check('B4: a 26th page is refused; a page already in the batch is not', r26.status === 409 && bodyOf(r26).code === 'not_bulk_safe' && bodyOf(same).job?.status === 'applied', `${r26.status} ${JSON.stringify(same.body)}`)
    }
    const m = mutant<typeof API>('lib/site-fix/api.ts', "    if (why) return refuse('not_bulk_safe')\n", '')
    const mg = m.mod ? await cases(m.mod) : null
    check('MUTATION CONTROL: a server that trusts the batch flag is caught by B1', m.found && !!mg && Object.values(mg.r).some((a) => a.status === 200))

    // Batch undo: its own applied jobs, within 14 days.
    const undoRun = async (api: typeof API, ageDays = 2) => {
      const at = new Date(Date.now() - ageDays * 86_400_000).toISOString()
      const mine = [job({ page_url: `${SITE}/u1/`, undo: { batch: BATCH }, approved_at: at }), job({ page_url: `${SITE}/u2/`, fix_type: 'meta_description', undo: { batch: BATCH }, approved_at: at })]
      const other = job({ page_url: `${SITE}/u3/`, undo: { batch: OTHER }, approved_at: at })
      const single = job({ page_url: `${SITE}/u4/`, approved_at: at })
      const admin = new FakeAdmin(rows('2.1.0', { site_fix_jobs: [...mine, other, single] }))
      const res = await api.handleFixesPost({ projectId: P, action: 'undo_batch', batch: BATCH }, depsFor(admin, { pluginPost: plugin }))
      const status = (id: unknown) => (admin.tables.site_fix_jobs ?? []).find((r) => r.id === id)?.status
      return { res, mine: mine.map((j) => status(j.id)), other: status(other.id), single: status(single.id) }
    }
    const u = await undoRun(API)
    check('B5: "undo the whole batch" reverts every applied fix of the batch', bodyOf(u.res).undone === 2 && u.mine.every((s) => s === 'reverted'), JSON.stringify(u))
    check('B6: …and nothing outside it (another batch, a single fix)', u.other === 'applied' && u.single === 'applied')
    const old = await undoRun(API, 15)
    check('B7: after 14 days the batch cannot be undone as a whole (each fix keeps its own undo)', old.res.status === 404 && old.mine.every((s) => s === 'applied'), JSON.stringify(old.res.body))
    const mu = mutant<typeof API>('lib/site-fix/api.ts', '.filter((r) => batchOf(r) === b.batch)', '')
    const mur = mu.mod ? await undoRun(mu.mod) : null
    check('MUTATION CONTROL: a batch undo that is not limited to its batch is caught by B6', mu.found && !!mur && (mur.other !== 'applied' || mur.single !== 'applied'))

    // The screen's count: pure and conservative.
    const findings = [
      { id: 'title_short', fixType: 'seo_title' as const, pages: [{ url: `${SITE}/`, kind: 'home' }, { url: `${SITE}/a/`, kind: 'page' }, { url: `${SITE}/busy/`, kind: 'page' }] },
      { id: 'faq_missing', fixType: 'faq_block' as const, pages: [{ url: `${SITE}/a/`, kind: 'page' }] },
      { id: 'description_missing', fixType: 'meta_description' as const, pages: Array.from({ length: 30 }, (_, i) => ({ url: `${SITE}/d${i}/`, kind: 'page' })) },
    ]
    const busy = [{ pageUrl: `${SITE}/busy/`, status: 'pending' as const, appliedAt: null, approvedAt: new Date().toISOString(), batchId: null }]
    const rowsB = BULK.bulkCandidates(findings, { fixable: () => true, jobs: busy, now: Date.now() })
    const pagesB = new Set(rowsB.map((r) => r.url))
    check('B8: the count leaves out the home page, FAQ, a busy page, and stops at 25 pages', !rowsB.some((r) => r.url === `${SITE}/` || r.type === 'faq_block' || r.url.endsWith('/busy/')) && pagesB.size === 25, `${rowsB.length} rows, ${pagesB.size} pages`)
  }

  // ── S) Shopify ────────────────────────────────────────────────────────────
  console.log('\nS) Shopify stays read-only')
  {
    const shop: CHANNEL.FixContext = { shopify: true, wordpressDetected: false, creds: null, plugin: null, pluginLink: null, webhook: null, siteUrls: ['https://store.example.com'] }
    const caps = CHANNEL.resolveCapabilities(shop, true)
    check('S1: a Shopify store: read-only, no channel for any type (llms.txt included)', caps.readOnly && Object.keys(caps.channelFor).length === 0)
    const he = getDashboardDictionary('he').siteHealth.guides.llms.shopify.join(' ')
    const en = getDashboardDictionary('en').siteHealth.guides.llms.shopify.join(' ')
    check('S2: the Shopify llms.txt card says plainly it cannot be placed automatically', /אי אפשר להוסיף llms\.txt לחנות שופיפיי באופן אוטומטי/.test(he) && /cannot be added to a Shopify store automatically/.test(en))
    const m = mutant<typeof CHANNEL>('lib/site-fix/channel.ts', '  if (ctx.shopify) return { ...base, readOnly: true, channelFor: {} }\n', '')
    check('MUTATION CONTROL: a Shopify store that gets a channel is caught by S1', m.found && !!m.mod && !m.mod.resolveCapabilities({ ...shop, wordpressDetected: true }, true).readOnly)
    const touching = ['lib/site-fix/api.ts', 'lib/site-fix/channel.ts', 'lib/site-fix/preview.ts', 'lib/site-fix/suggest.ts', 'lib/site-fix/bulk.ts', 'lib/site-fix/h1.ts',
      'components/site-health/useSafeFixes.tsx', 'components/site-health/ApproveFixModal.tsx', 'components/site-health/AutoFixStrip.tsx']
      .filter((f) => /from '@\/lib\/shopify|from '\.\.\/shopify|app\/api\/shopify/.test(read(f)))
    check('S3: none of the site-fix code reaches into lib/shopify or the Shopify routes (report only, nothing built there)', touching.length === 0, touching.join(','))
  }

  // ── U) the screen ─────────────────────────────────────────────────────────
  console.log('\nU) the screen and the words')
  {
    const he = getDashboardDictionary('he').siteHealth
    const en = getDashboardDictionary('en').siteHealth
    const page = { url: `${SITE}/`, path: '/', kind: 'home', measure: null, value: null, fixable: false, adminUrl: null, from: null }
    const finding = (id: string, fixType: string): Finding => ({ id, severity: 'minor', field: null, guide: 'llms', fixable: false, fixType, total: 1, pages: [page] } as unknown as Finding)
    const render = (mode: 'update' | 'copy') => renderToStaticMarkup(createElement(FindingCard, {
      finding: finding(mode === 'copy' ? 'llms_missing' : 'h1_multiple', mode === 'copy' ? 'llms_txt' : 'h1_demote'), copy: he, platform: 'wordpress', fixed: new Set<string>(),
      onFix: () => {}, fixModeFor: () => mode, jobStateFor: () => null, onInstall: () => {},
    }))
    const up = render('update')
    const cp = render('copy')
    check('U1: a row whose fix needs the new plugin offers "עדכון התוסף", not "תקנו לי"', up.includes('data-update-button') && up.includes(he.autofix.connection.update.action) && !up.includes('data-fix-button'))
    check('U2: the llms.txt row without the plugin offers "יצירת הטקסט"', cp.includes('data-copy-button') && cp.includes(he.createText))
    const caps: FixCapabilities = { available: true, readOnly: false, plugin: { state: 'connected', version: '2.0.0', seoPlugin: 'yoast', lastSeenAt: null }, appPassword: false, webhook: false, wordpress: true, channelFor: {}, pluginLatest: '2.1.0' }
    const strip = (count: number) => renderToStaticMarkup(createElement(AutoFixStrip, {
      projectId: P, capabilities: caps, copy: he.autofix, onInstall: () => {}, onChanged: () => {}, lastSeen: (s: string) => s,
      safe: { count, phase: { kind: 'idle' }, start: () => {}, onRecheck: () => {}, onOpenQueue: () => {} },
    }))
    const s3 = strip(3)
    const s0 = strip(0)
    check('U3: the strip offers "תקנו לי 3 תיקונים בטוחים" as its button', s3.includes('תקנו לי 3 תיקונים בטוחים') && s3.includes('data-safe-fixes="3"'))
    check('U4: with none waiting it says so and shows no button', s0.includes(he.autofix.bulk.none) && !s0.includes('data-safe-fixes="0"'))
    check('U5: a 2.0.0 install is told a new version is ready, and "manage" becomes "update"', s3.includes('data-plugin-update="2.1.0"') && s3.includes(he.autofix.connection.update.action))
    const b = he.autofix.bulk
    check('U6: the confirmation words are the UX decision\'s, in Hebrew and English', b.confirmTitle(4) === 'לתקן 4 דברים באתר בלחיצה אחת?' && en.autofix.bulk.confirmTitle(4) === 'Apply 4 fixes to your site in one click?'
      && b.confirmBody(1, 2, 3).startsWith('נכתוב באתר רק שינויים בטוחים: כותרות לגוגל (1), תיאורים לגוגל (2) ותיאורי תמונות (3).') && b.progress(2, 5) === 'מתקנים… 2 מתוך 5'
      && he.autofix.queue.batch('1.10.2026', 3) === 'סבב תיקונים מ-1.10.2026 (3)' && he.autofix.queue.undoBatch === 'ביטול כל הסבב')
    const newKeys = (d: typeof he) => [d.findings.llms_missing.title, d.guides.llms.wordpress[0], d.autofix.approve.title.h1_demote, d.autofix.approve.title.llms_txt,
      d.autofix.errors.needs_update, d.autofix.errors.no_valid_suggestion, d.autofix.errors.thin_content, d.autofix.errors.h1_not_safe, d.autofix.errors.llms_exists,
      d.autofix.errors.not_bulk_safe, d.autofix.approve.h1Reasons.builder, d.autofix.approve.labels.faqGenerated, d.autofix.plugin.update.title]
    check('U7: every new sentence exists in both dictionaries, and the Hebrew ones are Hebrew', newKeys(he).every((s) => !!s && /[֐-׿]/.test(s)) && newKeys(en).every((s) => !!s && !/[֐-׿]/.test(s)))
    const mStrip = mutant<{ default: typeof AutoFixStrip }>('components/site-health/AutoFixStrip.tsx', "  const bulk = view === 'connected' && safe ? safe : null", '  const bulk = safe ?? null')
    const pending: FixCapabilities = { ...caps, plugin: { state: 'pending', hint: '••••AAAA' } }
    const shown = mStrip.mod ? renderToStaticMarkup(createElement(mStrip.mod.default, { projectId: P, capabilities: pending, copy: he.autofix, onInstall: () => {}, onChanged: () => {}, lastSeen: (s: string) => s, safe: { count: 3, phase: { kind: 'idle' }, start: () => {}, onRecheck: () => {}, onOpenQueue: () => {} } })) : ''
    const real = renderToStaticMarkup(createElement(AutoFixStrip, { projectId: P, capabilities: pending, copy: he.autofix, onInstall: () => {}, onChanged: () => {}, lastSeen: (s: string) => s, safe: { count: 3, phase: { kind: 'idle' }, start: () => {}, onRecheck: () => {}, onOpenQueue: () => {} } }))
    check('U8: the safe button shows only with the plugin connected', !real.includes('data-safe-fixes'))
    check('MUTATION CONTROL: a safe button shown without a connected plugin is caught by U8', mStrip.found && shown.includes('data-safe-fixes="3"'))

    // U9: llms.txt is one file for the whole site. Its approval never says "this page only" nor how a
    // page's SEO field is saved, and its text shows as the file reads (left to right, lines unwrapped).
    const code = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1').replace(/\{\s*\}/g, '')
    const llmsOk = (t: string) => {
      const c = code(t)
      return /const lead = p\.type === 'llms_txt' \? t\.labels\.llmsLead : t\.lead\[phase\.channel\]/.test(c)
        && /const viaNote = phase\.kind === 'ready' && phase\.preview\.type !== 'llms_txt'/.test(c)
        && /data-llms-text[^>]*/.test(c) && /dir="ltr" wrap="off"[^>]*data-llms-text/.test(c)
        && /type !== 'llms_txt' && <div/.test(c)
    }
    const modal = read('components/site-health/ApproveFixModal.tsx')
    check('U9: the llms.txt approval speaks of the site file, hides the page line and the SEO-field note, and shows the text left to right', llmsOk(modal))
    check('MUTATION CONTROL: the "this page only" lead back on llms.txt is caught by U9', !llmsOk(modal.replace("p.type === 'llms_txt' ? t.labels.llmsLead : t.lead[phase.channel]", 't.lead[phase.channel]')))
    check('MUTATION CONTROL: the SEO-field note back on llms.txt is caught by U9', !llmsOk(modal.replace("phase.preview.type !== 'llms_txt' ? (", '!copyOnly ? (')))
    check('U9b: the llms lead exists in both dictionaries (Hebrew in Hebrew)', /[֐-׿]/.test(he.autofix.approve.labels.llmsLead) && !!en.autofix.approve.labels.llmsLead && !/[֐-׿]/.test(en.autofix.approve.labels.llmsLead))
    // U10: the batch confirmation shows each change as "now" and "after the fix" on their own lines.
    const bulkOk = (t: string) => { const c = code(t); return /<dt[^>]*>\{copy\.approve\.before\}<\/dt>/.test(c) && /<dt[^>]*>\{copy\.approve\.after\}<\/dt>/.test(c) && !/→<\/span>/.test(c) }
    const safeSrc = read('components/site-health/useSafeFixes.tsx')
    check('U10: every change in the batch dialog reads as "now" / "after the fix" lines', bulkOk(safeSrc))
    check('MUTATION CONTROL: an inline "before → after" run is caught by U10', !bulkOk(safeSrc.replace('<dt className="text-muted">{copy.approve.after}</dt>', '<span aria-hidden="true">→</span>')))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
}

/** A signed plugin request with the pairing key, for direct plugin checks. */
function signedFix(payload: Record<string, unknown>): { headers: Record<string, string>; body: string } {
  const { signedHeaders } = require('../plugin-auth') as typeof import('../plugin-auth')
  const body = JSON.stringify(payload)
  return { headers: signedHeaders(KEY, '/gotop/v1/fix', body, Date.now), body }
}

main().catch((e) => { console.error(e); process.exit(1) })

export {}
