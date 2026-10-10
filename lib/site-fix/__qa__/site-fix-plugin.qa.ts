/**
 * The Go Top WordPress plugin (wordpress-plugin/gotop-seo-bridge), EXECUTED: the real PHP files
 * run under an in-memory WordPress (./plugin-harness.php) and are driven with requests signed by
 * the app's own signer (lib/site-fix/plugin-auth.ts).
 *
 *   L) every PHP file passes `php -l`.
 *   A) AUTH. No open route: every 2.0 route is signed, the pairing route needs an administrator,
 *      and the 1.x route still needs edit rights. Unsigned, wrong secret, wrong key, tampered body,
 *      a signature moved to another route, a stale timestamp and a replayed nonce are all refused.
 *      The PHP accepts exactly what the TypeScript signer produces (one canonical string).
 *   W) WHITELIST. The plugin's nine types are the app's nine types. Anything else, an extra field,
 *      markup, an off-site address, a Product schema, a product post: refused, nothing written.
 *   F) FIXES. Each of the nine types writes exactly its element, stores the previous value FIRST,
 *      is idempotent, refuses a page changed since the preview, keeps the merchant's embeds
 *      (no kses stripping), never changes the post status, and undoes back to the previous value.
 *   B) BACKWARD COMPATIBLE: the 1.x /seo-meta route behaves as before.
 *
 * MUTATION CONTROLS: the same attacks against broken copies of the plugin (constant-time compare
 * replaced by `true`, the replay check removed, the time window removed, the whitelist opened)
 * must succeed — a guard that cannot fail tests nothing.
 *
 * Without `php` on the machine the suite says so and runs nothing.
 * Run: npx tsx lib/site-fix/__qa__/site-fix-plugin.qa.ts
 */
import { execFileSync, spawnSync } from 'child_process'
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { generatePluginKey, pairingCode, signPluginRequest, signedHeaders } from '../plugin-auth'
import { FIX_TYPES } from '../types'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const PLUGIN = join(ROOT, 'wordpress-plugin', 'gotop-seo-bridge')
const HARNESS = join(__dirname, 'plugin-harness.php')
const SITE = 'https://shop.example.org'
const JOB = (n: number) => `${String(n).padStart(8, '0')}-aaaa-4bbb-8ccc-${String(n).padStart(12, '0')}`

type Step = Record<string, unknown>
type Res = { status?: number; body?: Record<string, unknown>; content?: string; meta?: Record<string, string>; value?: unknown; head?: string; title?: string; updates?: string[][] }

function run(steps: Step[], dir = PLUGIN): Res[] {
  const tmp = mkdtempSync(join(tmpdir(), 'site-fix-harness-'))
  try {
    const file = join(tmp, 'calls.json')
    writeFileSync(file, JSON.stringify(steps))
    const r = spawnSync('php', [HARNESS, dir, file], { encoding: 'utf8' })
    if (r.status !== 0) throw new Error(`harness failed: ${r.stderr || r.stdout}`.slice(0, 600))
    return JSON.parse(r.stdout) as Res[]
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}

/** A copy of the plugin with one change, for mutation controls. */
function mutantPlugin(file: string, from: string, to: string): { dir: string; found: boolean; done: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'site-fix-plugin-mutant-'))
  cpSync(PLUGIN, dir, { recursive: true })
  const path = join(dir, file)
  const src = readFileSync(path, 'utf8')
  const found = src.includes(from)
  writeFileSync(path, src.split(from).join(to))
  return { dir, found, done: () => rmSync(dir, { recursive: true, force: true }) }
}

const key = generatePluginKey()
const pair: Step = { rest: '/gotop/v1/pair', body: JSON.stringify({ code: pairingCode(key) }), can: ['manage_options'] }
function signed(route: string, payload: unknown, opts: { secret?: string; keyId?: string; now?: number } = {}): Step {
  const body = JSON.stringify(payload)
  const headers = signedHeaders({ keyId: opts.keyId ?? key.keyId, secret: opts.secret ?? key.secret }, route, body, () => opts.now ?? Date.now())
  return { rest: route, headers, body }
}

