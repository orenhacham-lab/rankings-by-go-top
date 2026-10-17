/**
 * Article bodies exactly as WordPress publishing sends them (lib/content/wordpress-publish.ts and
 * lib/content/wordpress-plugin-publish.ts: inline images composed, then applyArticleDesign), for
 * the real-WordPress kses comparison in wordpress-plugin-publish.qa.ts (group K).
 *
 * Not a suite (no .qa.ts). Every construct the generator and the editor can store is here: the
 * sanitizer's whole tag list (lib/content/article-html.ts), the inline-image figure, the formatted
 * design (lead, takeaways, sections, tables, FAQ, CTA box) in Hebrew (rtl) and English, and the
 * minimal design with a CTA.
 */
import { Parser } from 'htmlparser2'
import { figureHtml, injectInlineImages, type InlineImage } from '@/lib/content/inline-images-compose'
import { styleArticleHtml } from '@/lib/content/article-style/html'
import type { ArticleCta } from '@/lib/content/article-style/cta'

const IMG_URL = 'https://shop.example.org/wp-content/uploads/2026/10/boots-1.png'

const BODY_EN = [
  '<p><strong>Waterproof boots keep your feet dry for years when you treat them right.</strong></p>',
  '<p>This guide covers what to buy, how to care for them, and the mistakes that ruin a good pair.</p>',
  '<h2 id="section-1">Why waterproof boots matter</h2><p>Wet feet get cold fast. A good membrane keeps water out and lets sweat escape.</p>',
  '<ul><li>Gore-Tex or similar membrane</li><li>Sealed seams</li><li>A gusseted tongue</li></ul>',
  '<h2 id="section-2">Comparing the materials</h2><p>Leather and synthetics behave differently in the rain.</p>',
  '<table dir="ltr"><thead><tr><th>Material</th><th>Weight</th><th>Care</th></tr></thead><tbody><tr><td>Full-grain leather</td><td>Heavy</td><td>Wax twice a year</td></tr><tr><td>Synthetic</td><td>Light</td><td>Rinse and air dry</td></tr></tbody></table>',
  '<h2 id="section-3">How to care for them</h2><p>Clean off mud, dry them away from heat, and reproof with a spray. See <a href="https://example.org/care" target="_blank" rel="noopener noreferrer">the maker\'s guide</a>.</p>',
  '<ol><li>Brush off dirt</li><li>Wash with lukewarm water</li><li>Reproof</li></ol>',
  '<blockquote><p>Never dry boots on a radiator.</p></blockquote>',
  '<h3>Quick check</h3><p>Pour a cup of water on the toe box: it should bead and roll off. <em>That</em> is the test, <b>not</b> the label. <code>H2O</code>.</p>',
  '<h2 id="faq">Frequently asked questions</h2><h3>How long do they last?</h3><p>Five years or more with care.</p><h3>Can I machine wash them?</h3><p>No.</p>',
  '<h2 id="section-8">Summary</h2><p>Buy the right membrane, look after it, and your boots will last.</p>',
].join('')

const BODY_HE = [
  '<p dir="rtl"><strong>יפן מציעה למשקיעים זרים מגוון רחב של הזדמנויות, בעיקר בשוק הנדל"ן היציב.</strong></p>',
  '<p>בעידן של אי-ודאות כלכלית גלובלית, משקיעים רבים מחפשים יציבות לצד פוטנציאל צמיחה.</p>',
  '<h2 id="section-1">למה דווקא השקעות ביפן?</h2><p>יפן מציעה סביבה כלכלית יציבה, מטבע חזק וסיכון פוליטי נמוך.</p>',
  '<table dir="rtl"><thead><tr><th>אפיק</th><th>סיכון</th></tr></thead><tbody><tr><td>נדל"ן</td><td>נמוך</td></tr></tbody></table>',
  '<h2 id="section-2">נדל"ן ביפן למשקיעים</h2><p>שוק הנדל"ן היפני מאפשר למשקיעים זרים לרכוש נכסים.</p>',
  '<h2 id="faq">שאלות נפוצות</h2><h3>האם זר יכול לקנות דירה?</h3><p>כן, ללא הגבלות משמעותיות.</p>',
  '<h2 id="section-8">סיכום</h2><p>הדרך להצלחה דורשת שיעורי בית ופתיחות לתרבות שונה.</p>',
].join('')

