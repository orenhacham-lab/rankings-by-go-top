/**
 * WORDPRESS AUTHOR PICKER (article editor): the merchant may pick the post's author from the
 * site's own list (plugin 3.1.0, PR #164's author_id). Executed where it can be, source guards for
 * the wiring. Every guard has a mutation control.
 *
 *   A) shown when available: an ok, `selectable` answer with authors is the list (id + name only)
 *   B) author_id is sent only when the merchant chose an author from that list
 *   C) hidden on failure: an error, a non-selectable (application password) answer, an empty or
 *      broken answer, a throw: no picker, publishing goes on as before
 *   D) ownership: the authors route authenticates and checks the project's owner before anything
 *   E) legal: the app never supplies an author by itself: no stored or pre-filled default, no
 *      fallback to another user when the chosen one may not publish (a typed refusal), and the
 *      automation passes no author_id
 *
 * Run: npx tsx lib/content/__qa__/wordpress-author-picker.qa.ts
 */
import { readFileSync, unlinkSync, writeFileSync } from 'fs'
import { join } from 'path'

process.env.CONTENT_CREDENTIALS_ENCRYPTION_KEY = process.env.CONTENT_CREDENTIALS_ENCRYPTION_KEY || 'c'.repeat(64)

import { FakeAdmin } from '@/lib/__qa__/_fake-admin'
import { encryptCredential } from '@/lib/security/credentials-crypto'
import { generatePluginKey } from '@/lib/site-fix/plugin-auth'
import type * as ChoiceModule from '../wordpress-author-choice'
import type * as PublishModule from '../wordpress-plugin-publish'
import type * as AuthModule from '../api-auth'

