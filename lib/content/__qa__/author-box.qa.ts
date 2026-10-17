/**
 * THE AUTHOR BOX — the guards (lib/content/author-box).
 *
 *   A) the theme test: a known author-box class or id, or a byline-kind
 *      element / rel="author" container holding a bio, is a box; a bare
 *      byline is not; markers in scripts, styles or comments are not; our own
 *      box is never counted;
 *   B) the content: only the allowed sources (the heading in the article's
 *      language, the author's or business's name, the first sentence of the
 *      business description, a link to the project's own site); escaped;
 *   C) publishing (applyArticleDesign, the one place every publisher composes
 *      its body): off by default (no row, no column, NULL); on + the theme has
 *      a box: no box; on + none: one box, never two (republish, update);
 *      detection failure, a cut-off page, no published page: no box; the cache
 *      spares a second fetch and is re-checked when stale; Wix never;
 *   D) where it goes and how it looks: before the call to action, else at the
 *      end; inline styles in the formatted design, plain in the minimal one;
 *   E) THE OWNERSHIP FILTER on every service-role read and write (a decoy row
 *      of another owner for the same project is never read or changed; a
 *      page off the project's site is never fetched);
 *   F) the settings switch: saved on the owner's row, refused when not a
 *      boolean, left alone while its column is missing; the card shows it
 *      with its hint, in all four dashboard languages;
 *   G) the WordPress publishers name the user the post is published as, and
 *      the settings preview asks with the same lookups;
 *   H) the owner's own name (wins; empty falls back to the resolver; cleaned
 *      and escaped) and link (http(s) only, else refused); saved on the owner's
 *      row, left alone while the columns are missing (the box as before); the
 *      preview is drawn from the publisher's inputs with the publisher's
 *      resolver, for the owner's own project only;
 *   I) the image: none by default (today's box, the site not asked), or the
 *      WordPress site icon (https, the site's host or WordPress' CDN, alt and
 *      size, round in the formatted design; missing = no markup); never on a
 *      Shopify store;
 *   J) every new string in the four dashboard languages.
 *
 * Every group has a MUTATION CONTROL: a deliberately broken copy of the module
 * (written next to it, imported, deleted) or of the source text must fail the
 * same check. A manual control was also run on the real file (backed up to
 * /tmp first and restored by copy): store.ts with `row[AUTHOR_BOX_COLUMN] ===
 * true` changed to `!== false` made C2 and C3 fail, and html.ts without
 * `!bodyHasAuthorBox(base)` made C10 fail; restored, all pass.
 *
 * Run: npx tsx lib/content/__qa__/author-box.qa.ts
 */
