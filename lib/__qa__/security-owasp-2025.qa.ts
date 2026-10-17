/**
 * OWASP Top 10:2025 audit — unit and source-contract guards for the fixes.
 *
 * Run: npx tsx lib/__qa__/security-owasp-2025.qa.ts
 *
 * Behaviour is exercised directly where a module can run without a server
 * (cron auth, HTML sanitizer, JSON-LD escaping, the signup e-mail builder).
 * Where the property is structural (a route checks ownership BEFORE it does
 * work) the guard reads the source with comments stripped, and every guard is
 * paired with a MUTATION CONTROL: the same predicate applied to the vulnerable
 * shape must fail, or the guard proves nothing.
 *
 * The HTTP-level attacks live in lib/__qa__/reviewer-journey/security-owasp.js
 * and the database ones in supabase/migrations/__qa__/owasp-hardening.probe.sql.
 */
import { readFileSync, existsSync, readdirSync } from 'fs'
import { join } from 'path'
import { authorizeCronRequest } from '../auth/cron'
import { sanitizePublicArticleHtml, jsonForScriptTag } from '../content/public-article-html'
import { buildSignupNotificationHtml, escapeEmailHtml, isFreshSignup } from '../notifications/signup-email'

let pass = 0
let fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

function main() {
  console.log('A02 — cron authorization fails closed')
  const req = (auth?: string) => new Request('http://x/api/schedule', { headers: auth ? { authorization: auth } : {} })
  const saved = process.env.CRON_SECRET
  delete process.env.CRON_SECRET
  const silence = console.error
  console.error = () => {}
  check('unset secret → 503, even with a bearer', authorizeCronRequest(req('Bearer undefined'), 'qa')?.status === 503)
  check('unset secret → 503 with no header', authorizeCronRequest(req(), 'qa')?.status === 503)
  console.error = silence
  process.env.CRON_SECRET = 's3cret'
  check('missing header → 401', authorizeCronRequest(req(), 'qa')?.status === 401)
  check('wrong secret → 401', authorizeCronRequest(req('Bearer nope'), 'qa')?.status === 401)
  check('secret without Bearer prefix → 401', authorizeCronRequest(req('s3cret'), 'qa')?.status === 401)
  check('right secret → authorized (null)', authorizeCronRequest(req('Bearer s3cret'), 'qa') === null)
  if (saved === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = saved

  // Every cron route goes through the helper; the old fail-open shape is gone.
  const failOpen = /if \(cronSecret\) \{/
  for (const f of ['app/api/schedule/route.ts', 'app/api/content/automation/cron/route.ts', 'app/api/gsc/sync/cron/route.ts']) {
    const src = strip(read(f))
    check(`${f} uses authorizeCronRequest and has no fail-open branch`, /authorizeCronRequest\(/.test(src) && !failOpen.test(src))
  }
  check('MUTATION CONTROL: the fail-open guard matches the vulnerable shape',
    failOpen.test("const cronSecret = process.env.CRON_SECRET\n  if (cronSecret) {\n    if (a !== b) return x\n  }"))

  console.log('A05 — public article HTML')
  const attack = '<p>hi</p><img src=x onerror="alert(1)"><script>alert(2)</script><a href="javascript:alert(3)">j</a>'
    + '<iframe src="https://evil.example"></iframe><svg onload="alert(4)"></svg><a href="data:text/html,x">d</a>'
    + '<div onclick="x()" style="color:red" class="c">ok</div>'
  const out = sanitizePublicArticleHtml(attack)
  check('removes event handlers', !/on(error|load|click)\s*=/i.test(out), out)
  check('removes <script>, <iframe>, <svg>', !/<(script|iframe|svg)/i.test(out), out)
  check('removes javascript: and data: URLs', !/javascript:|data:text/i.test(out), out)
  check('keeps paragraph text, class and inline style', /<p>hi<\/p>/.test(out) && /class="c"/.test(out) && /style="color:red"/.test(out), out)
  const table = '<table class="comparison-table"><thead><tr><th scope="col">A</th></tr></thead><tbody><tr><td colspan="2">B</td></tr></tbody></table>'
  check('keeps the table markup published articles use', sanitizePublicArticleHtml(table) === table, sanitizePublicArticleHtml(table))
  check('MUTATION CONTROL: the raw attack does contain every vector', /onerror/.test(attack) && /<script/.test(attack) && /javascript:/.test(attack))
  check('non-string content renders as empty', sanitizePublicArticleHtml(null) === '' && sanitizePublicArticleHtml(42) === '')

  const ld = jsonForScriptTag({ headline: 'x</script><script>alert(1)</script>' })
  check('JSON-LD cannot close its <script> tag', !/<\/script/i.test(ld) && !/</.test(ld), ld)
  check('JSON-LD still parses to the same value', JSON.parse(ld).headline === 'x</script><script>alert(1)</script>')
  check('MUTATION CONTROL: plain JSON.stringify does break out', /<\/script/.test(JSON.stringify({ h: '</script>' })))
  // Every language's blog, not only the Hebrew one: the article page is now
  // one component (components/public/articles/ArticleView) behind four thin
  // routes, and a layout that emitted raw JSON.stringify in ONE of the four
  // would be an injection point the Hebrew-only check could not see.
  for (const dir of ['articles', 'en/articles', 'es/articles', 'pt-BR/articles']) {
    const layout = strip(read(`app/(public)/${dir}/[slug]/layout.tsx`))
    check(`${dir}: article layout emits JSON-LD only through jsonForScriptTag`,
      /jsonForScriptTag\(/.test(layout) && !/__html:\s*JSON\.stringify/.test(layout))
    // The listing's own JSON-LD moved out of this layout and into the index
    // component: a layout wraps its whole segment, so from here it was also
    // rendered on every article page. What matters for injection is unchanged
    // and checked below — a layout that emits no __html cannot be the hole.
    const indexLayout = strip(read(`app/(public)/${dir}/layout.tsx`))
    check(`${dir}: listing layout emits no raw JSON-LD`, !/__html:/.test(indexLayout))
  }
  const indexSrc = strip(read('components/public/articles/ArticlesIndex.tsx'))
  check('articles index emits JSON-LD only through jsonForScriptTag',
    /jsonForScriptTag\(/.test(indexSrc) && !/__html:\s*JSON\.stringify/.test(indexSrc))
  const pageSrc = strip(read('components/public/articles/ArticleView.tsx'))
  check('article page sanitizes before rendering and never parses with innerHTML =',
    /sanitizePublicArticleHtml\(article\.content\)/.test(pageSrc) && !/\.innerHTML\s*=\s*article\.content/.test(pageSrc))
  const publish = strip(read('app/api/publish-article/route.ts'))
  check('publish-article sanitizes on write and compares the token in constant time',
    /content:\s*sanitizePublicArticleHtml\(body\.content\)/.test(publish) && /timingSafeEqual/.test(publish) && !/authHeader !== `Bearer/.test(publish))

  console.log('A01/A05 — signup notification')
  const html = buildSignupNotificationHtml(
    { email: 'a@b.c', user_metadata: { full_name: '<a href="https://evil.example">click</a>', company_name: '"><img src=x onerror=1>', phone: '' } },
    new Date('2026-01-01T00:00:00Z'))
  check('metadata is HTML-escaped into the operator e-mail', !/<a href|<img/.test(html) && /&lt;a href=&quot;/.test(html), html)
  check('escapeEmailHtml escapes all five characters', escapeEmailHtml(`<>&"'`) === '&lt;&gt;&amp;&quot;&#39;')
  check('fresh signup: created 1 minute ago', isFreshSignup({ created_at: new Date(Date.now() - 60000).toISOString() }))
  check('not fresh: created 6 days ago', !isFreshSignup({ created_at: new Date(Date.now() - 6 * 86400000).toISOString() }))
  check('not fresh: unparseable date', !isFreshSignup({ created_at: 'nope' }))
  const emailRoute = strip(read('app/api/send-notification-email/route.ts'))
  check('send-notification-email takes no request and requires a session',
    /export async function POST\(\)/.test(emailRoute) && /auth\.getUser\(\)/.test(emailRoute) && /status: 401/.test(emailRoute))

  console.log('A01/A07 — authentication')
  const trial = strip(read('app/api/auth/create-trial/route.ts'))
  check('create-trial takes no request (no body to forge) and requires a session',
    /export async function POST\(\)/.test(trial) && /auth\.getUser\(\)/.test(trial) && /status: 401/.test(trial))
  check('create-trial never updates an existing subscription', !/\.update\(/.test(trial))
  check('MUTATION CONTROL: the old route shape is caught', /\.update\(/.test("admin.from('subscriptions').update({ status: 'trial' })"))
  const cb = strip(read('app/api/auth/callback/route.ts'))
  check('auth callback has no password bridge', !/signInWithPassword|updateUserById|createUser\(|google_\$\{/.test(cb))
  check('auth callback sanitizes next', /sanitizeNextPath\(searchParams\.get\('next'\)\)/.test(cb))
  for (const f of ['app/api/debug-env/route.ts', 'app/api/debug-scan/route.ts', 'app/api/debug-oauth-flow/route.ts',
    'app/api/get-oauth-config/route.ts', 'lib/google-oauth.ts']) {
    check(`${f} is removed`, !existsSync(join(ROOT, f)))
  }

  console.log('A01 — authorization before work')
  const before = (src: string, gate: RegExp, work: RegExp) => {
    const g = src.search(gate), w = src.search(work)
    return g >= 0 && w >= 0 && g < w
  }
  const logs = strip(read('app/api/setup/logs/route.ts'))
  check('setup/logs checks admin before the service-role read', before(logs, /requireAdminApi\(\)/, /createAdminClient\(\)/))
  check('MUTATION CONTROL: ordering guard fails when the gate comes after the work',
    !before('const a = createAdminClient()\nconst g = await requireAdminApi()', /requireAdminApi\(\)/, /createAdminClient\(\)/))
  for (const f of ['app/api/setup/status/route.ts', 'app/api/setup/test-scan/route.ts']) {
    const s = strip(read(f))
    check(`${f} is admin-gated unless Supabase is unconfigured`, /if \(!isSupabaseUnconfigured\(\)\) \{\s*const gate = await requireAdminApi\(\)/.test(s))
  }
  const scan = strip(read('app/api/scan/route.ts'))
  check('scan checks project ownership before the single-flight claim',
    before(scan, /ownerId !== user\.id/, /claimOperation\(/))
  check('scan no longer takes triggeredBy from the body', !/triggeredBy\s*=\s*'manual'\s*\}\s*=\s*body/.test(scan) && /const triggeredBy = 'manual'/.test(scan))
  const permissive = /if \(ownerId && ownerId !== user\.id\)/
  for (const f of ['app/api/projects/[id]/ai-profile/route.ts', 'app/api/projects/[id]/ai-visibility/competitors/route.ts',
    'app/api/projects/[id]/ai-visibility/competitors/[cid]/route.ts', 'app/api/projects/[id]/ai-visibility/timeline-summary/route.ts',
    'app/api/projects/[id]/ai-visibility/competitor-analysis/route.ts']) {
    const s = strip(read(f))
    check(`${f}: ownerless project is refused`, !permissive.test(s) && /if \(ownerId !== user\.id\)/.test(s))
  }
  check('MUTATION CONTROL: the permissive owner check is recognised', permissive.test('if (ownerId && ownerId !== user.id) {'))
  const tt = strip(read('app/actions/tracking-targets.ts'))
  check('both keyword-create actions assert project ownership before inserting',
    (tt.match(/await assertOwnedProject\(supabase, user\.id, projectId(?:, m)?\)/g) || []).length === 2)
  const dbg = strip(read('app/api/google-ads/debug-customers/route.ts'))
  check('google-ads/debug-customers is admin-only', /isAdminUser\(createAdminClient\(\), user\.id\)/.test(dbg))

  console.log('A04/A09 — secrets')
  const pdf = strip(read('app/api/reports/export-pdf/route.ts'))
  const logCall = pdf.slice(pdf.indexOf("console.log('[PDFShift Request]'"), pdf.indexOf("console.log('[PDFShift Request]'") + 300)
  check('PDFShift request log does not include the API-key headers', logCall.length > 0 && !/headers:\s*requestHeaders/.test(logCall), logCall)
  const wp = strip(read('app/api/wordpress/test-connection/route.ts'))
  check('stored WordPress password is only sent to the stored site', /if \(!sameSiteOrigin\(siteUrl, loaded\.creds\.siteUrl\)\)/.test(wp))

  console.log('A10 — no raw database/provider messages in API responses')
  const offenders: string[] = []
  const walk = (dir: string) => {
    for (const e of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
      const p = `${dir}/${e.name}`
      if (e.isDirectory()) { if (e.name !== '__qa__') walk(p) } else if (e.name === 'route.ts') {
        const s = strip(read(p))
        const re = /error:\s*(`[^`]*\$\{[^}]*(\.message|errorMsg)[^}]*\}[^`]*`|[a-zA-Z]+\.message\b)/g
        let m: RegExpExecArray | null
        while ((m = re.exec(s))) {
          const line = s.slice(s.lastIndexOf('\n', m.index) + 1, s.indexOf('\n', m.index))
          if (!/console\./.test(line)) offenders.push(`${p}: ${line.trim().slice(0, 90)}`)
        }
      }
    }
  }
  walk('app/api')
  check('no API route returns error.message to the client', offenders.length === 0, offenders.join('\n      '))

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}
main()
export {}