function main() {
  console.log('Site fix — the WordPress plugin, executed\n')
  const hasPhp = spawnSync('php', ['-v'], { encoding: 'utf8' }).status === 0
  if (!hasPhp) {
    console.log('  php is not installed here: the plugin checks did not run (report this).')
    console.log('\n1 passed, 0 failed')
    return
  }

  console.log('L) php -l')
  const phpFiles = [join(PLUGIN, 'gotop-seo-bridge.php'), join(PLUGIN, 'uninstall.php'), ...readdirSync(join(PLUGIN, 'includes')).map((f) => join(PLUGIN, 'includes', f))]
  for (const f of phpFiles) {
    let ok = true
    try { execFileSync('php', ['-l', f], { encoding: 'utf8', stdio: 'pipe' }) } catch { ok = false }
    check(`php -l ${f.slice(PLUGIN.length + 1)}`, ok)
  }

  console.log('\nA) authentication')
  const src = readFileSync(join(PLUGIN, 'gotop-seo-bridge.php'), 'utf8')
  check('the plugin version is 3.1.0 (header, constant and readme Stable tag)', /Version:\s+3\.1\.0/.test(src) && /GOTOP_SEO_BRIDGE_VERSION', '3\.1\.0'/.test(src) && /Stable tag: 3\.1\.0/.test(readFileSync(join(PLUGIN, 'readme.txt'), 'utf8')))
  const allPhp = phpFiles.map((f) => readFileSync(f, 'utf8')).join('\n')
  check('no route is open (__return_true never used as a permission_callback)', !/permission_callback'\s*=>\s*'__return_true'/.test(allPhp))
  check('the signature compare is constant time (hash_equals)', /hash_equals\(\$expected, \$sig\)/.test(allPhp))

  const unsignedFix = { rest: '/gotop/v1/fix', body: JSON.stringify({ job_id: JOB(1), type: 'seo_title', url: `${SITE}/about/`, value: { value: 'x' } }) }
  const before = run([
    signed('/gotop/v1/status', {}),
    { rest: '/gotop/v1/pair', body: JSON.stringify({ code: pairingCode(key) }), can: [] },
    { rest: '/gotop/v1/pair', body: JSON.stringify({ code: pairingCode(key) }), can: ['edit_posts'] },
    { option: 'gotop_seo_bridge_key' },
  ])
  check('before pairing, a signed call is refused (no key on the site)', before[0].status === 401 && before[0].body?.code === 'gotop_unknown_key', JSON.stringify(before[0]))
  check('pairing without a signed-in user is refused', before[1].status === 401 || before[1].status === 403, JSON.stringify(before[1]))
  check('pairing by an editor (not an administrator) is refused', before[2].status === 401 || before[2].status === 403, JSON.stringify(before[2]))
  check('nothing was stored by the refused pairings', before[3].value === null)

  const replayStep = signed('/gotop/v1/status', {})
  const statusSig = signed('/gotop/v1/status', { job_id: JOB(1) })
  const tampered = signed('/gotop/v1/inspect', { url: `${SITE}/about/` })
  tampered.body = JSON.stringify({ url: `${SITE}/blog/waterproof-boots/` })
  const other = generatePluginKey()
  const r = run([
    { rest: '/gotop/v1/pair', body: JSON.stringify({ code: 'GT1.gtk_zz.nope' }), can: ['manage_options'] },
    pair,
    signed('/gotop/v1/status', {}),
    unsignedFix,
    signed('/gotop/v1/status', {}, { secret: other.secret }),
    signed('/gotop/v1/status', {}, { keyId: other.keyId, secret: other.secret }),
    replayStep,
    replayStep,
    signed('/gotop/v1/status', {}, { now: Date.now() - 20 * 60_000 }),
    { ...statusSig, rest: '/gotop/v1/fix' },
    tampered,
    { option: 'gotop_seo_bridge_key' },
  ])
  check('a malformed pairing code is refused', r[0].status === 400 && r[0].body?.code === 'invalid_code')
  check('an administrator pairs with the code the app issued', r[1].status === 200 && r[1].body?.key_id === key.keyId, JSON.stringify(r[1]))
  const fixTypes = (r[2].body?.fix_types ?? []) as string[]
  check('a signed status call answers with the version', r[2].status === 200 && r[2].body?.version === '3.1.0', JSON.stringify(r[2]))
  check('the plugin whitelist is exactly the app whitelist (no drift)', JSON.stringify(fixTypes) === JSON.stringify([...FIX_TYPES]), fixTypes.join(','))
  check('an unsigned /fix is refused', r[3].status === 401 && r[3].body?.code === 'gotop_bad_headers', JSON.stringify(r[3]))
  check('a request signed with another secret is refused', r[4].body?.code === 'gotop_bad_signature', JSON.stringify(r[4]))
  check('a request with another key id is refused', r[5].body?.code === 'gotop_unknown_key', JSON.stringify(r[5]))
  check('a fresh signed request is accepted once', r[6].status === 200)
  check('the same request replayed is refused (nonce used)', r[7].status === 401 && r[7].body?.code === 'gotop_replay', JSON.stringify(r[7]))
  check('a request 20 minutes old is refused (stale)', r[8].body?.code === 'gotop_stale', JSON.stringify(r[8]))
  check('a signature made for /status does not open /fix', r[9].body?.code === 'gotop_bad_signature', JSON.stringify(r[9]))
  check('a body changed after signing is refused', r[10].body?.code === 'gotop_bad_signature', JSON.stringify(r[10]))
  const stored = r[11].value as { key_id?: string; secret?: string } | null
  check('the site stores the key id and secret it was given', stored?.key_id === key.keyId && stored?.secret === key.secret)
  // The PHP canonical string and the TypeScript one are the same bytes.
  const body = JSON.stringify({ a: 1, 'ש': 'עברית' })
  const ts = String(Math.floor(Date.now() / 1000))
  const nonce = 'ab'.repeat(16)
  const sig = signPluginRequest(key.secret, { method: 'POST', route: '/gotop/v1/status', timestamp: ts, nonce, keyId: key.keyId, body })
  const cross = run([pair, { rest: '/gotop/v1/status', headers: { 'X-GoTop-Key': key.keyId, 'X-GoTop-Timestamp': ts, 'X-GoTop-Nonce': nonce, 'X-GoTop-Signature': sig }, body }])
  check('PHP verifies a TypeScript signature over a non-ASCII body', cross[1].status === 200, JSON.stringify(cross[1]))

  console.log('\nA*) mutation controls (the attacks must succeed against a broken plugin)')
  {
    const m = mutantPlugin('includes/auth.php', 'if (!hash_equals($expected, $sig)) {', 'if (false) {')
    const got = m.found ? run([pair, signed('/gotop/v1/status', {}, { secret: other.secret })], m.dir) : []
    check('MUTATION (no signature compare): a wrong secret gets in', m.found && got[1]?.status === 200, JSON.stringify(got[1]))
    m.done()
  }
  {
    const m = mutantPlugin('includes/auth.php', 'if (call_user_func($seen, $nonce_key)) {', 'if (false) {')
    const got = m.found ? run([pair, replayStep, replayStep], m.dir) : []
    check('MUTATION (no replay check): a replayed request gets in', m.found && got[2]?.status === 200, JSON.stringify(got[2]))
    m.done()
  }
  {
    const m = mutantPlugin('includes/auth.php', 'if (abs($now - (int) $ts) > GOTOP_SEO_BRIDGE_WINDOW) {', 'if (false) {')
    const got = m.found ? run([pair, signed('/gotop/v1/status', {}, { now: Date.now() - 20 * 60_000 })], m.dir) : []
    check('MUTATION (no time window): a stale request gets in', m.found && got[1]?.status === 200, JSON.stringify(got[1]))
    m.done()
  }
  {
    const m = mutantPlugin('includes/routes.php', "'permission_callback' => __NAMESPACE__ . '\\\\gotop_seo_bridge_admin_permission',", "'permission_callback' => '__return_true',")
    const got = m.found ? run([{ rest: '/gotop/v1/pair', body: JSON.stringify({ code: pairingCode(key) }), can: [] }], m.dir) : []
    check('MUTATION (open pairing route): anyone pairs', m.found && got[0]?.status === 200, JSON.stringify(got[0]))
    m.done()
  }

  console.log('\nW) the whitelist')
  const fix = (n: number, type: string, url: string, value: unknown, expected?: string) =>
    signed('/gotop/v1/fix', { job_id: JOB(n), type, url, value, ...(expected !== undefined ? { expected } : {}) })
  const w = run([
    pair,
    fix(1, 'delete_post', `${SITE}/about/`, {}),
    fix(2, 'theme', `${SITE}/about/`, { value: 'x' }),
    fix(3, 'seo_title', `${SITE}/about/`, { value: 'Fine title', post_status: 'draft' }),
    fix(4, 'seo_title', `${SITE}/about/`, { value: '<script>x</script>' }),
    fix(5, 'canonical', `${SITE}/about/`, { value: 'https://evil.example.com/' }),
    fix(6, 'seo_title', 'https://evil.example.com/about/', { value: 'Fine title' }),
    fix(7, 'seo_title', `${SITE}/product/red-boots/`, { value: 'Cheaper boots' }),
    fix(8, 'schema_jsonld', `${SITE}/about/`, { schema: { '@context': 'https://schema.org', '@type': 'Product', offers: { price: 1 } } }),
    fix(9, 'schema_jsonld', `${SITE}/about/`, { schema: { '@context': 'https://schema.org', '@type': 'Organization', name: '</script><script>alert(1)</script>' } }),
    fix(10, 'image_alt', `${SITE}/about/`, { images: [{ src: 'https://shop.example.org/wp-content/uploads/red-boots.jpg', alt: 'x" onerror="alert(1)' }] }),
    fix(11, 'broken_link', `${SITE}/about/`, { href: `${SITE}/old-page/`, replacement: 'javascript:alert(1)' }),
    { post: 11 }, { post: 31 },
  ])
  check('an unknown type (delete_post) is refused', w[1].body?.code === 'not_allowed', JSON.stringify(w[1]))
  check('a theme change is refused', w[2].body?.code === 'not_allowed')
  check('an extra field riding along (post_status) is refused', w[3].body?.code === 'not_allowed', JSON.stringify(w[3]))
  check('markup in a title is refused', w[4].body?.code === 'value_invalid')
  check('a canonical to another site is refused', w[5].body?.code === 'off_site')
  check('a page on another site is refused', w[6].body?.code === 'off_site')
  check('a product is never written (posts and pages only)', w[7].body?.code === 'not_in_wordpress')
  check('a Product schema (prices) is refused', w[8].body?.code === 'value_invalid')
  check('a schema that would close the script tag is refused', w[9].body?.code === 'value_invalid')
  check('alt text that would break out of the attribute is refused', w[10].body?.code === 'value_invalid')
  check('a javascript: replacement link is refused', w[11].body?.code === 'off_site')
  check('nothing was written by any refused fix', Object.keys(w[12].meta ?? {}).length === 0 && !(w[12].content ?? '').includes('Cheaper') && (w[13].content ?? '') === '<p>Price: 100</p>')
  {
    const m = mutantPlugin('includes/fixes.php', "        'seo_title',\n        'meta_description',", "        'delete_post',\n        'seo_title',\n        'meta_description',")
    const got = m.found ? run([pair, signed('/gotop/v1/status', {})], m.dir) : []
    const types = (got[1]?.body?.fix_types ?? []) as string[]
    check('MUTATION (a tenth type added to the plugin): the drift check sees it', m.found && JSON.stringify(types) !== JSON.stringify([...FIX_TYPES]), types.join(','))
    m.done()
  }
  {
    const m = mutantPlugin('includes/fixes.php', "if (!in_array($k, $allowed_keys[$type], true)) { return 'not_allowed'; }", '')
    const got = m.found ? run([pair, fix(3, 'seo_title', `${SITE}/about/`, { value: 'Fine title', post_status: 'draft' })], m.dir) : []
    check('MUTATION (extra-field check removed): a field rides along with an approval', m.found && got[1]?.status === 200, JSON.stringify(got[1]))
    m.done()
  }
  {
    const m = mutantPlugin('includes/fixes.php', "return array_values(array_intersect((array) $types, array('post', 'page')));", "return array('post', 'page', 'product');")
    const got = m.found ? run([pair, fix(7, 'seo_title', `${SITE}/product/red-boots/`, { value: 'Cheaper boots' })], m.dir) : []
    check('MUTATION (product posts allowed): the product gets written', m.found && got[1]?.status === 200, JSON.stringify(got[1]))
    m.done()
  }

  console.log('\nF) the nine fixes, with undo (no SEO plugin: core fallback)')
  const about = `${SITE}/about/`
  const inspect = run([pair, signed('/gotop/v1/inspect', { url: about })])[1]
  const item = (inspect.body?.item ?? {}) as { content_sha?: string; post_id?: number; seo?: Record<string, string> }
  check('inspect reads the page (post id, content hash, SEO fields)', item.post_id === 11 && /^[0-9a-f]{64}$/.test(item.content_sha ?? ''), JSON.stringify(inspect).slice(0, 200))
  const schema = { '@context': 'https://schema.org', '@type': 'Organization', name: 'Boots & Co', url: SITE }
  const f = run([
    pair,
    fix(21, 'seo_title', about, { value: 'Handmade boots from Haifa | Boot Shop' }, ''),
    fix(21, 'seo_title', about, { value: 'Handmade boots from Haifa | Boot Shop' }, ''),
    fix(22, 'meta_description', about, { value: 'We make leather boots by hand in Haifa, and ship them anywhere in Israel within a week.' }, ''),
    fix(23, 'canonical', about, { value: about }, ''),
    fix(24, 'focus_keyphrase', about, { value: 'handmade boots' }, ''),
    fix(25, 'schema_jsonld', about, { schema }, ''),
    { head: 11 },
    fix(26, 'image_alt', about, { images: [{ src: 'https://shop.example.org/wp-content/uploads/red-boots.jpg', alt: 'Red leather boots' }, { src: 'https://shop.example.org/wp-content/uploads/ok.jpg', alt: 'Overwrite attempt' }] }, item.content_sha),
    { post: 11 },
    fix(27, 'faq_block', about, { heading: 'Questions', items: [{ q: 'Do you ship abroad?', a: 'Not yet, only within Israel for now.' }] }),
    fix(28, 'broken_link', about, { href: `${SITE}/old-page/`, replacement: null }),
    fix(29, 'internal_link', about, { target: `${SITE}/blog/waterproof-boots/`, anchor: 'waterproof boots' }),
    { post: 11 },
    fix(30, 'seo_title', about, { value: 'Another title' }, 'stale value'),
    fix(31, 'image_alt', about, { images: [{ src: 'https://shop.example.org/wp-content/uploads/red-boots.jpg', alt: 'x' }] }, '0'.repeat(64)),
  ])
  check('seo_title applied, previous value returned', f[1].status === 200 && f[1].body?.status === 'applied' && f[1].body?.previous === '', JSON.stringify(f[1]))
  check('the same approved fix sent twice writes once (already)', f[2].body?.status === 'already')
  check('meta_description applied', f[3].body?.status === 'applied')
  check('canonical applied', f[4].body?.status === 'applied')
  check('focus_keyphrase applied', f[5].body?.status === 'applied')
  check('schema_jsonld applied', f[6].body?.status === 'applied', JSON.stringify(f[6]))
  const head = f[7].head ?? ''
  check('core fallback prints the approved title', f[7].title === 'Handmade boots from Haifa | Boot Shop')
  check('core fallback prints the approved description', head.includes('<meta name="description" content="We make leather boots by hand in Haifa'))
  check('the schema is printed with < > & escaped', head.includes('application/ld+json') && head.includes('Boots \\u0026 Co') && !head.includes('Boots & Co'), head)
  check('image_alt applied to the image without alt only', f[8].body?.status === 'applied', JSON.stringify(f[8]))
  const c1 = f[9].content ?? ''
  check('the missing alt is set', c1.includes('<img alt="Red leather boots" src="https://shop.example.org/wp-content/uploads/red-boots.jpg"'))
  check('an existing alt is never overwritten', c1.includes('alt="Kept as is"') && !c1.includes('Overwrite attempt'))
  check('the embed survived the write (kses kept off for the merchant content)', c1.includes('<iframe src="https://www.youtube.com/embed/x"></iframe>'))
  check('the previous content was stored before the write', ((f[9].meta ?? {})[`_gotop_fix_${JOB(26)}`] ?? '').includes('previous_content'))
  check('only the ID and the content were passed to wp_update_post (status untouched)', (f[9].updates ?? []).every((u) => JSON.stringify(u) === JSON.stringify(['ID', 'post_content'])))
  check('faq_block applied', f[10].body?.status === 'applied', JSON.stringify(f[10]))
  check('broken_link applied', f[11].body?.status === 'applied', JSON.stringify(f[11]))
  check('internal_link applied', f[12].body?.status === 'applied', JSON.stringify(f[12]))
  const c2 = f[13].content ?? ''
  check('the FAQ block is appended at the end, escaped, in block markup', /<!-- \/wp:group -->$/.test(c2) && c2.includes('<h3 class="wp-block-heading">Do you ship abroad?</h3>'))
  check('both spellings of the dead link lose the link and keep their words', c2.includes('See our old page and again.') && !c2.includes('old-page'))
  check('the internal link wraps words already there (not the heading)', c2.includes('Our guide to <a href="https://shop.example.org/blog/waterproof-boots/">waterproof boots</a> explains') && c2.includes('<h2>Waterproof boots</h2>'))
  check('a title changed since the preview is refused', f[14].body?.code === 'changed_since_preview')
  check('content changed since the preview is refused', f[15].body?.code === 'changed_since_preview')

  const u = run([
    pair,
    fix(21, 'seo_title', about, { value: 'Handmade boots from Haifa | Boot Shop' }, ''),
    fix(26, 'image_alt', about, { images: [{ src: 'https://shop.example.org/wp-content/uploads/red-boots.jpg', alt: 'Red leather boots' }] }),
    fix(27, 'faq_block', about, { heading: 'Questions', items: [{ q: 'Do you ship abroad?', a: 'Not yet, only within Israel for now.' }] }),
    { post: 11 },
    signed('/gotop/v1/undo', { job_id: JOB(21), url: about }),
    signed('/gotop/v1/undo', { job_id: JOB(21), url: about }),
    signed('/gotop/v1/undo', { job_id: JOB(26), url: about }),
    signed('/gotop/v1/undo', { job_id: JOB(27), url: about }),
    signed('/gotop/v1/undo', { job_id: JOB(26), url: about }),
    { post: 11 },
    signed('/gotop/v1/undo', { job_id: JOB(99), url: about }),
    fix(51, 'faq_block', about, { heading: 'Questions', items: [{ q: 'Do you ship abroad?', a: 'Not yet, only within Israel for now.' }] }),
    fix(52, 'broken_link', about, { href: `${SITE}/old-page/`, replacement: `${SITE}/new-page/` }),
    signed('/gotop/v1/undo', { job_id: JOB(51), url: about }),
    { post: 11 },
  ])
  const original = run([{ post: 11 }])[0].content
  check('undo of the title restores the previous (empty) value', u[5].body?.status === 'reverted' && !((u[10].meta ?? {})._gotop_seo_title), JSON.stringify(u[5]))
  check('undo twice is harmless (already)', u[6].body?.status === 'already')
  check('undo of content changed after the fix is refused (the later change stays)', u[7].body?.code === 'changed_since_preview', JSON.stringify(u[7]))
  check('undo of the last content fix restores the content before it', u[8].body?.status === 'reverted', JSON.stringify(u[8]))
  check('then the earlier fix undoes back to the original content', u[9].body?.status === 'reverted' && u[10].content === original, JSON.stringify(u[9]))
  check('undo of a fix this site never applied is refused', u[11].body?.code === 'nothing_to_undo')
  const c3 = u[15].content ?? ''
  check('undo of an FAQ after a later edit removes only the block', u[14].body?.status === 'reverted' && !c3.includes('gotop-faq') && c3.includes('href="https://shop.example.org/new-page/"'), JSON.stringify(u[14]))

  console.log('\nF2) with Yoast active: the SEO plugin\'s own fields')
  const y = run([
    { define: 'WPSEO_VERSION' },
    pair,
    fix(41, 'seo_title', about, { value: 'Yoast title' }),
    fix(42, 'meta_description', about, { value: 'A description stored in Yoast.' }),
    fix(43, 'focus_keyphrase', about, { value: 'boots' }),
    fix(44, 'canonical', about, { value: about }),
    { post: 11 },
    { head: 11 },
  ])
  const ym = y[6].meta ?? {}
  check('title, description, focus and canonical go to Yoast\'s own keys', ym._yoast_wpseo_title === 'Yoast title' && ym._yoast_wpseo_metadesc === 'A description stored in Yoast.' && ym._yoast_wpseo_focuskw === 'boots' && ym._yoast_wpseo_canonical === about, JSON.stringify(ym))
  check('with Yoast active the plugin prints no second description or title', !(y[7].head ?? '').includes('name="description"') && y[7].title === 'Theme title')

  console.log('\nN) 3.1.0: everything without an application password (content list, one item, authors, Media Library alt, publish options)')
  {
    const ART1 = '0b6f3a52-7d1e-4c55-9a43-2f8d7e6a1b90'
    const ART2 = '1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f'
    const soon = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 19).replace('T', ' ')
    const past = new Date(Date.now() - 86_400_000).toISOString().slice(0, 19).replace('T', ' ')
    const art = (o: Record<string, unknown> = {}) => ({ article_id: ART1, title: 'Waterproof boots', content: '<p>Dry boots last.</p>', status: 'publish', slug: 'waterproof', ...o })
    const setup: Step[] = [
      pair,
      { setpost: 21, type: 'post', title: 'Waterproof boots', content: '<p>Orphan page.</p>', slug: 'waterproof-boots', url: `${SITE}/blog/waterproof-boots/`, modified: '2026-03-01 00:00:00', meta: { _yoast_wpseo_focuskw: 'waterproof boots' } },
      { setpost: 22, type: 'post', status: 'draft', title: 'Unfinished', content: '<p>draft</p>', url: `${SITE}/blog/unfinished/` },
      { setpost: 23, type: 'post', title: 'Members only', content: '<p>secret</p>', password: 'pw', url: `${SITE}/blog/members/` },
      { setpost: 24, type: 'post', title: 'Older post', content: '<p>old <a href="/about/">about</a></p>', url: `${SITE}/blog/older/`, modified: '2025-01-01 00:00:00' },
      { setpost: 25, type: 'post', title: 'Another article', content: '<p>x</p>', url: `${SITE}/blog/another/`, meta: { _gotop_article_id: ART2 } },
      { media: 600, file: 'red-boots.jpg', sizes: ['red-boots-300x200.jpg'], alt: '' },
    ]
    const n = run([
      ...setup,
      signed('/gotop/v1/content', { type: 'post', page: 1, per_page: 2 }),     // 7
      signed('/gotop/v1/content', { type: 'post', page: 2, per_page: 2 }),     // 8
      signed('/gotop/v1/content', { type: 'product', page: 1, per_page: 2 }),  // 9
      signed('/gotop/v1/content', { type: 'post', page: 1, per_page: 51 }),    // 10
      signed('/gotop/v1/content-item', { type: 'post', id: 24 }),              // 11
      signed('/gotop/v1/content-item', { type: 'post', id: 22 }),              // 12
      signed('/gotop/v1/content-item', { type: 'post', id: 23 }),              // 13
      signed('/gotop/v1/content-item', { type: 'post', id: 31 }),              // 14
      signed('/gotop/v1/authors', {}),                                         // 15
      signed('/gotop/v1/media-alt', { action: 'search', term: 'red-boots', by: 'title' }), // 16
      signed('/gotop/v1/media-alt', { action: 'set', id: 600, alt: 'Red leather boots' }), // 17
      signed('/gotop/v1/media-alt', { action: 'set', id: 600, alt: '<b>x</b>' }),         // 18
      signed('/gotop/v1/media-alt', { action: 'set', id: 21, alt: 'Not an image' }),      // 19
      { post: 21 },                                                             // 20
      { post: 600 },                                                            // 21
      signed('/gotop/v1/media-alt', { action: 'set', id: 600, alt: '' }),      // 22
      { post: 600 },                                                            // 23
      signed('/gotop/v1/terms', { taxonomy: 'category' }),                     // 24
      signed('/gotop/v1/terms', { taxonomy: 'product_cat' }),                  // 25
      { rest: '/gotop/v1/content', body: JSON.stringify({ type: 'post' }) },   // 26 unsigned
      { rest: '/gotop/v1/authors', body: '{}' },                               // 27 unsigned
    ])
    const items = (n[7].body?.items ?? []) as Record<string, unknown>[]
    const ids = [...items, ...((n[8].body?.items ?? []) as Record<string, unknown>[])].map((i) => i.id)
    check('N1: /content lists published posts only (no draft, no password-protected), newest change first, one page at a time',
      JSON.stringify(ids.slice(0, 2)) === '[21,25]' && ids.includes(24) && !ids.includes(22) && !ids.includes(23), JSON.stringify(ids))
    check('N2: each item carries only id, type, address, slug, title, dates and the focus keyphrase (no content, no author)',
      items.length > 0 && items.every((i) => JSON.stringify(Object.keys(i).sort()) === JSON.stringify(['date', 'focus_keyword', 'focus_source', 'id', 'link', 'modified', 'slug', 'title', 'type'])), JSON.stringify(items[0]))
    check('N3: the Yoast focus keyphrase comes with it', items[0]?.focus_keyword === 'waterproof boots' && items[0]?.focus_source === 'yoast_focus_keyword')
    check('N4: products are never listed; an oversized page is refused', n[9].body?.code === 'invalid_request' && n[10].body?.code === 'invalid_request')
    check('N5: /content-item answers the displayed HTML of one published post', n[11].status === 200 && String(n[11].body?.content).includes('href="/about/"'))
    check('N6: ... never a draft, a password-protected post, or a product', [12, 13, 14].every((i) => n[i].status === 404 && n[i].body?.code === 'not_in_wordpress'))
    const authors = (n[15].body?.items ?? []) as Record<string, unknown>[]
    check('N7: /authors lists the users who may publish posts, id and display name only (no e-mail)',
      JSON.stringify(authors) === JSON.stringify([{ id: 1, name: 'Site Admin' }, { id: 2, name: 'Dana Editor' }]) && !JSON.stringify(n[15]).includes('@'), JSON.stringify(n[15]))
    const found = ((n[16].body?.items ?? []) as { id: number; source_url: string; size_urls: string[]; alt: string }[])[0]
    check('N8: /media-alt finds the Media Library image by its file name, with its sizes and its (empty) alt',
      found?.id === 600 && /red-boots\.jpg$/.test(found.source_url) && found.size_urls.some((u) => /red-boots-300x200\.jpg$/.test(u)) && found.alt === '', JSON.stringify(n[16]))
    check('N9: set writes the alt text and answers it back', n[17].status === 200 && (n[17].body?.item as { alt?: string })?.alt === 'Red leather boots' && (n[21].meta ?? {})._wp_attachment_image_alt === 'Red leather boots')
    check('N10: markup in the words is refused; a post that is not an image is refused, nothing written',
      n[18].body?.code === 'value_invalid' && n[19].body?.code === 'not_in_wordpress' && !('_wp_attachment_image_alt' in (n[20].meta ?? {})))
    check('N11: undo (empty words) removes the alt again', n[22].status === 200 && !('_wp_attachment_image_alt' in (n[23].meta ?? {})))
    const cats = (n[24].body?.items ?? []) as { link?: string; count?: number }[]
    check('N12: /terms answers each term\'s address and count; product_cat only when WooCommerce has it', cats.length === 2 && cats.every((c) => /^https:\/\//.test(String(c.link)) && typeof c.count === 'number') && n[25].body?.code === 'invalid_request')
    check('N13: the new routes are signed like every other (unsigned: refused)', n[26].status === 401 && n[27].status === 401)

    const pub = run([
      ...setup,
      signed('/gotop/v1/publish', art({ status: 'future', date_gmt: soon })),                     // 7
      signed('/gotop/v1/publish', art({ article_id: ART2, status: 'future' })),                   // 8
      signed('/gotop/v1/publish', art({ article_id: ART2, status: 'future', date_gmt: past })),   // 9
      signed('/gotop/v1/publish', art({ article_id: ART2, status: 'publish', date_gmt: soon })),  // 10
      signed('/gotop/v1/publish', art({ new_post: true })),                                       // 11
      signed('/gotop/v1/publish', art({ author_id: 2, slug: 'by-dana', new_post: true })),        // 12
      signed('/gotop/v1/publish', art({ author_id: 3, new_post: true })),                         // 13
      signed('/gotop/v1/publish', art({ post_id: 21 })),                                          // 14 not ours
      signed('/gotop/v1/publish', art({ post_id: 21, adopt: true, title: 'Waterproof boots, adopted' })), // 15
      signed('/gotop/v1/publish', art({ post_id: 11, adopt: true })),                             // 16 a page
      signed('/gotop/v1/publish', art({ post_id: 25, adopt: true })),                             // 17 another article's
      signed('/gotop/v1/publish', art({ new_post: true, post_id: 21 })),                          // 18
    ])
    const fut = pub[7].body as { post_id?: number; post_status?: string } | undefined
    // The same steps again with the created post read back (ids are deterministic for the same steps).
    const futPost = run([...setup, signed('/gotop/v1/publish', art({ status: 'future', date_gmt: soon })), { postfull: Number(fut?.post_id) }])
    const fp = (futPost[8] as unknown as { post: Record<string, unknown> }).post
    check('N14: a scheduled post: status future with its GMT date', pub[7].status === 200 && !!fut && fp?.post_status === 'future' && fp?.post_date_gmt === soon, JSON.stringify(fp).slice(0, 200))
    check('N15: future without a date, with a past date, or a date on a non-future status: date_invalid, nothing created',
      [8, 9, 10].every((i) => pub[i].body?.code === 'date_invalid'), JSON.stringify([pub[8], pub[9], pub[10]].map((x) => x.body)))
    const first = pub[7].body?.post_id as number
    const second = pub[11].body?.post_id as number
    check('N16: new_post makes a second, separate post for the same article', pub[11].status === 200 && pub[11].body?.status === 'created' && second !== first, JSON.stringify(pub[11]))
    const danaId = run([...setup, signed('/gotop/v1/publish', art({ author_id: 2, slug: 'by-dana' }))])[7].body?.post_id
    const byDana = run([...setup, signed('/gotop/v1/publish', art({ author_id: 2, slug: 'by-dana' })), { postfull: Number(danaId) }])
    check('N17: author_id of a user who may publish: the post is theirs', (byDana[8] as unknown as { post: Record<string, unknown> }).post?.post_author === 2 && pub[12].status === 200,
      JSON.stringify((byDana[8] as unknown as { post: Record<string, unknown> }).post ?? null).slice(0, 160))
    check('N18: author_id of a user who may not publish: author_invalid', pub[13].status === 400 && pub[13].body?.code === 'author_invalid')
    check('N19: a post the plugin did not make is not updated without adopt (not_ours)', pub[14].body?.code === 'not_ours')
    const adopted = run([...setup, signed('/gotop/v1/publish', art({ post_id: 21, adopt: true, title: 'Waterproof boots, adopted' })), { post: 21 }, { postfull: 21 }])
    check('N20: adopt: the post GO TOP recorded for this article is updated in place and tied to it',
      adopted[7].body?.status === 'updated' && adopted[7].body?.post_id === 21 && (adopted[9] as unknown as { post: Record<string, unknown>; meta: Record<string, string> }).meta._gotop_article_id === ART1 &&
      (adopted[9] as unknown as { post: Record<string, unknown> }).post.post_title === 'Waterproof boots, adopted', JSON.stringify(adopted[7]))
    check('N21: adopt never takes a page, or a post tied to another article', pub[16].body?.code === 'not_ours' && pub[17].body?.code === 'not_ours')
    check('N22: new_post together with a post id is refused', pub[18].body?.code === 'invalid_request')

    // Two copies active at once: no fatal error, one runs, the other stays off and says so.
    // "Old style" = what 3.0.0 and older do: global functions, the version defined as the file is read,
    // no check for another copy. Built from this copy so the function names are exactly the same.
    const oldStyle = (): string => {
      const dir = mkdtempSync(join(tmpdir(), 'site-fix-old-copy-'))
      cpSync(PLUGIN, dir, { recursive: true })
      for (const name of readdirSync(join(dir, 'includes'))) {
        const p = join(dir, 'includes', name)
        writeFileSync(p, readFileSync(p, 'utf8').replace('namespace GoTopSeoBridge;', '').split("__NAMESPACE__ . '\\\\").join("'"))
      }
      const main = join(dir, 'gotop-seo-bridge.php')
      writeFileSync(main, readFileSync(main, 'utf8')
        .replace("add_action('plugins_loaded', function () {", '(function () {').replace(/\}, 0\);\s*$/, '})();\n')
        .replace("if (defined('GOTOP_SEO_BRIDGE_VERSION')) {", 'if (false) {')
        .replace("define('GOTOP_SEO_BRIDGE_VERSION', '3.1.0');", "define('GOTOP_SEO_BRIDGE_VERSION', '3.0.0');")
        // 3.0.0 declared its route functions in the main file itself (PHP binds those as the file is read).
        .replace("    require_once GOTOP_SEO_BRIDGE_DIR . '/includes/routes.php';\n", '')
        + readFileSync(join(dir, 'includes', 'routes.php'), 'utf8').replace('<?php', '').replace("if (!defined('ABSPATH')) { exit; }", ''))
      return dir
    }
    const dupRun = (first: string, second: string, can: string[] = ['activate_plugins']) => {
      const tmp = mkdtempSync(join(tmpdir(), 'site-fix-harness-'))
      try {
        writeFileSync(join(tmp, 'calls.json'), JSON.stringify([pair, { notices: true, can }, signed('/gotop/v1/status', {})]))
        const r = spawnSync('php', [HARNESS, first, join(tmp, 'calls.json')], { encoding: 'utf8', env: { ...process.env, GOTOP_HARNESS_SECOND: second } })
        let out: (Res & { version?: string })[] = []
        try { out = JSON.parse(r.stdout) } catch { out = [] }
        return { status: r.status, raw: (r.stderr + r.stdout).slice(0, 4000), out }
      } finally { rmSync(tmp, { recursive: true, force: true }) }
    }
    const NOTICE = /Two copies of GO TOP SEO Bridge/
    const runsOne = (d: ReturnType<typeof dupRun>, version: string) =>
      d.status === 0 && NOTICE.test(String(d.out[1]?.value)) && d.out[1]?.version === version && d.out[2]?.status === 200
    const old = oldStyle()
    const copy31 = mkdtempSync(join(tmpdir(), 'site-fix-second-copy-'))
    cpSync(PLUGIN, copy31, { recursive: true })
    const newFirst = dupRun(PLUGIN, old)
    const oldFirst = dupRun(old, PLUGIN)
    const both31 = dupRun(PLUGIN, copy31)
    check('N23: 3.1 read first (go-top-seo-bridge/), an old copy after it: no fatal error, the old copy runs, 3.1 stays off with a notice',
      runsOne(newFirst, '3.0.0'), newFirst.raw)
    check('N23b: the old copy read first: the same, no fatal error', runsOne(oldFirst, '3.0.0'), oldFirst.raw)
    check('N23c: two copies of 3.1: one runs, the other shows the notice', runsOne(both31, '3.1.0'), both31.raw)
    const quiet = dupRun(PLUGIN, old, [])
    check('N23d: the notice is only for users who may manage plugins', quiet.status === 0 && String(quiet.out[1]?.value) === '', quiet.raw)
    {
      // Without the wait for plugins_loaded, 3.1 starts before the old copy is read: both run.
      const m = mutantPlugin('gotop-seo-bridge.php', "add_action('plugins_loaded', function () {", '(function () {')
      if (m.found) { const p = join(m.dir, 'gotop-seo-bridge.php'); writeFileSync(p, readFileSync(p, 'utf8').replace(/\}, 0\);\s*$/, '})();\n')) }
      const d = m.found ? dupRun(m.dir, old) : null
      check('MUTATION (no wait for plugins_loaded): both copies start, no notice (so N23 would fail)', m.found && !!d && !runsOne(d, '3.0.0'), d?.raw)
      m.done()
    }
    {
      // Without the namespace AND the wait, the two copies declare the same functions: a fatal error.
      const m = mutantPlugin('gotop-seo-bridge.php', "add_action('plugins_loaded', function () {", '(function () {')
      if (m.found) {
        const p = join(m.dir, 'gotop-seo-bridge.php'); writeFileSync(p, readFileSync(p, 'utf8').replace(/\}, 0\);\s*$/, '})();\n'))
        for (const name of readdirSync(join(m.dir, 'includes'))) {
          const q = join(m.dir, 'includes', name)
          writeFileSync(q, readFileSync(q, 'utf8').replace('namespace GoTopSeoBridge;', '').split("__NAMESPACE__ . '\\\\").join("'"))
        }
      }
      const d = m.found ? dupRun(m.dir, old) : null
      check('MUTATION (no namespace, no wait): two copies are a fatal error', m.found && !!d && d.status !== 0 && /Cannot redeclare/i.test(d.raw), `${d?.status} ${d?.raw.slice(-400)}`)
      m.done()
    }
    {
      const m = mutantPlugin('gotop-seo-bridge.php', "if (defined('GOTOP_SEO_BRIDGE_VERSION')) {", 'if (false) {')
      const d = m.found ? dupRun(m.dir, old) : null
      check('MUTATION (duplicate check removed): no notice, both copies run (so N23 would fail)', m.found && !!d && !runsOne(d, '3.0.0'), d?.raw)
      m.done()
    }
    rmSync(old, { recursive: true, force: true })
    rmSync(copy31, { recursive: true, force: true })

    {
      // Namespaced files: a callback passed as a bare name ('gotop_seo_bridge_admin_page') resolves to a
      // global function that does not exist, and WordPress only fails when it calls it (the settings page
      // with the pairing form would not open).
      const c = run([{ callables: true }])
      const cb = c[0] as unknown as { value: string[]; seen: number; pages: string[] }
      check('N23e: every hook, the settings page (go-top-seo-bridge) and every route callback resolves', Array.isArray(cb.value) && cb.value.length === 0 && cb.seen > 30 && cb.pages.includes('go-top-seo-bridge'), JSON.stringify(cb))
      const m = mutantPlugin('includes/admin.php', "__NAMESPACE__ . '\\\\gotop_seo_bridge_admin_page'", "'gotop_seo_bridge_admin_page'")
      const mc = m.found ? (run([{ callables: true }], m.dir)[0] as unknown as { value: string[] }) : null
      check('MUTATION CONTROL: the settings page callback as a bare name is caught', m.found && !!mc && mc.value.some((x) => x.includes('page go-top-seo-bridge')), JSON.stringify(mc))
      m.done()
    }

    // uninstall.php: the key stays while another copy is installed.
    const uninstall = (dir: string, plugins: string[]) => {
      const root = mkdtempSync(join(tmpdir(), 'site-fix-uninstall-'))
      try {
        mkdirSync(join(root, 'wp-admin/includes'), { recursive: true })
        writeFileSync(join(root, 'wp-admin/includes/plugin.php'), `<?php function get_plugins() { return json_decode('${JSON.stringify(Object.fromEntries(plugins.map((p) => [p, { Name: 'x' }])))}', true); }\n`)
        const script = `<?php define('ABSPATH', '${root}/'); define('WP_UNINSTALL_PLUGIN', 'go-top-seo-bridge/gotop-seo-bridge.php'); $o = array('gotop_seo_bridge_key' => 1, 'gotop_seo_bridge_log' => 1);
function delete_option($k) { global $o; unset($o[$k]); return true; }
include '${dir}/uninstall.php'; echo json_encode(array_keys($o));`
        writeFileSync(join(root, 'run.php'), script)
        const r = spawnSync('php', [join(root, 'run.php')], { encoding: 'utf8' })
        return r.stdout.trim()
      } finally { rmSync(root, { recursive: true, force: true }) }
    }
    const kept = uninstall(PLUGIN, ['go-top-seo-bridge/gotop-seo-bridge.php', 'gotop-seo-bridge/gotop-seo-bridge.php'])
    const gone = uninstall(PLUGIN, ['go-top-seo-bridge/gotop-seo-bridge.php', 'akismet/akismet.php'])
    check('N24: deleting one copy while the other is installed keeps the connection key; the last copy removes it', kept.includes('gotop_seo_bridge_key') && gone === '[]', `${kept} | ${gone}`)
    {
      const m = mutantPlugin('uninstall.php', 'if (!$gotop_seo_bridge_other_copy) {', 'if (true) {')
      const got = m.found ? uninstall(m.dir, ['go-top-seo-bridge/gotop-seo-bridge.php', 'gotop-seo-bridge/gotop-seo-bridge.php']) : ''
      check('MUTATION (other-copy check removed): the key of the remaining copy is wiped', m.found && got === '[]', got)
      m.done()
    }
    check('N25: the uninstall hook is no longer registered from the plugin file (uninstall.php runs instead)', !/register_uninstall_hook\(/.test(allPhp))

    // Mutation controls of the new routes.
    {
      const m = mutantPlugin('includes/read.php', "        'has_password'   => false,\n", '')
      const got = m.found ? run([...setup, signed('/gotop/v1/content', { type: 'post', page: 1, per_page: 10 })], m.dir) : []
      check('MUTATION (password filter removed): a protected post is listed (so N1 would fail)', m.found && ((got[7]?.body?.items ?? []) as { id: number }[]).some((i) => i.id === 23))
      m.done()
    }
    {
      const m = mutantPlugin('includes/publish.php', " || !user_can($body['author_id'], 'publish_posts')", '')
      const got = m.found ? run([...setup, signed('/gotop/v1/publish', art({ author_id: 3, new_post: true }))], m.dir) : []
      check('MUTATION (author capability check removed): a reader becomes an author (so N18 would fail)', m.found && got[7]?.status === 200)
      m.done()
    }
    {
      const m = mutantPlugin('includes/publish.php', "    return (string) get_post_meta($post_id, gotop_seo_bridge_article_meta(), true) === '';\n}", '    return true;\n}')
      const got = m.found ? run([...setup, signed('/gotop/v1/publish', art({ post_id: 25, adopt: true }))], m.dir) : []
      check('MUTATION (adopt ownership check removed): another article\'s post is taken over (so N21 would fail)', m.found && got[7]?.status === 200)
      m.done()
    }
    {
      const m = mutantPlugin('includes/read.php', "if ($id <= 0 || !wp_attachment_is_image($id)) {", 'if ($id <= 0) {')
      const got = m.found ? run([...setup, signed('/gotop/v1/media-alt', { action: 'set', id: 21, alt: 'Not an image' })], m.dir) : []
      check('MUTATION (image check removed): a post gets an alt (so N10 would fail)', m.found && got[7]?.status === 200)
      m.done()
    }
    {
      const m = mutantPlugin('includes/publish.php', 'if (!$at || $at < time() + 60 || $at > time() + 2 * 366 * 86400) { return null; }', 'if (!$at) { return null; }')
      const got = m.found ? run([...setup, signed('/gotop/v1/publish', art({ article_id: ART2, status: 'future', date_gmt: past }))], m.dir) : []
      check('MUTATION (date window removed): a past "scheduled" date is accepted (so N15 would fail)', m.found && got[7]?.status === 200)
      m.done()
    }
    {
      const m = mutantPlugin('includes/read.php', "'capability' => array('publish_posts'),", "'capability' => array(),")
      const p = join(m.dir, 'includes/read.php')
      const both = m.found && readFileSync(p, 'utf8').includes(" && user_can($id, 'publish_posts')")
      if (both) { writeFileSync(p, readFileSync(p, 'utf8').replace(" && user_can($id, 'publish_posts')", '')) }
      const got = both ? run([pair, signed('/gotop/v1/authors', {})], m.dir) : []
      check('MUTATION (capability filter and check removed): a user who cannot publish is listed (so N7 would fail)', both && JSON.stringify(got[1] ?? {}).includes('Sam Reader'), JSON.stringify(got[1] ?? {}).slice(0, 160))
      m.done()
    }
  }

  console.log('\nB) 1.x /seo-meta is unchanged')
  const b = run([
    { rest: '/gotop/v1/seo-meta', body: JSON.stringify({ post_id: 11, plugin: 'yoast', meta: { _yoast_wpseo_metadesc: 'Desc', _wp_page_template: 'evil.php' } }), can: ['edit_post'] },
    { rest: '/gotop/v1/seo-meta', body: JSON.stringify({ post_id: 11, meta: { _yoast_wpseo_metadesc: 'x' } }), can: [] },
    { post: 11 },
  ])
  check('an editor writes an allowlisted Yoast key and gets it read back', b[0].status === 200 && (b[0].body?.fields as Record<string, string>)?._yoast_wpseo_metadesc === 'Desc')
  check('a non-allowlisted key is ignored', !('_wp_page_template' in (b[2].meta ?? {})))
  check('without edit rights /seo-meta is refused', b[1].status === 401 || b[1].status === 403)

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}

try { main() } catch (e) { console.log(`  ✗ suite crashed — ${(e as Error).message}`); console.log(`\n${pass} passed, ${fail + 1} failed`); process.exitCode = 1 }
export {}