let passed = 0
let failed = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { passed++; console.log(`  ✓ ${name}`) } else { failed++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = process.cwd()
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1').replace(/\{\/\*[\s\S]*?\*\/\}/g, '')

async function mutant<T>(rel: string, edit: (src: string) => string): Promise<T> {
  const file = join(ROOT, rel)
  const src = readFileSync(file, 'utf8')
  const out = edit(src)
  if (out === src) throw new Error(`mutation of ${rel} changed nothing`)
  const copy = file.replace(/\.ts$/, `.mut-${process.pid}-${Math.random().toString(36).slice(2, 8)}.ts`)
  writeFileSync(copy, out)
  try { return (await import(copy)) as T } finally { unlinkSync(copy) }
}

type Row = Record<string, unknown>
const SITE = 'https://shop.example.org'
const PROJECT = 'p-auth'
const OWNER = 'u-owner'
const key = generatePluginKey()
function db(o: { wp?: boolean } = {}) {
  return new FakeAdmin({
    projects: [{ id: PROJECT, user_id: OWNER, name: 'Boots' }],
    site_fix_plugin_links: [{ project_id: PROJECT, user_id: OWNER, site_url: SITE, key_id: key.keyId, secret_encrypted: encryptCredential(key.secret),
      secret_hint: 'x', status: 'connected', plugin_version: '3.1.0', seo_plugin: 'none', last_seen_at: null, last_error_code: null }],
    wordpress_connections: o.wp ? [{ id: 'wpc-1', project_id: PROJECT, site_url: SITE, wp_username: 'admin', wp_application_password_encrypted: encryptCredential('abcd efgh ijkl mnop'), connection_status: 'connected', default_author_id: 9 }] : [],
    generated_articles: [], article_topics: [], project_article_styles: [], article_inline_images: [], wordpress_content_index: [],
  } as never) as FakeAdmin & { storage: unknown }
}
const ARTICLE = { id: '0b6f3a52-7d1e-4c55-9a43-2f8d7e6a1b90', title: 'Boots', slug: 'boots', excerpt: null, meta_title: 'Boots', meta_description: 'Dry.', content_html: '<p>Dry.</p>',
  featured_image_url: null, featured_image_storage_path: null, wp_primary_category_id: null, wp_category_ids: [], wp_tag_ids: [] }
function canned(publish: { status: number; body: unknown }) {
  const sent: { route: string; body: string }[] = []
  const post = (async (_s: string, route: string, body: string) => {
    sent.push({ route, body })
    const a = route === '/publish' ? publish : route === '/terms' ? { status: 200, body: { ok: true, items: [] } } : { status: 404, body: { code: 'rest_no_route' } }
    return { status: a.status, body: JSON.stringify(a.body) }
  }) as never
  return { sent, post }
}
function appPassword() {
  const calls: Row[] = []
  const fn = (async (_a: unknown, _c: unknown, _art: unknown, opts: Row) => { calls.push(opts); return { ok: true, wpPostId: 77, wpPostUrl: `${SITE}/x/`, featuredMediaId: null, imageWarning: false, updated: false } }) as never
  return { calls, fn }
}

const PLUGIN_ANSWER = { authors: [{ id: 2, name: 'Dana Levi', slug: '' }, { id: 5, name: '  Sam  ', slug: '' }], defaultAuthorId: 5, selectable: true }
const fetcher = (status: number, body: unknown, throws = false) => async () => {
  if (throws) throw new Error('network')
  return { ok: status >= 200 && status < 300, json: async () => body }
}

async function main() {
  const C = await import('../wordpress-author-choice')
  const M = await import('../wordpress-plugin-publish')

  // ── A) shown when available ────────────────────────────────────────────────
  console.log('A) the list is shown when the site can apply the choice')
  {
    const list = await C.loadAuthorOptions(PROJECT, fetcher(200, PLUGIN_ANSWER))
    check('A1: a plugin 3.1 answer becomes the picker list (display names, trimmed, nothing else kept)',
      JSON.stringify(list) === JSON.stringify([{ id: 2, name: 'Dana Levi' }, { id: 5, name: 'Sam' }]), JSON.stringify(list))
    const urls: string[] = []
    await C.loadAuthorOptions('p/1 x', async (u) => { urls.push(u); return { ok: true, json: async () => PLUGIN_ANSWER } })
    check('A2: the list is asked of /api/wordpress/authors for this project (encoded)', urls[0] === '/api/wordpress/authors?projectId=p%2F1%20x', urls[0])
    const route = strip(read('app/api/wordpress/authors/route.ts'))
    const marks = (s: string) => /defaultAuthorId: viaPlugin\.body\.default \|\| null, selectable: true \}\)/.test(s) && /selectable: false \}\)/.test(s)
    check('A3: the authors route marks the plugin 3.1 list selectable and the application-password list not', marks(route))
    check('MUTATION CONTROL: an application-password list marked selectable is caught', !marks(route.replace('selectable: false })', 'selectable: true })')))
    const M1 = await mutant<typeof ChoiceModule>('lib/content/wordpress-author-choice.ts', (s) => s.replace('if (!ok || !body', 'if (!body'))
    check('MUTATION CONTROL: a failed answer that still carries a list would be shown (so C1 would fail)', (await M1.loadAuthorOptions(PROJECT, fetcher(502, PLUGIN_ANSWER))) !== null)
  }

  // ── B) author_id only when chosen ──────────────────────────────────────────
  console.log('\nB) author_id is sent only when chosen')
  {
    const opts = C.authorOptionsFrom(true, PLUGIN_ANSWER)
    const base = { status: 'publish' as const, update: true }
    const none = C.withAuthorChoice(base, null, opts)
    check('B1: no choice: the body has no author_id key at all (the site\'s default author, as before)', !('author_id' in none) && JSON.stringify(none) === JSON.stringify(base))
    check('B2: a chosen author from the list: author_id is that id, the rest unchanged', JSON.stringify(C.withAuthorChoice(base, 2, opts)) === JSON.stringify({ ...base, author_id: 2 }))
    check('B3: an id not on the list, or with no list, is never sent', !('author_id' in C.withAuthorChoice(base, 99, opts)) && !('author_id' in C.withAuthorChoice(base, 2, null)) && !('author_id' in C.withAuthorChoice(base, -1, opts)))
    const M2 = await mutant<typeof ChoiceModule>('lib/content/wordpress-author-choice.ts', (s) => s.replace('if (!validId(chosen) || !options || !options.some((o) => o.id === chosen)) return body', 'if (chosen === undefined) return body'))
    check('MUTATION CONTROL: a body builder that always adds author_id is caught', 'author_id' in M2.withAuthorChoice(base, null, opts))
    const page = strip(read('app/(dashboard)/content/articles/[id]/page.tsx'))
    const wired = (s: string) => /body: JSON\.stringify\(withAuthorChoice\(\{ status, [^\n]*\}, wpAuthorId, wpAuthorOptions\)\)/.test(s) && /<WordPressAuthorPicker[\s\S]*?dict=\{e\.wpAuthor\}/.test(s)
    check('B4: the editor\'s WordPress publish request goes through withAuthorChoice; the picker sits in the publish card', wired(page))
    check('MUTATION CONTROL: a publish body built without withAuthorChoice is caught', !wired(page.replace(/withAuthorChoice\((\{ status, [^\n]*\}), wpAuthorId, wpAuthorOptions\)/, '$1')))
  }

  // ── C) hidden on failure ───────────────────────────────────────────────────
  console.log('\nC) hidden when the list is unavailable; publishing is never blocked')
  {
    const cases: [string, ReturnType<typeof fetcher>][] = [
      ['a 502 error', fetcher(502, { error: 'Failed to fetch authors' })],
      ['no WordPress connection (404)', fetcher(404, { error: 'WordPress connection not found' })],
      ['the application password list (plugin < 3.1: cannot apply a choice)', fetcher(200, { authors: [{ id: 2, name: 'Dana' }], selectable: false })],
      ['an answer with no selectable flag', fetcher(200, { authors: [{ id: 2, name: 'Dana' }] })],
      ['an empty list', fetcher(200, { authors: [], selectable: true })],
      ['broken rows only', fetcher(200, { authors: [{ id: 'x', name: 'A' }, { id: 3, name: '' }, null], selectable: true })],
      ['a body that is not JSON', async () => ({ ok: true, json: async () => { throw new Error('bad json') } })],
      ['a network throw', fetcher(0, null, true)],
    ]
    for (const [label, f] of cases) check(`C1: ${label}: no picker`, (await C.loadAuthorOptions(PROJECT, f)) === null)
    const M3 = await mutant<typeof ChoiceModule>('lib/content/wordpress-author-choice.ts', (s) => s.replace("b.selectable !== true || ", ''))
    check('MUTATION CONTROL: without the selectable rule the application-password list shows (a choice it could only refuse)', (await M3.loadAuthorOptions(PROJECT, cases[2]![1])) !== null)
    const picker = strip(read('components/content/WordPressAuthorPicker.tsx'))
    const hides = (s: string) => /if \(!options\) return null/.test(s)
    check('C2: the picker renders nothing until (and unless) a list is there', hides(picker))
    check('MUTATION CONTROL: a picker that renders without a list is caught', !hides(picker.replace('if (!options) return null', '')))
    const page = strip(read('app/(dashboard)/content/articles/[id]/page.tsx'))
    const notGated = (s: string) => !/disabled=\{[^}]*wpAuthorOptions/.test(s) && !/wpAuthorOptions\s*(===|==)\s*null\s*\)?\s*return/.test(s)
    check('C3: the publish buttons never wait on, or depend on, the author list', notGated(page))
    check('MUTATION CONTROL: a publish button disabled until the list loads is caught', !notGated(page.replace('disabled={!!wpBusy} data-wp-publish=""', 'disabled={!!wpBusy || !wpAuthorOptions} data-wp-publish=""')))
  }

  // ── D) ownership ───────────────────────────────────────────────────────────
  console.log('\nD) the authors route authenticates and checks ownership')
  {
    const route = strip(read('app/api/wordpress/authors/route.ts'))
    const order = (s: string) => /const auth = await authContentProject\(projectId\)\s*if \('error' in auth\) return Response\.json\(\{ error: auth\.error \}, \{ status: auth\.status \}\)\s*const plugin = await loadPluginFor\(auth\.admin, auth\.project\.id, 'authors', \{ ownerId: auth\.user\.id \}\)/.test(s)
      && s.indexOf('authContentProject(projectId)') < s.indexOf('loadWordPressCredentials(')
    check('D1: the route checks the signed-in owner (authContentProject) before reading the plugin or the credentials; the plugin read is owner-scoped', order(route))
    check('MUTATION CONTROL: a route that reads the site before the ownership check is caught', !order(route.replace(/(  const auth = await authContentProject\(projectId\)\n  if \('error' in auth\)[^\n]*\n)/, '').replace('const plugin = await loadPluginFor', "const auth = await authContentProject(projectId)\n  const plugin = await loadPluginFor")))
    // authContentProject executed with a fake session + FakeAdmin.
    const sess = (id: string | null) => ({ auth: { getUser: async () => ({ data: { user: id ? { id } : null } }) } })
    const inject = (s: string) => s
      .replace('const supabase = await createClient()', 'const supabase = (globalThis as unknown as { __qaSb: Awaited<ReturnType<typeof createClient>> }).__qaSb')
      .replace(/(export async function authContentProject[\s\S]*?)const admin = createAdminClient\(\)/, '$1const admin = (globalThis as unknown as { __qaAdmin: ReturnType<typeof createAdminClient> }).__qaAdmin')
    const A = await mutant<typeof AuthModule>('lib/content/api-auth.ts', inject)
    const g = globalThis as unknown as { __qaSb: unknown; __qaAdmin: unknown }
    g.__qaAdmin = db()
    g.__qaSb = sess(OWNER); const own = await A.authContentProject(PROJECT)
    g.__qaSb = sess('u-stranger'); const other = await A.authContentProject(PROJECT)
    g.__qaSb = sess(null); const anon = await A.authContentProject(PROJECT)
    g.__qaSb = sess(OWNER); const missing = await A.authContentProject('p-nope')
    check('D2: the owner gets in; another user 403; no session 401; an unknown project 404',
      !('error' in own) && 'error' in other && other.status === 403 && 'error' in anon && anon.status === 401 && 'error' in missing && missing.status === 404,
      JSON.stringify({ own: 'error' in own ? own : 'ok', other, anon, missing }))
    const A2 = await mutant<typeof AuthModule>('lib/content/api-auth.ts', (s) => inject(s).replace("if ((project as { user_id?: string }).user_id !== user.id) {", 'if (false) {'))
    g.__qaSb = sess('u-stranger'); const leak = await A2.authContentProject(PROJECT)
    check('MUTATION CONTROL: without the owner comparison another user gets in (so D2 would fail)', !('error' in leak))
    const CAP = await import('@/lib/site-fix/plugin-capabilities')
    check('D3: the plugin link is never read for another user (ownerId mismatch: null)',
      (await CAP.loadConnectedPlugin(db() as never, PROJECT, { ownerId: 'u-stranger' })) === null && (await CAP.loadConnectedPlugin(db() as never, PROJECT, { ownerId: OWNER })) !== null)
  }

  // ── E) legal: never an author the merchant did not pick in this publish ────
  console.log('\nE) the app never supplies an author by itself')
  {
    const page = strip(read('app/(dashboard)/content/articles/[id]/page.tsx'))
    const picker = strip(read('components/content/WordPressAuthorPicker.tsx'))
    const choice = strip(read('lib/content/wordpress-author-choice.ts'))
    const noDefault = (p: string, k: string, c: string) =>
      /const \[wpAuthorId, setWpAuthorId\] = useState<number \| null>\(null\)/.test(p) &&
      ![p, k, c].some((s) => /defaultAuthorId|default_author_id|localStorage|sessionStorage/.test(s)) &&
      (p.match(/setWpAuthorId\(/g) ?? []).length === 1 && /onChange=\{setWpAuthorId\}/.test(p) &&
      !/wpAuthorId|author_id/.test(strip(read('app/api/content/articles/[id]/route.ts')))
    check('E1: the choice starts empty, is set only by the merchant (or cleared), is never pre-filled from the site default, stored or remembered', noDefault(page, picker, choice))
    check('MUTATION CONTROL: a choice pre-filled from the site default is caught', !noDefault(page.replace('const [wpAuthorId, setWpAuthorId] = useState<number | null>(null)', 'const [wpAuthorId, setWpAuthorId] = useState<number | null>(null)\n  useEffect(() => { setWpAuthorId(wpAuthorOptions?.[0]?.id ?? null) }, [wpAuthorOptions])'), picker, choice))
    check('MUTATION CONTROL: a picker that selects the site\'s defaultAuthorId is caught', !noDefault(page, picker.replace('if (!options) return null', 'if (!options) return null\n  const defaultAuthorId = options[0]?.id'), choice))
    check('E2: the site\'s default author id in the answer is ignored by the body builder (no choice: no author_id)',
      !('author_id' in C.withAuthorChoice({ status: 'publish' }, null, C.authorOptionsFrom(true, PLUGIN_ANSWER))))

    // No fallback when the chosen author may not publish: executed against the real publish core.
    const admin = db({ wp: true })
    const pub = await M.loadWordPressPublisher(admin as never, PROJECT)
    const t = canned({ status: 400, body: { ok: false, code: 'author_invalid' } }); const ap = appPassword()
    const r = 'error' in pub ? null : await M.publishArticleToWordPress(admin as never, pub, ARTICLE as never, { status: 'publish', authorId: 7 }, { post: t.post, appPassword: ap.fn })
    const publishes = t.sent.filter((x) => x.route === '/publish').map((x) => JSON.parse(x.body) as Row)
    check('E3: a chosen author who may not publish: refused (plugin_author_invalid), one /publish with that author only, never the application password or another author',
      !!r && !r.ok && r.detail === 'plugin_author_invalid' && ap.calls.length === 0 && publishes.length === 1 && publishes[0]!.author_id === 7, JSON.stringify({ r, ap: ap.calls.length, publishes }))
    const NM = await mutant<typeof PublishModule>('lib/content/wordpress-plugin-publish.ts', (s) => s.replace("if (r.pluginCode === 'not_ours' && publisher.creds && !pluginOnly) {", 'if (publisher.creds) {'))
    const pubM = await NM.loadWordPressPublisher(admin as never, PROJECT)
    const ap2 = appPassword()
    const mr = 'error' in pubM ? null : await NM.publishArticleToWordPress(admin as never, pubM, ARTICLE as never, { status: 'publish', authorId: 7 }, { post: canned({ status: 400, body: { ok: false, code: 'author_invalid' } }).post, appPassword: ap2.fn })
    check('MUTATION CONTROL: a fallback that republishes without the chosen author is caught (so E3 would fail)', !!mr && mr.ok && ap2.calls.length === 1)

    const route = strip(read('app/api/content/articles/[id]/wordpress/route.ts'))
    const refuses = (s: string) => /if \(!created\.ok && authorId !== undefined && created\.detail === 'plugin_author_invalid'\) \{[\s\S]*?return Response\.json\(\{ ok: false, error: 'plugin_author_invalid', reason: 'plugin_author_invalid', diagnosticId \}, \{ status: 409 \}\)/.test(s)
      && !/author_id:\s*[^\n]*default/.test(s) && !/authorId\s*=(?!=)\s*(?!\s|body\.author_id)/.test(s.replace('let authorId: number | undefined', ''))
    check('E4: the publish route answers a refused author with a typed plugin_author_invalid and takes authorId only from the request body', refuses(route))
    check('MUTATION CONTROL: a route that fills in a default author is caught', !refuses(route.replace('authorId = body.author_id', 'authorId = body.author_id\n    } else {\n      authorId = loadedDefaultAuthor')))
    check('MUTATION CONTROL: a route without the typed refusal is caught', !refuses(route.replace("created.detail === 'plugin_author_invalid'", "created.detail === 'x'")))
    const langs = ['lib/i18n/dashboard/he.ts', 'lib/i18n/dashboard/en.ts', 'lib/i18n/dashboard/es.ts', 'lib/i18n/dashboard/pt-BR/content-hub.ts']
    check('E5: the refusal and the picker are worded in he, en, es and pt-BR', langs.every((f) => { const s = read(f); return /plugin_author_invalid: '/.test(s) && /wpAuthor: \{ label: '/.test(s) }))
    check('E5b: the Hebrew label is the novice-friendly "כותב המאמר באתר"', /wpAuthor: \{ label: 'כותב המאמר באתר'/.test(read('lib/i18n/dashboard/he.ts')))

    const auto = strip(read('lib/content/automation/publish-item.ts'))
    const noAuthor = (s: string) => /publishArticleToWordPress\(admin, loaded, article as never, \{ status: 'publish' \}\)/.test(s) && !/authorId|author_id/.test(s)
    check('E6: the automation publishes with no author_id (the site\'s default author)', noAuthor(auto))
    check('MUTATION CONTROL: an automation that passes an author is caught', !noAuthor(auto.replace("{ status: 'publish' })", "{ status: 'publish', authorId: 1 })")))
    const others = ['components/content/workspace/ArticlesScreen.tsx'].map((f) => strip(read(f)))
    check('E7: the article list\'s quick publish sends no author_id', others.every((s) => !/author_id|authorId/.test(s)))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) process.exit(1)
}

main().catch((err) => { console.error(err); process.exit(1) })

export {}
