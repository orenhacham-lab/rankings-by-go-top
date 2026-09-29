/**
 * THE LINKS TAB ("קישורים לאתר"): the guards.
 *
 *   A  classification rules — fixtures from the kinds of pages the project's
 *      stored searches and AI citations really contain; each rule has a
 *      mutation control (the same fixtures on a broken copy of the rules fail).
 *   B  opportunities model — self excluded, competitors marked and last, local
 *      chip, evidence merged, unsafe addresses never become links.
 *   C  safe external links — only http(s) survives safeExternalUrl; the only
 *      <a> on the tab is ExternalLink, which re-checks; mutation controls.
 *   D  owner filter — the route answers 404 for another owner's project and
 *      reads only the verified project; every service-role read is filtered by
 *      project and (where the table has it) owner; read-only. Mutation controls.
 *   E  internal links model — out/in counts, waiting planned links, orphan pages.
 *   F  i18n completeness — he and en have the same keys, arrays and functions;
 *      Hebrew in he, none in en; the sidebar label exists in both. Mutation controls.
 *   G  shell — sidebar entry, icon not a chain link, the page exists, tab title.
 *
 * Run: npx tsx lib/site-links/__qa__/site-links.qa.ts
 */
/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */
import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'fs'
import { join } from 'path'
import { classifyPage, isCompetitorDomain } from '../classify'
import { buildInternalLinks, buildOpportunities, safeExternalUrl } from '../model'
import { handleSiteLinksGet, type SiteLinksDeps } from '../http'
import { encodeBriefNotes } from '../../content/brief-notes'
import { FakeAdmin } from '../../__qa__/_fake-admin'
import { dashboardHe } from '../../i18n/dashboard/he'
import { dashboardEn } from '../../i18n/dashboard/en'
import { pageTitle } from '../../shell/page-title'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1')

let mutantSeq = 0
/** Load a MUTATED copy of a module under lib/site-links (same folder, so its imports resolve), then remove it. */
function withMutant<T>(rel: string, mutate: (src: string) => string, apply: (mod: any) => T): T {
  const src = read(rel)
  const out = mutate(src)
  if (out === src) throw new Error(`mutation of ${rel} changed nothing`)
  // A fresh name each time: require() caches by path.
  const file = join(ROOT, rel.replace(/([^/]+)\.ts$/, `.mutant-${process.pid}-${++mutantSeq}-$1.ts`))
  writeFileSync(file, out)
  try { return apply(require(file)) } finally { try { unlinkSync(file) } catch { /* already gone */ } }
}

const SELF = ['go-top.co.il']

