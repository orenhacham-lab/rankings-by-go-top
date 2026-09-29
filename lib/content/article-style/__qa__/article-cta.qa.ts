/**
 * THE PROJECT'S CALL TO ACTION — the guards (wave 8, item 1).
 *
 * Root cause (proved read-only on Production, project japan4u.co.il): the
 * project publishes to WordPress with the formatted design, and its published
 * articles' bodies carry no link at all. The formatted design turned "the
 * body's last paragraph, when it links somewhere" into the call-to-action box;
 * the settings preview drew a SAMPLE article whose last paragraph always
 * linked ("רוצים הצעה מ{business}? דברו איתנו"), so the preview always showed a
 * box the real articles never got.
 *
 *   A) the preview no longer invents a box: the sample ends like a generated
 *      article, and with the call to action off, preview, view and site show
 *      none;
 *   B) PREVIEW == PUBLISH: the settings preview (the real component, rendered)
 *      and applyArticleDesign produce the same HTML for the same body, style
 *      and call to action, on every platform: WordPress, webhook and no
 *      platform get the box, Shopify and Wix stay minimal without it;
 *   C) default OFF: no row, '{}', or no column yet = the body exactly as before;
 *   D) safety: https only (no javascript:, data:, http:, credentials, IPs),
 *      texts escaped, a hand-made object with a bad link is never drawn, the
 *      output passes the design's sanitizer, never two boxes;
 *   E) the data layer: strict validation with the field named, one upsert,
 *      the owner's row only, a missing column never takes the design down;
 *   F) wiring: the preview, the article view and publishing all draw through
 *      designForSite; none calls styleArticleHtml on its own.
 *
 * Every group has a MUTATION CONTROL (a deliberately broken copy must fail).
 * Run: npx tsx lib/content/article-style/__qa__/article-cta.qa.ts
 */
import { readFileSync, unlinkSync, writeFileSync } from 'fs'
import { join } from 'path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { FakeAdmin } from '@/lib/__qa__/_fake-admin'
import { sanitizeArticleHtml } from '@/lib/content/article-html'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import ArticleStylePreview, { sampleArticleHtml, sampleCopy } from '@/components/settings/ArticleStylePreview'
import { isCompleteCta, normalizeCtaUrl, parseArticleCtaInput, suggestArticleCta, toArticleCta, type ArticleCta } from '../cta'
import { loadArticleStyle, saveArticleStyle, type ArticleStyleDeps } from '../data'
import { styleArticleHtml } from '../html'
import { applyArticleDesign } from '../publish'
import { designForSite } from '../render'
import type { ArticleStyle, DesignPlatform } from '../types'

let passed = 0
let failed = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { passed++; console.log(`  ✓ ${name}`) } else { failed++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
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
  const ext = rel.endsWith('.tsx') ? '.tsx' : '.ts'
  const copy = file.replace(/\.tsx?$/, `.mut-${process.pid}-${Math.random().toString(36).slice(2, 8)}${ext}`)
  writeFileSync(copy, out)
  try {
    return (await import(copy)) as T
  } finally {
    unlinkSync(copy)
  }
}

const he = getDashboardDictionary('he').projectSettings.articleStyle
const PROJECT = 'a1111111-2222-3333-4444-555555555555'
const OWNER = 'u-owner'
const ART = 'art-1'

