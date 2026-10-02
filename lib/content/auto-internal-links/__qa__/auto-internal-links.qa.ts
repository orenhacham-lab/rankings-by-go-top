/**
 * AUTOMATIC INTERNAL LINKS — the guards (wave 8, item 2).
 *
 * Before: internal links needed a per-topic plan the customer approved, then
 * an apply step; on Production most approved links were never inserted and
 * many were off-topic (relevance 0.1 to 0.3) with whole-title anchors. Now the
 * generation adds 2 to 5 links to the site's own live pages by itself, and the
 * article view lists them with a remove button.
 *
 *   A) selection (pure): on-topic pages only (title against the article's
 *      title, keywords and section headings); never the article itself, the
 *      home page, another host, a tag/cart/blog-listing page; never a
 *      one-word modifier or a word most titles share; never the article's own
 *      subject; one page per subject; anchors are words already in the text;
 *      never the intro, a heading, the FAQ or the last paragraph; one link per
 *      paragraph, two paragraphs apart; the anchor-quality check stays clean;
 *      at most 5;
 *   B) the generation step (FakeAdmin): writes the draft only, owner-scoped,
 *      needs a completed/partial fresh mapping, kill switch, never throws;
 *   C) storage and removal: entries are source 'auto', the inbound anchor bank
 *      skips them, the list shows only links still in the body, the DELETE
 *      route removes only an automatic link of an owned article;
 *   D) wiring: every generation path runs the step (not only the opt-in one),
 *      after the approved plan links and before the link network; the article
 *      page lists them and hides the older planned-link panels only for an
 *      article that has automatic links; the card renders; he/en strings.
 *
 * MUTATION CONTROLS for each group. Run: npx tsx lib/content/auto-internal-links/__qa__/auto-internal-links.qa.ts
 */
import { readFileSync, unlinkSync, writeFileSync } from 'fs'
import { join } from 'path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { FakeAdmin } from '@/lib/__qa__/_fake-admin'
import { analyzeAnchorQuality } from '@/lib/content/anchors-check'
import { plainText } from '@/lib/link-network/anchor'
import { readAnchorBank } from '@/lib/content/internal-link-candidates'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import ArticleAutoLinksCard from '@/components/content/ArticleAutoLinksCard'
import { autoLinkCandidates, selectAutoLinks, type AutoLinkArticle } from '../select'
import { autoLinksShown, hasAutoLinks, markAutoRemoved } from '../entries'
import { runAutoInternalLinksStep } from '../step'

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
  const copy = file.replace(/\.tsx?$/, (ext) => `.mut-${process.pid}-${Math.random().toString(36).slice(2, 8)}${ext}`)
  writeFileSync(copy, out)
  try { return (await import(copy)) as T } finally { unlinkSync(copy) }
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const SITE = 'https://travel.example.co.il'
const u = (path: string) => `${SITE}/${path}`
/** Filler that names none of the site's pages. */
const fill = (words: number) => Array.from({ length: words }, (_, i) => ['המטיילים', 'נהנים', 'מהנוף', 'המרהיב', 'ומהאוכל', 'המקומי', 'בכל', 'עונה', 'של', 'השנה'][i % 10]).join(' ')