// ── A. classification rules ─────────────────────────────────────────────────
type Fixture = { name: string; page: { domain: string; url?: string; title?: string }; want: string }
const FIXTURES: Fixture[] = [
  { name: 'Dapei Zahav (d.co.il) is a directory', page: { domain: 'www.d.co.il', url: 'https://www.d.co.il/12006740/17520/', title: 'עסק - טלפון, שעות פתיחה' }, want: 'directory:known_directory' },
  { name: 'easy.co.il "Best in …" stays a directory (known directory wins)', page: { domain: 'easy.co.il', url: 'https://easy.co.il/en/list/Cosmetics', title: 'Best in Rishon Lezion - Shopping' }, want: 'directory:known_directory' },
  { name: 'pro.co.il is a directory', page: { domain: 'www.pro.co.il', title: 'חברת ניקיון בגבעתיים » 17 חברות ניקיון מומלצות' }, want: 'directory:known_directory' },
  { name: 'tripadvisor is a directory', page: { domain: 'tripadvisor.co.il', title: '10 הכי טובים: חנויות מתנות' }, want: 'directory:known_directory' },
  { name: '"סקירת 7 הליכונים מומלצים" on a review site is a listicle', page: { domain: 'finder.co.il', title: 'הליכון: סקירת 7 הליכונים מומלצים לשנת 2026' }, want: 'listicle:best_of_title' },
  { name: '"6 חנויות יד שנייה מומלצות" is a listicle', page: { domain: 'atmag.co.il', title: '6 חנויות יד שנייה מומלצות. וגם: למה הפסקתי' }, want: 'listicle:best_of_title' },
  { name: '"5 חנויות וינטג\'" is a numbered list', page: { domain: 'timeout.co.il', title: "5 חנויות וינטג' ויד שנייה אונליין שאתן חייבות להכיר" }, want: 'listicle:top_n_title' },
  { name: '"Best plumbers in Austin" is a listicle', page: { domain: 'austinguide.com', title: 'Best plumbers in Austin (2026)' }, want: 'listicle:best_of_title' },
  { name: '"Top 10" is a listicle', page: { domain: 'someblog.com', title: 'Top 10 yoga studios in Tel Aviv' }, want: 'listicle:best_of_title' },
  { name: 'a Hebrew "המומלצים" address (percent-encoded) is a listicle', page: { domain: 'blog.example.com', url: `https://blog.example.com/${encodeURIComponent('מאמנים-אישיים-המומלצים')}`, title: 'מאמנים אישיים' }, want: 'listicle:best_of_address' },
  { name: 'a store guide "איך לבחור מזרן יוגה מומלץ?" is not a list', page: { domain: 'yogastore.co.il', title: 'איך לבחור מזרן יוגה מומלץ?' }, want: 'none' },
  { name: '"ב-7 שלבים" is a how-to, not a list', page: { domain: 'alma-wellness.co.il', title: 'איך לבחור מזרן יוגה מנצח ב-7 שלבים' }, want: 'none' },
  { name: '"פתוח 24 שעות" is not a list', page: { domain: 'locksmith.co.il', title: 'מנעולן בתל אביב - פתוח 24 שעות' }, want: 'none' },
  { name: '"Open 24 hours" is not a list', page: { domain: 'plumber.com', title: 'Emergency plumber open 24 hours' }, want: 'none' },
  { name: '"best" in a host name is not a list (only the path and query are read)', page: { domain: 'best-plumber.com', url: 'https://best-plumber.com/contact', title: 'Plumber' }, want: 'none' },
  { name: 'an association by domain', page: { domain: 'igud-hashmalaim.org.il', title: 'ראשי' }, want: 'association:association_pattern' },
  { name: 'an association by title', page: { domain: 'cpa.org.il', title: 'לשכת רואי החשבון בישראל' }, want: 'association:association_pattern' },
  { name: 'known media', page: { domain: 'www.ynet.co.il', title: 'כתבה' }, want: 'media:known_media' },
  { name: 'a news-shaped domain', page: { domain: 'news.example.com', title: 'Local story' }, want: 'media:media_pattern' },
  { name: 'a directory-shaped domain', page: { domain: 'bizdirectory.co.il' }, want: 'directory:directory_pattern' },
  { name: 'a bare search domain of a store is nothing', page: { domain: 'decathlon.co.il' }, want: 'none' },
  { name: 'notd.co.il is not d.co.il (no substring match)', page: { domain: 'notd.co.il' }, want: 'none' },
  { name: 'Facebook is a platform', page: { domain: 'www.facebook.com', title: 'Best shops group' }, want: 'excluded:platform' },
  { name: 'google.co.il is a platform', page: { domain: 'google.co.il' }, want: 'excluded:platform' },
  { name: 'bingapis is a platform', page: { domain: 'services.bingapis.com' }, want: 'excluded:platform' },
  { name: 'Amazon "Best Yoga Mats" is a marketplace, not a list', page: { domain: 'amazon.com', title: 'Best Yoga Mats' }, want: 'excluded:platform' },
  { name: 'the project\'s own site is excluded', page: { domain: 'www.go-top.co.il', title: 'הכי טובים' }, want: 'excluded:self' },
  { name: 'a subdomain of the project\'s site is excluded', page: { domain: 'blog.go-top.co.il', title: 'Top 10' }, want: 'excluded:self' },
]
function verdictKey(v: ReturnType<typeof classifyPage>): string {
  return v.kind === 'opportunity' ? `${v.category}:${v.reason}` : v.kind === 'excluded' ? `excluded:${v.why}` : 'none'
}
function runFixtures(classify: typeof classifyPage): string[] {
  const wrong: string[] = []
  for (const f of FIXTURES) {
    const got = verdictKey(classify(f.page, SELF))
    if (got !== f.want) wrong.push(`${f.name}: got ${got}, want ${f.want}`)
  }
  return wrong
}
console.log('\nA. classification rules')
{
  const wrong = runFixtures(classifyPage)
  for (const f of FIXTURES) {
    const got = verdictKey(classifyPage(f.page, SELF))
    check(f.name, got === f.want, `got ${got}`)
  }
  check('competitors match either way round (sub.x.com ~ x.com), never by substring',
    isCompetitorDomain('shop.rival.co.il', ['rival.co.il']) && isCompetitorDomain('rival.co.il', ['www.rival.co.il']) && !isCompetitorDomain('notrival.co.il', ['rival.co.il']))
  void wrong
  // Mutation controls: each rule, broken on purpose, must make a fixture fail.
  const mutants: [string, (s: string) => string][] = [
    ['drop d.co.il from the directory list', (s) => s.replace("'d.co.il', ", '')],
    ['drop "שעות" from the not-a-list words', (s) => s.replace("'שעות', ", '')],
    ['let "best" anywhere in the host count', (s) => s.replace(".replace(/^[a-z][a-z0-9+.-]*:\\/\\/[^/]*/i, '')", '')],
    ['platforms no longer excluded', (s) => s.replace('if (matchesAny(domain, PLATFORMS) || GOOGLE.test(domain)) return', 'if (false) return')],
    ['own site no longer excluded', (s) => s.replace("return { kind: 'excluded', why: 'self' }", "void 0")],
    ['substring domain match', (s) => s.replace("return domain === of || domain.endsWith(`.${of}`)", 'return domain.endsWith(of)')],
    ['listicle tested before directories', (s) => s.replace("  if (matchesAny(domain, KNOWN_DIRECTORIES)) return { kind: 'opportunity', category: 'directory', reason: 'known_directory' }\n", '').replace("  if (ASSOCIATION_DOMAIN.test(domain)", "  if (matchesAny(domain, KNOWN_DIRECTORIES)) return { kind: 'opportunity', category: 'directory', reason: 'known_directory' }\n  if (ASSOCIATION_DOMAIN.test(domain)")],
  ]
  for (const [name, m] of mutants) {
    const broken = withMutant('lib/site-links/classify.ts', m, (mod) => runFixtures(mod.classifyPage))
    check(`MUTATION CONTROL: ${name} → the fixtures catch it`, broken.length > 0, 'no fixture failed')
  }
}