/** A generated article's body as japan4u's look (Production, read-only): sections, a table, a FAQ, and no link. */
const GENERATED = [
  '<p><strong>יפן מציעה למשקיעים זרים מגוון רחב של הזדמנויות, בעיקר בשוק הנדל"ן היציב.</strong></p>',
  '<p>בעידן של אי-ודאות כלכלית גלובלית, משקיעים רבים מחפשים יציבות לצד פוטנציאל צמיחה.</p>',
  '<h2 id="section-1">למה דווקא השקעות ביפן?</h2><p>יפן מציעה למשקיעים סביבה כלכלית יציבה במיוחד, מטבע חזק וסיכון פוליטי נמוך.</p>',
  '<h2 id="section-2">נדל"ן ביפן למשקיעים</h2><p>שוק הנדל"ן היפני מאפשר למשקיעים זרים לרכוש נכסים ללא הגבלות משמעותיות.</p>',
  '<h2 id="section-3">אפיקי השקעה בשוק ההון</h2><p>בורסת טוקיו מציעה גישה למגוון רחב של חברות מובילות בעולם וקרנות סל.</p>',
  '<h2 id="section-8">סיכום</h2><p>הדרך להצלחה אינה מהירה או פשוטה. היא דורשת שיעורי בית ופתיחות לתרבות שונה.</p>',
  '<h2 id="faq">שאלות נפוצות</h2><h3 id="faq-q-1">האם זר יכול לרכוש נדל"ן ביפן?</h3><p>כן, באותם תנאים כמו אזרחים יפנים.</p>',
].join('\n')

const CTA: ArticleCta = { enabled: true, heading: 'מתעניינים בטיול ליפן?', text: 'הצוות של Japan4U ישמח לעזור לכם לתכנן.', buttonLabel: 'צרו קשר', buttonUrl: 'https://japan4u.co.il/contact/' }
const STYLE: ArticleStyle = { brandColors: ['#c60035'], design: 'formatted', imageStyle: 'realistic', heroRatio: '16:9', inlineImages: 0, ownImagesOnly: false }
const ctaRow = (c: ArticleCta) => ({ enabled: c.enabled, heading: c.heading, text: c.text, button_label: c.buttonLabel, button_url: c.buttonUrl })

const pubDb = (style: Partial<ArticleStyle> | null, cta: ArticleCta | Record<string, unknown> | null) => new FakeAdmin({
  projects: [{ id: PROJECT, user_id: OWNER }],
  generated_articles: [{ id: ART, project_id: PROJECT }],
  project_article_styles: style ? [{
    project_id: PROJECT, user_id: OWNER, design: style.design, brand_colors: style.brandColors ?? [],
    ...(cta ? { article_cta: 'buttonUrl' in cta ? ctaRow(cta as ArticleCta) : cta } : {}),
  }] : [],
})

/** The article HTML the settings preview draws, rendered from the real component (no inline images: one part). */
function previewHtml(style: ArticleStyle, cta: ArticleCta | null, platform: DesignPlatform, Preview = ArticleStylePreview): string {
  const markup = renderToStaticMarkup(createElement(Preview, { style, cta, platform, domain: 'japan4u.co.il', t: he, locale: 'he', subject: null }))
  const m = markup.match(/<div class="article-content text-copy">([\s\S]*?)<\/div><\/div><\/div><\/div>$/)
  return m?.[1] ?? `NO MATCH: ${markup.slice(-300)}`
}