const MAP = [
  { u: u('okinawa/'), t: 'אוקינאווה' },
  { u: u('hokkaido/'), t: 'הוקאידו' },
  { u: u('tokyo/'), t: 'טוקיו' },
  { u: u('kyoto/'), t: 'קיוטו' },
  { u: u('nature-japan/'), t: 'טבע ביפן' },
  { u: u('trip-guide/'), t: 'מדריך טיולים ליפן' },
  { u: u('budget/'), t: 'טיול ביפן בתקציב מוגבל: 10 טיפים' },
  { u: u('romantic/'), t: 'טיול רומנטי ביפן' },
  { u: u('spring/'), t: 'טיול יפן באביב' },
  { u: u('travel-insurance/'), t: 'ביטוח נסיעות ליפן' },
  { u: u('medical-insurance/'), t: 'ביטוח רפואי ליפן' },
  { u: u('onsen/'), t: 'אונסן יפן: המדריך המלא' },
  { u: u('sushi/'), t: 'סוגי סושי ביפן' },
  { u: u('islands/'), t: 'איים ביפן' }, // the article itself (its slug)
  { u: `${SITE}/`, t: 'יפן &#8211; המדריך המלא' }, // the home page
  { u: u('tag/okinawa/'), t: 'אוקינאווה' },
  { u: u('cart/'), t: 'עגלה' },
  { u: u('blog/'), t: 'בלוג' },
  { u: 'https://other.example.com/okinawa/', t: 'אוקינאווה' },
  { u: 'http://travel.example.co.il/hokkaido-old/', t: 'הוקאידו' },
]

function islandsHtml(opts: { okinawaOnlyInFaq?: boolean } = {}) {
  const okinawa = !opts.okinawaOnlyInFaq
  return [
    `<p>${fill(60)} אוקינאווה והוקאידו הם רק ההתחלה.</p>`,
    `<p>${fill(70)}.</p>`,
    '<h2>איך בוחרים את האי המתאים</h2>',
    `<p>${fill(30)}. ${okinawa ? 'אוקינאווה מתאימה במיוחד לחובבי חופים.' : 'חופים לבנים מחכים לכם.'} ${fill(20)}.</p>`,
    `<p>${fill(30)}. גם בטוקיו יש הרבה מה לראות לפני שממשיכים. ${fill(10)}.</p>`,
    `<p>${fill(30)}. חובבי טבע ימצאו באיים הרבה מסלולים. ${fill(10)}.</p>`,
    '<h2>הוקאידו: מרחבים ושלג</h2>',
    `<p>${fill(30)}. הוקאידו מושלם לחורף ולסקי. ${fill(10)}.</p>`,
    `<p>${fill(40)}.</p>`,
    '<h2>ביטוח נסיעות ותכנון לפני הטיסה</h2>',
    `<p>מומלץ לרכוש ביטוח נסיעות ליפן לפני שיוצאים לדרך. ${fill(210)}.</p>`,
    `<p>${fill(20)}. כדאי לבדוק גם ביטוח רפואי שמכסה פעילות ספורט. ${fill(10)}.</p>`,
    `<p>${fill(30)}. גם בטוקיו יש הרבה מה לראות בדרך חזרה. ${fill(10)}.</p>`,
    '<ul><li>טבלה של אוקינאווה והוקאידו ברשימה</li></ul>',
    '<h2 id="faq">שאלות נפוצות</h2>',
    '<h3>מתי כדאי לטוס?</h3>',
    `<p>${fill(20)}. ${opts.okinawaOnlyInFaq ? 'אוקינאווה נעימה כמעט כל השנה.' : 'כמעט כל השנה נעים.'} ${fill(10)}.</p>`,
    `<p>${fill(20)}. הוקאידו יפה גם בקיץ.</p>`,
  ].join('\n')
}

const islands = (html = islandsHtml()): AutoLinkArticle => ({
  title: 'איים ביפן: המדריך לאיים היפים',
  slug: 'islands',
  primaryKeyword: 'איים ביפן',
  secondaryKeywords: ['חופים ביפן', 'אוקינאווה', 'הוקאידו'],
  html,
  language: 'he',
})

const host = { host: 'travel.example.co.il' }
const paths = (links: { url: string }[]) => links.map((l) => l.url.replace(SITE, '')).sort()

/** Every <p> index that holds a link, and the tag each link sits in. */
function linkPlaces(html: string) {
  const out: { p: number; ok: boolean }[] = []
  const re = /<p(\s[^>]*)?>([\s\S]*?)<\/p\s*>/gi
  let m: RegExpExecArray | null
  let i = 0
  while ((m = re.exec(html))) { if (/<a[\s>]/i.test(m[2])) out.push({ p: i, ok: true }); i++ }
  return out
}

