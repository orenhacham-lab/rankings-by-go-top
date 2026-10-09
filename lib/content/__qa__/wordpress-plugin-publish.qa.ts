/**
 * PUBLISHING THROUGH THE GO TOP SEO BRIDGE PLUGIN 3.0.0 (WordPress.org) — the guards.
 *
 *   R) which path: a CONNECTED plugin link with plugin_version >= 3.0.0 publishes through the
 *      plugin (/media, /terms, /publish, then /fix for schema and SEO meta); a 2.x plugin, a
 *      pending or disconnected one, or none publishes over the application password exactly as
 *      before (wpCreatePost, not one plugin call); a plugin-only project can publish; a post made
 *      over the application password before is updated over it (never a second post);
 *   O) ownership: the plugin link is read by project AND owner under the service role; another
 *      owner's row, or a signed-in user who is not the owner, never gets the plugin;
 *   A) platform: loadActivePlatform counts a plugin-only project (>= 3.0.0) as WordPress, not 2.x;
 *   P) EXECUTED against the real plugin PHP (lib/site-fix/__qa__/plugin-harness.php): every request
 *      our code sends is answered by wordpress-plugin/gotop-seo-bridge itself, live, state kept
 *      across calls: create, idempotent update, not_ours, featured + inline images from storage
 *      only, categories/tags, the SEO fields, content through wp_kses_post;
 *   W) wiring + UI: the publish route and the automation use the publisher; the install steps
 *      point to WordPress.org with the deactivate / install / connect-again switch, four languages.
 *
 * MUTATION CONTROLS for each group. Run: npx tsx lib/content/__qa__/wordpress-plugin-publish.qa.ts
 */
import { spawnSync } from 'child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

process.env.CONTENT_CREDENTIALS_ENCRYPTION_KEY = process.env.CONTENT_CREDENTIALS_ENCRYPTION_KEY || 'c'.repeat(64)

import { FakeAdmin } from '@/lib/__qa__/_fake-admin'
import { encryptCredential } from '@/lib/security/credentials-crypto'
import { generatePluginKey, pairingCode } from '@/lib/site-fix/plugin-auth'
import { pluginMedia } from '@/lib/site-fix/plugin-client'
import type * as PublishModule from '../wordpress-plugin-publish'
import type * as PlatformModule from '../platform/load-active-platform'

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
const STORAGE = 'https://pmzicbtulloeynsosseh.supabase.co/storage/v1/object/public/content-article-images/'
const PROJECT = 'p-1'
const OWNER = 'u-owner'
const ART = '0b6f3a52-7d1e-4c55-9a43-2f8d7e6a1b90'
const key = generatePluginKey()
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

type Row = Record<string, unknown>
function db(o: { plugin?: Row | null; wp?: boolean; inline?: boolean } = {}) {
  const tables: Record<string, Row[]> = {
    projects: [{ id: PROJECT, user_id: OWNER, name: 'Boots', business_name: 'Boots & Co', target_domain: 'shop.example.org', language: 'en', country: 'IL' }],
    generated_articles: [{ id: ART, project_id: PROJECT, topic_id: 't-1', title: 'Waterproof boots: the guide', meta_description: 'How to keep boots dry.', excerpt: null,
      featured_image_url: `${STORAGE}feat/boots.png`, faq_json: [], published_at: null, updated_at: null }],
    article_topics: [{ id: 't-1', primary_keyword: 'waterproof boots' }],
    project_article_styles: [],
    article_inline_images: o.inline ? [{ id: 'img-1', article_id: ART, project_id: PROJECT, status: 'ready', storage_path: 'inline/one.png', storage_url: `${STORAGE}inline/one.png`,
      position: 0, alt_text: 'Boots <drying>', caption: null, section_id: 'why', wp_media_id: null, wp_media_url: null }] : [],
    site_fix_plugin_links: o.plugin === null ? [] : [{ project_id: PROJECT, user_id: OWNER, site_url: SITE, key_id: key.keyId, secret_encrypted: encryptCredential(key.secret),
      secret_hint: 'x', status: 'connected', plugin_version: '3.0.0', seo_plugin: 'none', last_seen_at: null, last_error_code: null, ...(o.plugin ?? {}) }],
    wordpress_connections: o.wp === false ? [] : [{ id: 'wpc-1', project_id: PROJECT, site_url: SITE, wp_username: 'admin', wp_application_password_encrypted: encryptCredential('abcd efgh ijkl mnop'),
      connection_status: 'connected' }],
    shopify_connections: [],
    site_platform_connections: [],
  }
  const admin = new FakeAdmin(tables) as FakeAdmin & { storage: unknown }
  admin.storage = { from: () => ({ getPublicUrl: (p: string) => ({ data: { publicUrl: `${STORAGE}${p}` } }) }) }
  return admin
}

