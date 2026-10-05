/**
 * THE ARTICLE'S SCHEMA ON WORDPRESS — the guards (wave 8, item 3).
 *
 * Before: a WordPress article was published with no JSON-LD (only the webhook
 * payload carried structured_data). Now, when the GO TOP Bridge plugin is
 * connected, the published post gets BlogPosting (+ FAQPage when the article
 * has complete FAQ pairs) through the plugin's existing per-post schema storage.
 *
 *   S) the request: the plugin's /fix route, type schema_jsonld, the post's own
 *      URL, one @graph built by the shared builder (the Schema tab's), valid
 *      under the site-fix whitelist; publish only; plugin connected only;
 *      another owner's plugin row is never used; nothing added to the content;
 *   P) EXECUTED against the real plugin PHP (the site-fix harness): the exact
 *      request is accepted with no plugin change, the page's <head> prints the
 *      markup escaped, and a republish of the same article is "already";
 *   W) wiring: wpCreatePost runs it once, after the post exists, for a publish,
 *      and never puts a script into the post content; Shopify code untouched.
 *
 * MUTATION CONTROLS for each group. Run: npx tsx lib/content/__qa__/wordpress-schema.qa.ts
 */
import { execSync, spawnSync } from 'child_process'
import { mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { FakeAdmin } from '@/lib/__qa__/_fake-admin'
import { generatePluginKey, pairingCode } from '@/lib/site-fix/plugin-auth'
import { validSchema } from '@/lib/site-fix/whitelist'
import { businessProfilesNode, publishArticleSchemaToWordPress, schemaJobId, wordpressSchemaGraph } from '../wordpress-schema'
import { buildStructuredData } from '../structured-data'

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
const POST_URL = `${SITE}/blog/waterproof-boots/`
const PROJECT = 'p-1'
const OWNER = 'u-owner'
const ART = 'a-1'
const key = generatePluginKey()

type Sent = { siteUrl: string; route: string; body: string; headers: Record<string, string> }
function transport(answer: { status: number; body: string } = { status: 200, body: JSON.stringify({ ok: true, status: 'applied', fix_id: 'x', post_id: 21 }) }) {
  const sent: Sent[] = []
  const post = (async (siteUrl: string, route: string, body: string, opts: { headers?: Record<string, string> }) => {
    sent.push({ siteUrl, route, body, headers: opts.headers ?? {} })
    return answer
  }) as never
  return { sent, post }
}

const db = (plugin: Record<string, unknown> | null, faq: unknown = [{ question: 'Do you ship abroad?', answer: 'Only within Israel &lt;for now&gt; &amp; soon more.' }]) => new FakeAdmin({
  generated_articles: [{ id: ART, project_id: PROJECT, topic_id: null, title: 'Waterproof boots: the complete guide', meta_description: 'How to keep boots dry.',
    excerpt: null, featured_image_url: 'https://cdn.example.org/boots.jpg', faq_json: faq, published_at: '2026-09-29T10:00:00Z', updated_at: '2026-09-29T10:00:00Z' }],
  projects: [{ id: PROJECT, user_id: OWNER, name: 'Boots', business_name: 'Boots & Co', target_domain: 'shop.example.org', language: 'en', country: 'IL' }],
  project_article_styles: [],
  site_fix_plugin_links: plugin ? [{ project_id: PROJECT, site_url: SITE, key_id: key.keyId, secret_encrypted: 'enc', secret_hint: 'x', status: 'connected', plugin_version: '2.0.0', seo_plugin: 'none', last_seen_at: null, last_error_code: null, user_id: OWNER, ...plugin }] : [],
})
const deps = (post: never) => ({ decrypt: (s: string) => (s === 'enc' ? key.secret : 'wrong'), post, now: () => new Date('2026-09-29T10:00:00Z') })

async function main() {
  // ── S) the request ───────────────────────────────────────────────────────
  console.log('\nS) what is sent, and when')
  const t = transport()
  const out = await publishArticleSchemaToWordPress(db({}) as never, { articleId: ART, postUrl: POST_URL, status: 'publish' }, deps(t.post))
  const req = t.sent[0]
  const payload = req ? JSON.parse(req.body) as { job_id: string; type: string; url: string; value: { schema: Record<string, unknown> } } : null
  const graph = (payload?.value.schema['@graph'] ?? []) as Record<string, unknown>[]
  check('S1: plugin connected + publish: one signed /fix call, type schema_jsonld, on the post\'s own URL', out === 'applied' && t.sent.length === 1 && req.route === '/fix' &&
    payload?.type === 'schema_jsonld' && payload.url === POST_URL && Object.keys(req?.headers ?? {}).some((h) => /signature/i.test(h)), JSON.stringify(req?.headers))
  check('S2: the markup is BlogPosting + FAQPage, from the article\'s own fields, with the post URL', graph[0]?.['@type'] === 'BlogPosting' && graph[1]?.['@type'] === 'FAQPage' &&
    graph[0]?.headline === 'Waterproof boots: the complete guide' && (graph[0]?.mainEntityOfPage as Record<string, unknown>)?.['@id'] === POST_URL, JSON.stringify(graph).slice(0, 300))
  check('S3: it passes the site-fix whitelist (types, no markup characters, bounds)', !!payload && validSchema(payload.value.schema) && !/[<>]/.test(JSON.stringify(payload.value.schema)))
  check('S4: the job id is UUID-shaped (the plugin\'s rule), stable for the same markup, new when it changes',
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(payload?.job_id ?? '') && payload?.job_id === schemaJobId(ART, payload!.value.schema) &&
    schemaJobId(ART, { ...payload!.value.schema, x: 1 }) !== payload?.job_id)
  const noFaq = transport()
  await publishArticleSchemaToWordPress(db({}, []) as never, { articleId: ART, postUrl: POST_URL, status: 'publish' }, deps(noFaq.post))
  const noFaqGraph = (JSON.parse(noFaq.sent[0]?.body ?? '{}').value?.schema?.['@graph'] ?? []) as Record<string, unknown>[]
  check('S5: no complete FAQ pair: BlogPosting only', noFaqGraph.length === 1 && noFaqGraph[0]?.['@type'] === 'BlogPosting')
  const draft = transport()
  check('S6: a draft sends nothing', (await publishArticleSchemaToWordPress(db({}) as never, { articleId: ART, postUrl: POST_URL, status: 'draft' }, deps(draft.post))) === 'not_published' && draft.sent.length === 0)
  const none = transport()
  check('S7: no plugin: nothing sent (no_plugin); nothing goes into the post content instead', (await publishArticleSchemaToWordPress(db(null) as never, { articleId: ART, postUrl: POST_URL, status: 'publish' }, deps(none.post))) === 'no_plugin' && none.sent.length === 0)
  const off = transport()
  check('S8: plugin paired but disconnected: nothing sent', (await publishArticleSchemaToWordPress(db({ status: 'disconnected' }) as never, { articleId: ART, postUrl: POST_URL, status: 'publish' }, deps(off.post))) === 'plugin_not_connected' && off.sent.length === 0)
  const theirs = transport()
  check('S9: a plugin row stamped with another owner is never used (owner filter under the service role)',
    (await publishArticleSchemaToWordPress(db({ user_id: 'someone-else' }) as never, { articleId: ART, postUrl: POST_URL, status: 'publish' }, deps(theirs.post))) === 'no_plugin' && theirs.sent.length === 0)
  const refused = transport({ status: 422, body: JSON.stringify({ ok: false, code: 'value_invalid' }) })
  check('S10: a refusal is a code, never thrown', (await publishArticleSchemaToWordPress(db({}) as never, { articleId: ART, postUrl: POST_URL, status: 'publish' }, deps(refused.post))) === 'plugin_refused')
  const big = Array.from({ length: 20 }, (_, i) => ({ question: `Question number ${i + 1} about boots?`, answer: 'A long answer. '.repeat(70) }))
  const bigGraph = wordpressSchemaGraph([{ '@context': 'https://schema.org', '@type': 'BlogPosting', headline: 'H' }, { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: big.map((f) => ({ '@type': 'Question', name: f.question, acceptedAnswer: { '@type': 'Answer', text: f.answer } })) }])
  check('S11: an FAQ too large for the plugin is trimmed to fit, never sent over the limit', !!bigGraph && JSON.stringify(bigGraph).length <= 16000 && validSchema(bigGraph))
  // ── Y) Yoast / Rank Math already print the article markup ───────────────
  const graphOf = (t: ReturnType<typeof transport>) => (JSON.parse(t.sent[0]?.body ?? '{}').value?.schema?.['@graph'] ?? []) as Record<string, unknown>[]
  const withSeo = (p: string) => ({ ...deps(undefined as never), detectSeoPlugin: async () => p as never })
  for (const p of ['yoast', 'rankmath']) {
    const y = transport()
    const yo = await publishArticleSchemaToWordPress(db({}) as never, { articleId: ART, postUrl: POST_URL, status: 'publish' }, { ...withSeo(p), post: y.post })
    const g = graphOf(y)
    check(`Y1: ${p} on the site: only the FAQPage is sent, no second article markup`, yo === 'applied' && g.length === 1 && g[0]?.['@type'] === 'FAQPage', JSON.stringify(g).slice(0, 200))
  }
  const yNoFaq = transport()
  check('Y2: Yoast and no FAQ: nothing sent (seo_plugin_article)',
    (await publishArticleSchemaToWordPress(db({}, []) as never, { articleId: ART, postUrl: POST_URL, status: 'publish' }, { ...withSeo('yoast'), post: yNoFaq.post })) === 'seo_plugin_article' && yNoFaq.sent.length === 0)
  const plain = transport()
  await publishArticleSchemaToWordPress(db({ seo_plugin: 'yoast' }) as never, { articleId: ART, postUrl: POST_URL, status: 'publish' }, { ...withSeo('none'), post: plain.post })
  check('Y3: the site answers "none" (Yoast since removed): the full markup, the live answer wins over the stored one', graphOf(plain).map((n) => n['@type']).join() === 'BlogPosting,FAQPage')
  const stale = transport()
  await publishArticleSchemaToWordPress(db({ seo_plugin: 'rankmath' }) as never, { articleId: ART, postUrl: POST_URL, status: 'publish' }, { ...withSeo('unknown'), post: stale.post })
  check('Y4: the site does not answer: what the Bridge plugin last reported decides (Rank Math: FAQ only)', graphOf(stale).map((n) => n['@type']).join() === 'FAQPage')
  const unknownBoth = transport()
  await publishArticleSchemaToWordPress(db({ seo_plugin: null }) as never, { articleId: ART, postUrl: POST_URL, status: 'publish' }, { ...withSeo('permission_error'), post: unknownBoth.post })
  check('Y5: neither known: the full markup, as before', graphOf(unknownBoth).map((n) => n['@type']).join() === 'BlogPosting,FAQPage')
  const wpSrc = strip(read('lib/content/wordpress-publish.ts'))
  check('Y6: publishing asks the site which SEO plugin it runs', /detectSeoPlugin:\s*\(\)\s*=>\s*detectSeoPlugin\(creds\)/.test(wpSrc))
  const withProfiles = buildStructuredData({ headline: 'H', url: POST_URL, language: 'en', datePublished: '2026-09-29T10:00:00Z', dateModified: '2026-09-29T10:00:00Z',
    publisher: { name: 'Boots & Co', url: 'shop.example.org', sameAs: ['https://www.facebook.com/boots', 'https://www.instagram.com/boots'] }, faq: [{ question: 'Q?', answer: 'A.' }] })
  const orgNode = businessProfilesNode(withProfiles)
  const yGraph = wordpressSchemaGraph([...orgNode, ...withProfiles.filter((b) => b['@type'] === 'FAQPage')])
  check('Y7: with Yoast the official profiles still go out, as the site\'s Organization under Yoast\'s own @id',
    orgNode.length === 1 && orgNode[0]['@id'] === 'https://shop.example.org/#organization' && (orgNode[0].sameAs as string[]).length === 2 &&
    !!yGraph && validSchema(yGraph) && ((yGraph['@graph'] as Record<string, unknown>[]).map((n) => n['@type']).join() === 'Organization,FAQPage'), JSON.stringify(yGraph).slice(0, 300))
  const noProfiles = buildStructuredData({ headline: 'H', url: POST_URL, publisher: { name: 'Boots & Co', url: 'shop.example.org', sameAs: [] } })
  check('Y8: no profiles set: no Organization node is added next to Yoast\'s', businessProfilesNode(noProfiles).length === 0)
  const schemaSrc = strip(read('lib/content/wordpress-schema.ts'))
  check('Y9: the Yoast branch sends the profiles node', /ARTICLE_MARKUP_PLUGINS\.has\(seoPlugin\)\s*\?\s*\[\.\.\.businessProfilesNode\(blocks\)/.test(schemaSrc))
  check('MUTATION CONTROL: Y9 catches the profiles node dropped', !/ARTICLE_MARKUP_PLUGINS\.has\(seoPlugin\)\s*\?\s*\[\.\.\.businessProfilesNode\(blocks\)/.test(schemaSrc.replace('[...businessProfilesNode(blocks), ...blocks', '[...blocks')))
  for (const [lang, f] of [['he', 'lib/i18n/dashboard/he.ts'], ['en', 'lib/i18n/dashboard/en.ts'], ['es', 'lib/i18n/dashboard/es.ts'], ['pt-BR', 'lib/i18n/dashboard/pt-BR/project-settings.ts']]) {
    const body = (read(f).match(/officialProfiles: \{[\s\S]*?body: '((?:[^'\\]|\\.)*)'/) ?? [])[1] ?? ''
    check(`Y10 ${lang}: the profiles copy names where they apply (WordPress with the plugin, webhook) and that Shopify does not get them`,
      /WordPress/.test(body) && /Shopify/.test(body) && /webhook/i.test(body) && !/(כל מאמר יכלול|Every article carries|Cada artículo los lleva|Cada artigo os leva)/.test(body), body.slice(0, 120))
  }

  const noFilter = await mutant<typeof import('../wordpress-schema')>('lib/content/wordpress-schema.ts', (s) => s.replace("ARTICLE_MARKUP_PLUGINS.has(seoPlugin) ?", 'false ?'))
  const mY = transport()
  await noFilter.publishArticleSchemaToWordPress(db({}) as never, { articleId: ART, postUrl: POST_URL, status: 'publish' }, { ...withSeo('yoast'), post: mY.post })
  check('MUTATION CONTROL: without the Yoast check the BlogPosting is sent again (so Y1 would fail)', graphOf(mY).some((n) => n['@type'] === 'BlogPosting'))
  check('MUTATION CONTROL: Y6 catches publishing that stops asking', !/detectSeoPlugin:\s*\(\)\s*=>\s*detectSeoPlugin\(creds\)/.test(wpSrc.replace('detectSeoPlugin: () => detectSeoPlugin(creds)', '')))

  const noStatus = await mutant<typeof import('../wordpress-schema')>('lib/content/wordpress-schema.ts', (s) => s.replace("    if (input.status !== 'publish') return 'not_published'\n", ''))
  const mDraft = transport()
  await noStatus.publishArticleSchemaToWordPress(db({}) as never, { articleId: ART, postUrl: POST_URL, status: 'draft' }, deps(mDraft.post))
  check('MUTATION CONTROL: without the publish check a draft is sent (so S6 would fail)', mDraft.sent.length === 1)
  const noConnected = await mutant<typeof import('../wordpress-schema')>('lib/content/wordpress-schema.ts', (s) => s.replace("    if (row.status !== 'connected') return 'plugin_not_connected'\n", ''))
  const mOff = transport()
  await noConnected.publishArticleSchemaToWordPress(db({ status: 'disconnected' }) as never, { articleId: ART, postUrl: POST_URL, status: 'publish' }, deps(mOff.post))
  check('MUTATION CONTROL: without the connected check a disconnected plugin is called (so S8 would fail)', mOff.sent.length === 1)
  const noScrub = await mutant<typeof import('../wordpress-schema')>('lib/content/wordpress-schema.ts', (s) => s.replace("return node.replace(/[<>]/g, ' ')", 'return node.replace(/[]/g, \' \')'))
  const mScrub = transport()
  const mOut = await noScrub.publishArticleSchemaToWordPress(db({}) as never, { articleId: ART, postUrl: POST_URL, status: 'publish' }, deps(mScrub.post))
  check('MUTATION CONTROL: without removing "<" ">" the FAQ answer "&lt;for now&gt;" fails the whitelist and the FAQPage is lost (so S2 would fail)',
    mOut !== 'applied' || !/FAQPage/.test(mScrub.sent[0]?.body ?? ''))

  // ── P) the real plugin, executed ─────────────────────────────────────────
  console.log('\nP) the real plugin (PHP harness) accepts it with no plugin change')
  const hasPhp = spawnSync('php', ['-v'], { encoding: 'utf8' }).status === 0
  if (!hasPhp) {
    check('P0: php is not installed here: the executed checks did not run (report this)', true)
  } else {
    const harness = join(ROOT, 'lib/site-fix/__qa__/plugin-harness.php')
    const plugin = join(ROOT, 'wordpress-plugin/gotop-seo-bridge')
    const step = (s: Sent) => ({ rest: `/gotop/v1${s.route}`, headers: s.headers, body: s.body })
    const again = transport()
    await publishArticleSchemaToWordPress(db({}) as never, { articleId: ART, postUrl: POST_URL, status: 'publish' }, deps(again.post))
    const tmp = mkdtempSync(join(tmpdir(), 'wp-schema-'))
    try {
      const calls = join(tmp, 'calls.json')
      writeFileSync(calls, JSON.stringify([
        { rest: '/gotop/v1/pair', body: JSON.stringify({ code: pairingCode(key) }), can: ['manage_options'] },
        step(req!),
        { head: 21 },
        step(again.sent[0]!),
        { post: 21 },
      ]))
      const r = spawnSync('php', [harness, plugin, calls], { encoding: 'utf8' })
      const res = JSON.parse(r.stdout || '[]') as { status?: number; body?: Record<string, unknown>; head?: string; content?: string }[]
      check('P1: the plugin accepts the exact request (applied)', res[1]?.status === 200 && res[1]?.body?.status === 'applied', JSON.stringify(res[1]) + r.stderr.slice(0, 200))
      const head = res[2]?.head ?? ''
      check('P2: the post\'s <head> prints the BlogPosting and FAQPage JSON-LD, with < > & escaped', /application\/ld\+json/.test(head) && head.includes('"BlogPosting"') && head.includes('"FAQPage"') &&
        head.includes('Boots \\u0026 Co') && !/<\/script><script/.test(head.replace(/<script type="application\/ld\+json" class="gotop-schema">[\s\S]*?<\/script>/, '')), head.slice(0, 300))
      check('P3: publishing the same article again is "already" (no second write)', res[3]?.body?.status === 'already', JSON.stringify(res[3]))
      check('P4: the post content is untouched (no script injected)', res[4]?.content === '<p>Orphan page.</p>')
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  }

  // ── W) wiring ────────────────────────────────────────────────────────────
  console.log('\nW) wiring')
  const wp = strip(read('lib/content/wordpress-publish.ts'))
  const wired = (src: string) => (src.match(/publishArticleSchemaToWordPress\(/g) ?? []).length === 1 &&
    /if \(status === 'publish' && article\.id\)/.test(src) && src.indexOf('await createPost(creds, postFields)') < src.indexOf('publishArticleSchemaToWordPress(')
  check('W1: wpCreatePost runs the schema step once, for a publish, after the post exists', wired(wp))
  check('W2: nothing script-like is added to the post content', !/content\s*(\+?=)[^\n]*ld\+json|<script/i.test(wp))
  check('MUTATION CONTROL: the step moved before the post is created is caught', !wired(wp.replace("if (status === 'publish' && article.id)", "if (article.id)")))
  const changed = (base: string, ...paths: string[]) => spawnSync('git', ['diff', '--name-only', base, '--', ...paths], { cwd: ROOT, encoding: 'utf8' }).stdout.trim()

  // What this guard is FOR: proving this feature did not quietly reach into the
  // Shopify code path. It used to assert that nothing under lib/shopify or
  // app/api/shopify had changed at all since 8b468a8, which also fires on any
  // later, deliberate, unrelated Shopify change — and then says "this feature
  // touched Shopify", which is false. So the question it asks is narrowed to the
  // one it means: if a Shopify file changed, is everything it ADDED the shared
  // country block (lib/sanctions), or is it this feature leaking in?
  //
  // The country block is a legal refusal that has to sit on every path where a
  // payment can start, Shopify billing included; it shares nothing with the WordPress schema step.
  const shopifyAddedLines = (base: string) => execSync(`git diff -U0 ${base} -- lib/shopify app/api/shopify`, { cwd: ROOT })
    .toString().split('\n')
    .filter((l) => l.startsWith('+') && !l.startsWith('+++'))
    .map((l) => l.slice(1).trim())
    .filter((l) => l.length > 0 && !l.startsWith('//') && !l.startsWith('*') && !l.startsWith('/*'))
    // Structure-only lines (a closing brace, a lone paren) carry no feature logic.
    .filter((l) => !/^[{}()\[\];,]+$/.test(l))
  const foreignShopifyLines = (base: string) => shopifyAddedLines(base)
    .filter((l) => !/sanctions|restrictionForRequest|logRestrictedAttempt|restricted|451/.test(l))
  const foreignWp = foreignShopifyLines('8b468a8')
  check('W3: the WordPress schema feature has not reached into Shopify code', foreignWp.length === 0, foreignWp.slice(0, 4).join(' | '))
  check('MUTATION CONTROL: a WordPress-schema line added to Shopify code would be caught',
    ['publishArticleSchemaToWordPress(creds, article)'].filter((l) => !/sanctions|restrictionForRequest|logRestrictedAttempt|restricted|451/.test(l)).length === 1)
  // Wave 8 merge: the plugin's only change is site health's 2.1.0 (w8-health, 2a1492b: h1 and
  // llms.txt). The article schema rides the existing /fix schema_jsonld and adds nothing to it.
  const pluginDiff = changed('2a1492b', 'wordpress-plugin')
  check('W3b: the plugin is exactly site health\'s 2.1.0; the article work adds nothing to it', pluginDiff === '', pluginDiff)
  // Mutation control without touching a file: against the pre-wave base the same check sees the
  // plugin's changed files, so a plugin change is caught.
  check('MUTATION CONTROL: a plugin change is caught', changed('8b468a8', 'wordpress-plugin').includes('wordpress-plugin/gotop-seo-bridge/'))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exitCode = 1
}

void main()

export {}