/** Every tag and attribute sanitizeArticleHtml lets a stored body keep, once. */
const BODY_ALL = [
  '<nav class="toc" aria-label="Contents"><ul><li><a href="#s1" title="Jump">Section one</a></li></ul></nav>',
  '<h1>Main</h1><h2 id="s1">Two</h2><h3 id="s1a">Three</h3><h4 id="s1b">Four</h4><h5>Five</h5><h6>Six</h6>',
  '<p class="lead" dir="ltr">A <u>u</u> <s>s</s> <i>i</i> <span class="hl">span</span><br>line<br/>break</p><hr>',
  '<pre><code>const dry = true\n  // keep spacing</code></pre>',
  '<table dir="ltr"><caption>Sizes</caption><thead><tr><th scope="col" colspan="2">Size</th><th scope="col" rowspan="2">Fit</th></tr></thead>',
  '<tbody><tr><td colspan="2">EU 42</td><td rowspan="1">True</td></tr></tbody><tfoot><tr><td colspan="3">Measured in 2026</td></tr></tfoot></table>',
  '<p><a href="mailto:hello@shop.example.org">mail</a> <a href="tel:+97231234567">call</a> <a href="https://example.org/" target="_blank" rel="noopener noreferrer">out</a></p>',
  `<figure class="wide" data-inline-image-id="x1"><img src="${IMG_URL}" alt="Boots" width="1200" height="675" loading="lazy" class="size-full" /><figcaption class="cap">Caption</figcaption></figure>`,
].join('')

const CTA_EN: ArticleCta = { enabled: true, heading: 'Need new boots?', text: 'Our team will help you choose the right pair.', buttonLabel: 'Talk to us', buttonUrl: 'https://shop.example.org/contact/?a=1&b=2' }
const CTA_HE: ArticleCta = { enabled: true, heading: 'מתעניינים בטיול ליפן?', text: 'הצוות שלנו ישמח לעזור לכם לתכנן.', buttonLabel: 'צרו קשר', buttonUrl: 'https://japan4u.co.il/contact/' }

const image = (section: string): InlineImage => ({
  id: 'b1f0c7de-2a3b-4c5d-8e9f-001122334455', project_id: 'p', article_id: 'a', section_id: section, prompt: null, alt_text: 'Boots on a wet trail "after rain"',
  caption: 'Tested on a wet trail', storage_path: 'x.png', storage_url: IMG_URL, wp_media_id: 12, wp_media_url: IMG_URL, position: 0, status: 'uploaded',
} as unknown as InlineImage)

/**
 * Everything visible or meaningful in a body, as a multiset of items: each element, each attribute
 * (style split into its CSS properties), and the text. Two bodies render alike when nothing is
 * missing from the second; `lost` lists what is.
 */
export function inventory(html: string): string[] {
  const items: string[] = []
  const parser = new Parser({
    onopentag(name, attrs) {
      items.push(`<${name}>`)
      for (const [k, v] of Object.entries(attrs)) {
        if (k === 'style') {
          for (const decl of v.split(';')) {
            const [p, ...rest] = decl.split(':')
            if (p && p.trim() && rest.length) items.push(`${name}{${p.trim().toLowerCase()}:${rest.join(':').trim().toLowerCase()}}`)
          }
        } else items.push(`${name}[${k}=${v}]`)
      }
    },
    ontext(t) { const s = t.replace(/\s+/g, ' ').trim(); if (s) items.push(`"${s}"`) },
  }, { decodeEntities: true })
  parser.write(html)
  parser.end()
  return items
}
export function lost(sent: string, kept: string): string[] {
  const have = new Map<string, number>()
  for (const i of inventory(kept)) have.set(i, (have.get(i) ?? 0) + 1)
  const out: string[] = []
  for (const i of inventory(sent)) {
    const n = have.get(i) ?? 0
    if (n > 0) have.set(i, n - 1)
    else out.push(i)
  }
  return out
}

/** [name, body as published] */
export function publishedBodies(): [string, string][] {
  const en = injectInlineImages(BODY_EN, [image('section-1')], 'publish')
  const he = injectInlineImages(BODY_HE, [image('section-1')], 'publish')
  return [
    ['minimal, English, inline image', en],
    ['minimal + CTA, English', styleArticleHtml(en, { design: 'minimal', colors: ['#1d4ed8'], cta: CTA_EN })],
    ['formatted + CTA, English', styleArticleHtml(en, { design: 'formatted', colors: ['#1d4ed8', '#f59e0b'], cta: CTA_EN })],
    ['formatted + CTA, Hebrew (rtl)', styleArticleHtml(he, { design: 'formatted', colors: ['#c60035'], cta: CTA_HE, language: 'he' })],
    ['formatted, no brand colours', styleArticleHtml(en, { design: 'formatted', colors: [] })],
    ['every stored tag and attribute', BODY_ALL],
    ['every stored tag and attribute, formatted', styleArticleHtml(BODY_ALL, { design: 'formatted', colors: ['#0f766e'], cta: CTA_EN })],
    ['figure alone', figureHtml({ id: 'b1f0c7de-2a3b-4c5d-8e9f-001122334455', url: IMG_URL, alt: 'Boots', caption: 'A caption' })],
  ]
}
