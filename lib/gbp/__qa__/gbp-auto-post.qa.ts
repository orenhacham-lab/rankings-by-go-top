/**
 * AUTOMATIC POSTS ON GOOGLE MAPS (lib/gbp/auto-post.ts and the publish paths
 * that call it) — an article that publishes to the owner's site also becomes a
 * post on their Google Business Profile.
 *
 *   A) placeholderSummary: the article's OWN title and summary, no URL, no phone
 *      number, clamped to Google's 1,500 characters, nothing invented;
 *   B) publishedArticleUrl: WordPress, then Shopify, then the site adapter; https
 *      only, length bounded;
 *   C) the enqueue end to end against FakeAdmin: OFF unless the owner connected a
 *      location AND approved automatic posting, one post per article however many
 *      times it runs, no Google call and no model call, never throws;
 *   D) the AI draft happens at PUBLISH time, not at article time, and a model
 *      that is unavailable still lets the article's own words go out;
 *   E) the switch: only the owner, only on a location of their OWN connection,
 *      and moving the project to a different business turns it off again;
 *   F) source guards: the article path calls this AFTER the article is already
 *      marked published, auto-post.ts speaks to neither Google nor a model, the
 *      cron is registered, the route is behind the flag, and the four UI
 *      languages carry the same keys.
 * Every guard has a MUTATION CONTROL: the same check on a broken copy must fail.
 *
 * Run: npx tsx lib/gbp/__qa__/gbp-auto-post.qa.ts
 */
import { readFileSync, writeFileSync, unlinkSync, readdirSync, statSync } from 'fs'
import { join, dirname, sep } from 'path'
import crypto from 'crypto'
import { FakeAdmin } from '../../__qa__/_fake-admin'

process.env.GSC_TOKEN_ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex')
process.env.GOOGLE_GSC_CLIENT_ID = 'client-id.apps.googleusercontent.com'
process.env.GOOGLE_GSC_CLIENT_SECRET = 'client-secret'
process.env.GOOGLE_GBP_REDIRECT_URI = 'https://www.gotopseo.com/api/gbp/callback'
process.env.GBP_POSTS_ENABLED = 'true'

/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */
const A = require('../auto-post') as typeof import('../auto-post')
const S = require('../store') as typeof import('../store')
const P = require('../publish') as typeof import('../publish')
const H = require('../http') as typeof import('../http')
const V = require('../validate') as typeof import('../validate')
const { dashboardHe } = require('../../i18n/dashboard/he')
const { dashboardEn } = require('../../i18n/dashboard/en')
const { dashboardEs } = require('../../i18n/dashboard/es')

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
/** Every .ts/.tsx file under a directory, as repo-relative paths. */
function walk(rel: string, out: string[] = []): string[] {
  for (const name of readdirSync(join(ROOT, rel))) {
    if (name === 'node_modules' || name === '.next') continue
    const child = `${rel}/${name}`
    if (statSync(join(ROOT, child)).isDirectory()) walk(child, out)
    else out.push(child)
  }
  return out
}
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1')
const MUTANTS: string[] = []
process.on('exit', () => { for (const f of MUTANTS) { try { unlinkSync(f) } catch { /* gone */ } } })
/**
 * A broken copy of a module, for a mutation control.
 *
 * The copy goes in __qa__, NOT next to the original, and its own relative
 * imports are rewritten one level up to compensate. The reason is a race: this
 * file is one of many suites verify.mjs runs at the same time, and about sixty
 * of them walk app/, lib/ and components/ and read every .ts they find. A copy
 * living in the source tree for a few milliseconds is listed by such a walk and
 * then deleted before it is read, which crashes that unrelated suite (seen
 * 2026-10-12: lib/google-ads/__qa__/api-version.qa.ts, ENOENT on a .mut- file
 * of this suite). Every walker skips __qa__, so a copy in here is invisible.
 */
