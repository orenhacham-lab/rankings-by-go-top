/**
 * ARTICLE DESIGN + OFFICIAL PROFILES — the guards.
 *
 *   A) the formatted HTML builder is safe: no script, no event handler, no
 *      javascript: URL, only the tags WordPress keeps, and inline style ONLY
 *      from STYLE_WHITELIST with values that match its patterns (colours are
 *      #rrggbb); the minimal design is today's sanitized body, unchanged;
 *   B) brand colours are validated as hex at every door (input, stored row,
 *      palette);
 *   C) the image prompt: no setting = the exact old prompt; a style changes the
 *      look; 1:1 asks for a square;
 *   D) the generation step: one call site; defaults = the old behaviour (the
 *      hero only); N inline images spread through the article; "no AI images"
 *      makes none; CONTENT_AUTO_FEATURED_IMAGE=false still turns the hero off;
 *   E) the owner data layer: another user's project is not_found; a missing
 *      table is read-only defaults; invalid input is rejected; saving the
 *      profiles never touches the design and vice versa; the home-page reader
 *      admits the stored domain (normalizeCheckUrl) before any request;
 *   F) publishing: WordPress, the webhook and a Shopify store get the design
 *      (Oren 2026-10-06: the formatted design and the call to action on Shopify
 *      too); Wix stays minimal; Shopify still sanitizes the stored body first;
 *   G) official profiles: per-network URL rules (https, the network's host, a
 *      profile path), detection from a home page, sameAs in the structured
 *      data (article and webhook).
 *
 * Every guard has a MUTATION CONTROL: the same check against a deliberately
 * broken copy of the code (written next to the module, imported, deleted)
 * must fail. Run: npx tsx lib/content/article-style/__qa__/article-style.qa.ts
 */
import { readFileSync, unlinkSync, writeFileSync } from 'fs'
import { join } from 'path'
import { FakeAdmin } from '@/lib/__qa__/_fake-admin'
import { sanitizeArticleHtml } from '@/lib/content/article-html'
import { buildImagePrompt } from '@/lib/content/gemini-image'
import { buildArticleJsonLd } from '@/lib/content/structured-data'
import { buildArticlePayload } from '@/lib/site-platforms/webhook'
import { articlePalette, contrast, sampleSiteColors } from '../colors'
import { loadArticleStyle, readSiteSignals, saveArticleStyle, saveOfficialProfiles, type ArticleStyleDeps } from '../data'
import { runArticleImageStep, spreadSections } from '../generation'
import { STYLE_WHITELIST, keyTakeaways, styleArticleHtml } from '../html'
import { detectProfilesFromHtml, normalizeProfileUrl, parseProfilesInput, sameAsList } from '../profiles'
import { fetchHomeHtml } from '../site-home'
import { applyArticleDesign, composeWebhookBody } from '../publish'
import { FALLBACK_BRAND_COLOR, cleanBrandColors, effectiveDesign, normalizeHex, parseArticleStyleInput, toArticleStyle } from '../types'

let passed = 0
let failed = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { passed++; console.log(`  ✓ ${name}`) } else { failed++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

const ROOT = process.cwd()
const DIR = join(ROOT, 'lib/content/article-style')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')

/** Load a deliberately broken copy of a module in this directory, then delete it. */
async function mutant<T>(file: string, edit: (src: string) => string): Promise<T> {
  const src = readFileSync(join(DIR, file), 'utf8')
  const out = edit(src)
  if (out === src) throw new Error(`mutation of ${file} changed nothing`)
  const name = `.mut-${file.replace(/\.ts$/, '')}-${process.pid}-${Math.random().toString(36).slice(2, 8)}.ts`
  writeFileSync(join(DIR, name), out)
  try {
    return (await import(join(DIR, name))) as T
  } finally {
    unlinkSync(join(DIR, name))
  }
}

// ── The audit: what may be in the design's output ─────────────────────────
const ALLOWED_TAGS = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'strong', 'em', 'b', 'i', 'u', 's', 'a', 'br', 'hr', 'nav', 'blockquote', 'code', 'pre', 'table', 'caption', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'figure', 'figcaption', 'span', 'img', 'div'])
const ALLOWED_ATTRS = new Set(['style', 'href', 'title', 'target', 'rel', 'class', 'dir', 'scope', 'colspan', 'rowspan', 'id', 'aria-label', 'src', 'alt', 'width', 'height', 'loading', 'data-inline-image-id'])

