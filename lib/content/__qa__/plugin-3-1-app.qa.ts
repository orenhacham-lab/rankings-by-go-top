/**
 * GO TOP SEO BRIDGE 3.1.0 IN THE APP: nothing needs an application password when the plugin is
 * connected (owner, 2026-10-10). The app side of every 3.1 channel, executed where it can be.
 *
 *   L) LIVE against the real plugin PHP (lib/site-fix/__qa__/plugin-harness.php, the same replay
 *      the publish suite uses): the content read source (/content, /content-item, /terms) and a full
 *      content scan over it; the index refresh through the plugin; the site map's WordPress lists;
 *      Media Library alt text found, previewed, applied and undone; publish options (a scheduled
 *      post with its GMT date, a second post, an author, taking over the recorded post).
 *   E) INSIDE A REAL WORDPRESS (QA_WORDPRESS_ROOT, default /tmp/claude-0/wp, read only: the database is
 *      a copy): pairing, the settings page, /status, the content list and a full scan, the authors,
 *      Media Library alt text, a scheduled post, a second post, an author, adopt; and the 3.0.0 copy
 *      this repo shipped activated beside 3.1.0: no fatal error, the notice.
 *   S) publish options, decided in the app: the time's zone, what the application password never
 *      did (a time, an author) is never sent over it, a 3.0.0 plugin is asked once and then refused.
 *   G) the gate: pluginCan by version or by /status's list; pluginLinkConnected by project AND
 *      owner and by version; refreshedPlugin stores the newer version.
 *   W) wiring (source guards): the publish route's scheduled_at / author_id / goesLive; categories,
 *      tags, the SEO plugin, the authors and the internal-link site scan prefer the plugin; the
 *      site-health Media Library rows and the scan's media lookup use it; the content index, the
 *      existing-content screen and site health count a 3.1 plugin as a connected site.
 *
 * Every guard has a mutation control. Run: npx tsx lib/content/__qa__/plugin-3-1-app.qa.ts
 */
import { spawnSync } from 'child_process'
import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

process.env.CONTENT_CREDENTIALS_ENCRYPTION_KEY = process.env.CONTENT_CREDENTIALS_ENCRYPTION_KEY || 'c'.repeat(64)

import { FakeAdmin } from '@/lib/__qa__/_fake-admin'
import { encryptCredential } from '@/lib/security/credentials-crypto'
import { generatePluginKey, pairingCode } from '@/lib/site-fix/plugin-auth'
import type { PluginLink } from '@/lib/site-fix/plugin-client'
import type * as PublishModule from '../wordpress-plugin-publish'
import type * as RefreshModule from '../wordpress-index-refresh'
import type * as SiteMapModule from '../existing-content/site-map-run'
import type * as CapModule from '@/lib/site-fix/plugin-capabilities'

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
const PROJECT = 'p-31'
const OWNER = 'u-owner'
const ART = '0b6f3a52-7d1e-4c55-9a43-2f8d7e6a1b90'
const ART2 = '1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f'
const key = generatePluginKey()
const LINK: PluginLink = { siteUrl: SITE, keyId: key.keyId, secret: key.secret }
/** A copy of the plugin folder with one change (for the real-WordPress mutation control). */
function mutantPlugin31(file: string, from: string, to: string): { dir: string; found: boolean; done: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'gotop-31-mutant-'))
  cpSync(join(ROOT, 'wordpress-plugin/gotop-seo-bridge'), dir, { recursive: true })
  const src = readFileSync(join(dir, file), 'utf8')
  writeFileSync(join(dir, file), src.split(from).join(to))
  return { dir, found: src.includes(from), done: () => rmSync(dir, { recursive: true, force: true }) }
}
const NO_STORE = async () => ({ products: [], categories: [], source: 'none' as const, lastHttpStatus: null })

type Row = Record<string, unknown>
function db(o: { version?: string | null; wp?: boolean; owner?: string; status?: string; articles?: Row[] } = {}) {
  const tables: Record<string, Row[]> = {
    projects: [{ id: PROJECT, user_id: OWNER, name: 'Boots', business_name: 'Boots & Co', target_domain: 'shop.example.org', language: 'en', country: 'IL' }],
    generated_articles: o.articles ?? [{ id: ART, project_id: PROJECT, topic_id: 't-1', title: 'Waterproof boots', meta_description: 'Dry boots.', excerpt: null, featured_image_url: null, faq_json: [], published_at: null, updated_at: null }],
    article_topics: [{ id: 't-1', primary_keyword: 'waterproof boots' }],
    project_article_styles: [],
    article_inline_images: [],
    site_fix_plugin_links: o.version === null ? [] : [{ project_id: PROJECT, user_id: o.owner ?? OWNER, site_url: SITE, key_id: key.keyId, secret_encrypted: encryptCredential(key.secret),
      secret_hint: 'x', status: o.status ?? 'connected', plugin_version: o.version ?? '3.1.0', seo_plugin: 'yoast', last_seen_at: null, last_error_code: null }],
    wordpress_connections: o.wp ? [{ id: 'wpc-1', project_id: PROJECT, site_url: SITE, wp_username: 'admin', wp_application_password_encrypted: encryptCredential('abcd efgh ijkl mnop'), connection_status: 'connected' }] : [],
    wordpress_content_index: [],
    shopify_connections: [],
    site_platform_connections: [],
  }
  const admin = new FakeAdmin(tables) as FakeAdmin & { storage: unknown }
  admin.storage = { from: () => ({ getPublicUrl: (p: string) => ({ data: { publicUrl: `https://x.invalid/${p}` } }) }) }
  return admin
}

type Sent = { route: string; body: string }
function canned(over: Record<string, { status: number; body: unknown }> = {}) {
  const sent: Sent[] = []
  const answers: Record<string, { status: number; body: unknown }> = {
    '/status': { status: 200, body: { ok: true, version: '3.1.0', seo_plugin: 'none', capabilities: ['content', 'content_item', 'authors', 'media_alt', 'terms_links', 'schedule', 'new_post', 'author', 'adopt'] } },
    '/terms': { status: 200, body: { ok: true, items: [] } },
    '/publish': { status: 200, body: { ok: true, status: 'created', post_id: 100, link: `${SITE}/blog/x/`, post_status: 'publish' } },
    '/fix': { status: 200, body: { ok: true, status: 'applied' } },
    ...over,
  }
  const post = (async (_site: string, route: string, body: string) => {
    sent.push({ route, body })
    const a = answers[route] ?? { status: 404, body: { code: 'rest_no_route' } }
    return { status: a.status, body: JSON.stringify(a.body) }
  }) as never
  return { sent, post }
}
function appPassword() {
  const calls: Row[] = []
  const fn = (async (_a: unknown, _c: unknown, _art: unknown, opts: Row) => { calls.push(opts); return { ok: true, wpPostId: 77, wpPostUrl: `${SITE}/old/`, featuredMediaId: null, imageWarning: false, updated: false } }) as never
  return { calls, fn }
}
const ARTICLE = (over: Row = {}) => ({
  id: ART, title: 'Waterproof boots', slug: 'waterproof-boots', excerpt: null, meta_title: 'Waterproof boots', meta_description: 'Dry boots.',
  content_html: '<p>Dry boots last.</p>', featured_image_url: null, featured_image_storage_path: null, wp_primary_category_id: null, wp_category_ids: [], wp_tag_ids: [], ...over,
})