// ── B. opportunities model ──────────────────────────────────────────────────
console.log('\nB. opportunities model')
{
  const items = buildOpportunities({
    searches: [{ query: 'חנות בשמים ראשון לציון', domains: ['blendo.co.il', 'd.co.il', 'go-top.co.il', 'facebook.com', 'b144.co.il'] }],
    citations: [
      { url: 'https://www.d.co.il/123/', domain: 'd.co.il', title: 'בשמים בראשון לציון - דפי זהב', question: 'איפה קונים בושם בראשון לציון?' },
      { url: 'javascript:alert(1)', domain: 'finder.co.il', title: '10 חנויות בשמים מומלצות', question: 'חנות בשמים מומלצת' },
      { url: 'https://rival.co.il/best-perfumes', domain: 'rival.co.il', title: 'הבשמים הכי טובים', question: 'q' },
      { url: 'https://www.instagram.com/x', domain: 'instagram.com', title: 'Best perfumes', question: 'q' },
    ],
    selfDomains: ['go-top.co.il'],
    competitors: ['rival.co.il'],
    city: 'ראשון לציון',
  })
  const by = new Map(items.map((o) => [o.domain, o]))
  check('own site, platforms and plain stores are not on the list', !by.has('go-top.co.il') && !by.has('facebook.com') && !by.has('instagram.com') && !by.has('blendo.co.il'))
  check('Google evidence carries the query and the 1-based place', by.get('d.co.il')?.searches[0]?.rank === 2 && by.get('d.co.il')?.searches[0]?.query === 'חנות בשמים ראשון לציון')
  check('AI evidence carries the question', by.get('d.co.il')?.questions[0] === 'איפה קונים בושם בראשון לציון?')
  check('one row per domain, evidence merged', items.filter((o) => o.domain === 'd.co.il').length === 1)
  check('a page mentioning the project\'s city is local', by.get('d.co.il')?.isLocal === true && by.get('b144.co.il')?.isLocal === false)
  check('a javascript: address is kept as text, never as a link', by.get('finder.co.il')?.pages[0]?.url === null && by.get('finder.co.il')?.pages[0]?.title === '10 חנויות בשמים מומלצות')
  check('a competitor is on the list ONLY marked as a competitor', by.get('rival.co.il')?.isCompetitor === true)
  check('competitors come last', items[items.length - 1]?.domain === 'rival.co.il')
}