type Sent = { route: string; body: string; headers: Record<string, string> }
/** A canned plugin: records what is sent, answers like publish.php does. */
function canned(over: Partial<Record<string, { status: number; body: unknown }>> = {}) {
  const sent: Sent[] = []
  const answers: Record<string, { status: number; body: unknown }> = {
    '/terms': { status: 200, body: { ok: true, items: [{ id: 3, name: 'News', slug: 'news', parent: 0 }, { id: 7, name: 'boots', slug: 'boots', parent: 0 }] } },
    '/media': { status: 200, body: { ok: true, status: 'applied', media_id: 501, url: `${SITE}/wp-content/uploads/boots.png` } },
    '/publish': { status: 200, body: { ok: true, status: 'created', post_id: 100, link: `${SITE}/blog/waterproof-boots/`, post_status: 'publish' } },
    '/fix': { status: 200, body: { ok: true, status: 'applied', fix_id: 'x', post_id: 100 } },
    ...over,
  }
  const post = (async (_site: string, route: string, body: string, opts: { headers?: Record<string, string> }) => {
    sent.push({ route, body, headers: opts.headers ?? {} })
    const a = answers[route] ?? { status: 404, body: { code: 'rest_no_route' } }
    return { status: a.status, body: JSON.stringify(a.body) }
  }) as never
  return { sent, post }
}
/** The application-password path, observed: what wpCreatePost was asked. */
function appPassword() {
  const calls: { siteUrl: string; username: string; status: string }[] = []
  const fn = (async (_a: unknown, creds: { siteUrl: string; username: string }, _art: unknown, opts: { status: string }) => {
    calls.push({ siteUrl: creds.siteUrl, username: creds.username, status: opts.status })
    return { ok: true, wpPostId: 77, wpPostUrl: `${SITE}/old-post/`, featuredMediaId: null, imageWarning: false, updated: false }
  }) as never
  return { calls, fn }
}
const ARTICLE = (over: Row = {}) => ({
  id: ART, title: 'Waterproof boots <2026>: the guide', slug: 'waterproof-boots', excerpt: null, meta_title: 'Waterproof boots', meta_description: 'How to keep boots dry.',
  content_html: '<h2 id="why">Why</h2><p>Dry boots last.</p><script>alert(1)</script><p><a href="javascript:alert(2)" onclick="x()">x</a></p>',
  featured_image_url: `${STORAGE}feat/boots.png`, featured_image_storage_path: 'feat/boots.png',
  wp_primary_category_id: 3, wp_category_ids: [99], wp_tag_ids: [7], ...over,
})