async function main() {
  const M = await import('../wordpress-plugin-publish')
  const RS = await import('../wordpress-read-source')
  const SCAN = await import('../wordpress-content-scan')
  const REF = await import('../wordpress-index-refresh')
  const MAP = await import('../existing-content/site-map-run')
  const CAP = await import('@/lib/site-fix/plugin-capabilities')
  const MA = await import('@/lib/site-fix/media-alt')

  // ── L) live, against the real plugin ───────────────────────────────────────
  console.log('L) live: our code against the real plugin (PHP harness)')
  const hasPhp = spawnSync('php', ['-v'], { encoding: 'utf8' }).status === 0
  if (!hasPhp) {
    check('L0: php is not installed here: the executed checks did not run (report this)', true)
  } else {
    const harness = join(ROOT, 'lib/site-fix/__qa__/plugin-harness.php')
    const plugin = join(ROOT, 'wordpress-plugin/gotop-seo-bridge')
    const site = mkdtempSync(join(tmpdir(), 'wp-31-'))
    mkdirSync(join(site, 'wp-admin/includes'), { recursive: true })
    for (const f of ['file', 'media', 'image']) writeFileSync(join(site, `wp-admin/includes/${f}.php`), '<?php\n')
    const SETUP: Row[] = [
      { rest: '/gotop/v1/pair', body: JSON.stringify({ code: pairingCode(key) }), can: ['manage_options'] },
      { setpost: 21, type: 'post', title: 'Waterproof boots', content: `<p>Our <a href="${SITE}/blog/older/">older post</a> and <a href="${SITE}/about/">about</a>.</p>`, slug: 'waterproof-boots', url: `${SITE}/blog/waterproof-boots/`, modified: '2026-03-01 00:00:00', meta: { _yoast_wpseo_focuskw: 'waterproof boots' } },
      { setpost: 22, type: 'post', status: 'draft', title: 'Unfinished', content: '<p>draft</p>', url: `${SITE}/blog/unfinished/` },
      { setpost: 24, type: 'post', title: 'Older post', content: `<p>See <a href="${SITE}/blog/waterproof-boots/">waterproof boots</a>.</p>`, url: `${SITE}/blog/older/`, modified: '2025-01-01 00:00:00' },
      { setpost: 26, type: 'page', title: 'About', content: '<p>About us.</p>', slug: 'about', url: `${SITE}/about/` },
      { media: 600, file: 'red-boots.jpg', sizes: ['red-boots-300x200.jpg'], alt: '' },
    ]
    function live() {
      const steps: Row[] = [...SETUP]
      const run = (extra: Row[] = []) => {
        const calls = join(site, `calls-${Math.random().toString(36).slice(2)}.json`)
        writeFileSync(calls, JSON.stringify([...steps, ...extra]))
        const r = spawnSync('php', [harness, plugin, calls], { encoding: 'utf8', env: { ...process.env, GOTOP_HARNESS_ROOT: site } })
        unlinkSync(calls)
        try { return JSON.parse(r.stdout) as Row[] } catch { throw new Error(`harness: ${r.stderr.slice(0, 300)}${r.stdout.slice(0, 300)}`) }
      }
      const routes: string[] = []
      const post = (async (_s: string, route: string, body: string, opts: { headers?: Record<string, string> }) => {
        routes.push(route)
        steps.push({ rest: `/gotop/v1${route}`, headers: opts.headers ?? {}, body })
        const last = run().pop() as { status: number; body: unknown }
        return { status: last.status, body: JSON.stringify(last.body) }
      }) as never
      const postfull = (id: number) => run([{ postfull: id }]).pop() as { post: Row | null; meta: Record<string, unknown> }
      return { post, postfull, routes }
    }
    try {
      {
        const L = live()
        const src = RS.pluginReadSource(LINK, L.post)
        const posts = await src.getPosts({ page: 1, perPage: 50 })
        const pages = await src.getPages({ page: 1, perPage: 50 })
        check('L1: the read source lists the published posts (no draft) and pages through /content, with the Yoast keyphrase',
          src.via === 'plugin' && JSON.stringify(posts.map((p) => p.id).sort()) === '[21,24]' && pages.some((p) => p.id === 26) &&
          posts.find((p) => p.id === 21)?.seoFocusKeyword === 'waterproof boots' && posts.find((p) => p.id === 21)?.seoKeywordSource === 'yoast_focus_keyword' &&
          posts.find((p) => p.id === 21)?.modified === '2026-03-01T00:00:00Z', JSON.stringify(posts).slice(0, 300))
        const html = await src.getItemContentHtml('/posts', 21)
        check('L2: one item\'s HTML through /content-item', html.includes(`href="${SITE}/blog/older/"`))
        let refused = ''
        try { await src.getItemContentHtml('/posts', 22) } catch (e) { refused = e instanceof Error ? e.message : String(e) }
        check('L3: a draft is refused, as our own words (no provider text)', refused === 'plugin not_in_wordpress', refused)
        check('L4: only signed plugin routes were called (no WordPress REST, no application password)', L.routes.every((r) => r === '/content' || r === '/content-item'), L.routes.join(','))
      }
      {
        const L = live()
        const src = { ...RS.pluginReadSource(LINK, L.post), discoverStoreEntities: NO_STORE }
        const report = await SCAN.scanWordPressSite(src, { includePages: true, maxItems: 200, generatedArticles: [] })
        const targets = (report as unknown as { targets?: { targetUrl: string; inboundLinkCount: number }[] }).targets ?? []
        check('L5: a full content scan runs over the plugin alone: posts, pages, their HTML and the internal links between them',
          report.postsFetched === 2 && report.pagesFetched >= 1 && report.contentItemsFetched >= 3 && report.internalLinksExtracted >= 3 &&
          targets.some((t) => t.targetUrl.includes('/blog/waterproof-boots') && t.inboundLinkCount >= 1), JSON.stringify({ p: report.postsFetched, pg: report.pagesFetched, c: report.contentItemsFetched, l: report.internalLinksExtracted, t: targets.length }))
      }
      {
        const L = live()
        const admin = db({ version: '3.1.0' })
        const r = await REF.runProjectIndexRefresh(admin as never, { projectId: PROJECT, userId: OWNER, force: true }, { post: L.post })
        const rows = admin.tables.wordpress_content_index ?? []
        check('L6: the content index refreshes for a site connected by plugin 3.1 alone (no application password): refreshed, stored',
          r.refreshed === true && rows.length === 1 && rows[0]!.scan_status !== 'failed' && L.routes.includes('/content'), JSON.stringify(r).slice(0, 200))
        const intruder = await REF.runProjectIndexRefresh(db({ version: '3.1.0' }) as never, { projectId: PROJECT, userId: 'someone-else', force: true }, { post: L.post })
        check('L7: ...never for another user (the plugin is read by project AND owner)', intruder.refreshed === false && intruder.outcome === 'no_credentials')
        const RM = await mutant<typeof RefreshModule>('lib/content/wordpress-index-refresh.ts', (s) => s.replace("const plugin = await (deps.loadPlugin ?? loadPluginFor)(admin, projectId, 'content', { ownerId: userId, post: deps.post })", 'const plugin = null as Awaited<ReturnType<typeof loadPluginFor>>'))
        const m = await RM.runProjectIndexRefresh(db({ version: '3.1.0' }) as never, { projectId: PROJECT, userId: OWNER, force: true }, { post: L.post, hasPlugin: async () => true })
        check('MUTATION CONTROL: without the plugin read the index refresh answers needs_app_password again (so L6 would fail)', m.refreshed === false && 'error' in m && m.error === 'needs_app_password')
      }
      {
        const L = live()
        const load: typeof CAP.loadPluginFor = (a, p, cap, o) => CAP.loadPluginFor(a, p, cap, { ...o, post: L.post })
        const entries = await MAP.liveWordPress(db({ version: '3.1.0' }) as never, PROJECT, Date.now, OWNER, load, L.post)(Date.now() + 60_000)
        check('L8: the site map lists WordPress posts and pages through the plugin', entries.some((e) => e.u === `${SITE}/blog/waterproof-boots/` && e.p === 'post') && entries.some((e) => e.p === 'page'), JSON.stringify(entries).slice(0, 200))
        const none = await MAP.liveWordPress(db({ version: '3.1.0' }) as never, PROJECT, Date.now, 'someone-else', load, L.post)(Date.now() + 60_000)
        check('L9: ...not for another owner', none.length === 0)
        const SM = await mutant<typeof SiteMapModule>('lib/content/existing-content/site-map-run.ts', (s) => s.replace('  if (plugin) return pluginReadSource(plugin.link, post)\n', ''))
        const m = await SM.liveWordPress(db({ version: '3.1.0' }) as never, PROJECT, Date.now, OWNER, load, L.post)(Date.now() + 60_000)
        check('MUTATION CONTROL: a site map that ignores the plugin lists nothing for a plugin-only site', m.length === 0)
      }
      {
        const L = live()
        const deps = MA.pluginMediaDeps(L.post)
        const src = `${SITE}/wp-content/uploads/2026/01/red-boots-300x200.jpg`
        const preview = await MA.previewMediaAlt(LINK, [src], { pageTitle: 'Waterproof boots', siteName: 'Boots & Co' }, deps)
        check('L10: Media Library alt: the page\'s image is found through /media-alt by its file name, and words are offered', preview.length === 1 && preview[0]!.media === 600 && preview[0]!.after.length > 0, JSON.stringify(preview))
        const applied = await MA.applyMediaAlt(LINK, [{ media: 600, alt: 'Red leather boots' }], deps)
        check('L11: ...applied, read back from WordPress, with an undo of what was there', applied.ok && applied.status === 'applied' && applied.undo?.items[0]?.previous === '' && L.postfull(600).meta._wp_attachment_image_alt === 'Red leather boots', JSON.stringify(applied))
        const again = await MA.applyMediaAlt(LINK, [{ media: 600, alt: 'Red leather boots' }], deps)
        check('L12: ...applying the same words again changes nothing (already)', again.ok && again.status === 'already')
        const other = await MA.applyMediaAlt(LINK, [{ media: 600, alt: 'Something else' }], deps)
        check('L13: ...words someone wrote since the preview stay (changed_since_preview)', !other.ok && other.code === 'changed_since_preview')
        const undone = applied.ok && applied.undo ? await MA.revertMediaAlt(LINK, applied.undo, deps) : { ok: false }
        check('L14: ...and undone: the alt text is removed again', undone.ok && !('_wp_attachment_image_alt' in (L.postfull(600).meta ?? {})))
        const missing = await MA.applyMediaAlt(LINK, [{ media: 21, alt: 'Not an image' }], deps)
        check('L15: a post that is not an image is not_in_wordpress, nothing written', !missing.ok && missing.code === 'not_in_wordpress')
      }
      {
        const L = live()
        const admin = db({ version: '3.1.0' })
        const pub = await M.loadWordPressPublisher(admin as never, PROJECT)
        if ('error' in pub || pub.via !== 'plugin') throw new Error('expected the plugin publisher')
        const when = new Date(Date.now() + 3 * 86_400_000)
        when.setUTCSeconds(0, 0)
        const local = new Date(when.getTime() + 2 * 3_600_000).toISOString().slice(0, 16) + ':00+02:00'
        const sched = await M.publishArticleToWordPress(admin as never, pub, ARTICLE() as never, { status: 'publish', scheduleAt: local }, { post: L.post })
        const fp = sched.ok ? L.postfull(sched.wpPostId).post : null
        check('L16: a scheduled post: WordPress has it as future at the same moment in GMT', sched.ok && fp?.post_status === 'future' && fp?.post_date_gmt === when.toISOString().slice(0, 19).replace('T', ' '), JSON.stringify(fp).slice(0, 200))
        const second = await M.publishArticleToWordPress(admin as never, pub, ARTICLE() as never, { status: 'publish', forceNew: true }, { post: L.post })
        check('L17: a second, separate post for the same article (forceNew → new_post)', sched.ok && second.ok && second.via === 'plugin' && second.wpPostId !== sched.wpPostId && second.updated === false)
        const byDana = await M.publishArticleToWordPress(admin as never, pub, ARTICLE({ slug: 'by-dana' }) as never, { status: 'draft', forceNew: true, authorId: 2 }, { post: L.post })
        check('L18: an author who may publish: the post is theirs', byDana.ok && L.postfull(byDana.wpPostId).post?.post_author === 2)
        const bySam = await M.publishArticleToWordPress(admin as never, pub, ARTICLE() as never, { status: 'draft', forceNew: true, authorId: 3 }, { post: L.post })
        check('L19: an author who may not publish: refused, our own code', !bySam.ok && bySam.detail === 'plugin_author_invalid', JSON.stringify(bySam))
        const adopt = await M.publishArticleToWordPress(admin as never, pub, ARTICLE({ title: 'Waterproof boots, updated' }) as never, { status: 'publish', existing: { postId: 24 } }, { post: L.post })
        const p24 = L.postfull(24)
        check('L20: the post the app recorded for this article, made before without the plugin, is taken over and updated (adopt)',
          adopt.ok && adopt.via === 'plugin' && adopt.wpPostId === 24 && p24.post?.post_title === 'Waterproof boots, updated' && p24.meta._gotop_article_id === ART, JSON.stringify(adopt).slice(0, 200))
        const pub2 = await M.loadWordPressPublisher(db({ version: '3.1.0', articles: [] }) as never, PROJECT)
        const theirs = 'error' in pub2 ? null : await M.publishArticleToWordPress(admin as never, pub2, ARTICLE({ id: ART2 }) as never, { status: 'publish', existing: { postId: 24 } }, { post: L.post })
        check('L21: ...but another article cannot take that post again (it is tied now): not_ours, nothing overwritten', !!theirs && !theirs.ok && theirs.detail === 'plugin_not_ours' && L.postfull(24).meta._gotop_article_id === ART)
      }
    } finally {
      rmSync(site, { recursive: true, force: true })
    }
  }

  // ── E) inside a REAL WordPress ─────────────────────────────────────────────
  console.log('\nE) a real WordPress (QA_WORDPRESS_ROOT): the 3.1 routes, the settings page, a second copy')
  {
    const wpRoot = process.env.QA_WORDPRESS_ROOT || '/tmp/claude-0/wp'
    const db0 = join(wpRoot, 'wp-content/database/wp.sqlite')
    if (!hasPhp || !existsSync(join(wpRoot, 'wp-load.php')) || !existsSync(db0)) {
      check(`E0: no WordPress with a sqlite database at ${wpRoot} (set QA_WORDPRESS_ROOT): the real-WordPress checks did not run (report this)`, true)
    } else {
      const runner = join(ROOT, 'lib/content/__qa__/wp-routes-runner.php')
      const state = mkdtempSync(join(tmpdir(), 'wp-31-state-'))
      copyFileSync(db0, join(state, 'wp.sqlite'))
      const ek = generatePluginKey()
      const ELINK: PluginLink = { siteUrl: 'http://127.0.0.1:8899', keyId: ek.keyId, secret: ek.secret }
      const wp = (req: Row, dir = join(ROOT, 'wordpress-plugin/gotop-seo-bridge')) => {
        const f = join(state, `req-${Math.random().toString(36).slice(2)}.json`)
        writeFileSync(f, JSON.stringify(req))
        const r = spawnSync('php', [runner, wpRoot, dir, f, state], { encoding: 'utf8' })
        unlinkSync(f)
        const at = r.stdout.lastIndexOf('@@GOTOP@@')
        if (at < 0) return { __raw: `${r.status} ${r.stderr.slice(-400)} ${r.stdout.slice(-400)}` } as Row
        return JSON.parse(r.stdout.slice(at + 9)) as Row
      }
      const routes: string[] = []
      const post = (async (_s: string, route: string, body: string, opts: { headers?: Record<string, string> }) => {
        routes.push(route)
        const a = wp({ route: `/gotop/v1${route}`, headers: opts.headers ?? {}, body }) as { status?: number; body?: unknown; __raw?: string }
        if (a.__raw) throw new Error(`wordpress: ${a.__raw}`)
        return { status: a.status ?? 500, body: JSON.stringify(a.body) }
      }) as never
      try {
        wp({ deactivate: true })
        const s = wp({ setup: true, code: pairingCode(ek) }) as Record<string, number | string | null>
        check('E1: the plugin loads in WordPress as an active plugin does (after plugins_loaded), pairs with a code through its own route', s.paired === 200 && s.plugin === '3.1.0', JSON.stringify(s).slice(0, 300))
        console.log(`  (WordPress ${s.version})`)
        const page = wp({ notices: true, admin: true }) as { notices?: string; routes?: string[]; settings_page?: boolean; version?: string }
        check('E2: Settings > GO TOP SEO opens with the pairing form; no "two copies" notice when it is alone; every signed route is registered',
          page.settings_page === true && !/Two copies/.test(String(page.notices)) && ['content', 'content-item', 'authors', 'media-alt', 'publish', 'terms', 'status'].every((r) => (page.routes ?? []).includes(`/gotop/v1/${r}`)), JSON.stringify({ ...page, routes: undefined }).slice(0, 300))
        {
          const m = mutantPlugin31('includes/admin.php', "__NAMESPACE__ . '\\\\gotop_seo_bridge_admin_page'", "'gotop_seo_bridge_admin_page'")
          const mp = wp({ notices: true, admin: true }, m.dir) as { settings_page?: boolean; __raw?: string }
          // PHP 8 WordPress: a callback that does not resolve is a fatal error when the page is opened.
          check('MUTATION CONTROL: the settings page handed to WordPress by a bare (un-namespaced) name does not open in WordPress ("There has been a critical error on this website"; so E2 would fail)',
            m.found && (mp.settings_page === false || /critical error on this website|not a valid callback/.test(String(mp.__raw))), String(mp.__raw ?? JSON.stringify(mp)).slice(-500))
          m.done()
        }
        const status = await (await import('@/lib/site-fix/plugin-client')).pluginStatus(ELINK, post)
        check('E3: /status answers 3.1.0 and its capabilities, signed', status.ok && status.body.version === '3.1.0' && CAP.PLUGIN_CAPABILITIES.every((c) => (status.body.capabilities ?? []).includes(c)), JSON.stringify(status).slice(0, 300))
        const src = { ...RS.pluginReadSource(ELINK, post), discoverStoreEntities: NO_STORE }
        const posts = await src.getPosts({ page: 1, perPage: 50 })
        check('E4: the content list: published posts only (the draft is not there), with their addresses',
          posts.some((p) => p.id === s.boots && /waterproof-boots/.test(p.link)) && posts.some((p) => p.id === s.older) && !posts.some((p) => p.id === s.draft), JSON.stringify(posts.map((p) => [p.id, p.link])))
        const report = await SCAN.scanWordPressSite(src, { includePages: true, maxItems: 200, generatedArticles: [] })
        check('E5: a full content scan through the plugin alone: posts, the page, their HTML, the internal links between them',
          report.postsFetched >= 2 && report.pagesFetched >= 1 && report.contentItemsFetched >= 3 && report.internalLinksExtracted >= 2, JSON.stringify({ p: report.postsFetched, pg: report.pagesFetched, c: report.contentItemsFetched, l: report.internalLinksExtracted, e: report.errors?.slice(0, 2) }))
        const authors = await (await import('@/lib/site-fix/plugin-client')).pluginAuthors(ELINK, post)
        const names = authors.ok ? authors.body.items.map((a) => a.name) : []
        check('E6: the authors: who may publish (the administrator, the editor), never the subscriber, never an e-mail',
          authors.ok && names.includes('Dana Editor') && !authors.body.items.some((a) => a.id === s.reader) && !JSON.stringify(authors.body).includes('@'), JSON.stringify(authors).slice(0, 300))
        const deps = MA.pluginMediaDeps(post)
        const preview = await MA.previewMediaAlt(ELINK, [String(s.media_url)], { pageTitle: 'Waterproof boots', siteName: 'Boots & Co' }, deps)
        const applied = preview.length === 1 ? await MA.applyMediaAlt(ELINK, [{ media: preview[0]!.media, alt: 'Red leather boots' }], deps) : null
        const afterApply = (wp({ read: s.media }) as { meta?: { alt?: string } }).meta?.alt
        const undone = applied?.ok && applied.undo ? await MA.revertMediaAlt(ELINK, applied.undo, deps) : null
        const afterUndo = (wp({ read: s.media }) as { meta?: { alt?: string } }).meta?.alt
        check('E7: Media Library alt text: found by the page\'s image address, written, and undone, in WordPress itself',
          preview[0]?.media === s.media && !!applied?.ok && afterApply === 'Red leather boots' && !!undone?.ok && afterUndo === '', JSON.stringify({ preview, applied, afterApply, afterUndo }).slice(0, 300))
        const admin = db({ version: '3.1.0' })
        ;(admin.tables.site_fix_plugin_links![0] as Row).key_id = ek.keyId
        ;(admin.tables.site_fix_plugin_links![0] as Row).secret_encrypted = encryptCredential(ek.secret)
        ;(admin.tables.site_fix_plugin_links![0] as Row).site_url = ELINK.siteUrl
        const pub = await M.loadWordPressPublisher(admin as never, PROJECT)
        if ('error' in pub || pub.via !== 'plugin') throw new Error('expected the plugin publisher')
        const when = new Date(Date.now() + 5 * 86_400_000); when.setUTCSeconds(0, 0)
        const sched = await M.publishArticleToWordPress(admin as never, pub, ARTICLE() as never, { status: 'publish', scheduleAt: when.toISOString().slice(0, 19) + 'Z' }, { post })
        const sp = sched.ok ? (wp({ read: sched.wpPostId }) as { post?: Row; meta?: Row }) : null
        check('E8: a scheduled post: WordPress holds it as future, at that GMT time, tied to the article', sched.ok && sp?.post?.post_status === 'future' && sp?.post?.post_date_gmt === when.toISOString().slice(0, 19).replace('T', ' ') && sp?.meta?.article === ART, JSON.stringify(sp).slice(0, 300))
        const second = await M.publishArticleToWordPress(admin as never, pub, ARTICLE() as never, { status: 'draft', forceNew: true, authorId: Number(s.editor) }, { post })
        const sp2 = second.ok ? (wp({ read: second.wpPostId }) as { post?: Row }) : null
        check('E9: a second, separate post for the same article, as the editor', sched.ok && second.ok && second.wpPostId !== sched.wpPostId && sp2?.post?.post_author === s.editor, JSON.stringify(second).slice(0, 200))
        const bySub = await M.publishArticleToWordPress(admin as never, pub, ARTICLE() as never, { status: 'draft', forceNew: true, authorId: Number(s.reader) }, { post })
        check('E10: the subscriber as author is refused (author_invalid), in our own words', !bySub.ok && bySub.detail === 'plugin_author_invalid', JSON.stringify(bySub))
        const adopt = await M.publishArticleToWordPress(admin as never, pub, ARTICLE({ title: 'Older post, now ours' }) as never, { status: 'publish', existing: { postId: Number(s.older) } }, { post })
        const ap = wp({ read: s.older }) as { post?: Row; meta?: Row }
        check('E11: the post recorded for this article, made without the plugin, is taken over (adopt) and updated', adopt.ok && adopt.wpPostId === s.older && ap.post?.post_title === 'Older post, now ours' && ap.meta?.article === ART, JSON.stringify({ adopt, ap }).slice(0, 300))
        const pageAdopt = await M.publishArticleToWordPress(admin as never, pub, ARTICLE({ id: ART2 }) as never, { status: 'publish', existing: { postId: Number(s.page) } }, { post })
        check('E12: a page is never taken over', !pageAdopt.ok && (wp({ read: s.page }) as { post?: Row }).post?.post_title === 'About')
        check('E13: every request was a signed GO TOP route (no WordPress REST login, no application password)', routes.every((r) => ['/status', '/content', '/content-item', '/terms', '/authors', '/media-alt', '/publish', '/media', '/fix'].includes(r)), [...new Set(routes)].join(','))

        // A second copy: the 3.0.0 this repo shipped before (git), active beside 3.1.0.
        const base = spawnSync('git', ['ls-tree', '-r', '--name-only', '0d5c11b9', 'wordpress-plugin/gotop-seo-bridge/'], { encoding: 'utf8', cwd: ROOT })
        const files = base.status === 0 ? base.stdout.split('\n').filter((f) => f.endsWith('.php')) : []
        if (files.length === 0) {
          check('E14: the 3.0.0 copy could not be read from git here: the two-copies check in WordPress did not run (report this)', true)
        } else {
          const plugins = join(state, 'plugins')
          const old = join(plugins, 'gotop-seo-bridge-old')
          for (const f of files) {
            const out = join(old, f.replace('wordpress-plugin/gotop-seo-bridge/', ''))
            mkdirSync(join(out, '..'), { recursive: true })
            writeFileSync(out, spawnSync('git', ['show', `0d5c11b9:${f}`], { encoding: 'utf8', cwd: ROOT }).stdout)
          }
          const both = wp({ plugins_dir: plugins, activate: 'gotop-seo-bridge-old/gotop-seo-bridge.php' }) as { activated?: unknown; __raw?: string }
          const after = wp({ notices: true, admin: true, plugins_dir: plugins }) as { notices?: string; routes?: string[]; version?: string; __raw?: string }
          check('E14: the 3.0.0 copy activated beside 3.1.0: no fatal error, one copy runs (3.0.0) and the administrator is told to delete the older one',
            both.activated === true && after.version === '3.0.0' && /Two copies of GO TOP SEO Bridge are active/.test(String(after.notices)) && (after.routes ?? []).includes('/gotop/v1/publish'), JSON.stringify({ both, after }).slice(0, 400))
          const m = mutantPlugin31('gotop-seo-bridge.php', "if (defined('GOTOP_SEO_BRIDGE_VERSION')) {", 'if (false) {')
          const mAfter = wp({ notices: true, admin: true, plugins_dir: plugins }, m.dir) as { notices?: string; __raw?: string }
          check('MUTATION CONTROL: without the duplicate check WordPress runs both copies and says nothing (so E14 would fail)', m.found && !/Two copies/.test(String(mAfter.notices)), JSON.stringify(mAfter).slice(0, 300))
          m.done()
        }
      } finally {
        rmSync(state, { recursive: true, force: true })
      }
    }
  }

  // ── S) publish options, decided in the app ─────────────────────────────────
  console.log('\nS) publish options: what goes where')
  check('S1: a time with its zone becomes WordPress\'s GMT; a time without a zone, or nonsense, is refused',
    M.gmtDate('2026-11-01T09:30:00+02:00') === '2026-11-01 07:30:00' && M.gmtDate('2026-11-01T07:30:00Z') === '2026-11-01 07:30:00' &&
    M.gmtDate('2026-11-01T09:30:00') === null && M.gmtDate('2026-11-01') === null && M.gmtDate('tomorrow') === null)
  {
    const appOnly = await M.loadWordPressPublisher(db({ version: null, wp: true }) as never, PROJECT)
    const ap = appPassword()
    const s = 'error' in appOnly ? null : await M.publishArticleToWordPress(db() as never, appOnly, ARTICLE() as never, { status: 'publish', scheduleAt: '2026-11-01T09:30:00Z' }, { appPassword: ap.fn })
    const a = 'error' in appOnly ? null : await M.publishArticleToWordPress(db() as never, appOnly, ARTICLE() as never, { status: 'publish', authorId: 2 }, { appPassword: ap.fn })
    check('S2: application password only: a time or an author is a typed refusal, never a post published without them', !!s && !s.ok && s.detail === 'plugin_schedule_unsupported' && !!a && !a.ok && a.detail === 'plugin_author_unsupported' && ap.calls.length === 0)
    const plain = 'error' in appOnly ? null : await M.publishArticleToWordPress(db() as never, appOnly, ARTICLE() as never, { status: 'publish' }, { appPassword: ap.fn })
    check('S3: ...and a plain publish over it is exactly as before', !!plain && plain.ok && plain.via === 'app_password' && ap.calls.length === 1)
  }
  {
    const admin = db({ version: '3.0.0', wp: true })
    const pub = await M.loadWordPressPublisher(admin as never, PROJECT)
    const t = canned({ '/status': { status: 200, body: { ok: true, version: '3.0.0', seo_plugin: 'none' } } }); const ap = appPassword()
    const r = 'error' in pub ? null : await M.publishArticleToWordPress(admin as never, pub, ARTICLE() as never, { status: 'publish', scheduleAt: '2026-11-01T09:30:00Z' }, { post: t.post, appPassword: ap.fn })
    check('S4: plugin 3.0.0 with an application password, a scheduled post: asked once (/status), then refused; never over the application password',
      !!r && !r.ok && r.detail === 'plugin_schedule_unsupported' && ap.calls.length === 0 && t.sent.map((x) => x.route).join() === '/status', t.sent.map((x) => x.route).join())
    const nm = await mutant<typeof PublishModule>('lib/content/wordpress-plugin-publish.ts', (s) => s.replace('    if (publisher.creds && !pluginOnly) {\n      const r = await viaAppPassword', '    if (publisher.creds) {\n      const r = await viaAppPassword'))
    const pubM = await nm.loadWordPressPublisher(admin as never, PROJECT)
    const ap2 = appPassword()
    const mr = 'error' in pubM ? null : await nm.publishArticleToWordPress(admin as never, pubM, ARTICLE() as never, { status: 'publish', scheduleAt: '2026-11-01T09:30:00Z' }, { post: canned({ '/status': { status: 200, body: { ok: true, version: '3.0.0' } } }).post, appPassword: ap2.fn })
    check('MUTATION CONTROL: without the plugin-only rule the scheduled post goes out over the application password, live at once (so S4 would fail)', !!mr && mr.ok && ap2.calls.length === 1)
    const t2 = canned({ '/status': { status: 200, body: { ok: true, version: '3.0.0' } } }); const ap3 = appPassword()
    const fn = 'error' in pub ? null : await M.publishArticleToWordPress(admin as never, pub, ARTICLE() as never, { status: 'publish', existing: { postId: 77 }, forceNew: true }, { post: t2.post, appPassword: ap3.fn })
    check('S5: plugin 3.0.0 with an application password, a second post: the application password, as before', !!fn && fn.ok && fn.via === 'app_password' && ap3.calls.length === 1)
  }
  {
    const admin = db({ version: '3.1.0' })
    const pub = await M.loadWordPressPublisher(admin as never, PROJECT)
    const t = canned()
    const r = 'error' in pub ? null : await M.publishArticleToWordPress(admin as never, pub, ARTICLE() as never, { status: 'publish', scheduleAt: '2026-11-01T09:30:00+02:00', authorId: 2, forceNew: true }, { post: t.post })
    const body = JSON.parse(t.sent.find((x) => x.route === '/publish')?.body ?? '{}')
    check('S6: plugin 3.1.0: /publish carries status future, date_gmt, author_id and new_post, nothing asked of /status',
      !!r && r.ok && body.status === 'future' && body.date_gmt === '2026-11-01 07:30:00' && body.author_id === 2 && body.new_post === true && !t.sent.some((x) => x.route === '/status'), JSON.stringify(body).slice(0, 300))
    const t2 = canned()
    await ('error' in pub ? null : M.publishArticleToWordPress(admin as never, pub, ARTICLE() as never, { status: 'publish', existing: { postId: 77 } }, { post: t2.post }))
    const b2 = JSON.parse(t2.sent.find((x) => x.route === '/publish')?.body ?? '{}')
    check('S7: an update of the recorded post asks to take it over (adopt) with its post_id, never new_post', b2.post_id === 77 && b2.adopt === true && b2.new_post === undefined)
    const t3 = canned()
    await ('error' in pub ? null : M.publishArticleToWordPress(admin as never, pub, ARTICLE() as never, { status: 'publish' }, { post: t3.post }))
    const b3 = JSON.parse(t3.sent.find((x) => x.route === '/publish')?.body ?? '{}')
    check('S8: a first publish asks for nothing extra (no adopt, no new_post, no date, no author)', !('adopt' in b3) && !('new_post' in b3) && !('date_gmt' in b3) && !('author_id' in b3) && b3.status === 'publish')
    const old = await M.loadWordPressPublisher(db({ version: '3.0.0' }) as never, PROJECT)
    const t4 = canned({ '/status': { status: 200, body: { ok: true, version: '3.0.0' } } })
    await ('error' in old ? null : M.publishArticleToWordPress(db({ version: '3.0.0' }) as never, old, ARTICLE() as never, { status: 'publish', existing: { postId: 77 } }, { post: t4.post }))
    const b4 = JSON.parse(t4.sent.find((x) => x.route === '/publish')?.body ?? '{}')
    check('S9: a 3.0.0 plugin is never sent adopt (it does not know it)', b4.post_id === 77 && !('adopt' in b4))
    const na = await mutant<typeof PublishModule>('lib/content/wordpress-plugin-publish.ts', (s) => s.replace("const adopt = !!opts.existing && pluginCan(plugin.version, 'adopt')", 'const adopt = !!opts.existing'))
    const t5 = canned({ '/status': { status: 200, body: { ok: true, version: '3.0.0' } } })
    const oldM = await na.loadWordPressPublisher(db({ version: '3.0.0' }) as never, PROJECT)
    await ('error' in oldM ? null : na.publishArticleToWordPress(db({ version: '3.0.0' }) as never, oldM, ARTICLE() as never, { status: 'publish', existing: { postId: 77 } }, { post: t5.post }))
    check('MUTATION CONTROL: adopt without the version gate reaches a 3.0.0 plugin (so S9 would fail)', JSON.parse(t5.sent.find((x) => x.route === '/publish')?.body ?? '{}').adopt === true)
  }

  // ── G) the gate ────────────────────────────────────────────────────────────
  console.log('\nG) the 3.1 gate')
  check('G1: every 3.1 capability needs 3.1.0 by version; /status\'s own list wins when it is known',
    CAP.PLUGIN_CAPABILITIES.every((c) => CAP.pluginCan('3.1.0', c) && CAP.pluginCan('3.2', c) && !CAP.pluginCan('3.0.0', c) && !CAP.pluginCan(null, c)) &&
    CAP.pluginCan('3.0.0', 'content', ['content']) && !CAP.pluginCan('3.1.0', 'authors', ['content']))
  {
    const scope = { projectId: PROJECT, userId: OWNER }
    const yes = await CAP.pluginLinkConnected(db({ version: '3.1.0' }) as never, scope)
    const old = await CAP.pluginLinkConnected(db({ version: '3.0.0' }) as never, scope)
    const oldOk2 = await CAP.pluginLinkConnected(db({ version: '3.0.0' }) as never, scope, '2.0.0')
    const pend = await CAP.pluginLinkConnected(db({ version: '3.1.0', status: 'pending' }) as never, scope)
    const other = await CAP.pluginLinkConnected(db({ version: '3.1.0', owner: 'someone-else' }) as never, scope)
    check('G2: pluginLinkConnected: connected and >= the version asked, by project AND owner', yes && !old && oldOk2 && !pend && !other)
    const admin = db({ version: '3.0.0' })
    const p = await CAP.loadConnectedPlugin(admin as never, PROJECT)
    const fresh = p ? await CAP.refreshedPlugin(admin as never, p, 'content', { post: canned().post }) : null
    check('G3: a stored 3.0.0 that was updated: one /status, then 3.1.0 is used and stored', fresh?.version === '3.1.0' && admin.tables.site_fix_plugin_links![0]!.plugin_version === '3.1.0')
    const still = p ? await CAP.refreshedPlugin(db({ version: '3.0.0' }) as never, p, 'content', { post: canned({ '/status': { status: 200, body: { ok: true, version: '3.0.0' } } }).post }) : 'x'
    check('G4: ...and a plugin still on 3.0.0 is not used for 3.1 work', still === null)
    const notOwner = await CAP.loadConnectedPlugin(db({ version: '3.1.0' }) as never, PROJECT, { ownerId: 'someone-else' })
    check('G5: loadConnectedPlugin refuses a caller who is not the project\'s owner', notOwner === null)
    const CM = await mutant<typeof CapModule>('lib/site-fix/plugin-capabilities.ts', (s) => s.replace("    if (opts.ownerId !== undefined && opts.ownerId !== owner) return null\n", ''))
    check('MUTATION CONTROL: without the owner check another user gets the plugin (so G5 would fail)', (await CM.loadConnectedPlugin(db({ version: '3.1.0' }) as never, PROJECT, { ownerId: 'someone-else' })) !== null)
  }

  // ── W) wiring ──────────────────────────────────────────────────────────────
  console.log('\nW) wiring: where the plugin is preferred')
  {
    const route = strip(read('app/api/content/articles/[id]/wordpress/route.ts'))
    const ok = (s: string) => /if \(status !== 'publish' \|\| typeof body\.scheduled_at !== 'string' \|\| !gmtDate\(body\.scheduled_at\)\)/.test(s) &&
      /Number\.isInteger\(body\.author_id\) \|\| body\.author_id <= 0/.test(s) &&
      /const goesLive = status === 'publish' && !scheduleAt/.test(s) && (s.match(/if \(goesLive\)/g) ?? []).length === 3 &&
      /wp_status: scheduleAt \? 'future' : status/.test(s)
    check('W1: the publish route checks scheduled_at (a zoned time, publish only) and author_id (a positive integer); a scheduled post is not marked live, its pool item stays, no keyword is added', ok(route))
    check('MUTATION CONTROL: a scheduled post marked published at once is caught', !ok(route.replace('const goesLive = status === \'publish\' && !scheduleAt', 'const goesLive = status === \'publish\'')))
  }
  {
    const files: [string, RegExp][] = [
      ['app/api/wordpress/categories/route.ts', /const plugin = await loadPublishPlugin\(auth\.admin, auth\.project\.id, \{ ownerId: auth\.user\.id \}\)\s*const viaPlugin = plugin \? await pluginTerms\(plugin\.link, 'category'\) : null\s*if \(viaPlugin\?\.ok\) return[\s\S]*?const loaded = await loadWordPressCredentials/],
      ['app/api/wordpress/tags/route.ts', /const plugin = await loadPublishPlugin\(auth\.admin, auth\.project\.id, \{ ownerId: auth\.user\.id \}\)\s*const viaPlugin = plugin \? await pluginTerms\(plugin\.link, 'post_tag'\) : null\s*if \(viaPlugin\?\.ok\) return[\s\S]*?const loaded = await loadWordPressCredentials/],
      ['app/api/wordpress/authors/route.ts', /const plugin = await loadPluginFor\(auth\.admin, auth\.project\.id, 'authors', \{ ownerId: auth\.user\.id \}\)\s*const viaPlugin = plugin \? await pluginAuthors\(plugin\.link\) : null\s*if \(viaPlugin\?\.ok\) \{[\s\S]*?const loaded = await loadWordPressCredentials/],
      ['app/api/wordpress/seo-plugin/route.ts', /const viaPlugin = await loadConnectedPlugin\(auth\.admin, auth\.project\.id, \{ ownerId: auth\.user\.id \}\)\s*if \(viaPlugin\?\.seoPlugin\) return[\s\S]*?const loaded = await loadWordPressCredentials/],
    ]
    for (const [f, re] of files) check(`W2 ${f.split('/').slice(-2, -1)[0]}: the plugin first (owner-checked), the application password after it`, re.test(strip(read(f))))
    const cats = strip(read('app/api/wordpress/categories/route.ts'))
    check('MUTATION CONTROL: a route that reads the plugin without the owner check is caught', !files[0]![1].test(cats.replace('loadPublishPlugin(auth.admin, auth.project.id, { ownerId: auth.user.id })', 'loadPublishPlugin(auth.admin, auth.project.id)')))
    const tags = strip(read('app/api/wordpress/tags/route.ts'))
    const late = tags.replace(/(  const plugin = await loadPublishPlugin[^\n]*\n  const viaPlugin[^\n]*\n  if \(viaPlugin\?\.ok\)[^\n]*\n)([\s\S]*?)(\n  try \{)/, '$2\n$1$3')
    check('MUTATION CONTROL: a route that asks the application password first is caught', late !== tags && !files[1]![1].test(late))
    const authors = strip(read('app/api/wordpress/authors/route.ts'))
    check('W3: the authors answer carries id and name only (no e-mail, no slug from the site)', /authors: viaPlugin\.body\.items\.map\(\(u\) => \(\{ id: u\.id, name: u\.name, slug: '' \}\)\)/.test(authors))
  }
  {
    const scan = strip(read('app/api/content/automation/internal-links/site-scan/route.ts'))
    const ok = (s: string) => /loadPluginFor\([^)]*'content'[^)]*ownerId/.test(s) && /pluginReadSource\(/.test(s) && /scanWordPressSite\(/.test(s)
    check('W4: the internal-link site scan reads through the plugin 3.1 (owner-checked) before the application password', ok(scan))
    check('MUTATION CONTROL: a scan without the plugin source is caught', !ok(scan.replace(/pluginReadSource\(/g, 'credsReadSource(')))
    const sh = strip(read('app/api/site-health/scan/route.ts'))
    check('W5: the site-health scan looks Media Library items up through the plugin 3.1 when it is connected', /pluginMediaDeps\(/.test(sh) && /READ_PLUGIN_MIN_VERSION|'media_alt'/.test(sh))
    const api = strip(read('lib/site-fix/api.ts'))
    const media = (s: string) => /applyMediaAlt\(l\.ctx\.pluginLink,[^\n]*pluginMediaDeps\(deps\.pluginPost\)\)/.test(s) && /revertMediaAlt\(l\.ctx\.pluginLink, revert, pluginMediaDeps\(deps\.pluginPost\)\)/.test(s)
    check('W6: approving and undoing a Media Library row go through the plugin when it is the channel', media(api))
    check('MUTATION CONTROL: an undo that still needs the application password is caught', !media(api.replace('revertMediaAlt(l.ctx.pluginLink, revert, pluginMediaDeps(deps.pluginPost))', 'revertMediaAlt(l.ctx.creds!, revert, wpMediaDeps)')))
    const connected = [
      ['lib/content/content-index.ts', /pluginLinkConnected\(/],
      ['lib/content/existing-content/load.ts', /pluginLinkConnected\(/],
      ['lib/site-health/sources.ts', /pluginLinkConnected\(/],
    ] as const
    for (const [f, re] of connected) check(`W7 ${f.split('/').pop()}: a connected plugin counts as a connected WordPress site`, re.test(strip(read(f))))
    const nudges = strip(read('lib/nudges/waiting.ts'))
    const onboarding = strip(read('lib/onboarding-emails/run.ts'))
    const counts = (n: string, o: string) => /siteConnected: connection\.pluginConnected \? true : siteConnected/.test(n) &&
      /idsWithRow\(admin, 'site_fix_plugin_links', ids, \{ equals: \['status', 'connected'\] \}\)/.test(o) && /\|\| plugin\.has\(projectId\)/.test(o)
    check('W9: the "connect your site" nudge and the onboarding e-mails count a plugin-only site as connected', counts(nudges, onboarding))
    check('MUTATION CONTROL: onboarding that ignores the plugin is caught', !counts(nudges, onboarding.replace(' || plugin.has(projectId)', '')))
    const ix = strip(read('app/api/content/automation/internal-links/site-scan/route.ts'))
    check('W8: no route in a plugin-only flow pushes the key over /pair or writes /seo-meta (kept for older copies only)', !/pairOverAppPassword|seo-meta/.test(ix) && !/seo-meta/.test(strip(read('lib/content/wordpress-plugin-publish.ts'))))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) process.exitCode = 1
}
main().catch((e) => { console.error(e); console.log(`\n${passed} passed, ${failed + 1} failed`); process.exitCode = 1 })
export {}
