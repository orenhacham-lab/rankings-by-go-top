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
 *   F) never worse than the application password: what the plugin cannot do (a NEW separate post
 *      for an article already sent, a status other than publish/draft) goes over the application
 *      password when the project has one; plugin-only it is a typed refusal the UI words in four
 *      languages (no provider text), with nothing sent to the plugin;
 *   K) EXECUTED against a REAL WordPress (QA_WORDPRESS_ROOT, default /tmp/claude-0/wp; skipped with
 *      K0 when absent): every construct our article bodies carry (sanitizer tags/attributes, the
 *      inline-image figure, the formatted and minimal designs with CTA, rtl) goes through the
 *      plugin's drop_code_blocks + wp_kses_post + WordPress's own content_save_pre kses, and NOTHING
 *      visible is lost compared with the application password (unfiltered_html keeps the body);
 *   C) plugin-only projects in project settings (ContentSection) read as WordPress connected
 *      through the plugin, never "not connected"; the existing-posts scan and the index refresh,
 *      which need a full post listing the plugin does not offer, answer needs_app_password and
 *      the UI says so in four languages;
 *   W) wiring + UI: the publish route and the automation use the publisher; the install steps
 *      point to WordPress.org with the deactivate / install / connect-again switch, four languages.
 *
 * MUTATION CONTROLS for each group. Run: npx tsx lib/content/__qa__/wordpress-plugin-publish.qa.ts
 */
import { spawnSync } from 'child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

process.env.CONTENT_CREDENTIALS_ENCRYPTION_KEY = process.env.CONTENT_CREDENTIALS_ENCRYPTION_KEY || 'c'.repeat(64)