async function main() {
  const sample = sampleArticleHtml(sampleCopy(he.preview, null))

  // ── A) the preview no longer invents a box ───────────────────────────────
  console.log('\nA) root cause: the preview showed a box the published article never had')
  check('A1: the sample article ends like a generated one: no link in its body', !/<a\b/i.test(sample))
  const offPreview = previewHtml(STYLE, null, 'wordpress')
  check('A2: with the call to action off, the formatted preview draws no call-to-action box', !/background-color:#c60035;border-radius:1[46]px/.test(offPreview) && !offPreview.includes('דברו איתנו'), offPreview.slice(-200))
  const published = await applyArticleDesign(pubDb(STYLE, null) as never, ART, GENERATED, 'wordpress')
  check('A3: a generated article (no link) published formatted: no box either, so preview and site agree', !/margin:40px 0;padding:24px 26px/.test(published) && !/margin:36px 0;padding:22px 24px/.test(published))
  const oldSample = await mutant<typeof import('@/components/settings/ArticleStylePreview')>('components/settings/ArticleStylePreview.tsx', (s) =>
    s.replace("    `<h2 id=\"faq\">", "    `<p>${esc(p.cta)} <a href=\"https://example.com/contact\">${esc(p.ctaLink)}</a></p>`,\n    `<h2 id=\"faq\">"))
  const oldPreview = previewHtml(STYLE, null, 'wordpress', oldSample.default)
  check('MUTATION CONTROL: the old sample (closing on a linked "talk to us") brings the phantom box back (so A2 would fail)',
    /margin:36px 0;padding:22px 24px;background-color:#c60035/.test(oldPreview))

  // ── B) preview == publish, per platform ──────────────────────────────────
  console.log('\nB) the preview and the published article come from one function')
  for (const platform of ['wordpress', 'webhook', 'none'] as const) {
    const pv = previewHtml(STYLE, CTA, platform)
    const pub = await applyArticleDesign(pubDb(STYLE, CTA) as never, ART, sample, platform)
    check(`B1 ${platform}: preview HTML === published HTML, and it carries the call to action`, pv === pub && pub.includes('מתעניינים בטיול ליפן?') && pub.includes('href="https://japan4u.co.il/contact/"'),
      pv === pub ? 'no box' : `preview ${pv.length} vs publish ${pub.length}`)
    const pvMin = previewHtml({ ...STYLE, design: 'minimal' }, CTA, platform)
    const pubMin = await applyArticleDesign(pubDb({ ...STYLE, design: 'minimal' }, CTA) as never, ART, sample, platform)
    check(`B2 ${platform}: minimal design: preview === publish, a plain call to action (no inline style)`, pvMin === pubMin && pubMin.includes('צרו קשר') && !/style=/.test(pubMin))
  }
  for (const platform of ['shopify', 'wix'] as const) {
    const pv = previewHtml(STYLE, CTA, platform)
    const pub = await applyArticleDesign(pubDb(STYLE, CTA) as never, ART, sample, platform)
    check(`B3 ${platform}: stays minimal with no call to action, in the preview and on the site alike`, pv === pub && pub === sample && !pub.includes('צרו קשר'))
  }
  const view = designForSite(GENERATED, { style: STYLE, cta: CTA, platform: 'wordpress', language: 'he' })
  const site = await applyArticleDesign(pubDb(STYLE, CTA) as never, ART, GENERATED, 'wordpress')
  check('B4: the article view (designForSite) draws the published article exactly', view === site)
  check('B5: the box sits right before the FAQ', site.indexOf('מתעניינים בטיול ליפן?') < site.indexOf('id="faq"') && site.indexOf('id="section-8"') < site.indexOf('מתעניינים בטיול ליפן?'))
  const noCtaPublish = await mutant<typeof import('../publish')>('lib/content/article-style/publish.ts', (s) => s.replace('return designForSite(html, { style, cta, platform })', 'return designForSite(html, { style, cta: null, platform })'))
  const brokenPub = await noCtaPublish.applyArticleDesign(pubDb(STYLE, CTA) as never, ART, sample, 'wordpress')
  check('MUTATION CONTROL: a publisher that drops the call to action no longer matches the preview (so B1 would fail)', brokenPub !== previewHtml(STYLE, CTA, 'wordpress'))
  const noPlatformRule = await mutant<typeof import('../cta')>('lib/content/article-style/cta.ts', (s) => s.replace("  if (platform === 'shopify' || platform === 'wix') return null\n  return isCompleteCta", '  return isCompleteCta'))
  check('MUTATION CONTROL: without the Shopify/Wix rule, a Shopify store would get the box (so B3 would fail)', noPlatformRule.siteCta(CTA, 'shopify') !== null)

  // ── C) default off ───────────────────────────────────────────────────────
  console.log('\nC) off by default: the body goes out exactly as before')
  const minimalBody = sanitizeArticleHtml(GENERATED)
  check('C1: no settings row: unchanged', (await applyArticleDesign(pubDb(null, null) as never, ART, minimalBody, 'wordpress')) === minimalBody)
  check('C2: minimal with an empty call to action ({}): unchanged', (await applyArticleDesign(pubDb({ design: 'minimal' }, {}) as never, ART, minimalBody, 'wordpress')) === minimalBody)
  check('C3: minimal with a saved but switched-off call to action: unchanged', (await applyArticleDesign(pubDb({ design: 'minimal' }, { ...CTA, enabled: false }) as never, ART, minimalBody, 'wordpress')) === minimalBody)
  const noColumn = {
    from(t: string) {
      const real = pubDb({ design: 'minimal' }, CTA).from(t)
      return new Proxy(real, { get(target, prop) {
        if (prop !== 'select') return (target as never)[prop]
        return (cols?: string) => {
          if (t === 'project_article_styles' && String(cols ?? '').includes('article_cta')) {
            const q: Record<string, unknown> = {}
            for (const k of ['eq', 'limit', 'maybeSingle', 'single', 'order']) q[k] = () => q
            q.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: null, error: { code: '42703', message: 'column does not exist' } }).then(res)
            return q
          }
          return (target as { select: (c?: string) => unknown }).select(cols)
        }
      } })
    },
  }
  check('C4: the column not there yet (migration not applied): unchanged, no error', (await applyArticleDesign(noColumn as never, ART, minimalBody, 'wordpress')) === minimalBody)
  const sug = suggestArticleCta({ business: 'Japan4U', niche: 'טיולים ליפן', domain: 'www.japan4u.co.il' }, he.cta.suggestion)
  check('C5: the suggestion comes from the business details, is off, and links to the site itself',
    !sug.enabled && sug.heading.includes('טיולים ליפן') && sug.text.includes('Japan4U') && sug.buttonUrl === 'https://www.japan4u.co.il/', JSON.stringify(sug))
  check('C6: a suggestion is never drawn (it is off)', designForSite(minimalBody, { style: { ...STYLE, design: 'minimal' }, cta: sug, platform: 'wordpress' }) === minimalBody)

  // ── D) safety ────────────────────────────────────────────────────────────
  console.log('\nD) safety')
  const refused = ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,<script>', 'http://japan4u.co.il/', 'https://user:pw@japan4u.co.il/', 'https://japan4u.co.il:8443/',
    'https://127.0.0.1/', 'https://localhost/', '//evil.example', '/contact', 'https://evil.example/" onmouseover="x', 'https://evil.example/a b', 'mailto:a@b.c', 'https://intranet/', 'java\tscript:alert(1)']
  const leaked = refused.filter((u) => normalizeCtaUrl(u) !== null)
  check('D1: only https links to a public host are accepted', leaked.length === 0, leaked.join(' | '))
  check('D2: a bare address is read as https', normalizeCtaUrl('japan4u.co.il/contact') === 'https://japan4u.co.il/contact')
  const looseUrl = await mutant<typeof import('../cta')>('lib/content/article-style/cta.ts', (s) => s.replace("  if (/^[a-z][a-z0-9+.-]*:/i.test(raw) && !/^https:\\/\\//i.test(raw)) return null\n", '  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return raw\n'))
  check('MUTATION CONTROL: a scheme check that lets any scheme through passes javascript: (so D1 would fail)', looseUrl.normalizeCtaUrl('javascript:alert(1)') !== null)
  const bad = parseArticleCtaInput({ ...CTA, buttonUrl: 'javascript:alert(1)' })
  check('D3: a save with a javascript: link is refused with the field named', !bad.ok && bad.invalid.join() === 'buttonUrl')
  const incomplete = parseArticleCtaInput({ enabled: true, heading: '', text: '', buttonLabel: '', buttonUrl: '' })
  check('D4: switched on with nothing filled: heading, label and link are named', !incomplete.ok && incomplete.invalid.sort().join() === 'buttonLabel,buttonUrl,heading')
  check('D5: a stored value with a bad link reads as off', !toArticleCta({ enabled: true, heading: 'h', button_label: 'b', button_url: 'javascript:alert(1)' }).enabled)
  const handMade = { ...CTA, buttonUrl: 'javascript:alert(1)' }
  check('D6: a hand-made object with a bad link is never drawn', !isCompleteCta(handMade) && !styleArticleHtml(GENERATED, { design: 'formatted', colors: [], cta: handMade }).includes('javascript'))
  const hostile: ArticleCta = { enabled: true, heading: '<img src=x onerror=alert(1)>כותרת', text: '</p><script>alert(1)</script>', buttonLabel: '"><b>x</b>', buttonUrl: 'https://japan4u.co.il/?a=1&b="2"' }
  const parsedHostile = parseArticleCtaInput(hostile)
  const drawnRaw = styleArticleHtml(GENERATED, { design: 'formatted', colors: ['#c60035'], cta: { ...hostile, buttonUrl: 'https://japan4u.co.il/?a=1&b=2' } })
  check('D7: texts are escaped where drawn: no tag, handler or script gets in', !/<img|<script|<[^>]*\sonerror=|<b>x/i.test(drawnRaw) && drawnRaw.includes('&lt;img src=x onerror=alert(1)&gt;כותרת'), drawnRaw.slice(drawnRaw.indexOf('margin:40px'), drawnRaw.indexOf('margin:40px') + 400))
  check('D8: …and a save strips tags from the texts and refuses the quoted link', !parsedHostile.ok && parsedHostile.invalid.join() === 'buttonUrl')
  const noEscape = await mutant<typeof import('../html')>('lib/content/article-style/html.ts', (s) => s.replace("tag('p', 'pcta-title', `<strong>${escText(cta.heading)}</strong>`)", "tag('p', 'pcta-title', `<strong>${cta.heading}</strong>`)"))
  const unescaped = noEscape.styleArticleHtml(GENERATED, { design: 'formatted', colors: [], cta: { ...CTA, heading: '<img src=x onerror=alert(1)>' } })
  check('MUTATION CONTROL: without escaping the heading, the text is taken as markup (so D7 would fail)', !unescaped.includes('&lt;img src=x onerror=alert(1)&gt;'))
  const endsWithLink = GENERATED.replace('<h2 id="faq">', '<p>לייעוץ <a href="https://japan4u.co.il/">דברו איתנו</a> עוד היום.</p><h2 id="faq">')
  const both = styleArticleHtml(endsWithLink, { design: 'formatted', colors: ['#c60035'], cta: CTA })
  check('D9: never two boxes: with the project call to action on, the linked last paragraph stays a paragraph', !/margin:36px 0;padding:22px 24px/.test(both) && /margin:40px 0;padding:24px 26px/.test(both))
  check('D10: the call to action off, the linked last paragraph still becomes the box (existing behaviour kept)', /margin:36px 0;padding:22px 24px/.test(styleArticleHtml(endsWithLink, { design: 'formatted', colors: ['#c60035'] })))

  // ── E) the data layer ────────────────────────────────────────────────────
  console.log('\nE) saving and reading the call to action')
  const mkDeps = (db: unknown, userId: string | null = OWNER): ArticleStyleDeps => ({ session: async () => ({ userId, db: db as never }), platform: async () => 'wordpress', fetchHome: async () => null })
  const db = new FakeAdmin({ projects: [{ id: PROJECT, user_id: OWNER, target_domain: 'japan4u.co.il' }, { id: 'b1111111-2222-3333-4444-555555555555', user_id: 'other' }], project_article_styles: [] })
  const styleInput = { brandColors: ['#c60035'], design: 'formatted', imageStyle: 'realistic', heroRatio: '16:9', inlineImages: 0, ownImagesOnly: false }
  const fresh = await loadArticleStyle(mkDeps(db), PROJECT)
  check('E1: nothing saved: off, not saved, editable', fresh.ok && !fresh.data.cta.enabled && !fresh.data.ctaSaved && fresh.data.ctaEditable)
  const badSave = await saveArticleStyle(mkDeps(db), PROJECT, { ...styleInput, cta: { ...CTA, buttonUrl: 'http://japan4u.co.il/' } })
  check('E2: an http link is invalid_cta with the field named, and nothing is written', !badSave.ok && badSave.code === 'invalid_cta' && 'invalid' in badSave && badSave.invalid.join() === 'buttonUrl' && (db.tables.project_article_styles ?? []).length === 0)
  const ok = await saveArticleStyle(mkDeps(db), PROJECT, { ...styleInput, cta: CTA })
  const row = (db.tables.project_article_styles as Record<string, unknown>[])[0]
  check('E3: one upsert writes the design and the call to action on the owner\'s row', ok.ok && ok.data.cta.enabled && ok.data.ctaSaved && row?.user_id === OWNER && row?.design === 'formatted' &&
    JSON.stringify(row?.article_cta) === JSON.stringify(ctaRow(CTA)))
  const styleOnly = await saveArticleStyle(mkDeps(db), PROJECT, { ...styleInput, design: 'minimal' })
  check('E4: a save without the call to action keeps it', styleOnly.ok && styleOnly.data.cta.enabled && JSON.stringify((db.tables.project_article_styles as Record<string, unknown>[])[0]?.article_cta) === JSON.stringify(ctaRow(CTA)))
  const theirs = await saveArticleStyle(mkDeps(db), 'b1111111-2222-3333-4444-555555555555', { ...styleInput, cta: CTA })
  check('E5: another user\'s project is not_found', !theirs.ok && theirs.code === 'not_found')
  const missingCol = await loadArticleStyle(mkDeps(noColumnDb(db)), PROJECT)
  check('E6: the column missing: the design still loads and saves; only the call to action is read-only', missingCol.ok && missingCol.data.editable && missingCol.data.saved && !missingCol.data.ctaEditable && !missingCol.data.cta.enabled)

  // ── F) wiring ────────────────────────────────────────────────────────────
  console.log('\nF) one drawing function for the preview, the view and the site')
  const files = {
    preview: strip(read('components/settings/ArticleStylePreview.tsx')),
    view: strip(read('components/content/article-style/StyledArticleBody.tsx')),
    publish: strip(read('lib/content/article-style/publish.ts')),
  }
  const wired = (src: string) => /designForSite\(/.test(src) && !/styleArticleHtml\(/.test(src)
  check('F1: the settings preview draws through designForSite', wired(files.preview))
  check('F2: the article view draws through designForSite', wired(files.view))
  check('F3: publishing draws through designForSite', wired(files.publish))
  check('MUTATION CONTROL: a preview that calls styleArticleHtml on its own is caught', !wired(files.preview.replace('designForSite(sampleArticleHtml(words)', 'styleArticleHtml(sampleArticleHtml(words)')))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exitCode = 1
}

/** The same database, with the article_cta column not there (PostgREST answers 42703 for any select naming it). */
function noColumnDb(db: FakeAdmin) {
  return {
    from(t: string) {
      const real = db.from(t)
      return new Proxy(real, { get(target, prop) {
        if (prop !== 'select') return (target as never)[prop]
        return (cols?: string) => {
          if (t === 'project_article_styles' && String(cols ?? '').includes('article_cta')) {
            const q: Record<string, unknown> = {}
            for (const k of ['eq', 'limit', 'maybeSingle', 'single', 'order']) q[k] = () => q
            q.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: null, error: { code: '42703', message: 'column does not exist' } }).then(res)
            return q
          }
          return (target as { select: (c?: string) => unknown }).select(cols)
        }
      } })
    },
  }
}

void main()

export {}