/** Every reason the HTML is not what the design may emit; [] when it is clean. */
function audit(html: string): string[] {
  const bad: string[] = []
  const tagRe = /<\s*([a-zA-Z][a-zA-Z0-9-]*)\b([^>]*)>/g
  let m: RegExpExecArray | null
  while ((m = tagRe.exec(html)) !== null) {
    const tag = m[1]!.toLowerCase()
    if (!ALLOWED_TAGS.has(tag)) bad.push(`tag <${tag}>`)
    const attrRe = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*("([^"]*)"|'([^']*)')/g
    let a: RegExpExecArray | null
    while ((a = attrRe.exec(m[2] ?? '')) !== null) {
      const name = a[1]!.toLowerCase()
      const value = (a[3] ?? a[4] ?? '').replace(/&amp;/g, '&')
      if (!ALLOWED_ATTRS.has(name)) bad.push(`attr ${name} on <${tag}>`)
      // A relative path (no scheme) is what the base sanitizer already allows; any scheme but these is refused.
      if ((name === 'href' || name === 'src') && /^\s*[a-z][a-z0-9+.-]*:/i.test(value) && !/^(https?:|mailto:|tel:)/i.test(value)) bad.push(`url ${value}`)
      if (name === 'style') {
        for (const decl of value.split(';').map((d) => d.trim()).filter(Boolean)) {
          const i = decl.indexOf(':')
          const prop = decl.slice(0, i).trim().toLowerCase()
          const val = decl.slice(i + 1).trim()
          const rules = STYLE_WHITELIST[prop]
          if (!rules) { bad.push(`style property ${prop}`); continue }
          if (!rules.some((r) => r.test(val))) bad.push(`style value ${prop}:${val}`)
          for (const c of val.match(/#[0-9a-zA-Z]+/g) ?? []) if (!/^#[0-9a-f]{6}$/.test(c)) bad.push(`colour ${c}`)
        }
      }
    }
  }
  if (/<script|javascript:|expression\(|url\(/i.test(html)) bad.push('script/url()')
  return bad
}

const ARTICLE = [
  '<p><strong>התשובה הקצרה: ככה בוחרים מזרן נכון.</strong></p><p>פתיחה של המאמר.</p>',
  '<nav class="toc" aria-label="תוכן העניינים"><ul><li><a href="#s1">מה חשוב</a></li></ul></nav>',
  '<h2 id="s1">מה חשוב לדעת</h2><p>מזרן קשיח מדי פוגע ביישור עמוד השדרה ולכן בוחרים קשיות בינונית. עוד.</p>',
  '<h2 id="s2">איך בודקים</h2><p>שוכבים על המזרן לפחות עשר דקות בחנות לפני שמחליטים. ועוד.</p>',
  '<table><thead><tr><th>סוג</th><th>מחיר</th></tr></thead><tbody><tr><td>קפיצים</td><td>2000</td></tr></tbody></table>',
  '<h2 id="s3">כמה זה עולה</h2><p>המחירים נעים בין אלפיים לשמונת אלפים שקלים לפי החומרים. כן.</p>',
  '<h2 id="s4">מתי מחליפים</h2><p>מחליפים מזרן כל שמונה עד עשר שנים, או כשהוא שוקע באמצע. זהו.</p>',
  '<p>לייעוץ חינם <a href="tel:0501234567">התקשרו אלינו</a> עוד היום.</p>',
  '<h2 id="faq">שאלות נפוצות</h2><h3 id="faq-q-1">כמה זמן מחזיק מזרן?</h3><p>בין שמונה לעשר שנים.</p>',
].join('\n')

const HOSTILE = ARTICLE +
  '<script>alert(1)</script><p style="position:fixed;background:url(javascript:alert(1))" onclick="steal()">x</p>' +
  '<a href="javascript:alert(1)">bad</a><img src="x" onerror="alert(1)"><iframe src="https://evil.example"></iframe>' +
  '<div class="evil" data-as="cta" style="color:red">planted role</div><style>body{display:none}</style>'

async function main() {
  // ── A) the builder ────────────────────────────────────────────────────────
  console.log('\nA) the formatted design is safe, and minimal is today\'s body')
  const formatted = styleArticleHtml(HOSTILE, { design: 'formatted', colors: ['#e11d48', '#0f766e'] })
  const issues = audit(formatted)
  check('A1: a hostile body comes out with no script, handler, bad URL, unknown tag/attribute or style outside the whitelist', issues.length === 0, issues.slice(0, 6).join(' | '))
  check('A2: the output does carry the design (inline styles in the brand colour)', /style="[^"]*#e11d48/.test(formatted))
  check('A3: every box is there: in short, key takeaways, framed table, FAQ cards, call to action',
    formatted.includes('בקצרה') && formatted.includes('עיקרי הדברים') && /overflow:auto/.test(formatted) &&
    /<h3 id="faq-q-1" style=/.test(formatted) && /<div style="margin:36px 0;padding:22px 24px;background-color:#e11d48/.test(formatted))
  check('A4: a data-as planted in the stored body cannot claim a role (it is stripped by the first sanitizer)',
    !formatted.includes('planted role') || !/background-color:#e11d48[^"]*"[^>]*>planted role/.test(formatted))
  const minimal = styleArticleHtml(HOSTILE, { design: 'minimal', colors: ['#e11d48'] })
  check('A5: minimal is exactly today\'s sanitized body (no style attribute at all)', minimal === sanitizeArticleHtml(HOSTILE) && !/style=/.test(minimal))
  check('A6: key takeaways are the answer-first sentences, 3 to 4, never the FAQ', keyTakeaways(sanitizeArticleHtml(ARTICLE)).length === 4 && !keyTakeaways(ARTICLE).some((x) => x.includes('שמונה לעשר שנים.') && x.length < 25))
  check('A7: the same stored body always gives the same design (pure)', styleArticleHtml(ARTICLE, { design: 'formatted', colors: ['#e11d48'] }) === styleArticleHtml(ARTICLE, { design: 'formatted', colors: ['#e11d48'] }))
  const en = styleArticleHtml('<p><strong>Short answer here.</strong></p><h2 id="a">One</h2><p>First section answer sentence is here. More.</p>', { design: 'formatted', colors: [] })
  check('A8: an English article gets English labels and left-hand rules', en.includes('In short') && /border-left:4px solid/.test(en) && !/border-right:4px/.test(en))
  check('A9: every whitelisted property is one WordPress keeps (no display, position, url(), logical borders)',
    Object.keys(STYLE_WHITELIST).every((p) => !/^(display|position|background-image|border-inline|inset|z-index|float)/.test(p)))

  // MUTATION CONTROLS
  const noWhitelist = await mutant<typeof import('../html')>('html.ts', (s) => s
    .replace("allowedStyles: { '*': STYLE_WHITELIST },", '')
    .replace("img: 'width:100%;height:auto;border-radius:12px'", "img: 'width:100%;height:auto;border-radius:12px;position:fixed;display:block'"))
  const leaked = audit(noWhitelist.styleArticleHtml(ARTICLE + '<figure class="article-inline-image"><img src="https://x.example/a.jpg" alt=""></figure>', { design: 'formatted', colors: ['#e11d48'] }))
  check('MUTATION CONTROL: without the whitelist pass, a stray `position:fixed` reaches the output and the audit catches it', leaked.some((x) => /position|display/.test(x)), leaked.join(','))
  const noFirstPass = await mutant<typeof import('../html')>('html.ts', (s) => s
    .replace("const base = sanitizeArticleHtml(String(html ?? ''))", "const base = String(html ?? '')")
    .replace("'figure', 'figcaption', 'span', 'img', 'div',\n]", "'figure', 'figcaption', 'span', 'img', 'div', 'script',\n]"))
  const leaked2 = audit(noFirstPass.styleArticleHtml(HOSTILE, { design: 'formatted', colors: ['#e11d48'] }))
  check('MUTATION CONTROL: without the first sanitizer (and script allowed), the audit reports the script', leaked2.some((x) => /script/.test(x)), leaked2.join(','))

  // ── B) colours ────────────────────────────────────────────────────────────
  console.log('\nB) brand colours are hex, at every door')
  check('B1: normalizeHex accepts #abc/#AABBCC/aabbcc and nothing else',
    normalizeHex('#ABC') === '#aabbcc' && normalizeHex('E11D48') === '#e11d48' && normalizeHex('red') === null && normalizeHex('#e11d48;x:y') === null && normalizeHex('url(#e11d48)') === null)
  check('B2: a save carrying a non-hex colour is rejected, not repaired',
    parseArticleStyleInput({ brandColors: ['#e11d48', 'red'], design: 'formatted', imageStyle: 'realistic', heroRatio: '16:9', inlineImages: 0, ownImagesOnly: false }) === null)
  check('B3: a save with 7 colours, an unknown style or 5 images is rejected',
    parseArticleStyleInput({ brandColors: ['#000001', '#000002', '#000003', '#000004', '#000005', '#000006', '#000007'], design: 'formatted', imageStyle: 'realistic', heroRatio: '16:9', inlineImages: 0, ownImagesOnly: false }) === null &&
    parseArticleStyleInput({ brandColors: [], design: 'formatted', imageStyle: 'anime', heroRatio: '16:9', inlineImages: 0, ownImagesOnly: false }) === null &&
    parseArticleStyleInput({ brandColors: [], design: 'formatted', imageStyle: 'realistic', heroRatio: '16:9', inlineImages: 5, ownImagesOnly: false }) === null)
  check('B4: a stored row with junk colours keeps only the valid ones', JSON.stringify(cleanBrandColors(['#E11D48', 'javascript:x', '#0f766e', '#e11d48'])) === '["#e11d48","#0f766e"]')
  const pal = articlePalette(['red;background:url(x)', '#12345g'])
  check('B5: the palette ignores non-hex colours and falls back to the calm blue', pal.brand === FALLBACK_BRAND_COLOR && Object.values(pal).every((c) => /^#[0-9a-f]{6}$/.test(c)))
  const yellow = articlePalette(['#ffe600'])
  check('B6: text drawn in a light brand colour is darkened until it reads on white (4.5:1), and the CTA text picks black', contrast(yellow.text, '#ffffff') >= 4.5 && yellow.brandInk === '#111111')
  const looseTypes = await mutant<typeof import('../types')>('types.ts', (s) => s.replace('const HEX6 = /^#[0-9a-f]{6}$/', 'const HEX6 = /^#.+$/'))
  check('MUTATION CONTROL: with the hex rule loosened, a colour carrying CSS gets through (so B2 would fail)',
    looseTypes.parseArticleStyleInput({ brandColors: ['#e11d48;position:fixed'], design: 'formatted', imageStyle: 'realistic', heroRatio: '16:9', inlineImages: 0, ownImagesOnly: false }) !== null)
  const site = '<meta name="theme-color" content="#0F766E"><style>:root{--brand-primary:#e11d48;--gray:#f3f4f6} .a{color:#e11d48} .b{color:#e11d48} .c{background:#111111}</style><div style="color:#2563eb"></div>'
  const sampled = sampleSiteColors(site)
  check('B7: colours read off a home page: the theme colour first, the brand variable next, greys and near-black left out',
    sampled[0]?.hex === '#0f766e' && sampled[1]?.hex === '#e11d48' && !sampled.some((c) => c.hex === '#f3f4f6' || c.hex === '#111111'), JSON.stringify(sampled))

  // ── C) the image prompt ───────────────────────────────────────────────────
  console.log('\nC) the image prompt')
  const oldPrompt = buildImagePrompt({ title: 'מזרן', imagePrompt: 'bedroom with a mattress' })
  check('C1: no setting is the exact old prompt (photorealistic, LANDSCAPE 16:9, "Do NOT make it a cartoon")',
    oldPrompt.includes('Create a premium, photorealistic EDITORIAL featured image') &&
    oldPrompt.includes('Style: high-end editorial photography, realistic real-world environment, natural lighting, clean uncluttered composition with a clear focal point, shallow depth of field, LANDSCAPE 16:9. It must look expensive') &&
    oldPrompt.includes('Do NOT make it a cartoon, illustration, or 3D render unless the topic clearly requires it. Avoid distorted hands/faces'))
  check('C2: realistic chosen explicitly is identical to no setting', buildImagePrompt({ title: 'מזרן', imagePrompt: 'bedroom with a mattress', style: 'realistic' }) === oldPrompt)
  const water = buildImagePrompt({ title: 'x', imagePrompt: 'bedroom', style: 'watercolor', brandColors: ['#e11d48'], aspectRatio: '1:1' })
  check('C3: watercolour asks for watercolour in the brand palette, square, and keeps the commercial-safety rules',
    /watercolour/.test(water) && !/photorealistic/.test(water) && /#e11d48/.test(water) && /SQUARE 1:1/.test(water) && /COMMERCIAL-SAFETY RULES/.test(water))
  const src = strip(read('lib/content/gemini-image.ts'))
  check("C4: the image request's aspect ratio follows the setting (16:9 unless 1:1)", /aspect_ratio: input\.aspectRatio === '1:1' \? '1:1' : '16:9'/.test(src))

  // ── D) generation ─────────────────────────────────────────────────────────
  console.log('\nD) the generation step')
  const gen = strip(read('lib/content/article-generation.ts'))
  check('D1: generation calls the article-design step exactly once, and the old hero block is gone',
    (gen.match(/runArticleImageStep\(/g) ?? []).length === 1 && !/CONTENT_AUTO_FEATURED_IMAGE/.test(gen) && (gen.match(/deps\.createFeaturedImage\(/g) ?? []).length === 1)
  check('MUTATION CONTROL: a second call site is caught', ((gen + '\nawait runArticleImageStep(admin, x, y)').match(/runArticleImageStep\(/g) ?? []).length === 2)
  const PROJECT = 'a1111111-2222-3333-4444-555555555555', OWNER = 'u-owner', ART = 'art-1'
  const world = (style?: Record<string, unknown>, missing = false) => new FakeAdmin({
    projects: [{ id: PROJECT, user_id: OWNER }],
    generated_articles: [{ id: ART, project_id: PROJECT, content_html: sanitizeArticleHtml(ARTICLE) }],
    article_inline_images: [],
    project_article_styles: style ? [{ project_id: PROJECT, user_id: OWNER, ...style }] : [],
  }, missing ? { project_article_styles: { select: () => ({ code: '42P01', message: 'relation does not exist' }) } } : {})
  const run = async (admin: FakeAdmin, env: Record<string, string> = {}) => {
    const calls = { hero: 0, inline: [] as string[] }
    const r = await runArticleImageStep(admin as never, { articleId: ART, projectId: PROJECT, ownerId: OWNER }, {
      createFeaturedImage: async () => { calls.hero++; return { featured_image_url: 'https://x/h.jpg' } },
      generateInline: async (_a, id) => { calls.inline.push(id); return { ok: true, url: 'https://x/i.jpg' } },
      env,
    })
    return { r, calls, rows: admin.tables.article_inline_images as Record<string, unknown>[] }
  }
  {
    const { r, calls, rows } = await run(world())
    check('D2: no settings = the old behaviour: the hero, and no inline image', calls.hero === 1 && r.imageGenerated && rows.length === 0 && calls.inline.length === 0)
    const missing = await run(world(undefined, true))
    check('D3: the settings table missing = the old behaviour too', missing.calls.hero === 1 && missing.rows.length === 0)
    const two = await run(world({ inline_images: 2, image_style: 'watercolor' }))
    check('D4: two inline images: two rows at the first and last eligible sections, both generated',
      two.rows.length === 2 && two.calls.inline.length === 2 && two.rows[0]?.section_id === 's1' && two.rows[1]?.section_id === 's4' &&
      two.rows.every((x) => x.status === 'pending' && x.user_id === OWNER && x.project_id === PROJECT && String(x.prompt).length > 5), JSON.stringify(two.rows.map((x) => x.section_id)))
    const own = await run(world({ inline_images: 3, own_images_only: true }))
    check('D5: "no AI images" makes neither the hero nor inline images', own.calls.hero === 0 && own.rows.length === 0 && !own.r.imageGenerated)
    const off = await run(world({ inline_images: 1 }), { CONTENT_AUTO_FEATURED_IMAGE: 'false' })
    check('D6: CONTENT_AUTO_FEATURED_IMAGE=false still turns the hero off (inline images still follow the setting)', off.calls.hero === 0 && off.rows.length === 1)
    const other = new FakeAdmin({
      projects: [{ id: PROJECT, user_id: OWNER }],
      generated_articles: [{ id: ART, project_id: PROJECT, content_html: sanitizeArticleHtml(ARTICLE) }],
      article_inline_images: [],
      project_article_styles: [{ project_id: PROJECT, user_id: 'someone-else', inline_images: 4 }],
    })
    const o = await run(other)
    check('D7: a settings row stamped with another user is never read (owner filter under the service role)', o.rows.length === 0)
  }
  check('D8: sections are spread (first, last, between) and never repeated',
    JSON.stringify(spreadSections([1, 2, 3, 4, 5], 3)) === '[1,3,5]' && JSON.stringify(spreadSections([1, 2], 4)) === '[1,2]' && JSON.stringify(spreadSections([1, 2, 3], 1)) === '[2]')
  const noOwnerFilter = await mutant<typeof import('../store')>('store.ts', (s) => s.replace("      .eq('user_id', ownerId)\n      .maybeSingle()\n    if (error) return { state: isMissingRelation", "      .maybeSingle()\n    if (error) return { state: isMissingRelation").replace('|| row.user_id !== ownerId', ''))
  const leakedRead = await noOwnerFilter.readProjectArticleStyle(new FakeAdmin({ project_article_styles: [{ project_id: PROJECT, user_id: 'someone-else', inline_images: 4 }] }) as never, PROJECT, OWNER)
  check('MUTATION CONTROL: without the owner filter, another user\'s row is read (so D7 would fail)', leakedRead.state === 'saved' && leakedRead.style.inlineImages === 4)

  // ── E) the owner data layer ───────────────────────────────────────────────
  console.log('\nE) the settings card\'s server side')
  const USER = 'u-owner'
  const mkDeps = (db: FakeAdmin, userId: string | null = USER, home: string | null = null): ArticleStyleDeps => ({
    session: async () => ({ userId, db: db as never }),
    platform: async () => 'wordpress',
    fetchHome: async () => home,
  })
  const ownerDb = (missing = false) => new FakeAdmin({
    projects: [{ id: PROJECT, user_id: USER, target_domain: 'shop.example' }, { id: 'b1111111-2222-3333-4444-555555555555', user_id: 'other', target_domain: 'other.example' }],
    project_article_styles: [],
  }, missing ? { project_article_styles: { select: () => ({ code: 'PGRST205', message: 'schema cache' }), upsert: () => ({ code: 'PGRST205', message: 'schema cache' }) } } : {})
  {
    const db = ownerDb()
    const theirs = await loadArticleStyle(mkDeps(db), 'b1111111-2222-3333-4444-555555555555')
    check('E1: another user\'s project is not_found', !theirs.ok && theirs.code === 'not_found')
    const signedOut = await loadArticleStyle(mkDeps(db, null), PROJECT)
    check('E2: signed out is unauthorized', !signedOut.ok && signedOut.code === 'unauthorized')
    const fresh = await loadArticleStyle(mkDeps(db), PROJECT)
    check('E3: no row: editable, not saved, defaults (minimal, realistic, 16:9, 0, AI images on)',
      fresh.ok && fresh.data.editable && !fresh.data.saved && fresh.data.style.design === 'minimal' && fresh.data.style.inlineImages === 0 && fresh.data.style.heroRatio === '16:9')
    const input = { brandColors: ['#E11D48'], design: 'formatted', imageStyle: 'clay', heroRatio: '1:1', inlineImages: 3, ownImagesOnly: false }
    const saved = await saveArticleStyle(mkDeps(db), PROJECT, input)
    const row = (db.tables.project_article_styles as Record<string, unknown>[])[0]
    check('E4: a save writes the owner\'s row, lower-case colours, and answers the fresh view',
      saved.ok && saved.data.saved && row?.user_id === USER && JSON.stringify(row?.brand_colors) === '["#e11d48"]' && row?.inline_images === 3)
    const bad = await saveArticleStyle(mkDeps(db), PROJECT, { ...input, brandColors: ['expression(alert(1))'] })
    check('E5: an invalid save is invalid_request and changes nothing', !bad.ok && bad.code === 'invalid_request' && JSON.stringify((db.tables.project_article_styles as Record<string, unknown>[])[0]?.brand_colors) === '["#e11d48"]')
    const prof = await saveOfficialProfiles(mkDeps(db), PROJECT, { facebook: 'facebook.com/shop', x: '' })
    const after = (db.tables.project_article_styles as Record<string, unknown>[])[0]
    check('E6: saving the profiles keeps the design settings (and vice versa)',
      prof.ok && after?.design === 'formatted' && after?.inline_images === 3 && (after?.official_profiles as Record<string, string>)?.facebook === 'https://facebook.com/shop')
    const again = await saveArticleStyle(mkDeps(db), PROJECT, { ...input, design: 'minimal' })
    check('E7: …and saving the design keeps the profiles', again.ok && again.data.profiles.facebook === 'https://facebook.com/shop')
    const badProf = await saveOfficialProfiles(mkDeps(db), PROJECT, { instagram: 'https://www.facebook.com/shop' })
    check('E8: a profile on the wrong network is rejected with the field named', !badProf.ok && badProf.code === 'invalid_profiles' && 'invalid' in badProf && badProf.invalid.join() === 'instagram')
    const missing = ownerDb(true)
    const ro = await loadArticleStyle(mkDeps(missing), PROJECT)
    check('E9: table missing: the card is read-only with the defaults', ro.ok && !ro.data.editable && ro.data.style.design === 'minimal')
    const roSave = await saveArticleStyle(mkDeps(missing), PROJECT, input)
    check('E10: table missing: a save answers unavailable (never a database message)', !roSave.ok && roSave.code === 'unavailable')
    const sig = await readSiteSignals(mkDeps(db, USER, site + '<footer><a href="https://www.instagram.com/shop.il/">ig</a><a href="http://facebook.com/shopil">fb</a></footer>'), PROJECT)
    check('E11: reading the site answers its colours and profile links, and saves nothing',
      sig.ok && sig.colors.length >= 2 && sig.profiles.instagram === 'https://www.instagram.com/shop.il' && sig.profiles.facebook === 'https://facebook.com/shopil')
    const unreachable = await readSiteSignals(mkDeps(db, USER, null), PROJECT)
    check('E12: an unreachable site is a code, not an error text', !unreachable.ok && unreachable.code === 'site_unreachable')

    // E13: the home-page reader admits the stored domain before the first request.
    const asked: string[] = []
    const fakeFetch = (async (u: URL) => { asked.push(u.toString()); return { ok: true, url: u.toString(), status: 200, html: '<html></html>' } }) as never
    const HOSTILE = ['localhost', '127.0.0.1', '169.254.169.254', 'shop.example.com:8080', 'user:pw@shop.example.com', 'metadata.google.internal', '[::1]', 'intranet']
    const hostile: (string | null)[] = []
    for (const d of HOSTILE) hostile.push(await fetchHomeHtml(d, fakeFetch))
    check('E13: an internal, IP, port or credentialed domain is refused before any request', hostile.every((h) => h === null) && asked.length === 0, asked.join(', '))
    const fine = await fetchHomeHtml('shop.example.com', fakeFetch)
    check('E14: a public domain is fetched at the admitted URL', fine === '<html></html>' && asked.join() === 'https://shop.example.com/', asked.join())
    const noGuard = await mutant<typeof import('../site-home')>('site-home.ts', (src) => src.replace('if (!u.ok) return null', "if (!u.ok) return fetchHtml(new URL(`https://${domain}/`)).then((p) => (p.ok ? p.html : null)).catch(() => null)"))
    asked.length = 0
    for (const d of HOSTILE) await noGuard.fetchHomeHtml(d, fakeFetch)
    check('MUTATION CONTROL: admission skipped → internal hosts are requested (so E13 would fail)', asked.length > 0, asked.join(', '))
    const publicDb = new FakeAdmin({ projects: [{ id: PROJECT, user_id: USER, target_domain: 'www.shop-il.co.il' }], project_article_styles: [] })
    const read15 = await readSiteSignals({ ...mkDeps(publicDb), fetchHome: (d) => fetchHomeHtml(d, fakeFetch) }, PROJECT)
    check('E15: readSiteSignals over the admitted reader still reads a public site', read15.ok)
    const internalDb = new FakeAdmin({ projects: [{ id: PROJECT, user_id: USER, target_domain: '127.0.0.1' }], project_article_styles: [] })
    asked.length = 0
    const internal = await readSiteSignals({ ...mkDeps(internalDb), fetchHome: (d) => fetchHomeHtml(d, fakeFetch) }, PROJECT)
    check('E16: a project whose domain is internal answers the fixed code (site_unreachable), nothing fetched', !internal.ok && internal.code === 'site_unreachable' && asked.length === 0)
    const actions = strip(read('app/(dashboard)/settings/article-style-actions.ts'))
    const wired = (src: string) => /fetchHome:\s*\(domain\)\s*=>\s*fetchHomeHtml\(domain\)/.test(src) && !/fetchSiteHtml|new URL\(/.test(src)
    check('E17: the live action reads the home page only through fetchHomeHtml', wired(actions))
    check('MUTATION CONTROL: the old direct fetch back in the action → caught', !wired(actions.replace('fetchHome: (domain) => fetchHomeHtml(domain),', 'fetchHome: async (domain) => { const page = await fetchSiteHtml(new URL(`https://${domain}/`)); return page.ok ? page.html : null },')))
  }

  // ── F) publishing ─────────────────────────────────────────────────────────
  console.log('\nF) publishing')
  const pubDb = (style: Record<string, unknown> | null, missing = false) => new FakeAdmin({
    projects: [{ id: PROJECT, user_id: OWNER }],
    generated_articles: [{ id: ART, project_id: PROJECT }],
    project_article_styles: style ? [{ project_id: PROJECT, user_id: OWNER, ...style }] : [],
    article_inline_images: [
      { id: 'img1', article_id: ART, section_id: 's2', alt_text: 'a', caption: null, storage_url: 'https://cdn.example/1.jpg', wp_media_url: null, position: 0, status: 'ready' },
      { id: 'img2', article_id: ART, section_id: 's3', alt_text: 'b', caption: null, storage_url: null, wp_media_url: null, position: 1, status: 'failed' },
    ],
  }, missing ? { project_article_styles: { select: () => ({ code: '42P01' }) } } : {})
  const body = sanitizeArticleHtml(ARTICLE)
  const wp = await applyArticleDesign(pubDb({ design: 'formatted', brand_colors: ['#e11d48'] }) as never, ART, body, 'wordpress')
  check('F1: WordPress gets the formatted design when the project chose it', /style="/.test(wp) && audit(wp).length === 0)
  check('F2: minimal, no row, or no table: the WordPress body is exactly as before',
    (await applyArticleDesign(pubDb({ design: 'minimal' }) as never, ART, body, 'wordpress')) === body &&
    (await applyArticleDesign(pubDb(null) as never, ART, body, 'wordpress')) === body &&
    (await applyArticleDesign(pubDb(null, true) as never, ART, body, 'wordpress')) === body)
  const shop = await applyArticleDesign(pubDb({ design: 'formatted', brand_colors: ['#e11d48'] }) as never, ART, body, 'shopify')
  check('F3: Wix always gets the minimal design; a Shopify store gets the design the project chose',
    effectiveDesign({ design: 'formatted' }, 'wix') === 'minimal' && (await applyArticleDesign(pubDb({ design: 'formatted' }) as never, ART, body, 'wix')) === body &&
    effectiveDesign({ design: 'formatted' }, 'shopify') === 'formatted' && /style="/.test(shop) && audit(shop).length === 0 &&
    (await applyArticleDesign(pubDb({ design: 'minimal' }) as never, ART, body, 'shopify')) === body)
  const hook = await composeWebhookBody(pubDb({ design: 'formatted', brand_colors: ['#e11d48'] }) as never, ART, body)
  check('F4: the webhook body carries the ready inline image (https) and the design, never a failed one',
    hook.includes('https://cdn.example/1.jpg') && !hook.includes('img2') && /style="/.test(hook) && audit(hook).length === 0)
  const wpSrc = strip(read('lib/content/wordpress-publish.ts'))
  check('F5: WordPress applies the design after the inline images, in one place',
    (wpSrc.match(/applyArticleDesign\(/g) ?? []).length === 1 && wpSrc.indexOf("injectInlineImages(content, images, 'publish')") < wpSrc.indexOf('applyArticleDesign('))
  // Shopify (Oren 2026-10-06): the store gets the project's design and call to
  // action, applied ONCE, after the publisher's own sanitizer and the inline
  // images, so nothing from the stored body skips sanitizing and the design's
  // own sanitizer is the last thing the HTML passes.
  const shopifySrc = strip(read('lib/shopify/publish-article.ts'))
  const shopifyOrder = (src: string) => {
    const san = src.indexOf("sanitizeArticleHtml(String(article.content_html || ''))")
    const inj = src.indexOf("injectInlineImages(sanitized, images, 'preview')")
    const des = src.indexOf('applyArticleDesign(')
    return san >= 0 && inj > san && des > san && (src.match(/applyArticleDesign\(/g) ?? []).length === 1 &&
      /applyArticleDesign\(admin[^,]*, article\.id, injectInlineImages\(sanitized, images, 'preview'\), 'shopify'\)/.test(src) &&
      !/styleArticleHtml|designForSite/.test(src)
  }
  check('F6: Shopify sanitizes the stored body, adds the inline images, then applies the design once', shopifyOrder(shopifySrc))
  check('MUTATION CONTROL: a Shopify publisher that styles the raw body is caught',
    !shopifyOrder(shopifySrc.replace("injectInlineImages(sanitized, images, 'preview'), 'shopify')", "String(article.content_html || ''), 'shopify')")))
  check('MUTATION CONTROL: a Shopify publisher that calls the styler directly is caught',
    !shopifyOrder(shopifySrc + "\nconst x = styleArticleHtml(body)"))

  // ── G) official profiles ──────────────────────────────────────────────────
  console.log('\nG) official profiles')
  const ok = (n: Parameters<typeof normalizeProfileUrl>[0], u: string, want?: string) => normalizeProfileUrl(n, u) === (want ?? u)
  check('G1: real profile URLs are accepted per network',
    ok('facebook', 'https://www.facebook.com/acme.il') && ok('instagram', 'https://www.instagram.com/acme_il') &&
    ok('linkedin', 'https://www.linkedin.com/company/acme') && ok('x', 'https://twitter.com/acme') && ok('x', 'https://x.com/acme') &&
    ok('youtube', 'https://www.youtube.com/@acme') && ok('tiktok', 'https://www.tiktok.com/@acme') &&
    ok('wikidata', 'https://www.wikidata.org/wiki/Q42') && ok('wikipedia', 'https://he.wikipedia.org/wiki/%D7%90') &&
    ok('google_business', 'https://maps.app.goo.gl/AbC123') && ok('google_business', 'https://www.google.com/maps?cid=123456'))
  check('G2: normalised: https added to a bare address, trailing slash and hash and tracking query dropped',
    normalizeProfileUrl('facebook', 'facebook.com/acme/?utm_source=x#top') === 'https://facebook.com/acme')
  check('G3: refused: http, javascript:, credentials, a port, a look-alike host, the wrong network, a bare home page',
    normalizeProfileUrl('facebook', 'http://facebook.com/acme') === null &&
    normalizeProfileUrl('facebook', 'javascript:alert(1)') === null &&
    normalizeProfileUrl('facebook', 'https://user:pw@facebook.com/acme') === null &&
    normalizeProfileUrl('facebook', 'https://facebook.com:8443/acme') === null &&
    normalizeProfileUrl('facebook', 'https://facebook.com.evil.example/acme') === null &&
    normalizeProfileUrl('facebook', 'https://evilfacebook.com/acme') === null &&
    normalizeProfileUrl('instagram', 'https://www.facebook.com/acme') === null &&
    normalizeProfileUrl('facebook', 'https://www.facebook.com/') === null &&
    normalizeProfileUrl('facebook', 'https://www.facebook.com/sharer/sharer.php?u=x') === null &&
    normalizeProfileUrl('google_business', 'https://www.google.com/search?q=acme') === null &&
    normalizeProfileUrl('wikidata', 'https://www.wikidata.org/wiki/Special:Search') === null)
  check('G4: a save with an unknown network is refused outright', !parseProfilesInput({ myspace: 'https://myspace.com/acme' }).ok)
  const looseHost = await mutant<typeof import('../profiles')>('profiles.ts', (s) => s.replace("facebook: { hosts: /^(?:facebook\\.com|fb\\.com)$/", 'facebook: { hosts: /(?:facebook\\.com|fb\\.com)/'))
  check('MUTATION CONTROL: with the host anchor removed, a look-alike host gets through (so G3 would fail)',
    looseHost.normalizeProfileUrl('facebook', 'https://facebook.com.evil.example/acme') !== null)
  const home = '<header><a href="https://www.facebook.com/sharer/sharer.php?u=x">share</a></header><footer>' +
    '<a class="s" href="https://www.facebook.com/acme.il/">Facebook</a><a href="https://instagram.com/acme_il">ig</a>' +
    '<a href="https://www.youtube.com/watch?v=abc">video</a><a href="https://www.youtube.com/@acme">yt</a>' +
    '<a href="https://www.linkedin.com/company/acme/about/">in</a><a href="javascript:void(0)">x</a></footer>'
  const found = detectProfilesFromHtml(home)
  check('G5: detection from the home page takes profile links, skips share buttons and single videos',
    found.facebook === 'https://www.facebook.com/acme.il' && found.instagram === 'https://instagram.com/acme_il' &&
    found.youtube === 'https://www.youtube.com/@acme' && found.linkedin === 'https://www.linkedin.com/company/acme/about' && !found.x, JSON.stringify(found))
  const ld = buildArticleJsonLd({ headline: 'H', publisher: { name: 'Acme', url: 'acme.example', sameAs: sameAsList({ facebook: 'https://facebook.com/acme', x: 'https://x.com/acme' }) } })
  const org = ld?.publisher as Record<string, unknown> | undefined
  check('G6: the article\'s structured data lists the profiles as the publisher\'s sameAs', JSON.stringify(org?.sameAs) === '["https://facebook.com/acme","https://x.com/acme"]')
  const noSame = buildArticleJsonLd({ headline: 'H', publisher: { name: 'Acme', sameAs: ['http://facebook.com/acme', 'javascript:x'] } })
  check('G7: a non-https sameAs never reaches the markup; no profiles = no sameAs key', !('sameAs' in ((noSame?.publisher as object) ?? {})))
  const payload = buildArticlePayload({ id: 'a1', title: 'T', slug: 't', excerpt: null, meta_title: null, meta_description: null, content_html: '<p>x</p>', status: 'draft', featured_image_url: null, site_post_platform: null, site_post_id: null, site_post_url: null, faq_json: [], published_at: null, updated_at: null, schema_context: { publisherName: 'Acme', publisherUrl: 'https://acme.example', language: 'he', sameAs: ['https://facebook.com/acme'] } } as never, 'article.published' as never, new Date('2026-09-28T00:00:00Z'))
  const payloadOrg = (payload.article.structured_data?.[0]?.publisher ?? {}) as Record<string, unknown>
  check('G8: the webhook payload\'s structured_data carries the sameAs', JSON.stringify(payloadOrg.sameAs) === '["https://facebook.com/acme"]', JSON.stringify(payloadOrg))
  const vis = strip(read('lib/content/article-visibility.ts'))
  check('G9: the schema context (webhook + article viewer) reads the profiles for the project\'s owner', (vis.match(/readProjectSameAs\(admin, projectId\)/g) ?? []).length === 2)
  const viewerHas = (src: string) => /publisher: visibility \? \{[^}]*sameAs: visibility\.schema\.sameAs/.test(src)
  const viewer = strip(read('app/(dashboard)/content/articles/[id]/page.tsx'))
  check('G11: the article page\'s structured data (what the Schema view shows) passes the sameAs to the publisher', viewerHas(viewer))
  check('MUTATION CONTROL: a publisher without sameAs is caught (so G11 would fail)',
    !viewerHas(viewer.replace(/, sameAs: visibility\.schema\.sameAs \?\? \[\]/, '')))
  const store = strip(read('lib/content/article-style/store.ts'))
  check('G10: the sameAs read names the project and its owner', /readProjectSameAs[\s\S]*?\.eq\('project_id', projectId\)\s*\.eq\('user_id', owner\)/.test(store))

  // Style row round trip.
  check('H1: a stored row round-trips to a complete style', JSON.stringify(toArticleStyle({ brand_colors: ['#e11d48'], design: 'formatted', image_style: 'clay', hero_ratio: '1:1', inline_images: 2, own_images_only: false })) ===
    JSON.stringify({ brandColors: ['#e11d48'], design: 'formatted', imageStyle: 'clay', heroRatio: '1:1', inlineImages: 2, ownImagesOnly: false }))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exitCode = 1
}

void main()

export {}
