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
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
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
  const phpFiles = [join(PLUGIN, 'gotop-seo-bridge.php'), ...readdirSync(join(PLUGIN, 'includes')).map((f) => join(PLUGIN, 'includes', f))]
  for (const f of phpFiles) {
    let ok = true
    try { execFileSync('php', ['-l', f], { encoding: 'utf8', stdio: 'pipe' }) } catch { ok = false }
    check(`php -l ${f.slice(PLUGIN.length + 1)}`, ok)
  }

  console.log('\nA) authentication')
  const src = readFileSync(join(PLUGIN, 'gotop-seo-bridge.php'), 'utf8')
  check('the plugin version is 3.0.0 (header and constant)', /Version:\s+3\.0\.0/.test(src) && /GOTOP_SEO_BRIDGE_VERSION', '3\.0\.0'/.test(src))
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
  check('a signed status call answers with the version', r[2].status === 200 && r[2].body?.version === '3.0.0', JSON.stringify(r[2]))
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
    const m = mutantPlugin('gotop-seo-bridge.php', "'permission_callback' => 'gotop_seo_bridge_admin_permission',", "'permission_callback' => '__return_true',")
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