async function main() {
  // ── A) selection ────────────────────────────────────────────────────────────
  console.log('A) selection: on-topic, natural, placed well')
  const cands = autoLinkCandidates(MAP, host, islands())
  const cp = cands.map((c) => c.url)
  check('A1: candidates are the site\'s own content pages: never the article itself, the home page, a tag, cart or blog listing, another host, or http',
    !cp.includes(u('islands/')) && !cp.includes(`${SITE}/`) && !cp.some((x) => /\/(tag|cart|blog)\//.test(x)) && !cp.some((x) => !x.startsWith(`${SITE}/`)) && cp.includes(u('okinawa/')), cp.join(' '))
  const sel = selectAutoLinks(islands(), cands)
  check('A2: the on-topic pages are linked: Okinawa, Hokkaido (the section headings) and travel insurance (its heading and its full phrase)',
    JSON.stringify(paths(sel.links)) === JSON.stringify(['/hokkaido/', '/okinawa/', '/travel-insurance/']), JSON.stringify(sel.links))
  const skippedAs = (path: string) => sel.skipped.find((s) => s.url === u(path))?.reason
  check('A3: Tokyo is mentioned in the body but is not the article\'s topic: not linked', skippedAs('tokyo/') === 'not_relevant')
  check('A4: a one-word modifier page ("טבע ביפן") and a word most titles share ("מדריך טיולים ליפן") are never linked on that word',
    skippedAs('nature-japan/') === 'not_relevant' && skippedAs('trip-guide/') === 'not_relevant')
  check('A5: the anchors are the pages\' own words as they stand in the text', JSON.stringify(sel.links.map((l) => l.anchor).sort()) === JSON.stringify(['אוקינאווה', 'ביטוח נסיעות ליפן', 'הוקאידו'].sort()))
  check('A6: not one word of the article changed (only <a> tags were added)', plainText(sel.html) === plainText(islands().html))
  const places = linkPlaces(sel.html).map((x) => x.p)
  check('A7: never in the intro (before the first H2), the FAQ or the last paragraph; never in a heading or a list',
    places.every((p) => p >= 2 && p <= 11) && !/<h[1-6][^>]*>[^<]*<a /.test(sel.html) && !/<li>[^<]*<a /.test(sel.html), places.join(','))
  check('A8: one link per paragraph, at least two paragraphs apart', places.every((p, i) => i === 0 || p - places[i - 1] >= 2), places.join(','))
  check('A9: "ביטוח רפואי" sits right after the travel-insurance paragraph: not linked there (skipped, not squeezed in)', !paths(sel.links).includes('/medical-insurance/') && ['quality', 'no_anchor'].includes(String(skippedAs('medical-insurance/'))), String(skippedAs('medical-insurance/')))
  check('A10: the article\'s anchor-quality check has no warning', analyzeAnchorQuality(sel.html, 'he').warnings.length === 0, analyzeAnchorQuality(sel.html, 'he').warnings.join(','))
  check('A11: every link is a plain <a href> to https on the site (no rel, class or target added)', (sel.html.match(/<a [^>]*>/g) ?? []).every((a) => /^<a href="https:\/\/travel\.example\.co\.il\/[^"]+">$/.test(a)))
  const again = selectAutoLinks({ ...islands(), html: sel.html }, cands)
  check('A12: run again on its own output: nothing added twice', again.links.length === 0 && (sel.html.match(/<a /g) ?? []).length === 3)
  const faqOnly = selectAutoLinks(islands(islandsHtml({ okinawaOnlyInFaq: true })), cands)
  check('A13: a page mentioned only in the FAQ is not linked there', !paths(faqOnly.links).includes('/okinawa/'), JSON.stringify(faqOnly.links))

  // Two pages on one subject, and the article's own subject.
  const FAMILY_MAP = [
    { u: u('family-a/'), t: 'טיול ביפן עם ילדים: המדריך המלא' },
    { u: u('family-b/'), t: 'טיול ביפן עם ילדים – טיפים למשפחות' },
    { u: u('tokyo/'), t: 'טוקיו' }, { u: u('kyoto/'), t: 'קיוטו' }, { u: u('osaka/'), t: 'אוסקה' },
    { u: u('nara/'), t: 'נארה' }, { u: u('onsen/'), t: 'אונסן ביפן' }, { u: u('sushi/'), t: 'סושי ביפן' },
    { u: u('ramen/'), t: 'ראמן ביפן' }, { u: u('parks/'), t: 'פארקי שעשועים ביפן' },
  ]
  const familyHtml = [
    `<p>${fill(70)}.</p>`, `<p>${fill(70)}.</p>`, '<h2>טיול עם ילדים ביפן</h2>',
    `<p>${fill(30)}. תכנון טיול עם ילדים דורש סבלנות. ${fill(20)}.</p>`, `<p>${fill(40)}.</p>`,
    `<p>${fill(30)}. טיול עם ילדים הוא חוויה מיוחדת. ${fill(20)}.</p>`, `<p>${fill(40)}.</p>`, `<p>${fill(40)}.</p>`,
  ].join('\n')
  const parksArt: AutoLinkArticle = { title: 'פארקי שעשועים ביפן', slug: 'parks', primaryKeyword: 'פארקי שעשועים ביפן', secondaryKeywords: ['טיול עם ילדים'], html: familyHtml, language: 'he' }
  const famSel = selectAutoLinks(parksArt, autoLinkCandidates(FAMILY_MAP, host, parksArt))
  const famLinked = paths(famSel.links).filter((p) => p.startsWith('/family-'))
  check('A14: two pages on the same subject: only one of them is linked', famLinked.length === 1 && famSel.skipped.some((s) => s.url.includes('/family-') && s.reason === 'duplicate'), JSON.stringify(famSel.links))
  const kidsArt: AutoLinkArticle = { ...parksArt, title: 'טיול ביפן עם ילדים: כל מה שצריך', slug: 'kids', primaryKeyword: 'טיול ביפן עם ילדים', secondaryKeywords: [] }
  const kidsSel = selectAutoLinks(kidsArt, autoLinkCandidates(FAMILY_MAP, host, kidsArt))
  check('A15: a page on exactly the article\'s own subject is not linked (cannibalization, not support)',
    kidsSel.links.length === 0 && kidsSel.skipped.filter((s) => s.url.includes('/family-')).every((s) => s.reason === 'same_subject'), JSON.stringify(kidsSel.skipped))
  // At most five.
  const manyMap = ['אוסקה', 'קיוטו', 'נארה', 'נגויה', 'יוקוהמה', 'הירושימה', 'קובה'].map((t, i) => ({ u: u(`city-${i}/`), t }))
  const manyHtml = [`<p>${fill(70)}.</p>`, `<p>${fill(70)}.</p>`, `<h2>${manyMap.map((m) => m.t).join(' ')}</h2>`,
    ...manyMap.flatMap((m) => [`<p>${fill(30)}. ${m.t} שווה ביקור. ${fill(15)}.</p>`, `<p>${fill(210)}.</p>`]), `<p>${fill(20)}.</p>`].join('\n')
  const manyArt: AutoLinkArticle = { title: 'ערים ביפן', slug: 'cities', primaryKeyword: 'ערים ביפן', secondaryKeywords: [], html: manyHtml, language: 'he' }
  const manySel = selectAutoLinks(manyArt, autoLinkCandidates(manyMap, host, manyArt))
  check('A16: at most five links, the rest skipped as over the limit', manySel.links.length === 5 && manySel.skipped.filter((s) => s.reason === 'limit').length === 2, String(manySel.links.length))

  // Mutation controls for A.
  type Sel = typeof import('../select')
  const noRelevance = await mutant<Sel>('lib/content/auto-internal-links/select.ts', (s) => s.replace('if (inTopic.length < Math.ceil(core.length / 2)) {', 'if (false) {'))
  check('MUTATION CONTROL: without the topic check Tokyo is linked from the islands article (so A3 would fail)', paths(noRelevance.selectAutoLinks(islands(), cands).links).includes('/tokyo/'))
  const noSlug = await mutant<Sel>('lib/content/auto-internal-links/select.ts', (s) => s.replace('if (slug && segs[segs.length - 1] === slug) continue', ''))
  check('MUTATION CONTROL: without the own-address check the article\'s own page is a candidate (so A1 would fail)',
    noSlug.autoLinkCandidates([{ u: u('islands/'), t: 'איים ביפן – כל האיים' }], host, islands()).length === 1)
  const noGap = await mutant<Sel>('lib/content/auto-internal-links/select.ts', (s) => s.replace('if ([...used].some((u) => Math.abs(u - p.index) < AUTO_LINK_LIMITS.minParagraphGap)) continue', ''))
  check('MUTATION CONTROL: without the paragraph spacing the medical-insurance link lands right after the travel one (so A8/A9 would fail)',
    paths(noGap.selectAutoLinks(islands(), cands).links).includes('/medical-insurance/'))
  const noFaq = await mutant<Sel>('lib/content/auto-internal-links/select.ts', (s) => s.replace('(faqAt < 0 || p.innerStart < faqAt)', 'true'))
  check('MUTATION CONTROL: without the FAQ exclusion Okinawa is linked inside the FAQ (so A13 would fail)',
    paths(noFaq.selectAutoLinks(islands(islandsHtml({ okinawaOnlyInFaq: true })), cands).links).includes('/okinawa/'))
  const noSubject = await mutant<Sel>('lib/content/auto-internal-links/select.ts', (s) => s.replace("skipped.push({ url: t.url, reason: 'same_subject' }); continue", "void 0").replace('if (ownKeyword.length && ownKeyword.every((k) => inList(k, inAnchor))) continue', ''))
  check('MUTATION CONTROL: without the own-subject checks (page and anchor) a page on the article\'s own subject is linked (so A15 would fail)',
    noSubject.selectAutoLinks(kidsArt, noSubject.autoLinkCandidates(FAMILY_MAP, host, kidsArt)).links.length > 0)

  // ── B) the generation step ──────────────────────────────────────────────────
  console.log('\nB) the generation step')
  const NOW = new Date('2026-09-29T12:00:00Z')
  const OWNER = 'u-owner'
  const PROJECT = 'p-1'
  const ART = 'a-1'
  const world = (over: { map?: Record<string, unknown> | null; article?: Record<string, unknown>; projectOwner?: string; mapHooks?: Record<string, unknown> } = {}) => new FakeAdmin({
    projects: [{ id: PROJECT, user_id: over.projectOwner ?? OWNER, target_domain: 'travel.example.co.il' }],
    generated_articles: [{ id: ART, project_id: PROJECT, topic_id: 't-1', title: islands().title, slug: 'islands', status: 'draft', content_html: islandsHtml(), internal_links_json: [{ anchor: 'בנק', source: 'manual' }], ...over.article }],
    article_topics: [{ id: 't-1', project_id: PROJECT, primary_keyword: 'איים ביפן', secondary_keywords: ['חופים ביפן', 'אוקינאווה', 'הוקאידו'], language: 'he' }],
    site_page_map: over.map === null ? [] : [{ project_id: PROJECT, user_id: OWNER, status: 'completed', finished_at: '2026-09-28T10:00:00Z', site_url: `${SITE}/`, entries: MAP, ...over.map }],
  }, (over.mapHooks ?? {}) as never)
  const deps = { now: () => NOW, env: {} as Record<string, string | undefined> }
  const quiet = console.log
  console.log = () => {}
  const w1 = world()
  const r1 = await runAutoInternalLinksStep(w1 as never, { projectId: PROJECT, userId: OWNER, articleId: ART }, deps)
  const row1 = w1.tables.generated_articles[0] as { content_html: string; internal_links_json: Record<string, unknown>[] }
  const wOther = world({ projectOwner: 'someone-else' })
  const rOther = await runAutoInternalLinksStep(wOther as never, { projectId: PROJECT, userId: OWNER, articleId: ART }, deps)
  const wPub = world({ article: { status: 'published' } })
  const rPub = await runAutoInternalLinksStep(wPub as never, { projectId: PROJECT, userId: OWNER, articleId: ART }, deps)
  const rFailed = await runAutoInternalLinksStep(world({ map: { status: 'failed' } }) as never, { projectId: PROJECT, userId: OWNER, articleId: ART }, deps)
  const rRunning = await runAutoInternalLinksStep(world({ map: { status: 'running' } }) as never, { projectId: PROJECT, userId: OWNER, articleId: ART }, deps)
  const rStale = await runAutoInternalLinksStep(world({ map: { finished_at: '2026-07-01T00:00:00Z' } }) as never, { projectId: PROJECT, userId: OWNER, articleId: ART }, deps)
  const rNoMap = await runAutoInternalLinksStep(world({ map: null }) as never, { projectId: PROJECT, userId: OWNER, articleId: ART }, deps)
  const rOff = await runAutoInternalLinksStep(world() as never, { projectId: PROJECT, userId: OWNER, articleId: ART }, { ...deps, env: { AUTO_INTERNAL_LINKS_DISABLED: 'true' } })
  const rBroken = await runAutoInternalLinksStep(world({ mapHooks: { site_page_map: { select: () => ({ code: 'XX000', message: 'boom' }) } } }) as never, { projectId: PROJECT, userId: OWNER, articleId: ART }, deps)
  console.log = quiet
  check('B1: a fresh completed mapping: the draft gets the links and one "auto" entry per link, earlier entries kept',
    r1.outcome === 'linked' && r1.links === 3 && (row1.content_html.match(/<a /g) ?? []).length === 3
    && row1.internal_links_json.filter((e) => e.source === 'auto').length === 3 && row1.internal_links_json.some((e) => e.source === 'manual')
    && row1.internal_links_json.filter((e) => e.source === 'auto').every((e) => typeof e.anchor === 'string' && typeof e.title === 'string' && e.at === NOW.toISOString()), JSON.stringify(r1))
  check('B2: another owner\'s project is never read or written (owner filter under the service role)', rOther.outcome === 'skipped' && rOther.reason === 'not_found' && !/<a /.test(String(wOther.tables.generated_articles[0].content_html)))
  check('B3: a published article is never changed (drafts only)', rPub.outcome === 'skipped' && rPub.reason === 'not_draft' && !/<a /.test(String(wPub.tables.generated_articles[0].content_html)))
  check('B4: a failed or running mapping, or one older than 30 days, is not used', [rFailed, rRunning].every((r) => r.outcome === 'skipped' && r.reason === 'no_map') && rStale.outcome === 'skipped' && rStale.reason === 'stale_map')
  check('B5: no mapping: nothing happens', rNoMap.outcome === 'skipped' && rNoMap.reason === 'no_map')
  check('B6: kill switch AUTO_INTERNAL_LINKS_DISABLED=true', rOff.outcome === 'skipped' && rOff.reason === 'disabled')
  check('B7: a failing read never throws into generation', rBroken.outcome === 'skipped' && rBroken.reason === 'error')

  type Step = typeof import('../step')
  const noOwner = await mutant<Step>('lib/content/auto-internal-links/step.ts', (s) => s.replace(".eq('id', projectId).eq('user_id', userId).maybeSingle()", ".eq('id', projectId).maybeSingle()"))
  const wm = world({ projectOwner: 'someone-else' })
  console.log = () => {}
  await noOwner.runAutoInternalLinksStep(wm as never, { projectId: PROJECT, userId: OWNER, articleId: ART }, deps)
  console.log = quiet
  check('MUTATION CONTROL: without the owner filter another owner\'s article is written (so B2 would fail)', /<a /.test(String(wm.tables.generated_articles[0].content_html)))
  const noDraft = await mutant<Step>('lib/content/auto-internal-links/step.ts', (s) => s.replace("if (article.status !== 'draft') return { outcome: 'skipped', reason: 'not_draft' }", '').replace(".eq('status', 'draft')", ''))
  const wp = world({ article: { status: 'published' } })
  console.log = () => {}
  await noDraft.runAutoInternalLinksStep(wp as never, { projectId: PROJECT, userId: OWNER, articleId: ART }, deps)
  console.log = quiet
  check('MUTATION CONTROL: without the draft check a published article is changed (so B3 would fail)', /<a /.test(String(wp.tables.generated_articles[0].content_html)))

  // ── C) storage and removal ──────────────────────────────────────────────────
  console.log('\nC) storage and removal')
  const json = [{ anchor: 'בנק', source: 'manual' }, { source: 'auto', anchor: 'אוקינאווה', url: u('okinawa/'), title: 'אוקינאווה', at: 'x' }, { source: 'auto', anchor: 'הוקאידו', url: u('hokkaido/'), title: 'הוקאידו', at: 'x' }]
  check('C1: the inbound anchor bank skips automatic (outgoing) links', JSON.stringify(readAnchorBank(json)) === JSON.stringify(['בנק']))
  const shownHtml = `<p>x <a href="${u('okinawa/')}">אוקינאווה</a></p>`
  check('C2: the list shows only automatic links still in the body, and none once removed',
    JSON.stringify(autoLinksShown(json, shownHtml).map((e) => e.url)) === JSON.stringify([u('okinawa/')]) && autoLinksShown(markAutoRemoved(json, u('okinawa/')), shownHtml).length === 0)
  check('C3: an article with automatic links is recognised (removed ones included); older articles are not', hasAutoLinks(json) && hasAutoLinks(markAutoRemoved(json, u('okinawa/'))) && !hasAutoLinks([{ anchor: 'a', url: u('x/'), source: 'planned' }]) && !hasAutoLinks(null))
  const route = strip(read('app/api/content/articles/[id]/internal-links/route.ts'))
  const del = route.slice(route.indexOf('export async function DELETE'))
  check('C4: DELETE is owner-checked, removes only a link the automatic step added, keeps the words, marks the entry removed',
    /authContentProject\(/.test(del) && /not_auto_link/.test(del) && /autoEntries\(row\.internal_links_json\)\.some\(\(e\) => e\.url === url && !e\.removed\)/.test(del)
    && /removeLink\(html, url\)/.test(del) && /markAutoRemoved\(/.test(del) && /\.eq\('project_id', auth\.project\.id\)/.test(del) && /\^https/.test(del))
  check('C5: saving an anchor to the bank (POST) keeps the article\'s automatic entries', /const kept = autoEntries\(/.test(route) && /\.\.\.kept\]/.test(route))
  type Cand = typeof import('@/lib/content/internal-link-candidates')
  const noSkip = await mutant<Cand>('lib/content/internal-link-candidates.ts', (s) => s.replace("(entry as { source?: unknown }).source === 'auto') continue", "(entry as { source?: unknown }).source === 'never') continue"))
  check('MUTATION CONTROL: without the skip the bank takes the automatic anchors (so C1 would fail)', noSkip.readAnchorBank(json).length === 3)

  // ── D) wiring and the screen ────────────────────────────────────────────────
  console.log('\nD) wiring and the screen')
  const gen = strip(read('lib/content/article-generation.ts'))
  const iStep = gen.indexOf('await runAutoInternalLinksStep(admin, { projectId, userId, articleId: inserted.id })')
  const iApply = gen.indexOf('autoInternalLinks = await autoApplyApprovedLinksToDraft(')
  const iNet = gen.indexOf('await runLinkNetworkStep(')
  const optIn = gen.slice(gen.indexOf('if (opts.autoApplyInternalLinks &&'), iNet)
  const blockEnd = optIn.indexOf('\n  }\n')
  check('D1: every generation path runs the step (outside the manual opt-in), after the approved plan links, before the link network',
    iStep > iApply && iStep < iNet && iApply > 0 && blockEnd > 0 && optIn.indexOf('runAutoInternalLinksStep') > blockEnd, `${iApply} ${iStep} ${iNet}`)
  const page = strip(read('app/(dashboard)/content/articles/[id]/page.tsx'))
  check('D2: the article page lists the automatic links beside the article and hides the older planned-link panels only for an article that has them',
    /<ArticleAutoLinksCard/.test(page) && /const autoLinked = hasAutoLinks\(linksJson\)/.test(page)
    && /plannedLinks\.length > 0 && !autoLinked &&/.test(page) && /linkPlanningOn && projectId && !autoLinked &&/.test(page)
    && /linkPlanningOn && !autoLinked && !isPublished && status === 'draft'/.test(page) && /nextStatus === 'ready' && linkPlanningOn && !autoLinked/.test(page))
  const artRoute = strip(read('app/api/content/articles/[id]/route.ts'))
  check('D2b: the article GET returns the automatic entries (only those) and the page reads them',
    /auto_internal_links: autoEntries\(a\.internal_links_json\)/.test(artRoute) && !/internal_links_json: a\.internal_links_json/.test(artRoute) && /setLinksJson\(Array\.isArray\(a\.auto_internal_links\)/.test(page))
  const he = getDashboardDictionary('he').contentHub.editor.autoLinks
  const en = getDashboardDictionary('en').contentHub.editor.autoLinks
  const card = renderToStaticMarkup(createElement(ArticleAutoLinksCard, { t: he, articleId: ART, linksJson: json, html: shownHtml, isPublished: false, onRemoved: () => {}, onNotify: () => {} }))
  check('D3: the card lists the link that is in the body, in Hebrew, with a labelled remove button; the removed/absent one is not listed',
    card.includes('data-auto-links') && card.includes(u('okinawa/')) && !card.includes(u('hokkaido/')) && card.includes(he.title) && card.includes('הסרת הקישור אל אוקינאווה') && (card.match(/data-auto-link-remove/g) ?? []).length === 1)
  const none = renderToStaticMarkup(createElement(ArticleAutoLinksCard, { t: he, articleId: ART, linksJson: [{ anchor: 'a', source: 'planned', url: u('x/') }], html: shownHtml, isPublished: false, onRemoved: () => {}, onNotify: () => {} }))
  check('D4: an article without automatic links shows no card', none === '')
  const keys = Object.keys(he) as (keyof typeof he)[]
  check('D5: every string exists in Hebrew and English, and the Hebrew is Hebrew', keys.length === 9 && keys.every((k) => !!he[k] && !!en[k] && he[k] !== en[k]) && keys.every((k) => /[א-ת]/.test(he[k])))
  const cardSrc = strip(read('components/content/ArticleAutoLinksCard.tsx'))
  check('D6: the remove button respects reduced motion and has a focus ring', /motion-reduce:transition-none/.test(cardSrc) && /focus-visible:ring/.test(cardSrc))
  const mutPage = page.replace('plannedLinks.length > 0 && !autoLinked &&', 'plannedLinks.length > 0 &&')
  check('MUTATION CONTROL: the planned-link card shown again for a new article is caught (so D2 would fail)', !/plannedLinks\.length > 0 && !autoLinked &&/.test(mutPage))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}

main().catch((e) => { console.error(e); process.exit(1) })

export {}