import { FakeAdmin } from '@/lib/__qa__/_fake-admin'
import { encryptCredential } from '@/lib/security/credentials-crypto'
import { generatePluginKey, pairingCode } from '@/lib/site-fix/plugin-auth'
import { pluginMedia } from '@/lib/site-fix/plugin-client'
import type * as PublishModule from '../wordpress-plugin-publish'
import type * as CapModule from '@/lib/site-fix/plugin-capabilities'
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
    const schedT = canned()
    const sched = 'error' in only ? null : await M.publishArticleToWordPress(db({ wp: false }) as never, only, ARTICLE() as never, { status: 'future' as never }, { post: schedT.post, appPassword: ap2.fn })
    check('R15: plugin-only, a status the plugin does not take (future): a typed refusal, nothing sent', !!sched && !sched.ok && sched.detail === 'plugin_schedule_unsupported' && schedT.sent.length === 0)
    const direct = await M.pluginCreatePost(admin as never, (pub as { plugin: PublishModule.PublishPlugin }).plugin, ARTICLE() as never, { status: 'future' as never }, { post: schedT.post })
    check('R15b: pluginCreatePost itself never sends such a status either', !direct.ok && direct.detail === 'plugin_status_unsupported' && schedT.sent.length === 0)
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

  const noVersion = await mutant<typeof PublishModule>('lib/content/wordpress-plugin-publish.ts', (s) => s.replace('  if (!plugin || !versionAtLeast(plugin.version, PUBLISH_PLUGIN_MIN_VERSION)) return null\n', '  if (!plugin) return null\n'))
  const mPub = await noVersion.loadWordPressPublisher(db({ plugin: { plugin_version: '2.1.0' } }) as never, PROJECT)
  check('MUTATION CONTROL: without the version check a 2.1.0 plugin is sent articles (so R5 would fail)', !('error' in mPub) && mPub.via === 'plugin')
  // The link is read in lib/site-fix/plugin-capabilities.ts (loadConnectedPlugin), which loadPublishPlugin calls.
  const noConnected = await mutant<typeof CapModule>('lib/site-fix/plugin-capabilities.ts', (s) => s.replace("row.status !== 'connected' || ", ''))
  const mPend = await noConnected.loadConnectedPlugin(db({ plugin: { status: 'pending' } }) as never, PROJECT)
  check('MUTATION CONTROL: without the connected check a pending plugin is used (so R5 pending would fail)', mPend !== null)
  const noFallback = await mutant<typeof PublishModule>('lib/content/wordpress-plugin-publish.ts', (s) => s.replace("if (r.pluginCode === 'not_ours' && publisher.creds && !pluginOnly) {", 'if (false) {'))
  {
    const admin = db()
    const pub = await noFallback.loadWordPressPublisher(admin as never, PROJECT)
    const ap = appPassword()
    const r = 'error' in pub ? null : await noFallback.publishArticleToWordPress(admin as never, pub, ARTICLE() as never, { status: 'publish', existing: { postId: 77 } },
      { post: canned({ '/publish': { status: 409, body: { ok: false, code: 'not_ours' } } }).post, appPassword: ap.fn })
    check('MUTATION CONTROL: without the not_ours fallback an application-password post cannot be updated (so R11 would fail)', !!r && !r.ok && ap.calls.length === 0)
  }

  // ── F) never worse than the application password ─────────────────────────
  console.log('\nF) what the plugin cannot do: the application password, or a typed refusal')
  {
    const both = await M.loadWordPressPublisher(db() as never, PROJECT)
    const only = await M.loadWordPressPublisher(db({ wp: false }) as never, PROJECT)
    if ('error' in both || 'error' in only) throw new Error('expected publishers')
    const t1 = canned(); const ap1 = appPassword()
    const f1 = await M.publishArticleToWordPress(db() as never, both, ARTICLE() as never, { status: 'publish', forceNew: true }, { post: t1.post, appPassword: ap1.fn })
    // 3.0.0 stored: one signed /status asks whether it was updated (the canned 3.0.0 site has no 3.1 answer), nothing is written.
    const onlyStatus = (sent: Sent[]) => sent.every((x) => x.route === '/status')
    check('F1: plugin 3.0.0: a NEW separate post (force) with an application password: created over it, the plugin writes nothing',
      f1.ok && f1.via === 'app_password' && ap1.calls.length === 1 && onlyStatus(t1.sent))
    const t2 = canned(); const ap2 = appPassword()
    const f2 = await M.publishArticleToWordPress(db({ wp: false }) as never, only, ARTICLE() as never, { status: 'publish', forceNew: true }, { post: t2.post, appPassword: ap2.fn })
    check('F2: ... plugin-only: the typed refusal plugin_new_post_unsupported, nothing sent, never a quiet update of the existing post',
      !f2.ok && f2.unsupported === 'plugin_new_post_unsupported' && f2.detail === 'plugin_new_post_unsupported' && onlyStatus(t2.sent) && ap2.calls.length === 0)
    const t3 = canned(); const ap3 = appPassword()
    const f3 = await M.publishArticleToWordPress(db() as never, both, ARTICLE() as never, { status: 'future' as never }, { post: t3.post, appPassword: ap3.fn })
    check('F3: a scheduled status with an application password: over it (the status it was asked), the plugin is not called',
      f3.ok && f3.via === 'app_password' && ap3.calls.length === 1 && ap3.calls[0]!.status === 'future' && t3.sent.length === 0)
    const ap4 = appPassword()
    await M.publishArticleToWordPress(db() as never, both, ARTICLE() as never, { status: 'publish', forceNew: true }, { post: canned().post, appPassword: (async (...a: unknown[]) => { ap4.calls.push({ siteUrl: '', username: '', status: JSON.stringify(a[3]) }); return (ap1.fn as (...x: unknown[]) => unknown)(...a) }) as never })
    check('F4: wpCreatePost gets its own options only (no forceNew leaks into it)', ap4.calls.length === 1 && !/forceNew/.test(ap4.calls[0]!.status))
    const t5 = canned(); const ap5 = appPassword()
    const f5 = await M.publishArticleToWordPress(db() as never, both, ARTICLE() as never, { status: 'publish', forceNew: false }, { post: t5.post, appPassword: ap5.fn })
    check('F5: without force the plugin publishes as before', f5.ok && f5.via === 'plugin' && ap5.calls.length === 0)
    const ap6 = appPassword()
    const appOnly = await M.loadWordPressPublisher(db({ plugin: null }) as never, PROJECT)
    const f6 = 'error' in appOnly ? null : await M.publishArticleToWordPress(db({ plugin: null }) as never, appOnly, ARTICLE() as never, { status: 'publish', forceNew: true }, { appPassword: ap6.fn })
    check('F6: application password only: force is the legacy new post, unchanged', !!f6 && f6.ok && f6.via === 'app_password' && ap6.calls.length === 1)
  }
  const noRoute = await mutant<typeof PublishModule>('lib/content/wordpress-plugin-publish.ts', (s) => s.replace('  const unsupported = pluginUnsupported(opts, plugin.version)\n', '  const unsupported = null as PluginUnsupported | null\n'))
  {
    const both = await noRoute.loadWordPressPublisher(db() as never, PROJECT)
    const only = await noRoute.loadWordPressPublisher(db({ wp: false }) as never, PROJECT)
    if ('error' in both || 'error' in only) throw new Error('expected publishers')
    const t = canned(); const ap = appPassword()
    const m1 = await noRoute.publishArticleToWordPress(db() as never, both, ARTICLE() as never, { status: 'publish', forceNew: true }, { post: t.post, appPassword: ap.fn })
    check('MUTATION CONTROL: without the routing a forced new post silently updates the plugin\'s post (so F1 would fail)', m1.ok && m1.via === 'plugin' && ap.calls.length === 0)
    const t2 = canned()
    const m2 = await noRoute.publishArticleToWordPress(db({ wp: false }) as never, only, ARTICLE() as never, { status: 'publish', forceNew: true }, { post: t2.post, appPassword: appPassword().fn })
    check('MUTATION CONTROL: ... and plugin-only it is a quiet update instead of the typed refusal (so F2 would fail)', m2.ok && t2.sent.some((x) => x.route === '/publish'))
  }
  const noCredsBranch = await mutant<typeof PublishModule>('lib/content/wordpress-plugin-publish.ts', (s) => s.replace('  if (unsupported) {\n    if (publisher.creds && !pluginOnly) {', '  if (unsupported) {\n    if (false) {'))
  {
    const both = await noCredsBranch.loadWordPressPublisher(db() as never, PROJECT)
    if ('error' in both) throw new Error('expected publisher')
    const m = await noCredsBranch.publishArticleToWordPress(db() as never, both, ARTICLE() as never, { status: 'publish', forceNew: true }, { post: canned().post, appPassword: appPassword().fn })
    check('MUTATION CONTROL: refusing even when an application password exists makes the plugin path worse (so F1 would fail)', !m.ok)
  }
  {
    const route = strip(read('app/api/content/articles/[id]/wordpress/route.ts'))
    const routeOk = (src: string) => /forceNew: force && !!a\.wp_post_id/.test(src) &&
      /if \(!created\.ok && created\.unsupported\) \{[\s\S]{0,300}Response\.json\(\{ ok: false, error: created\.unsupported, reason: created\.unsupported, diagnosticId \}, \{ status: 409 \}\)/.test(src)
    const refusal = route.slice(route.indexOf('created.unsupported) {'), route.indexOf('created.unsupported) {') + 400)
    check('F7: the publish route passes force as forceNew (only when the article was sent) and answers the refusal as a typed 409 with no message text (the UI words it)',
      routeOk(route) && !/message:/.test(refusal.slice(0, refusal.indexOf('status: 409'))))
    check('MUTATION CONTROL: a route that drops forceNew is caught', !routeOk(route.replace('forceNew: force && !!a.wp_post_id', 'forceNew: false')))
    const he = read('lib/i18n/dashboard/he.ts'), en = read('lib/i18n/dashboard/en.ts'), es = read('lib/i18n/dashboard/es.ts'), pt = read('lib/i18n/dashboard/pt-BR/content-hub.ts')
    const worded = (src: string) => ['plugin_new_post_unsupported', 'plugin_schedule_unsupported', 'errPluginNewPost'].every((k) => new RegExp(`${k}: '[^']*GO TOP SEO Bridge[^']*'`).test(src))
    for (const [lang, src] of [['he', he], ['en', en], ['es', es], ['pt-BR', pt]] as const) check(`F8 ${lang}: both refusals are worded (editor) and the list toast too`, worded(src))
    check('MUTATION CONTROL: a language missing the wording is caught', !worded(en.replace("errPluginNewPost: '", "errPluginNewPostX: '")))
    const screen = strip(read('components/content/workspace/ArticlesScreen.tsx'))
    check('F9: the articles list maps the refusal to its sentence (not the generic error)', /reason === 'plugin_new_post_unsupported' \? t\.rowWp\.errPluginNewPost/.test(screen))
    const editor = strip(read('app/(dashboard)/content/articles/[id]/page.tsx'))
    check('F10: the editor words any reason through wpErrors when the route sends no message', /typedMessage \|\| \(e\.wpErrors as Record<string, string>\)\[reason\]/.test(editor))
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
  const noOwnerCheck = await mutant<typeof CapModule>('lib/site-fix/plugin-capabilities.ts', (s) => s.replace('    if (opts.ownerId !== undefined && opts.ownerId !== owner) return null\n', ''))
  check('MUTATION CONTROL: without the owner check a non-owner gets the plugin (so O3 would fail)', !!(await noOwnerCheck.loadConnectedPlugin(db() as never, PROJECT, { ownerId: 'intruder' })))
  const pubSrc = strip(read('lib/content/wordpress-plugin-publish.ts'))
  const capSrc = strip(read('lib/site-fix/plugin-capabilities.ts'))
  const ownerScoped = (pub: string, cap: string) => /loadConnectedPlugin\(admin, projectId, opts\)/.test(pub) && !/from\('site_fix_plugin_links'\)/.test(pub) &&
    /const scope = \{ projectId, userId: owner \}\s*const row = await readPluginLink\(admin, scope\)/.test(cap) && !/from\('site_fix_plugin_links'\)/.test(cap)
  check('O6: the link is read only through readPluginLink (project + owner filter), never by a raw query', ownerScoped(pubSrc, capSrc))
  check('MUTATION CONTROL: a raw unfiltered read of the links is caught', !ownerScoped(pubSrc + "\nadmin.from('site_fix_plugin_links').select('*')", capSrc) && !ownerScoped(pubSrc, capSrc + "\nadmin.from('site_fix_plugin_links').select('*')"))

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
      // 3.1.0 adopt: the post the app RECORDED for this article (wp_post_id, made over the application
      // password before, so no article id on it) is taken over in place. Another article's post never is (P10b).
      const taken = await M.publishArticleToWordPress(admin as never, pub, ARTICLE({ title: 'Waterproof boots, taken over' }) as never, { status: 'publish', existing: { postId: 21 } }, { post: L.post })
      const after = L.postfull(21)
      check('P10: 3.1.0: the recorded post of an application-password publish is updated in place and tied to the article, no new post',
        taken.ok && taken.via === 'plugin' && taken.wpPostId === 21 && (after.post as Row).post_title === 'Waterproof boots, taken over' && after.meta._gotop_article_id === ART && after.count === upd.count, JSON.stringify(taken).slice(0, 200))
      check('P10a: the stored version followed the plugin\'s /status (3.0.0 -> 3.1.0) before it was asked to take over',
        admin.tables.site_fix_plugin_links![0]!.plugin_version === '3.1.0', String(admin.tables.site_fix_plugin_links![0]!.plugin_version))
      const off = await pluginMedia(pub.plugin.link, { url: 'https://evil.example.org/x.png', alt: 'x' }, L.post)
      check('P11: an image address outside GO TOP storage is refused (off_site) and never downloaded', !off.ok && off.pluginCode === 'off_site' && !L.postfull(id).downloads.includes('https://evil.example.org/x.png'))
      const draft = await M.publishArticleToWordPress(admin as never, pub, ARTICLE({ id: '1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f', slug: 'second' }) as never, { status: 'draft' }, { post: L.post })
      check('P12: a second article is its own post, a draft; the same image address is not downloaded twice', draft.ok && draft.wpPostId !== id && (L.postfull(draft.ok ? draft.wpPostId : 0).post as Row)?.post_status === 'draft' &&
        L.postfull(id).downloads.filter((u) => u === `${STORAGE}feat/boots.png`).length === 1)
      const before = L.postfull(draft.ok ? draft.wpPostId : 0)
      const wrong = await M.publishArticleToWordPress(admin as never, pub, ARTICLE() as never, { status: 'publish', existing: { postId: draft.ok ? draft.wpPostId : 0 } }, { post: L.post })
      const after2 = L.postfull(draft.ok ? draft.wpPostId : 0)
      check('P10b: another article\'s post is refused by the plugin (not_ours), even with adopt, and nothing is written or created',
        !wrong.ok && wrong.detail === 'plugin_not_ours' && (after2.post as Row).post_title === (before.post as Row).post_title && after2.meta._gotop_article_id === '1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f' && after2.count === before.count, JSON.stringify(wrong).slice(0, 200))

      // Mutation controls, executed against the same PHP.
      const noPostId = await mutant<typeof PublishModule>('lib/content/wordpress-plugin-publish.ts', (s) => s.replace('    ...(opts.existing ? { post_id: opts.existing.postId } : {}),\n', ''))
      const L2 = live()
      const pub2 = await noPostId.loadWordPressPublisher(db({ wp: false }) as never, PROJECT)
      if ('error' in pub2) throw new Error('expected the plugin publisher')
      await noPostId.publishArticleToWordPress(db({ wp: false }) as never, pub2, ARTICLE() as never, { status: 'publish' }, { post: L2.post })
      const other = await noPostId.publishArticleToWordPress(db({ wp: false }) as never, pub2, ARTICLE({ id: '1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f', slug: 'second' }) as never, { status: 'draft' }, { post: L2.post })
      const mWrong = await noPostId.publishArticleToWordPress(db({ wp: false }) as never, pub2, ARTICLE() as never, { status: 'publish', existing: { postId: other.ok ? other.wpPostId : 0 } }, { post: L2.post })
      check('MUTATION CONTROL: without post_id an update of another article\'s post is not refused, the plugin quietly writes the article\'s post (so P10b would fail)', mWrong.ok)
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

  // ── K) a REAL WordPress keeps what we send ────────────────────────────────
  console.log('\nK) real WordPress kses: what the plugin path keeps of our article bodies')
  {
    const wpRoot = process.env.QA_WORDPRESS_ROOT || '/tmp/claude-0/wp'
    const haveWp = hasPhp && existsSync(join(wpRoot, 'wp-load.php'))
    if (!haveWp) {
      check(`K0: no WordPress at ${wpRoot} (set QA_WORDPRESS_ROOT): the real-kses checks did not run (report this)`, true)
    } else {
      const S = await import('./kses-samples')
      const runner = join(ROOT, 'lib/content/__qa__/wp-kses-runner.php')
      const kses = (bodies: string[]) => {
        const dir = mkdtempSync(join(tmpdir(), 'wp-kses-'))
        try {
          const f = join(dir, 'bodies.json')
          writeFileSync(f, JSON.stringify(bodies))
          const r = spawnSync('php', [runner, wpRoot, join(ROOT, 'wordpress-plugin/gotop-seo-bridge'), f], { encoding: 'utf8' })
          const at = r.stdout.indexOf('{"version"')
          if (at < 0) throw new Error(`kses runner: ${r.stderr.slice(0, 300)}${r.stdout.slice(0, 300)}`)
          return JSON.parse(r.stdout.slice(at)) as { version: string; items: { plugin: string }[] }
        } finally { rmSync(dir, { recursive: true, force: true }) }
      }
      const samples = S.publishedBodies()
      const out = kses(samples.map(([, html]) => html))
      console.log(`  (WordPress ${out.version})`)
      samples.forEach(([name, html], i) => {
        const l = S.lost(html, out.items[i]!.plugin)
        check(`K1 ${name}: nothing visible lost on the plugin path (every tag, attribute, style property and text kept)`, l.length === 0, l.slice(0, 8).join(' | '))
      })
      const styled = samples.find(([n]) => n === 'formatted + CTA, Hebrew (rtl)')![1]
      check('K2: the samples really carry the design (inline styles, the CTA link, the figure), so K1 is not vacuous',
        /style="[^"]*border/.test(styled) && /<figure[^>]*data-inline-image-id/.test(styled) && /<a [^>]*href="https:\/\/japan4u\.co\.il\/contact\/"/.test(styled) && /dir="rtl"/.test(styled))
      // Negative control: the comparison and the real kses DO catch losses.
      const bad = '<div style="color:#111"><iframe src="https://x.example/"></iframe><img src="https://x.example/a.png" onerror="x()" alt="a"><p style="background:url(javascript:x)">t</p><form action="https://x.example/"><input name="a"></form></div>'
      const lostBad = S.lost(bad, kses([bad]).items[0]!.plugin)
      check('MUTATION CONTROL: a body with what kses strips (iframe, onerror, a javascript: url in a style, a form) shows those losses, so K1 would fail on them',
        lostBad.includes('<iframe>') && lostBad.includes('img[onerror=x()]') && lostBad.some((x) => /^p\{background:/.test(x)) && lostBad.includes('<form>') && !lostBad.includes('div{color:#111}'), lostBad.join(' | '))
    }
  }

  // ── C) plugin-only projects in settings, scan and index ───────────────────
  console.log('\nC) plugin-only: project settings, the existing-posts scan and the index refresh')
  {
    const PC = await import('@/lib/connection-status/project-connections')
    const ok = (body: Record<string, unknown>) => ({ status: 200, body })
    const known = PC.projectConnectionsFrom({ wordpress: ok({ connection: null, publishingPlugin: { siteUrl: SITE, version: '3.0.0' } }), shopify: ok({ connection: null }), site: ok({ connection: null }) } as never)
    const none = PC.projectConnectionsFrom({ wordpress: ok({ connection: null, publishingPlugin: null }), shopify: ok({ connection: null }), site: ok({ connection: null }) } as never)
    const junk = PC.publishingPluginFrom({ publishingPlugin: { siteUrl: 5, version: '3.0.0' } })
    check('C1: the connections read carries the publishing plugin (site, version); none, or a malformed one, is null',
      known.state === 'ready' && known.value.wordpress === null && known.value.wordpressPlugin?.version === '3.0.0' && known.value.wordpressPlugin.siteUrl === SITE &&
      none.state === 'ready' && none.value.wordpressPlugin === null && junk === null)
    const cs = strip(read('components/content/ContentSection.tsx'))
    const csOk = (src: string) => /setWpPlugin\(known\.value\.wordpressPlugin\)/.test(src) &&
      /const wpViaPlugin = !wpConnected && !shopifyConnected && !site && choice !== 'shopify' && !!wpPlugin/.test(src) &&
      /const current: ChoosablePlatform \| null = wpAny \? 'wordpress'/.test(src) && /\) : wpAny \? \(/.test(src) &&
      (src.match(/\{pluginOnlyNotice\}/g) ?? []).length === 2 && /t\.pluginOnlyBody\.replace\('\{version\}', wpPlugin\.version\)/.test(src) &&
      /t\.pluginUpdateBody\.replace\('\{version\}', wpPlugin\.version\)/.test(src) &&
      (src.match(/plugin=\{wpViaPlugin \? wpPlugin : null\}/g) ?? []).length === 2
    check('C2: project settings show a plugin-only project as WordPress connected through the plugin (both layouts), never "not connected"; the application password only as the optional extra', csOk(cs))
    check('MUTATION CONTROL: settings that ignore the plugin again ("not connected") are caught', !csOk(cs.replace("wpAny ? 'wordpress'", "wpConnected ? 'wordpress'")))
    const strings: [string, string][] = [['he', 'lib/i18n/dashboard/he.ts'], ['en', 'lib/i18n/dashboard/en.ts'], ['es', 'lib/i18n/dashboard/es.ts'], ['pt-BR', 'lib/i18n/dashboard/pt-BR/project-detail.ts']]
    const csWorded = (src: string) => /pluginOnlyTitle: '[^']*GO TOP SEO Bridge[^']*'/.test(src) && /pluginOnlyBody: '[^']*\{version\}[^']*'/.test(src)
    for (const [lang, f] of strings) check(`C3 ${lang}: the plugin-only settings notice is worded (title, body with the version)`, csWorded(read(f)))
    check('MUTATION CONTROL: a body without the version placeholder is caught', !csWorded(read('lib/i18n/dashboard/en.ts').replace('Version {version}. Publishing', 'Version. Publishing')))

    const R = await import('../wordpress-index-refresh')
    const onlyDb = db({ wp: false })
    const r1 = await R.runProjectIndexRefresh(onlyDb as never, { projectId: PROJECT, userId: OWNER, force: true })
    check('C4: index refresh, plugin-only: needs_app_password (409), and no "failed" scan is recorded over the index',
      r1.outcome === 'no_credentials' && r1.error === 'needs_app_password' && r1.httpStatus === 409 && (onlyDb.tables.wordpress_content_index ?? []).length === 0, JSON.stringify(r1))
    const noneDb = db({ wp: false, plugin: null })
    const r2 = await R.runProjectIndexRefresh(noneDb as never, { projectId: PROJECT, userId: OWNER, force: true })
    check('C5: index refresh with neither: the 404 and the recorded failure, exactly as before', r2.outcome === 'no_credentials' && r2.httpStatus === 404 && r2.error !== 'needs_app_password' &&
      (noneDb.tables.wordpress_content_index ?? []).some((x) => x.scan_status === 'failed'))
    const intruder = await R.runProjectIndexRefresh(db({ wp: false }) as never, { projectId: PROJECT, userId: 'intruder', force: true })
    check('C6: the plugin is checked for the project owner only (another user id reads "no plugin")', intruder.outcome === 'no_credentials' && intruder.httpStatus === 404)
    const RM = await mutant<typeof import('../wordpress-index-refresh')>('lib/content/wordpress-index-refresh.ts', (s) => s.replace('if (wp.status === 404 && await (deps.hasPlugin ?? hasPublishPlugin)(admin, projectId, userId)) {', 'if (false) {'))
    const mr = await RM.runProjectIndexRefresh(db({ wp: false }) as never, { projectId: PROJECT, userId: OWNER, force: true })
    check('MUTATION CONTROL: without the plugin check a plugin-only project gets the raw "No WordPress connection" failure (so C4 would fail)', mr.outcome === 'no_credentials' && mr.httpStatus === 404)
    const scan = strip(read('app/api/content/automation/internal-links/site-scan/route.ts'))
    const scanOk = (src: string) => /if \(wp\.status === 404 && await hasPublishPlugin\(admin, project\.id, auth\.user\.id\)\) return Response\.json\(\{ error: 'needs_app_password', reason: 'needs_app_password' \}, \{ status: 409 \}\)/.test(src)
    check('C7: the existing-posts scan route answers needs_app_password for a plugin-only project (owner-checked)', scanOk(scan))
    check('MUTATION CONTROL: a scan route without it is caught', !scanOk(scan.replace("'needs_app_password', reason", "'x', reason")))
    const status = strip(read('components/content/InternalLinkIndexStatus.tsx'))
    check('C8: the index card shows the needs-app-password notice (its own words, not the scanner text) after a refresh answers it',
      /setNeedsAppPassword\(answer\?\.error === 'needs_app_password'\)/.test(status) && /needsAppPassword && \([\s\S]{0,200}\{t\.needsAppPassword\}/.test(status))
    for (const [lang, f] of [['he', 'lib/i18n/dashboard/he.ts'], ['en', 'lib/i18n/dashboard/en.ts'], ['es', 'lib/i18n/dashboard/es.ts'], ['pt-BR', 'lib/i18n/dashboard/pt-BR/content-hub.ts']] as const) {
      check(`C9 ${lang}: the needs-app-password notice is worded`, /needsAppPassword: '[^']*GO TOP SEO Bridge[^']*'/.test(read(f)))
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
  check('W7: the latest plugin is 3.1.0, so a 2.x or 3.0 link is offered the update', /PLUGIN_LATEST_VERSION = '3\.1\.0'/.test(types) && read('lib/site-fix/plugin-zip.generated.ts').includes("PLUGIN_VERSION = '3.1.0'"))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exitCode = 1
}

void main()

export {}