async function main() {
  const M = await import('../wordpress-plugin-publish')
  const P = await import('../platform/load-active-platform')

  // ── R) which path ─────────────────────────────────────────────────────────
  console.log('\nR) which path')
  {
    const admin = db()
    const pub = await M.loadWordPressPublisher(admin as never, PROJECT)
    const t = canned(); const ap = appPassword()
    const r = 'error' in pub ? null : await M.publishArticleToWordPress(admin as never, pub, ARTICLE() as never, { status: 'publish' }, { post: t.post, appPassword: ap.fn })
    const routes = t.sent.map((s) => s.route)
    check('R1: plugin 3.0.0 connected (application password too): the plugin publishes, the application password is not used',
      !('error' in pub) && pub.via === 'plugin' && !!r && r.ok && r.via === 'plugin' && ap.calls.length === 0 && routes.includes('/publish') && routes.includes('/media'), routes.join(','))
    const req = JSON.parse(t.sent.find((s) => s.route === '/publish')?.body ?? '{}')
    check('R2: /publish carries the article id, the status, the featured image, and only categories/tags the site has (99 dropped)',
      req.article_id === ART && req.status === 'publish' && req.featured_media === 501 && JSON.stringify(req.categories) === '[3]' && JSON.stringify(req.tags) === '[7]' && req.post_id === undefined, JSON.stringify(req).slice(0, 300))
    check('R3: the title goes without "<" ">" (the plugin refuses them), the result keeps wpCreatePost\'s shape',
      req.title === 'Waterproof boots 2026 : the guide' && !!r && r.ok && r.wpPostId === 100 && r.wpPostUrl === `${SITE}/blog/waterproof-boots/` && r.featuredMediaId === 501 && r.updated === false && r.taxonomyWarning === true, req.title)
    check('R4: every plugin call is signed', t.sent.every((s) => Object.keys(s.headers).some((h) => /signature/i.test(h))))
  }
  for (const [name, plugin] of [['2.1.0', { plugin_version: '2.1.0' }], ['2.0.0', { plugin_version: '2.0.0' }], ['no version', { plugin_version: null }], ['pending', { status: 'pending' }], ['disconnected', { status: 'disconnected' }]] as const) {
    const admin = db({ plugin })
    const pub = await M.loadWordPressPublisher(admin as never, PROJECT)
    const t = canned(); const ap = appPassword()
    const r = 'error' in pub ? null : await M.publishArticleToWordPress(admin as never, pub, ARTICLE() as never, { status: 'publish' }, { post: t.post, appPassword: ap.fn })
    check(`R5 ${name}: the application password path, unchanged (wpCreatePost with the stored credentials, no plugin call)`,
      !('error' in pub) && pub.via === 'app_password' && ap.calls.length === 1 && ap.calls[0]!.username === 'admin' && t.sent.length === 0 && !!r && r.ok && r.wpPostId === 77)
  }
  {
    const admin = db({ plugin: null })
    const pub = await M.loadWordPressPublisher(admin as never, PROJECT)
    check('R6: no plugin at all: the application password, as before', !('error' in pub) && pub.via === 'app_password')
    const none = await M.loadWordPressPublisher(db({ plugin: null, wp: false }) as never, PROJECT)
    check('R7: neither: the same 404 loadWordPressCredentials answers', 'error' in none && none.status === 404)
    const only = await M.loadWordPressPublisher(db({ wp: false }) as never, PROJECT)
    check('R8: plugin only (no application password), 3.0.0: publishes through the plugin', !('error' in only) && only.via === 'plugin' && only.creds === null && only.connectionId === null)
    const old = await M.loadWordPressPublisher(db({ wp: false, plugin: { plugin_version: '2.1.0' } }) as never, PROJECT)
    check('R9: plugin only, 2.1.0: no publishing connection (404), it cannot publish', 'error' in old && old.status === 404)
  }
  {
    // A post made over the application password: the plugin refuses the update (not_ours) before writing.
    const admin = db()
    const pub = await M.loadWordPressPublisher(admin as never, PROJECT)
    const t = canned({ '/publish': { status: 409, body: { ok: false, code: 'not_ours' } } }); const ap = appPassword()
    const r = 'error' in pub ? null : await M.publishArticleToWordPress(admin as never, pub, ARTICLE() as never, { status: 'publish', existing: { postId: 77, featuredMediaId: 12 } }, { post: t.post, appPassword: ap.fn })
    const sentPub = JSON.parse(t.sent.find((s) => s.route === '/publish')?.body ?? '{}')
    check('R10: an update names the post (post_id) and reuses the known featured image (no /media)', sentPub.post_id === 77 && sentPub.featured_media === 12 && !t.sent.some((s) => s.route === '/media'))
    check('R11: not_ours with an application password: the same post is updated over it, no second post', !!r && r.ok && r.via === 'app_password' && ap.calls.length === 1)
    const only = await M.loadWordPressPublisher(db({ wp: false }) as never, PROJECT)
    const t2 = canned({ '/publish': { status: 409, body: { ok: false, code: 'not_ours' } } }); const ap2 = appPassword()
    const r2 = 'error' in only ? null : await M.publishArticleToWordPress(db({ wp: false }) as never, only, ARTICLE() as never, { status: 'publish', existing: { postId: 77 } }, { post: t2.post, appPassword: ap2.fn })
    check('R12: not_ours and no application password: a typed failure (our own words), nothing created, nothing thrown',
      !!r2 && !r2.ok && r2.kind === 'post_failed' && r2.detail === 'plugin_not_ours' && ap2.calls.length === 0 && t2.sent.filter((s) => s.route === '/publish').length === 1)
    const noImg = canned({ '/media': { status: 415, body: { ok: false, code: 'not_an_image' } } })
    const r3 = 'error' in pub ? null : await M.publishArticleToWordPress(admin as never, pub, ARTICLE() as never, { status: 'publish' }, { post: noImg.post, appPassword: ap.fn })
    check('R13: a publish never goes live without its image: media refused → media_upload_failed, no /publish', !!r3 && !r3.ok && r3.kind === 'media_upload_failed' && !noImg.sent.some((s) => s.route === '/publish'))
    const draft = canned({ '/media': { status: 502, body: { ok: false, code: 'download_failed' } } })
    const r4 = 'error' in pub ? null : await M.publishArticleToWordPress(admin as never, pub, ARTICLE() as never, { status: 'draft' }, { post: draft.post, appPassword: ap.fn })
    check('R14: a draft goes on without it, with the image warning', !!r4 && r4.ok && r4.imageWarning === true && JSON.parse(draft.sent.find((s) => s.route === '/publish')?.body ?? '{}').status === 'draft')
    const sched = 'error' in pub ? null : await M.publishArticleToWordPress(admin as never, pub, ARTICLE() as never, { status: 'future' as never }, { post: canned().post, appPassword: ap.fn })
    check('R15: a status the plugin does not take (future) is a code, never sent', !!sched && !sched.ok && sched.detail === 'plugin_status_unsupported')
  }
  {
    const admin = db()
    const pub = await M.loadWordPressPublisher(admin as never, PROJECT)
    const t = canned()
    const seo = 'error' in pub || pub.via !== 'plugin' ? null : await M.publishSeoFor(admin as never, pub, { wpPostId: 100, wpPostUrl: `${SITE}/blog/waterproof-boots/`, via: 'plugin' },
      { articleId: ART, metaTitle: 'Waterproof <boots>', metaDescription: 'How to keep boots dry.', topicId: 't-1' }, { post: t.post })
    const fixes = t.sent.map((s) => JSON.parse(s.body) as { type: string; url: string; value: { value: string }; job_id: string })
    check('R16: SEO meta through the plugin: title, description and focus keyphrase on the post\'s own address, verified and persisted',
      !!seo && seo.status === 'verified' && fixes.map((f) => f.type).join() === 'seo_title,meta_description,focus_keyphrase' && fixes.every((f) => f.url === `${SITE}/blog/waterproof-boots/`) &&
      fixes[0]!.value.value === 'Waterproof boots' && fixes[2]!.value.value === 'waterproof boots' && (admin.tables.generated_articles![0]!.seo_status === 'verified'), JSON.stringify(fixes).slice(0, 200))
    check('R17: SEO job ids are UUID-shaped and stable (a republish is the plugin\'s "already")', fixes.every((f) => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/.test(f.job_id)) && fixes[0]!.job_id === M.seoJobId(ART, 'seo_title', 'Waterproof boots'))
  }

  const noVersion = await mutant<typeof PublishModule>('lib/content/wordpress-plugin-publish.ts', (s) => s.replace('    if (!versionAtLeast(row.plugin_version, PUBLISH_PLUGIN_MIN_VERSION)) return null\n', ''))
  const mPub = await noVersion.loadWordPressPublisher(db({ plugin: { plugin_version: '2.1.0' } }) as never, PROJECT)
  check('MUTATION CONTROL: without the version check a 2.1.0 plugin is sent articles (so R5 would fail)', !('error' in mPub) && mPub.via === 'plugin')
  const noConnected = await mutant<typeof PublishModule>('lib/content/wordpress-plugin-publish.ts', (s) => s.replace("row.status !== 'connected' || ", ''))
  const mPend = await noConnected.loadWordPressPublisher(db({ plugin: { status: 'pending' } }) as never, PROJECT)
  check('MUTATION CONTROL: without the connected check a pending plugin is used (so R5 pending would fail)', !('error' in mPend) && mPend.via === 'plugin')
  const noFallback = await mutant<typeof PublishModule>('lib/content/wordpress-plugin-publish.ts', (s) => s.replace("if (r.pluginCode === 'not_ours' && publisher.creds) {", 'if (false) {'))
  {
    const admin = db()
    const pub = await noFallback.loadWordPressPublisher(admin as never, PROJECT)
    const ap = appPassword()
    const r = 'error' in pub ? null : await noFallback.publishArticleToWordPress(admin as never, pub, ARTICLE() as never, { status: 'publish', existing: { postId: 77 } },
      { post: canned({ '/publish': { status: 409, body: { ok: false, code: 'not_ours' } } }).post, appPassword: ap.fn })
    check('MUTATION CONTROL: without the not_ours fallback an application-password post cannot be updated (so R11 would fail)', !!r && !r.ok && ap.calls.length === 0)
  }

  // ── O) ownership ──────────────────────────────────────────────────────────
  console.log('\nO) ownership under the service role')
  {
    const theirs = await M.loadWordPressPublisher(db({ plugin: { user_id: 'someone-else' } }) as never, PROJECT)
    check('O1: a plugin row stamped with another owner is never used (the application password is)', !('error' in theirs) && theirs.via === 'app_password')
    const theirsOnly = await M.loadWordPressPublisher(db({ wp: false, plugin: { user_id: 'someone-else' } }) as never, PROJECT)
    check('O2: ... and with no application password the project has no publishing connection', 'error' in theirsOnly && theirsOnly.status === 404)
    const notOwner = await M.loadPublishPlugin(db() as never, PROJECT, { ownerId: 'intruder' })
    const owner = await M.loadPublishPlugin(db() as never, PROJECT, { ownerId: OWNER })
    check('O3: a signed-in user who is not the project owner never gets the plugin; the owner does', notOwner === null && !!owner && owner.link.secret === key.secret)
    const otherProject = await M.loadPublishPlugin(db() as never, 'p-other')
    check('O4: another project reads nothing', otherProject === null)
    const badKey = await M.loadPublishPlugin(db({ plugin: { secret_encrypted: 'not-a-ciphertext' } }) as never, PROJECT)
    check('O5: a key that cannot be decrypted is "no plugin", never thrown', badKey === null)
  }
  const noOwnerCheck = await mutant<typeof PublishModule>('lib/content/wordpress-plugin-publish.ts', (s) => s.replace('    if (opts.ownerId !== undefined && opts.ownerId !== owner) return null\n', ''))
  check('MUTATION CONTROL: without the owner check a non-owner gets the plugin (so O3 would fail)', !!(await noOwnerCheck.loadPublishPlugin(db() as never, PROJECT, { ownerId: 'intruder' })))
  const pubSrc = strip(read('lib/content/wordpress-plugin-publish.ts'))
  const ownerScoped = (src: string) => /readPluginLink\(admin, \{ projectId, userId: owner \}\)/.test(src) && !/from\('site_fix_plugin_links'\)/.test(src)
  check('O6: the link is read only through readPluginLink (project + owner filter), never by a raw query', ownerScoped(pubSrc))
  check('MUTATION CONTROL: a raw unfiltered read of the links is caught', !ownerScoped(pubSrc + "\nadmin.from('site_fix_plugin_links').select('*')"))

  // ── A) the active platform ────────────────────────────────────────────────
  console.log('\nA) the active platform')
  {
    const only = await P.loadActivePlatform(db({ wp: false }) as never, PROJECT)
    const old = await P.loadActivePlatform(db({ wp: false, plugin: { plugin_version: '2.1.0' } }) as never, PROJECT)
    const theirs = await P.loadActivePlatform(db({ wp: false, plugin: { user_id: 'someone-else' } }) as never, PROJECT)
    const both = await P.loadActivePlatform(db() as never, PROJECT)
    check('A1: plugin only, 3.0.0: the project publishes to WordPress (the automation does not pause it)', only.platform === 'wordpress' && only.wordpressActive)
    check('A2: plugin only, 2.1.0, or another owner\'s row: no platform, as before', old.platform === 'none' && theirs.platform === 'none')
    check('A3: with an application-password row everything resolves as before', both.platform === 'wordpress')
  }
  const noPlatform = await mutant<typeof PlatformModule>('lib/content/platform/load-active-platform.ts', (s) => s.replace("?? (await hasPublishPlugin(admin, projectId) ? { connection_status: 'connected' } : null)", ''))
  check('MUTATION CONTROL: without the plugin in the platform read a plugin-only project pauses as "none" (so A1 would fail)', (await noPlatform.loadActivePlatform(db({ wp: false }) as never, PROJECT)).platform === 'none')

  // ── P) the real plugin, executed ──────────────────────────────────────────
  console.log('\nP) the real plugin (PHP harness), live')
  const hasPhp = spawnSync('php', ['-v'], { encoding: 'utf8' }).status === 0
  if (!hasPhp) {
    check('P0: php is not installed here: the executed checks did not run (report this)', true)
  } else {
    const harness = join(ROOT, 'lib/site-fix/__qa__/plugin-harness.php')
    const plugin = join(ROOT, 'wordpress-plugin/gotop-seo-bridge')
    const site = mkdtempSync(join(tmpdir(), 'wp-publish-'))
    mkdirSync(join(site, 'wp-admin/includes'), { recursive: true })
    for (const f of ['file', 'media', 'image']) writeFileSync(join(site, `wp-admin/includes/${f}.php`), '<?php\n')
    /**
     * The plugin, live: each request is appended to one script that the harness replays from a
     * fresh state (ids are deterministic), and the LAST answer is what our code receives.
     */
    function live(pluginDir = plugin) {
      const steps: Record<string, unknown>[] = [
        { rest: '/gotop/v1/pair', body: JSON.stringify({ code: pairingCode(key) }), can: ['manage_options'] },
        { remote: `${STORAGE}feat/boots.png`, base64: PNG },
        { remote: `${STORAGE}inline/one.png`, base64: PNG },
      ]
      const run = (extra: Record<string, unknown>[] = []) => {
        const calls = join(site, `calls-${Math.random().toString(36).slice(2)}.json`)
        writeFileSync(calls, JSON.stringify([...steps, ...extra]))
        const r = spawnSync('php', [harness, pluginDir, calls], { encoding: 'utf8', env: { ...process.env, GOTOP_HARNESS_ROOT: site } })
        unlinkSync(calls)
        try { return JSON.parse(r.stdout) as Record<string, unknown>[] } catch { throw new Error(`harness: ${r.stderr.slice(0, 300)}${r.stdout.slice(0, 300)}`) }
      }
      const post = (async (_site: string, route: string, body: string, opts: { headers?: Record<string, string> }) => {
        steps.push({ rest: `/gotop/v1${route}`, headers: opts.headers ?? {}, body })
        const out = run()
        const last = out[out.length - 1] as { status: number; body: unknown }
        return { status: last.status, body: JSON.stringify(last.body) }
      }) as never
      const postfull = (id: number) => run([{ postfull: id }]).pop() as { post: Row | null; meta: Record<string, string>; downloads: string[]; count: number }
      return { post, postfull, steps }
    }
    try {
      const L = live()
      const admin = db({ wp: false, inline: true })
      const pub = await M.loadWordPressPublisher(admin as never, PROJECT)
      if ('error' in pub || pub.via !== 'plugin') throw new Error('expected the plugin publisher')
      const first = await M.publishArticleToWordPress(admin as never, pub, ARTICLE() as never, { status: 'publish' }, { post: L.post })
      const id = first.ok ? first.wpPostId : 0
      const made = L.postfull(id)
      const p = (made.post ?? {}) as Row
      check('P1: the plugin creates the post: a published post, our title, tied to the article id', first.ok && first.via === 'plugin' && p.post_type === 'post' && p.post_status === 'publish' &&
        p.post_title === 'Waterproof boots 2026 : the guide' && made.meta._gotop_article_id === ART, JSON.stringify(first).slice(0, 300))
      check('P2: the featured image came from GO TOP storage into the Media Library and is the post thumbnail', first.ok && typeof first.featuredMediaId === 'number' &&
        String(made.meta._thumbnail_id) === String(first.featuredMediaId) && made.downloads.includes(`${STORAGE}feat/boots.png`))
      const inl = admin.tables.article_inline_images![0]!
      check('P3: the inline image too, its Media Library id/url persisted (reused on the next publish)', typeof inl.wp_media_id === 'number' && /wp-content\/uploads\/one\.png$/.test(String(inl.wp_media_url)) && inl.status === 'uploaded' && String(p.post_content).includes(String(inl.wp_media_url)), JSON.stringify(inl))
      check('P4: categories and tags as chosen (the deleted 99 never sent, so the plugin did not refuse the post)', JSON.stringify(p.post_category) === '[3]' && JSON.stringify(p.tags_input) === '[7]')
      check('P5: the content went through wp_kses_post: no script, no javascript: link, no handler', !/<script|javascript:|onclick/i.test(String(p.post_content)) && /Dry boots last/.test(String(p.post_content)), String(p.post_content).slice(0, 200))
      check('P6: the plugin answered the post\'s address, which is what we return', first.ok && first.wpPostUrl === `${SITE}/blog/waterproof-boots/`)

      const seo = await M.publishSeoFor(admin as never, pub, first.ok ? first : { wpPostId: 0, wpPostUrl: null, via: 'plugin' }, { articleId: ART, metaTitle: 'Waterproof boots', metaDescription: 'How to keep boots dry.', topicId: 't-1' }, { post: L.post })
      const afterSeo = L.postfull(id)
      check('P7: the SEO fields are written by the plugin\'s /fix on that post (verified)', seo.status === 'verified' && afterSeo.meta._gotop_seo_title === 'Waterproof boots' &&
        afterSeo.meta._gotop_seo_description === 'How to keep boots dry.' && afterSeo.meta._gotop_focus_keyphrase === 'waterproof boots', JSON.stringify(afterSeo.meta).slice(0, 300))
      check('P8: the article schema went through the same plugin (publish only)', first.ok && (first.schema === 'applied' || first.schema === 'already'), String(first.ok && first.schema))

      const again = await M.publishArticleToWordPress(admin as never, pub, ARTICLE({ title: 'Waterproof boots: the guide, updated' }) as never,
        { status: 'publish', existing: { postId: id, featuredMediaId: first.ok ? first.featuredMediaId : null } }, { post: L.post })
      const upd = L.postfull(id)
      check('P9: an update is idempotent: the same post, updated in place, no new post', again.ok && again.wpPostId === id && again.updated === true && upd.count === made.count &&
        (upd.post as Row).post_title === 'Waterproof boots: the guide, updated')
      const wrong = await M.publishArticleToWordPress(admin as never, pub, ARTICLE() as never, { status: 'publish', existing: { postId: 21 } }, { post: L.post })
      const after = L.postfull(21)
      check('P10: another post\'s id is refused by the plugin (not_ours) and nothing is written or created', !wrong.ok && wrong.detail === 'plugin_not_ours' && (after.post as Row).post_title === 'Waterproof boots' && after.count === upd.count, JSON.stringify(wrong))
      const off = await pluginMedia(pub.plugin.link, { url: 'https://evil.example.org/x.png', alt: 'x' }, L.post)
      check('P11: an image address outside GO TOP storage is refused (off_site) and never downloaded', !off.ok && off.pluginCode === 'off_site' && !L.postfull(id).downloads.includes('https://evil.example.org/x.png'))
      const draft = await M.publishArticleToWordPress(admin as never, pub, ARTICLE({ id: '1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f', slug: 'second' }) as never, { status: 'draft' }, { post: L.post })
      check('P12: a second article is its own post, a draft; the same image address is not downloaded twice', draft.ok && draft.wpPostId !== id && (L.postfull(draft.ok ? draft.wpPostId : 0).post as Row)?.post_status === 'draft' &&
        L.postfull(id).downloads.filter((u) => u === `${STORAGE}feat/boots.png`).length === 1)

      // Mutation controls, executed against the same PHP.
      const noPostId = await mutant<typeof PublishModule>('lib/content/wordpress-plugin-publish.ts', (s) => s.replace('    ...(opts.existing ? { post_id: opts.existing.postId } : {}),\n', ''))
      const L2 = live()
      const pub2 = await noPostId.loadWordPressPublisher(db({ wp: false }) as never, PROJECT)
      if ('error' in pub2) throw new Error('expected the plugin publisher')
      await noPostId.publishArticleToWordPress(db({ wp: false }) as never, pub2, ARTICLE() as never, { status: 'publish' }, { post: L2.post })
      const mWrong = await noPostId.publishArticleToWordPress(db({ wp: false }) as never, pub2, ARTICLE() as never, { status: 'publish', existing: { postId: 21 } }, { post: L2.post })
      check('MUTATION CONTROL: without post_id an update of another post is not refused, the plugin quietly writes the article\'s post (so P10 would fail)', mWrong.ok)
      const noScrub = await mutant<typeof PublishModule>('lib/content/wordpress-plugin-publish.ts', (s) => s.replace(".replace(/[<>]/g, ' ')", ''))
      const L3 = live()
      const pub3 = await noScrub.loadWordPressPublisher(db({ wp: false }) as never, PROJECT)
      if ('error' in pub3) throw new Error('expected the plugin publisher')
      const mTitle = await noScrub.publishArticleToWordPress(db({ wp: false }) as never, pub3, ARTICLE() as never, { status: 'publish' }, { post: L3.post })
      check('MUTATION CONTROL: without removing "<" ">" the real plugin refuses the title "<2026>" (so P1 would fail)', !mTitle.ok && mTitle.detail === 'plugin_value_invalid', JSON.stringify(mTitle))
      const noTerms = await mutant<typeof PublishModule>('lib/content/wordpress-plugin-publish.ts', (s) => s.replace('resolveTaxonomy(sel, cats.body.items.map((c) => c.id), tags.body.items.map((t) => t.id))', 'resolveTaxonomy(sel, null, null)'))
      const L4 = live()
      const pub4 = await noTerms.loadWordPressPublisher(db({ wp: false }) as never, PROJECT)
      if ('error' in pub4) throw new Error('expected the plugin publisher')
      const mTerms = await noTerms.publishArticleToWordPress(db({ wp: false }) as never, pub4, ARTICLE() as never, { status: 'publish' }, { post: L4.post })
      check('MUTATION CONTROL: without checking terms against /terms the deleted 99 is sent and the real plugin refuses the post (so P4 would fail)', !mTerms.ok && mTerms.detail === 'plugin_value_invalid')
    } finally {
      rmSync(site, { recursive: true, force: true })
    }
  }

  // ── W) wiring + UI ────────────────────────────────────────────────────────
  console.log('\nW) wiring and the install steps')
  const route = strip(read('app/api/content/articles/[id]/wordpress/route.ts'))
  const auto = strip(read('lib/content/automation/publish-item.ts'))
  const wired = (src: string, adminVar: string) => src.includes(`loadWordPressPublisher(${adminVar}`) && /publishArticleToWordPress\(/.test(src) && /publishSeoFor\(/.test(src) &&
    !/loadWordPressCredentials\(/.test(src) && !/\bwpCreatePost\(/.test(src)
  check('W1: the publish route loads the publisher by project and the signed-in owner, and publishes through it', wired(route, 'auth.admin') && /ownerId: auth\.user\.id/.test(route))
  check('W2: the automation publishes through it too (wp_connection_id from it, null when plugin-only)', wired(auto, 'admin') && /wp_connection_id: loaded\.connectionId/.test(auto))
  check('MUTATION CONTROL: a route that calls wpCreatePost directly again is caught', !wired(route.replace('publishArticleToWordPress(auth.admin, loaded,', 'wpCreatePost(auth.admin, loaded.creds,'), 'auth.admin'))
  const gate = strip(read('components/content/ArticleEditorPublishGate.tsx'))
  const conn = strip(read('app/api/wordpress/connection/route.ts'))
  check('W3: the editor gate and the connection read know the publishing plugin (site and version only, never its key)',
    /publishingPlugin/.test(gate) && /publishingPlugin: plugin \? \{ siteUrl: plugin\.link\.siteUrl, version: plugin\.version \} : null/.test(conn) && /ownerId: auth\.user\.id/.test(conn))
  for (const [kind, file] of [['categories', 'app/api/wordpress/categories/route.ts'], ['tags', 'app/api/wordpress/tags/route.ts']]) {
    const src = strip(read(file))
    check(`W4 ${kind}: plugin-only projects list terms through /terms, owner-filtered`, /pluginTerms\(plugin\.link/.test(src) && /ownerId: auth\.user\.id/.test(src))
  }
  const modal = strip(read('components/site-health/PluginInstallModal.tsx'))
  const modalOk = (src: string) => src.includes("'https://wordpress.org/plugins/go-top-seo-bridge/'") && !src.includes('/api/site-health/plugin-zip') &&
    /copy\.plugin\.update\.deactivate/.test(src) && /copy\.plugin\.update\.install/.test(src) && /copy\.plugin\.update\.pair/.test(src) && /plugins\.php/.test(src)
  check('W5: install points to WordPress.org (no zip link); 2.x sites get deactivate → install → connect again', modalOk(modal))
  check('MUTATION CONTROL: a zip download link back in the modal is caught', !modalOk(modal + '<a href="/api/site-health/plugin-zip">'))
  const sources: [string, string][] = [['he', 'lib/i18n/dashboard/he.ts'], ['en', 'lib/i18n/dashboard/en.ts'], ['es', 'lib/i18n/dashboard/es.ts'], ['pt-BR', 'lib/i18n/dashboard/pt-BR/site-health.ts']]
  const pluginBlock = (src: string) => src.slice(src.indexOf('rekeyNotice:') - 400, src.indexOf("close: ", src.indexOf('rekeyNotice:')))
  const copyOk = (b: string) => (b.match(/WordPress\.org/g) ?? []).length >= 3 && /GO TOP SEO Bridge/.test(b) && /deactivate: \{/.test(b) && /install: \{/.test(b) && /pair: \{ title:/.test(b) && !/download: \{|upload: \{/.test(b)
  for (const [lang, f] of sources) {
    const b = pluginBlock(read(f))
    check(`W6 ${lang}: the install and switch steps (WordPress.org, deactivate the old one, delete only before connecting again)`, copyOk(b) &&
      /(מחיקה|deleting it|al borrarlo|excluí-lo)/.test(b) && /(לפני החיבור|before you connect|antes de volver a conectar|antes de conectar)/.test(b), b.slice(0, 120))
  }
  check('MUTATION CONTROL: copy that still says "download the zip" is caught', !copyOk(pluginBlock(read('lib/i18n/dashboard/en.ts')).replace('install: {', 'download: {')))
  const types = read('lib/site-fix/types.ts')
  check('W7: the latest plugin is 3.0.0, so a 2.x link is offered the switch (update available)', /PLUGIN_LATEST_VERSION = '3\.0\.0'/.test(types) && read('lib/site-fix/plugin-zip.generated.ts').includes("PLUGIN_VERSION = '3.0.0'"))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exitCode = 1
}

void main()

export {}