// ── C. safe external links ──────────────────────────────────────────────────
console.log('\nC. safe external links')
{
  const bad = ['javascript:alert(1)', 'JAVASCRIPT:alert(1)', ' data:text/html,x', '/relative/path', '//evil.com/x', 'https://user:pw@evil.com/', 'ftp://x.com/', 'https://localhost/', 'mailto:a@b.com', 'https://', '', 'http://1.2.3.4/']
  const good = ['https://www.d.co.il/12/', 'http://example.com/a?b=1', `https://blog.example.com/${encodeURIComponent('המומלצים')}`]
  const accepts = (fn: typeof safeExternalUrl) => ({ badAccepted: bad.filter((u) => fn(u) !== null), goodRejected: good.filter((u) => fn(u) === null) })
  const r = accepts(safeExternalUrl)
  check('only absolute http(s) addresses with a real host survive', r.badAccepted.length === 0 && r.goodRejected.length === 0, JSON.stringify(r))
  const m = withMutant('lib/site-links/model.ts', (s) => s
    .replace("if (!raw || raw.length > 2048 || !/^https?:\\/\\//i.test(raw)) return null", 'if (!raw) return null')
    .replace("if (u.protocol !== 'http:' && u.protocol !== 'https:') return null", ''), (mod) => accepts(mod.safeExternalUrl))
  check('MUTATION CONTROL: without the scheme checks javascript:/ftp: get through → caught', m.badAccepted.length > 0)

  const files = ['components/site-links/SiteLinksView.tsx', 'components/site-links/OpportunityList.tsx', 'components/site-links/InternalLinksSection.tsx',
    'components/site-links/ProgressCard.tsx', 'components/site-links/PolicyNote.tsx', 'components/site-links/LinkButton.tsx', 'app/(dashboard)/site-links/page.tsx']
  const rawAnchors = (src: string) => /<a[\s>]/.test(strip(src))
  const hrefProps = (src: string) => [...strip(src).matchAll(/\bhref=\{([^}]*)\}|\bhref="([^"]*)"/g)].map((x) => (x[1] ?? x[2] ?? '').trim())
  // An href on the tab is ExternalLink's (checked there) or an in-app path starting with "/".
  const unsafeHref = (src: string) => hrefProps(src).filter((h) => !(/^\//.test(h) || /^`\//.test(h) || h === 'href' || /^GOOGLE_LINK_SPAM_POLICY$/.test(h) || /^p\.url$/.test(h)))
  const guard = (srcs: Record<string, string>) => {
    const problems: string[] = []
    for (const [f, src] of Object.entries(srcs)) {
      if (rawAnchors(src)) problems.push(`${f}: a raw <a>`)
      for (const h of unsafeHref(src)) problems.push(`${f}: href={${h}}`)
      // Every ExternalLink href is a stored address, the policy constant, or nothing else.
    }
    return problems
  }
  const srcs = Object.fromEntries(files.map((f) => [f, read(f)]))
  const problems = guard(srcs)
  check('no raw <a> and no unchecked href outside ExternalLink', problems.length === 0, problems.join('; '))
  const ext = strip(read('components/site-links/ExternalLink.tsx'))
  check('ExternalLink re-checks the address and opens with noopener noreferrer',
    /const safe = safeExternalUrl\(href\)/.test(ext) && /href=\{safe\}/.test(ext) && /rel="noopener noreferrer"/.test(ext) && /if \(!safe\) return <span/.test(ext))
  const broken = { ...srcs, 'components/site-links/OpportunityList.tsx': srcs['components/site-links/OpportunityList.tsx'].replace('<ExternalLink href={p.url}', '<a href={p.url} target="_blank"') }
  check('MUTATION CONTROL: a raw <a href={p.url}> in the list → caught', guard(broken).length > 0)
  check('the policy link is Google\'s own spam policy page', /GOOGLE_LINK_SPAM_POLICY = 'https:\/\/developers\.google\.com\/search\/docs\/essentials\/spam-policies#link-spam'/.test(read('components/site-links/PolicyNote.tsx')))
}

// ── D. owner filter (the route) ─────────────────────────────────────────────
console.log('\nD. owner filter')
const OWNER = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'
const P_OWN = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const P_OTHER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
function fixtureDb() {
  return new FakeAdmin({
    projects: [
      { id: P_OWN, user_id: OWNER, target_domain: 'go-top.co.il', domain_aliases: [], city: 'גבעתיים' },
      { id: P_OTHER, user_id: OTHER, target_domain: 'other.co.il', domain_aliases: [], city: null },
    ],
    tracking_targets: [{ id: 't1', project_id: P_OWN, user_id: OWNER, keyword: 'קידום אתרים' }],
    ai_citations: [
      { project_id: P_OWN, url: 'https://www.d.co.il/1/', domain: 'd.co.il', title: 'קידום אתרים גבעתיים', prompt_id: 'p1', is_target_domain: false, created_at: '2026-09-01' },
      { project_id: P_OTHER, url: 'https://www.b144.co.il/secret/', domain: 'b144.co.il', title: 'OTHER-TENANT', prompt_id: 'p2', is_target_domain: false, created_at: '2026-09-01' },
    ],
    ai_prompts: [{ id: 'p1', project_id: P_OWN, prompt: 'מי עושה קידום אתרים בגבעתיים?' }, { id: 'p2', project_id: P_OTHER, prompt: 'OTHER-QUESTION' }],
    generated_articles: [
      { id: 'a1', project_id: P_OWN, user_id: OWNER, title: 'מאמר שלי', status: 'published', content_html: '<p>x</p>', wp_post_url: 'https://go-top.co.il/a1/', shopify_article_url: null, topic_id: null, created_at: '2026-09-01' },
      { id: 'a2', project_id: P_OWN, user_id: OTHER, title: 'OTHER-ARTICLE', status: 'draft', content_html: '', wp_post_url: null, shopify_article_url: null, topic_id: null, created_at: '2026-09-01' },
    ],
    ai_visibility_competitors: [], project_seed_runs: [], project_seed_steps: [], wordpress_content_index: [], site_crawl_index: [], article_topics: [],
  })
}
const deps = (userId: string | null, db: FakeAdmin, content = true): SiteLinksDeps => ({
  session: async () => ({ userId }), admin: () => db as any, env: { ENABLE_CONTENT: content ? 'true' : 'false' },
})
async function partD() {
  const own = await handleSiteLinksGet(P_OWN, deps(OWNER, fixtureDb()))
  const body = await own.json() as any
  check('the owner gets their project (200)', own.status === 200 && body.ok === true)
  const text = JSON.stringify(body)
  check('another tenant\'s citations, questions and articles never leak', !/OTHER-TENANT|OTHER-QUESTION|OTHER-ARTICLE|b144/.test(text))
  check('the owner\'s own citation is there, with its question', body.opportunities.data.some((o: any) => o.domain === 'd.co.il' && o.questions[0] === 'מי עושה קידום אתרים בגבעתיים?'))
  const foreign = await handleSiteLinksGet(P_OTHER, deps(OWNER, fixtureDb()))
  check('another owner\'s project is a 404 (not 403: nothing to learn)', foreign.status === 404)
  check('no session is a 401', (await handleSiteLinksGet(P_OWN, deps(null, fixtureDb()))).status === 401)
  check('a malformed id is a 404 before any read', (await handleSiteLinksGet('../x', deps(OWNER, fixtureDb()))).status === 404)
  const off = await (await handleSiteLinksGet(P_OWN, deps(OWNER, fixtureDb(), false))).json() as any
  check('with the content module off, internal links are "disabled"', off.internal.state === 'disabled')

  // Mutation control: the project read without its owner filter lets anyone in.
  const leaked = await withMutant('lib/site-links/http.ts', (s) => s.replace(".eq('id', projectId).eq('user_id', userId).limit(1))", ".eq('id', projectId).limit(1))").replace('if (!project || project.user_id !== userId) return', 'if (!project) return'),
    async (mod) => (await mod.handleSiteLinksGet(P_OTHER, deps(OWNER, fixtureDb()))).status)
  check('MUTATION CONTROL: project read without the owner filter → another owner\'s project opens → caught', leaked === 200)

  // Source guard: every service-role read is filtered by the project, and by the owner where the table has user_id.
  const OWNER_TABLES = ['tracking_targets', 'ai_visibility_competitors', 'project_seed_runs', 'project_seed_steps', 'generated_articles', 'wordpress_content_index', 'site_crawl_index', 'article_topics']
  const PROJECT_ONLY = ['ai_citations', 'ai_prompts']
  const audit = (src: string) => {
    const s = strip(src)
    const problems: string[] = []
    // One read = from its .from('table') up to the next .from( (or the end), at most 600 characters.
    const starts = [...s.matchAll(/\.from\('([a-z_]+)'\)/g)]
    const reads = starts.map((m, i) => [m[0], m[1], s.slice(m.index! + m[0].length, Math.min(starts[i + 1]?.index ?? s.length, m.index! + 600))])
    const tables = new Set<string>()
    for (const r of reads) {
      const table = r[1], chain = r[2]
      tables.add(table)
      if (table === 'projects') {
        if (!/\.eq\('id', projectId\)\.eq\('user_id', userId\)/.test(chain)) problems.push('projects without the owner filter')
        continue
      }
      if (!/\.eq\('project_id', (pid|project\.id)\)/.test(chain)) problems.push(`${table} without the project filter`)
      if (OWNER_TABLES.includes(table) && !/\.eq\('user_id', userId\)/.test(chain)) problems.push(`${table} without the owner filter`)
      if (!OWNER_TABLES.includes(table) && !PROJECT_ONLY.includes(table)) problems.push(`${table} is not a known table of this route`)
      if (/\.(insert|update|upsert|delete)\(/.test(chain)) problems.push(`${table} is written`)
    }
    if (/\.(insert|update|upsert|delete)\(/.test(s)) problems.push('the route writes')
    return { problems, tables }
  }
  const src = read('lib/site-links/http.ts')
  const a = audit(src)
  check('every read of the route is filtered by project (and owner where the table has it), and nothing is written', a.problems.length === 0 && a.tables.size >= 11, `${a.problems.join('; ')} (${a.tables.size} tables)`)
  const b = audit(src.replace("db.from('generated_articles')\n      .select('id, title, status, content_html, wp_post_url, shopify_article_url, topic_id')\n      .eq('project_id', pid).eq('user_id', userId)", "db.from('generated_articles')\n      .select('id, title, status, content_html, wp_post_url, shopify_article_url, topic_id')\n      .eq('project_id', pid)"))
  check('MUTATION CONTROL: generated_articles without the owner filter → caught', b.problems.some((p) => p.includes('generated_articles without the owner filter')))
  const c = audit(src.replace(".eq('project_id', pid).eq('is_target_domain', false)", ".eq('is_target_domain', false)"))
  check('MUTATION CONTROL: ai_citations without the project filter → caught', c.problems.some((p) => p.includes('ai_citations without the project filter')))
  const d = audit(src + "\nvoid db.from('generated_articles').update({ x: 1 })")
  check('MUTATION CONTROL: a write from the route → caught', d.problems.length > 0)
}

// ── E. internal links model ─────────────────────────────────────────────────
function partE() {
  console.log('\nE. internal links model')
  const planned = encodeBriefNotes('', {
    includeBrandName: false, brandNameToInclude: '', includeManualToc: false, cta: { text: '', phone: '', whatsapp: '', url: '' }, articleDepth: 'auto',
    internalLinks: [
      { targetId: 'x', targetUrl: 'https://go-top.co.il/services/', targetTitle: 'שירותים', anchorText: 'השירותים שלנו', source: 'primary_keyword' },
      { targetId: 'y', targetUrl: 'https://go-top.co.il/b/', targetTitle: 'מאמר ב', anchorText: 'מאמר ב', source: 'primary_keyword' },
    ],
  } as any)
  const input = {
    hosts: ['go-top.co.il'],
    topics: [{ id: 'tA', brief_notes: planned }],
    articles: [
      { id: 'A', title: 'מאמר א', status: 'published', topic_id: 'tA', wp_post_url: 'https://go-top.co.il/a/', shopify_article_url: null,
        content_html: '<p><a href="https://www.go-top.co.il/b/">ב</a> <a href="/about">about</a> <a href="https://go-top.co.il/a/">self</a> <a href="https://ynet.co.il/x">ext</a> <a href="#top">t</a></p>' },
      { id: 'B', title: 'מאמר ב', status: 'published', topic_id: null, wp_post_url: 'https://go-top.co.il/b/', shopify_article_url: null, content_html: '<p><a href="https://go-top.co.il/a">א</a></p>' },
      { id: 'C', title: 'טיוטה', status: 'draft', topic_id: null, wp_post_url: null, shopify_article_url: null, content_html: '<a href="https://go-top.co.il/a">a</a>' },
    ],
    indexTargets: [
      { targetUrl: 'https://go-top.co.il/lonely/', targetTitle: 'עמוד בודד', inboundLinkCount: 0, eligibility: 'yes' },
      { targetUrl: 'https://go-top.co.il/cart/', targetTitle: 'עגלה', inboundLinkCount: 0, eligibility: 'no' },
      { targetUrl: 'https://go-top.co.il/hub/', targetTitle: 'hub', inboundLinkCount: 4, eligibility: 'yes' },
      { targetUrl: 'javascript:alert(1)', targetTitle: 'bad', inboundLinkCount: 0, eligibility: 'yes' },
    ],
  }
  const view = buildInternalLinks(input)
  const A = view.articles.find((a) => a.id === 'A')!, B = view.articles.find((a) => a.id === 'B')!, C = view.articles.find((a) => a.id === 'C')!
  check('links out count distinct own-site pages (www/relative collapse; self, external and #hash excluded)', A.linksOut === 2, String(A.linksOut))
  check('links in count PUBLISHED articles linking to the live address (with or without slash); a draft\'s link does not count yet', A.linksIn === 1 && B.linksIn === 1, `${A.linksIn}/${B.linksIn}`)
  const mutantIn = withMutant('lib/site-links/model.ts', (src) => src.replace('o.article.id !== a.id && o.live && ', 'o.article.id !== a.id && '),
    (mod) => mod.buildInternalLinks(input).articles.find((x: any) => x.id === 'A').linksIn)
  check('MUTATION CONTROL: counting a draft\'s links as incoming → caught', mutantIn !== 1, String(mutantIn))
  check('a draft has no live address, so "links in" is unknown (null), not 0', C.linksIn === null && C.liveUrl === null)
  check('a planned link already in the text is not "waiting"; one missing is', A.pending.length === 1 && A.pending[0].anchorText === 'השירותים שלנו' && A.pending[0].targetUrl === 'https://go-top.co.il/services/', JSON.stringify(A.pending))
  check('orphan pages: eligible, zero inbound, http(s) only', view.orphanPages.length === 1 && view.orphanPages[0].url === 'https://go-top.co.il/lonely/' && view.totals.orphanPages === 1)
  check('totals add up', view.totals.articles === 3 && view.totals.linksBetween === A.linksOut + B.linksOut + C.linksOut && view.totals.noIncoming === 0)
}

// ── F. i18n completeness ────────────────────────────────────────────────────
function shape(v: unknown, path: string, out: Map<string, string>) {
  if (typeof v === 'function') { out.set(path, `fn/${(v as (...a: unknown[]) => unknown).length}`); return }
  if (Array.isArray(v)) { out.set(path, `arr/${v.length}`); v.forEach((x, i) => shape(x, `${path}[${i}]`, out)); return }
  if (v && typeof v === 'object') { for (const [k, x] of Object.entries(v)) shape(x, `${path}.${k}`, out); return }
  out.set(path, typeof v)
}
function strings(v: unknown, out: string[] = []): string[] {
  if (typeof v === 'string') out.push(v)
  else if (typeof v === 'function') out.push(String((v as (...a: unknown[]) => unknown)(...Array((v as (...a: unknown[]) => unknown).length).fill(3).map((x, i) => (i === 0 ? 'X' : x)))))
  else if (Array.isArray(v)) v.forEach((x) => strings(x, out))
  else if (v && typeof v === 'object') Object.values(v).forEach((x) => strings(x, out))
  return out
}
function i18nProblems(he: unknown, en: unknown): string[] {
  const a = new Map<string, string>(), b = new Map<string, string>()
  shape(he, 'siteLinks', a); shape(en, 'siteLinks', b)
  const problems: string[] = []
  for (const [k, t] of a) if (b.get(k) !== t) problems.push(`en ${k}: ${b.get(k) ?? 'missing'} ≠ he ${t}`)
  for (const k of b.keys()) if (!a.has(k)) problems.push(`he ${k}: missing`)
  const HEB = /[א-ת]/
  for (const s of strings(he)) if (!s.trim() || !HEB.test(s)) problems.push(`he not Hebrew: "${s}"`)
  for (const s of strings(en)) if (!s.trim() || HEB.test(s)) problems.push(`en has Hebrew or is empty: "${s}"`)
  return problems
}
function partF() {
  console.log('\nF. i18n completeness')
  const he = (dashboardHe as any).siteLinks, en = (dashboardEn as any).siteLinks
  const p = i18nProblems(he, en)
  check('he and en siteLinks have the same keys, arrays and functions; he is Hebrew, en has none', p.length === 0, p.slice(0, 5).join('; '))
  check('every category and reason the rules can produce has a label in both languages',
    ['directory', 'listicle', 'association', 'media'].every((c) => he.opportunities.categories[c] && en.opportunities.categories[c] && he.opportunities.steps[c]?.length >= 3)
    && ['known_directory', 'directory_pattern', 'best_of_title', 'best_of_address', 'top_n_title', 'association_pattern', 'known_media', 'media_pattern'].every((r) => he.opportunities.reasons[r] && en.opportunities.reasons[r]))
  const reasonsInCode = [...read('lib/site-links/classify.ts').matchAll(/reason: '([a-z_]+)'/g)].map((m) => m[1])
  check('the rules produce no reason without a label', reasonsInCode.every((r) => he.opportunities.reasons[r]))
  check('the sidebar label exists in both languages', typeof (dashboardHe as any).sidebar.siteLinks === 'string' && typeof (dashboardEn as any).sidebar.siteLinks === 'string')
  const noKey = JSON.parse(JSON.stringify(en)); delete noKey.policy.link
  check('MUTATION CONTROL: a key missing in en → caught', i18nProblems(he, noKey).length > 0)
  const hebInEn = { ...en, retry: 'נסו שוב' }
  check('MUTATION CONTROL: Hebrew in the English dictionary → caught', i18nProblems(he, hebInEn).length > 0)
  const shortSteps = { ...en, opportunities: { ...en.opportunities, steps: { ...en.opportunities.steps, media: en.opportunities.steps.media.slice(1) } } }
  check('MUTATION CONTROL: a missing step in en → caught', i18nProblems(he, shortSteps).length > 0)
}

// ── G. shell ────────────────────────────────────────────────────────────────
function partG() {
  console.log('\nG. shell')
  const sidebar = strip(read('components/layout/Sidebar.tsx'))
  const entry = sidebar.match(/\{ href: '\/site-links', labelKey: 'siteLinks', icon: (\w+) \}/)
  check('the sidebar has the Links entry, labelled from the dictionary', !!entry)
  const CHAIN = ['Link', 'Link2', 'LinkIcon', 'Link2Icon', 'Unlink', 'Unlink2', 'Chain']
  const iconOk = (name: string | undefined) => !!name && !CHAIN.includes(name)
  check('its icon is not a chain link (the competitor\'s icon)', iconOk(entry?.[1]), entry?.[1])
  check('MUTATION CONTROL: a Link2 icon → caught', !iconOk('Link2'))
  check('the page exists', existsSync(join(ROOT, 'app/(dashboard)/site-links/page.tsx')))
  const title = pageTitle('/site-links', [{ href: '/site-links', label: (dashboardHe as any).sidebar.siteLinks }])
  check('the tab title is the screen\'s name', title.startsWith('קישורים לאתר'))
  check('the title comes from the sidebar entry (DocumentTitle reads navItemKeys)', /navItemKeys/.test(read('components/layout/DocumentTitle.tsx')))
}

// ── H. the opportunities view only reads ────────────────────────────────────
// (The link network, which does write, lives in lib/link-network and is guarded
// by lib/link-network/__qa__/link-network.qa.ts.)
function partH() {
  console.log('\nH. the opportunities view only reads')
  const files = ['lib/site-links/http.ts', 'lib/site-links/model.ts', 'lib/site-links/classify.ts',
    'components/site-links/SiteLinksView.tsx', 'components/site-links/OpportunityList.tsx', 'components/site-links/InternalLinksSection.tsx']
  const writes = (src: string) => /method:\s*'(POST|PUT|PATCH|DELETE)'|\.(insert|update|upsert|delete)\(|\/api\/(?!projects\/\$\{)/.test(strip(src))
  const offenders = files.filter((f) => writes(read(f)))
  check('the tab only reads: no write call and no other API than its own GET', offenders.length === 0, offenders.join(', '))
  check('MUTATION CONTROL: a POST from the view → caught', writes("fetch('/api/x', { method: 'POST' })"))
}

async function main() {
  await partD()
  partE()
  partF()
  partG()
  partH()
  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
}
void main()
export {}