import { readFileSync, unlinkSync, writeFileSync } from 'fs'
import { join } from 'path'
import { FakeAdmin } from '@/lib/__qa__/_fake-admin'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import { applyArticleDesign } from '@/lib/content/article-style/publish'
import { styleArticleHtml } from '@/lib/content/article-style/html'
import { DEFAULT_ARTICLE_STYLE } from '@/lib/content/article-style/types'
import type { fetchSiteHtml } from '@/lib/free-check/site-fetch'
import {
  AUTHOR_BOX_HEADINGS, OWN_CLASS, authorBoxContent, authorBoxStructure, descriptionLine, normalizeAuthorBoxUrl, themeHasAuthorBox,
  type AuthorBoxContent,
} from '@/lib/content/author-box/box'
import { THEME_CHECK_TTL_MS, findAboutUrl, isProjectPage } from '@/lib/content/author-box/store'
import { loadWritingGuidance, saveWritingGuidance, type GuidanceDeps } from '@/lib/content/writing-guidance/data'

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: string) {
  if (ok) { passed++; console.log(`  PASS ${name}`) } else { failed++; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = process.cwd()
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')

/** A deliberately broken copy of a module, next to it (so its relative imports resolve), imported, deleted. */
async function mutant<T>(rel: string, edit: (src: string) => string): Promise<T> {
  const file = join(ROOT, rel)
  const src = readFileSync(file, 'utf8')
  const out = edit(src)
  if (out === src) throw new Error(`mutation of ${rel} changed nothing`)
  const copy = file.replace(/\.ts$/, `.mut-${process.pid}-${Math.random().toString(36).slice(2, 8)}.ts`)
  writeFileSync(copy, out)
  try {
    return (await import(copy)) as T
  } finally {
    unlinkSync(copy)
  }
}

const PROJECT = 'a1111111-2222-3333-4444-555555555555'
const OWNER = 'u-owner'
const OTHER = 'u-other'
const ART = 'b1111111-2222-3333-4444-555555555555'
const OLD_ART = 'c1111111-2222-3333-4444-555555555555'
const DOMAIN = 'shop.example.co.il'
const DESCRIPTION = 'Family bakery in Haifa baking sourdough since 1998. We also deliver to offices across the north.'
const BODY = '<p><strong>Sourdough needs time.</strong></p><h2 id="s1">Why it rises</h2><p>Wild yeast and bacteria work together over many hours.</p>'

const NO_BOX_PAGE = `<html><head><style>.author-box{color:red}</style><script>var x = '<div class="author-box">'</script></head><body>
  <!-- <div class="author-bio">old</div> -->
  <header><span class="byline">by <a rel="author" href="/u/dana">Dana</a></span><span class="post-author">Dana</span></header>
  <article><p>${'Article text that is long enough to look like a real paragraph of the post. '.repeat(3)}</p></article>
  <footer><p>© 2026</p></footer></body></html>`
const BOX_PAGE = `<html><body><article><p>Text.</p></article><div class="saboxplugin-wrap"><div class="saboxplugin-authorname">Dana</div></div></body></html>`

type Page = Awaited<ReturnType<typeof fetchSiteHtml>>
function fetcher(answer: Page | (() => Page)) {
  const calls: string[] = []
  const fn = (async (u: URL) => { calls.push(u.toString()); return typeof answer === 'function' ? answer() : answer }) as unknown as typeof fetchSiteHtml
  return { fn, calls }
}
const page = (html: string, truncated = false): Page => ({ ok: true, url: `https://${DOMAIN}/blog/old`, status: 200, html, truncated })

type Row = Record<string, unknown>
function db(opts: { styles?: Row[]; articles?: Row[]; project?: Row; profiles?: Row[]; pageMap?: Row[] } = {}) {
  return new FakeAdmin({
    projects: [opts.project ?? { id: PROJECT, user_id: OWNER, name: 'Bakery project', business_name: 'Levi Bakery', target_domain: DOMAIN, language: 'en' }],
    generated_articles: opts.articles ?? [
      { id: ART, project_id: PROJECT, topic_id: null, wp_post_url: null, published_at: null },
      { id: OLD_ART, project_id: PROJECT, topic_id: null, wp_post_url: `https://${DOMAIN}/blog/old`, published_at: '2026-10-01T00:00:00Z' },
    ],
    project_article_styles: opts.styles ?? [{ project_id: PROJECT, user_id: OWNER, design: 'minimal', brand_colors: [], author_box: true, theme_author_box: null, theme_author_box_checked_at: null }],
    project_profiles: opts.profiles ?? [{ project_id: PROJECT, user_id: OWNER, description: DESCRIPTION }],
    site_page_map: opts.pageMap ?? [{ project_id: PROJECT, user_id: OWNER, entries: [{ u: `https://${DOMAIN}/about-us/` }, { u: `https://${DOMAIN}/contact/` }] }],
    content_topics: [],
  })
}
const NOW = new Date('2026-10-16T12:00:00Z')
const count = (s: string) => s.split(`${OWN_CLASS}-title`).length - 1
const styleRow = (d: FakeAdmin, user = OWNER) => (d.tables.project_article_styles as Row[]).find((r) => r.project_id === PROJECT && r.user_id === user) as Row

/** A client whose reads of one column fail as Postgres does while a migration is not applied. */
function missingColumn(base: FakeAdmin, column: string) {
  const error = { code: '42703', message: `column project_article_styles.${column} does not exist` }
  const failing = (): unknown => new Proxy({}, {
    get: (_t, k) => (k === 'then' ? (res: (v: unknown) => void) => res({ data: null, error }) : k === 'maybeSingle' || k === 'single' ? async () => ({ data: null, error }) : () => failing()),
  })
  return new Proxy(base, {
    get(target, k) {
      if (k !== 'from') return (target as unknown as Record<string | symbol, unknown>)[k]
      return (name: string) => {
        const q = target.from(name)
        const select = q.select.bind(q)
        ;(q as unknown as { select: (c?: string) => unknown }).select = (c?: string) => (name === 'project_article_styles' && c?.includes(column) ? failing() : select(c))
        return q
      }
    },
  })
}

async function main() {
  // ── A) the theme test ───────────────────────────────────────────────────
  console.log('A) does the theme already show an author box?')
  check('A1: a known author-box plugin (Simple Author Box) is a box', themeHasAuthorBox(BOX_PAGE))
  for (const [label, html] of [
    ['an author-box class', '<div class="post-author-box"><p>Dana</p></div>'],
    ['an about-the-author id', '<section id="about-the-author"><h3>Dana</h3></section>'],
    ['the block theme biography block', '<div class="wp-block-post-author-biography">Bakes.</div>'],
    ['an author-bio class (single quotes)', "<aside class='entry author_bio'><p>x</p></aside>"],
  ] as const) check(`A2: ${label} is a box`, themeHasAuthorBox(html))
  check('A3: a bare byline (post-author span, rel=author link) is NOT a box', !themeHasAuthorBox(NO_BOX_PAGE))
  check('A4: markers only inside scripts, styles and comments are NOT a box', !themeHasAuthorBox('<style>.author-box{}</style><script>"author-bio"</script><!-- class="about-author" --><p>x</p>'))
  const bio = 'Dana has baked bread for twenty years and teaches weekend sourdough workshops in Haifa.'
  check('A5: a byline-kind element holding a bio paragraph IS a box', themeHasAuthorBox(`<div class="post-author"><img class="avatar" src="https://x.test/a.png"><p>${bio}</p></div>`))
  check('A6: rel="author" inside an aside with a bio IS a box', themeHasAuthorBox(`<aside class="widget"><a rel="author" href="/u/d">Dana</a><p>${bio}</p></aside>`))
  check('A7: rel="author" inside a section that is the whole article is NOT a box', !themeHasAuthorBox(`<section><a rel="author" href="/u/d">Dana</a>${`<p>${bio}</p>`.repeat(30)}</section>`))
  const ours = authorBoxStructure(authorBoxContent({ language: 'en', businessName: 'Levi Bakery', description: DESCRIPTION, domain: DOMAIN })!)
  check('A8: our own box on a page is never counted as the theme\'s', !themeHasAuthorBox(`<article>${ours}</article>`))
  const noStrip = await mutant<typeof import('@/lib/content/author-box/box')>('lib/content/author-box/box.ts', (s) => s.replace(/\n\s*\.replace\(\/<\(script\|style[^\n]*/g, ''))
  check('MUTATION CONTROL: without stripping scripts and styles, A4 would fail', noStrip.themeHasAuthorBox('<script>var t = \'<div class="author-box">\'</script><p>x</p>'))
  const noBioRule = await mutant<typeof import('@/lib/content/author-box/box')>('lib/content/author-box/box.ts', (s) => s.replace('&& holdsBio(innerOf(html, name, tags.lastIndex))', ''))
  check('MUTATION CONTROL: a byline counted as a box (no bio rule) makes A3 fail', noBioRule.themeHasAuthorBox(NO_BOX_PAGE))

  // ── B) the content ──────────────────────────────────────────────────────
  console.log('\nB) the box says only what the project itself says')
  const content = authorBoxContent({ language: 'en', authorName: 'Dana Levi', businessName: 'Levi Bakery', description: DESCRIPTION, domain: DOMAIN, aboutUrl: `https://${DOMAIN}/about-us/` })!
  check('B1: the name is the WordPress author\'s; the line is the description\'s first sentence; the link is the about page',
    content.name === 'Dana Levi' && content.line === 'Family bakery in Haifa baking sourdough since 1998.' && content.link?.url === `https://${DOMAIN}/about-us/` && content.link.label === 'Levi Bakery')
  const allowed = [AUTHOR_BOX_HEADINGS.en, 'Dana Levi', 'Family bakery in Haifa baking sourdough since 1998.']
  const textOf = (h: string) => h.replace(/<[^>]+>/g, '\n').split('\n').map((t) => t.trim()).filter(Boolean)
  const onlyAllowed = (h: string) => textOf(h).every((t) => allowed.includes(t))
  check('B2: every text in the box is one of the allowed sources, and nothing else', onlyAllowed(authorBoxStructure(content)) && textOf(authorBoxStructure(content)).length === 3)
  const fallback = authorBoxContent({ language: 'he', authorName: null, businessName: 'Levi Bakery', description: null, domain: DOMAIN })!
  check('B3: no author known: the business name; no description: no line; the home page link; the heading in the article\'s language',
    fallback.name === 'Levi Bakery' && fallback.line === '' && fallback.link?.url === `https://${DOMAIN}/` && authorBoxStructure(fallback).includes('על הכותב'))
  check('B4: the four headings', AUTHOR_BOX_HEADINGS.he === 'על הכותב' && AUTHOR_BOX_HEADINGS.en === 'About the author' && AUTHOR_BOX_HEADINGS.es === 'Sobre el autor' && AUTHOR_BOX_HEADINGS.pt === 'Sobre o autor')
  check('B5: an about page on another site is never linked', authorBoxContent({ language: 'en', businessName: 'B', domain: DOMAIN, aboutUrl: 'https://evil.example/about' })!.link?.url === `https://${DOMAIN}/`)
  check('B6: no name at all: no box', authorBoxContent({ language: 'en', authorName: '  ', businessName: '', domain: DOMAIN }) === null)
  const hostile = authorBoxStructure(authorBoxContent({ language: 'en', authorName: '<script>alert(1)</script>Dana', businessName: 'B&B "x"', domain: DOMAIN })!)
  const hostileBusiness = authorBoxStructure(authorBoxContent({ language: 'en', authorName: null, businessName: 'B&B "x"', domain: DOMAIN })!)
  check('B7: tags are removed and markup is escaped', !/<script/i.test(hostile) && hostileBusiness.includes('>B&amp;B "x"</a>'))
  // A WordPress login shown as the display name falls back to the business name (japan4u, 2026-10-16).
  const asName = (n: string, language: 'he' | 'en' = 'he') => authorBoxContent({ language, authorName: n, businessName: 'Levi Bakery', domain: DOMAIN })!.name
  check('B7a: a login is never the author name: digits, underscore, dot, @, lowercase, Latin on a Hebrew site',
    ["'japanuco_admin'", 'japan4u_adm', 'j4pan', 'oren.h', 'info@levi.co.il', 'admin', 'Japan'].every((n) => asName(n) === 'Levi Bakery'),
    ['japan4u_adm', 'j4pan', 'oren.h', 'info@levi.co.il', 'admin', 'Japan'].map((n) => asName(n)).join(','))
  check('B7b: a real name stays: two words, Hebrew, or one capitalised English name on an English site',
    asName('Dana Levi') === 'Dana Levi' && asName('דנה לוי') === 'דנה לוי' && asName('דנה') === 'דנה' && asName('Dana', 'en') === 'Dana')
  check('B8: the about page is found among the mapped pages, shortest first, on the project\'s host only',
    findAboutUrl([{ u: 'https://evil.example/about' }, { u: `https://${DOMAIN}/company/about-us/team` }, { u: `https://www.${DOMAIN}/about/` }], DOMAIN) === `https://www.${DOMAIN}/about/`)
  const inventing = await mutant<typeof import('@/lib/content/author-box/box')>('lib/content/author-box/box.ts', (s) => s.replace("escText(c.name)}</a>` : escText(c.name)}</strong>`)", "escText(c.name)}</a>` : escText(c.name)}</strong>, certified expert`)"))
  check('MUTATION CONTROL: a box that adds a claim of its own fails B2', !onlyAllowed(inventing.authorBoxStructure(content)))
  const wholeDescription = await mutant<typeof import('@/lib/content/author-box/box')>('lib/content/author-box/box.ts', (s) => s.replace('const first = (m ? m[0] : text).trim()', 'const first = text.trim()'))
  check('MUTATION CONTROL: the whole description instead of its first sentence fails B1', wholeDescription.descriptionLine(DESCRIPTION) !== descriptionLine(DESCRIPTION))

  // The NAME is the link; no second line with the business name (it repeated the name when the name fell back to it).
  type BoxMod = typeof import('@/lib/content/author-box/box')
  const nameIsAnchor = (m: BoxMod) => {
    const person = m.authorBoxStructure(m.authorBoxContent({ language: 'en', authorName: 'Dana Levi', businessName: 'Levi Bakery', domain: DOMAIN, aboutUrl: `https://${DOMAIN}/about-us/` })!)
    const business = m.authorBoxStructure(m.authorBoxContent({ language: 'en', authorName: null, businessName: 'Levi Bakery', domain: DOMAIN })!)
    const nameLine = (h: string) => h.match(/<p[^>]*data-as="author-name"[^>]*>([\s\S]*?)<\/p>/)?.[1] ?? ''
    return nameLine(person) === `<strong><a data-as="author-link" href="https://${DOMAIN}/about-us/">Dana Levi</a></strong>`
      && nameLine(business) === `<strong><a data-as="author-link" href="https://${DOMAIN}/">Levi Bakery</a></strong>`
  }
  const oneLink = (m: BoxMod) => [
    m.authorBoxContent({ language: 'en', authorName: 'Dana Levi', businessName: 'Levi Bakery', domain: DOMAIN })!,
    m.authorBoxContent({ language: 'he', authorName: null, businessName: 'Levi Bakery', domain: DOMAIN })!,
  ].every((c) => {
    const h = m.authorBoxStructure(c)
    return (h.match(/<a\b/g) ?? []).length === 1 && !h.includes('author-action') && (h.match(/Levi Bakery/g) ?? []).length === (c.name === 'Levi Bakery' ? 1 : 0)
  })
  check('B9: the name line itself is the link (a person, or the business name), to the resolved target', nameIsAnchor(await import('@/lib/content/author-box/box')))
  check('B10: no second link line: one link in the box, the business name never repeated under the name', oneLink(await import('@/lib/content/author-box/box')))
  const oldLinkLine = await mutant<BoxMod>('lib/content/author-box/box.ts', (s) => s.replace("(c.line ? p('author-text', 'text', escText(c.line)) : '') +",
    "(c.line ? p('author-text', 'text', escText(c.line)) : '') + (c.link ? p('author-action', 'link', `<a data-as=\"author-link\" href=\"${escAttr(c.link.url)}\">${escText(c.link.label)}</a>`) : '') +"))
  check('MUTATION CONTROL: the separate bottom link line put back fails B10', !oneLink(oldLinkLine))
  const plainName = await mutant<BoxMod>('lib/content/author-box/box.ts', (s) => s.replace("`<strong>${c.link ? `<a data-as=\"author-link\" href=\"${escAttr(c.link.url)}\">${escText(c.name)}</a>` : escText(c.name)}</strong>`", '`<strong>${escText(c.name)}</strong>`'))
  check('MUTATION CONTROL: a name that is not the anchor fails B9', !nameIsAnchor(plainName))

  // ── C) publishing ───────────────────────────────────────────────────────
  console.log('\nC) publishing: off by default, only where the theme has none, once')
  const noBoxFetch = () => fetcher(page(NO_BOX_PAGE))
  const publish = (d: unknown, f: ReturnType<typeof fetcher>, html = BODY, platform: 'wordpress' | 'shopify' | 'webhook' | 'wix' = 'wordpress', authorName?: () => Promise<string | null>) =>
    applyArticleDesign(d as never, ART, html, platform, { themeDeps: { fetchHtml: f.fn, now: () => NOW }, ...(authorName ? { authorName } : {}) })

  {
    const f = noBoxFetch()
    const out = await publish(db({ styles: [] }), f)
    check('C1: no settings row: no box, the body as before, the site is not fetched', out === BODY && f.calls.length === 0)
  }
  {
    const f = noBoxFetch()
    const out = await publish(db({ styles: [{ project_id: PROJECT, user_id: OWNER, design: 'minimal', brand_colors: [] }] }), f)
    check('C2: a row saved before the switch existed: off', out === BODY && f.calls.length === 0)
  }
  {
    const f = noBoxFetch()
    const out = await publish(db({ styles: [{ project_id: PROJECT, user_id: OWNER, design: 'minimal', brand_colors: [], author_box: null }] }), f)
    check('C3: author_box NULL: off', out === BODY && f.calls.length === 0)
  }
  {
    const f = noBoxFetch()
    const out = await publish(missingColumn(db(), 'author_box'), f)
    check('C4: the column does not exist yet (migration not applied): off, the publish goes on', out === BODY && f.calls.length === 0)
  }
  {
    const d = db()
    const f = fetcher(page(BOX_PAGE))
    const out = await publish(d, f)
    check('C5: on, and the theme has an author box: no box', !out.includes(OWN_CLASS) && f.calls.length === 1)
    check('C6: that answer is cached on the owner\'s row', styleRow(d).theme_author_box === true && styleRow(d).theme_author_box_checked_at === NOW.toISOString())
  }
  let firstOut = ''
  {
    const d = db()
    const f = noBoxFetch()
    firstOut = await publish(d, f, BODY, 'wordpress', async () => 'Dana Levi')
    check('C7: on, and the theme has none: one box, with the WordPress author\'s name', count(firstOut) === 1 && firstOut.includes('Dana Levi') && firstOut.includes(`https://${DOMAIN}/about-us/`))
    check('C8: the old published post (not the home page) is the page that was read', f.calls.length === 1 && f.calls[0] === `https://${DOMAIN}/blog/old`)
    const again = await publish(d, f, BODY, 'wordpress', async () => 'Dana Levi')
    check('C9: republishing the stored body: still one box, and the cache spared a second fetch', count(again) === 1 && again === firstOut && f.calls.length === 1)
    const fromPublished = await publish(d, f, firstOut, 'wordpress', async () => 'Dana Levi')
    check('C10: updating with a body that already carries the box: never a second one', count(fromPublished) === 1)
    styleRow(d).theme_author_box_checked_at = new Date(NOW.getTime() - THEME_CHECK_TTL_MS - 1000).toISOString()
    await publish(d, f)
    check('C11: a cached answer older than 14 days is checked again', f.calls.length === 2)
  }
  {
    const d = db()
    const f = fetcher({ ok: false, reason: 'timeout' })
    const out = await publish(d, f)
    check('C12: the page could not be read: no box', out === BODY && f.calls.length === 1)
    check('C13: "unknown" is cached (NULL), so the site is not hammered', styleRow(d).theme_author_box === null && styleRow(d).theme_author_box_checked_at === NOW.toISOString())
    await publish(d, f)
    check('C14: within a day the unknown answer is reused: no second fetch, still no box', f.calls.length === 1)
  }
  {
    const f = fetcher(page(NO_BOX_PAGE, true))
    const out = await publish(db(), f)
    check('C15: a page cut off at the size cap with no box seen: not a clear "no", no box', out === BODY)
  }
  {
    const f = noBoxFetch()
    const out = await publish(db({ articles: [{ id: ART, project_id: PROJECT, wp_post_url: null, published_at: null }] }), f)
    check('C16: nothing published yet (no page to read): no box, nothing fetched', out === BODY && f.calls.length === 0)
  }
  {
    const f = fetcher(() => { throw new Error('boom') })
    const out = await publish(db(), f)
    check('C17: a fetcher that throws: no box, the publish goes on', out === BODY)
  }
  {
    const f = noBoxFetch()
    const out = await publish(db(), f, BODY, 'wix')
    check('C18: Wix: never a box', out === BODY && f.calls.length === 0)
    const shop = await publish(db({ articles: [{ id: ART, project_id: PROJECT, shopify_article_url: `https://${DOMAIN}/blogs/news/old`, published_at: '2026-10-01T00:00:00Z' }] }), noBoxFetch(), BODY, 'shopify')
    check('C19: a Shopify store gets it like WordPress (its own published article is read)', count(shop) === 1 && shop.includes('Levi Bakery'))
    // MUTATION CONTROL, run by hand: reading the description for Shopify too fails this check.
    check('C19b: a store\'s box leaves out the business description, as its articles do', !shop.includes(DESCRIPTION.split('.')[0]))
  }
  const unknownAsNo = await mutant<typeof import('@/lib/content/author-box/store')>('lib/content/author-box/store.ts', (s) => s.replace("if (answer !== 'no_box') return { add: false, reason: 'theme_unknown' }", "if (answer === 'has_box' && false) return { add: false, reason: 'theme_unknown' }"))
  {
    const d = await unknownAsNo.decideAuthorBox(db() as never, { articleId: ART, projectId: PROJECT, platform: 'wordpress', html: BODY }, { fetchHtml: fetcher({ ok: false, reason: 'dns' }).fn, now: () => NOW })
    check('MUTATION CONTROL: treating an unreadable page as "no box" adds one (so C12 would fail)', d.add === true)
  }
  const nullIsOn = await mutant<typeof import('@/lib/content/author-box/store')>('lib/content/author-box/store.ts', (s) => s.replace('enabled: row[AUTHOR_BOX_COLUMN] === true', 'enabled: row[AUTHOR_BOX_COLUMN] !== false'))
  {
    const s = await nullIsOn.readAuthorBoxSetting(db({ styles: [{ project_id: PROJECT, user_id: OWNER, author_box: null }] }) as never, PROJECT, OWNER)
    check('MUTATION CONTROL: NULL read as on makes C3 fail', s.enabled === true)
  }
  const noOnce = await mutant<typeof import('@/lib/content/article-style/html')>('lib/content/article-style/html.ts', (s) => s.replace('opts.authorBox && !bodyHasAuthorBox(base) ?', 'opts.authorBox ?'))
  {
    const c = authorBoxContent({ language: 'en', businessName: 'Levi Bakery', domain: DOMAIN })!
    const twice = noOnce.styleArticleHtml(noOnce.styleArticleHtml(BODY, { design: 'minimal', colors: [], authorBox: c }), { design: 'minimal', colors: [], authorBox: c })
    check('MUTATION CONTROL: without the "already has one" test an update carries two boxes (so C10 would fail)', count(twice) === 2)
  }
  const wixToo = await mutant<typeof import('@/lib/content/article-style/render')>('lib/content/article-style/render.ts', (s) => s.replace("input.platform === 'wix' ? null : input.authorBox ?? null", 'input.authorBox ?? null'))
  {
    const c = authorBoxContent({ language: 'en', businessName: 'Levi Bakery', domain: DOMAIN })!
    check('MUTATION CONTROL: without the Wix rule a Wix site would get the box (so C18 would fail)', wixToo.designForSite(BODY, { style: DEFAULT_ARTICLE_STYLE, cta: null, platform: 'wix', authorBox: c }).includes(OWN_CLASS))
  }

  // ── D) placement and look ───────────────────────────────────────────────
  console.log('\nD) where it goes and how it looks')
  const c: AuthorBoxContent = authorBoxContent({ language: 'en', businessName: 'Levi Bakery', description: DESCRIPTION, domain: DOMAIN })!
  const cta = { enabled: true, heading: 'Order a loaf', text: '', buttonLabel: 'Order', buttonUrl: `https://${DOMAIN}/order` }
  const withFaq = `${BODY}<h2 id="faq">Frequently asked questions</h2><h3>Is it vegan?</h3><p>Yes, always.</p>`
  const minimal = styleArticleHtml(withFaq, { design: 'minimal', colors: [], cta, authorBox: c })
  check('D1: minimal: the box comes right before the call to action', minimal.indexOf(`${OWN_CLASS}-title`) >= 0 && minimal.indexOf(`${OWN_CLASS}-title`) < minimal.indexOf('Order a loaf'))
  check('D2: minimal: plain paragraphs under a rule, no inline style, no role markers', !/style=|data-as=/.test(minimal) && /<hr \/>|<hr>/.test(minimal))
  const formatted = styleArticleHtml(withFaq, { design: 'formatted', colors: ['#e11d48'], cta, authorBox: c })
  check('D3: formatted: before the call to action, in the brand colours as inline styles', formatted.indexOf(`${OWN_CLASS}-title`) < formatted.indexOf('Order a loaf') && /border-left:5px solid #e11d48/.test(formatted))
  const noCta = styleArticleHtml(withFaq, { design: 'formatted', colors: [], authorBox: c })
  check('D4: no call to action: at the very end of the article', noCta.lastIndexOf(OWN_CLASS) > noCta.indexOf('Yes, always.'))
  const linked = `${BODY}<p>Intro.</p><p>Visit <a href="https://${DOMAIN}/">our shop</a> today.</p>`
  const closing = styleArticleHtml(linked, { design: 'formatted', colors: [], authorBox: c })
  check('D5: before the closing call-to-action box the formatted design makes of a last linked paragraph', closing.indexOf(`${OWN_CLASS}-title`) < closing.indexOf('our shop'))
  check('D6: no scripts, no external CSS, every link https', !/<script|<link|<style/i.test(formatted) && [...formatted.matchAll(/href="([^"]+)"/g)].every((m) => m[1].startsWith('https://')))
  check('D7: off: the body is exactly as before (no author box option)', styleArticleHtml(BODY, { design: 'minimal', colors: [] }) === styleArticleHtml(BODY, { design: 'minimal', colors: [], authorBox: null }))
  const atEnd = await mutant<typeof import('@/lib/content/author-box/box')>('lib/content/author-box/box.ts', (s) => s.replace('return at >= 0 ? body.slice(0, at) + box + body.slice(at) : body + box', 'return body + box'))
  check('MUTATION CONTROL: a box always appended after the call to action fails D1', (() => { const b = atEnd.placeAuthorBox('<p>a</p><div data-as="pcta">x</div>', '<div>BOX</div>'); return b.indexOf('BOX') > b.indexOf('pcta') })())

  // ── E) the ownership filter on every service-role read and write ────────
  console.log('\nE) the ownership filter')
  {
    const decoy = { project_id: PROJECT, user_id: OTHER, design: 'minimal', brand_colors: [], author_box: true, theme_author_box: false, theme_author_box_checked_at: NOW.toISOString() }
    const f = noBoxFetch()
    const out = await publish(db({ styles: [decoy] }), f)
    check('E1: a row of another user for this project is never read as the owner\'s switch', out === BODY && f.calls.length === 0)
    const d = db({ styles: [decoy, { project_id: PROJECT, user_id: OWNER, design: 'minimal', brand_colors: [], author_box: true }] })
    await publish(d, fetcher(page(BOX_PAGE)))
    check('E2: the theme answer is written to the owner\'s row only; the decoy row is untouched', styleRow(d).theme_author_box === true && styleRow(d, OTHER).theme_author_box === false && styleRow(d, OTHER).theme_author_box_checked_at === NOW.toISOString())
    const profiles = [{ project_id: PROJECT, user_id: OTHER, description: 'Injected claim. Award-winning.' }]
    const pageMap = [{ project_id: PROJECT, user_id: OTHER, entries: [{ u: `https://${DOMAIN}/about-evil/` }, { u: `https://${DOMAIN}/about/` }] }]
    const out2 = await publish(db({ profiles, pageMap }), noBoxFetch())
    check('E3: another user\'s profile and site map for this project never reach the box', count(out2) === 1 && !out2.includes('Injected') && !out2.includes('/about/'))
    const offSite = fetcher(page(NO_BOX_PAGE))
    await publish(db({ articles: [{ id: OLD_ART, project_id: PROJECT, wp_post_url: 'https://elsewhere.example/post', published_at: '2026-10-01T00:00:00Z' }] }), offSite)
    check('E4: a published address off the project\'s site is never fetched', offSite.calls.length === 0)
    check('E5: isProjectPage: www and the bare host are the same site; a myshopify host only for Shopify',
      isProjectPage(`https://www.${DOMAIN}/x`, DOMAIN, 'wordpress') && isProjectPage('https://a.myshopify.com/x', DOMAIN, 'shopify') && !isProjectPage('https://a.myshopify.com/x', DOMAIN, 'wordpress') && !isProjectPage('javascript:alert(1)', DOMAIN, 'wordpress'))
  }
  // Source guard: every service-role query of an owner-scoped table names the owner.
  const ownerGuard = (src: string) => {
    const s = strip(src)
    const chains = [...s.matchAll(/\.from\((ARTICLE_STYLE_TABLE|'project_profiles'|'site_page_map')\)([\s\S]*?)(?:\n\s*\n|\n\s*(?:const|if|return|let|\}))/g)]
    return chains.length >= 4 && chains.every((m) => /\.eq\('project_id', projectId\)[\s\S]*\.eq\('user_id', ownerId\)/.test(m[2] ?? ''))
  }
  const storeSrc = read('lib/content/author-box/store.ts')
  check('E6: every project_article_styles / project_profiles / site_page_map query in store.ts names project AND owner', ownerGuard(storeSrc))
  check('E7: the articles read is scoped to the project', /from\('generated_articles'\)[\s\S]{0,120}\.eq\('project_id', projectId\)/.test(strip(storeSrc)))
  check('MUTATION CONTROL: a query without the owner filter fails E6', !ownerGuard(storeSrc.replace(".eq('project_id', projectId)\n      .eq('user_id', ownerId)\n  } catch {\n    // The cache", ".eq('project_id', projectId)\n  } catch {\n    // The cache")))
  const noOwnerWrite = await mutant<typeof import('@/lib/content/author-box/store')>('lib/content/author-box/store.ts', (s) => s.replace(".eq('project_id', projectId)\n      .eq('user_id', ownerId)\n  } catch {\n    // The cache", ".eq('project_id', projectId)\n  } catch {\n    // The cache"))
  {
    const decoy = { project_id: PROJECT, user_id: OTHER, theme_author_box: false, theme_author_box_checked_at: '2026-01-01T00:00:00Z' }
    const d = db({ styles: [decoy, { project_id: PROJECT, user_id: OWNER, author_box: true }] })
    await noOwnerWrite.decideAuthorBox(d as never, { articleId: ART, projectId: PROJECT, platform: 'wordpress', html: BODY }, { fetchHtml: fetcher(page(BOX_PAGE)).fn, now: () => NOW })
    check('MUTATION CONTROL: a cache write without the owner filter changes the decoy row (so E2 would fail)', styleRow(d, OTHER).theme_author_box === true)
  }

  // ── F) the settings switch ──────────────────────────────────────────────
  console.log('\nF) the settings switch')
  const deps = (d: unknown): GuidanceDeps => ({ session: async () => ({ userId: OWNER, db: d as never }), now: () => NOW })
  const settingsDb = () => new FakeAdmin({
    projects: [{ id: PROJECT, user_id: OWNER }],
    project_article_styles: [{ project_id: PROJECT, user_id: OWNER, design: 'formatted', writing_guidance: {} }],
  })
  {
    const d = settingsDb()
    const loaded = await loadWritingGuidance(deps(d), PROJECT)
    check('F1: off by default, and editable', loaded.ok && loaded.data.authorBox === false && loaded.data.authorBoxEditable === true)
    const saved = await saveWritingGuidance(deps(d), PROJECT, { instructions: '', exclusions: [], rules: [], authorBox: true })
    check('F2: switching it on is saved on the owner\'s row, the design untouched', saved.ok && saved.data.authorBox === true && styleRow(d).author_box === true && styleRow(d).design === 'formatted')
    const bad = await saveWritingGuidance(deps(d), PROJECT, { instructions: '', exclusions: [], rules: [], authorBox: 'yes' })
    check('F3: a switch that is not true/false is refused, nothing written', !bad.ok && bad.code === 'invalid_request' && styleRow(d).author_box === true)
    const without = await saveWritingGuidance(deps(d), PROJECT, { instructions: 'x', exclusions: [], rules: [] })
    check('F4: a save without the switch leaves it as it was', without.ok && styleRow(d).author_box === true)
  }
  {
    const d = settingsDb()
    const m = missingColumn(d, 'author_box')
    const loaded = await loadWritingGuidance(deps(m), PROJECT)
    check('F5: the column missing: the switch is off and disabled, the guidance still editable', loaded.ok && loaded.data.authorBox === false && loaded.data.authorBoxEditable === false && loaded.data.editable === true)
    const saved = await saveWritingGuidance(deps(m), PROJECT, { instructions: 'keep', exclusions: [], rules: [], authorBox: true })
    check('F6: ...and a save writes the guidance but not the missing column', saved.ok && !('author_box' in styleRow(d)) && (styleRow(d).writing_guidance as { instructions?: string }).instructions === 'keep')
  }
  const cardSrc = strip(read('components/settings/WritingGuidanceCard.tsx'))
  const cardGuard = (s: string) => /label=\{w\.authorBoxLabel\}/.test(s) && /description=\{w\.authorBoxHint\}/.test(s) && /authorBoxEditable \? \{ authorBox \}/.test(s) && /disabled=\{disabled \|\| !view\.authorBoxEditable\}/.test(s)
  check('F7: the card shows the switch with its one-line hint, sends it only when editable, disables it otherwise', cardGuard(cardSrc))
  check('MUTATION CONTROL: a card without the hint fails F7', !cardGuard(cardSrc.replace('description={w.authorBoxHint}', '')))
  type WG = { authorBoxLabel?: string; authorBoxHint?: string }
  const wg = (l: 'he' | 'en' | 'es' | 'pt-BR') => getDashboardDictionary(l).projectSettings.writingGuidance as unknown as WG
  const langsOk = (get: typeof wg) => (['he', 'en', 'es', 'pt-BR'] as const).every((l) => {
    const t = get(l)
    const ok = !!t.authorBoxLabel?.trim() && !!t.authorBoxHint?.trim()
    return ok && (l === 'he' ? /[א-ת]/.test(t.authorBoxHint!) : !/[א-ת]/.test(`${t.authorBoxLabel}${t.authorBoxHint}`))
  })
  check('F8: the label and hint exist in all four dashboard languages (Hebrew only in Hebrew; English for Shopify)', langsOk(wg))
  check('F9: every hint says it is added only when the theme has none', /רק אם בתבנית/.test(wg('he').authorBoxHint!) && /only when your site's theme has no author box/.test(wg('en').authorBoxHint!) && /Solo se añade si la plantilla/.test(wg('es').authorBoxHint!) && /Só é adicionada se o tema/.test(wg('pt-BR').authorBoxHint!))
  check('MUTATION CONTROL: a language without the strings fails F8', !langsOk((l) => (l === 'es' ? { authorBoxLabel: 'x' } : wg(l))))

  // ── G) the WordPress publishers name the publishing user ─────────────────
  console.log('\nG) the name on the box is the user the post is published as')
  const pluginSrc = strip(read('lib/content/wordpress-plugin-publish.ts'))
  const appSrc = strip(read('lib/content/wordpress-publish.ts'))
  const pluginGuard = (s: string) => /applyArticleDesign\(admin, articleId, content, 'wordpress', \{\s*authorName: \(\) => pluginPublishingUserName\(link, plugin\.version, opts\.authorId, deps\.post\)/.test(s)
    && /function pluginPublishingUserName\([\s\S]{0,300}pluginAuthors\(link[\s\S]{0,120}typeof authorId === 'number' \? authorId : authors\.body\.default/.test(s)
  check('G1: plugin path: the chosen author (author_id, else the plugin default) from the signed /authors list', pluginGuard(pluginSrc))
  check('G2: application password path: the existing post\'s author on update, else the password\'s own user', /applyArticleDesign\(admin, article\.id, content, 'wordpress', \{\s*authorName: \(\) => getPublishingUserName\(creds, opts\.existing\?\.postId \?\? null\)/.test(appSrc))
  const siteUserSrc = strip(read('lib/content/author-box/site-user.ts'))
  const previewLookup = (s: string) => /via === 'plugin'\) return await pluginPublishingUserName\(publisher\.plugin\.link, publisher\.plugin\.version, null\)/.test(s) && /return await getPublishingUserName\(publisher\.creds, null\)/.test(s)
  check('G3: the preview asks the site with the publishers\' own lookups, for a new post', previewLookup(siteUserSrc))
  check('MUTATION CONTROL: a preview lookup of its own (the login, not the display name) fails G3', !previewLookup(siteUserSrc.replace('return await getPublishingUserName(publisher.creds, null)', 'return publisher.creds.username')))
  check('MUTATION CONTROL: a plugin path that ignores the chosen author fails G1', !pluginGuard(pluginSrc.replace('typeof authorId === \'number\' ? authorId : authors.body.default', 'authors.body.default')))

  // ── H) the owner's own name and link, and the preview ───────────────────
  console.log('\nH) the owner\'s own name and link; the preview draws with the publisher\'s resolver')
  {
    const base = { language: 'en' as const, businessName: 'Levi Bakery', description: DESCRIPTION, domain: DOMAIN, aboutUrl: `https://${DOMAIN}/about-us/` }
    const wins = (m: typeof import('@/lib/content/author-box/box')) =>
      m.authorBoxContent({ ...base, nameOverride: 'Dana Cohen', authorName: 'Real Author' })?.name === 'Dana Cohen'
      && m.authorBoxContent({ ...base, nameOverride: 'Dana Cohen', authorName: 'japan4u_adm' })?.name === 'Dana Cohen'
      && m.resolveAuthorName({ ...base, nameOverride: 'Dana Cohen', authorName: 'Real Author' }).source === 'override'
    check('H1: the owner\'s name wins over the WordPress user and the business name', wins(await import('@/lib/content/author-box/box')))
    const noOverride = await mutant<typeof import('@/lib/content/author-box/box')>('lib/content/author-box/box.ts', (s) => s.replace("if (override) return { name: override, source: 'override', rejectedLogin: null }", ''))
    check('MUTATION CONTROL: a resolver that ignores the owner\'s name fails H1', !wins(noOverride))

    const hostileName = authorBoxContent({ ...base, nameOverride: `<b>B&B</b> "x" <script>y</script>${'z'.repeat(200)}` })!
    check('H2: the owner\'s name is cleaned like the picked name (tags out, the 80 limit) and escaped in the box',
      hostileName.name.length <= 80 && !/[<>]/.test(hostileName.name) && hostileName.name.startsWith('B&B "x" y')
      && authorBoxStructure(hostileName).includes('B&amp;B "x" y') && !/<script|<b>/i.test(authorBoxStructure(hostileName)))

    const falls = (m: typeof import('@/lib/content/author-box/box')) => ['', '   ', null, undefined, '<b></b>'].every((o) =>
      JSON.stringify(m.authorBoxContent({ ...base, nameOverride: o, authorName: 'Dana Levi' })) === JSON.stringify(authorBoxContent({ ...base, authorName: 'Dana Levi' }))
      && m.authorBoxContent({ ...base, nameOverride: o, authorName: 'japan4u_adm' })?.name === 'Levi Bakery')
    check('H3: an empty name falls back to the resolver: the WordPress user, or the business name for a login', falls(await import('@/lib/content/author-box/box')))
    const alwaysOverride = await mutant<typeof import('@/lib/content/author-box/box')>('lib/content/author-box/box.ts', (s) => s.replace("const override = cleanAuthorBoxName(input.nameOverride ?? '')", "const override = cleanAuthorBoxName(input.nameOverride ?? '') || 'Author'"))
    check('MUTATION CONTROL: an empty name that does not fall back fails H3', !falls(alwaysOverride))

    const BAD_URLS = ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,x', 'ftp://levi.example/a', 'mailto:a@b.co', '//evil.example/x', '/about', 'https://u:p@evil.example/', 'https://levi.example:8443/', 'https://levi.example/a b', 'https://levi.example/"onmouseover=x', 'http://localhost/', 'https://10.0.0.1/']
    const rejects = (m: typeof import('@/lib/content/author-box/box')) => BAD_URLS.every((u) => m.normalizeAuthorBoxUrl(u) === null)
      && m.authorBoxContent({ ...base, linkUrl: 'javascript:alert(1)' })?.link?.url === `https://${DOMAIN}/about-us/`
    check('H4: a link that is not http(s) to a public host is refused, and the box keeps the about page', rejects(await import('@/lib/content/author-box/box')),
      BAD_URLS.filter((u) => normalizeAuthorBoxUrl(u) !== null).join(' '))
    const anyScheme = await mutant<typeof import('@/lib/content/author-box/box')>('lib/content/author-box/box.ts', (s) => s.replace('  if (!checked) return null\n', '  if (!checked) return raw\n'))
    check('MUTATION CONTROL: a link check that lets other schemes through fails H4', !rejects(anyScheme))
    const own = authorBoxContent({ ...base, linkUrl: 'http://linkedin.example/in/dana' })!
    check('H5: an http or https link wins, http kept as http; empty keeps the about page, else the home page',
      own.link?.url === 'http://linkedin.example/in/dana' && own.link.label === 'Levi Bakery'
      && authorBoxContent({ ...base, linkUrl: 'https://levi.example/team' })!.link?.url === 'https://levi.example/team'
      && authorBoxContent({ ...base, linkUrl: '' })!.link?.url === `https://${DOMAIN}/about-us/`
      && authorBoxContent({ ...base, aboutUrl: null, linkUrl: null })!.link?.url === `https://${DOMAIN}/`)
  }
  {
    const d = settingsDb()
    const loaded = await loadWritingGuidance(deps(d), PROJECT)
    check('H6: the fields start empty, no image, editable', loaded.ok && loaded.data.authorBoxName === '' && loaded.data.authorBoxUrl === '' && loaded.data.authorBoxImage === 'none' && loaded.data.authorBoxOverridesEditable === true)
    const saved = await saveWritingGuidance(deps(d), PROJECT, { instructions: '', exclusions: [], rules: [], authorBoxName: '  Dana <i>Cohen</i> ', authorBoxUrl: 'http://levi.example/team', authorBoxImage: 'site_icon' })
    check('H7: the name (cleaned), the link and the image are saved on the owner\'s row',
      saved.ok && styleRow(d).author_box_name === 'Dana Cohen' && styleRow(d).author_box_url === 'http://levi.example/team' && styleRow(d).author_box_image === 'site_icon' && saved.data.authorBoxName === 'Dana Cohen')
    const bad = await saveWritingGuidance(deps(d), PROJECT, { instructions: 'changed', exclusions: [], rules: [], authorBoxUrl: 'javascript:alert(1)' })
    check('H8: a link that is not http(s) is refused with its own code, nothing written', !bad.ok && bad.code === 'invalid_author_link' && styleRow(d).author_box_url === 'http://levi.example/team' && (styleRow(d).writing_guidance as { instructions?: string }).instructions !== 'changed')
    const badImage = await saveWritingGuidance(deps(d), PROJECT, { instructions: '', exclusions: [], rules: [], authorBoxImage: 'upload' })
    check('H9: an image choice that does not exist yet (upload) is refused', !badImage.ok && badImage.code === 'invalid_request' && styleRow(d).author_box_image === 'site_icon')
    const cleared = await saveWritingGuidance(deps(d), PROJECT, { instructions: '', exclusions: [], rules: [], authorBoxName: '   ', authorBoxUrl: '' })
    check('H10: empty fields clear back to NULL (the resolver\'s choice)', cleared.ok && styleRow(d).author_box_name === null && styleRow(d).author_box_url === null)
  }
  {
    const d = settingsDb()
    const m = missingColumn(d, 'author_box_name')
    const loaded = await loadWritingGuidance(deps(m), PROJECT)
    check('H11: the columns missing: the fields are disabled, the switch and the guidance still editable', loaded.ok && loaded.data.authorBoxOverridesEditable === false && loaded.data.authorBoxEditable === true && loaded.data.editable === true)
    const saved = await saveWritingGuidance(deps(m), PROJECT, { instructions: 'keep', exclusions: [], rules: [], authorBox: true, authorBoxName: 'Dana', authorBoxUrl: 'https://levi.example/', authorBoxImage: 'site_icon' })
    check('H12: ...and a save writes the switch and the guidance, not the missing columns', saved.ok && styleRow(d).author_box === true && !('author_box_name' in styleRow(d)) && !('author_box_url' in styleRow(d)) && !('author_box_image' in styleRow(d)))
  }
  {
    const styles = [{ project_id: PROJECT, user_id: OWNER, design: 'minimal', brand_colors: [], author_box: true, theme_author_box: false, theme_author_box_checked_at: NOW.toISOString(), author_box_name: 'Dana Cohen', author_box_url: 'https://levi.example/team' }]
    let asked = 0
    const out = await publish(db({ styles }), noBoxFetch(), BODY, 'wordpress', async () => { asked++; return 'Real Author' })
    check('H13: publishing uses the owner\'s name and link, without asking the site for its user', out.includes('Dana Cohen') && out.includes('href="https://levi.example/team"') && !out.includes('Real Author') && asked === 0)
    const base = db({ styles: [{ ...styles[0], author_box_name: undefined, author_box_url: undefined }] })
    const fallback = await publish(missingColumn(base, 'author_box_name'), noBoxFetch(), BODY, 'wordpress', async () => 'Dana Levi')
    check('H14: the columns missing: the box is published as before (the WordPress user, the about page)', fallback.includes('Dana Levi') && fallback.includes(`href="https://${DOMAIN}/about-us/"`) && count(fallback) === 1)
  }
  {
    // The preview: the owner's own project first, then the publisher's reader; the card draws with authorBoxContent.
    const { previewAuthorBox } = await import('@/lib/content/author-box/preview')
    const { decideAuthorBox } = await import('@/lib/content/author-box/store')
    type PreviewMod = typeof import('@/lib/content/author-box/preview')
    const styles = [{ project_id: PROJECT, user_id: OWNER, design: 'minimal', brand_colors: [], author_box: true, theme_author_box: false, theme_author_box_checked_at: NOW.toISOString() }]
    const pdeps = (d: FakeAdmin, wpName: string | null, platform: 'wordpress' | 'shopify' | 'wix' = 'wordpress', user = OWNER) => ({
      session: async () => ({ userId: user, db: d as never }), admin: () => d as never, platform: async () => platform, siteUserName: async () => wpName,
      fetchText: (async () => ({ ok: false, reason: 'network' })) as never,
    })
    const same = async (mod: PreviewMod, wpName: string) => {
      const d = db({ styles })
      const p = await mod.previewAuthorBox(pdeps(d, wpName), PROJECT)
      const decision = await decideAuthorBox(d as never, { articleId: ART, projectId: PROJECT, platform: 'wordpress', html: BODY, authorName: async () => wpName }, { now: () => NOW, fetchText: (async () => ({ ok: false, reason: 'network' })) as never })
      return p.ok && decision.add && JSON.stringify(authorBoxContent(p.data.inputs)) === JSON.stringify(decision.content) ? authorBoxContent(p.data.inputs)!.name : null
    }
    const real = await same({ previewAuthorBox } as PreviewMod, 'Dana Levi')
    const login = await same({ previewAuthorBox } as PreviewMod, 'japan4u_adm')
    check('H15: the preview shows exactly what publishing draws: the WordPress user, or the business name for a login', real === 'Dana Levi' && login === 'Levi Bakery', `${real} / ${login}`)
    const blind = await mutant<PreviewMod>('lib/content/author-box/preview.ts', (s) => s.replace("authorName: boxPlatform === 'wordpress' ? () => capped(deps.siteUserName(admin, o.projectId, o.userId), ms, null) : undefined,", 'authorName: undefined,'))
    check('MUTATION CONTROL: a preview that skips the WordPress user lookup fails H15', (await same(blind, 'Dana Levi')) === null)
    const cardSrc2 = strip(read('components/settings/WritingGuidanceCard.tsx'))
    const previewSrc = strip(read('lib/content/author-box/preview.ts'))
    const storeSrc2 = strip(read('lib/content/author-box/store.ts'))
    const sameResolver = (card: string) => /const content = authorBoxContent\(inputs\)/.test(card) && /const who = resolveAuthorName\(inputs\)/.test(card)
      && /\.\.\.preview\.data\.inputs, nameOverride: name, linkUrl: url, imageChoice: image/.test(card)
      && !/looksLikeLogin/.test(card) && /readAuthorBoxInputs\(admin, \{/.test(previewSrc)
      && /const inputs = await readAuthorBoxInputs\([\s\S]{0,200}\)\n\s*const content = authorBoxContent\(inputs\)/.test(storeSrc2)
    check('H16: the card draws the preview with authorBoxContent over the publisher\'s inputs; publishing reads and draws the same way', sameResolver(cardSrc2))
    check('MUTATION CONTROL: a card that picks the name itself fails H16', !sameResolver(cardSrc2.replace('const content = authorBoxContent(inputs)', 'const content = { ...authorBoxContent(inputs)!, name: name || preview.data.inputs.authorName || \'\' }')))
    {
      const d = db({ styles })
      const other = await previewAuthorBox(pdeps(d, 'x', 'wordpress', OTHER), PROJECT)
      const bad = await previewAuthorBox(pdeps(d, 'x'), 'not-a-uuid')
      check('H17: another user\'s project (or a bad id) gets no preview', !other.ok && other.code === 'not_found' && !bad.ok)
      const shop = await previewAuthorBox(pdeps(d, 'Dana Levi'), PROJECT)
      const shopify = await previewAuthorBox(pdeps(d, 'Dana Levi', 'shopify'), PROJECT)
      check('H18: a store is never asked for a WordPress user and gets no description, like its published box', shop.ok && shopify.ok && shopify.data.inputs.authorName === null && shopify.data.inputs.description === null && shopify.data.siteIconAvailable === false && shop.data.siteIconAvailable === true)
      const slow = await previewAuthorBox({ ...pdeps(d, null), siteUserName: () => new Promise<string | null>(() => {}), timeoutMs: 50 }, PROJECT)
      check('H19: a site that does not answer: the preview still comes within the time cap, with the business name', slow.ok && slow.data.inputs.authorName === null && authorBoxContent(slow.data.inputs)?.name === 'Levi Bakery')
    }
  }

  // ── I) the image: none (default) or the site icon ───────────────────────
  console.log('\nI) the image: none by default, or the WordPress site icon')
  {
    const ICON = `https://${DOMAIN}/wp-content/uploads/2026/01/cropped-icon-192x192.png`
    const textFetcher = (index: unknown, media?: unknown) => {
      const calls: string[] = []
      const fn = (async (u: URL) => {
        calls.push(u.toString())
        const body = u.pathname.includes('/media/') ? media : index
        return body === undefined ? { ok: false, reason: 'http_error', status: 404 } : { ok: true, url: u.toString(), status: 200, text: JSON.stringify(body) }
      }) as never
      return { fn, calls }
    }
    const { readWordPressSiteIcon } = await import('@/lib/content/author-box/site-icon')
    const styles = (image: string | undefined, design = 'minimal') => [{ project_id: PROJECT, user_id: OWNER, design, brand_colors: ['#e11d48'], author_box: true, theme_author_box: false, theme_author_box_checked_at: NOW.toISOString(), author_box_image: image }]
    const publishWith = (d: unknown, t: ReturnType<typeof textFetcher>, platform: 'wordpress' | 'shopify' = 'wordpress') =>
      applyArticleDesign(d as never, ART, BODY, platform, { themeDeps: { fetchHtml: noBoxFetch().fn, fetchText: t.fn, now: () => NOW } })

    {
      const t = textFetcher({ site_icon_url: ICON })
      const out = await publishWith(db({ styles: styles('site_icon') }), t)
      const img = out.match(/<img[^>]*>/)?.[0] ?? ''
      check('I1: the site icon chosen: one small img, https, with the business name as alt and explicit width and height',
        img.includes(`src="${ICON}"`) && img.includes('alt="Levi Bakery"') && img.includes('width="56"') && img.includes('height="56"') && t.calls[0] === `https://${DOMAIN}/wp-json/?_fields=site_icon_url,site_icon`, img)
      const formatted = await publishWith(db({ styles: styles('site_icon', 'formatted') }), textFetcher({ site_icon_url: ICON }))
      check('I2: the formatted design draws it round (border-radius half its size)', /<img[^>]*style="border-radius:28px"[^>]*>/.test(formatted) || /<img[^>]*border-radius:28px/.test(formatted))
    }
    {
      const before = await publishWith(db({ styles: styles(undefined) }), textFetcher({ site_icon_url: ICON }))
      const t = textFetcher({ site_icon_url: ICON })
      const none = await publishWith(db({ styles: styles('none') }), t)
      check('I3: no image (the default): the site is not asked, and the box is exactly today\'s', t.calls.length === 0 && none === before && !/<img/.test(none))
      const always = await mutant<typeof import('@/lib/content/author-box/store')>('lib/content/author-box/store.ts', (s) => s.replace("(req.preview || overrides.image === 'site_icon')", '(true)'))
      const t2 = textFetcher({ site_icon_url: ICON })
      await always.decideAuthorBox(db({ styles: styles('none') }) as never, { articleId: ART, projectId: PROJECT, platform: 'wordpress', html: BODY }, { now: () => NOW, fetchText: t2.fn })
      check('MUTATION CONTROL: a reader that fetches the icon without the choice fails I3', t2.calls.length > 0)
    }
    {
      const offSite = ['https://evil.example/icon.png', `http://${DOMAIN}/icon.png`, `https://${DOMAIN}:8443/icon.png`, 'javascript:alert(1)', `https://${DOMAIN}/i.png" onerror="x`]
      const rejects = (m: typeof import('@/lib/content/author-box/box')) => offSite.every((u) => m.normalizeAuthorBoxImage(u, DOMAIN) === null)
        && m.normalizeAuthorBoxImage(`https://www.${DOMAIN}/i.png`, DOMAIN) !== null && m.normalizeAuthorBoxImage('https://i0.wp.com/x/i.png', DOMAIN) !== null
      check('I4: only https on the site\'s own host or WordPress\' CDN', rejects(await import('@/lib/content/author-box/box')))
      const anyHost = await mutant<typeof import('@/lib/content/author-box/box')>('lib/content/author-box/box.ts', (s) => s.replace('if (h !== site && !WP_CDN.test(h)) return null', ''))
      check('MUTATION CONTROL: an image check without the host rule fails I4', !rejects(anyHost))
      const missing = await publishWith(db({ styles: styles('site_icon') }), textFetcher({ site_icon_url: 'https://evil.example/icon.png' }))
      const noIndex = await publishWith(db({ styles: styles('site_icon') }), textFetcher(undefined))
      const before = await publishWith(db({ styles: styles(undefined) }), textFetcher(undefined))
      check('I5: an icon off the site, or no icon at all: no img and no empty markup (the box as without the choice)', missing === before && noIndex === before && !/<img|-photo/.test(missing))
    }
    {
      const viaMedia = await readWordPressSiteIcon(DOMAIN, textFetcher({ site_icon: 42 }, { source_url: ICON }).fn)
      const notNumber = textFetcher({ site_icon: '42/../users' }, { source_url: ICON })
      check('I6: only site_icon (a media id): the media item\'s source_url; anything but a positive id is not followed',
        viaMedia === ICON && (await readWordPressSiteIcon(DOMAIN, notNumber.fn)) === null && notNumber.calls.length === 1)
      const t = textFetcher({ site_icon_url: ICON })
      const store = await publishWith(db({ styles: styles('site_icon') }), t, 'shopify')
      check('I7: a Shopify store: the site is never asked and no image is drawn (the choice is not offered there)', t.calls.length === 0 && !/<img/.test(store))
    }
    const card3 = strip(read('components/settings/WritingGuidanceCard.tsx'))
    const offered = (s: string) => /const offered = \(c: AuthorBoxImageChoice\) => c === 'none' \|\| \(c === 'site_icon' && iconOffered\) \|\| \(c === 'upload' && photoOffered\)/.test(s)
      && /AUTHOR_BOX_IMAGE_CHOICES\.filter\(offered\)/.test(s) && /const shown: AuthorBoxImageChoice = offered\(image\) \? image : 'none'/.test(s) && /image=\{shown\}/.test(s)
    check('I8: the card offers the site icon only where it can be read (WordPress), and previews it', offered(card3) && /const img = content\?\.image \?\?/.test(card3))
    check('MUTATION CONTROL: a card that always offers the site icon fails I8', !offered(card3.replace("(c === 'site_icon' && iconOffered)", "c === 'site_icon'")))
  }

  // ── J) the card's new strings ───────────────────────────────────────────
  console.log('\nJ) every new string in the four dashboard languages')
  {
    const KEYS = ['authorBoxPreviewTitle', 'authorBoxPreviewNote', 'authorBoxPreviewFailed', 'authorBoxPreviewWix', 'authorBoxPreviewNoName', 'authorBoxNameSourceLabel', 'authorBoxSourceOverride', 'authorBoxSourceSiteUser', 'authorBoxSourceBusiness', 'authorBoxSourceLogin', 'authorBoxLinkLabel', 'authorBoxNoLink', 'authorBoxNameLabel', 'authorBoxNameHint', 'authorBoxUrlLabel', 'authorBoxUrlHint', 'authorBoxUrlInvalid', 'authorBoxImageLabel', 'authorBoxImageNone', 'authorBoxImageSiteIcon', 'authorBoxImageHint', 'authorBoxImageMissing', 'authorBoxOverridesUnavailable']
    const dict = (l: 'he' | 'en' | 'es' | 'pt-BR') => getDashboardDictionary(l).projectSettings.writingGuidance as unknown as Record<string, string | undefined>
    const allThere = (get: typeof dict) => (['he', 'en', 'es', 'pt-BR'] as const).every((l) => KEYS.every((k) => {
      const v = get(l)[k]
      return !!v?.trim() && (l === 'he' ? true : !/[א-ת]/.test(v))
    })) && KEYS.filter((k) => !/Image(None|SiteIcon)|LinkLabel|NameSourceLabel/.test(k)).every((k) => /[א-ת]/.test(dict('he')[k]!))
    check('J1: every new string exists in he, en, es and pt-BR (Hebrew only in Hebrew; English for Shopify merchants)', allThere(dict))
    check('J2: the login note names the rejected name', ['he', 'en', 'es', 'pt-BR'].every((l) => dict(l as 'he').authorBoxSourceLogin!.includes('{login}')))
    check('MUTATION CONTROL: a language missing a string fails J1', !allThere((l) => (l === 'pt-BR' ? { ...dict(l), authorBoxUrlInvalid: '' } : dict(l))))
    const cardSrc4 = read('components/settings/WritingGuidanceCard.tsx')
    const used = KEYS.every((k) => cardSrc4.includes(`w.${k}`))
    check('J3: the card uses every one of them (no string typed into the card)', used)
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}

main().catch((err) => { console.error(err); process.exit(1) })

export {}