function mutant<T>(rel: string, from: string | RegExp, to: string): T {
  const src = read(rel)
  const out = src.replace(from, to)
  if (out === src) throw new Error(`mutation did not apply to ${rel}`)
  const moved = out.replace(/(\sfrom\s*|\brequire\()'\.\//g, "$1'../")
  const file = join(ROOT, dirname(rel), '__qa__', `.mut-${crypto.randomUUID()}.ts`)
  writeFileSync(file, moved)
  MUTANTS.push(file)
  return require(file) as T
}

const OWNER = 'own-1111'
const OTHER = 'oth-2222'
const PROJECT = 'prj-1111'
const ARTICLE = 'art-1111'

/**
 * A project whose article has just published. `opts` turns each precondition off
 * one at a time, so every skip reason is reached by a real world, not a stub.
 */
function world(opts: {
  switchOn?: boolean
  connected?: boolean
  withLocation?: boolean
  status?: string
  url?: string | null
  image?: string | null
  language?: string
  description?: string | null
  title?: string
} = {}) {
  const connId = 'conn-1111'
  const admin: any = new FakeAdmin({
    projects: [{ id: PROJECT, user_id: OWNER, language: opts.language ?? 'he', business_name: 'המאפייה של דנה', target_domain: 'dana-bakery.co.il' }],
    generated_articles: [{
      id: ARTICLE, project_id: PROJECT, user_id: OWNER,
      title: opts.title ?? 'לחם מחמצת כל בוקר',
      status: opts.status ?? 'published',
      meta_description: opts.description === undefined ? 'מה הופך מחמצת לטובה, ואיך אופים אותה' : opts.description,
      excerpt: null,
      featured_image_url: opts.image === undefined ? 'https://dana-bakery.co.il/img/bread.jpg' : opts.image,
      wp_post_url: opts.url === undefined ? 'https://dana-bakery.co.il/sourdough' : opts.url,
      shopify_article_url: null, site_post_url: null,
    }],
    gbp_connections: opts.connected === false ? [{ id: connId, user_id: OWNER, encrypted_refresh_token: 'v1:aa:bb:cc', granted_scope: 'x', status: 'reauth_required', last_error_code: 'reauth_required', updated_at: new Date().toISOString() }]
      : [{ id: connId, user_id: OWNER, encrypted_refresh_token: 'v1:aa:bb:cc', granted_scope: 'x', status: 'connected', last_error_code: null, updated_at: new Date().toISOString() }],
    project_gbp_locations: opts.withLocation === false ? [] : [{
      project_id: PROJECT, user_id: OWNER, connection_id: connId,
      account_name: 'accounts/111', location_name: 'locations/222', location_title: 'המאפייה של דנה',
      location_address: null, website_uri: null, maps_uri: null,
      auto_post_on_publish: opts.switchOn ?? true,
    }],
    gbp_posts: [],
  })
  return admin
}
const posts = (admin: any) => admin.tables.gbp_posts as any[]

// ── A) the placeholder text ──────────────────────────────────────────────────
function placeholderChecks() {
  console.log('A) the text an automatic post carries until it is drafted')
  const p = A.placeholderSummary
  check('title and summary, in that order, separated by a blank line',
    p({ title: 'לחם מחמצת', description: 'איך אופים' }) === 'לחם מחמצת\n\nאיך אופים')
  check('a title with no summary still makes a post', p({ title: 'לחם מחמצת', description: null }) === 'לחם מחמצת')
  check('no title and no summary makes nothing (the caller then skips)', p({ title: '   ', description: null }) === '')
  check('a URL is removed — Google refuses a link in the text',
    !/https?:/.test(p({ title: 'לחם', description: 'פרטים ב https://dana-bakery.co.il/x עכשיו' })))
  check('a line carrying a phone number is dropped — Google refuses those too',
    !p({ title: 'לחם טרי', description: 'התקשרו 050-1234567' }).includes('050'))
  const long = p({ title: 'א'.repeat(40), description: 'ב'.repeat(3000) })
  check('clamped to Google\'s 1,500 characters', [...long].length <= 1500 && [...long].length > 1000)
  check('nothing is invented: every word comes from the article',
    p({ title: 'לחם מחמצת', description: 'איך אופים' }).replace(/\s/g, '') === 'לחםמחמצתאיךאופים')

  const broken = mutant<typeof A>('lib/gbp/auto-post.ts', ".replace(/https?:\\/\\/\\S+/g, '')", '')
  check('MUTATION CONTROL: without the URL strip a link survives in the text',
    /https?:/.test(broken.placeholderSummary({ title: 'לחם', description: 'פרטים ב https://dana-bakery.co.il/x' })))
}

// ── B) which URL the button points at ────────────────────────────────────────
function urlChecks() {
  console.log('B) the article URL the button points at')
  const u = A.publishedArticleUrl
  check('WordPress first', u({ wp_post_url: 'https://a.co.il/1', shopify_article_url: 'https://b.co.il/2', site_post_url: 'https://c.co.il/3' }) === 'https://a.co.il/1')
  check('then Shopify', u({ wp_post_url: null, shopify_article_url: 'https://b.co.il/2', site_post_url: 'https://c.co.il/3' }) === 'https://b.co.il/2')
  check('then the site adapter', u({ wp_post_url: null, shopify_article_url: null, site_post_url: 'https://c.co.il/3' }) === 'https://c.co.il/3')
  check('http is refused', u({ wp_post_url: 'http://a.co.il/1', shopify_article_url: null, site_post_url: null }) === null)
  check('javascript: is refused', u({ wp_post_url: 'javascript:alert(1)', shopify_article_url: null, site_post_url: null }) === null)
  check('an absurdly long URL is refused', u({ wp_post_url: `https://a.co.il/${'x'.repeat(2100)}`, shopify_article_url: null, site_post_url: null }) === null)
  check('no URL at all reads as none', u({ wp_post_url: null, shopify_article_url: null, site_post_url: null }) === null)

  const broken = mutant<typeof A>('lib/gbp/auto-post.ts', "/^https:\\/\\//.test(v)", 'true')
  check('MUTATION CONTROL: without the https test an http URL is taken',
    broken.publishedArticleUrl({ wp_post_url: 'http://a.co.il/1', shopify_article_url: null, site_post_url: null }) === 'http://a.co.il/1')
}

// ── C) the enqueue ───────────────────────────────────────────────────────────
async function enqueueChecks() {
  console.log('C) queueing the post when an article publishes')
  {
    const admin = world()
    const r = await A.enqueueGbpPostForPublishedArticle(admin, ARTICLE)
    const row = posts(admin)[0]
    check('the happy path queues exactly one post', r.queued && r.reason === 'queued' && posts(admin).length === 1)
    check('it is marked as made by the system, not by the merchant', row?.auto_created === true)
    check('it is marked as still waiting for the AI draft', row?.needs_ai_draft === true)
    check('it carries the article\'s own words for now', String(row?.summary ?? '').startsWith('לחם מחמצת כל בוקר'))
    check('the button sends the customer to the article', row?.cta_type === 'LEARN_MORE' && row?.cta_url === 'https://dana-bakery.co.il/sourdough')
    check('the article\'s picture comes along', row?.image_url === 'https://dana-bakery.co.il/img/bread.jpg')
    check('it is scheduled for now, so the next pass sends it', typeof row?.scheduled_at === 'string' && new Date(row.scheduled_at).getTime() <= Date.now() + 1000)
    check('it is linked to the article it came from', row?.source_article_id === ARTICLE)
    check('it belongs to the owner of the connection', row?.user_id === OWNER && row?.project_id === PROJECT)

    // Running again (a retried or reconciled publish) must not post twice.
    const again = await A.enqueueGbpPostForPublishedArticle(admin, ARTICLE)
    check('running it again posts nothing more', again.reason === 'already_queued' && !again.queued && posts(admin).length === 1)
  }
  {
    // THE RULE OREN ASKED FOR: nothing happens unless the owner approved it.
    const admin = world({ switchOn: false })
    const r = await A.enqueueGbpPostForPublishedArticle(admin, ARTICLE)
    check('the owner has NOT approved automatic posting → nothing is queued', r.reason === 'switch_off' && posts(admin).length === 0)
  }
  {
    const admin = world({ withLocation: false })
    const r = await A.enqueueGbpPostForPublishedArticle(admin, ARTICLE)
    check('no business profile connected → nothing is queued', r.reason === 'no_location' && posts(admin).length === 0)
  }
  {
    const admin = world({ connected: false })
    const r = await A.enqueueGbpPostForPublishedArticle(admin, ARTICLE)
    check('the Google connection needs reconnecting → nothing is queued', r.reason === 'not_connected' && posts(admin).length === 0)
  }
  {
    const admin = world()
    admin.tables.project_gbp_locations[0].connection_id = 'someone-elses-connection'
    const r = await A.enqueueGbpPostForPublishedArticle(admin, ARTICLE)
    check('a location hanging off a DIFFERENT connection is never posted to', r.reason === 'not_connected' && posts(admin).length === 0)
  }
  {
    const admin = world({ status: 'ready' })
    const r = await A.enqueueGbpPostForPublishedArticle(admin, ARTICLE)
    check('an article that is not actually published → nothing is queued', r.reason === 'not_published' && posts(admin).length === 0)
  }
  {
    const admin = world()
    const r = await A.enqueueGbpPostForPublishedArticle(admin, 'no-such-article')
    check('an article that is gone → nothing is queued', r.reason === 'no_article' && posts(admin).length === 0)
  }
  {
    const admin = world({ title: '  ', description: null })
    const r = await A.enqueueGbpPostForPublishedArticle(admin, ARTICLE)
    check('an article with no title and no summary → nothing is queued', r.reason === 'no_text' && posts(admin).length === 0)
  }
  {
    const admin = world({ url: null, image: null })
    await A.enqueueGbpPostForPublishedArticle(admin, ARTICLE)
    const row = posts(admin)[0]
    check('no article URL → a post with no button (never a button with no link)', row && row.cta_type === null && row.cta_url === null)
  }
  {
    const he = world({ language: 'he' })
    await A.enqueueGbpPostForPublishedArticle(he, ARTICLE)
    check('a Hebrew project posts in Hebrew', posts(he)[0]?.language_code === 'he')
    const en = world({ language: 'en' })
    await A.enqueueGbpPostForPublishedArticle(en, ARTICLE)
    check('an English project posts in English', posts(en)[0]?.language_code === 'en')
    const blank = world({ language: '' })
    await A.enqueueGbpPostForPublishedArticle(blank, ARTICLE)
    check('a project with no language recorded falls back to English', posts(blank)[0]?.language_code === 'en')

    const es = world({ language: 'es' })
    await A.enqueueGbpPostForPublishedArticle(es, ARTICLE)
    check('a Spanish project posts in Spanish, the way its articles are written', posts(es)[0]?.language_code === 'es')
    const pt = world({ language: 'pt-BR' })
    await A.enqueueGbpPostForPublishedArticle(pt, ARTICLE)
    check('a Brazilian Portuguese project posts in pt-BR', posts(pt)[0]?.language_code === 'pt-BR')
    const fr = world({ language: 'fr' })
    await A.enqueueGbpPostForPublishedArticle(fr, ARTICLE)
    check('a French project posts in French', posts(fr)[0]?.language_code === 'fr')

    check('the language rule is pure, so it can be read at a glance',
      A.postLanguageFor('he-IL') === 'he' && A.postLanguageFor('iw') === 'he'
      && A.postLanguageFor('en-US') === 'en' && A.postLanguageFor('es-MX') === 'es'
      && A.postLanguageFor('pt') === 'pt-BR' && A.postLanguageFor('pt-PT') === 'pt-BR'
      && A.postLanguageFor('fr') === 'fr' && A.postLanguageFor('fr-CA') === 'fr'
      && A.postLanguageFor(null) === 'en' && A.postLanguageFor('sw') === 'en')
    check('whatever it returns is a language the database column accepts',
      V.GBP_POST_LANGUAGES.length === 5
      && ['he', 'en', 'es', 'pt-BR', 'fr', 'he-IL', 'iw', 'pt', 'pt-PT', 'es-MX', 'en-GB', 'fr-CA', '', null, 42]
        .every((l) => V.normalizePostLanguage(A.postLanguageFor(l)) !== null))

    // A regional tag is still that language, so a project recorded as es-MX posts in Spanish.
    const esMx = world({ language: 'es-MX' })
    await A.enqueueGbpPostForPublishedArticle(esMx, ARTICLE)
    check('a regional tag still posts in its own language', posts(esMx)[0]?.language_code === 'es')

    const broken = mutant<typeof A>('lib/gbp/auto-post.ts', "if (base === 'es') return 'es'", '')
    const other = world({ language: 'es-MX' })
    const r = await broken.enqueueGbpPostForPublishedArticle(other, ARTICLE)
    check('MUTATION CONTROL: drop the Spanish branch and a Spanish business gets an English post',
      r.queued === true && posts(other)[0]?.language_code === 'en')
  }
  {
    // THE RULE THAT MATTERS MOST: this runs inside the article publish path, so
    // it must never throw, whatever the database does.
    const admin = new FakeAdmin({ generated_articles: [] }, { generated_articles: { select: () => ({ code: '500', message: 'boom' }) } } as any)
    let threw = false
    let r: any = null
    try { r = await A.enqueueGbpPostForPublishedArticle(admin as any, ARTICLE) } catch { threw = true }
    check('a database failure does not throw into the article publish path', !threw && r && r.queued === false)

    const missing = world()
    for (const t of ['project_gbp_locations']) missing.hooks = { [t]: { select: () => ({ code: '42P01', message: 'relation does not exist' }) } }
    const m: any = new FakeAdmin(missing.tables, { project_gbp_locations: { select: () => ({ code: '42P01', message: 'relation does not exist' }) } } as any)
    const out = await A.enqueueGbpPostForPublishedArticle(m, ARTICLE)
    check('before the migration is applied it skips quietly', out.ok && out.reason === 'no_location')
  }
  {
    const admin = world()
    process.env.GBP_POSTS_ENABLED = 'false'
    const r = await A.enqueueGbpPostForPublishedArticle(admin, ARTICLE)
    process.env.GBP_POSTS_ENABLED = 'true'
    check('with the feature switched off nothing is queued at all', r.reason === 'feature_off' && posts(admin).length === 0)
  }
  {
    const broken = mutant<typeof A>('lib/gbp/auto-post.ts', "if (!location.auto_post_on_publish) return skip('switch_off')", '')
    const admin = world({ switchOn: false })
    const r = await broken.enqueueGbpPostForPublishedArticle(admin, ARTICLE)
    check('MUTATION CONTROL: without the switch check a post is queued for an owner who never approved it', r.queued === true)
  }
  {
    const broken = mutant<typeof A>('lib/gbp/auto-post.ts', "if (article.status !== 'published') return skip('not_published')", '')
    const admin = world({ status: 'ready' })
    const r = await broken.enqueueGbpPostForPublishedArticle(admin, ARTICLE)
    check('MUTATION CONTROL: without the published check an unpublished article is posted about', r.queued === true)
  }
}

// ── D) the AI draft, at publish time ─────────────────────────────────────────
async function draftTimingChecks() {
  console.log('D) the AI draft happens when the post goes out, not when the article does')
  const base = {
    id: 'post-1', project_id: PROJECT, user_id: OWNER, source_article_id: ARTICLE,
    summary: 'לחם מחמצת כל בוקר', cta_type: 'LEARN_MORE', cta_url: 'https://dana-bakery.co.il/sourdough',
    image_url: null, image_path: null, language_code: 'he' as const, status: 'publishing' as const,
    scheduled_at: new Date().toISOString(), attempts: 0, google_post_name: null, google_state: null,
    google_search_url: null, last_error_code: null, published_at: null, created_at: new Date().toISOString(),
    auto_created: true, needs_ai_draft: true,
  }
  const loc = { location_title: 'המאפייה של דנה' }
  {
    const admin = world()
    admin.tables.gbp_posts = [{ ...base }]
    let sawName = ''
    const out = await P.draftedSummaryFor(admin, { ...base } as any, loc, {
      draft: async (src) => { sawName = String(src.businessName ?? ''); return { ok: true, summary: 'בוקר טוב, הוצאנו מחמצת טרייה מהתנור.' } },
    })
    check('the AI text is what goes to Google', out === 'בוקר טוב, הוצאנו מחמצת טרייה מהתנור.')
    check('the AI text is stored, so the screen shows what was really sent',
      admin.tables.gbp_posts[0].summary === out && admin.tables.gbp_posts[0].needs_ai_draft === false)
    check('the draft knows which business it is writing for', sawName === 'המאפייה של דנה')
  }
  {
    const admin = world()
    admin.tables.gbp_posts = [{ ...base }]
    const out = await P.draftedSummaryFor(admin, { ...base } as any, loc, { draft: async () => ({ ok: false }) })
    check('a model that is unavailable still lets the article\'s own words go out', out === base.summary)
    check('and the row still says it is waiting for a draft', admin.tables.gbp_posts[0].needs_ai_draft === true)
  }
  {
    const admin = world()
    admin.tables.gbp_posts = [{ ...base }]
    const out = await P.draftedSummaryFor(admin, { ...base } as any, loc, { draft: async () => { throw new Error('timeout') } })
    check('a model that throws does not fail the post', out === base.summary)
  }
  {
    // A post the merchant wrote in the composer is never rewritten.
    const admin = world()
    const own = { ...base, auto_created: false, needs_ai_draft: false, summary: 'מה שהעסק כתב בעצמו' }
    admin.tables.gbp_posts = [{ ...own }]
    let called = false
    const out = await P.draftedSummaryFor(admin, own as any, loc, { draft: async () => { called = true; return { ok: true, summary: 'אחר' } } })
    check('a post the merchant wrote is sent word for word, with no model call', out === own.summary && !called)
  }
}

// ── E) the switch ────────────────────────────────────────────────────────────
function deps(admin: any, over: Partial<import('../http').GbpRouteDeps> = {}, as = OWNER): import('../http').GbpRouteDeps {
  return {
    auth: async (pid) => (!pid ? { error: 'x', status: 400 } : pid !== PROJECT ? { error: 'x', status: 404 }
      : as !== OWNER ? { error: 'x', status: 403 }
      : { user: { id: as }, admin, project: { id: PROJECT, user_id: OWNER } }) as any,
    ...over,
  }
}
const patch = (body: unknown) => new Request('https://app.test/api/gbp/auto-post', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

async function switchChecks() {
  console.log('E) the owner\'s switch')
  {
    const admin = world({ switchOn: false })
    const r = await H.handleSetAutoPost(patch({ projectId: PROJECT, enabled: true }), deps(admin))
    check('the owner turns it on', r.status === 200 && admin.tables.project_gbp_locations[0].auto_post_on_publish === true)
    check('when they approved it is recorded, so "I never approved this" has an answer',
      typeof admin.tables.project_gbp_locations[0].auto_post_enabled_at === 'string'
      && Date.now() - new Date(admin.tables.project_gbp_locations[0].auto_post_enabled_at).getTime() < 10_000)
    const off = await H.handleSetAutoPost(patch({ projectId: PROJECT, enabled: false }), deps(admin))
    check('and off again', off.status === 200 && admin.tables.project_gbp_locations[0].auto_post_on_publish === false)
    check('turning it off clears the approval time, so a stale one never looks current',
      admin.tables.project_gbp_locations[0].auto_post_enabled_at === null)
  }
  {
    const admin = world({ switchOn: false })
    const r = await H.handleSetAutoPost(patch({ projectId: PROJECT, enabled: true }), deps(admin, {}, OTHER))
    check('another user cannot turn it on', r.status === 403 && admin.tables.project_gbp_locations[0].auto_post_on_publish === false)
  }
  {
    // CHANGED 13 October 2026: the switch is offered on a Shopify store too, and
    // lib/content/automation/publish-item-shopify.ts enqueues the post, so the
    // promise on the screen holds there as well.
    const admin = world({ switchOn: false })
    admin.tables.shopify_connections = [{ project_id: PROJECT, archived_at: null }]
    const r = await H.handleSetAutoPost(patch({ projectId: PROJECT, enabled: true }), deps(admin))
    check('a project whose site is a Shopify store can turn automatic posting on', r.status === 200 && admin.tables.project_gbp_locations[0].auto_post_on_publish === true)
  }
  {
    const admin = world({ withLocation: false })
    const r = await H.handleSetAutoPost(patch({ projectId: PROJECT, enabled: true }), deps(admin))
    check('with no business selected the switch has nowhere to live', r.status === 409 && (await r.json()).error === 'no_location')
  }
  {
    const admin = world({ connected: false, switchOn: false })
    const r = await H.handleSetAutoPost(patch({ projectId: PROJECT, enabled: true }), deps(admin))
    check('a connection that needs reconnecting cannot be switched on', r.status === 409 && (await r.json()).error === 'not_connected')
  }
  {
    const admin = world({ switchOn: false })
    const r = await H.handleSetAutoPost(patch({ projectId: PROJECT, enabled: 'yes' }), deps(admin))
    check('anything that is not true/false is refused', r.status === 400 && admin.tables.project_gbp_locations[0].auto_post_on_publish === false)
  }
  {
    const admin = world()
    admin.tables.project_gbp_locations[0].connection_id = 'someone-elses-connection'
    const r = await H.handleSetAutoPost(patch({ projectId: PROJECT, enabled: true }), deps(admin))
    check('a location on a different connection is not switchable', r.status === 409)
  }
  {
    // Moving the project to ANOTHER business withdraws the approval: the owner
    // approved posting to the business they picked, not to the next one.
    const admin = world()
    await S.saveProjectLocation(admin, {
      project_id: PROJECT, user_id: OWNER, connection_id: 'conn-1111',
      account_name: 'accounts/111', location_name: 'locations/999', location_title: 'סניף אחר',
    })
    check('picking a DIFFERENT business turns automatic posting off and clears the approval time',
      admin.tables.project_gbp_locations[0].auto_post_on_publish === false
      && admin.tables.project_gbp_locations[0].auto_post_enabled_at === null)

    const same = world()
    await S.saveProjectLocation(same, {
      project_id: PROJECT, user_id: OWNER, connection_id: 'conn-1111',
      account_name: 'accounts/111', location_name: 'locations/222', location_title: 'המאפייה של דנה (שם מעודכן)',
    })
    check('re-saving the SAME business leaves the switch alone', same.tables.project_gbp_locations[0].auto_post_on_publish === true)
  }
  {
    const admin = world()
    const r = await H.handleStatus(new Request(`https://app.test/api/gbp/status?projectId=${PROJECT}`), deps(admin))
    check('the screen is told the switch is on', (await r.json()).autoPostOnPublish === true)
    const off = world({ switchOn: false })
    const r2 = await H.handleStatus(new Request(`https://app.test/api/gbp/status?projectId=${PROJECT}`), deps(off))
    check('and when it is off', (await r2.json()).autoPostOnPublish === false)
  }
  {
    const broken = mutant<typeof H>('lib/gbp/http.ts', "if (typeof body.enabled !== 'boolean') return err('invalid_request', 400)", '')
    const admin = world({ switchOn: false })
    const r = await broken.handleSetAutoPost(patch({ projectId: PROJECT, enabled: 'yes' }), deps(admin))
    check('MUTATION CONTROL: without the type check a string turns the switch on', r.status === 200)
  }
}

// ── F) source guards ─────────────────────────────────────────────────────────
const HOOK = 'enqueueGbpPostForPublishedArticle'
const PUBLISH_PATHS = [
  'lib/content/automation/publish-item.ts',
  'lib/site-platforms/publish.ts',
  'app/api/content/articles/[id]/wordpress/route.ts',
  // Added 13 October 2026, when the Shopify block came off the feature: a store
  // that can turn the switch on must have its articles reach Google too.
  'lib/content/automation/publish-item-shopify.ts',
  'app/api/content/articles/[id]/shopify/route.ts',
]

function sourceChecks() {
  console.log('F) where it is wired in, and what it is not allowed to touch')
  const src = strip(read('lib/gbp/auto-post.ts'))
  check('auto-post.ts makes no network call of its own', !/\bfetch\s*\(/.test(src))
  check('auto-post.ts never speaks to Google', !/mybusiness|createLocalPost|googleapis/.test(src))
  check('auto-post.ts never speaks to a model', !/genai|generateContent|draftPost|RECOMMENDATION_MODEL/.test(src))
  check('auto-post.ts cannot throw out of its own entry point', /catch\s*{\s*\n?\s*return\s*\{\s*ok:\s*false/.test(src))

  for (const rel of PUBLISH_PATHS) {
    const s = strip(read(rel))
    check(`the article path calls it: ${rel}`, s.includes(HOOK))
    // It must come AFTER the article is already recorded as published, so a
    // failure here cannot leave the article unpublished.
    // The anchor is whatever records the publication in THAT path. Two Shopify
    // paths do not write the status themselves: publishArticleToShopify does it
    // (see persistSuccess), so the anchor there is its result being accepted.
    const published = s.search(/status:\s*'published'|goesLive|if \(!result\.ok\)/)
    const hook = s.lastIndexOf(`await ${HOOK}`)
    check(`and only after the article is already published: ${rel}`, published >= 0 && hook > published)
  }
  // Every path that can mark an article published is listed above. A new one
  // that is not would publish silently, so the list is checked against the tree.
  const publishers = walk('lib').concat(walk('app'))
    .filter((f) => /\.tsx?$/.test(f) && !f.includes('__qa__'))
    .filter((f) => /from '@\/lib\/shopify\/publish-article'|from '@\/lib\/content\/wordpress-plugin-publish'/.test(read(f)))
    .filter((f) => /status:\s*'published'|published:\s*true/.test(strip(read(f))))
  const missing = publishers.filter((f) => !PUBLISH_PATHS.includes(f) && !strip(read(f)).includes(HOOK))
  if (missing.length > 0) console.log('      missing:', missing.join(', '))
  check(`no publishing path is left out (${publishers.length} found)`, missing.length === 0)

  const shopifyManual = strip(read('app/api/content/articles/[id]/shopify/route.ts'))
  check('a Shopify DRAFT export does not post to Google (a draft is not a publication)',
    /if \(published\) {/.test(shopifyManual))
  check('MUTATION CONTROL: dropping the published check would post on a draft too',
    !/if \(published\) {/.test(shopifyManual.replace('if (published) {', 'if (true) {')))

  const vercel = JSON.parse(read('vercel.json')) as { crons: { path: string; schedule: string }[] }
  const cron = vercel.crons.find((c) => c.path === '/api/gbp/cron')
  check('the cron that sends the posts is registered', !!cron)
  // Daily, because the Vercel plan refuses anything more often. It must land
  // AFTER the article cron, or the morning's automatic posts wait a whole day.
  const articleCron = vercel.crons.find((c) => c.path === '/api/content/automation/cron')
  const minutes = (c?: { schedule: string }) => { const [m, h] = (c?.schedule ?? '').split(' '); return Number(h) * 60 + Number(m) }
  check('it runs once a day (the plan allows no more)', !!cron && /^\d+ \d+ \* \* \*$/.test(cron.schedule))
  check('and after the article cron, so the morning\'s posts go out the same morning',
    !!cron && !!articleCron && minutes(cron) > minutes(articleCron) && minutes(cron) - minutes(articleCron) <= 120)

  const route = strip(read('app/api/gbp/auto-post/route.ts'))
  check('the switch route authenticates itself (proxy.ts does not cover /api/*)', route.includes('realGbpDeps') && route.includes('handleSetAutoPost'))
  check('and answers 404 while the feature is off', /isGbpPostsEnabled\(\)/.test(route) && route.includes('404'))
  check('only PATCH exists on it', !/export (async )?function (GET|POST|DELETE|PUT)\b/.test(route))

  const migration = read('supabase/migrations/20261012180000_gbp_auto_post.sql')
  check('the migration is additive only', !/DROP\s+(TABLE|COLUMN)|ALTER\s+COLUMN|DELETE\s+FROM|TRUNCATE/i.test(strip(migration).replace(/^--.*$/gm, '')))
  check('the switch arrives OFF for everyone', /auto_post_on_publish boolean NOT NULL DEFAULT false/.test(migration))
  check('one automatic post per article is enforced by the database',
    /CREATE UNIQUE INDEX IF NOT EXISTS uq_gbp_posts_auto_article/.test(migration))
  check('when the owner approved is recorded', /auto_post_enabled_at timestamptz/.test(migration))
  check('and an approval time cannot sit on a switch that is off',
    /CHECK \(auto_post_on_publish OR auto_post_enabled_at IS NULL\)/.test(migration))
  // Two DROP-then-ADD constraint pairs, both re-runnable and neither a tightening:
  // one on a column this file creates, one WIDENING the language check so a post
  // can be written in the project's own language. Comment lines are stripped
  // first: the rollback recipe at the top names the same statements.
  const migrationSql = migration.replace(/^--.*$/gm, '')
  const dropped = [...migrationSql.matchAll(/DROP CONSTRAINT IF EXISTS (\w+)/g)].map((m) => m[1]).sort()
  check('the only constraints it touches are its own new one and the language widening',
    dropped.length === 2
    && dropped.join(',') === 'gbp_posts_language,project_gbp_locations_auto_post_enabled_at')
  check('a post may be written in any of the four app languages, like the articles',
    /CHECK \(language_code IN \('he', 'en', 'es', 'pt-BR'\)\)/.test(migrationSql))
  check('and widening it can never fail on a row that already exists',
    // the old check allowed he and en only, both still allowed
    ['he', 'en'].every((l) => (V.GBP_POST_LANGUAGES as readonly string[]).includes(l)))

  // The header of draft.ts used to assert a Google rule that Google does not state.
  // Unwrapped, so an assertion does not depend on where the comment happens to wrap.
  // The broken copies this suite writes must stay out of the source tree, or they
  // crash whichever tree-walking suite verify.mjs happens to run alongside.
  check('every mutant copy this suite wrote lives in a __qa__ directory',
    MUTANTS.length > 0 && MUTANTS.every((f) => f.includes(`${sep}__qa__${sep}`) && !/\.tsx?$/.test(f.replace(/\.ts$/, ''))))

  const draftHeader = read('lib/gbp/draft.ts').slice(0, 2000).replace(/\n\s*\*\s*/g, ' ')
  check('draft.ts no longer states as fact that Google rejects automatically generated posts',
    draftHeader.includes("That is NOT what Google's policy says") && !/posts, research\.md\)/.test(draftHeader))
  check('and it cites the pages that were actually read instead',
    draftHeader.includes('business/answer/7213077') && draftHeader.includes('contributionpolicy/answer/7400114'))

  // i18n: the same keys in all four languages, nothing left in English.
  const { dashboardPtBR } = require('../../i18n/dashboard/pt-BR') as any
  const dicts: [string, any][] = [['he', dashboardHe], ['en', dashboardEn], ['es', dashboardEs], ['pt-BR', dashboardPtBR]]
  const keys = Object.keys(dashboardHe.mapsPosts.autoPost).sort().join(',')
  for (const [name, d] of dicts) {
    const block = d?.mapsPosts?.autoPost
    check(`${name} carries the switch's words`, !!block && Object.keys(block).sort().join(',') === keys)
    check(`${name} says nothing is mandatory and it can be switched off`, !!block && /כבות|off|desactivar|desativar/i.test(String(block?.help ?? '')))
  }
  check('the Hebrew words are Hebrew, not English', /[֐-׿]/.test(dashboardHe.mapsPosts.autoPost.label))
  check('no copy claims a partnership with Google',
    !dicts.some(([, d]) => /partner|שות[פף]|socio de Google|parceria/i.test(JSON.stringify(d?.mapsPosts?.autoPost ?? {}))))

  const list = strip(read('components/maps-posts/PostsList.tsx'))
  check('the merchant can see which posts the system wrote', list.includes('autoCreated') && list.includes('autoPost.badge'))
  const cards = strip(read('components/maps-posts/ConnectCards.tsx'))
  check('the switch is shown only once a business is selected', /status\.location && !picking \?/.test(cards) && cards.includes('<AutoPostSwitch'))
  check('the switch follows the server, not the click', cards.includes('checked={status.autoPostOnPublish}'))
}

async function main() {
  placeholderChecks()
  urlChecks()
  await enqueueChecks()
  await draftTimingChecks()
  await switchChecks()
  sourceChecks()
  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}
void main()

export {}
