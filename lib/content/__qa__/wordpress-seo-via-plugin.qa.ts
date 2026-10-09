/**
 * THE ARTICLE'S TITLE AND DESCRIPTION ON A WORDPRESS SITE WITH NO SEO PLUGIN.
 *
 * Before: with no Yoast or Rank Math, publishing wrote no meta description and no SEO title at
 * all (writeVerifiedSeoMeta answers plugin_unavailable), although the Go Top plugin can print
 * both. Now, when the plugin is connected, they go through its signed /fix route.
 *
 *   S) the request: /fix, seo_title + meta_description, the post's own URL, the article's own
 *      words, a stable job id; only with a connected plugin of this owner; never on Yoast/Rank
 *      Math or with All in One SEO / SEOPress active;
 *   P) EXECUTED against the real plugin PHP: accepted with no plugin change, the page's <head>
 *      prints the description, a republish is "already";
 *   W) wiring: both publish routes pass the post's address; the no-connection message offers
 *      the connection in four languages.
 *
 * MUTATION CONTROLS for each group. Run: npx tsx lib/content/__qa__/wordpress-seo-via-plugin.qa.ts
 */
import { mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'fs'
import { spawnSync } from 'child_process'
import { tmpdir } from 'os'
import { join } from 'path'
import { FakeAdmin } from '@/lib/__qa__/_fake-admin'
import { generatePluginKey, pairingCode } from '@/lib/site-fix/plugin-auth'
import { otherSeoPluginInNamespaces } from '../wordpress-taxonomy'
import { seoJobId, writeSeoViaGoTopPlugin } from '../seo-publish'

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
const TITLE = 'Waterproof boots: the complete guide'
const DESC = 'How to keep boots dry & warm in winter.'
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

const db = (plugin: Record<string, unknown> | null) => new FakeAdmin({
  generated_articles: [{ id: ART, project_id: PROJECT }],
  projects: [{ id: PROJECT, user_id: OWNER }],
  site_fix_plugin_links: plugin ? [{ project_id: PROJECT, site_url: SITE, key_id: key.keyId, secret_encrypted: 'enc', secret_hint: 'x', status: 'connected', plugin_version: '2.1.0', seo_plugin: 'none', last_seen_at: null, last_error_code: null, user_id: OWNER, ...plugin }] : [],
})
const deps = (post: never) => ({ decrypt: (s: string) => (s === 'enc' ? key.secret : 'wrong'), post })
const input = { articleId: ART, postUrl: POST_URL, metaTitle: TITLE, metaDescription: DESC }

async function main() {
  console.log('\nS) what is sent, and when')
  const t = transport()
  const out = await writeSeoViaGoTopPlugin(db({}) as never, input, deps(t.post))
  const bodies = t.sent.map((s) => JSON.parse(s.body) as { job_id: string; type: string; url: string; value: { value: string }; expected?: string })
  check('S1: verified, two signed /fix calls (title, description) on the post\'s own URL',
    out?.status === 'verified' && t.sent.length === 2 && t.sent.every((s) => s.route === '/fix' && s.siteUrl === SITE && Object.keys(s.headers).length > 0) &&
    bodies[0]?.type === 'seo_title' && bodies[0]?.value.value === TITLE && bodies[1]?.type === 'meta_description' && bodies[1]?.value.value === DESC && bodies.every((b) => b.url === POST_URL && !('expected' in b)),
    JSON.stringify({ out, bodies }))
  check('S2: the job id is stable for the same words and changes when they change',
    bodies[1]?.job_id === seoJobId(ART, 'meta_description', DESC) && seoJobId(ART, 'meta_description', DESC) !== seoJobId(ART, 'meta_description', DESC + '!') &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/.test(bodies[1]?.job_id ?? ''))
  const none = transport()
  check('S3: no plugin row → null, nothing sent', (await writeSeoViaGoTopPlugin(db(null) as never, input, deps(none.post))) === null && none.sent.length === 0)
  const off = transport()
  check('S4: a plugin that is not connected → null, nothing sent', (await writeSeoViaGoTopPlugin(db({ status: 'disconnected' }) as never, input, deps(off.post))) === null && off.sent.length === 0)
  const other = transport()
  check('S5: another owner\'s plugin row is never used', (await writeSeoViaGoTopPlugin(db({ user_id: 'u-other' }) as never, input, deps(other.post))) === null && other.sent.length === 0)
  const draft = transport()
  check('S6: no https address (a draft) → null, nothing sent', (await writeSeoViaGoTopPlugin(db({}) as never, { ...input, postUrl: '' }, deps(draft.post))) === null && draft.sent.length === 0)
  const refused = transport({ status: 409, body: JSON.stringify({ ok: false, code: 'value_invalid' }) })
  const r = await writeSeoViaGoTopPlugin(db({}) as never, input, deps(refused.post))
  check('S7: a refusal is a failure, never "verified"', r?.status === 'exact_failure' && refused.sent.length === 1, JSON.stringify(r))
  check('S8: All in One SEO and SEOPress are recognised; Yoast-only or plain sites are not "other"',
    otherSeoPluginInNamespaces(['wp/v2', 'aioseo/v1']) && otherSeoPluginInNamespaces(['seopress/v1']) && !otherSeoPluginInNamespaces(['wp/v2', 'yoast/v1', 'gotop/v1']) && !otherSeoPluginInNamespaces(null))
  {
    const m = await mutant<typeof import('../seo-publish')>('lib/content/seo-publish.ts', (s) => s.replace("if (!row || row.status !== 'connected') return null", 'if (!row) return null'))
    const mt = transport()
    check('MUTATION CONTROL: dropping the "connected" check is caught by S4', (await m.writeSeoViaGoTopPlugin(db({ status: 'disconnected' }) as never, input, deps(mt.post))) !== null)
  }
  {
    const m = await mutant<typeof import('../seo-publish')>('lib/content/seo-publish.ts', (s) => s.replace("if (!answer.ok) return {", 'if (false) return {'))
    const mt = transport({ status: 409, body: JSON.stringify({ ok: false, code: 'value_invalid' }) })
    check('MUTATION CONTROL: treating a refusal as success is caught by S7', (await m.writeSeoViaGoTopPlugin(db({}) as never, input, deps(mt.post)))?.status === 'verified')
  }

  console.log('\nG) the gate in publishArticleSeo')
  const shared = strip(read('lib/content/seo-publish.ts'))
  const gate = (s: string) => /seo\.plugin === 'none' && seo\.status === 'plugin_unavailable' && seo\.detail !== 'other_seo_plugin' && opts\.postUrl/.test(s) && /writeSeoViaGoTopPlugin\(admin/.test(s)
  check('G1: only a site with no SEO plugin (and none of the others) takes the plugin path', gate(shared))
  check('MUTATION CONTROL: dropping the other-SEO-plugin check is caught', !gate(shared.replace(" && seo.detail !== 'other_seo_plugin'", '')))
  const client = strip(read('lib/wordpress/client.ts'))
  const otherGate = (s: string) => /if \(plugin === 'none' && caps\.otherSeo\) return \{ plugin, status: 'plugin_unavailable', detail: 'other_seo_plugin' \}/.test(s)
  check('G2: writeVerifiedSeoMeta marks a site with All in One SEO / SEOPress', otherGate(client) && /otherSeo: otherSeoPluginInNamespaces\(parsed\?\.namespaces\)/.test(client))
  check('MUTATION CONTROL: removing the mark is caught', !otherGate(client.replace("detail: 'other_seo_plugin' }", '}')))

  console.log('\nP) the real plugin (PHP harness) accepts it with no plugin change')
  const hasPhp = spawnSync('php', ['-v'], { encoding: 'utf8' }).status === 0
  if (!hasPhp) {
    check('P0: php is not installed here: the executed checks did not run (report this)', true)
  } else {
    const harness = join(ROOT, 'lib/site-fix/__qa__/plugin-harness.php')
    const plugin = join(ROOT, 'wordpress-plugin/gotop-seo-bridge')
    const step = (s: Sent) => ({ rest: `/gotop/v1${s.route}`, headers: s.headers, body: s.body })
    const again = transport()
    await writeSeoViaGoTopPlugin(db({}) as never, input, deps(again.post))
    const tmp = mkdtempSync(join(tmpdir(), 'wp-seo-'))
    try {
      const calls = join(tmp, 'calls.json')
      writeFileSync(calls, JSON.stringify([
        { rest: '/gotop/v1/pair', body: JSON.stringify({ code: pairingCode(key) }), can: ['manage_options'] },
        step(t.sent[0]!), step(t.sent[1]!),
        { head: 21 },
        step(again.sent[1]!),
      ]))
      const run = spawnSync('php', [harness, plugin, calls], { encoding: 'utf8' })
      const res = JSON.parse(run.stdout || '[]') as { status?: number; body?: Record<string, unknown>; head?: string }[]
      check('P1: the plugin accepts both requests (applied)', res[1]?.body?.status === 'applied' && res[2]?.body?.status === 'applied', JSON.stringify(res.slice(1, 3)) + run.stderr.slice(0, 200))
      const head = res[3]?.head ?? ''
      check('P2: the page\'s <head> prints the meta description, escaped', head.includes('<meta name="description" content="How to keep boots dry &amp; warm in winter." />'), head.slice(0, 300))
      check('P3: publishing the same words again is "already"', res[4]?.body?.status === 'already', JSON.stringify(res[4]))
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  }

  console.log('\nW) wiring and the no-connection message')
  const auto = strip(read('lib/content/automation/publish-item.ts'))
  const manual = strip(read('app/api/content/articles/[id]/wordpress/route.ts'))
  check('W1: automation passes the post\'s address', /postUrl: created\.wpPostUrl,\s*\}\)/.test(auto))
  check('W2: the manual route passes it only for a publish', /postUrl: status === 'publish' \? created\.wpPostUrl : null/.test(manual))
  const modal = strip(read('components/site-health/ApproveFixModal.tsx'))
  const cta = (s: string) => /phase\.code === 'needs_plugin' \|\| \(phase\.code === 'no_channel' && platform === 'wordpress'\)/.test(s)
  check('W3: "not connected" in the fix window offers the connection on WordPress', cta(modal))
  check('MUTATION CONTROL: dropping no_channel from the button is caught', !cta(modal.replace(" || (phase.code === 'no_channel' && platform === 'wordpress')", '')))
  const dicts = ['lib/i18n/dashboard/he.ts', 'lib/i18n/dashboard/en.ts', 'lib/i18n/dashboard/es.ts', 'lib/i18n/dashboard/pt-BR/site-health.ts'].map(read)
  const said = [/no_channel: 'כדי שנוכל לתקן בשבילכם, צריך קודם לחבר את האתר/, /no_channel: 'To fix this for you, we first need your site connected/, /no_channel: 'Para arreglarlo por ti, primero hay que conectar tu web/, /no_channel: 'Para corrigirmos por você, primeiro é preciso conectar o seu site/]
  check('W4: the message says the site must be connected, in all four languages', dicts.every((d, i) => said[i].test(d)))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}

main().catch((e) => { console.error(e); process.exit(1) })

export {}
