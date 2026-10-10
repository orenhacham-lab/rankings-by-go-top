/**
 * THE SEO-META BACKFILL FOR ARTICLES ALREADY ON WORDPRESS (lib/content/seo-backfill.ts,
 * scripts/backfill-article-seo-meta.ts).
 *
 *   H) reading the live <head>: what counts as missing, ours, or someone else's (kept);
 *   D) the dry run (the default) writes NOTHING: no plugin call, no WordPress call, no DB write;
 *   N) NEVER OVERWRITE: a field already on the page is not sent; the plugin path asks the plugin to
 *      write only while the stored value is empty (expected: ''), EXECUTED against the real plugin
 *      PHP with Yoast active: an existing description is untouched, an empty title is filled;
 *      the application-password path sends only the missing field and no focus keyphrase;
 *   S) safety skips: other site, redirected page, another post id, another owner, unreadable page;
 *   I) idempotent: a second run finds the article's own words and writes nothing;
 *   P) the outcome is persisted on the article with --apply only.
 *
 * MUTATION CONTROLS for each group. Run: npx tsx lib/content/__qa__/seo-backfill.qa.ts
 */
import { mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'fs'
import { spawnSync } from 'child_process'
import { tmpdir } from 'os'
import { join } from 'path'
import { FakeAdmin } from '@/lib/__qa__/_fake-admin'
import { generatePluginKey, pairingCode } from '@/lib/site-fix/plugin-auth'
import { writeSeoViaGoTopPlugin } from '../seo-publish'
import { backfillArticle, classifyHead, readHead, runBackfill, type BackfillArticle, type BackfillDeps, type Channel } from '../seo-backfill'
import { parseArgs } from '../../../scripts/backfill-article-seo-meta'
import { seoMetaKeys } from '../wordpress-taxonomy'

let passed = 0
let failed = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { passed++; console.log(`  ✓ ${name}`) } else { failed++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = process.cwd()
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')

async function mutant<T>(rel: string, edit: (src: string) => string): Promise<T> {
  const file = join(ROOT, rel)
  const src = readFileSync(file, 'utf8')
  const out = edit(src)
  if (out === src) throw new Error(`mutation of ${rel} changed nothing`)
  const copy = file.replace(/\.ts$/, `.mut-${process.pid}-${Math.random().toString(36).slice(2, 8)}.ts`)
  writeFileSync(copy, out)
  try { return (await import(copy)) as T } finally { unlinkSync(copy) }
}

const SITE = 'https://shop.example.org'
const URL_ = `${SITE}/blog/waterproof-boots/`
const PROJECT = 'p-1'
const OWNER = 'u-owner'
const ART = 'a-1'
const POST_TITLE = 'Waterproof boots'
const META_TITLE = 'Waterproof boots: the complete guide'
const META_DESC = 'How to keep boots dry and warm in winter.'
const key = generatePluginKey()

const article: BackfillArticle = {
  id: ART, projectId: PROJECT, projectName: 'Shop', ownerId: OWNER, articleUserId: OWNER, title: POST_TITLE,
  metaTitle: META_TITLE, metaDescription: META_DESC, wpPostId: 21, wpPostUrl: URL_, seoStatus: null,
}
const pluginChannel: Channel = { kind: 'plugin', siteUrl: SITE, seoPlugin: 'yoast', version: '2.1.0' }
const appChannel: Channel = { kind: 'app_password', siteUrl: 'https://www.shop.example.org' }

const page = (o: { title?: string | null; desc?: string | null; postId?: number }) =>
  `<!doctype html><html><head>${o.title === null ? '' : `<title>${o.title ?? `${POST_TITLE} - Shop`}</title>`}` +
  `${o.desc ? `<meta name="description" content="${o.desc}" />` : ''}<!-- This site is optimized with the Yoast SEO plugin --></head>` +
  `<body class="post-template-default single postid-${o.postId ?? 21}"><h1>${POST_TITLE}</h1></body></html>`

type Calls = { plugin: unknown[]; app: unknown[]; persist: unknown[]; creds: number }
function deps(html: string | null, o: { finalUrl?: string; pluginAnswer?: (input: { metaTitle: string; metaDescription: string | null; onlyIfEmpty?: boolean }) => Awaited<ReturnType<typeof writeSeoViaGoTopPlugin>> } = {}): { d: BackfillDeps; calls: Calls } {
  const calls: Calls = { plugin: [], app: [], persist: [], creds: 0 }
  const d: BackfillDeps = {
    fetchHtml: async (u) => html === null ? { ok: false, reason: 'blocked' } : { ok: true, url: o.finalUrl ?? u.toString(), status: 200, html, truncated: false },
    writeViaPlugin: (async (_admin: unknown, input: { metaTitle: string; metaDescription: string | null; onlyIfEmpty?: boolean }) => { calls.plugin.push(input); return o.pluginAnswer ? o.pluginAnswer(input) : { plugin: 'none', status: 'verified' } }) as never,
    writeViaAppPassword: (async (_c: unknown, postId: number, seo: unknown) => { calls.app.push({ postId, seo }); return { plugin: 'yoast', status: 'verified' } }) as never,
    loadCreds: async () => { calls.creds++; return { creds: { siteUrl: SITE, username: 'u', applicationPassword: 'p' } } },
    persist: (async (_a: unknown, id: string, seo: unknown) => { calls.persist.push({ id, seo }) }) as never,
  }
  return { d, calls }
}
const noAdmin = {} as never
const wrote = (c: Calls) => c.plugin.length + c.app.length + c.persist.length + c.creds

async function main() {
  console.log('\nH) reading the live <head>')
  {
    const h = readHead(page({ desc: null }), URL_)
    const c = classifyHead(h, article)
    check('H1: no meta description → missing; the template title "Post title - Site" → missing', c.description === 'missing' && c.title === 'missing', JSON.stringify(c))
    check('H2: the page says it runs Yoast, and which post it is', h.seoPluginHint === 'yoast' && h.postIds.join() === '21')
    const ours = classifyHead(readHead(page({ title: `${META_TITLE} | Shop`, desc: META_DESC }), URL_), article)
    check('H3: the article\'s own words → ours', ours.title === 'ours' && ours.description === 'ours', JSON.stringify(ours))
    const kept = classifyHead(readHead(page({ title: 'Best boots in Haifa', desc: 'The merchant wrote this.' }), URL_), article)
    check('H4: someone else\'s title and description → kept', kept.title === 'kept' && kept.description === 'kept', JSON.stringify(kept))
    check('H5: no <title> at all → missing', classifyHead(readHead(page({ title: null }), URL_), article).title === 'missing')
    const m = await mutant<typeof import('../seo-backfill')>('lib/content/seo-backfill.ts', (s) => s.replace(": desc === norm(article.metaDescription) ? 'ours' : 'kept'", ": desc === norm(article.metaDescription) ? 'ours' : 'missing'"))
    check('MUTATION CONTROL: treating a merchant\'s description as missing is caught by H4', m.classifyHead(readHead(page({ desc: 'The merchant wrote this.' }), URL_), article).description === 'missing')
  }

  console.log('\nD) the dry run writes nothing')
  {
    const { d, calls } = deps(page({ desc: null }))
    const r = await backfillArticle(noAdmin, article, pluginChannel, { apply: false }, d)
    check('D1: reports exactly what --apply would write', r.title === 'would_write' && r.description === 'would_write' && r.writes.seo_title === META_TITLE && r.writes.meta_description === META_DESC, JSON.stringify(r))
    check('D2: no plugin call, no WordPress call, no credential read, no DB write', wrote(calls) === 0, JSON.stringify(calls))
    const app = deps(page({ desc: null }))
    await backfillArticle(noAdmin, article, appChannel, { apply: false }, app.d)
    check('D3: the same on the application-password path', wrote(app.calls) === 0)
    const db = new FakeAdmin({
      generated_articles: [{ id: ART, project_id: PROJECT, user_id: OWNER, title: POST_TITLE, meta_title: META_TITLE, meta_description: META_DESC, wp_post_id: 21, wp_post_url: URL_, seo_status: null }],
      projects: [{ id: PROJECT, name: 'Shop', user_id: OWNER }],
      site_fix_plugin_links: [{ project_id: PROJECT, user_id: OWNER, site_url: SITE, key_id: 'k', secret_encrypted: 'enc', secret_hint: 'x', status: 'connected', plugin_version: '2.1.0', seo_plugin: 'yoast', last_seen_at: null, last_error_code: null }],
      wordpress_connections: [],
    })
    const run = deps(page({ desc: null }))
    const all = await runBackfill(db as never, { apply: false }, run.d)
    const row = db.tables.generated_articles[0]
    check('D4: runBackfill over the database: one candidate, plugin channel, nothing written, row unchanged',
      all.length === 1 && all[0].channel === 'plugin' && wrote(run.calls) === 0 && row.seo_status === null && Object.keys(row).length === 9, JSON.stringify(all[0]))
    check('D5: the command is a dry run unless --apply is given; bad ids are refused',
      parseArgs([]).apply === false && parseArgs(['--apply']).apply === true && (() => { try { parseArgs(['--project', 'x']); return false } catch { return true } })() &&
      (() => { try { parseArgs(['--apply', '--dry-run']); return false } catch { return true } })())
    const m = await mutant<typeof import('../seo-backfill')>('lib/content/seo-backfill.ts', (s) => s.replace('  if (!opts.apply) return report\n', ''))
    const mc = deps(page({ desc: null }))
    await m.backfillArticle(noAdmin, article, pluginChannel, { apply: false }, mc.d)
    check('MUTATION CONTROL: dropping the dry-run stop is caught by D2', wrote(mc.calls) > 0)
  }

  console.log('\nN) never overwrite an existing value')
  {
    const { d, calls } = deps(page({ title: 'Best boots in Haifa', desc: 'The merchant wrote this.' }))
    const r = await backfillArticle(noAdmin, article, pluginChannel, { apply: true }, d)
    check('N1: a page with its own title and description: nothing is sent, nothing persisted', r.skip === 'nothing_to_write' && wrote(calls) === 0, JSON.stringify({ r, calls }))
    const only = deps(page({ title: 'Best boots in Haifa', desc: null }))
    const r2 = await backfillArticle(noAdmin, article, pluginChannel, { apply: true }, only.d)
    const sent = only.calls.plugin as { metaTitle: string; metaDescription: string | null; onlyIfEmpty?: boolean }[]
    check('N2: only the missing description goes to the plugin, with onlyIfEmpty', sent.length === 1 && sent[0].metaTitle === '' && sent[0].metaDescription === META_DESC && sent[0].onlyIfEmpty === true && r2.title === 'not_needed' && r2.description === 'written', JSON.stringify({ sent, r2 }))
    const app = deps(page({ title: 'Best boots in Haifa', desc: null }))
    await backfillArticle(noAdmin, article, appChannel, { apply: true }, app.d)
    const a = app.calls.app[0] as { postId: number; seo: { metaTitle: string | null; metaDescription: string | null; focusKeyword: string | null } } | undefined
    check('N3: application password: only the missing field, no focus keyphrase, the article\'s own post id',
      app.calls.app.length === 1 && a?.postId === 21 && a.seo.metaTitle === null && a.seo.metaDescription === META_DESC && a.seo.focusKeyword === null, JSON.stringify(a))
    const cas = deps(page({ desc: null }), { pluginAnswer: (i) => i.metaDescription ? { plugin: 'none', status: 'exact_failure', detail: 'gotop_plugin_changed_since_preview' } : { plugin: 'none', status: 'verified' } })
    const r4 = await backfillArticle(noAdmin, article, pluginChannel, { apply: true }, cas.d)
    check('N4: the plugin refusing because a value is stored → kept_existing, never "written"', r4.description === 'kept_existing' && r4.title === 'written', JSON.stringify(r4))

    // The real request the plugin path sends: expected '' on every field.
    const sentRaw: { route: string; body: string; headers: Record<string, string> }[] = []
    const post = (async (_s: string, route: string, body: string, o: { headers?: Record<string, string> }) => { sentRaw.push({ route, body, headers: o.headers ?? {} }); return { status: 200, body: JSON.stringify({ ok: true, status: 'applied', fix_id: 'x', post_id: 21 }) } }) as never
    const pdb = () => new FakeAdmin({
      generated_articles: [{ id: ART, project_id: PROJECT }], projects: [{ id: PROJECT, user_id: OWNER }],
      site_fix_plugin_links: [{ project_id: PROJECT, user_id: OWNER, site_url: SITE, key_id: key.keyId, secret_encrypted: 'enc', secret_hint: 'x', status: 'connected', plugin_version: '2.1.0', seo_plugin: 'yoast', last_seen_at: null, last_error_code: null }],
    }) as never
    const pdeps = { decrypt: () => key.secret, post }
    await writeSeoViaGoTopPlugin(pdb(), { articleId: ART, postUrl: URL_, metaTitle: META_TITLE, metaDescription: null, onlyIfEmpty: true }, pdeps)
    await writeSeoViaGoTopPlugin(pdb(), { articleId: ART, postUrl: URL_, metaTitle: '', metaDescription: META_DESC, onlyIfEmpty: true }, pdeps)
    const bodies = sentRaw.map((s) => JSON.parse(s.body) as { type: string; expected?: string })
    check('N5: each /fix carries expected: "" (write only while empty), one field per call', bodies.length === 2 && bodies[0].type === 'seo_title' && bodies[1].type === 'meta_description' && bodies.every((b) => b.expected === ''), JSON.stringify(bodies))
    const before = sentRaw.length
    await writeSeoViaGoTopPlugin(pdb(), { articleId: ART, postUrl: URL_, metaTitle: META_TITLE, metaDescription: null }, pdeps)
    check('N6: publishing (no onlyIfEmpty) is unchanged: no expected sent', !('expected' in JSON.parse(sentRaw[before].body)))

    const hasPhp = spawnSync('php', ['-v'], { encoding: 'utf8' }).status === 0
    if (!hasPhp) {
      check('N7: php is not installed here: the executed checks did not run (report this)', true)
    } else {
      const harness = join(ROOT, 'lib/site-fix/__qa__/plugin-harness.php')
      const plugin = join(ROOT, 'wordpress-plugin/gotop-seo-bridge')
      const runPhp = (fixes: typeof sentRaw) => {
        const tmp = mkdtempSync(join(tmpdir(), 'wp-backfill-'))
        try {
          const calls = join(tmp, 'calls.json')
          writeFileSync(calls, JSON.stringify([
            { define: 'WPSEO_VERSION' },
            { rest: '/gotop/v1/pair', body: JSON.stringify({ code: pairingCode(key) }), can: ['manage_options'] },
            { setpost: 21, content: '<p>Boots.</p>', title: POST_TITLE, url: URL_, meta: { _yoast_wpseo_metadesc: 'The merchant wrote this.' } },
            ...fixes.map((s) => ({ rest: `/gotop/v1${s.route}`, headers: s.headers, body: s.body })),
            { post: 21 },
          ]))
          const run = spawnSync('php', [harness, plugin, calls], { encoding: 'utf8' })
          return { res: JSON.parse(run.stdout || '[]') as { status?: number; body?: Record<string, unknown>; meta?: Record<string, string> }[], err: run.stderr }
        } finally { rmSync(tmp, { recursive: true, force: true }) }
      }
      const { res, err } = runPhp(sentRaw.slice(0, 2))
      const meta = res[5]?.meta ?? {}
      check('N7: real plugin, Yoast active: the empty SEO title is filled', res[3]?.body?.status === 'applied' && meta._yoast_wpseo_title === META_TITLE, JSON.stringify(res) + err.slice(0, 200))
      check('N8: real plugin: the merchant\'s Yoast description is refused (changed_since_preview) and untouched', res[4]?.body?.code === 'changed_since_preview' && meta._yoast_wpseo_metadesc === 'The merchant wrote this.', JSON.stringify(res[4]) + JSON.stringify(meta))
      // MUTATION CONTROL: without onlyIfEmpty the same plugin overwrites — the guard is what saves it.
      const m = await mutant<typeof import('../seo-publish')>('lib/content/seo-publish.ts', (s) => s.replace("expected: input.onlyIfEmpty ? '' : null", 'expected: null'))
      const mutSent: typeof sentRaw = []
      const mpost = (async (_s: string, route: string, body: string, o: { headers?: Record<string, string> }) => { mutSent.push({ route, body, headers: o.headers ?? {} }); return { status: 200, body: '{"ok":true,"status":"applied"}' } }) as never
      await m.writeSeoViaGoTopPlugin(pdb(), { articleId: ART, postUrl: URL_, metaTitle: '', metaDescription: META_DESC, onlyIfEmpty: true }, { decrypt: () => key.secret, post: mpost })
      const mr = runPhp(mutSent)
      check('MUTATION CONTROL: dropping expected:"" makes the real plugin overwrite the merchant\'s description (caught by N8)', (mr.res[4]?.meta ?? {})._yoast_wpseo_metadesc === META_DESC, JSON.stringify(mr.res))
    }
    const m2 = await mutant<typeof import('../seo-backfill')>('lib/content/seo-backfill.ts', (s) => s.replace("const wantDesc = state.description === 'missing' && !!a.metaDescription", 'const wantDesc = !!a.metaDescription'))
    const mc = deps(page({ title: 'Best boots in Haifa', desc: 'The merchant wrote this.' }))
    await m2.backfillArticle(noAdmin, article, pluginChannel, { apply: true }, mc.d)
    check('MUTATION CONTROL: sending a field that is present is caught by N1', mc.calls.plugin.length > 0)
  }

  console.log('\nS) safety skips: nothing is written')
  {
    const cases: [string, BackfillArticle, Channel, ReturnType<typeof deps>, string][] = [
      ['another site', article, { kind: 'plugin', siteUrl: 'https://other.example.org', seoPlugin: 'yoast', version: '2.1.0' }, deps(page({ desc: null })), 'site_mismatch'],
      ['redirected to the home page', article, pluginChannel, deps(page({ desc: null }), { finalUrl: `${SITE}/` }), 'redirected'],
      ['the page is another post', article, appChannel, deps(page({ desc: null, postId: 99 })), 'post_id_mismatch'],
      ['another owner\'s article', { ...article, articleUserId: 'u-other' }, pluginChannel, deps(page({ desc: null })), 'not_owner'],
      ['unreadable page', article, pluginChannel, deps(null), 'page_unreadable'],
      ['no connection', article, { kind: 'none' }, deps(page({ desc: null })), 'no_channel'],
    ]
    for (const [name, a, ch, dd, want] of cases) {
      const r = await backfillArticle(noAdmin, a, ch, { apply: true }, dd.d)
      check(`S: ${name} → ${want}, nothing written`, r.skip === want && wrote(dd.calls) === 0, JSON.stringify({ skip: r.skip, calls: dd.calls }))
    }
    const m = await mutant<typeof import('../seo-backfill')>('lib/content/seo-backfill.ts', (s) => s.replace("return skip('post_id_mismatch'", "void skip('post_id_mismatch'"))
    const mc = deps(page({ desc: null, postId: 99 }))
    await m.backfillArticle(noAdmin, article, appChannel, { apply: true }, mc.d)
    check('MUTATION CONTROL: dropping the post-id check is caught', mc.calls.app.length > 0)
  }

  console.log('\nO) only the post we published')
  {
    const bare = `<html><head><title>${POST_TITLE} - Shop</title></head><body class="single"></body></html>`
    for (const ch of [pluginChannel, appChannel]) {
      const dd = deps(bare)
      const r = await backfillArticle(noAdmin, article, ch, { apply: true }, dd.d)
      check(`O1: ${ch.kind}: a page that does not name its post id → post_id_unconfirmed, nothing written`, r.skip === 'post_id_unconfirmed' && wrote(dd.calls) === 0, JSON.stringify(r.skip))
    }
    const short = `<html><head><title>${POST_TITLE} - Shop</title><link rel='shortlink' href='${SITE}/?p=21' /><link rel="alternate" type="application/json" href="${SITE}/wp-json/wp/v2/posts/21" /></head><body></body></html>`
    check('O2: the shortlink and the REST alternate link name the post too', readHead(short, URL_).postIds.join() === '21')
    const mixed = deps(`<html><head><link rel="shortlink" href="${SITE}/?p=99" /></head><body class="postid-21"></body></html>`)
    const rm = await backfillArticle(noAdmin, article, pluginChannel, { apply: true }, mixed.d)
    check('O3: any id that is not ours → post_id_mismatch, nothing written', rm.skip === 'post_id_mismatch' && wrote(mixed.calls) === 0)
    const noId = deps(page({ desc: null }))
    const rn = await backfillArticle(noAdmin, { ...article, wpPostId: null }, pluginChannel, { apply: true }, noId.d)
    check('O4: an article without our wp_post_id is never touched, on the plugin path too', rn.skip === 'no_post_id' && wrote(noId.calls) === 0)
    const m = await mutant<typeof import('../seo-backfill')>('lib/content/seo-backfill.ts', (s2) => s2.replace("if (head.postIds.length === 0) return skip('post_id_unconfirmed')", ''))
    const mc = deps(bare)
    await m.backfillArticle(noAdmin, article, pluginChannel, { apply: true }, mc.d)
    check('MUTATION CONTROL: writing to a page that does not name our post is caught by O1', mc.calls.plugin.length > 0)
  }

  console.log('\nK) no focus keyphrase on either path')
  {
    const back = strip(read('lib/content/seo-backfill.ts'))
    const appOnly = (s2: string) => /metaTitle: wantTitle \? a\.metaTitle : null, metaDescription: wantDesc \? a\.metaDescription : null, focusKeyword: null,/.test(s2) && !/focus_keyphrase|loadFocusKeyword|publishArticleSeo/.test(s2)
    check('K1: the backfill passes focusKeyword: null and never loads or sends a focus keyphrase', appOnly(back))
    check('MUTATION CONTROL: a backfill that loads the focus keyphrase is caught', !appOnly(back.replace('focusKeyword: null,', 'focusKeyword: await loadFocusKeyword(admin, null),')))
    const client = strip(read('lib/wordpress/client.ts'))
    const body = client.slice(client.indexOf('export async function writeVerifiedSeoMeta'), client.indexOf('export async function readSeoMetaVerification'))
    check('K2: writeVerifiedSeoMeta writes only seoMetaKeys(plugin, seo) (core REST and Bridge alike) and adds no keyword of its own',
      /const meta = seoMetaKeys\(plugin, seo\)/.test(body) && (body.match(/\{ meta \}/g) ?? []).length === 1 && /writeSeoViaBridge\(creds, postId, plugin, meta\)/.test(body) && !/focusKeyword|loadFocusKeyword|focuskw/.test(body.replace('focusKeyword?: string | null', '')))
    check('K3: with focusKeyword null, the Yoast and Rank Math keys are only the missing field',
      JSON.stringify(seoMetaKeys('yoast', { metaTitle: null, metaDescription: META_DESC, focusKeyword: null })) === JSON.stringify({ _yoast_wpseo_metadesc: META_DESC }) &&
      JSON.stringify(Object.keys(seoMetaKeys('rankmath', { metaTitle: META_TITLE, metaDescription: null, focusKeyword: null }))) === '["rank_math_title"]')
    const pub = strip(read('lib/content/seo-publish.ts'))
    const fn = pub.slice(pub.indexOf('export async function writeSeoViaGoTopPlugin'), pub.indexOf('export async function publishArticleSeo('))
    const pluginOnly = (s2: string) => /const fields: \['seo_title' \| 'meta_description', string\]\[\] = \[\]/.test(s2) && !/focus_keyphrase/.test(s2)
    check('K4: the plugin path (writeSeoViaGoTopPlugin) sends only seo_title and meta_description', pluginOnly(fn))
    check('MUTATION CONTROL: a plugin path that adds focus_keyphrase is caught', !pluginOnly(fn.replace("if (description) fields.push(['meta_description', description])", "if (description) fields.push(['meta_description', description]); fields.push(['focus_keyphrase' as never, 'x'])")))
  }

  console.log('\nI/P) idempotent, and persisted only with --apply')
  {
    const first = deps(page({ desc: null }))
    const r1 = await backfillArticle(noAdmin, article, pluginChannel, { apply: true }, first.d)
    const p = first.calls.persist[0] as { id: string; seo: { status: string; plugin: string } } | undefined
    check('P1: apply persists the verified outcome on the article (Yoast, via the plugin)', first.calls.persist.length === 1 && p?.id === ART && p.seo.status === 'verified' && p.seo.plugin === 'yoast' && r1.persisted?.status === 'verified', JSON.stringify(p))
    const second = deps(page({ title: `${META_TITLE} - Shop`, desc: META_DESC }))
    const r2 = await backfillArticle(noAdmin, article, pluginChannel, { apply: true }, second.d)
    check('I1: a second run finds the article\'s own words: no write; recorded as verified', second.calls.plugin.length === 0 && second.calls.app.length === 0 && r2.skip === 'nothing_to_write' && r2.persisted?.status === 'verified')
    const failing = deps(page({ desc: null }), { pluginAnswer: () => ({ plugin: 'none', status: 'exact_failure', detail: 'gotop_plugin_plugin_rejected' }) })
    const r3 = await backfillArticle(noAdmin, article, pluginChannel, { apply: true }, failing.d)
    check('P2: a refusal is persisted as a failure, never "verified"', r3.persisted?.status === 'exact_failure' && r3.description === 'failed')
    const m = await mutant<typeof import('../seo-backfill')>('lib/content/seo-backfill.ts', (s) => s.replace("else { report[field] = 'failed'; failure = failure ?? out }", "else { report[field] = 'written' }"))
    const mc = deps(page({ desc: null }), { pluginAnswer: () => ({ plugin: 'none', status: 'exact_failure', detail: 'gotop_plugin_plugin_rejected' }) })
    const mr = await m.backfillArticle(noAdmin, article, pluginChannel, { apply: true }, mc.d)
    check('MUTATION CONTROL: treating a refusal as written is caught by P2', mr.persisted?.status === 'verified')
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}

main().catch((e) => { console.error(e); process.exit(1) })

export {}
